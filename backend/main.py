"""
Parizoda backend — FastAPI + PostgreSQL + SSE (real-time).
- Statik saytni (/) va API'ni (/api/*) bitta portda (8090) beradi.
- Ma'lumot serverdagi PostgreSQL'da saqlanadi (yagona haqiqat manbai).
- O'zgarish bo'lganda SSE (/api/events) orqali barcha ochiq mijozlarga darhol push qilinadi.
"""
import os
import json
import time
import asyncio
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://pari:pari@db:5432/parizoda")
API_TOKEN = os.environ.get("API_TOKEN", "")          # bo'sh bo'lsa yozish autentifikatsiyasi o'chiq
STATIC_DIR = os.environ.get("STATIC_DIR", "/srv/static")

pool: asyncpg.Pool | None = None
subscribers: set[asyncio.Queue] = set()


def now_ms() -> int:
    return int(time.time() * 1000)


def broadcast() -> None:
    """Barcha SSE mijozlariga 'update' signalini yuboramiz."""
    for q in list(subscribers):
        try:
            q.put_nowait("update")
        except Exception:
            pass


SCHEMA = """
CREATE TABLE IF NOT EXISTS main_state (
  id          int PRIMARY KEY DEFAULT 1,
  love_percent int,
  made_up     boolean DEFAULT false,
  made_up_at  bigint,
  photo       text,
  shart       text,
  shart_at    bigint,
  bucket      jsonb DEFAULT '[]'::jsonb,
  updated_at  bigint DEFAULT 0,
  CONSTRAINT main_state_single CHECK (id = 1)
);
INSERT INTO main_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS memories (
  id       text PRIMARY KEY,
  date_key text,
  body     text,
  photo    text,
  author   text,
  at       bigint
);

CREATE TABLE IF NOT EXISTS chat (
  id     text PRIMARY KEY,
  body   text,
  author text,
  at     bigint
);
"""


async def _init_conn(conn: asyncpg.Connection) -> None:
    # jsonb'ni avtomatik Python obyektiga aylantirish
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    last_err = None
    for _ in range(60):  # Postgres tayyor bo'lguncha kutamiz
        try:
            pool = await asyncpg.create_pool(
                DATABASE_URL, min_size=1, max_size=10, init=_init_conn
            )
            break
        except Exception as e:  # noqa
            last_err = e
            await asyncio.sleep(1)
    if pool is None:
        raise RuntimeError(f"Postgres ulanmadi: {last_err}")
    async with pool.acquire() as c:
        await c.execute(SCHEMA)
    yield
    if pool:
        await pool.close()


app = FastAPI(lifespan=lifespan, title="Parizoda API")


def check_auth(token: str | None) -> None:
    if API_TOKEN and token != API_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


async def build_state(c: asyncpg.Connection) -> dict:
    row = await c.fetchrow("SELECT * FROM main_state WHERE id = 1")
    mems = await c.fetch("SELECT * FROM memories")
    chats = await c.fetch("SELECT * FROM chat ORDER BY at ASC")
    memmap: dict[str, list] = {}
    for m in mems:
        k = m["date_key"] or "0000-00-00"
        memmap.setdefault(k, []).append({
            "id": m["id"], "text": m["body"] or "", "photo": m["photo"],
            "author": m["author"] or "", "at": m["at"] or 0,
        })
    return {
        "lovePercent": row["love_percent"],
        "madeUp": row["made_up"],
        "madeUpAt": row["made_up_at"],
        "photo": row["photo"],
        "shart": row["shart"],
        "shartAt": row["shart_at"],
        "bucket": row["bucket"] or [],
        "memories": memmap,
        "chat": [{"id": x["id"], "text": x["body"] or "", "author": x["author"] or "", "at": x["at"] or 0} for x in chats],
        "updatedAt": row["updated_at"],
    }


# ----------------------------- READ -----------------------------
@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/state")
async def get_state():
    async with pool.acquire() as c:
        return await build_state(c)


@app.get("/api/version")
async def get_version():
    async with pool.acquire() as c:
        v = await c.fetchval("SELECT updated_at FROM main_state WHERE id = 1")
    return {"updatedAt": v}


# ----------------------------- WRITE -----------------------------
_MAIN_COLS = {
    "lovePercent": "love_percent", "madeUp": "made_up", "madeUpAt": "made_up_at",
    "photo": "photo", "shart": "shart", "shartAt": "shart_at", "bucket": "bucket",
}


@app.patch("/api/main")
async def patch_main(request: Request, x_auth: str | None = Header(default=None)):
    check_auth(x_auth)
    body = await request.json()
    stamp = int(body.get("updatedAt") or now_ms())
    sets, vals, i = [], [], 1
    for js_key, col in _MAIN_COLS.items():
        if js_key in body:
            sets.append(f"{col} = ${i}")
            vals.append(body[js_key])  # bucket list -> jsonb codec
            i += 1
    sets.append(f"updated_at = ${i}")
    vals.append(stamp)
    async with pool.acquire() as c:
        await c.execute(f"UPDATE main_state SET {', '.join(sets)} WHERE id = 1", *vals)
    broadcast()
    return {"ok": True, "updatedAt": stamp}


@app.put("/api/bucket")
async def put_bucket(request: Request, x_auth: str | None = Header(default=None)):
    check_auth(x_auth)
    body = await request.json()
    bucket = body.get("bucket") or []
    stamp = now_ms()
    async with pool.acquire() as c:
        await c.execute("UPDATE main_state SET bucket = $1, updated_at = $2 WHERE id = 1", bucket, stamp)
    broadcast()
    return {"ok": True, "updatedAt": stamp}


@app.post("/api/memory")
async def upsert_memory(request: Request, x_auth: str | None = Header(default=None)):
    check_auth(x_auth)
    e = await request.json()
    if not e.get("id"):
        raise HTTPException(status_code=400, detail="id required")
    stamp = now_ms()
    async with pool.acquire() as c:
        await c.execute(
            """INSERT INTO memories (id, date_key, body, photo, author, at)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (id) DO UPDATE SET
                 date_key=EXCLUDED.date_key, body=EXCLUDED.body, photo=EXCLUDED.photo,
                 author=EXCLUDED.author, at=EXCLUDED.at""",
            str(e["id"]), e.get("dateKey"), e.get("text") or "", e.get("photo"),
            e.get("author") or "", int(e.get("at") or 0),
        )
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", stamp)
    broadcast()
    return {"ok": True}


@app.delete("/api/memory/{mid}")
async def delete_memory(mid: str, x_auth: str | None = Header(default=None)):
    check_auth(x_auth)
    async with pool.acquire() as c:
        await c.execute("DELETE FROM memories WHERE id = $1", mid)
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", now_ms())
    broadcast()
    return {"ok": True}


@app.post("/api/chat")
async def add_chat(request: Request, x_auth: str | None = Header(default=None)):
    check_auth(x_auth)
    m = await request.json()
    if not m.get("id"):
        raise HTTPException(status_code=400, detail="id required")
    stamp = now_ms()
    async with pool.acquire() as c:
        await c.execute(
            """INSERT INTO chat (id, body, author, at) VALUES ($1,$2,$3,$4)
               ON CONFLICT (id) DO UPDATE SET body=EXCLUDED.body, author=EXCLUDED.author, at=EXCLUDED.at""",
            str(m["id"]), m.get("text") or "", m.get("author") or "", int(m.get("at") or 0),
        )
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", stamp)
    broadcast()
    return {"ok": True}


@app.delete("/api/chat/{cid}")
async def delete_chat(cid: str, x_auth: str | None = Header(default=None)):
    check_auth(x_auth)
    async with pool.acquire() as c:
        await c.execute("DELETE FROM chat WHERE id = $1", cid)
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", now_ms())
    broadcast()
    return {"ok": True}


@app.post("/api/chat/clear")
async def clear_chat(x_auth: str | None = Header(default=None)):
    check_auth(x_auth)
    async with pool.acquire() as c:
        await c.execute("DELETE FROM chat")
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", now_ms())
    broadcast()
    return {"ok": True}


@app.post("/api/restore")
async def restore(request: Request, x_auth: str | None = Header(default=None)):
    """To'liq ma'lumotni almashtirish (backup'dan tiklash / seed)."""
    check_auth(x_auth)
    d = await request.json()
    if isinstance(d.get("data"), dict):   # {_app, data:{...}} ko'rinishini ham qabul qilamiz
        d = d["data"]
    stamp = int(d.get("updatedAt") or now_ms())
    async with pool.acquire() as c:
        async with c.transaction():
            await c.execute(
                """UPDATE main_state SET love_percent=$1, made_up=$2, made_up_at=$3,
                   photo=$4, shart=$5, shart_at=$6, bucket=$7, updated_at=$8 WHERE id=1""",
                d.get("lovePercent"), bool(d.get("madeUp")), d.get("madeUpAt"),
                d.get("photo"), d.get("shart"), d.get("shartAt"),
                d.get("bucket") or [], stamp,
            )
            await c.execute("DELETE FROM memories")
            await c.execute("DELETE FROM chat")
            for k, arr in (d.get("memories") or {}).items():
                for e in (arr or []):
                    if not e or not e.get("id"):
                        continue
                    await c.execute(
                        """INSERT INTO memories (id, date_key, body, photo, author, at)
                           VALUES ($1,$2,$3,$4,$5,$6)
                           ON CONFLICT (id) DO UPDATE SET date_key=EXCLUDED.date_key,
                             body=EXCLUDED.body, photo=EXCLUDED.photo, author=EXCLUDED.author, at=EXCLUDED.at""",
                        str(e["id"]), k, e.get("text") or "", e.get("photo"),
                        e.get("author") or "", int(e.get("at") or 0),
                    )
            for m in (d.get("chat") or []):
                if not m or not m.get("id"):
                    continue
                await c.execute(
                    """INSERT INTO chat (id, body, author, at) VALUES ($1,$2,$3,$4)
                       ON CONFLICT (id) DO UPDATE SET body=EXCLUDED.body, author=EXCLUDED.author, at=EXCLUDED.at""",
                    str(m["id"]), m.get("text") or "", m.get("author") or "", int(m.get("at") or 0),
                )
    broadcast()
    return {"ok": True, "updatedAt": stamp}


# ----------------------------- SSE (real-time) -----------------------------
@app.get("/api/events")
async def events(request: Request):
    q: asyncio.Queue = asyncio.Queue()
    subscribers.add(q)

    async def gen():
        try:
            yield "retry: 3000\n\n"
            yield "event: hello\ndata: {}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    await asyncio.wait_for(q.get(), timeout=20)
                    yield "event: update\ndata: {}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"   # ulanishni tirik tutadi
        finally:
            subscribers.discard(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ----------------------------- STATIC (oxirida mount qilinadi) -----------------------------
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

"""
Parizoda backend — FastAPI + PostgreSQL + SSE, cookie-sessiya auth bilan.
Statik sayt (/) ochiq; barcha /api/* (login/me/health'dan tashqari) sessiyani talab qiladi.
"""
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Request, Response, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import db
import auth
import sse
from config import settings


def now_ms() -> int:
    return int(time.time() * 1000)


def clean_author(s) -> str:
    """Author maydonidan HTML belgilarini olib tashlaymiz (XSS himoyasi)."""
    if not s:
        return ""
    return str(s).replace("<", "").replace(">", "")[:64]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.SESSION_SECRET or settings.SESSION_SECRET == "dev-secret-CHANGE-ME":
        print("WARN: SESSION_SECRET o'rnatilmagan — .env'da kuchli qiymat bering (openssl rand -hex 32).")
    if not settings.COOKIE_SECURE:
        print("WARN: COOKIE_SECURE=0 — cookie ochiq HTTP orqali uchadi. HTTPS (Caddy/nginx) qo'yib COOKIE_SECURE=1 qiling!")
    await db.connect()
    await auth.seed_users()
    await auth.purge_expired()
    yield
    await db.close()


app = FastAPI(lifespan=lifespan, title="Parizoda API")


# ----------------------------- Pydantic modellar -----------------------------
class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class MainPatch(BaseModel):
    lovePercent: Optional[int] = Field(default=None, ge=0, le=1000)
    madeUp: Optional[bool] = None
    madeUpAt: Optional[int] = None
    photo: Optional[str] = Field(default=None, max_length=settings.MAX_PHOTO)
    shart: Optional[str] = Field(default=None, max_length=settings.MAX_TEXT)
    shartAt: Optional[int] = None
    bucket: Optional[List[Dict[str, Any]]] = None
    updatedAt: Optional[int] = None


class MemoryIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    dateKey: Optional[str] = Field(default=None, max_length=20)
    text: Optional[str] = Field(default="", max_length=settings.MAX_TEXT)
    photo: Optional[str] = Field(default=None, max_length=settings.MAX_PHOTO)
    author: Optional[str] = Field(default="", max_length=64)
    at: Optional[int] = 0


class ChatIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    text: Optional[str] = Field(default="", max_length=settings.MAX_TEXT)
    author: Optional[str] = Field(default="", max_length=64)
    at: Optional[int] = 0


class BucketIn(BaseModel):
    bucket: List[Dict[str, Any]] = Field(default_factory=list, max_length=settings.MAX_BUCKET)


# ----------------------------- AUTH -----------------------------
def _set_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(
        key=settings.COOKIE_NAME, value=token,
        max_age=settings.SESSION_TTL_DAYS * 86400,
        httponly=True, samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE, path="/",
    )


@app.post("/api/login")
async def login(body: LoginIn, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    uname = body.username.lower()
    key = uname + "|" + ip
    # per-IP VA per-username cheklov (taqsimlangan brute-force'ni ham qiyinlashtiradi)
    if auth.login_locked(key) or auth.login_locked("u:" + uname):
        raise HTTPException(status_code=429, detail="too many attempts, try later")
    async with db.pool.acquire() as c:
        row = await c.fetchrow("SELECT username, pw_hash, display FROM users WHERE username = $1", uname)
    # constant-time: foydalanuvchi bo'lmasa ham dummy hash bilan tekshiramiz (timing/enumeration oldini olish)
    pw_hash = row["pw_hash"] if row else auth.DUMMY_HASH
    valid = auth.verify_password(body.password, pw_hash)
    if not row or not valid:
        auth.login_fail(key); auth.login_fail("u:" + uname)
        raise HTTPException(status_code=401, detail="invalid credentials")
    auth.login_ok(key); auth.login_ok("u:" + uname)
    token = await auth.create_session(row["username"])
    _set_cookie(response, token)
    return {"ok": True, "user": {"username": row["username"], "display": row["display"] or row["username"], "view": row["username"]}}


@app.post("/api/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(settings.COOKIE_NAME)
    await auth.delete_session(token)
    response.delete_cookie(settings.COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/me")
async def me(request: Request):
    user = await auth.session_user(request.cookies.get(settings.COOKIE_NAME))
    return {"user": user}


@app.get("/api/health")
async def health():
    return {"ok": True}


# ----------------------------- READ (auth) -----------------------------
@app.get("/api/state")
async def get_state(user: dict = Depends(auth.require_user)):
    async with db.pool.acquire() as c:
        return await db.build_state(c)


@app.get("/api/version")
async def get_version(user: dict = Depends(auth.require_user)):
    async with db.pool.acquire() as c:
        v = await c.fetchval("SELECT updated_at FROM main_state WHERE id = 1")
    return {"updatedAt": v}


# ----------------------------- WRITE (auth) -----------------------------
_MAIN_COLS = {
    "lovePercent": "love_percent", "madeUp": "made_up", "madeUpAt": "made_up_at",
    "photo": "photo", "shart": "shart", "shartAt": "shart_at", "bucket": "bucket",
}


@app.patch("/api/main")
async def patch_main(body: MainPatch, user: dict = Depends(auth.require_user)):
    payload = body.model_dump(exclude_unset=True)
    stamp = int(payload.pop("updatedAt", None) or now_ms())
    sets, vals, i = [], [], 1
    for js_key, col in _MAIN_COLS.items():
        if js_key in payload:
            sets.append(f"{col} = ${i}")
            vals.append(payload[js_key])
            i += 1
    sets.append(f"updated_at = ${i}")
    vals.append(stamp)
    async with db.pool.acquire() as c:
        await c.execute(f"UPDATE main_state SET {', '.join(sets)} WHERE id = 1", *vals)
    sse.broadcast()
    return {"ok": True, "updatedAt": stamp}


@app.put("/api/bucket")
async def put_bucket(body: BucketIn, user: dict = Depends(auth.require_user)):
    stamp = now_ms()
    async with db.pool.acquire() as c:
        await c.execute("UPDATE main_state SET bucket = $1, updated_at = $2 WHERE id = 1", body.bucket, stamp)
    sse.broadcast()
    return {"ok": True, "updatedAt": stamp}


@app.post("/api/memory")
async def upsert_memory(body: MemoryIn, user: dict = Depends(auth.require_user)):
    stamp = now_ms()
    async with db.pool.acquire() as c:
        await c.execute(
            """INSERT INTO memories (id, date_key, body, photo, author, at)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (id) DO UPDATE SET
                 date_key=EXCLUDED.date_key, body=EXCLUDED.body, photo=EXCLUDED.photo,
                 author=EXCLUDED.author, at=EXCLUDED.at""",
            body.id, body.dateKey, body.text or "", body.photo, clean_author(body.author), int(body.at or 0),
        )
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", stamp)
    sse.broadcast()
    return {"ok": True}


@app.delete("/api/memory/{mid}")
async def delete_memory(mid: str, user: dict = Depends(auth.require_user)):
    async with db.pool.acquire() as c:
        await c.execute("DELETE FROM memories WHERE id = $1", mid)
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", now_ms())
    sse.broadcast()
    return {"ok": True}


@app.post("/api/chat")
async def add_chat(body: ChatIn, user: dict = Depends(auth.require_user)):
    stamp = now_ms()
    author = user["display"]  # chat muallifi — sessiyadan (spoofing bo'lmasin)
    async with db.pool.acquire() as c:
        await c.execute(
            """INSERT INTO chat (id, body, author, at) VALUES ($1,$2,$3,$4)
               ON CONFLICT (id) DO UPDATE SET body=EXCLUDED.body, author=EXCLUDED.author, at=EXCLUDED.at""",
            body.id, body.text or "", author, int(body.at or 0),
        )
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", stamp)
    sse.broadcast()
    return {"ok": True}


@app.delete("/api/chat/{cid}")
async def delete_chat(cid: str, user: dict = Depends(auth.require_user)):
    async with db.pool.acquire() as c:
        await c.execute("DELETE FROM chat WHERE id = $1", cid)
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", now_ms())
    sse.broadcast()
    return {"ok": True}


@app.post("/api/chat/clear")
async def clear_chat(user: dict = Depends(auth.require_user)):
    async with db.pool.acquire() as c:
        await c.execute("DELETE FROM chat")
        await c.execute("UPDATE main_state SET updated_at = $1 WHERE id = 1", now_ms())
    sse.broadcast()
    return {"ok": True}


def _validate_restore(d: dict) -> None:
    """Restore yukini hajm/son bo'yicha tekshiramiz (DoS/bloat oldini olish)."""
    if d.get("photo") and len(d["photo"]) > settings.MAX_PHOTO:
        raise HTTPException(status_code=422, detail="photo too large")
    if d.get("shart") and len(d["shart"]) > settings.MAX_TEXT:
        raise HTTPException(status_code=422, detail="shart too large")
    bucket = d.get("bucket") or []
    if not isinstance(bucket, list) or len(bucket) > settings.MAX_BUCKET:
        raise HTTPException(status_code=422, detail="bucket invalid/too large")
    mems = d.get("memories") or {}
    chat = d.get("chat") or []
    if not isinstance(mems, dict) or not isinstance(chat, list):
        raise HTTPException(status_code=422, detail="invalid shape")
    total = sum(len(v or []) for v in mems.values()) + len(chat)
    if total > settings.MAX_ENTRIES:
        raise HTTPException(status_code=422, detail="too many entries")
    for arr in mems.values():
        for e in (arr or []):
            if not isinstance(e, dict):
                continue
            if e.get("text") and len(e["text"]) > settings.MAX_TEXT:
                raise HTTPException(status_code=422, detail="memory text too large")
            if e.get("photo") and len(e["photo"]) > settings.MAX_PHOTO:
                raise HTTPException(status_code=422, detail="memory photo too large")
    for m in chat:
        if isinstance(m, dict) and m.get("text") and len(m["text"]) > settings.MAX_TEXT:
            raise HTTPException(status_code=422, detail="chat text too large")


@app.post("/api/restore")
async def restore(request: Request, user: dict = Depends(auth.require_user)):
    try:
        clen = int(request.headers.get("content-length") or 0)
    except ValueError:
        clen = 0
    if clen > settings.MAX_BODY:
        raise HTTPException(status_code=413, detail="payload too large")
    d = await request.json()
    if isinstance(d.get("data"), dict):
        d = d["data"]
    _validate_restore(d)
    stamp = int(d.get("updatedAt") or now_ms())
    async with db.pool.acquire() as c:
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
                        clean_author(e.get("author")), int(e.get("at") or 0),
                    )
            for m in (d.get("chat") or []):
                if not m or not m.get("id"):
                    continue
                await c.execute(
                    """INSERT INTO chat (id, body, author, at) VALUES ($1,$2,$3,$4)
                       ON CONFLICT (id) DO UPDATE SET body=EXCLUDED.body, author=EXCLUDED.author, at=EXCLUDED.at""",
                    str(m["id"]), m.get("text") or "", clean_author(m.get("author")), int(m.get("at") or 0),
                )
    sse.broadcast()
    return {"ok": True, "updatedAt": stamp}


# ----------------------------- MUSIQA (fayl yuklash, auth) -----------------------------
_AUDIO_EXT = (".mp3", ".m4a", ".ogg", ".wav", ".aac")


@app.post("/api/music")
async def upload_music(file: UploadFile = File(...), user: dict = Depends(auth.require_user)):
    fname = (file.filename or "").lower()
    ct = (file.content_type or "")
    if not (ct.startswith("audio/") or fname.endswith(_AUDIO_EXT)):
        raise HTTPException(status_code=415, detail="audio file required")
    data = await file.read(settings.MAX_MUSIC + 1)
    if len(data) > settings.MAX_MUSIC:
        raise HTTPException(status_code=413, detail="file too large")
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    ext = os.path.splitext(fname)[1]
    if ext not in _AUDIO_EXT:
        ext = ".mp3"
    os.makedirs(settings.MEDIA_DIR, exist_ok=True)
    name = f"song-{now_ms()}{ext}"
    with open(os.path.join(settings.MEDIA_DIR, name), "wb") as f:
        f.write(data)
    url = "/api/media/" + name   # auth ortidagi endpoint orqali beriladi
    stamp = now_ms()
    async with db.pool.acquire() as c:
        old = await c.fetchval("SELECT music FROM main_state WHERE id = 1")
        await c.execute("UPDATE main_state SET music = $1, updated_at = $2 WHERE id = 1", url, stamp)
    if old:  # eski faylni o'chiramiz
        try:
            os.remove(os.path.join(settings.MEDIA_DIR, os.path.basename(old)))
        except Exception:
            pass
    sse.broadcast()
    return {"ok": True, "music": url}


@app.get("/api/media/{name}")
async def get_media(name: str, user: dict = Depends(auth.require_user)):
    safe = os.path.basename(name)  # path traversal'ni oldini olamiz
    path = os.path.join(settings.MEDIA_DIR, safe)
    if not safe or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(path)


# ----------------------------- SSE (auth) -----------------------------
@app.get("/api/events")
async def events(request: Request, user: dict = Depends(auth.require_user)):
    return StreamingResponse(
        sse.event_stream(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ----------------------------- STATIC (oxirida) -----------------------------
# Eslatma: /media endi /api/media/{name} (auth ortida) orqali beriladi — ochiq mount yo'q.
os.makedirs(settings.MEDIA_DIR, exist_ok=True)
if os.path.isdir(settings.STATIC_DIR):
    app.mount("/", StaticFiles(directory=settings.STATIC_DIR, html=True), name="static")

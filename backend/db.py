"""PostgreSQL ulanish puli, sxema/migratsiya va to'liq holatni qurish."""
import json
import asyncio
import asyncpg

from config import settings

pool: asyncpg.Pool | None = None

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
CREATE INDEX IF NOT EXISTS memories_date_key_idx ON memories (date_key);

CREATE TABLE IF NOT EXISTS chat (
  id     text PRIMARY KEY,
  body   text,
  author text,
  at     bigint
);
CREATE INDEX IF NOT EXISTS chat_at_idx ON chat (at);

CREATE TABLE IF NOT EXISTS users (
  username text PRIMARY KEY,
  pw_hash  text NOT NULL,
  display  text
);

CREATE TABLE IF NOT EXISTS sessions (
  token      text PRIMARY KEY,
  username   text NOT NULL,
  created_at bigint,
  expires_at bigint
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
"""


async def _init_conn(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def connect() -> None:
    global pool
    last_err = None
    for _ in range(60):
        try:
            pool = await asyncpg.create_pool(
                settings.DATABASE_URL, min_size=1, max_size=10, init=_init_conn
            )
            break
        except Exception as e:  # noqa
            last_err = e
            await asyncio.sleep(1)
    if pool is None:
        raise RuntimeError(f"Postgres ulanmadi: {last_err}")
    async with pool.acquire() as c:
        await c.execute(SCHEMA)


async def close() -> None:
    if pool:
        await pool.close()


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

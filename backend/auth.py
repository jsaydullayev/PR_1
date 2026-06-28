"""Autentifikatsiya — pbkdf2 parol hash, cookie-sessiya, kirish cheklovi."""
import time
import hmac
import hashlib
import secrets

from fastapi import Request, HTTPException

import db
from config import settings, parse_users

PBKDF2_ITERS = 200_000


def now_ms() -> int:
    return int(time.time() * 1000)


# ---------------- parol ----------------
def hash_password(pw: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERS)
    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        algo, iters, salt, hexhash = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode("utf-8"), int(iters))
        return hmac.compare_digest(dk.hex(), hexhash)
    except Exception:
        return False


async def seed_users() -> None:
    """Env'dagi foydalanuvchilarni users jadvaliga upsert qiladi (parol o'zgarsa yangilanadi)."""
    async with db.pool.acquire() as c:
        for u in parse_users():
            row = await c.fetchrow("SELECT pw_hash FROM users WHERE username = $1", u["username"])
            if row and verify_password(u["password"], row["pw_hash"]):
                # parol o'zgarmagan — display'ni yangilab qo'yamiz
                await c.execute("UPDATE users SET display = $2 WHERE username = $1", u["username"], u["display"])
            else:
                await c.execute(
                    """INSERT INTO users (username, pw_hash, display) VALUES ($1,$2,$3)
                       ON CONFLICT (username) DO UPDATE SET pw_hash = EXCLUDED.pw_hash, display = EXCLUDED.display""",
                    u["username"], hash_password(u["password"]), u["display"],
                )


# ---------------- sessiya ----------------
async def create_session(username: str) -> str:
    token = secrets.token_urlsafe(32)
    created = now_ms()
    expires = created + settings.SESSION_TTL_DAYS * 86400 * 1000
    async with db.pool.acquire() as c:
        await c.execute(
            "INSERT INTO sessions (token, username, created_at, expires_at) VALUES ($1,$2,$3,$4)",
            token, username, created, expires,
        )
    return token


async def session_user(token: str | None) -> dict | None:
    if not token:
        return None
    async with db.pool.acquire() as c:
        row = await c.fetchrow(
            """SELECT s.username, s.expires_at, u.display
               FROM sessions s JOIN users u ON u.username = s.username
               WHERE s.token = $1""",
            token,
        )
    if not row:
        return None
    if (row["expires_at"] or 0) < now_ms():
        await delete_session(token)
        return None
    username = row["username"]
    return {"username": username, "display": row["display"] or username, "view": username}


async def delete_session(token: str | None) -> None:
    if not token:
        return
    async with db.pool.acquire() as c:
        await c.execute("DELETE FROM sessions WHERE token = $1", token)


async def purge_expired() -> None:
    async with db.pool.acquire() as c:
        await c.execute("DELETE FROM sessions WHERE expires_at < $1", now_ms())


# ---------------- FastAPI dependency ----------------
async def require_user(request: Request) -> dict:
    token = request.cookies.get(settings.COOKIE_NAME)
    user = await session_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="auth required")
    return user


# ---------------- kirish urinishini cheklash (in-memory) ----------------
_fails: dict[str, list] = {}


def login_locked(key: str) -> bool:
    now = time.time()
    arr = [t for t in _fails.get(key, []) if now - t < settings.LOGIN_LOCK_SECONDS]
    _fails[key] = arr
    return len(arr) >= settings.LOGIN_MAX_FAILS


def login_fail(key: str) -> None:
    _fails.setdefault(key, []).append(time.time())


def login_ok(key: str) -> None:
    _fails.pop(key, None)

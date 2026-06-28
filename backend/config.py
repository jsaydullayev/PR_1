"""Sozlamalar — barchasi muhit o'zgaruvchilaridan (env). Sirlar kodda turmaydi."""
import os


def _bool(v: str) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes", "on")


class Settings:
    DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://pari:pari@db:5432/parizoda")
    STATIC_DIR = os.environ.get("STATIC_DIR", "/srv/static")
    MEDIA_DIR = os.environ.get("MEDIA_DIR", "/srv/media")          # yuklangan musiqa shu yerda
    MAX_MUSIC = int(os.environ.get("MAX_MUSIC", str(20 * 1024 * 1024)))  # ~20MB audio

    # Sessiya (cookie) sozlamalari
    SESSION_SECRET = os.environ.get("SESSION_SECRET", "")          # bo'sh bo'lsa startda tasodifiy
    SESSION_TTL_DAYS = int(os.environ.get("SESSION_TTL_DAYS", "30"))
    COOKIE_NAME = os.environ.get("COOKIE_NAME", "pari_session")
    COOKIE_SECURE = _bool(os.environ.get("COOKIE_SECURE", "0"))    # HTTPS ortida 1 qiling
    COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax")

    # Foydalanuvchilar:  "username:parol:Display,username2:parol2:Display2"
    # Parollar startda pbkdf2 bilan hashlanadi va users jadvaliga upsert qilinadi.
    # MUHIM: default BO'SH (fail-closed). PARI_USERS .env'da berilmasa hech kim
    # kira olmaydi — kodda ommaga ma'lum parol qolmaydi.
    USERS_RAW = os.environ.get("PARI_USERS", "")

    # Kirish urinishlarini cheklash
    LOGIN_MAX_FAILS = int(os.environ.get("LOGIN_MAX_FAILS", "8"))
    LOGIN_LOCK_SECONDS = int(os.environ.get("LOGIN_LOCK_SECONDS", "300"))

    # Kiritish hajmi cheklovlari
    MAX_TEXT = int(os.environ.get("MAX_TEXT", "5000"))             # memory/chat matn
    MAX_PHOTO = int(os.environ.get("MAX_PHOTO", "1500000"))        # ~1.5MB dataURL
    MAX_BUCKET = int(os.environ.get("MAX_BUCKET", "500"))          # bucket elementlari
    MAX_ENTRIES = int(os.environ.get("MAX_ENTRIES", "20000"))      # restore: jami memory+chat
    MAX_BODY = int(os.environ.get("MAX_BODY", str(30 * 1024 * 1024)))  # restore so'rov tanasi (~30MB)


settings = Settings()


def parse_users():
    out = []
    for chunk in (settings.USERS_RAW or "").split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        parts = chunk.split(":")
        if len(parts) < 2:
            continue
        username = parts[0].strip().lower()
        password = parts[1]
        display = parts[2].strip() if len(parts) > 2 else username
        out.append({"username": username, "password": password, "display": display})
    return out

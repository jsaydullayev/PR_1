# Parizoda — server deploy (FastAPI + PostgreSQL + Auth + Docker)

Ma'lumot **serverdagi PostgreSQL**'da. Backend — **FastAPI** (Python), modulli
(`config/db/auth/sse/main`). **Cookie-sessiya autentifikatsiya** (parollar serverda
pbkdf2 bilan hashlanadi). O'zgarish **SSE** orqali ikkala qurilmada darhol ko'rinadi.
Statik sayt + API bitta portda (**8090**). Avtomatik kunlik **backup**.

```
Browser ──(cookie sessiya)──> FastAPI :8090
   ├── /                 statik sayt (login shu yerda)
   ├── /api/login,/me    auth (parol -> pbkdf2)
   ├── /api/state,...    barcha ma'lumot — SESSIYA TALAB qilinadi
   ├── /api/events       SSE real-time (sessiya talab)
   └──> PostgreSQL (pgdata volume)  +  backup servis (./backups)
```

## 1-qadam — `.env` yarating (sirlar)

Serverda, loyiha papkasida:
```bash
cp .env.example .env
nano .env
```
To'ldiring:
- `POSTGRES_PASSWORD` — kuchli parol
- `SESSION_SECRET` — `openssl rand -hex 32` natijasi
- `PARI_USERS` — `parizoda:PAROL1:Паризода,jaxongir:PAROL2:Жаҳонгир` (parollarni o'zgartiring!)
- `COOKIE_SECURE` — HTTPS bo'lsa `1`, oddiy HTTP bo'lsa `0`

> `.env` git'ga tushmaydi (`.gitignore`). Parolni o'zgartirsangiz `docker compose up -d` qayta ishga tushiring — `users` jadvali yangilanadi.

## 2-qadam — ishga tushirish

```bash
git pull
# Eski :8090 serverni to'xtating (agar bo'lsa):
docker ps                      # 8090 dagi konteynerni toping
docker stop <eski_konteyner>
# Yangi stack:
docker compose up -d --build
docker compose ps              # db (healthy) + app + backup
curl http://localhost:8090/api/health    # {"ok":true}
```

3 konteyner ko'tariladi: **db** (Postgres 16), **app** (FastAPI), **backup** (kunlik pg_dump → `./backups`).

## 3-qadam — ma'lumotni yuklash (bir marta)

Login qilib UI'dagi "backup → Restore" orqali, yoki API orqali (avval login qilib cookie oling):
```bash
# login (cookie faylga saqlanadi)
curl -c cookies.txt -X POST http://localhost:8090/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"parizoda","password":"<.env dagi parol>"}'
# restore (cookie bilan)
curl -b cookies.txt -X POST http://localhost:8090/api/restore \
  -H "Content-Type: application/json" \
  --data-binary @backup-YYYY-MM-DD.json
```

## Auth qanday ishlaydi

- Parollar `.env` (`PARI_USERS`) dan olinib, startda **pbkdf2-sha256** bilan hashlanib `users` jadvaliga yoziladi (ochiq parol saqlanmaydi).
- `POST /api/login` → to'g'ri bo'lsa **httpOnly cookie** (`pari_session`) beriladi; sessiya `sessions` jadvalida (muddati `SESSION_TTL_DAYS`).
- **Barcha** `/api/*` (login/me/health'dan tashqari) — o'qish va SSE ham — sessiyani talab qiladi. Havolaga ega begona kishi endi ma'lumotni ko'ra olmaydi.
- Kirish urinishlari cheklangan (`LOGIN_MAX_FAILS`/`LOGIN_LOCK_SECONDS`).

## HTTPS (tavsiya — domen kerak)

Hozir oddiy `http://158.220.123.53:8090`. HTTPS uchun domen kerak:
1. Domen oling, DNS A-yozuvi `158.220.123.53` ga.
2. `Caddyfile.example` → `Caddyfile`, domeningizni yozing.
3. `docker-compose`ga `caddy` servisi qo'shing (`reverse_proxy app:8090`, portlar 80/443).
4. `.env`da `COOKIE_SECURE=1`.

Caddy avtomatik Let's Encrypt sertifikat oladi. **Domen bo'lmasa** — saytda HTTPS yo'q, shuning uchun **havolani maxfiy tuting**.

## Backup va tiklash

- **Avtomatik:** `backup` servisi har 24s'da `pg_dump` → `./backups/parizoda-<sana>.sql` (7 kundan eskisi o'chadi).
- **Qo'lda dump:** `docker compose exec db pg_dump -U pari parizoda > dump.sql`
- **Tiklash:** `cat dump.sql | docker compose exec -T db psql -U pari -d parizoda`
- **UI/JSON:** "backup" tugmasi → Restore → `/api/restore`.

## Yangilanish

```bash
git pull && docker compose up -d --build   # ma'lumot (pgdata) saqlanadi
```

## Foydali

```bash
docker compose logs -f app       # backend loglari
docker compose logs -f backup    # backup loglari
docker compose down              # to'xtatish (ma'lumot saqlanadi)
docker compose down -v           # + MA'LUMOTNI O'CHIRISH (ehtiyot!)
```

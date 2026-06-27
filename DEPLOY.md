# Parizoda — server deploy (FastAPI + PostgreSQL + Docker)

Ma'lumot endi **serverdagi PostgreSQL** bazasida saqlanadi. Backend — **FastAPI**
(Python). O'zgarish bo'lganda **SSE** (`/api/events`) orqali ikkala qurilmada
**darhol** ko'rinadi. Statik sayt va API bitta portda (**8090**) beriladi.

```
Brauzer ──HTTP──> :8090 ──> FastAPI (app konteyner)
                              ├── /            -> statik sayt (index.html, js, css)
                              ├── /api/state   -> to'liq ma'lumot (o'qish)
                              ├── /api/main|memory|chat|bucket -> yozish
                              ├── /api/events  -> SSE (real-time push)
                              └──> PostgreSQL (db konteyner, pgdata volume)
```

## 1-qadam — serverda ishga tushirish

Serverda (158.220.123.53), loyiha papkasida:

```bash
git pull
docker compose up -d --build
```

Bu 2 ta konteyner ko'taradi:
- **db** — PostgreSQL 16 (ma'lumot `pgdata` volume'da, qayta ishga tushganda saqlanadi)
- **app** — FastAPI (API + SSE + statik sayt), `:8090` da

Tekshirish:
```bash
docker compose ps
curl http://localhost:8090/api/health      # {"ok":true}
```

> ⚠️ Agar :8090 ni avval boshqa konteyner/server band qilgan bo'lsa, uni
> to'xtating (`docker ps` -> `docker stop <eski>`), so'ng `docker compose up -d`.

## 2-qadam — ma'lumotni bazaga yuklash (bir marta)

Baza bo'sh ishga tushadi. Mavjud to'liq ma'lumot (backup) `POST /api/restore`
orqali yuklanadi. Buni ishlab chiquvchi (men) bajaraman, yoki o'zingiz:

```bash
curl -X POST http://localhost:8090/api/restore \
  -H "Content-Type: application/json" \
  -H "X-Auth: pari-2026-7f3a9c" \
  --data-binary @backup-YYYY-MM-DD.json
```

Tekshirish: `curl http://localhost:8090/api/state` — lovePercent, memories ko'rinadi.

## Sozlamalar (docker-compose.yml)

| O'zgaruvchi | Qiymat | Izoh |
|---|---|---|
| POSTGRES_PASSWORD | `pari_secret_2026` | DB paroli (o'zgartirsangiz `DATABASE_URL` ham) |
| API_TOKEN | `pari-2026-7f3a9c` | Yozish uchun token. **`index.html`dagi `PARI_API_TOKEN` bilan bir xil bo'lishi shart** |
| ports | `8090:8090` | tashqi port |

> 🔐 Yozish (POST/PATCH/DELETE) `X-Auth` tokenini talab qiladi. O'qish (`/api/state`,
> SSE) ochiq. Token `index.html`da ko'rinadi (statik sayt) — bu login paroli kabi
> "yengil" himoya. **Saytni faqat ikkangiz biling.** Kuchliroq kerak bo'lsa — ayting,
> to'liq autentifikatsiya (sessiya/parol) qo'shamiz.

## Yangilanish (kod o'zgarganda)

```bash
git pull && docker compose up -d --build
```
Ma'lumot (`pgdata` volume) saqlanib qoladi — faqat kod yangilanadi.

## Zaxira (backup)

PostgreSQL dump:
```bash
docker compose exec db pg_dump -U pari parizoda > parizoda-$(date +%F).sql
```
Tiklash:
```bash
cat parizoda-XXXX.sql | docker compose exec -T db psql -U pari -d parizoda
```
Saytdagi "backup" tugmasi ham ishlaydi (JSON eksport/import — `/api/restore`ga yozadi).

## Foydali buyruqlar

```bash
docker compose logs -f app      # backend loglari
docker compose logs -f db       # postgres loglari
docker compose restart app      # faqat app
docker compose down             # to'xtatish (ma'lumot saqlanadi)
docker compose down -v          # to'xtatish + MA'LUMOTNI O'CHIRISH (ehtiyot!)
```

## Lokal sinov (ixtiyoriy)

O'z kompyuteringizda ham aynan shu bilan ishlatish mumkin:
```bash
docker compose up -d --build
# http://localhost:8090
```

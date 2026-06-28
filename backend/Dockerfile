# Parizoda backend image — FastAPI serves API + SSE + static frontend.
# Build context = repo root (qarang: docker-compose.yml -> build.context: .)
FROM python:3.12-slim

WORKDIR /app

# Python bog'liqliklar
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend kodi (barcha modullar)
COPY backend/config.py backend/db.py backend/auth.py backend/sse.py backend/main.py ./

# Statik frontend (faqat kerakli fayllar — .git/backend/backup'lar EMAS)
RUN mkdir -p /srv/static
COPY index.html styles.css /srv/static/
COPY account.js app.js backup.js bucket.js calendar.js chat.js game-rps.js /srv/static/
COPY song.mp3 /srv/static/song.mp3
COPY uploads /srv/static/uploads

EXPOSE 8090
# Bitta worker — SSE pub/sub xotirada (in-memory) bo'lgani uchun.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1"]

# Parizoda backend image — FastAPI serves API + SSE + static frontend.
# Build context = repo root (qarang: docker-compose.yml -> build.context: .)
FROM python:3.12-slim

WORKDIR /app

# Python bog'liqliklar
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend kodi (barcha modullar)
COPY backend/config.py backend/db.py backend/auth.py backend/sse.py backend/main.py ./

# Statik frontend — butun frontend/ papkasi
COPY frontend/ /srv/static/

EXPOSE 8090
# Bitta worker — SSE pub/sub xotirada (in-memory) bo'lgani uchun.
# --proxy-headers: nginx ortida haqiqiy client IP (X-Forwarded-For) ni o'qiydi (rate-limit uchun).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]

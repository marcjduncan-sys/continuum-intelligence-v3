# Stage 1: Build frontend with Vite
FROM node:20-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# Stage 2: Python API
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY api/ ./api/
COPY data/ ./data/
COPY --from=frontend /build/dist/ ./dist/

WORKDIR /app/api

# Default port (overridden by PaaS platforms via PORT env var)
ENV PORT=8000

EXPOSE ${PORT}

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]

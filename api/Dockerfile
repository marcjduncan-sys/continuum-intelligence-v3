FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY api/ ./api/
COPY index.html ./index.html
COPY data/ ./data/
COPY scripts/ ./scripts/
COPY js/ ./js/

WORKDIR /app/api

# Default port (overridden by PaaS platforms via PORT env var)
ENV PORT=8000

EXPOSE ${PORT}

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]

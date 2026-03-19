FROM python:3.11-slim
WORKDIR /app
COPY api/requirements.txt ./api/
RUN pip install --no-cache-dir -r api/requirements.txt
COPY api/ ./api/
COPY data/ ./data/
ENV PROJECT_ROOT=/app
WORKDIR /app/api
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]

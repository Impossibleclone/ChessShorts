FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000
ENV PORT=8000

# Render injects RENDER_GIT_COMMIT at build time — surfaces the deployed SHA via /health
ARG RENDER_GIT_COMMIT=unknown
ENV APP_VERSION=${RENDER_GIT_COMMIT}

# Render/Heroku-style hosts inject $PORT; fall back to 8000 locally
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
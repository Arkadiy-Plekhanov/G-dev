# Dev-oriented image: source is bind-mounted by docker-compose.yml, so this
# just needs the right Python + dependencies. Not a production image (no
# gunicorn/systemd here -- see docs/deployment/HUMAN_DEPLOYMENT_GUIDE.md for
# the production process model on ECS).
FROM python:3.12-slim

WORKDIR /app

# psycopg2 (non-binary build path) needs libpq headers; kept minimal.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

# Source is bind-mounted over this in docker-compose.yml for local dev
# (so edits on the host are picked up by --reload without a rebuild).
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

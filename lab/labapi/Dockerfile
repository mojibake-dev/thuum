# lab-api on sky-srv. python:3.12-slim plus uv; the package is installed from
# the lockfile, nothing else. tc and tcpdump run from this container with
# NET_ADMIN and NET_RAW (see docker-compose.yml), docker compose through the
# mounted socket.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends iproute2 tcpdump docker.io docker-compose-v2 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY labapi ./labapi
RUN uv sync --frozen --no-dev
ENV PATH=/app/.venv/bin:$PATH GUESTS_FILE=/app/labapi/guests.yaml
EXPOSE 80
CMD ["labapi"]

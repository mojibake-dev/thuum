# lab-api on sky-srv. python:3.12-slim plus uv; the package is installed from
# the lockfile, nothing else. tc and tcpdump run from this container with
# NET_ADMIN and NET_RAW (see docker-compose.yml), docker compose through the
# mounted socket.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv
# The docker CLI and the compose plugin as static binaries from the official
# CLI image: distro-independent (python:3.12-slim moved to Debian trixie,
# which has no docker-compose-v2 package). The daemon is sky-srv's, through
# the mounted socket.
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:27-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
RUN apt-get update && apt-get install -y --no-install-recommends iproute2 tcpdump ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && docker --version && docker compose version
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY labapi ./labapi
RUN uv sync --frozen --no-dev
ENV PATH=/app/.venv/bin:$PATH GUESTS_FILE=/app/labapi/guests.yaml
EXPOSE 80
CMD ["labapi"]

# Multi-stage build for the DEVCON+ NestJS auth-bridge.
# Runs on AWS EC2 via Docker Compose behind nginx (see server/docker-compose.*.yml).
# The runtime image is kept small so `docker compose pull` and container
# restarts stay fast on the small t3.small host.

# ── Builder stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Drop dev deps so the runtime image only carries what's needed at runtime
RUN npm prune --production


# ── Runtime stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Run as a non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./

ENV NODE_ENV=production
# main.ts reads process.env.PORT (default 3000); compose sets PORT=8000 via the
# env file and maps 127.0.0.1:8000 -> 8000. EXPOSE is documentation only.
EXPOSE 8000

CMD ["node", "dist/main.js"]

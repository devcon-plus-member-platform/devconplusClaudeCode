# Multi-stage build for the DEVCON+ NestJS auth-bridge.
# Designed for GCP Cloud Run with min-instances=0 — runtime image
# is kept small so cold starts stay under ~1.5s.

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
# Cloud Run sets $PORT dynamically (default 8080); main.ts reads process.env.PORT
EXPOSE 8080

CMD ["node", "dist/main.js"]

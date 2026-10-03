# syntax=docker/dockerfile:1
# Images de production du suivi de conformité.
#   docker build --target api -t conformite-api .
#   docker build --target web -t conformite-web .

# ---------- Construction (frontend + API) ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY public public
COPY src src
COPY server server
# Frontend branché sur l'API (connexion, PostgreSQL).
RUN npm run build:api
RUN cd server && npm run typecheck && npm run build

# ---------- Dépendances d'exécution de l'API ----------
FROM node:22-bookworm-slim AS api-deps
WORKDIR /srv/api
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- API ----------
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads MIGRATIONS_DIR=/srv/api/migrations
WORKDIR /srv/api
COPY --from=api-deps /srv/api/node_modules node_modules
COPY --from=build /app/server/dist dist
COPY server/package.json ./
COPY server/migrations migrations
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

# ---------- Serveur web (Caddy : HTTPS automatique + fichiers statiques) ----------
FROM caddy:2-alpine AS web
COPY ops/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/www

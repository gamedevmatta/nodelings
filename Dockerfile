# ── Stage 1: Build frontend ────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install only production deps + tsx for running the server
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx

# Copy built frontend + server source
COPY --from=build /app/dist ./dist
COPY server ./server
COPY tsconfig.json ./

EXPOSE 3001

CMD ["npx", "tsx", "server/index.ts"]

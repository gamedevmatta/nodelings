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

# Pre-install common MCP server packages so they're available instantly
# (npx -y will find them without downloading at runtime)
RUN npm install -g \
  @notionhq/notion-mcp-server \
  @modelcontextprotocol/server-slack \
  @modelcontextprotocol/server-filesystem \
  @modelcontextprotocol/server-fetch \
  @modelcontextprotocol/server-memory

# Copy built frontend + server source
COPY --from=build /app/dist ./dist
COPY server ./server
COPY tsconfig.json ./

EXPOSE 3001

CMD ["npx", "tsx", "server/index.ts"]

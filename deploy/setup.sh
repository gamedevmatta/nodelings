#!/bin/bash
# Nodelings droplet setup script
# Run as root on a fresh Ubuntu 22.04+ droplet
#
# Usage: curl -sSL <raw-url> | bash
# Or: ssh root@YOUR_IP 'bash -s' < deploy/setup.sh

set -euo pipefail

DOMAIN="nodelings.matthewshera.com"
APP_DIR="/opt/nodelings"

echo "==> Installing Docker..."
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git

systemctl enable docker
systemctl start docker

echo "==> Cloning repo..."
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR" && git pull
else
  git clone https://github.com/gamedevmatta/nodelings.git "$APP_DIR"
  cd "$APP_DIR"
fi

echo "==> Setting up .env..."
if [ ! -f .env ]; then
  cat > .env << 'ENVEOF'
# ── AI Backend Keys ──────────────────────────────────────────────
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=AIzaSy...

# ── MCP Server Tokens (passed to child processes automatically) ──
# Notion: get from https://www.notion.so/my-integrations
# OPENAPI_MCP_HEADERS={"Authorization":"Bearer ntn_...","Notion-Version":"2022-06-28"}
#
# Slack: get from https://api.slack.com/apps → OAuth & Permissions
# SLACK_BOT_TOKEN=xoxb-...
# SLACK_TEAM_ID=T...
ENVEOF
  echo "  Created .env — edit it with: nano /opt/nodelings/.env"
fi

echo "==> Setting up mcp-servers.json..."
if [ ! -f mcp-servers.json ]; then
  cat > mcp-servers.json << 'MCPEOF'
{
  "servers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"]
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"]
    }
  }
}
MCPEOF
fi

echo "==> Building Docker image..."
docker compose build

echo "==> Starting container..."
docker compose up -d

echo "==> Configuring nginx..."
cp deploy/nginx.conf /etc/nginx/sites-available/nodelings
ln -sf /etc/nginx/sites-available/nodelings /etc/nginx/sites-enabled/nodelings
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "==> Done! Next steps:"
echo "  1. Point DNS: A record for $DOMAIN -> $(curl -s ifconfig.me)"
echo "  2. Edit API keys: nano $APP_DIR/.env"
echo "  3. Restart after editing .env: cd $APP_DIR && docker compose up -d --build"
echo "  4. Once DNS propagates, get SSL: certbot --nginx -d $DOMAIN"
echo ""
echo "  App is live at http://$DOMAIN (HTTPS after certbot)"

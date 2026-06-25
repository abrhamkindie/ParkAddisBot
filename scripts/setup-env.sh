#!/bin/bash
# ParkAddis Environment Setup Script
# Usage: ./scripts/setup-env.sh

set -e

echo "🔧 ParkAddis Environment Setup"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if .env already exists
if [ -f .env ]; then
    echo -e "${YELLOW}⚠ .env file already exists!${NC}"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Generate secure secrets
generate_secret() {
    openssl rand -hex 32
}

echo ""
echo -e "${BLUE}1. Telegram Bot Configuration${NC}"
echo "   Get your bot token from @BotFather on Telegram"
read -p "   Enter BOT_TOKEN: " BOT_TOKEN
read -p "   Enter BOT_USERNAME (without @): " BOT_USERNAME

echo ""
echo -e "${BLUE}2. Database Configuration${NC}"
read -p "   Enter DB_PASSWORD (default: parking): " DB_PASSWORD
DB_PASSWORD=${DB_PASSWORD:-parking}

echo ""
echo -e "${BLUE}3. Server Configuration${NC}"
read -p "   Enter PORT (default: 3000): " PORT
PORT=${PORT:-3000}
read -p "   Enter PUBLIC_URL (e.g., https://yourdomain.com): " PUBLIC_URL

echo ""
echo -e "${BLUE}4. Telegram Mode${NC}"
echo "   - polling: For development (default)"
echo "   - webhook: For production (requires public URL)"
read -p "   Enter TELEGRAM_MODE (polling/webhook, default: polling): " TELEGRAM_MODE
TELEGRAM_MODE=${TELEGRAM_MODE:-polling}

if [ "$TELEGRAM_MODE" = "webhook" ]; then
    read -p "   Enter TELEGRAM_WEBHOOK_URL (e.g., https://yourdomain.com/webhook/telegram): " TELEGRAM_WEBHOOK_URL
    WEBHOOK_SECRET=$(generate_secret)
    echo "   Generated WEBHOOK_SECRET: $WEBHOOK_SECRET"
fi

echo ""
echo -e "${BLUE}5. Security Configuration${NC}"
JWT_SECRET=$(generate_secret)
echo "   Generated JWT_SECRET: $JWT_SECRET"

read -p "   Enter CORS_ORIGINS (comma-separated, default: *): " CORS_ORIGINS
CORS_ORIGINS=${CORS_ORIGINS:-*}

echo ""
echo -e "${BLUE}6. Chapa Payment Gateway (optional)${NC}"
read -p "   Enter CHAPA_SECRET_KEY (leave empty to skip): " CHAPA_SECRET_KEY
CHAPA_WEBHOOK_SECRET=""
if [ -n "$CHAPA_SECRET_KEY" ]; then
    CHAPA_WEBHOOK_SECRET=$(generate_secret)
    echo "   Generated CHAPA_WEBHOOK_SECRET: $CHAPA_WEBHOOK_SECRET"
fi

echo ""
echo -e "${BLUE}7. Admin Account${NC}"
read -p "   Enter ADMIN_BOOTSTRAP_EMAIL: " ADMIN_EMAIL
read -p "   Enter ADMIN_BOOTSTRAP_PASSWORD: " ADMIN_PASSWORD

echo ""
echo -e "${BLUE}8. Logging Configuration${NC}"
read -p "   Enter LOG_LEVEL (debug/info/warn/error, default: info): " LOG_LEVEL
LOG_LEVEL=${LOG_LEVEL:-info}
read -p "   Enter LOG_FORMAT (pretty/json, default: json): " LOG_FORMAT
LOG_FORMAT=${LOG_FORMAT:-json}

# Create .env file
echo ""
echo "📝 Creating .env file..."

cat > .env << EOF
# ---- App ----
APP_NAME=ParkAddis
NODE_ENV=production
PORT=${PORT}
PUBLIC_URL=${PUBLIC_URL}

# ---- Telegram ----
BOT_TOKEN=${BOT_TOKEN}
BOT_USERNAME=${BOT_USERNAME}
TELEGRAM_MODE=${TELEGRAM_MODE}
EOF

if [ -n "$TELEGRAM_WEBHOOK_URL" ]; then
    cat >> .env << EOF
TELEGRAM_WEBHOOK_URL=${TELEGRAM_WEBHOOK_URL}
WEBHOOK_SECRET=${WEBHOOK_SECRET}
EOF
fi

cat >> .env << EOF

# ---- Database ----
DATABASE_URL=postgres://parking:${DB_PASSWORD}@db:5432/parking
DB_PASSWORD=${DB_PASSWORD}
PGSSL=true

# ---- Search ----
DEFAULT_SEARCH_RADIUS_M=2000
MAX_SEARCH_RESULTS=8

# ---- Business ----
DEFAULT_COMMISSION_PERCENT=15
CURRENCY=ETB

# ---- Admin / JWT ----
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=24h
ADMIN_BOOTSTRAP_EMAIL=${ADMIN_EMAIL}
ADMIN_BOOTSTRAP_PASSWORD=${ADMIN_PASSWORD}

# ---- Security ----
CORS_ORIGINS=${CORS_ORIGINS}
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ---- Chapa ----
CHAPA_SECRET_KEY=${CHAPA_SECRET_KEY}
CHAPA_WEBHOOK_SECRET=${CHAPA_WEBHOOK_SECRET}

# ---- Notifications ----
ENABLE_NOTIFICATIONS=true
NOTIFICATION_CHECK_INTERVAL=5

# ---- Logging ----
LOG_LEVEL=${LOG_LEVEL}
LOG_FORMAT=${LOG_FORMAT}
EOF

echo -e "${GREEN}✅ .env file created successfully!${NC}"
echo ""
echo "🔒 Security Notes:"
echo "   - JWT_SECRET and WEBHOOK_SECRET are cryptographically secure"
echo "   - Store .env file securely, never commit to git"
echo "   - Use strong passwords in production"
echo ""
echo "🚀 Next Steps:"
echo "   1. Review .env file: cat .env"
echo "   2. Deploy: ./scripts/deploy.sh"
echo "   3. View logs: docker-compose logs -f app"
echo ""

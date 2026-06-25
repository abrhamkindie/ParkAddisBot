#!/bin/bash
# ParkAddis Production Deployment Script
# Usage: ./scripts/deploy.sh

set -e  # Exit on error

echo "🚀 Starting ParkAddis deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Run ./scripts/setup-env.sh first to create it."
    exit 1
fi

echo -e "${GREEN}✓${NC} .env file found"

# Step 2: Pull latest code (if using git)
if [ -d .git ]; then
    echo "📥 Pulling latest code..."
    git pull || echo -e "${YELLOW}⚠ Git pull failed, continuing with current code${NC}"
fi

# Step 3: Build and start services
echo "🔨 Building Docker images..."
docker-compose build --no-cache

echo "🚀 Starting services..."
docker-compose up -d

# Step 4: Wait for database to be ready
echo "⏳ Waiting for database..."
sleep 10

# Step 5: Run migrations
echo "📦 Running database migrations..."
docker-compose exec -T app npm run db:migrate

# Step 6: Health check
echo "🏥 Checking service health..."
sleep 5

HEALTH_RESPONSE=$(curl -s http://localhost:${PORT:-3000}/health || echo "failed")

if echo "$HEALTH_RESPONSE" | grep -q '"ok":true'; then
    echo -e "${GREEN}✓${NC} Service is healthy!"
else
    echo -e "${RED}❌ Health check failed!${NC}"
    echo "Response: $HEALTH_RESPONSE"
    echo "Check logs: docker-compose logs -f app"
    exit 1
fi

# Step 7: Show status
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "📊 Service Status:"
docker-compose ps
echo ""
echo "📝 View Logs:"
echo "   docker-compose logs -f app"
echo ""
echo "🛑 Stop Services:"
echo "   docker-compose down"
echo ""
echo "🔄 Restart Services:"
echo "   docker-compose restart"
echo ""

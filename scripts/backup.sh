#!/bin/bash
# ParkAddis Database Backup Script
# Usage: ./scripts/backup.sh [output_directory]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKUP_DIR=${1:-./backups}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/parkaddis_backup_${TIMESTAMP}.sql.gz"

echo "📦 ParkAddis Database Backup"
echo "============================="
echo ""

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if Docker is running
if ! docker-compose ps | grep -q "parking-db"; then
    echo -e "${RED}❌ Database container is not running!${NC}"
    echo "Start it with: docker-compose up -d db"
    exit 1
fi

echo -e "${BLUE}📁 Backup Directory:${NC} $BACKUP_DIR"
echo -e "${BLUE}📄 Backup File:${NC} $BACKUP_FILE"
echo ""

# Perform backup
echo "🔄 Creating database backup..."
docker-compose exec -T db pg_dump -U parking -d parking | gzip > "$BACKUP_FILE"

# Check if backup was successful
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup created successfully!${NC}"
    echo ""
    echo "📊 Backup Details:"
    echo "   File: $BACKUP_FILE"
    echo "   Size: $BACKUP_SIZE"
    echo "   Timestamp: $TIMESTAMP"
    echo ""
    
    # List existing backups
    echo "📋 Existing Backups:"
    ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}' || echo "   No backups found"
    echo ""
    
    # Cleanup old backups (keep last 10)
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
    if [ "$BACKUP_COUNT" -gt 10 ]; then
        echo -e "${YELLOW}🧹 Cleaning up old backups (keeping last 10)...${NC}"
        ls -1t "$BACKUP_DIR"/*.sql.gz | tail -n +11 | xargs rm -f
    fi
    
    echo ""
    echo "💾 Restore Command:"
    echo "   gunzip -c $BACKUP_FILE | docker-compose exec -T db psql -U parking -d parking"
    echo ""
else
    echo -e "${RED}❌ Backup failed!${NC}"
    exit 1
fi

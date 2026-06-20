#!/bin/bash

# Racelith Penalty Tracking System - Automated Backup Script
# This script backs up ALL databases (control + all session databases)

set -e

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "🔄 Starting backup process..."
echo "Timestamp: $(date)"

# Check if database is running
if ! docker-compose ps db | grep -q "Up"; then
    echo "❌ Database container is not running!"
    echo "   Start it with: docker-compose up -d db"
    exit 1
fi

# Check database connectivity
if ! docker-compose exec -T db pg_isready -U racelith_user > /dev/null 2>&1; then
    echo "❌ Database is not ready!"
    exit 1
fi

# Backup ALL databases (control + all session databases)
echo "📦 Backing up all databases..."
docker-compose exec -T db pg_dumpall -U racelith_user | gzip > $BACKUP_DIR/db_all_$DATE.sql.gz

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h $BACKUP_DIR/db_all_$DATE.sql.gz | cut -f1)
    echo "✅ All databases backup completed: db_all_$DATE.sql.gz ($BACKUP_SIZE)"
else
    echo "❌ Database backup failed!"
    exit 1
fi

# Also backup control database separately (for quick restore)
echo "📦 Backing up control database separately..."
docker-compose exec -T db pg_dump -U racelith_user -d racelith_db | gzip > $BACKUP_DIR/db_control_$DATE.sql.gz

if [ $? -eq 0 ]; then
    echo "✅ Control database backup completed: db_control_$DATE.sql.gz"
fi

# Session exports backup (if directory exists and has content)
if [ -d "backend/session_exports" ] && [ "$(ls -A backend/session_exports 2>/dev/null)" ]; then
    echo "📦 Backing up session exports..."
    tar -czf $BACKUP_DIR/exports_$DATE.tar.gz backend/session_exports/ 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✅ Session exports backup completed: exports_$DATE.tar.gz"
    else
        echo "⚠️  Session exports backup skipped (empty or error)"
    fi
fi

# Clean up old backups (keep only last N days)
echo "🧹 Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null
find $BACKUP_DIR -name "exports_*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null

# Calculate backup size
TOTAL_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
BACKUP_COUNT=$(ls -1 $BACKUP_DIR/*.gz 2>/dev/null | wc -l)

echo ""
echo "✅ Backup process completed successfully!"
echo "📁 Backup location: $BACKUP_DIR"
echo "💾 Total backup size: $TOTAL_SIZE"
echo "📊 Number of backup files: $BACKUP_COUNT"
echo ""
echo "💡 Tip: Set up automated backups with cron:"
echo "   0 2 * * * cd $(pwd) && ./backup.sh >> /var/log/racelith-backup.log 2>&1"

#!/usr/bin/env bash
# Weekly pg_dump for SignalStack.
# Run from a Coolify scheduled task or a small sidecar container.
# Required env: DATABASE_URL, BACKUP_DIR (mounted volume).
set -euo pipefail
: "${DATABASE_URL:?required}"
: "${BACKUP_DIR:?required}"

ts=$(date -u +%Y%m%dT%H%M%SZ)
out="$BACKUP_DIR/signalstack-$ts.sql.gz"
echo "[backup] dumping to $out"
pg_dump --no-owner --no-acl --format=plain "$DATABASE_URL" | gzip -9 > "$out"

# Rotate: keep last 90 daily / 12 weekly. Simple count-based eviction.
ls -1t "$BACKUP_DIR"/signalstack-*.sql.gz | tail -n +91 | xargs -r rm -f
echo "[backup] done · size=$(du -h "$out" | cut -f1)"

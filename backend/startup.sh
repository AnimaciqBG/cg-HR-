#!/bin/sh

echo "=== Running database migrations ==="
npx prisma migrate deploy 2>&1 || echo "Warning: migration had issues, continuing..."

echo "=== Checking if database needs seeding ==="
if node seed-check.js 2>/dev/null; then
  echo "=== Seeding database ==="
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts 2>&1 || echo "Warning: seed had issues, continuing..."
else
  echo "=== Database already has data, skipping seed ==="
fi

echo "=== Checking frontend files ==="
ls -la public/index.html 2>&1 || echo "WARNING: public/index.html not found!"
ls public/ 2>&1

echo "=== Starting server ==="
exec node dist/main.js

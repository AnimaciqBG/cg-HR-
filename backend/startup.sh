#!/bin/sh
set -e

echo "=== Running database migrations ==="
npx prisma migrate deploy

echo "=== Checking if database needs seeding ==="
USER_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count()
  .then(c => { console.log(c); return p.\$disconnect(); })
  .catch(() => { console.log('0'); return p.\$disconnect(); });
")

if [ "$USER_COUNT" = "0" ]; then
  echo "=== Seeding database ==="
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
else
  echo "=== Database already has data, skipping seed ==="
fi

echo "=== Starting server ==="
exec node dist/main.js

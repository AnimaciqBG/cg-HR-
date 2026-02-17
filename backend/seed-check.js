// Exits with code 0 if seeding is needed (no users), code 1 if not
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count()
  .then(c => { p.$disconnect(); process.exit(c === 0 ? 0 : 1); })
  .catch(() => { p.$disconnect(); process.exit(0); });

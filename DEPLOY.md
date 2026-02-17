# Deployment Guide - HR Platform (тестово публикуване)

Три начина за тестово публикуване без Vercel.

---

## Вариант 1: ngrok (НАЙ-БЪРЗ - 2 минути)

Стартираш локално, ngrok ти дава публичен URL. Нищо не се качва никъде.

### Стъпки:

```bash
# 1. Инсталирай ngrok (еднократно)
# macOS:
brew install ngrok
# Linux:
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok-v3-stable-linux-amd64.tgz | sudo tar xvz -C /usr/local/bin
# Windows: изтегли от https://ngrok.com/download

# 2. Безплатна регистрация в https://ngrok.com и вземи auth token
ngrok config add-authtoken YOUR_TOKEN_HERE

# 3. Стартирай backend (трябва да имаш PostgreSQL)
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
# Backend работи на http://localhost:3001

# 4. В друг терминал - стартирай frontend
cd frontend
npm install
npm run dev
# Frontend работи на http://localhost:5173

# 5. В трети терминал - стартирай ngrok
ngrok http 5173
```

**Резултат:** Получаваш URL като `https://abc123.ngrok-free.app` - споделяш го с когото искаш.

**Безплатни ограничения:** Временен URL (се сменя при рестарт), watermark страница при първо зареждане.

---

## Вариант 2: Railway.app (ПРЕПОРЪЧАН - 10 минути)

Railway дава безплатен tier с PostgreSQL. Всичко се deploy-ва от GitHub.

### Стъпки:

```bash
# 1. Отиди на https://railway.app и се логни с GitHub

# 2. Натисни "New Project" → "Deploy from GitHub Repo"
#    Избери AnimaciqBG/cg-HR-

# 3. Добави PostgreSQL
#    В Railway dashboard: "+ New" → "Database" → "PostgreSQL"

# 4. Свържи DB с backend-а
#    Кликни на service → Variables → добави:
```

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | *(копирай от PostgreSQL service)* |
| `JWT_SECRET` | `railway-test-secret-change-me-123456` |
| `JWT_REFRESH_SECRET` | `railway-refresh-secret-change-me-789` |
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `CORS_ORIGIN` | `*` |
| `MAX_USERS` | `40` |
| `MAX_ADMINS` | `3` |
| `MAX_SUPER_ADMINS` | `1` |

```
5. ВАЖНО - Настрой в Settings → General:
   Root Directory: backend

6. Настрой в Settings → Build & Deploy:
   Build Command: npm install && npx prisma generate && npm run build
   Start Command: npx prisma migrate deploy && node dist/main.js

7. В Settings → Networking → натисни "Generate Domain"
   Получаваш публичен URL: https://hr-platform-xxx.up.railway.app
```

**ВАЖНО:** Root Directory ТРЯБВА да е `backend` (без /).

**Безплатен tier:** $5 кредит/месец, достатъчен за тест.

### Seed данни
При първи deploy, seed-ът ще създаде demo акаунти автоматично.

---

## Вариант 3: Render.com (безплатен - 15 минути)

### Стъпки:

```bash
# 1. Отиди на https://render.com и се логни с GitHub

# 2. Натисни "New" → "Blueprint" → избери repo-то
#    render.yaml вече е в проекта и ще се използва автоматично

# ИЛИ ръчно:

# 3. Създай PostgreSQL database
#    "New" → "PostgreSQL" → Free plan
#    Запиши Internal Database URL

# 4. Създай Web Service (backend)
#    "New" → "Web Service" → свържи repo
#    Root Directory: backend
#    Build Command: npm install && npx prisma generate && npm run build
#    Start Command: npx prisma migrate deploy && npx prisma db seed && node dist/main.js
#    Добави Environment Variables (същите като Railway)

# 5. Създай Static Site (frontend)
#    "New" → "Static Site" → свържи repo
#    Root Directory: frontend
#    Build Command: npm install && npm run build
#    Publish Directory: dist
```

**Безплатен tier:** Backend заспива след 15 мин неактивност (30 сек cold start). Добре за тест.

---

## Вариант 4: Docker Compose (за локален сървър)

Ако имаш сървър/VPS (DigitalOcean, Hetzner, $5/месец):

```bash
# 1. Клонирай проекта
git clone https://github.com/AnimaciqBG/cg-HR-.git
cd cg-HR-

# 2. Стартирай с Docker Compose
docker-compose up -d

# Готово! Достъпен на http://YOUR_SERVER_IP:5173
```

За HTTPS, добави Caddy или nginx reverse proxy отпред.

---

## Вариант 5: Fly.io (безплатен)

```bash
# 1. Инсталирай flyctl
curl -L https://fly.io/install.sh | sh

# 2. Логни се
fly auth signup  # или fly auth login

# 3. Стартирай от backend папката
cd backend
fly launch --name hr-platform-test

# 4. Добави PostgreSQL
fly postgres create --name hr-platform-db
fly postgres attach hr-platform-db

# 5. Задай environment variables
fly secrets set JWT_SECRET=my-test-secret-12345 JWT_REFRESH_SECRET=refresh-secret-67890 CORS_ORIGIN=*

# 6. Deploy
fly deploy
```

---

## Бързо сравнение

| Метод | Цена | Време | PostgreSQL | HTTPS | URL стабилен |
|-------|------|-------|------------|-------|-------------|
| ngrok | Безплатно | 2 мин | Локален | Да | Не |
| Railway | $5 кредит | 10 мин | Да | Да | Да |
| Render | Безплатно | 15 мин | Да | Да | Да |
| Docker+VPS | $5/мес | 20 мин | Да | Ръчно | Да |
| Fly.io | Безплатно | 15 мин | Да | Да | Да |

---

## След deploy - тестване

```bash
# Провери дали API работи
curl https://YOUR_URL/api/health

# Логни се
curl -X POST https://YOUR_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hrplatform.bg","password":"Admin123!@#$"}'
```

Demo акаунти:
- **Super Admin:** admin@hrplatform.bg / Admin123!@#$
- **HR Manager:** hr@hrplatform.bg / Admin123!@#$
- **Team Lead:** lead@hrplatform.bg / Admin123!@#$
- **Employee:** ivan@hrplatform.bg / Admin123!@#$

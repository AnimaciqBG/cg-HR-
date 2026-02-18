FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Build frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx vite build
RUN ls -la /app/frontend/dist/index.html

# Build backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/prisma ./prisma
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# Copy frontend build to backend public dir
RUN mkdir -p /app/backend/public && cp -r /app/frontend/dist/* /app/backend/public/
RUN ls -la /app/backend/public/index.html

COPY backend/startup.sh backend/seed-check.js ./
RUN chmod +x startup.sh

ENV NODE_ENV=production
EXPOSE 3001

CMD ["./startup.sh"]

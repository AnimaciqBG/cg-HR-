FROM node:20-alpine AS base

# Backend build
FROM base AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/tsconfig.json ./
RUN npm install
COPY backend/src ./src
COPY backend/prisma ./prisma
RUN npx prisma generate
RUN npm run build

# Frontend build
FROM base AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Production
FROM base AS production
WORKDIR /app

# Copy backend
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=backend-build /app/backend/package.json ./

# Copy frontend build into backend static
COPY --from=frontend-build /app/frontend/dist ./public

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Run migrations and start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

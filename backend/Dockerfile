FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

COPY startup.sh ./
RUN chmod +x startup.sh

ENV NODE_ENV=production
EXPOSE 3001

CMD ["./startup.sh"]

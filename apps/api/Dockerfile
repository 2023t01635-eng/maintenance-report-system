FROM node:24-alpine AS dev

WORKDIR /app

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY apps/api apps/api

WORKDIR /app/apps/api

RUN npm run prisma:generate

EXPOSE 4000

CMD ["npm", "run", "dev"]

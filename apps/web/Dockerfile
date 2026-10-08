FROM node:24-alpine AS dev

WORKDIR /app

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY apps/web apps/web

WORKDIR /app/apps/web

EXPOSE 5173

CMD ["npm", "run", "dev"]

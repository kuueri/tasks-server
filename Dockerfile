FROM node:16-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY dist ./dist/
# WARNING
# DO NOT PUSH IMAGE TO PUBLIC REPOSITORY
COPY resource ./resource/

RUN npm ci

EXPOSE 8202

CMD ["node", "/app/dist/main.js"]
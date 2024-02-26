# Sample Dockefile
FROM node:18-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY dist ./dist/
# WARNING
# DO NOT PUSH IMAGE TO PUBLIC REPOSITORY
COPY resource ./resource/

# Add `--force` if npm throw an error
RUN npm ci --omit=dev

EXPOSE 8202

CMD ["node", "/app/dist/main.js"]
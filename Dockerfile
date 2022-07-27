FROM node:16-alpine

RUN npm install pm2 -g

WORKDIR /usr/app/tasks

COPY package*.json .
COPY app.yml .
COPY LICENSE .

RUN npm install --omit=dev

COPY resource /usr/app/tasks/resource
COPY dist /usr/app/tasks/dist

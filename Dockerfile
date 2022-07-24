FROM node:16-alpine

WORKDIR /usr/app/tasks

COPY package*.json .
COPY LICENSE .

RUN npm install --omit=dev

COPY resource /usr/app/tasks/resource
COPY dist /usr/app/tasks/dist

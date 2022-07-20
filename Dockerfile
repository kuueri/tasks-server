FROM node:16-alpine

RUN apk update && apk upgrade

WORKDIR /usr/app/tasks

COPY package*.json .
COPY LICENSE .

RUN npm install --omit=dev

COPY resource /usr/app/tasks/resource
COPY dist /usr/app/tasks/dist

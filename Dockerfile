# syntax=docker/dockerfile:1

FROM node:16.14.2
ENV NODE_ENV=production

WORKDIR /app
COPY . .
RUN npm install --production

EXPOSE 8111
ENTRYPOINT ["node", "./server.js"]
FROM node:22-alpine

WORKDIR /app
COPY realtime/package.json ./
RUN npm install --omit=dev
COPY realtime/server.js ./server.js

EXPOSE 3001
CMD ["npm", "start"]

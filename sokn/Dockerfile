FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production DEV_LOGIN=0
COPY sokn/api/package*.json /app/
RUN npm ci --omit=dev
COPY sokn/api /app
COPY sokn/app /app/app
EXPOSE 3000
CMD ["node","src/server.js"]

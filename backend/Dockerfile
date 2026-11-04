FROM node:20-alpine
# pg_dump / pg_restore for the scheduled + manual backups (major version matches the postgres:16 service)
RUN apk add --no-cache postgresql16-client
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main.js"]

# Сборка: страница (dist) и сервер (dist-server) в одном образе, без node_modules.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Цены баз с трейда должны переживать пересоздание контейнера.
RUN mkdir data && chown node:node data
VOLUME /app/data
USER node
EXPOSE 8080
CMD ["node", "dist-server/index.js"]

# Образ для деплоя: собирается на сервере из уже готовой сборки, которую присылает deploy.ps1.
# Сборка из исходников — в Dockerfile в корне проекта.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data
COPY dist ./dist
COPY dist-server ./dist-server
RUN mkdir data && chown node:node data
USER node
EXPOSE 8080
CMD ["node", "dist-server/index.js"]

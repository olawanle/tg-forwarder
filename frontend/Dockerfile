FROM node:20-slim AS build
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./

# Vite bakes VITE_* vars into the JS bundle at build time, not read at
# runtime, so this needs to arrive as a build ARG (Railway auto-populates
# build args from service variables of the same name).
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist

# Real shell so $PORT expands (same PORT footgun as the other two services).
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]

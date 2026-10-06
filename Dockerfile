# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base

WORKDIR /app

RUN apk add --no-cache ffmpeg \
    && mkdir -p /app/uploads /app/tmp/media \
    && chown -R node:node /app

FROM base AS development

ENV NODE_ENV=development

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src

USER node

EXPOSE 3000

CMD ["npm", "run", "dev"]

FROM development AS build

RUN npm run typecheck
RUN npm run build

FROM base AS production-dependencies

ENV NODE_ENV=production

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

FROM base AS production

ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
ENV MEDIA_TEMP_DIRECTORY=/app/tmp/media

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./

USER node

EXPOSE 3000

STOPSIGNAL SIGTERM

CMD ["node", "dist/server.js"]

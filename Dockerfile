# Japatext API — Express + SQLite (single-user production deploy).
# Mount a persistent volume at /data and set JAPATEXT_DATA_DIR=/data.

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json

RUN npm ci --workspace server

COPY server server/

RUN npm run build --workspace server \
  && mkdir -p server/dist/db \
  && cp server/src/db/schema.sql server/dist/db/schema.sql

ENV NODE_ENV=production
ENV PORT=8787
ENV JAPATEXT_DATA_DIR=/data

EXPOSE 8787

CMD ["node", "server/dist/index.js"]

# TrustDesk API server image.
# Build context is the repo root (so the sample pack data/ can be included for
# the optional `npm run seed`):  docker build -f server/Dockerfile .
FROM node:22-alpine AS base
WORKDIR /app

# Install production deps first for layer caching.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Application source and the sample pack data (only read by `npm run seed`).
COPY server/src ./src
COPY data /data

ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data

EXPOSE 4000

# Run as the built-in non-root user.
USER node

CMD ["node", "src/server.js"]

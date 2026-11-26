# Package `npm run build:self-hosted-ssr`; no source or .env is copied.
FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
# Nitro's Node server serves assets from ../public relative to its server directory.
COPY --chown=node:node .output/server/ ./server/
COPY --chown=node:node .output/public/ ./public/
RUN mkdir /data && chown node:node /data
# Keep the example's filesystem todo store outside the application files.
WORKDIR /data
USER node
EXPOSE 3000
CMD ["node", "/app/server/index.mjs"]

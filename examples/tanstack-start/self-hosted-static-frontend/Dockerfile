# Package `npm run build:self-hosted-static-frontend`; no source or .env is copied.
FROM nginx:1.30-alpine AS frontend
# The official entrypoint reads the container's DNS configuration and substitutes
# NGINX_LOCAL_RESOLVERS in the template before starting Nginx.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY .output/public/ /usr/share/nginx/html/
EXPOSE 80

FROM node:24-alpine AS backend
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --chown=node:node .output/server/ ./
RUN mkdir /data && chown node:node /data
# The example's filesystem todo store uses the current working directory.
WORKDIR /data
USER node
EXPOSE 3000
CMD ["node", "/app/index.mjs"]

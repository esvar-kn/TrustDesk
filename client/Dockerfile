# TrustDesk client image: build the Vite SPA, serve it with nginx.
# nginx also proxies /api to the server service, so the browser sees one origin
# (no CORS needed) and no API base URL is baked into the build.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

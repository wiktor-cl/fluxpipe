# Build context is the monorepo root (see docker-compose.yml) so npm workspaces
# resolve consistently with the other services, even though the dashboard has
# no runtime dependency on @fluxpipe/shared or @fluxpipe/db.
FROM node:22-alpine AS build
WORKDIR /repo
COPY . .
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm ci
RUN npm run build --workspace @fluxpipe/dashboard

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/dashboard/dist /usr/share/nginx/html
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

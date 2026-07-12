# Build context is the monorepo root (see docker-compose.yml), because this
# service depends on the workspace packages @fluxpipe/shared and @fluxpipe/db.
FROM node:22-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci
RUN npm run build --workspace @fluxpipe/shared \
 && npm run build --workspace @fluxpipe/db \
 && npm run build --workspace @fluxpipe/api

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Every workspace's package.json is copied (not just this service's) so that
# `npm ci` can validate against the monorepo's single package-lock.json -
# npm workspaces resolve the lockfile against whatever workspaces are
# present on disk, and a partial set can trigger a lockfile-mismatch error.
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/db/package.json packages/db/package.json
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/worker/package.json apps/worker/package.json
COPY --from=build /repo/apps/mock-partner-api/package.json apps/mock-partner-api/package.json
COPY --from=build /repo/apps/dashboard/package.json apps/dashboard/package.json
RUN npm ci --omit=dev

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/db/migrations packages/db/migrations
COPY --from=build /repo/apps/api/dist apps/api/dist

EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]

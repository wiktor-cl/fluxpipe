# Build context is the monorepo root (see docker-compose.yml) for consistency
# with the other services, though this one has no workspace dependencies.
FROM node:22-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci
RUN npm run build --workspace @fluxpipe/mock-partner-api

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/db/package.json packages/db/package.json
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/worker/package.json apps/worker/package.json
COPY --from=build /repo/apps/mock-partner-api/package.json apps/mock-partner-api/package.json
COPY --from=build /repo/apps/dashboard/package.json apps/dashboard/package.json
RUN npm ci --omit=dev

COPY --from=build /repo/apps/mock-partner-api/dist apps/mock-partner-api/dist

EXPOSE 4100
CMD ["node", "apps/mock-partner-api/dist/index.js"]

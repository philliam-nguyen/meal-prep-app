# syntax=docker/dockerfile:1

# One image for both Variants (ADR-0002). It carries the API and the frontend bundle the API serves
# from its own origin, and the migration step is this same image with a different command rather
# than a second artifact.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
RUN npm ci --workspace @meal-prep/web --include-workspace-root
COPY packages/shared packages/shared
COPY packages/web packages/web
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
RUN npm ci --omit=dev --workspace @meal-prep/api --include-workspace-root
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY --from=build /app/packages/web/dist packages/web/dist
USER node
EXPOSE 8080
CMD ["node", "packages/api/src/server.js"]

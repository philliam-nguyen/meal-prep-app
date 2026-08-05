# syntax=docker/dockerfile:1

# One image for both Variants (ADR-0002). It carries the API and the frontend bundle the API serves
# from its own origin, and the migration step is this same image with a different command rather
# than a second artifact.
#
# The npm_ca secret is for networks that terminate TLS in the middle, where the registry presents a
# certificate signed by a private root the base image does not carry. It adds a trusted root for the
# duration of one install rather than disabling verification, is never written to a layer, and is
# inert when the secret is empty. Point NPM_CA_FILE at your bundle in .env to use it.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
RUN --mount=type=secret,id=npm_ca,required=false sh -eu -c '\
  if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  npm ci --workspace @meal-prep/web --include-workspace-root'
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
RUN --mount=type=secret,id=npm_ca,required=false sh -eu -c '\
  if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
  npm ci --omit=dev --workspace @meal-prep/api --include-workspace-root'
COPY packages/shared packages/shared
COPY packages/api packages/api
COPY --from=build /app/packages/web/dist packages/web/dist
USER node
EXPOSE 8080
CMD ["node", "packages/api/src/server.js"]

# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

# Generate lockfile and install dependencies for the build
COPY package*.json ./
RUN pnpm install --lockfile-only
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build

# ---- Runtime image ----
FROM node:20-alpine AS production
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PORT=4000

# Reuse lockfile from build stage and install only production deps
COPY --from=build /app/package*.json ./
COPY --from=build /app/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy compiled artifacts from the build stagen
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/main"]


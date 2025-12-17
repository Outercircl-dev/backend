# syntax=docker/dockerfile:1

FROM node:24.12.0-slim AS build
WORKDIR /app
RUN corepack enable
ENV CI=true

# Install dependencies (dev deps included for build)
COPY package*.json ./
RUN pnpm install --lockfile-only
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm prisma generate
RUN pnpm run build

# Copy source and build the NestJS project
COPY . .
RUN pnpm run build

# ---- Runtime image ----
FROM node:24.12.0-slim AS production
WORKDIR /app
RUN corepack enable
ENV CI=true
ENV NODE_ENV=production
ENV PORT=4000

# Install only production deps
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy compiled artifacts from the build stage
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/main"]


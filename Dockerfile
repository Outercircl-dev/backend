# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

# Install dependencies (dev deps included for build)
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build the NestJS project
COPY . .
RUN pnpm run build

# ---- Runtime image ----
FROM node:20-alpine AS production
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PORT=4000

# Install only production deps
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy compiled artifacts from the build stage
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/main"]


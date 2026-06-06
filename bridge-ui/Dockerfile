# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24.13.0-slim

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY bridge-ui/package.json bridge-ui/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY bridge-ui/ ./
ENV NODE_ENV=production
RUN npm run build

FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV BRIDGE_CONTROL_URL=http://proton-bridge:8081
ENV PROTON_BRIDGE_IMAP_PORT=1143
ENV PROTON_BRIDGE_SMTP_PORT=1025
COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir .next && chown node:node .next
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

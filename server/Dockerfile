# ==============================================================================
# Stage 1: Dependency Installation (Clean Production Tree)
# ==============================================================================
FROM node:20-alpine AS dependencies

WORKDIR /app

# Install build prerequisites if any native modules require compilation
RUN apk add --no-cache libc6-compat

# Copy package manifests
COPY package.json package-lock.json ./

# Install strictly production runtime dependencies with immutable lockfile
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ==============================================================================
# Stage 2: Production Runtime Image
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Set default production environment variables
ENV NODE_ENV=production \
    PORT=5000

# Install runtime utilities for container health checks
RUN apk add --no-cache wget

# Create application directories and set non-root ownership
RUN mkdir -p /app && chown -R node:node /app

# Copy production dependencies from Stage 1
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

# Copy application source code and documentation
COPY --chown=node:node package.json ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node docs/ ./docs/

# Switch to non-root user (alpine built-in node user: UID=1000, GID=1000)
USER node

# Expose HTTP API and Socket.IO port
EXPOSE 5000

# Container liveness health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start server using exec form so Node runs as PID 1 to receive SIGTERM/SIGINT signals
CMD ["node", "src/server.js"]

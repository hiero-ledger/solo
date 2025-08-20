# Multi-stage build for Solo Docker container
# This Dockerfile builds Solo from the local source code and creates a container
# that can run the Solo network

# Stage 1: Install external tools required by Solo
FROM busybox:1.37.0 AS installer

# Install Kind with multi-architecture support
ARG KIND_VERSION=0.26.0
RUN set -eux; \
    ARCH="$(uname -m)"; \
    case "${ARCH}" in \
        aarch64|arm64) \
            KIND_ARCH="arm64"; \
            ;; \
        amd64|x86_64) \
            KIND_ARCH="amd64"; \
            ;; \
        *) \
            echo "Unsupported arch: ${ARCH}"; \
            exit 1; \
            ;; \
    esac; \
    wget -O ./kind "https://kind.sigs.k8s.io/dl/v${KIND_VERSION}/kind-linux-${KIND_ARCH}"; \
    chmod +x ./kind

# Stage 2: Build the application
FROM node:20-bookworm-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY .npmrc ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 3: Runtime image
FROM node:20-bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    openjdk-17-jre-headless \
    jq \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy external tools from installer stage
COPY --from=installer /kind /usr/local/bin/kind

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Expose ports
EXPOSE 5600 5678 8080

# Set the entrypoint
ENTRYPOINT ["node", "dist/src/main.js"]

# Default command (can be overridden)
CMD ["start"]

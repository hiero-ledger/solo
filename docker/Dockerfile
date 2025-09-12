# Multi-stage build for Solo Docker container
# This Dockerfile builds Solo from the local source code and creates a container
# that can run Solo one-shot single deploy

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

# Install Docker with multi-architecture support
ARG DOCKER_VERSION=27.3.1
RUN set -eux; \
    ARCH="$(uname -m)"; \
    case "${ARCH}" in \
        aarch64|arm64) \
            DOCKER_ARCH="aarch64"; \
            ;; \
        amd64|x86_64) \
            DOCKER_ARCH="x86_64"; \
            ;; \
        *) \
            echo "Unsupported arch: ${ARCH}"; \
            exit 1; \
            ;; \
    esac; \
    wget -O ./docker.tgz "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_VERSION}.tgz"; \
    tar xzvf ./docker.tgz

# Install Kubectl with multi-architecture support
ARG KUBECTL_VERSION=1.27.3
RUN set -eux; \
    ARCH="$(uname -m)"; \
    case "${ARCH}" in \
        aarch64|arm64) \
            KUBECTL_ARCH="arm64"; \
            ;; \
        amd64|x86_64) \
            KUBECTL_ARCH="amd64"; \
            ;; \
        *) \
            echo "Unsupported arch: ${ARCH}"; \
            exit 1; \
            ;; \
    esac; \
    wget -O ./kubectl "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/${KUBECTL_ARCH}/kubectl"; \
    chmod +x ./kubectl

# Install Helm with multi-architecture support
ARG HELM_VERSION=3.14.2
RUN set -eux; \
    ARCH="$(uname -m)"; \
    case "${ARCH}" in \
        aarch64|arm64) \
            HELM_ARCH="arm64"; \
            ;; \
        amd64|x86_64) \
            HELM_ARCH="amd64"; \
            ;; \
        *) \
            echo "Unsupported arch: ${ARCH}"; \
            exit 1; \
            ;; \
    esac; \
    wget -O ./helm.tgz "https://get.helm.sh/helm-v${HELM_VERSION}-linux-${HELM_ARCH}.tar.gz"; \
    tar xzvf ./helm.tgz

# Stage 2: Main application image
FROM node:20.18.0-alpine

# Install required system packages
RUN apk add --no-cache python3 jq git

# Copy external tools from installer stage
COPY --from=installer ./kind /usr/local/bin/kind
COPY --from=installer ./docker/docker /usr/local/bin/docker
COPY --from=installer ./kubectl /usr/local/bin/kubectl
COPY --from=installer ./linux-*/helm /usr/local/bin/helm

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies using npm (works with package-lock.json)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build Solo from source (use the existing build process)
RUN npx tsc
RUN if [ -f resources/post-build-script.js ]; then node resources/post-build-script.js; fi

# Install Solo globally from the built source
RUN npm pack
RUN npm install -g hashgraph-solo-*.tgz

# Set environment variables for Solo
ENV SOLO_CLUSTER_NAME=solo-cluster
ENV SOLO_NAMESPACE=solo
ENV SOLO_DEPLOYMENT=solo-deployment

# Create a startup script for one-shot
RUN echo '#!/bin/sh' > /usr/local/bin/solo-one-shot.sh && \
    echo 'echo "Starting Solo one-shot single deploy..."' >> /usr/local/bin/solo-one-shot.sh && \
    echo 'solo one-shot single deploy' >> /usr/local/bin/solo-one-shot.sh && \
    chmod +x /usr/local/bin/solo-one-shot.sh

# Default command runs Solo one-shot
CMD ["/usr/local/bin/solo-one-shot.sh"]

# Multi-stage build for Solo Docker container
# This Dockerfile builds Solo from the local source code and creates a container
# that can run Solo quick-start single deploy

# Stage 1: Install external tools required by Solo
FROM busybox:1.37.0 AS installer

# Install Kind
ARG KIND_VERSION=0.26.0
RUN wget -O ./kind https://kind.sigs.k8s.io/dl/v${KIND_VERSION}/kind-linux-amd64
RUN chmod +x ./kind

# Install Docker
ARG DOCKER_VERSION=27.3.1
RUN wget -O ./docker.tgz https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz
RUN tar xzvf ./docker.tgz

# Install Kubectl
ARG KUBECTL_VERSION=1.27.3
RUN wget -O ./kubectl "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
RUN chmod +x ./kubectl

# Install Helm
ARG HELM_VERSION=3.14.2
RUN wget -O ./helm.tgz https://get.helm.sh/helm-v${HELM_VERSION}-linux-amd64.tar.gz
RUN tar xzvf ./helm.tgz

# Stage 2: Main application image
FROM node:20.18.0-alpine

# Install required system packages
RUN apk add --update --no-cache python3 jq git

# Copy external tools from installer stage
COPY --from=installer ./kind /usr/local/bin/kind
COPY --from=installer ./docker/docker /usr/local/bin/docker
COPY --from=installer ./kubectl /usr/local/bin/kubectl
COPY --from=installer ./linux-amd64/helm /usr/local/bin/helm

# Set working directory
WORKDIR /app

# Copy the entire Solo source code
COPY . .

# Install dependencies using npm (works with package-lock.json)
RUN npm ci

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

# Create a startup script for quick-start
RUN echo '#!/bin/sh' > /usr/local/bin/solo-quick-start.sh && \
    echo 'echo "Starting Solo quick-start single deploy..."' >> /usr/local/bin/solo-quick-start.sh && \
    echo 'solo init' >> /usr/local/bin/solo-quick-start.sh && \
    echo 'solo quick-start single' >> /usr/local/bin/solo-quick-start.sh && \
    chmod +x /usr/local/bin/solo-quick-start.sh

# Default command runs Solo quick-start
CMD ["solo-quick-start.sh"]

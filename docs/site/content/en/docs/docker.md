---
title: "Docker Container"
linkTitle: "Docker"
weight: 30
description: >
  Guide for building and running the Solo network in a Docker container
---

# Running Solo in Docker

The Solo network can be run in a Docker container, providing an isolated environment with all dependencies included.

## Prerequisites

- Docker 20.10.0 or later
- At least 4GB of RAM allocated to Docker
- At least 10GB of free disk space

## Quick Start

To quickly start a Solo network in a container:

```bash
docker run -d --name solo \
  -p 5600:5600 \
  -p 5678:5678 \
  -p 80:8080 \
  ghcr.io/hiero-ledger/solo/solo:latest
```

This will start a Solo network with:
- Consensus node API on port 5600
- gRPC on port 5678
- Explorer UI on port 80

## CI/CD Integration

The Solo Docker image is automatically built and published through GitHub Actions workflows:

### PR Validation

Every pull request triggers a build of the Docker image in dry-run mode to verify that the image can be built successfully.

### Release Process

When changes are merged to the default branch:
1. A new Docker image is built and tagged with:
   - `latest` - For the most recent stable release
   - `vX.Y.Z` - Semantic version tag (e.g., v1.2.3)
   - `vX.Y` - Major and minor version (e.g., v1.2)
   - `vX` - Major version (e.g., v1)

2. The image is published to GitHub Container Registry at `ghcr.io/hiero-ledger/solo/solo`

## Building the Container

### Using Pre-built Images

Pull the latest stable image:

```bash
docker pull ghcr.io/hiero-ledger/solo/solo:latest
```

### Building from Source

To build the container locally from source:

```bash
git clone https://github.com/hiero-ledger/solo.git
cd solo
docker build -t solo -f docker/Dockerfile .
```

## Configuration

### Environment Variables

You can configure the container using the following environment variables:

- `NODE_ENV` - Set to 'production' for production use (default: 'development')
- `LOG_LEVEL` - Logging level (default: 'info')
- `PORT` - Port for the HTTP server (default: 3000)
- `CONFIG_PATH` - Path to configuration file (default: '/app/config/default.json')

Example with environment variables:

```bash
docker run -d --name solo \
  -e NODE_ENV=production \
  -e LOG_LEVEL=debug \
  -p 5600:5600 \
  -p 5678:5678 \
  -p 80:8080 \
  ghcr.io/hiero-ledger/solo/solo:latest
```

### Volumes

To persist data between container restarts, mount volumes for the data directories:

```bash
docker run -d --name solo \
  -v solo-data:/app/data \
  -p 5600:5600 \
  -p 5678:5678 \
  -p 80:8080 \
  ghcr.io/hiero-ledger/solo/solo:latest
```

## Troubleshooting

### Viewing Logs

```bash
docker logs -f solo
```

### Accessing the Container

```bash
docker exec -it solo /bin/sh
```

### Cleaning Up

To stop and remove the container:

```bash
docker stop solo
docker rm solo
```

To remove the Docker volume:

```bash
docker volume rm solo-data
```

# Solo Docker Container

This directory contains the Docker infrastructure for building and running Solo as a Docker container image.

## Overview

The Solo Docker container allows developers to run Solo networks with Docker as the only dependency. The container includes:

* Solo CLI built from local source code
* All required tools (Kind, kubectl, Helm, Docker)
* Pre-configured environment for quick-start deployments
* Container version matches the Solo version number

## Prerequisites

* Docker installed on your system
* [Task](https://taskfile.dev) installed for build automation

## Quick Start

### Build the Container

From the Solo root directory:

```bash
# Build Solo and then the Docker image
task build-all

# Or build components separately
task build-solo    # Build Solo from source
task build-docker  # Build Docker image
```

### Run the Container

```bash
# Run with quick-start single deploy (default)
docker run --rm -it --privileged hashgraph/solo:latest

# Run with custom Solo commands
docker run --rm -it --privileged hashgraph/solo:latest solo --help

# Run interactively
docker run --rm -it --privileged hashgraph/solo:latest sh
```

## Container Details

### Image Tagging

The container is built with two tags:

* `hashgraph/solo:latest` - Latest version
* `hashgraph/solo:x.y.z` - Specific version matching Solo's package.json version

### Environment Variables

The container sets these default environment variables:

* `SOLO_CLUSTER_NAME=solo-cluster`
* `SOLO_NAMESPACE=solo`
* `SOLO_DEPLOYMENT=solo-deployment`

These can be overridden when running the container:

```bash
docker run --rm -it --privileged \
  -e SOLO_CLUSTER_NAME=my-cluster \
  -e SOLO_NAMESPACE=my-namespace \
  hashgraph/solo:latest
```

### Privileged Mode

The container requires `--privileged` mode to run Kind clusters and manage Docker containers within the container.

## Development

### File Structure

```
docker/
├── Dockerfile          # Multi-stage Docker build
├── Taskfile.yaml      # Build automation tasks
└── README.md          # This file
```

### Build Process

1. **Stage 1 (installer)**: Downloads and prepares external tools (Kind, kubectl, Helm, Docker)
2. **Stage 2 (main)**:

* Starts with Node.js 20.18.0 Alpine base
* Copies tools from Stage 1
* Installs system dependencies
* Copies Solo source code
* Builds Solo from source using TypeScript compiler
* Packages and installs Solo globally
* Sets up quick-start script

### Customization

To customize the build:

1. **Tool Versions**: Modify ARG values in the Dockerfile
2. **Base Image**: Change the Node.js version in the second FROM statement
3. **Environment**: Adjust ENV variables as needed
4. **Startup Command**: Modify the CMD or create custom scripts

### Available Tasks

Run `task --list` in the docker directory to see all available build tasks:

```bash
cd docker
task --list
```

## Troubleshooting

### Common Issues

1. **Build fails with TypeScript errors**: Ensure all dependencies are properly installed
2. **Container won't start**: Verify Docker is running and you have sufficient resources
3. **Permission denied**: Make sure to run with `--privileged` flag
4. **Port conflicts**: Check that ports exposed in the Dockerfile are available

### Debugging

Run the container interactively to debug issues:

```bash
docker run --rm -it --privileged hashgraph/solo:latest sh
```

Inside the container, you can:

* Check Solo installation: `solo --version`
* Verify tools: `kind version`, `kubectl version`, `helm version`
* Run Solo commands manually: `solo init`, `solo cluster list`, etc.

## Contributing

When making changes to the Docker infrastructure:

1. Test the build locally: `task docker:build`
2. Test running the container with various configurations
3. Update this README if you change functionality
4. Ensure version numbers are correctly inherited from package.json

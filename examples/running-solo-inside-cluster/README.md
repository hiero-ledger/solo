# Running Solo Inside Cluster Example

This example demonstrates how to run the Solo network inside a privileged Ubuntu pod in a Kubernetes cluster for end-to-end testing. It automates the setup of all required dependencies and configures the environment for Solo to run inside the cluster.

## What it does
- Renders Kubernetes manifests for a ServiceAccount and a privileged Ubuntu pod using templates.
- Applies these manifests to your cluster using `kubectl`.
- Waits for the pod to be ready, then copies and executes a setup script inside the pod.
- The setup script installs all required tools (kubectl, Docker, Helm, Node.js, etc.), installs the Solo CLI locally, and runs Solo commands to initialize and deploy a test network.

## Usage

1. **Install dependencies**
   - Make sure you have [kubectl](https://kubernetes.io/docs/tasks/tools/) and [Task](https://taskfile.dev/) installed.
   - You need access to a running Kubernetes cluster (e.g., Kind, Minikube, GKE).

2. **Run the test**
   ```sh
   task
   ```
   This will:
   - Render and apply the ServiceAccount and Pod manifests
   - Copy and execute the setup script inside the pod
   - The pod will install all dependencies and use Solo to create a Hiero deployment

3. **Clean up**
   - Run the cleanup task to delete the pod and ServiceAccount:
     ```sh
     task cleanup
     ```


## Customization
- You can modify the templates in the `templates/` directory to change the pod configuration or ServiceAccount permissions.
- Edit the setup script to adjust which Solo commands are run or which dependencies are installed.

## Tasks
- `start`: Sets up and runs the Solo network inside a privileged pod for end-to-end testing.
- `cleanup`: Deletes the privileged pod and ServiceAccount used for the test.

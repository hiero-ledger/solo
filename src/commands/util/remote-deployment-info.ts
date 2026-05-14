// SPDX-License-Identifier: Apache-2.0

/** Location information for a deployment discovered from a remote-config ConfigMap. */
export type RemoteDeploymentInfo = {
  /** Kubernetes namespace where the deployment resides. */
  namespace: string;
  /** Kubeconfig context in which the deployment was found. */
  context: string;
};

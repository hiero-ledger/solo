// SPDX-License-Identifier: Apache-2.0

import {type KindClient} from './kind-client.js';

/**
 * KindClientBuilder is used to construct instances of KindClient. This interface defines the standard
 * methods which all KindClient builders must implement.
 *
 * @implNote The build() method is responsible for extracting the appropriate Kind executable
 * from the package. The Kind executable should be extracted to a temporary directory which is supplied to the
 * KindClient implementation.
 * @see KindClient
 */
export interface KindClientBuilder {
  /**
   * Sets the default namespace for the KindClient instance.
   *
   * @param namespace the Kubernetes namespace to use by default.
   * @returns the KindClientBuilder instance.
   * @implNote The kubernetes cluster's default namespace is used if the namespace is not explicitly provided.
   * @implSpec This value should be used to set the --namespace <namespace> flag for all Kind commands unless
   * overridden by a specific KindClient method.
   */
  defaultNamespace(namespace: string): KindClientBuilder;

  /**
   * Sets the working directory for the KindClient instance.
   * @param workingDirectory the working directory.
   * @returns the KindClientBuilder instance.
   * @implNote The working directory is set to the pwd if not explicitly provided, if that fails it will use the
   * parent folder of the kind executable.
   */
  workingDirectory(workingDirectory: string): KindClientBuilder;

  /**
   * Sets the Kubernetes API server address and port number for the KindClient instance.
   *
   * @param kubeApiServer the Kubernetes API server address and port number.
   * @returns the KindClientBuilder instance.
   * @implNote The Kubernetes API server address and port number are read from the Kubernetes configuration file if not
   * explicitly provided.
   * @implSpec This value should be used to set the --kube-apiserver <kubeApiServer> flag for all Kind commands.
   */
  kubeApiServer(kubeApiServer: string): KindClientBuilder;

  /**
   * Sets the path to the Kubernetes CA certificate file for the KindClient instance.
   *
   * @param kubeCAFile the path to the Kubernetes API server CA certificate file.
   * @returns the KindClientBuilder instance.
   * @implNote The Kubernetes CA certificate file path is read from the Kubernetes configuration file if not explicitly
   * provided.
   * @implSpec This value should be used to set the --kube-ca-file <kubeCAFile> flag for all Kind commands.
   */
  kubeCAFile(kubeCAFile: string): KindClientBuilder;

  /**
   * Sets the context defined in the kube config file to use for the KindClient instance. If this value is not
   * provided, the current context is used.
   *
   * @param kubeContext the name of the context defined in the kube config file to use.
   * @returns the KindClientBuilder instance.
   * @implNote The Kubernetes context is read from the Kubernetes configuration file if not explicitly provided.
   * @implSpec This value should be used to set the --kube-context <kubeContext> flag for all Kind commands.
   */
  kubeContext(kubeContext: string): KindClientBuilder;

  /**
   * Sets whether to skip TLS verification when communicating with the Kubernetes API server for the KindClient
   * instance.
   *
   * @param kubeSkipTlsVerification indicates whether to skip TLS verification when communicating with the Kubernetes API
   *                                server. This value may be null to indicate that the default value should be
   *                                used.
   * @returns the KindClientBuilder instance.
   * @implNote The Kubernetes skip TLS verification flag is read from the Kubernetes configuration file if not explicitly
   * provided.
   * @implSpec This value should be used to set the --kube-skip-tls-verification <kubeSkipTlsVerification> flag
   * for all Kind commands.
   */
  kubeSkipTlsVerification(kubeSkipTlsVerification: boolean | null): KindClientBuilder;

  /**
   * Sets the server name to use for certificate verification of the Kubernetes API server for the KindClient
   * instance.
   *
   * @param kubeTlsServerName the server name to use for certificate verification of the Kubernetes API server.
   * @returns the KindClientBuilder instance.
   * @implNote The Kubernetes TLS server name is read from the Kubernetes configuration file if not explicitly provided.
   * @implSpec This value should be used to set the --kube-tls-server-name <kubeTlsServerName> flag for all Kind
   * commands.
   */
  kubeTlsServerName(kubeTlsServerName: string): KindClientBuilder;

  /**
   * Sets the kubernetes bearer token for the KindClient instance.
   *
   * @param kubeToken the kubernetes bearer token.
   * @returns the KindClientBuilder instance.
   * @implNote The Kubernetes bearer token is read from the Kubernetes configuration file if not explicitly provided.
   * @implSpec This value should be used to set the --kube-token <kubeToken> flag for all Kind commands.
   */
  kubeToken(kubeToken: string): KindClientBuilder;

  /**
   * Sets the path to the Kubernetes configuration file for the KindClient instance.
   *
   * @param kubeConfig the path to the Kubernetes configuration file.
   * @returns the KindClientBuilder instance.
   * @implNote The Kubernetes configuration file is read from the default location if not explicitly provided.
   * @implSpec This value should be used to set the --kubeconfig <kubeConfig> flag for all Kind commands.
   */
  kubeConfig(kubeConfig: string): KindClientBuilder;

  /**
   * Constructs an instance of the KindClient with the provided configuration.
   *
   * @returns the KindClient instance.
   * @throws KindConfigurationException if the KindClient instance cannot be constructed.
   * @implNote This method is responsible for extracting the appropriate Kind executable from the package to a
   * temporary working directory. The temporary working directory should be supplied to the KindClient instance.
   * @see KindClient
   */
  build(): KindClient;
}

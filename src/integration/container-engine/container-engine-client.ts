// SPDX-License-Identifier: Apache-2.0

/**
 * Abstraction over local container engine operations.
 *
 * Initially this will be implemented for Docker, but the contract is broad
 * enough to support other OCI-compatible engines later if needed.
 */
export interface ContainerEngineClient {
  /**
   * Pulls an image from its registry.
   */
  pullImage(image: string): Promise<void>;

  /**
   * Saves an image to a local archive file.
   */
  saveImage(image: string, archivePath: string): Promise<void>;

  /**
   * Loads an image archive into the local container engine.
   */
  loadImage(archivePath: string): Promise<void>;

  /**
   * Loads an image archive into a cluster runtime, such as Kind.
   */
  loadImageArchiveIntoCluster(archivePath: string, clusterName?: string): Promise<void>;

  /**
   * Removes an image from the local container engine.
   */
  removeImage(image: string): Promise<void>;
}

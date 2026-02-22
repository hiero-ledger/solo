// SPDX-License-Identifier: Apache-2.0

import {type ResourceOperation} from './resources/resource-operation.js';
import {type ResourceType} from './resources/resource-type.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {ResourceNotFoundError} from './errors/resource-operation-errors.js';
import {StatusCodes} from 'http-status-codes';
import {KubeApiError} from './errors/kube-api-error.js';

interface ApiError extends Error {
  code?: number;
  body?: any;
  headers?: any;
}

export class KubeApiResponse {
  private constructor() {}

  /**
   * Checks the response for an error status code and throws an error if one is found.
   *
   * @param errorResponse - the error response returned from the Kubernetes API call.
   * @param resourceType - the type of resource being checked.
   * @param resourceOperation - the operation being performed on the resource.
   * @param namespace - the namespace of the resource being checked.
   * @param name - the name of the resource being checked.
   */
  public static throwError(
    errorResponse: ApiError,
    resourceOperation: ResourceOperation,
    resourceType: ResourceType,
    namespace: NamespaceName,
    name: string,
  ): void {
    if (KubeApiResponse.isNotFound(errorResponse)) {
      throw new ResourceNotFoundError(resourceOperation, resourceType, namespace, name);
    }

    if (KubeApiResponse.isFailingStatus(errorResponse)) {
      throw new KubeApiError(
        `failed to ${resourceOperation} ${resourceType} '${name}' in namespace '${namespace}'`,
        +errorResponse?.code,
        null,
        {
          resourceType: resourceType,
          resourceOperation: resourceOperation,
          namespace: namespace,
          name: name,
        },
      );
    }

    throw new KubeApiError(
      `error occurred during ${resourceOperation} ${resourceType} '${name}' in namespace '${namespace}'`,
      +errorResponse?.code,
      null,
      {
        resourceType: resourceType,
        resourceOperation: resourceOperation,
        namespace: namespace,
        name: name,
      },
    );
  }

  public static isFailingStatus(errorResponse: ApiError): boolean {
    return (+errorResponse?.code || StatusCodes.INTERNAL_SERVER_ERROR) > StatusCodes.ACCEPTED;
  }

  public static isNotFound(errorResponse: ApiError): boolean {
    return +errorResponse?.code === StatusCodes.NOT_FOUND;
  }

  public static isCreatedStatus(errorResponse: ApiError): boolean {
    return +errorResponse?.code === StatusCodes.CREATED;
  }
}

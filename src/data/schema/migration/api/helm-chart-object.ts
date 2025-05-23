export function getNewHelmChartObject(): object {
  return {
    name: undefined,
    namespace: undefined,
    release: undefined,
    repository: undefined,
    directory: undefined,
    version: undefined,
    labelSelector: undefined,
    containerName: undefined,
    ingressClassName: undefined,
    ingressControllerName: undefined,
    ingressControllerPrefix: undefined,
  };
};

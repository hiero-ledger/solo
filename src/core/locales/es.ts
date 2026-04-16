// SPDX-License-Identifier: Apache-2.0

import {type LocaleData} from './locale-data.js';

export const ES: LocaleData = {
  local_config_not_found_message: 'No se encontró el archivo de configuración local',
  local_config_not_found_troubleshooting_steps: 'Crea una configuración local: solo deployment config create',

  remote_configs_mismatch_message:
    'Las configuraciones remotas en los clústeres {{cluster1}} y {{cluster2}} no coinciden',
  remote_configs_mismatch_troubleshooting_steps:
    'Inspecciona ambas configuraciones: kubectl get configmap -n solo\nSincroniza manualmente antes de reintentar',

  pod_not_ready_message: "El pod '{{pod}}' no estuvo listo en {{timeout}}s en el namespace '{{namespace}}'",
  pod_not_ready_troubleshooting_steps:
    'kubectl get pods -n {{namespace}}\nkubectl describe pod {{pod}} -n {{namespace}}\nkubectl logs {{pod}} -n {{namespace}}',

  relay_not_ready_message: "El relay '{{name}}' no estuvo listo en {{timeout}}s",
  relay_not_ready_troubleshooting_steps:
    'Comprueba el estado del mirror node: solo mirror node status\nkubectl get pods -n {{namespace}} -l app=relay\nkubectl logs -n {{namespace}} {{pod}}',

  invalid_argument_message: "Argumento no válido '{{argument}}': {{reason}}",

  helm_execution_failed_message: 'El comando de Helm falló con el código de salida {{exitCode}}',
  helm_execution_failed_troubleshooting_steps:
    'Comprueba la versión de helm: helm version\nRevisa los registros de helm anteriores para más detalles',

  kubernetes_api_error_message: 'La solicitud a la API de Kubernetes falló con el estado {{statusCode}}',
  kubernetes_api_error_troubleshooting_steps: 'kubectl cluster-info\nkubectl get nodes',

  internal_error_message: 'Se produjo un error interno inesperado',
  internal_error_troubleshooting_steps:
    'Por favor reporta este problema en https://github.com/hiero-ledger/solo/issues',
};

// SPDX-License-Identifier: Apache-2.0

import {type LocaleData} from './locale-data.js';

export const ES: LocaleData = {
  local_config_not_found_message: 'No se encontró el archivo de configuración local',
  local_config_not_found_troubleshooting_steps: 'Crea una configuración local: solo deployment config create',

  remote_configs_mismatch_message:
    'Las configuraciones remotas en los clústeres {{cluster1}} y {{cluster2}} no coinciden',
  remote_configs_mismatch_troubleshooting_steps:
    'Inspecciona ambas configuraciones: kubectl get configmap -n solo\nSincroniza manualmente antes de reintentar',

  deployment_already_exists_message:
    "Ya existe un despliegue con el nombre '{{deploymentName}}'. Por favor selecciona un nombre diferente",
  deployment_already_exists_troubleshooting_steps:
    'Consulta los despliegues existentes: solo deployment list\nElige un nombre diferente para tu despliegue',
};

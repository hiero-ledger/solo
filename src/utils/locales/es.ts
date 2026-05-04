// SPDX-License-Identifier: Apache-2.0

import {type SoloErrorLocaleEntry} from './locale-data.js';

export class EsLocale {
  public static readonly local_config_not_found: SoloErrorLocaleEntry = {
    message: 'No se encontró el archivo de configuración local',
    troubleshooting_steps: 'Crea una configuración local: solo deployment config create',
  };

  public static readonly remote_configs_mismatch: SoloErrorLocaleEntry = {
    message: 'Las configuraciones remotas en los clústeres {{cluster1}} y {{cluster2}} no coinciden',
    troubleshooting_steps:
      'Inspecciona ambas configuraciones: kubectl get configmap -n solo\nSincroniza manualmente antes de reintentar',
  };

  public static readonly deployment_already_exists: SoloErrorLocaleEntry = {
    message: "Ya existe un despliegue con el nombre '{{deploymentName}}'. Por favor selecciona un nombre diferente",
    troubleshooting_steps:
      'Consulta los despliegues existentes: solo deployment list\nElige un nombre diferente para tu despliegue',
  };

  public static readonly create_deployment_error: SoloErrorLocaleEntry = {
    message: 'Error al crear el despliegue',
    troubleshooting_steps:
      'Revisa los registros para más detalles: tail -f ~/.solo/logs/solo.log | jq\nVerifica la conectividad del clúster: kubectl get nodes\nRevisa tu configuración: solo deployment config view',
  };
}

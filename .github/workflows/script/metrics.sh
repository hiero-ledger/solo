#!/bin/bash
if [[ -z "$JSON_FILENAME" ]]; then
  echo "env var JSON_FILENAME is required"
  exit 1
fi
jq -r .date "$JSON_FILENAME"
echo "TPS"
jq .cpuInMillicores "$JSON_FILENAME"
jq .memoryInMebibytes "$JSON_FILENAME"
jq -r .gitHubSha "$JSON_FILENAME"
jq -r ."soloVersion" "$JSON_FILENAME"
jq -r ."soloChartVersion" "$JSON_FILENAME"
jq -r ."consensusNodeVersion" "$JSON_FILENAME"
jq -r ."mirrorNodeVersion" "$JSON_FILENAME"
jq -r ."blockNodeVersion" "$JSON_FILENAME"
jq -r ."relayVersion" "$JSON_FILENAME"
jq -r ."explorerVersion" "$JSON_FILENAME"
jq -r ."runtimeInMinutes" "$JSON_FILENAME"
jq -r ."transactionCount" "$JSON_FILENAME"
jq -r '.clusterMetrics[].podMetrics | sort_by(.podName)[] | "\(.podName)\t\(.cpuInMillicores)\t\(.memoryInMebibytes)"' "$JSON_FILENAME"

#!/bin/bash
# This script creates a zip file so that it can be copied out of the pod for research purposes
set -o pipefail

# Usage: support-zip.sh <useZip>
readonly useZip="${1}"

readonly HAPI_DIR=/opt/hgcapp/services-hedera/HapiApp2.0
readonly DATA_DIR=data
readonly RESEARCH_ZIP=${HOSTNAME}-log-config.zip
readonly OUTPUT_DIR=output
readonly ZIP_FULLPATH=${HAPI_DIR}/${DATA_DIR}/${RESEARCH_ZIP}
readonly FILE_LIST=${HAPI_DIR}/support-zip-file-list.txt
readonly CONFIG_TXT=config.txt
readonly SETTINGS_TXT=settings.txt
readonly SETTINGS_USED_TXT=settingsUsed.txt
readonly HEDERA_CRT=hedera.crt
readonly HEDERA_KEY=hedera.key
readonly ADDRESS_BOOK_DIR=${DATA_DIR}/saved/address_book
readonly CONFIG_DIR=${DATA_DIR}/config
readonly KEYS_DIR=${DATA_DIR}/keys
readonly ONBOARD_DIR=${DATA_DIR}/onboard
readonly UPGRADE_DIR=${DATA_DIR}/upgrade
readonly STATS_DIR=${DATA_DIR}/stats
readonly JOURNAL_CTL_LOG=${HAPI_DIR}/${OUTPUT_DIR}/journalctl.log
readonly LOG_FILE=${HAPI_DIR}/${OUTPUT_DIR}/support-zip.log
rm ${LOG_FILE} 2>/dev/null || true
rm ${FILE_LIST} 2>/dev/null || true

AddToFileList()
{
  local filePath="${1}"

  if [[ -d "${filePath}" ]]; then
    # Do not add quote symbol since zip does not strip them out
    find "${filePath}" -print | tee -a "${LOG_FILE}" >>"${FILE_LIST}"
    return
  fi

  if [[ -L "${filePath}" ]]; then
    echo "Adding symbolic link: ${filePath}" | tee -a "${LOG_FILE}"
    echo "${filePath}" | tee -a "${LOG_FILE}" >>"${FILE_LIST}"
    return
  fi

  if [[ -f "${filePath}" ]]; then
    echo "${filePath}" | tee -a "${LOG_FILE}" >>"${FILE_LIST}"
    return
  fi

  echo "skipping: ${filePath}, file or directory not found" | tee -a "${LOG_FILE}"
}

echo "support-zip.sh begin..." | tee -a ${LOG_FILE}
echo "cd ${HAPI_DIR}" | tee -a ${LOG_FILE}
cd ${HAPI_DIR}
pwd | tee -a ${LOG_FILE}
echo -n > ${FILE_LIST}
# journalctl is not available/populated in all container runtimes; treat as optional.
if command -v journalctl >/dev/null 2>&1; then
  (journalctl --no-pager > "${JOURNAL_CTL_LOG}" 2>/dev/null) || true
else
  : > "${JOURNAL_CTL_LOG}"
fi
AddToFileList ${CONFIG_TXT}
# Some images keep config.txt under data/config.
AddToFileList ${CONFIG_DIR}/${CONFIG_TXT}
AddToFileList ${SETTINGS_TXT}
AddToFileList ${SETTINGS_USED_TXT}
AddToFileList ${HEDERA_CRT}
AddToFileList ${HEDERA_KEY}
AddToFileList ${OUTPUT_DIR}
AddToFileList ${ADDRESS_BOOK_DIR}
AddToFileList ${CONFIG_DIR}
AddToFileList ${KEYS_DIR}
AddToFileList ${ONBOARD_DIR}
AddToFileList ${UPGRADE_DIR}
AddToFileList ${STATS_DIR}

echo "creating zip file ${ZIP_FULLPATH}" | tee -a ${LOG_FILE}
sed -i '/^$/d' "${FILE_LIST}" # Removes empty lines
if [[ "$useZip" = "true" ]]; then
  # Prefer zip when available; do not install packages at runtime.
  if command -v zip >/dev/null 2>&1; then
    echo "Using zip" | tee -a ${LOG_FILE}
    rm -f "${ZIP_FULLPATH}" 2>/dev/null || true
    zip -Xv "${ZIP_FULLPATH}" -@ < "${FILE_LIST}" >> ${LOG_FILE} 2>&1
    zip -Xv -u "${ZIP_FULLPATH}" "${OUTPUT_DIR}/support-zip.log" >> ${LOG_FILE} 2>&1
  else
    echo "zip not found, falling back to jar" | tee -a ${LOG_FILE}
    jar cvfM "${ZIP_FULLPATH}" "@${FILE_LIST}" >> ${LOG_FILE} 2>&1
    jar -u -v --file="${ZIP_FULLPATH}" "${OUTPUT_DIR}/support-zip.log" >> ${LOG_FILE} 2>&1
  fi
else
  jar cvfM "${ZIP_FULLPATH}" "@${FILE_LIST}" >> ${LOG_FILE} 2>&1
  jar -u -v --file="${ZIP_FULLPATH}" "${OUTPUT_DIR}/support-zip.log" >> ${LOG_FILE} 2>&1
fi
echo "...end support-zip.sh" | tee -a ${LOG_FILE}

exit 0

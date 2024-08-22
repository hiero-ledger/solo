/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
'use strict'
import fs from 'fs'
import path from 'path'
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from './errors.mjs'
import * as yaml from 'js-yaml'
import { flags } from '../commands/index.mjs'
import { constants, helpers, Templates } from './index.mjs'
import dot from 'dot-object'
import { getNodeAccountMap } from './helpers.mjs'
import * as semver from 'semver'
import { readFile, writeFile } from 'fs/promises'

const consensusSidecars = [
  'recordStreamUploader', 'eventStreamUploader', 'backupUploader', 'accountBalanceUploader', 'otelCollector']

export class ProfileManager {
  /**
   * @param {Logger} logger - an instance of core/Logger
   * @param {ConfigManager} configManager - an instance of core/ConfigManager
   * @param {string} cacheDir - cache directory where the values file will be written. A yaml file named <profileName>.yaml is created.
   */
  constructor (logger, configManager, cacheDir = constants.SOLO_VALUES_DIR) {
    if (!logger) throw new MissingArgumentError('An instance of core/Logger is required')
    if (!configManager) throw new MissingArgumentError('An instance of core/ConfigManager is required')

    this.logger = logger
    this.configManager = configManager

    /** @type {Map<string, Object>} */
    this.profiles = new Map()

    cacheDir = path.resolve(cacheDir)
    this.cacheDir = cacheDir
  }

  /**
   * @param {boolean} [forceReload]
   * @returns {Map<string, Object>}
   */
  loadProfiles (forceReload = false) {
    const profileFile = this.configManager.getFlag(flags.profileFile)
    if (!profileFile) throw new MissingArgumentError('profileFile is required')

    // return the cached value as quickly as possible
    if (this.profiles && this.profileFile === profileFile && !forceReload) {
      return this.profiles
    }

    if (!fs.existsSync(profileFile)) throw new IllegalArgumentError(`profileFile does not exist: ${profileFile}`)

    // load profile file
    this.profiles = new Map()
    const yamlData = fs.readFileSync(profileFile, 'utf8')
    const profileItems = yaml.load(yamlData)

    // add profiles
    for (const key in profileItems) {
      let profile = profileItems[key]
      profile = profile || {}
      this.profiles.set(key, profile)
    }

    this.profileFile = profileFile
    return this.profiles
  }

  /**
   * @param {string} profileName
   * @returns {Object}
   */
  getProfile (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')
    if (!this.profiles || this.profiles.size <= 0) {
      this.loadProfiles()
    }

    if (!this.profiles || !this.profiles.has(profileName)) throw new IllegalArgumentError(`Profile does not exists with name: ${profileName}`)
    return this.profiles.get(profileName)
  }

  /**
   * Set value in the yaml object
   * @param {string} itemPath - item path in the yaml
   * @param {*} value - value to be set
   * @param {Object} yamlRoot - root of the yaml object
   * @returns {Object}
   * @private
   */
  _setValue (itemPath, value, yamlRoot) {
    // find the location where to set the value in the yaml
    const itemPathParts = itemPath.split('.')
    let parent = yamlRoot
    let current = parent
    let prevItemPath = ''
    for (let itemPathPart of itemPathParts) {
      if (helpers.isNumeric(itemPathPart)) {
        itemPathPart = Number.parseInt(itemPathPart) // numeric path part can only be array index i.e. an integer
        if (!Array.isArray(parent[prevItemPath])) {
          parent[prevItemPath] = []
        }

        if (!parent[prevItemPath][itemPathPart]) {
          parent[prevItemPath][itemPathPart] = {}
        }

        parent = parent[prevItemPath]
        prevItemPath = itemPathPart
        current = parent[itemPathPart]
      } else {
        if (!current[itemPathPart]) {
          current[itemPathPart] = {}
        }

        parent = current
        prevItemPath = itemPathPart
        current = parent[itemPathPart]
      }
    }

    parent[prevItemPath] = value
    return yamlRoot
  }

  /**
   * Set items for the chart
   * @param {string} itemPath - item path in the yaml, if empty then root of the yaml object will be used
   * @param {*} items - the element object
   * @param {Object} yamlRoot - root of the yaml object to update
   * @private
   */
  _setChartItems (itemPath, items, yamlRoot) {
    if (!items) return

    const dotItems = dot.dot(items)

    for (const key in dotItems) {
      if (itemPath) {
        this._setValue(`${itemPath}.${key}`, dotItems[key], yamlRoot)
      } else {
        this._setValue(key, dotItems[key], yamlRoot)
      }
    }
  }

  /**
   * @param {Object} profile
   * @param {string[]} nodeIds
   * @param {Object} yamlRoot
   * @returns {Object}
   */
  resourcesForConsensusPod (profile, nodeIds, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')

    const accountMap = getNodeAccountMap(nodeIds)

    // set consensus pod level resources
    for (let nodeIndex = 0; nodeIndex < nodeIds.length; nodeIndex++) {
      this._setValue(`hedera.nodes.${nodeIndex}.name`, nodeIds[nodeIndex], yamlRoot)
      this._setValue(`hedera.nodes.${nodeIndex}.accountId`, accountMap.get(nodeIds[nodeIndex]), yamlRoot)
      this._setChartItems(`hedera.nodes.${nodeIndex}`, profile.consensus, yamlRoot)
    }

    const stagingDir = Templates.renderStagingDir(
      this.configManager.getFlag(flags.cacheDir),
      this.configManager.getFlag(flags.releaseTag)
    )

    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true })
    }

    const configTxtPath = this.prepareConfigTxt(
      this.configManager.getFlag(flags.namespace),
      accountMap,
      stagingDir,
      this.configManager.getFlag(flags.releaseTag),
      this.configManager.getFlag(flags.app),
      this.configManager.getFlag(flags.chainId))

    for (const flag of flags.nodeConfigFileFlags.values()) {
      const filePath = this.configManager.getFlag(flag)
      if (!filePath) {
        throw new FullstackTestingError(`Configuration file path is missing for: ${flag.name}`)
      }

      const fileName = path.basename(filePath)
      const destPath = path.join(stagingDir, 'templates', fileName)
      this.logger.debug(`Copying configuration file to staging: ${filePath} -> ${destPath}`)

      fs.cpSync(filePath, destPath, { force: true })
    }

    this._setFileContentsAsValue('hedera.configMaps.configTxt', configTxtPath, yamlRoot)
    this._setFileContentsAsValue('hedera.configMaps.log4j2Xml', path.join(stagingDir, 'templates', 'log4j2.xml'), yamlRoot)
    this._setFileContentsAsValue('hedera.configMaps.settingsTxt', path.join(stagingDir, 'templates', 'settings.txt'), yamlRoot)
    this._setFileContentsAsValue('hedera.configMaps.applicationProperties', path.join(stagingDir, 'templates', 'application.properties'), yamlRoot)
    this._setFileContentsAsValue('hedera.configMaps.apiPermissionsProperties', path.join(stagingDir, 'templates', 'api-permission.properties'), yamlRoot)
    this._setFileContentsAsValue('hedera.configMaps.bootstrapProperties', path.join(stagingDir, 'templates', 'bootstrap.properties'), yamlRoot)
    if (this.configManager.getFlag(flags.applicationEnv)) {
      this._setFileContentsAsValue('hedera.configMaps.applicationEnv', this.configManager.getFlag(flags.applicationEnv), yamlRoot)
    }

    if (profile.consensus) {
      // set default for consensus pod
      this._setChartItems('defaults.root', profile.consensus.root, yamlRoot)

      // set sidecar resources
      for (const sidecar of consensusSidecars) {
        this._setChartItems(`defaults.sidecars.${sidecar}`, profile.consensus[sidecar], yamlRoot)
      }
    }

    return yamlRoot
  }

  /**
   * @param {Object} profile
   * @param {Object} yamlRoot
   * @returns {void}
   */
  resourcesForHaProxyPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.haproxy) return // use chart defaults

    return this._setChartItems('defaults.haproxy', profile.haproxy, yamlRoot)
  }

  /**
   * @param {Object} profile
   * @param {Object} yamlRoot
   * @returns {void}
   */
  resourcesForEnvoyProxyPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.envoyProxy) return // use chart defaults
    return this._setChartItems('defaults.envoyProxy', profile.envoyProxy, yamlRoot)
  }

  /**
   * @param {Object} profile
   * @param {Object} yamlRoot
   * @returns {void}
   */
  resourcesForHederaExplorerPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.explorer) return
    return this._setChartItems('hedera-explorer', profile.explorer, yamlRoot)
  }

  /**
   * @param {Object} profile
   * @param {Object} yamlRoot
   * @returns {Object}
   */
  resourcesForMinioTenantPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.minio || !profile.minio.tenant) return // use chart defaults

    for (const poolIndex in profile.minio.tenant.pools) {
      const pool = profile.minio.tenant.pools[poolIndex]
      for (const prop in pool) {
        if (prop !== 'resources') {
          this._setValue(`minio-server.tenant.pools.${poolIndex}.${prop}`, pool[prop], yamlRoot)
        }
      }

      this._setChartItems(`minio-server.tenant.pools.${poolIndex}`, pool, yamlRoot)
    }

    return yamlRoot
  }

  /**
   * Prepare a values file for FST Helm chart
   * @param {string} profileName resource profile name
   * @returns {Promise<string>} return the full path to the values file
   */
  prepareValuesForFstChart (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')
    const profile = this.getProfile(profileName)

    const nodeIds = helpers.parseNodeIds(this.configManager.getFlag(flags.nodeIDs))
    if (!nodeIds) throw new FullstackTestingError('Node IDs are not set in the config')

    // generate the yaml
    const yamlRoot = {}
    this.resourcesForConsensusPod(profile, nodeIds, yamlRoot)
    this.resourcesForHaProxyPod(profile, yamlRoot)
    this.resourcesForEnvoyProxyPod(profile, yamlRoot)
    this.resourcesForMinioTenantPod(profile, yamlRoot)

    // write the yaml
    const cachedValuesFile = path.join(this.cacheDir, `fst-${profileName}.yaml`)
    return new Promise((resolve, reject) => {
      fs.writeFile(cachedValuesFile, yaml.dump(yamlRoot), (err) => {
        if (err) {
          reject(err)
        }

        resolve(cachedValuesFile)
      })
    })
  }

  /**
   * @param {PathLike|FileHandle} applicationPropertiesPath
   * @returns {Promise<void>}
   */
  async bumpHederaConfigVersion (applicationPropertiesPath) {
    const lines = (await readFile(applicationPropertiesPath, 'utf-8')).split('\n')

    for (const line of lines) {
      if (line.startsWith('hedera.config.version=')) {
        const version = parseInt(line.split('=')[1]) + 1
        lines[lines.indexOf(line)] = `hedera.config.version=${version}`
        break
      }
    }

    await writeFile(applicationPropertiesPath, lines.join('\n'))
  }

  /**
   * @param {string} configTxtPath
   * @param {string} applicationPropertiesPath
   * @returns {Promise<string>}
   */
  async prepareValuesForNodeAdd (configTxtPath, applicationPropertiesPath) {
    const yamlRoot = {}
    this._setFileContentsAsValue('hedera.configMaps.configTxt', configTxtPath, yamlRoot)
    await this.bumpHederaConfigVersion(applicationPropertiesPath)
    this._setFileContentsAsValue('hedera.configMaps.applicationProperties', applicationPropertiesPath, yamlRoot)

    // write the yaml
    const cachedValuesFile = path.join(this.cacheDir, 'fst-node-add.yaml')
    return new Promise((resolve, reject) => {
      fs.writeFile(cachedValuesFile, yaml.dump(yamlRoot), (err) => {
        if (err) {
          reject(err)
        }

        resolve(cachedValuesFile)
      })
    })
  }

  /**
   * Prepare a values file for rpc-relay Helm chart
   * @param {string} profileName - resource profile name
   * @returns {Promise<string>} return the full path to the values file
   */
  prepareValuesForRpcRelayChart (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')
    const profile = this.getProfile(profileName)
    if (!profile.rpcRelay) return Promise.resolve()// use chart defaults

    // generate the yaml
    const yamlRoot = {}
    this._setChartItems('', profile.rpcRelay, yamlRoot)

    // write the yaml
    const cachedValuesFile = path.join(this.cacheDir, `rpcRelay-${profileName}.yaml`)
    return new Promise((resolve, reject) => {
      fs.writeFile(cachedValuesFile, yaml.dump(yamlRoot), (err) => {
        if (err) {
          reject(err)
        }

        resolve(cachedValuesFile)
      })
    })
  }

  /**
   * Prepare a values file for mirror-node Helm chart
   * @param {string} profileName - resource profile name
   * @returns {Promise<string>} return the full path to the values file
   */
  prepareValuesForMirrorNodeChart (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')
    const profile = this.getProfile(profileName)
    if (!profile.mirror) return Promise.resolve() // use chart defaults

    // generate the yaml
    const yamlRoot = {}
    if (profile.mirror.postgresql) {
      if (profile.mirror.postgresql.persistence) {
        this._setValue('hedera-mirror-node.postgresql.persistence.size', profile.mirror.postgresql.persistence.size, yamlRoot)
      }

      this._setChartItems('hedera-mirror-node.postgresql.postgresql', profile.mirror.postgresql.postgresql, yamlRoot)
    }

    this._setChartItems('hedera-mirror-node.importer', profile.mirror.importer, yamlRoot)
    this._setChartItems('hedera-mirror-node.rest', profile.mirror.rest, yamlRoot)
    this._setChartItems('hedera-mirror-node.web3', profile.mirror.web3, yamlRoot)
    this._setChartItems('hedera-mirror-node.grpc', profile.mirror.grpc, yamlRoot)
    this._setChartItems('hedera-mirror-node.monitor', profile.mirror.monitor, yamlRoot)
    this.resourcesForHederaExplorerPod(profile, yamlRoot)

    // write the yaml
    const cachedValuesFile = path.join(this.cacheDir, `mirror-${profileName}.yaml`)
    return new Promise((resolve, reject) => {
      fs.writeFile(cachedValuesFile, yaml.dump(yamlRoot), (err) => {
        if (err) {
          reject(err)
        }

        resolve(cachedValuesFile)
      })
    })
  }

  /**
   * Writes the contents of a file as a value for the given nested item path in the yaml object
   * @param {string} itemPath - nested item path in the yaml object to store the file contents
   * @param {string} valueFilePath - path to the file whose contents will be stored in the yaml object
   * @param {Object} yamlRoot - root of the yaml object
   * @private
   */
  _setFileContentsAsValue (itemPath, valueFilePath, yamlRoot) {
    const fileContents = fs.readFileSync(valueFilePath, 'utf8')
    this._setValue(itemPath, fileContents, yamlRoot)
  }

  /**
   * Prepares config.txt file for the node
   * @param {string} namespace - namespace where the network is deployed
   * @param {Map<string, string>} nodeAccountMap - the map of node IDs to account IDs
   * @param {string} destPath - path to the destination directory to write the config.txt file
   * @param {string} releaseTag - release tag e.g. v0.42.0
   * @param {string} [appName] - the app name (default: HederaNode.jar)
   * @param {string} [chainId] - chain ID (298 for local network)
   * @param {string} [template] - path to the config.template file
   * @returns {string} the config.txt file path
   */
  prepareConfigTxt (namespace, nodeAccountMap, destPath, releaseTag, appName = constants.HEDERA_APP_NAME, chainId = constants.HEDERA_CHAIN_ID, template = path.join(constants.RESOURCES_DIR, 'templates', 'config.template')) {
    if (!nodeAccountMap || nodeAccountMap.size === 0) throw new MissingArgumentError('nodeAccountMap the map of node IDs to account IDs is required')
    if (!template) throw new MissingArgumentError('config templatePath is required')
    if (!releaseTag) throw new MissingArgumentError('release tag is required')

    if (!fs.existsSync(destPath)) throw new IllegalArgumentError(`config destPath does not exist: ${destPath}`, destPath)
    if (!fs.existsSync(template)) throw new IllegalArgumentError(`config templatePath does not exist: ${template}`, template)

    // init variables
    const internalPort = constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT
    const externalPort = constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT
    const nodeStakeAmount = constants.HEDERA_NODE_DEFAULT_STAKE_AMOUNT

    const releaseVersion = semver.parse(releaseTag, { includePrerelease: true })

    try {
      /** @type {string[]} */
      const configLines = fs.readFileSync(template, 'utf-8').split('\n')
      configLines.push(`swirld, ${chainId}`)
      configLines.push(`app, ${appName}`)

      let nodeSeq = 0
      for (const nodeID of nodeAccountMap.keys()) {
        const nodeName = nodeID

        const internalIP = Templates.renderFullyQualifiedNetworkPodName(namespace, nodeName)
        const externalIP = Templates.renderFullyQualifiedNetworkSvcName(namespace, nodeName)

        const account = nodeAccountMap.get(nodeID)
        if (releaseVersion.minor >= 40) {
          configLines.push(`address, ${nodeSeq}, ${nodeName}, ${nodeName}, ${nodeStakeAmount}, ${internalIP}, ${internalPort}, ${externalIP}, ${externalPort}, ${account}`)
        } else {
          configLines.push(`address, ${nodeSeq}, ${nodeName}, ${nodeStakeAmount}, ${internalIP}, ${internalPort}, ${externalIP}, ${externalPort}, ${account}`)
        }

        nodeSeq += 1
      }

      if (releaseVersion.minor >= 41) {
        configLines.push(`nextNodeId, ${nodeSeq}`)
      }

      const configFilePath = path.join(destPath, 'config.txt')
      fs.writeFileSync(configFilePath, configLines.join('\n'))

      return configFilePath
    } catch (e) {
      throw new FullstackTestingError('failed to generate config.txt', e)
    }
  }
}

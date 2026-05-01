// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import * as constants from './constants.js';
import {PathEx} from '../business/utils/path-ex.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {type NodeAlias, type NodeId} from '../types/aliases.js';
import {
  type EnvironmentVariable,
  type PerNodeAdditionalValue,
  type PerNodeExtraEnvironmentOptions,
  type PerNodeExtraEnvironmentValues,
  type PerNodeIdentity,
} from '../types/helm-values.js';
import yaml from 'yaml';

export class HelmValuesHelper {
  public constructor() {}

  private buildPerNodeExtraEnvironmentValuesStructure(
    consensusNodes: ConsensusNode[],
    options: PerNodeExtraEnvironmentOptions = {},
  ): PerNodeExtraEnvironmentValues {
    const hedera: PerNodeExtraEnvironmentValues['hedera'] = {nodes: []};

    for (const [nodeIndex, consensusNode] of consensusNodes.entries()) {
      const extraEnvironmentVariables: EnvironmentVariable[] = [
        ...(options.baseExtraEnvironmentVariables?.[consensusNode.name] ?? []),
      ];

      if (options.useJavaMainClass) {
        this.setExtraEnvironmentVariable(extraEnvironmentVariables, 'JAVA_MAIN_CLASS', 'com.swirlds.platform.Browser');
      }

      if (options.wrapsEnabled && options.tss) {
        const wrapPath: string = `${constants.HEDERA_HAPI_PATH}/${options.tss.wraps.artifactsFolderName}`;
        this.setExtraEnvironmentVariable(extraEnvironmentVariables, 'TSS_LIB_WRAPS_ARTIFACTS_PATH', wrapPath);
      }

      if (options.debugNodeAlias === consensusNode.name) {
        const debugJavaOptions: string = `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:${constants.JVM_DEBUG_PORT}`;
        const javaOptionsIndex: number = extraEnvironmentVariables.findIndex(
          (environmentVariable): boolean => environmentVariable.name === 'JAVA_OPTS',
        );
        if (javaOptionsIndex === -1) {
          extraEnvironmentVariables.push({
            name: 'JAVA_OPTS',
            value: debugJavaOptions,
          });
        } else {
          extraEnvironmentVariables[javaOptionsIndex].value =
            `${debugJavaOptions} ${extraEnvironmentVariables[javaOptionsIndex].value}`.trim();
        }
      }

      if (options.additionalEnvironmentVariables && options.additionalEnvironmentVariables[consensusNode.name]) {
        for (const additionalEnvironmentVariable of options.additionalEnvironmentVariables[consensusNode.name]) {
          this.setExtraEnvironmentVariable(
            extraEnvironmentVariables,
            additionalEnvironmentVariable.name,
            additionalEnvironmentVariable.value,
          );
        }
      }

      const finalJavaOptionsIndex: number = extraEnvironmentVariables.findIndex(
        (environmentVariable): boolean => environmentVariable.name === 'JAVA_OPTS',
      );
      if (finalJavaOptionsIndex !== -1) {
        extraEnvironmentVariables[finalJavaOptionsIndex].value = this.sanitizeJavaOptionsForHeapSettings(
          extraEnvironmentVariables[finalJavaOptionsIndex].value,
        );
      }

      while (hedera.nodes.length <= nodeIndex) {
        hedera.nodes.push({});
      }

      const nodeValues: PerNodeExtraEnvironmentValues['hedera']['nodes'][number] = {};
      if (extraEnvironmentVariables.length > 0) {
        nodeValues.root = {extraEnv: extraEnvironmentVariables};
      }

      const additionalNodeValues: PerNodeAdditionalValue | undefined =
        options.additionalNodeValues?.[consensusNode.name];
      if (additionalNodeValues?.name) {
        nodeValues.name = additionalNodeValues.name;
      }
      if (typeof additionalNodeValues?.nodeId === 'number') {
        nodeValues.nodeId = additionalNodeValues.nodeId;
      }
      if (additionalNodeValues?.accountId) {
        nodeValues.accountId = additionalNodeValues.accountId;
      }
      if (additionalNodeValues?.blockNodesJson) {
        nodeValues.blockNodesJson = additionalNodeValues.blockNodesJson;
      }

      hedera.nodes[nodeIndex] = nodeValues;
    }

    return {hedera};
  }

  public generateExtraEnvironmentValuesFile(
    consensusNodes: ConsensusNode[],
    options: PerNodeExtraEnvironmentOptions = {},
    cacheDirectory: string,
  ): string {
    const perNodeExtraEnvironmentValues: PerNodeExtraEnvironmentValues =
      this.buildPerNodeExtraEnvironmentValuesStructure(consensusNodes, options);

    const filename: string = `per-node-extra-env-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`;
    const filePath: string = PathEx.join(cacheDirectory, filename);

    const yamlContent: string = yaml.stringify(perNodeExtraEnvironmentValues, {indent: 2});
    fs.writeFileSync(filePath, yamlContent);

    return filePath;
  }

  public parseValuesFilePaths(valuesArgument: string): string[] {
    const filePaths: string[] = [];
    const regex: RegExp = /--values\s+"([^"]+)"|--values\s+(\S+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(valuesArgument)) !== null) {
      filePaths.push(match[1] ?? match[2]);
    }
    return filePaths;
  }

  private parseValuesFile(filePath: string): Record<string, unknown> | undefined {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return undefined;
    }

    let parsedValues: unknown;
    try {
      parsedValues = yaml.parse(content);
    } catch {
      return undefined;
    }

    if (!parsedValues || typeof parsedValues !== 'object') {
      return undefined;
    }

    return parsedValues as Record<string, unknown>;
  }

  private readHederaNodes(valuesFilePath: string): unknown[] | undefined {
    const parsedRecord: Record<string, unknown> | undefined = this.parseValuesFile(valuesFilePath);
    if (!parsedRecord) {
      return undefined;
    }

    const hederaSection: unknown = parsedRecord.hedera;
    if (!hederaSection || typeof hederaSection !== 'object') {
      return undefined;
    }

    const nodesArray: unknown = (hederaSection as Record<string, unknown>).nodes;
    if (!Array.isArray(nodesArray)) {
      return undefined;
    }

    return nodesArray;
  }

  public extractExtraEnvironmentFromValuesFiles(
    filePaths: string[],
    consensusNodes: ConsensusNode[],
  ): Record<NodeAlias, EnvironmentVariable[]> {
    const result: Record<NodeAlias, EnvironmentVariable[]> = {};

    for (const filePath of filePaths) {
      const parsedRecord: Record<string, unknown> | undefined = this.parseValuesFile(filePath);
      if (!parsedRecord) {
        continue;
      }

      const defaultsSection: unknown = parsedRecord.defaults;
      if (defaultsSection && typeof defaultsSection === 'object') {
        const defaultsRootSection: unknown = (defaultsSection as Record<string, unknown>).root;
        const defaultsEnvironmentVariables: EnvironmentVariable[] =
          this.extractExtraEnvironmentArray(defaultsRootSection);
        if (defaultsEnvironmentVariables.length > 0) {
          for (const consensusNode of consensusNodes) {
            this.mergeIntoResult(result, consensusNode.name, defaultsEnvironmentVariables);
          }
        }
      }

      const hederaSection: unknown = parsedRecord.hedera;
      if (!hederaSection || typeof hederaSection !== 'object') {
        continue;
      }

      const nodesArray: unknown = (hederaSection as Record<string, unknown>).nodes;
      if (!Array.isArray(nodesArray)) {
        continue;
      }

      for (const [helmNodeIndex, consensusNode] of consensusNodes.entries()) {
        const nodeEntry: unknown = nodesArray[helmNodeIndex];
        if (!nodeEntry || typeof nodeEntry !== 'object') {
          continue;
        }
        const nodeRootSection: unknown = (nodeEntry as Record<string, unknown>).root;
        const nodeEnvironmentVariables: EnvironmentVariable[] = this.extractExtraEnvironmentArray(nodeRootSection);
        if (nodeEnvironmentVariables.length > 0) {
          this.mergeIntoResult(result, consensusNode.name, nodeEnvironmentVariables);
        }
      }
    }

    return result;
  }

  public extractPerNodeBlockNodesJsonFromValuesFile(
    valuesFilePath: string,
    consensusNodes: ConsensusNode[],
  ): Record<NodeAlias, string> {
    const result: Record<NodeAlias, string> = {};

    const nodesArray: unknown[] | null = this.readHederaNodes(valuesFilePath);
    if (!nodesArray) {
      return result;
    }

    for (const [helmNodeIndex, consensusNode] of consensusNodes.entries()) {
      const nodeEntry: unknown = nodesArray[helmNodeIndex];
      if (!nodeEntry || typeof nodeEntry !== 'object') {
        continue;
      }
      const blockNodesJson: unknown = (nodeEntry as Record<string, unknown>).blockNodesJson;
      if (typeof blockNodesJson === 'string') {
        result[consensusNode.name] = blockNodesJson;
      }
    }

    return result;
  }

  public extractPerNodeIdentityFromValuesFile(
    valuesFilePath: string,
    consensusNodes: ConsensusNode[],
  ): Record<NodeAlias, PerNodeIdentity> {
    const result: Record<NodeAlias, PerNodeIdentity> = {};

    const nodesArray: unknown[] | null = this.readHederaNodes(valuesFilePath);
    if (!nodesArray) {
      return result;
    }

    for (const [helmNodeIndex, consensusNode] of consensusNodes.entries()) {
      const nodeEntry: unknown = nodesArray[helmNodeIndex];
      if (!nodeEntry || typeof nodeEntry !== 'object') {
        continue;
      }
      const entry: Record<string, unknown> = nodeEntry as Record<string, unknown>;
      const identity: PerNodeIdentity = {};
      if (typeof entry.name === 'string') {
        identity.name = entry.name as NodeAlias;
      }
      if (typeof entry.nodeId === 'number') {
        identity.nodeId = entry.nodeId as NodeId;
      } else if (typeof entry.nodeId === 'string') {
        const parsed: number = Number.parseInt(entry.nodeId, 10);
        if (!Number.isNaN(parsed)) {
          identity.nodeId = parsed as NodeId;
        }
      }
      if (typeof entry.accountId === 'string') {
        identity.accountId = entry.accountId;
      }
      result[consensusNode.name] = identity;
    }

    return result;
  }

  private sanitizeJavaOptionsForHeapSettings(javaOptions: string): string {
    return javaOptions
      .replaceAll(/(^|\s)-Xms\s*\S+/g, '$1')
      .replaceAll(/(^|\s)-Xmx\s*\S+/g, '$1')
      .replaceAll(/\s+/g, ' ')
      .trim();
  }

  private setExtraEnvironmentVariable(
    extraEnvironmentVariables: EnvironmentVariable[],
    name: string,
    value: string,
  ): void {
    const environmentVariableIndex: number = extraEnvironmentVariables.findIndex(
      (environmentVariable): boolean => environmentVariable.name === name,
    );
    if (environmentVariableIndex === -1) {
      extraEnvironmentVariables.push({name, value});
    } else {
      extraEnvironmentVariables[environmentVariableIndex].value = value;
    }
  }

  private mergeIntoResult(
    result: Record<NodeAlias, EnvironmentVariable[]>,
    nodeAlias: NodeAlias,
    environmentVariables: EnvironmentVariable[],
  ): void {
    if (!result[nodeAlias]) {
      result[nodeAlias] = [];
    }
    for (const environmentVariable of environmentVariables) {
      const existingIndex: number = result[nodeAlias].findIndex(
        (variable: EnvironmentVariable): boolean => variable.name === environmentVariable.name,
      );
      const environmentVariableClone: EnvironmentVariable = {...environmentVariable};
      if (existingIndex === -1) {
        result[nodeAlias].push(environmentVariableClone);
      } else {
        result[nodeAlias][existingIndex] = environmentVariableClone;
      }
    }
  }

  private extractExtraEnvironmentArray(rootSection: unknown): EnvironmentVariable[] {
    if (!rootSection || typeof rootSection !== 'object') {
      return [];
    }
    const extraEnvironmentArray: unknown = (rootSection as Record<string, unknown>).extraEnv;
    if (!Array.isArray(extraEnvironmentArray)) {
      return [];
    }
    const environmentVariables: EnvironmentVariable[] = [];
    for (const entry of extraEnvironmentArray) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const entryRecord: Record<string, unknown> = entry as Record<string, unknown>;
      if (typeof entryRecord.name !== 'string' || typeof entryRecord.value !== 'string') {
        continue;
      }
      environmentVariables.push({name: entryRecord.name, value: entryRecord.value});
    }
    return environmentVariables;
  }
}

export const helmValuesHelper: HelmValuesHelper = new HelmValuesHelper();

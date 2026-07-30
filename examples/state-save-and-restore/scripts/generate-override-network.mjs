#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';

class OverrideNetworkGenerator {
  static main() {
    const argumentsMap = this.parseArguments(process.argv.slice(2));
    const sourceNetworkPath = this.requireArgument(argumentsMap, 'source-network');
    const servicesJsonPath = this.requireArgument(argumentsMap, 'services-json');
    const nodeAliasesText = this.requireArgument(argumentsMap, 'node-aliases');
    const outputPath = this.requireArgument(argumentsMap, 'output');
    const sourceNetwork = JSON.parse(fs.readFileSync(sourceNetworkPath, 'utf8'));
    const servicesDocument = JSON.parse(fs.readFileSync(servicesJsonPath, 'utf8'));
    const nodeAliases = nodeAliasesText
      .split(',')
      .map(nodeAlias => nodeAlias.trim())
      .filter(nodeAlias => nodeAlias.length > 0);

    if (!Array.isArray(sourceNetwork.nodeMetadata)) {
      throw new Error('source network JSON is missing nodeMetadata');
    }

    if (!Array.isArray(servicesDocument.items)) {
      throw new Error('services JSON is missing items');
    }

    if (sourceNetwork.nodeMetadata.length < nodeAliases.length) {
      throw new Error(
        `source network only has ${String(sourceNetwork.nodeMetadata.length)} nodeMetadata entries for ${String(nodeAliases.length)} aliases`,
      );
    }

    const rewrittenNetwork = structuredClone(sourceNetwork);
    let changedEndpointCount = 0;

    for (const [nodeIndex, nodeAlias] of nodeAliases.entries()) {
      const serviceName = `network-${nodeAlias}-svc`;
      const service = servicesDocument.items.find(candidateService => candidateService?.metadata?.name === serviceName);

      if (!service) {
        throw new Error(`service not found in services JSON: ${serviceName}`);
      }

      const clusterIpAddress = service?.spec?.clusterIP;
      if (typeof clusterIpAddress !== 'string' || clusterIpAddress.length === 0 || clusterIpAddress === 'None') {
        throw new Error(`service ${serviceName} does not have a usable clusterIP`);
      }

      const encodedIpAddress = this.encodeIpv4Address(clusterIpAddress);
      const nodeMetadata = rewrittenNetwork.nodeMetadata[nodeIndex];
      changedEndpointCount += this.rewriteNodeServiceEndpoints(nodeMetadata, encodedIpAddress, clusterIpAddress, serviceName);
    }

    if (changedEndpointCount === 0) {
      throw new Error('override-network.json was not changed; this would not test endpoint remapping');
    }

    fs.writeFileSync(outputPath, `${JSON.stringify(rewrittenNetwork, null, 2)}\n`);
    console.log(`Wrote ${outputPath} with ${String(changedEndpointCount)} rewritten endpoint entries`);
  }

  static parseArguments(argumentList) {
    const argumentsMap = new Map();

    for (let argumentIndex = 0; argumentIndex < argumentList.length; argumentIndex += 1) {
      const argument = argumentList[argumentIndex];
      if (!argument.startsWith('--')) {
        throw new Error(`Unexpected argument: ${argument}`);
      }

      const argumentName = argument.slice(2);
      const argumentValue = argumentList[argumentIndex + 1];
      if (!argumentValue || argumentValue.startsWith('--')) {
        throw new Error(`Missing value for --${argumentName}`);
      }

      argumentsMap.set(argumentName, argumentValue);
      argumentIndex += 1;
    }

    return argumentsMap;
  }

  static requireArgument(argumentsMap, argumentName) {
    const argumentValue = argumentsMap.get(argumentName);
    if (!argumentValue) {
      throw new Error(`Missing required argument --${argumentName}`);
    }
    return argumentValue;
  }

  static encodeIpv4Address(ipAddressText) {
    const octets = ipAddressText.split('.').map(octetText => Number(octetText));

    if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      throw new Error(`Only IPv4 addresses are supported, got: ${ipAddressText}`);
    }

    return Buffer.from(octets).toString('base64');
  }

  static rewriteNodeServiceEndpoints(nodeMetadata, encodedIpAddress, clusterIpAddress, serviceName) {
    if (!nodeMetadata || typeof nodeMetadata !== 'object') {
      throw new Error('nodeMetadata entry is missing or invalid');
    }

    return this.rewriteServiceEndpointList(nodeMetadata?.node, encodedIpAddress, clusterIpAddress, serviceName);
  }

  static rewriteServiceEndpointList(parentObject, encodedIpAddress, clusterIpAddress, serviceName) {
    if (!parentObject || typeof parentObject !== 'object') {
      throw new Error(`node metadata is missing for ${serviceName}`);
    }

    const serviceEndpoints = parentObject.serviceEndpoint;
    if (!Array.isArray(serviceEndpoints) || serviceEndpoints.length === 0) {
      throw new Error(`node is missing serviceEndpoint entries for ${serviceName}`);
    }

    let changedEndpointCount = 0;

    parentObject.serviceEndpoint = serviceEndpoints.map(serviceEndpoint => {
      const rewrittenEndpoint = {...serviceEndpoint};
      const existingIpAddress = rewrittenEndpoint.ipAddressV4;

      rewrittenEndpoint.ipAddressV4 = encodedIpAddress;

      const endpointChanged = existingIpAddress !== encodedIpAddress;
      if (endpointChanged) {
        changedEndpointCount += 1;
      }

      return rewrittenEndpoint;
    });

    console.log(`Updated service endpoints for ${serviceName} -> ${clusterIpAddress}`);
    return changedEndpointCount;
  }
}

try {
  OverrideNetworkGenerator.main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}

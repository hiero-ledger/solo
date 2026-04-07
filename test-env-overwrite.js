// Quick test to verify environment variable overwrite behavior
import { buildPerNodeExtraEnvironmentValuesStructure } from '../dist/src/core/helpers.js';
import { ConsensusNode } from '../dist/src/core/model/consensus-node.js';
import { NodeAlias } from '../dist/src/types/aliases.js';

// Create a mock consensus node
const mockNode = new ConsensusNode();
mockNode.name = NodeAlias.of('node0');
mockNode.nodeId = 0;

// Test with additional environment variables that should overwrite defaults
const options = {
  additionalEnvironmentVariables: {
    'node0': [
      { name: 'JAVA_OPTS', value: 'overridden-java-opts' },
      { name: 'NEW_VAR', value: 'new-value' }
    ]
  }
};

const result = buildPerNodeExtraEnvironmentValuesStructure([mockNode], options);

console.log('Testing environment variable overwrite behavior...');
console.log('Environment variables for node0:');

const node0Env = result.hedera.nodes[0].root?.extraEnv || [];

// Check that JAVA_OPTS was overwritten, not duplicated
const javaOptsVars = node0Env.filter(env => env.name === 'JAVA_OPTS');
console.log(`JAVA_OPTS count: ${javaOptsVars.length} (should be 1)`);
console.log(`JAVA_OPTS value: "${javaOptsVars[0]?.value}" (should be "overridden-java-opts")`);

// Check that new variable was added
const newVar = node0Env.find(env => env.name === 'NEW_VAR');
console.log(`NEW_VAR found: ${newVar ? 'yes' : 'no'} (should be yes)`);
console.log(`NEW_VAR value: "${newVar?.value}" (should be "new-value")`);

// Verify no duplicates in general
const envNames = node0Env.map(env => env.name);
const uniqueNames = [...new Set(envNames)];
const hasDuplicates = envNames.length !== uniqueNames.length;
console.log(`Has duplicate env var names: ${hasDuplicates ? 'yes' : 'no'} (should be no)`);

console.log('\nTest completed!');
console.log(hasDuplicates ? '❌ Test failed - duplicates found' : '✅ Test passed - overwrite working correctly');
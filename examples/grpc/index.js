import {
  Client,
  PrivateKey,
  AccountId,
  NodeUpdateTransaction,
  ServiceEndpoint,
} from "@hashgraph/sdk";
import Long from "long";
import dotenv from "dotenv";

dotenv.config();

const operatorId = AccountId.fromString('0.0.2');

const operatorKey = PrivateKey.fromStringED25519("302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137");
// todo test with the envoy
const client = Client
  .forNetwork({"127.0.0.1:8080": AccountId.fromString(`0.0.3`)})
  .setOperator(operatorId, operatorKey);

const grpcWebProxyEndpoint = new ServiceEndpoint()
  .setIpAddressV4(Uint8Array.of(127, 0, 0, 1))
  .setPort(8080);

const updateTransaction = new NodeUpdateTransaction()
  .setNodeId(Long.fromString('0.0.3'))
  .setGrpcWebProxyEndpoint(grpcWebProxyEndpoint)

const updateTransactionResponse = await updateTransaction.execute(client);

const updateTransactionReceipt = await updateTransactionResponse.getReceipt(client);

console.log(`Node update transaction status: ${updateTransactionReceipt.status.toString()}`,);

client.close();

const response = await fetch('http://localhost:5551/api/v1/network/nodes')

const nodesData = await response.json()

console.log(nodesData)

// const network = {}
// for (const node of nodesData.nodes) {
//   const address = node.grpc_proxy_endpoint
//   const accountId = node.node_id
//   network[address] = AccountId.fromString(accountId)
// }
//
// // Step 3: Set operator and initialize client
// const operatorId = AccountId.fromString('0.0.1234') // replace with your operator
// const operatorKey = PrivateKey.fromString('302e...') // replace with your private key
//
// const client = Client.forNetwork(network).setOperator(operatorId, operatorKey)

// SPDX-License-Identifier: Apache-2.0

// Preloaded (NODE_OPTIONS=--require) into the hedera-smart-contracts ERC-20 smoke test.
//
// hardhat-ethers' signer.sendTransaction() polls eth_getTransactionByHash in a promise that
// nothing waits on: if one lookup throws instead of returning null, the error is lost and
// sendTransaction() never finishes, so the test hangs until the mocha timeout with no
// further RPC traffic.
//
// Relays before 0.81.0 trigger exactly that: while the mirror node has indexed a transaction's
// logs but not yet its contract result, they answer with a synthetic transaction whose r/s are
// "0x", which ethers cannot parse ("Cannot convert 0x to a BigInt"). Treat a lookup that cannot
// be parsed as "not found yet" so the poll retries until the real transaction is available.
//
// See https://github.com/hiero-ledger/solo/issues/6428

let providerModulePath;
try {
  providerModulePath = require.resolve('@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider', {
    paths: [process.cwd()],
  });
} catch {
  // Not running inside the hedera-smart-contracts checkout (e.g. the npm wrapper process), nothing to patch.
  providerModulePath = undefined;
}

if (providerModulePath) {
  const {HardhatEthersProvider} = require(providerModulePath);
  const getTransaction = HardhatEthersProvider.prototype.getTransaction;

  HardhatEthersProvider.prototype.getTransaction = async function (hash) {
    try {
      return await getTransaction.call(this, hash);
    } catch (error) {
      console.warn(
        `eth_getTransactionByHash(${hash}) could not be used, polling again: ` + (error.shortMessage ?? error.message),
      );
      return null;
    }
  };
}

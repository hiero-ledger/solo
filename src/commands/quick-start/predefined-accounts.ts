// SPDX-License-Identifier: Apache-2.0

import {type AccountId, Hbar, HbarUnit, PrivateKey} from '@hiero-ledger/sdk';

export type PredefinedAccount = {
  privateKey: PrivateKey;
  alias: boolean;
  balance?: Hbar;
  group: 'ed25519' | 'ecdsa' | 'ecdsa-alias';
};

export type CreatedPredefinedAccount = {
  accountId: AccountId;
  data: PredefinedAccount;
  alias?: string;
};

const defaultBalance: Hbar = Hbar.from(10_000, HbarUnit.Hbar);

const ecdsaKeys: string[] = [
  '0x2c55a65b9ae99b5aee790f3f07634896627a26c9fd8460c97058b32579684b60',
  '0x0e2161b2e6f2d801ef364042e6c0792aa10e07fa38680de06d4db0036c44f4b6',
  '0x30173710e439883b329042c1a5e15b0e982a2caf3e9c7e93e3c88b953addd651',
  '0x3ee101ae0556279500bcb276d80db192ffe7a36d9a3e5530dcdc9ba30c88f96c',
  '0x755c4df6c25868d47d734a2567cc2b40e23cc6b042ae9c1e9906750fadb715fa',
  '0xf5ca2d9f83c42f37091b0b28536f95bbfaca637f3eca99491184c6bf893897ec',
  '0xc1e9e486450d8f2a7f6a211ae8e9fce9b9807f593fe853fe1a29a2204907d946',
  '0x5881aa6c3af348248c4a18d5fa876dd973c5308f2fb818dbb857e742d9dbfa6d',
  '0x28f6c9477a68e7082d4bae82a1333acdf90463e3a33cef9eec45500d449a855a',
  '0x1e3cc555262836a8b19fe0d42dc597f61299ab08a916df31d0bc0a4286e3969b',
];

const ecdsaAliasKeys: string[] = [
  '0x105d050185ccb907fba04dd92d8de9e32c18305e097ab41dadda21489a211524',
  '0x2e1d968b041d84dd120a5860cee60cd83f9374ef527ca86996317ada3d0d03e7',
  '0x45a5a7108a18dd5013cf2d5857a28144beadc9c70b3bdbd914e38df4e804b8d8',
  '0x6e9d61a325be3f6675cf8b7676c70e4a004d2308e3e182370a41f5653d52c6bd',
  '0x0b58b1bd44469ac9f813b5aeaf6213ddaea26720f0b2f133d08b6f234130a64f',
  '0x95eac372e0f0df3b43740fa780e62458b2d2cc32d6a440877f1cc2a9ad0c35cc',
  '0x6c6e6727b40c8d4b616ab0d26af357af09337299f09c66704146e14236972106',
  '0x5072e7aa1b03f531b4731a32a021f6a5d20d5ddc4e55acbb71ae202fc6f3a26d',
  '0x60fe891f13824a2c1da20fb6a14e28fa353421191069ba6b6d09dd6c29b90eff',
  '0xeae4e00ece872dd14fb6dc7a04f390563c7d69d16326f2a703ec8e0934060cc7',
];

const ed25519Keys: string[] = [
  '0x44162cd9b9a2f5582bd13b43cfd8be3bc20b8a81ee77f6bf77391598bcfbae4c',
  '0x50426a7375c3e033608e48a62db7bb8da8be27dc1c9034c5961a1ad15545c3d2',
  '0x28c014594a9dad332bf2fb50fb2aaeca8553fc5c7b48fe06494db6d682cac365',
  '0xb297f0babbf300340fece9985ecf1e9d9b6a2e862043d439075cc88e042760cf',
  '0xe253b897329ef661bbf9af82f669519ce567b69ccc5ae5fead06258ccd1c7cb3',
  '0x2acb0b3ed8ca6af74edb24078d88901a311f735e25df13ce9494579838345a74',
  '0x1a0afad1f38f10514afa5698706cdd19db7ec8e345a416dd66826dd039824ada',
  '0x0d758d68de1c88a785e38b5d23c9459137dd5ae2b79c89b570307f5d35d5039e',
  '0x80bb2f571d08f301f0b4b651c0d249bff6db6c7b727afe74bc8b9b3f0ad11579',
  '0xd26a61159018a3c9824388368cb4ecae278f9244724fd93ecb965fc7e2d9808e',
];

export const PREDEFINED_ACCOUNT_GROUPS: Record<string, string> = {
  ECDSA: 'ecdsa',
  ECDSA_ALIAS: 'ecdsa-alias',
  ED25519: 'ed25519',
};

export const predefinedEcdsaAccounts: PredefinedAccount[] = ecdsaKeys.map((key: string): PredefinedAccount => {
  return {
    group: PREDEFINED_ACCOUNT_GROUPS.ECDSA,
    balance: defaultBalance,
    privateKey: PrivateKey.fromStringECDSA(key),
    alias: false,
  } as PredefinedAccount;
});

export const predefinedEcdsaAccountsWithAlias: PredefinedAccount[] = ecdsaAliasKeys.map(
  (key: string): PredefinedAccount => {
    return {
      group: PREDEFINED_ACCOUNT_GROUPS.ECDSA_ALIAS,
      balance: defaultBalance,
      privateKey: PrivateKey.fromStringECDSA(key),
      alias: true,
    } as PredefinedAccount;
  },
);

export const predefinedEd25519Accounts: PredefinedAccount[] = ed25519Keys.map((key: string): PredefinedAccount => {
  return {
    group: PREDEFINED_ACCOUNT_GROUPS.ED25519,
    balance: defaultBalance,
    privateKey: PrivateKey.fromStringED25519(key),
    alias: false,
  } as PredefinedAccount;
});

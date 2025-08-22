> 📝 Solo has a new quick-start command!  check it out: [Solo User Guide](https://solo.hiero.org/v0.41.0/docs/step-by-step-guide/#quick-start-deployment), [Solo CLI Commands](https://solo.hiero.org/v0.41.0/docs/solo-commands/#quick-start-single)

# Solo

[![NPM Version](https://img.shields.io/npm/v/%40hashgraph%2Fsolo?logo=npm)](https://www.npmjs.com/package/@hashgraph/solo)
[![GitHub License](https://img.shields.io/github/license/hiero-ledger/solo?logo=apache\&logoColor=red)](LICENSE)
![node-lts](https://img.shields.io/node/v-lts/%40hashgraph%2Fsolo)
[![Build Application](https://github.com/hiero-ledger/solo/actions/workflows/flow-build-application.yaml/badge.svg)](https://github.com/hiero-ledger/solo/actions/workflows/flow-build-application.yaml)
[![Codacy Grade](https://app.codacy.com/project/badge/Grade/78539e1c1b4b4d4d97277e7eeeab9d09)](https://app.codacy.com/gh/hiero-ledger/solo/dashboard?utm_source=gh\&utm_medium=referral\&utm_content=\&utm_campaign=Badge_grade)
[![Codacy Coverage](https://app.codacy.com/project/badge/Coverage/78539e1c1b4b4d4d97277e7eeeab9d09)](https://app.codacy.com/gh/hiero-ledger/solo/dashboard?utm_source=gh\&utm_medium=referral\&utm_content=\&utm_campaign=Badge_coverage)
[![codecov](https://codecov.io/gh/hashgraph/solo/graph/badge.svg?token=hBkQdB1XO5)](https://codecov.io/gh/hashgraph/solo)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/hiero-ledger/solo/badge)](https://scorecard.dev/viewer/?uri=github.com/hiero-ledger/solo)
[![CII Best Practices](https://bestpractices.coreinfrastructure.org/projects/10697/badge)](https://bestpractices.coreinfrastructure.org/projects/10697)

An opinionated CLI tool to deploy and manage standalone test networks.

## Releases and Requirements

Solo releases are supported for one month after their release date, after which they are no longer maintained.
It is recommended to upgrade to the latest version to benefit from new features and improvements.
Every quarter a version will be designated as LTS (Long-Term Support) and will be supported for three months.

### Current Releases

| Solo Version | Node.js                   | Kind       | Solo Chart | Hedera    | Kubernetes | Kubectl    | Helm    | k9s        | Docker Resources         | Release Date | End of Support |
|--------------|---------------------------|------------|------------|-----------|------------|------------|---------|------------|--------------------------|--------------|----------------|
| 0.43.0       | >= 20.18.0 (lts/iron)     | >= v0.26.0 | v0.54.5    | v0.63.9+  | >= v1.27.3 | >= v1.27.3 | v3.14.2 | >= v0.27.4 | Memory >= 12GB, CPU >= 4 | 2025-08-15   | 2025-09-15     |
| 0.42.0 (LTS) | >= 20.18.0 (lts/iron)     | >= v0.26.0 | v0.54.5    | v0.63.9+  | >= v1.27.3 | >= v1.27.3 | v3.14.2 | >= v0.27.4 | Memory >= 12GB, CPU >= 4 | 2025-08-11   | 2025-11-11     |

To see a list of legacy releases, please check the [legacy versions documentation page](docs/legacy-versions.md).

### Hardware Requirements

To run a one-node network, you will need to set up Docker Desktop with at least 12GB of memory and 4 CPUs.

![alt text](images/docker-desktop.png)

## Setup

* Install [Node](https://nodejs.org/en/download). You may also use [nvm](https://github.com/nvm-sh/nvm) to manage different Node versions locally, some examples:

```
# install specific nodejs version
# nvm install <version>

# install nodejs version 20.18.0
nvm install v20.18.0

# lists available node versions already installed
nvm ls

# switch to selected node version
# nvm use <version>
nvm use v20.18.0

```

* Useful tools:
  * Install [kubectl](https://kubernetes.io/docs/tasks/tools/)
  * Install [k9s](https://k9scli.io/)

## Install Solo

* Run `npm install -g @hashgraph/solo`

## Documentation

[Getting Started](https://solo.hiero.org/)

## Contributing

Contributions are welcome. Please see the [contributing guide](https://github.com/hiero-ledger/.github/blob/main/CONTRIBUTING.md) to see how you can get involved.

## Code of Conduct

This project is governed by the [Contributor Covenant Code of Conduct](https://github.com/hiero-ledger/.github/blob/main/CODE_OF_CONDUCT.md). By participating, you are
expected to uphold this code of conduct.

## License

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)


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

## Releases

Solo releases are supported for one month after their release date. Upgrade to the latest version to benefit from new features and improvements. Every quarter a version is designated as LTS (Long-Term Support) and supported for three months.

### Current Releases

| Solo Version | Hedera   | Release Date | End of Support |
|--------------|----------|--------------|----------------|
| 0.53.0       | v0.67.2+ | 2026-01-15   | 2026-02-15     |
| 0.52.0 (LTS) | v0.67.2+ | 2025-12-11   | 2026-03-11     |
| 0.50.0 (LTS) | v0.66.0+ | 2025-11-13   | 2026-02-13     |
| 0.48.0 (LTS) | v0.66.0+ | 2025-10-24   | 2026-01-24     |

For legacy releases, see [legacy versions](docs/legacy-versions.md).

### Hardware Requirements

Docker Desktop with at least **12GB of memory** and **6 CPU cores**.

![Docker Desktop Settings](images/docker-desktop.png)

## Installation

### macOS (Recommended)

Install Solo and all dependencies with Homebrew:

```bash
brew install solo
```

This installs Solo along with Node.js, kubectl, Helm, and Kind.

### Windows (WSL2) and Linux

1. Install [Homebrew](https://brew.sh/)
2. Install Solo via Homebrew:
   ```bash
   brew install solo
   ```
3. Install [kubectl](https://kubernetes.io/docs/tasks/tools/) separately (required for WSL2/Linux)

### Alternative: npm

If you prefer to manage dependencies manually:

```bash
npm install -g @hashgraph/solo
```

Required dependencies: Node.js >= 22.0.0, kubectl, Helm, and Kind.

## Documentation
If you have installed solo we recommend starting your docs journey at the one-shot network deployment command you can find here:
[solo docs](https://solo.hiero.org/main/docs/step-by-step-guide/#one-shot-deployment))

## Contributing

Contributions are welcome. Please see the [contributing guide](https://github.com/hiero-ledger/.github/blob/main/CONTRIBUTING.md) to see how you can get involved.

## Code of Conduct

This project is governed by the [Contributor Covenant Code of Conduct](https://github.com/hiero-ledger/.github/blob/main/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code of conduct.

## License

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)


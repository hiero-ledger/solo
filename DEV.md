# How to Contribute to Solo

This document describes how to set up a local development environment and contribute to the Solo project.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial setup](#initial-setup)
- [Logs and debugging](#logs-and-debugging)
- [How to run the tests](#how-to-run-the-tests)
- [Code formatting](#code-formatting)
- [How to Update Component Versions](#how-to-update-component-versions)
- [How to Inspect the Cluster](#how-to-inspect-the-cluster)
  - [Kubectl](#kubectl)
  - [K9s (Recommended)](#k9s-recommended)
- [Pull Request Requirements](#pull-request-requirements)
  - [DCO (Developer Certificate of Origin)](#dco-developer-certificate-of-origin)
  - [Conventional Commit PR titles (required)](#conventional-commit-pr-titles-required)
  - [Additional guidelines](#additional-guidelines)

---

# Prerequisites

- **Node.js** (use the version specified in the repository, if applicable)
- **npm**
- **Docker**
- **Kubernetes** (local cluster such as kind, k3d, or equivalent)
- **task** (Taskfile runner)
- **Git**
- **K9S** (optional)

# Initial setup

1. Clone the repository:
```bash
git clone https://github.com/hiero-ledger/solo.git
cd solo
```

2. Install dependencies:

```bash
$ npm install
```

3. Install solo as a local CLI:
```bash
$ npm link
```
> *Notes*:
> - This only needs to be done once.
> - If solo already exists in your **PATH**, remove it first.
> - Alternatively, you can run commands via: `npm run solo-test -- <COMMAND> <ARGS>`

4. Run the CLI:
```bash
$ solo
```

## Logs and debugging
- Solo logs are written to:
```bash
$HOME/.solo/logs/solo.log
```

- A common debugging pattern is:
```bash
$ tail -f $HOME/.solo/logs/solo.log | jq
```

# How to run the tests

- Unit tests:
  ```bash
  $ task test
  ```

- All other Integration and E2E test tasks can be listed using
  ```bash
  $ task --list-all
  ```



# Code formatting
Before committing any changes, always run:
```bash
$ task format
```

# How to Update Component Versions
- Edit the component's version inside `/version.ts`

# How to Inspect the Cluster
When debugging, it helps to inspect resources and logs in the Kubernetes cluster.

## *Kubectl*

Common kubectl commands:
- `kubectl get pods -A`
- `kubectl get svc -A`
- `kubectl get ingress -A`
- `kubectl describe pod <pod-name> -n <namespace>`
- `kubectl logs <pod-name> -n <namespace>`

*Official Documentation*: https://kubernetes.io/docs/reference/kubectl/

## **K9S** *(Recommended)*

> **K9S** is the primary tool used by the Solo team to inspect and debug Solo deployments.

Why **K9S**:
- Terminal UI that makes it faster to navigate Kubernetes resources
- Quickly view logs, events, and descriptions
- Simple and intuitive

Start **K9s**:
```bash
$ k9s -A
```

*Official Documentation*: https://k9scli.io/topics/commands/

# Pull Request Requirements
## DCO (Developer Certificate of Origin)

DCO sign-off is required for all commits. PRs with unsigned commits will fail checks and cannot be merged.

Sign off commits with:
```bash
$ git commit -s -m "commit message"
```

*(Optional)* Configure Git to always add sign-off:
```bash
$ git config --global format.signoff true
```

## Conventional Commit PR titles *(required)*

Pull request titles must follow Conventional Commits.

> *Examples*:
> - `feat: add support for grpc-web fqdn endpoints`
> - `fix: correct version resolution for platform components`
> - `docs: update contributing guide`
> - `chore: bump dependency versions`

This is required for consistent release notes and changelog generation.

## Additional guidelines
- Prefer small, focused PRs that are easy to review.
- If you are unsure where to start, open a draft PR early to get feedback.
- Add description and link all related issues to the PR.

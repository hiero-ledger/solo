# Solo - Onboarding Questions

### What is Solo, and what is its goal?

Solo is an opinionated tool that empowers developers to deploy **production-like Hiero networks**, bundling the configuration, deployment, lifecycle operations, and common diagnostics.

A Solo-deployed Hiero network enables testing scenarios that are not practical, cost-effective, or even possible on public networks such as Testnet or Mainnet. This includes spinning up isolated networks on demand, running large-scale automated tests, validating infrastructure or protocol changes, and experimenting with configuration or topology.

**Solo** is designed to make Hiero network lifecycle management straightforward:
- **Create and tear** down networks quickly
- **Deploy and manage** consensus nodes
- **Deploy and manage** supporting infrastructure such as Mirror Nodes, JSON-RPC Relays, Block Nodes, Explorer, and telemetry
- **Run** repeatable and deterministic test environments backed by Kubernetes

**Solo** is intended to be used for:
- **Local development** - quickly spin up/tear down networks, run and debug custom Consensus Node builds, and iterate custom charts for Relay/Mirror/Explorer/Block Node.​
- **Private blockchain environments** - run a persistent network, manage upgrades across components, and inspect/debug network behavior.​
- **CI workflows** - bring up a clean, repeatable network in a few scripted steps to run automated tests and validate releases.

### What documentation exists, and where does it live currently?

Official documentation is hosted at:
https://solo.hiero.org/

### What technologies does Solo use, and what is it written in?

Solo is implemented in **TypeScript (ES2022)**.  It is a command-line interface that runs in Node.  It uses Helm charts and Kubernetes commands to deploy, configure, and run the Hiero network and its components.  If you are running locally and you don't want to manage your own Kubernetes cluster, it is recommended to let Solo handle it for you using Kind with Docker or Podman.

At a high level, Solo is responsible for **coordination and lifecycle management**, not for implementing Hedera components themselves.

**Core technologies:**
- TypeScript / Node.js
- Kubernetes API
- Helm (downloaded and managed by Solo)

**External Helm charts**
Solo leverages maintained Helm charts to deploy:
- Hiero consensus nodes
- Mirror Node
- JSON-RPC Relay
- Block Node
- Explorer
- Additional technologies that run in Kubernetes for proxy, ingress, telemetry, databases, etc.

**Kubernetes as the control plane**  
  Kubernetes provides execution, networking, and isolation. Solo interacts with the cluster via the Kubernetes API, enabling the same workflows on local clusters (Kind, k3d, Minikube) and remote clusters.

---

### Helpful resources

Since Solo leverages existing Helm charts, it is reasonably easy to seek help from the respective teams that are maintaining those Helm charts:

- <https://github.com/hiero-ledger/hiero-json-rpc-relay> (Smart Contract Team, @Nana)
- <https://github.com/hiero-ledger/hiero-mirror-node> ( Mirror Node Team, @Steven Sheehy )

Showcasing existing tests and how to run them: <https://github.com/hiero-ledger/solo/blob/main/DEV.md>

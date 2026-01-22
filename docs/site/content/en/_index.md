---
title: Solo
---

{{< blocks/cover title="Solo" height="min" color="primary" >}}

<div class="cover-lead text-center">
An opinionated CLI tool to deploy and manage standalone Hiero Ledger test networks locally or in the cloud
</div>

<div class="mt-5 text-center">
<a class="btn btn-lg btn-light me-3 mb-3" href="docs/solo-cli/">
  <i class="fas fa-rocket me-2"></i>Get Started
</a>
<a class="btn btn-lg btn-outline-light me-3 mb-3" href="docs/">
  <i class="fas fa-book me-2"></i>Documentation
</a>
<a class="btn btn-lg btn-outline-light me-3 mb-3" href="https://github.com/hiero-ledger/solo" target="_blank">
  <i class="fab fa-github me-2"></i>View on GitHub
</a>
</div>

{{< /blocks/cover >}}

{{% blocks/section color="white" %}}

<div class="row">
<div class="col-lg-4 mb-4">
<div class="card h-100">
<div class="card-body">
<h3><i class="fas fa-vial text-primary me-2"></i>Built for Testing First</h3>
<p>Solo is designed to be embedded in test suites, CI jobs, and automation scripts — not just used interactively.</p>
<ul>
<li>Deterministic, repeatable network state</li>
<li>Clean teardown between test runs</li>
<li>Safe upgrade, rollback, and failure testing</li>
</ul>
</div>
</div>
</div>

<div class="col-lg-4 mb-4">
<div class="card h-100">
<div class="card-body">
<h3><i class="fas fa-terminal text-primary me-2"></i>CLI-Native & Automation Friendly</h3>
<p>Every operation in Solo is driven through a structured CLI with predictable outputs, making it easy to integrate with:</p>
<ul>
<li>CI/CD systems (GitHub Actions, GitLab CI, Jenkins)</li>
<li>Local test harnesses</li>
<li>DevOps and platform automation</li>
</ul>
</div>
</div>
</div>

<div class="col-lg-4 mb-4">
<div class="card h-100">
<div class="card-body">
<h3><i class="fas fa-layer-group text-primary me-2"></i>Full Hiero Stack, Not a Simulator</h3>
<p>Unlike lightweight simulators, Solo deploys real Hiero components working together:</p>
<ul>
<li>Consensus nodes</li>
<li>Mirror node with PostgreSQL</li>
<li>Explorer for visibility</li>
<li>JSON-RPC relay for EVM tooling compatibility</li>
</ul>
</div>
</div>
</div>
</div>

{{% /blocks/section %}}

{{% blocks/section color="white" %}}

<div style="margin-top: -3rem;">

<h2 class="text-center">Core Capabilities</h2>

<div class="row">
<div class="col-md-6 mb-4">
<div class="card h-100">
<div class="card-body">
<h3><i class="fas fa-sync text-primary me-2"></i>Reproducible Network Environments</h3>
<p>Define, version, and recreate Hedera network topologies using configuration files.</p>
<ul>
<li>Multi-node consensus layouts</li>
<li>Custom resource profiles</li>
<li>Consistent environments across machines and teams</li>
</ul>
</div>
</div>
</div>

<div class="col-md-6 mb-4">
<div class="card h-100">
<div class="card-body">
<h3><i class="fas fa-shield-alt text-primary me-2"></i>Upgrade & Failure Testing</h3>
<p>Solo makes it easy to test scenarios that are hard or risky on public networks.</p>
<ul>
<li>Node upgrades and configuration changes</li>
<li>Network restarts and recovery</li>
<li>Migration and rollback workflows</li>
</ul>
</div>
</div>
</div>

<div class="col-md-6 mb-4">
<div class="card h-100">
<div class="card-body">
<h3><i class="fas fa-code-branch text-primary me-2"></i>CI/CD & Pipeline Integration</h3>
<p>Solo fits naturally into modern delivery pipelines.</p>
<ul>
<li>Fast startup for ephemeral test environments</li>
<li>Scriptable lifecycle (create → test → destroy)</li>
<li>Compatible with containerized CI runners</li>
</ul>
</div>
</div>
</div>

<div class="col-md-6 mb-4">
<div class="card h-100">
<div class="card-body">
<h3><i class="fas fa-cloud text-primary me-2"></i>Local or Cloud-Native</h3>
<p>Run Solo on a laptop for development or deploy it into Kubernetes clusters for shared or scaled testing environments.</p>
<ul>
<li>Docker-based orchestration</li>
<li>Kubernetes-native deployments</li>
<li>Consistent behavior across local and cloud setups</li>
</ul>
</div>
</div>
</div>
</div>
</div>

{{% /blocks/section %}}

{{% blocks/section color="primary" %}}

<div class="text-center">

<h2>Ready to Deploy Your Network?</h2>

<p class="lead">Build faster, test with confidence, and automate everything with Solo.</p>

<div class="mt-4">
<a class="btn btn-lg btn-light me-3 mb-3" href="docs/solo-cli/">
  <i class="fas fa-rocket me-2"></i>Get Started Now
</a>
<a class="btn btn-lg btn-outline-light me-3 mb-3" href="examples/">
  <i class="fas fa-code me-2"></i>View Examples
</a>
</div>

<div class="mt-4">
<a href="https://github.com/hiero-ledger/solo" target="_blank" class="text-white me-3">
  <i class="fab fa-github fa-2x"></i>
</a>
<a href="https://discord.com/channels/905194001349627914/1364886813017247775" target="_blank" class="text-white me-3">
  <i class="fab fa-discord fa-2x"></i>
</a>
<a href="https://www.npmjs.com/package/@hashgraph/solo" target="_blank" class="text-white">
  <i class="fab fa-npm fa-2x"></i>
</a>
</div>

</div>

{{% /blocks/section %}}

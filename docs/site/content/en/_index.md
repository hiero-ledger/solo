---
title: Solo
description: Deploy and manage Hiero networks with ease
---

{{< blocks/cover image_anchor="top" height="min" color="primary" >}}

<div class="mx-auto">
  <h1 class="cover-title">Solo</h1>
  <p class="cover-lead lead">
    An opinionated CLI tool to deploy and manage standalone Hiero Ledger test networks locally or in the cloud
  </p>
  <div class="d-flex flex-wrap justify-content-center gap-3 mb-4">
    <a class="hero-btn hero-btn-primary" href="docs/solo-cli/">
      <i class="fas fa-rocket me-2"></i>Get Started
    </a>
    <a class="hero-btn hero-btn-secondary" href="docs/">
      <i class="fas fa-book me-2"></i>Documentation
    </a>
    <a class="hero-btn hero-btn-secondary" href="https://github.com/hiero-ledger/solo" target="_blank">
      <i class="fab fa-github me-2"></i>View on GitHub
    </a>
  </div>
</div>
{{< /blocks/cover >}}

<div class="features-section" >
{{% blocks/section color="white" type="row" %}}
  {{% blocks/feature icon="fa-bolt" title="One-Shot Deployment" %}} Deploy a complete Hiero network with consensus nodes,
  mirror node, explorer, and JSON RPC relay in a single command. Perfect for rapid development and testing.
  {{% /blocks/feature %}}

{{% blocks/feature icon="fa-cubes" title="Kubernetes Native" %}} Built on Kubernetes for scalability and reliability.
Deploy locally with Kind or to any cloud environment. Multi-cluster support for production-like testing.
{{% /blocks/feature %}}

{{% blocks/feature icon="fa-terminal" title="Developer Friendly" %}} Intuitive CLI with interactive prompts,
comprehensive documentation, and sensible defaults. Get a working network in minutes, not hours. {{% /blocks/feature %}}

{{% /blocks/section %}}

</div>

{{% blocks/section color="light" %}}

<div class="col-12">
  <h2 class="text-center mb-5">Core Capabilities</h2>
  <div class="row">
    <div class="col-md-6 mb-4">
      <div class="card h-100 border-0 shadow-sm">
        <div class="card-body p-4">
          <div class="d-flex align-items-center mb-3">
            <i class="fas fa-network-wired fa-2x text-primary me-3"></i>
            <h4 class="mb-0">Network Management</h4>
          </div>
          <p class="text-muted">
            Deploy and manage multiple consensus nodes with configurable network topology. Support for both local development and cloud deployments.
          </p>
          <ul class="list-unstyled">
            <li><i class="fas fa-check text-success me-2"></i>Dynamic node addition and removal</li>
            <li><i class="fas fa-check text-success me-2"></i>Node upgrade and configuration</li>
            <li><i class="fas fa-check text-success me-2"></i>Multi-cluster deployments</li>
          </ul>
        </div>
      </div>
    </div>
    <div class="col-md-6 mb-4">
      <div class="card h-100 border-0 shadow-sm">
        <div class="card-body p-4">
          <div class="d-flex align-items-center mb-3">
            <i class="fas fa-cogs fa-2x text-primary me-3"></i>
            <h4 class="mb-0">Complete Ecosystem</h4>
          </div>
          <p class="text-muted">
            Deploy the full Hiero stack including mirror node for historical data, block explorer for network visibility, and JSON RPC relay for EVM compatibility.
          </p>
          <ul class="list-unstyled">
            <li><i class="fas fa-check text-success me-2"></i>Mirror Node & PostgreSQL</li>
            <li><i class="fas fa-check text-success me-2"></i>Hiero Explorer</li>
            <li><i class="fas fa-check text-success me-2"></i>JSON RPC Relay</li>
          </ul>
        </div>
      </div>
    </div>
    <div class="col-md-6 mb-4">
      <div class="card h-100 border-0 shadow-sm">
        <div class="card-body p-4">
          <div class="d-flex align-items-center mb-3">
            <i class="fas fa-shield-alt fa-2x text-primary me-3"></i>
            <h4 class="mb-0">State Management</h4>
          </div>
          <p class="text-muted">
            Advanced state management capabilities for backup, restore, and migration scenarios. Test complex upgrade paths and disaster recovery.
          </p>
          <ul class="list-unstyled">
            <li><i class="fas fa-check text-success me-2"></i>Network state backup & restore</li>
            <li><i class="fas fa-check text-success me-2"></i>Cross-cluster migration</li>
            <li><i class="fas fa-check text-success me-2"></i>Version upgrade testing</li>
          </ul>
        </div>
      </div>
    </div>
    <div class="col-md-6 mb-4">
      <div class="card h-100 border-0 shadow-sm">
        <div class="card-body p-4">
          <div class="d-flex align-items-center mb-3">
            <i class="fas fa-puzzle-piece fa-2x text-primary me-3"></i>
            <h4 class="mb-0">Flexible Configuration</h4>
          </div>
          <p class="text-muted">
            Customize every aspect of your network with configuration profiles, custom resources, and environment variables for different testing scenarios.
          </p>
          <ul class="list-unstyled">
            <li><i class="fas fa-check text-success me-2"></i>Resource profiles for different hardware</li>
            <li><i class="fas fa-check text-success me-2"></i>Custom application properties</li>
            <li><i class="fas fa-check text-success me-2"></i>Network topology configuration</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>
{{% /blocks/section %}}

{{% blocks/section color="white" %}}

<div class="col-12 text-center gradient-bg">
  <h2 class="mb-4">Ready to Deploy Your Network?</h2>
  <p class="lead mb-5">
    Join developers building on Hiero with Solo's powerful deployment tools
  </p>
  <div class="d-flex flex-wrap justify-content-center gap-3">
    <a class="cta-btn cta-btn-primary" href="docs/solo-cli/">
      <i class="fas fa-rocket me-2"></i>Get Started Now
    </a>
    <a class="cta-btn cta-btn-secondary" href="examples">
      <i class="fas fa-code me-2"></i>View Examples
    </a>
  </div>
  <div class="mt-5">
    <a href="https://github.com/hiero-ledger/solo" target="_blank" class="text-white me-4">
      <i class="fab fa-github fa-2x"></i>
    </a>
    <a href="https://discord.com/channels/905194001349627914/1364886813017247775" target="_blank" class="text-white me-4">
      <i class="fab fa-discord fa-2x"></i>
    </a>
    <a href="https://www.npmjs.com/package/@hashgraph/solo" target="_blank" class="text-white">
      <i class="fab fa-npm fa-2x"></i>
    </a>
  </div>
</div>
{{% /blocks/section %}}

# PowerShell script to generate example documentation
# Equivalent to the Taskfile.mutate.yaml tasks

$ErrorActionPreference = "Stop"

# Get repo root directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $scriptDir))
$buildDir = Join-Path $repoRoot "docs\site\build"
$examplesRoot = Join-Path $repoRoot "examples"

# Create build directory
if (!(Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir | Out-Null
}

Write-Host "Building examples documentation..." -ForegroundColor Green
Write-Host "Repo root: $repoRoot" -ForegroundColor Gray
Write-Host "Examples root: $examplesRoot" -ForegroundColor Gray
Write-Host "Build dir: $buildDir" -ForegroundColor Gray
Write-Host ""

# Generate examples index page
Write-Host "  Generating examples index page..." -ForegroundColor Cyan
$examplesReadmePath = Join-Path $examplesRoot "README.md"
$indexOutputPath = Join-Path $buildDir "_index.md"

if (Test-Path $examplesReadmePath) {
    # Create front-matter for index
    $indexFrontMatter = @"
---
title: Examples
linkTitle: Examples
menu: {main: {weight: 50, pre: <i class="fa-solid fa-laptop-code"></i>}}
type: docs
weight: 1
---

{{% pageinfo %}}
The examples section provides information on some examples of how Solo can be used and leveraged.
{{% /pageinfo %}}

"@
    
    # Read the examples README content
    $examplesReadmeContent = Get-Content $examplesReadmePath -Raw
    
    # Combine front-matter and content
    $fullIndexContent = $indexFrontMatter + $examplesReadmeContent
    
    # Write to output file
    $fullIndexContent | Out-File -FilePath $indexOutputPath -Encoding utf8 -NoNewline
    
    Write-Host "    Created $indexOutputPath" -ForegroundColor Gray
}
else {
    Write-Host "  Warning: examples README.md not found" -ForegroundColor Yellow
}

Write-Host ""

# Define examples with their titles and descriptions
$examples = @(
    @{
        dir = "address-book"
        title = "Address Book Example"
        description = "Example of how to use Yahcli to read/update ledger and mirror node address book"
    },
    @{
        dir = "custom-network-config"
        title = "Custom Network Config Example"
        description = "Example of how to create and manage a custom Solo deployment and configure it with custom settings"
    },
    @{
        dir = "external-database-test"
        title = "Network with an External PostgreSQL Database Example"
        description = "example of how to deploy a Solo network with an external PostgreSQL database"
    },
    @{
        dir = "hardhat-with-solo"
        title = "Hardhat With Solo Example"
        description = "Example of how to use Solo with Hardhat"
    },
    @{
        dir = "local-build-with-custom-config"
        title = "Local Build With Custom Config Example"
        description = "Example of how to build Solo locally with custom configuration"
    },
    @{
        dir = "network-with-block-node"
        title = "Network with Block Node Example"
        description = "Example of how to create and manage a custom Solo deployment and configure it with custom settings"
    },
    @{
        dir = "network-with-domain-names"
        title = "Network With Domain Names Example"
        description = "Example of how to deploy a Solo network with custom domain names"
    },
    @{
        dir = "node-create-transaction"
        title = "Node Create Transaction Example"
        description = "Using Solo with a custom NodeCreateTransaction from an SDK call"
    },
    @{
        dir = "node-delete-transaction"
        title = "Node Delete Transaction Example"
        description = "Using Solo with a custom NodeDeleteTransaction from an SDK call"
    },
    @{
        dir = "node-update-transaction"
        title = "Node Update Transaction Example"
        description = "Using Solo with a custom NodeUpdateTransaction from an SDK call"
    },
    @{
        dir = "one-shot-falcon"
        title = "One Shot Falcon Example"
        description = "Example of how to deploy a Solo network with the Falcon release"
    },
    @{
        dir = "rapid-fire"
        title = "Rapid Fire Example"
        description = "Example of how to deploy a Solo network with the rapid fire network load generator"
    },
    @{
        dir = "state-save-and-restore"
        title = "State Save and Restore Example"
        description = "Example of how to save and restore state in a Solo network"
    },
    @{
        dir = "multicluster-backup-restore"
        title = "Multicluster Backup Restore Example"
        description = "Example of how to backup and restore a Solo network across multiple clusters"
    },
    @{
        dir = "version-upgrade-test"
        title = "Version Upgrade Test Example"
        description = "Example of how to test version upgrades in a Solo network"
    },
    @{
        dir = "running-solo-inside-cluster"
        title = "Solo Inside a Cluster Example"
        description = "Example of how to deploy a Solo network within a Kubernetes cluster"
    }
)

# Process each example
foreach ($example in $examples) {
    $exampleDir = Join-Path $examplesRoot $example.dir
    $readmePath = Join-Path $exampleDir "README.md"
    $outputPath = Join-Path $buildDir "$($example.dir).md"
    
    if (Test-Path $readmePath) {
        Write-Host "  Processing $($example.dir)..." -ForegroundColor Cyan
        
        # Create front-matter
        $frontMatter = @"
---
title: "$($example.title)"
weight: 1
description: >
  $($example.description)
type: docs
---

"@
        
        # Read the README content
        $readmeContent = Get-Content $readmePath -Raw
        
        # Combine front-matter and content
        $fullContent = $frontMatter + $readmeContent
        
        # Write to output file
        $fullContent | Out-File -FilePath $outputPath -Encoding utf8 -NoNewline
        
        Write-Host "    Created $outputPath" -ForegroundColor Gray
    }
    else {
        Write-Host "  Warning: README.md not found for $($example.dir)" -ForegroundColor Yellow
    }
}

Write-Host "`nExamples documentation built successfully!" -ForegroundColor Green
Write-Host "Output directory: $buildDir" -ForegroundColor Gray

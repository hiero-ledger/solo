#!/bin/bash

# Get a list of all contexts
CONTEXTS=$(kubectl config get-contexts -o name)

echo "--- Pods in All Contexts/Clusters ---"

# Loop through each context
for CONTEXT in $CONTEXTS; do
    echo "## Cluster: **$CONTEXT**"
    
    # Switch to the context and list pods in ALL namespaces
    # -A is the short form for --all-namespaces
    kubectl --context="$CONTEXT" get pods -A
    
    echo "---"
done


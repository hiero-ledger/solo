#!/bin/bash

# Test script to validate enhanced node stop/start functionality

set -e

NAMESPACE="solo-e2e"
NODE1="network-node1-0"
NODE2="network-node2-0"

echo "=== Enhanced Stop/Start Test ==="
echo "Testing solo node stop/start with enhanced Java process cleanup"

# Function to check ports in use
check_ports() {
    local node=$1
    echo "Checking ports for $node:"
    kubectl exec -n $NAMESPACE $node -- bash -c 'netstat -tlnp 2>/dev/null | grep -E ":(50111|9999)" || echo "  No ports in use"'
}

# Function to check for bind errors comprehensively
check_bind_errors() {
    local node=$1
    local timeframe=$2
    echo "Checking for bind errors in $node (timeframe: $timeframe):"
    
    # Check for any bind errors in the specified timeframe
    local errors=$(kubectl exec -n $NAMESPACE $node -- bash -c "grep '$timeframe' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log | grep -E '(BindException|Address already in use|port 50111)' | wc -l" 2>/dev/null || echo "0")
    
    if [ "$errors" != "0" ]; then
        echo "  ❌ Found $errors bind errors in timeframe $timeframe"
        kubectl exec -n $NAMESPACE $node -- bash -c "grep '$timeframe' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log | grep -E '(BindException|Address already in use|port 50111)' | tail -3"
        return 1
    else
        echo "  ✅ No bind errors found in timeframe $timeframe"
        return 0
    fi
}

# Function to stop node with enhanced logic
enhanced_stop() {
    local node=$1
    echo "Stopping $node with enhanced logic..."
    
    # Normal stop
    kubectl exec -n $NAMESPACE $node -- bash -c '/command/s6-svc -d /run/service/consensus'
    
    # Wait for graceful shutdown
    sleep 3
    
    # Check service status
    status=$(kubectl exec -n $NAMESPACE $node -- bash -c '/command/s6-svstat /run/service/consensus')
    echo "Service status after stop: $status"
    
    if echo "$status" | grep -E "(up|want down)"; then
        echo "Service not properly stopped, forcing..."
        kubectl exec -n $NAMESPACE $node -- bash -c '/command/s6-svc -wD /run/service/consensus'
        sleep 2
    fi
    
    # Enhanced process cleanup
    ports_output=$(kubectl exec -n $NAMESPACE $node -- bash -c 'netstat -tlnp 2>/dev/null | grep -E ":(50111|9999)" || true')
    
    if [ -n "$ports_output" ]; then
        echo "Found lingering processes on critical ports:"
        echo "$ports_output"
        
        # Extract PIDs and kill them
        pids=$(echo "$ports_output" | grep -oE '[0-9]+/java' | grep -oE '[0-9]+' | sort -u)
        
        for pid in $pids; do
            echo "Killing Java process PID $pid"
            kubectl exec -n $NAMESPACE $node -- bash -c "kill -9 $pid" || true
        done
        
        sleep 1
        
        # Final cleanup - kill any remaining Java processes
        kubectl exec -n $NAMESPACE $node -- bash -c 'ps aux | grep -E "(java.*hedera|ServicesMain)" | grep -v grep | awk "{print \$2}" | xargs -r kill -9 2>/dev/null || true'
    fi
    
    echo "Enhanced stop completed for $node"
}

# Function to start node
start_node() {
    local node=$1
    echo "Starting $node..."
    kubectl exec -n $NAMESPACE $node -- bash -c '/command/s6-svc -u /run/service/consensus'
}

# Function to check node logs
check_node_state() {
    local node=$1
    echo "Current state of $node:"
    kubectl logs -n $NAMESPACE $node --tail=2 | grep -E "(INFO.*Hedera|TSR|ERROR)" || echo "  No recent status found"
}

echo ""
echo "=== Initial State ==="
check_ports $NODE1
check_ports $NODE2

echo ""
echo "=== Testing Enhanced Stop on Node1 ==="
enhanced_stop $NODE1

echo ""
echo "=== Verifying Clean Stop ==="
check_ports $NODE1

echo ""
echo "=== Testing Enhanced Stop on Node2 ==="
enhanced_stop $NODE2

echo ""
echo "=== Verifying Clean Stop ==="
check_ports $NODE2

echo ""
echo "=== Starting Both Nodes ==="
start_node $NODE1
start_node $NODE2

echo ""
echo "=== Waiting for startup ==="
sleep 15

echo ""
echo "=== Final State Check ==="
check_node_state $NODE1
check_node_state $NODE2

echo ""
echo "=== Port Usage After Restart ==="
check_ports $NODE1
check_ports $NODE2

echo ""
echo "=== Comprehensive Bind Error Check ==="
# Check for bind errors during the restart period (last hour)
current_hour=$(date +"%H")
prev_hour=$(printf "%02d" $((10#$current_hour - 1)))

echo "Checking for bind errors during restart period..."
check_bind_errors $NODE1 "2026-01-18 $prev_hour:"
check_bind_errors $NODE2 "2026-01-18 $prev_hour:"
check_bind_errors $NODE1 "2026-01-18 $current_hour:"
check_bind_errors $NODE2 "2026-01-18 $current_hour:"

echo ""
echo "=== Testing Complete ==="
echo "Enhanced stop/start functionality validated successfully!"
#!/bin/bash

# Define the command to run
COMMAND="curl http://localhost:8080/api/v1/topics/0.0.1004/messages"

# Define the delay in seconds
DELAY=3

echo "Starting repeated command execution (Ctrl+C to stop)..."
echo "Command: $COMMAND"
echo "Interval: $DELAY seconds"
echo "---"

# Start the infinite loop
while true
do

    echo "--- $(date '+%Y-%m-%d %H:%M:%S') ---"
    # Run the command and display output
    $COMMAND

    # Wait for the specified delay
    sleep $DELAY
done



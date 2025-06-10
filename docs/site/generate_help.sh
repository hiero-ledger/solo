#!/bin/bash
set -eo pipefail

OUTPUT_FILE="docs/site/content/en/docs/solo-commands.md"
echo "---" > "$OUTPUT_FILE"
echo "title: ""Solo CLI Commands""" >> "$OUTPUT_FILE"
echo "weight: 40" >> "$OUTPUT_FILE"
echo "description: >" >> "$OUTPUT_FILE"
echo "    This document provides a comprehensive reference for the Solo CLI commands, including their options and usage." >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "# Solo Command Reference" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Add Table of Contents placeholder
echo "## Table of Contents" >> "$OUTPUT_FILE"
echo -e "\n* [Root Help Output](#root-help-output)" >> "$OUTPUT_FILE"

# Get top-level commands (ignore errors safely)
COMMANDS=($(npm run solo-test -- --help | awk '/Commands:/ {flag=1; next} /Options:/ {flag=0} flag && NF && $1 != "" {print $1}' || true))

for cmd in "${COMMANDS[@]}"; do
    echo "#1 Processing command: $cmd"
    echo -e "\n* [${cmd}](#${cmd})" >> "$OUTPUT_FILE"

    # Add subcommands if they exist
    SUBCOMMAND_OUTPUT=$(npm run solo-test -- "$cmd" --help 2>/dev/null || true)

    # Extract subcommands (suppress errors)
    SUBCOMMANDS=($(echo "$SUBCOMMAND_OUTPUT" | sed -n '/Commands:/,/Options:/p' | grep -E "^  $cmd \S+" | awk '{print $2}' || true))

    for subcmd in "${SUBCOMMANDS[@]}"; do
        echo "#1 Processing subcommand: $cmd $subcmd"
        echo -e "\n  * [${cmd} $subcmd](#${cmd}-${subcmd})" >> "$OUTPUT_FILE"
        if [[ "$cmd" == "block" ]]; then
            THIRD_LEVEL_OUTPUT=$(npm run solo-test -- "$cmd" "$subcmd" help 2>/dev/null || true)
            THIRD_LEVEL_COMMANDS=($(echo "$THIRD_LEVEL_OUTPUT" | sed -n '/Commands:/,/Options:/p' | grep -E "^  $cmd $subcmd \S+" | awk '{print $3}' || true))
            for third_cmd in "${THIRD_LEVEL_COMMANDS[@]}"; do
                echo -e "\n    * [${cmd} $subcmd $third_cmd](#${cmd}-${subcmd}-${third_cmd})" >> "$OUTPUT_FILE"
            done
        fi
    done
done

# Add the root help output
echo -e "\n## Root Help Output" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"
npm run solo-test -- --help >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"

# Process each command
for cmd in "${COMMANDS[@]}"; do
    echo "#2 Processing command: $cmd"
    echo -e "\n## $cmd" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo '```' >> "$OUTPUT_FILE"
    npm run solo-test -- "$cmd" --help >> "$OUTPUT_FILE"
    echo '```' >> "$OUTPUT_FILE"

    # Extract subcommands again safely
    SUBCOMMAND_OUTPUT=$(npm run solo-test -- "$cmd" --help 2>/dev/null || true)
    SUBCOMMANDS=($(echo "$SUBCOMMAND_OUTPUT" | sed -n '/Commands:/,/Options:/p' | grep -E "^  $cmd \S+" | awk '{print $2}' || true))

    for subcmd in "${SUBCOMMANDS[@]}"; do
        echo "#2 Processing subcommand: $cmd $subcmd"
        echo -e "\n### $cmd $subcmd" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
        npm run solo-test -- "$cmd" "$subcmd" --help >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"

        if [[ "$cmd" == "block" ]]; then
            THIRD_LEVEL_OUTPUT=$(npm run solo-test -- "$cmd" "$subcmd" help 2>/dev/null || true)
            THIRD_LEVEL_COMMANDS=($(echo "$THIRD_LEVEL_OUTPUT" | sed -n '/Commands:/,/Options:/p' | grep -E "^  $cmd $subcmd \S+" | awk '{print $3}' || true))
            for third_cmd in "${THIRD_LEVEL_COMMANDS[@]}"; do
                echo "#3 Processing third-level command: $cmd $subcmd $third_cmd"
                echo -e "\n#### $cmd $subcmd $third_cmd" >> "$OUTPUT_FILE"
                echo "" >> "$OUTPUT_FILE"
                echo '```' >> "$OUTPUT_FILE"
                npm run solo-test -- "$cmd" "$subcmd" "$third_cmd" --help >> "$OUTPUT_FILE"
                echo '```' >> "$OUTPUT_FILE"
            done
        fi
    done
done

echo "Documentation saved to $OUTPUT_FILE"

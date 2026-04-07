#!/bin/bash
# Script to drop git stashes from branches that no longer exist locally

# Parse command line arguments
DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Drop git stashes from branches that no longer exist locally."
            echo ""
            echo "Options:"
            echo "  -d, --dry-run    Show what would be done without actually dropping stashes"
            echo "  -h, --help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --dry-run     # Preview what would be dropped"
            echo "  $0               # Actually drop the stashes (with confirmation)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use -h or --help for usage information."
            exit 1
            ;;
    esac
done

if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN: Finding stashes from branches that no longer exist locally..."
else
    echo "🔍 Finding stashes from branches that no longer exist locally..."
fi

# Get all unique branch names from stashes
stash_branches=$(git stash list | awk -F': WIP on |: ' '{print $2}' | sort | uniq)

# Get all local branch names (trimming spaces and removing current branch marker)
local_branches=$(git branch | sed 's/* //' | sed 's/^ *//' | sort | uniq)

# Find branches that appear in stashes but not in local branches
deleted_branches=""
for branch in $stash_branches; do
    if ! echo "$local_branches" | grep -q "^${branch}$"; then
        deleted_branches="${deleted_branches}|${branch}"
    fi
done
deleted_branches="${deleted_branches#|}"  # Remove leading |

if [ -z "$deleted_branches" ]; then
    echo "✅ No stashes found from deleted branches."
    exit 0
fi

echo "📋 Found stashes from these deleted branches: $deleted_branches"

# Find all stash indices from deleted branches
stash_indices=$(git stash list | grep -E "WIP on (${deleted_branches}):" | awk -F'[{:}]' '{print $2}' | sort -nr)

if [ -z "$stash_indices" ]; then
    echo "✅ No stash indices found."
    exit 0
fi

count=$(echo "$stash_indices" | wc -l | tr -d ' ')
echo "🗂️  Found $count stashes to drop: $stash_indices"

echo ""
echo "📝 The following stashes will be dropped:"
for index in $stash_indices; do
    stash_info=$(git stash list | grep "stash@{$index}:" | head -1)
    echo "  $stash_info"
done

echo ""
if [ "$DRY_RUN" = true ]; then
    echo "🔍 DRY RUN: Would drop $count stashes from deleted branches."
    echo "💡 Run without --dry-run to actually perform the operation."
    exit 0
fi

read -p "⚠️  This will permanently delete $count stashes. Are you sure? (y/N): " confirm

if [[ $confirm =~ ^[Yy]$ ]]; then
    echo "🗑️  Dropping stashes..."
    dropped=0
    failed=0

    for index in $stash_indices; do
        echo -n "  Dropping stash@{$index}... "
        if git stash drop "stash@{$index}" 2>/dev/null; then
            echo "✅"
            ((dropped++))
        else
            echo "❌"
            ((failed++))
        fi
    done

    echo ""
    echo "📊 Summary:"
    echo "  ✅ Successfully dropped: $dropped stashes"
    if [ $failed -gt 0 ]; then
        echo "  ❌ Failed to drop: $failed stashes"
    fi
else
    echo "❌ Operation cancelled."
fi
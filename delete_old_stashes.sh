#!/bin/bash
# Script to delete git stashes older than 3 months

echo "Finding stashes older than 3 months..."

# Get the stash indices that are 3 months or older
old_stashes=$(git stash list --date=relative | grep -E "(3 months|4 months|5 months|6 months|7 months|8 months|9 months|10 months|11 months|12 months)" | awk '{print $1}' | sed 's/stash@{\([0-9]*\)}:/\1/' | sort -nr | uniq)

if [ -z "$old_stashes" ]; then
    echo "No stashes older than 3 months found."
    exit 0
fi

echo "Found stashes to delete: $old_stashes"
echo "This will delete the following stashes:"
for stash in $old_stashes; do
    git stash show stash@{$stash} -s | head -1
done

read -p "Are you sure you want to delete these stashes? (y/N): " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
    for stash in $old_stashes; do
        echo "Deleting stash@{$stash}..."
        git stash drop stash@{$stash}
    done
    echo "Done!"
else
    echo "Operation cancelled."
fi

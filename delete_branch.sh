
#!/bin/bash

# Check if a filename is provided as an argument
if [ -z "$1" ]; then
  echo "Usage: $0 <filename_with_branch_names>"
  exit 1
fi

BRANCH_FILE=$1

# Check if the file exists
if [ ! -f "$BRANCH_FILE" ]; then
  echo "Error: File not found - $BRANCH_FILE"
  exit 1
fi

# Loop through each branch name in the file
while IFS= read -r branch; do
  # Trim leading/trailing whitespace
  branch=$(echo "$branch" | xargs)

  # Skip empty lines or comments
  if [ -z "$branch" ] || [[ "$branch" =~ ^# ]]; then
    continue
  fi

  echo "Attempting to delete branch: $branch"

  # Delete local branch
  if git branch -d "$branch"; then
    echo "Successfully deleted local branch: $branch"
  else
    echo "Warning: Could not delete local branch $branch. It may not exist or is not fully merged."
  fi

  # Delete remote branch
  if git push origin --delete "$branch"; then
    echo "Successfully deleted remote branch: $branch"
  else
    echo "Warning: Could not delete remote branch $branch. It may not exist."
  fi

  echo "----------------------------------------"

done < "$BRANCH_FILE"

echo "Script finished."



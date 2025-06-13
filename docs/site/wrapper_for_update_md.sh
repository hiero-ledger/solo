#!/bin/bash

set -xeo pipefail

version=$1

# install gettext-base for envsubst
sudo apt-get update
sudo apt-get install gettext-base

pwd
npm install
echo "VERSION=$version"
[[ -n "$version" ]] && npm version "$version" -f --no-git-tag-version --allow-same-version
task build
npm install -g @hashgraph/solo
npm link
which solo
solo --version
node -p -e "Boolean(process.stdout.isTTY)"
chmod 755 ./.github/workflows/script/update_md.sh

cd docs/
pwd

../.github/workflows/script/update_md.sh </dev/null | cat
set +x
echo "::group::Updated step-by-step-guide.md"

cd ..
cat docs/site/content/en/docs/step-by-step-guide.md
echo "::endgroup::"

set +e
echo "::group::Git Diff step-by-step-guide.md"
git diff --stat
echo "::endgroup::"

CHANGES=$(git diff --stat)
echo "Changes: $CHANGES"

INSERTIONS=$(echo $CHANGES | grep -o -P '(?<=insertions\(\+\), )\d+')
echo "Insertions: $INSERTIONS"

DELETIONS=$(echo $CHANGES | grep -o '[0-9]\+' | tail -1)
echo "Deletions: $DELETIONS"

# Calculate total lines changed if INSERTIONS and DELETIONS are not empty
if [ -z "$INSERTIONS" ]; then
  INSERTIONS=0
fi
if [ -z "$DELETIONS" ]; then
    DELETIONS=0
fi

TOTAL_LINES_CHANGED=$(($INSERTIONS + $DELETIONS))
echo "Total step-by-step-guide.md lines changed: $TOTAL_LINES_CHANGED"

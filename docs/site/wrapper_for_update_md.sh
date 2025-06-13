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

.github/workflows/script/update_md.sh </dev/null | cat
set +x

echo "::group::Updated step-by-step-guide.md"
cat docs/site/content/en/docs/step-by-step-guide.md
echo "::endgroup::"

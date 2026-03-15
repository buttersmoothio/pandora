#!/usr/bin/env bash
# Based on https://github.com/pelatformlabs/template-bun
set -e

PACKAGES=$(find packages -name package.json -not -path "*/node_modules/*" -maxdepth 2)

for pkg in $PACKAGES; do
  dir=$(dirname "$pkg")

  (
    cd "$dir"

    if grep -q '"private": *true' package.json; then
      exit 0
    fi

    NAME=$(jq -r '.name' package.json)
    VERSION=$(jq -r '.version' package.json)

    # Skip if this version is already published
    if npm view "${NAME}@${VERSION}" version &>/dev/null; then
      echo "Skipping ${NAME}@${VERSION} (already published)"
      exit 0
    fi

    echo "Publishing ${NAME}@${VERSION}"
    bun publish
  )
done

changeset tag

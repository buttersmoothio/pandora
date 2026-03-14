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

    bun publish || true
  )
done

changeset tag

#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

INCREMENTAL=true yarn build

cd "examples/$1"

yarn
rm -rf node_modules/oidc-spa
cp -r ../../dist node_modules/oidc-spa
rm -rf node_modules/.vite
rm -rf .angular/cache

yarn $2

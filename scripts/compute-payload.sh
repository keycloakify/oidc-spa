
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INPUT="$SCRIPT_DIR/../dist/index.js"
#INPUT="$SCRIPT_DIR/../dist/vendor/frontend/oidc-client-ts.js"
#INPUT="$SCRIPT_DIR/../dist/vendor/frontend/jwt-decode.js"
#INPUT="$SCRIPT_DIR/../dist/vendor/frontend/tsafe.js"
#INPUT="$SCRIPT_DIR/../dist/vendor/frontend/worker-timers.js"
#INPUT="$SCRIPT_DIR/../node_modules/oidc-client-ts/dist/umd/oidc-client-ts.js"
#INPUT="$SCRIPT_DIR/../node_modules/jwt-decode/build/cjs/index.js"
#INPUT="$SCRIPT_DIR/../node_modules/worker-timers/build/es2019/module.js"
#INPUT="$SCRIPT_DIR/../node_modules/worker-timers/build/es5/bundle.js"
OUTPUT="$(mktemp)"

# Bundle + minify
npx esbuild "$INPUT" \
  --bundle \
  --minify \
  --format=cjs \
  --platform=browser \
  --outfile="$OUTPUT" \
  >/dev/null

RAW_SIZE=$(wc -c < "$OUTPUT")
GZIP_SIZE=$(gzip -n -9 -c "$OUTPUT" | wc -c)

echo "📦 Payload size report for $INPUT"
printf "  Raw (minified): %'d bytes\n" "$RAW_SIZE"
printf "  Gzip (min+gzip): %'d bytes\n" "$GZIP_SIZE"

rm "$OUTPUT"
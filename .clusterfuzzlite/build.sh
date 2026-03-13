#!/bin/bash -eu

cd $SRC/oppsera

# Install Jazzer.js for JavaScript fuzzing
npm install --save-dev @jazzer.js/core

# Compile fuzz targets
for fuzzer in fuzz/fuzz_*.js; do
  target_name=$(basename "$fuzzer" .js)
  cp "$fuzzer" "$OUT/$target_name.js"

  # Create wrapper script that ClusterFuzzLite expects
  cat > "$OUT/$target_name" <<EOF
#!/bin/bash
node "$OUT/$target_name.js" "\$@"
EOF
  chmod +x "$OUT/$target_name"
done

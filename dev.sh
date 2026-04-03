#!/bin/bash
x() { echo "\$ $*" >&2; "$@"; }
uncomment() { sed -E 's:.*// .*$::; s:^[ ]*/?\*.*::g; s:^[ ]*::' "$1" | grep -v '^$'; }

if [ "$1" = "size" ]; then
  x sed -E 's:.*// .*$::; s:^[ ]*/?\*.*::g; s:^[ ]*::' "ssr.js" | grep -v '^$' | wc;
  uncomment ssr.js | x gzip -ck9 - | wc -c;
  uncomment ssr.js | x brotli -ckq 6 - | wc -c;
  uncomment ssr.js | x uglifyjs -m properties,toplevel ssr.js | gzip -ck9 - | wc -c;
  uncomment ssr.js | x uglifyjs -m properties,toplevel ssr.js | brotli -ckq 6 - | wc -c;
fi

#!/bin/bash
x() { echo "\$ $*" >&2; "$@"; }

if [ "$1" = "size" ]; then
  x sed -E 's:.*// .*$::; s:^[ ]*/?\*.*::g; s:^[ ]*::' ssr.js | grep -v '^$' | wc;
  x gzip -ck9 ssr.js | wc -c;
  x brotli -ckq 6 ssr.js | wc -c;
  x uglifyjs -m properties,toplevel ssr.js | gzip -ck9 - | wc -c;
  x uglifyjs -m properties,toplevel ssr.js | brotli -ckq 6 - | wc -c;
fi

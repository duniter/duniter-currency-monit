#!/usr/bin/bash

echo "===== remove generated typescript files"
rm -rf modules/{*.js.map,*.d.ts}
rm -rf lib/{*.js.map,*.d.ts}
rm -rf routes/{*.js.map,*.d.ts}
rm -rf test/{*.js,*.js.map,*.d.ts}

echo "===== clean done"
git status

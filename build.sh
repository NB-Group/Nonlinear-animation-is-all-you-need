#!/bin/sh
# Build the installable extension zip: compile schemas, then pack everything
# except VCS/CI glue. Output: nonlinear-animation@nbgroup.zip
set -e
cd "$(dirname "$0")"

glib-compile-schemas schemas/

python3 - <<'PY'
import os, zipfile
out = 'nonlinear-animation@nbgroup.zip'
# eGo review rule: don't ship build scripts or compiled schemas (45+ compiles
# them at load time)
EXCLUDE = {'.gitignore', out, 'build.sh', 'gschemas.compiled'}
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk('.'):
        if any(s in root for s in ('/.git', '/.github')):
            continue
        for f in files:
            if f in EXCLUDE:
                continue
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, '.'))
print(f'built {out} ({os.path.getsize(out)} bytes)')
PY

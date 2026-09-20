#!/bin/sh
# Build the installable extension zip.
#
# Zip contents are an explicit allowlist (eGo review rule: ship only runtime
# files — no build scripts, no compiled schemas (45+ compiles them at load),
# no dev assets like screenshots/scripts/tests). Translations are compiled
# into locale/ and shipped.
#
# Output: nonlinear-animation@nbgroup.zip
set -e
cd "$(dirname "$0")"

glib-compile-schemas schemas/

# compile translations (fail loudly — a missing .mo means a broken language)
for po in po/*.po; do
    lang="$(basename "$po" .po)"
    mkdir -p "locale/$lang/LC_MESSAGES"
    msgfmt -o "locale/$lang/LC_MESSAGES/nonlinear-animation.mo" "$po"
done

python3 - <<'PY'
import glob, os, zipfile

out = 'nonlinear-animation@nbgroup.zip'
top_level = [
    'metadata.json', 'extension.js', 'prefs.js', 'easing.js',
    'curves.js', 'continuity.js', 'LICENSE', 'README.md',
]
extra = sorted(glob.glob('ui/*.js') +
               glob.glob('schemas/*.gschema.xml') +
               glob.glob('locale/*/LC_MESSAGES/*.mo'))

files = [f for f in top_level + extra if os.path.exists(f)]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, f)
print(f'built {out} ({os.path.getsize(out)} bytes):')
for f in files:
    print(f'  {f}')
PY

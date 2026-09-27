#!/bin/sh
# Build the installable extension zip.
#
# Zip contents are an explicit allowlist (eGo review rule: ship only runtime
# files — no build scripts, no compiled schemas (45+ compiles them at load),
# no dev assets like screenshots/scripts/tests). Translations are compiled
# into locale/ and shipped.
#
# Output: nonlinear-animation@nbgroup.zip
# Usage: ./build.sh [--install]
set -e

install=false
for arg in "$@"; do
    case "$arg" in
        -i|--install) install=true ;;
        -h|--help)
            printf 'Usage: %s [-i|--install] [-h|--help]\n\nBuild the extension zip.\n  -i, --install  Also install or update it for the current user.\n  -h, --help     Show this help message.\n' "$0"
            exit 0
            ;;
        *)
            printf 'Unknown option: %s\nUsage: %s [--install]\n' "$arg" "$0" >&2
            exit 1
            ;;
    esac
done

if [ "$install" = true ] && ! command -v gnome-extensions >/dev/null 2>&1; then
    printf 'Local installation requires gnome-extensions.\n' >&2
    exit 1
fi

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

if [ "$install" = true ]; then
    gnome-extensions install --force nonlinear-animation@nbgroup.zip
    printf '\nInstalled for the current user. Log out and back in to reload the extension.\n'
    printf 'Then enable it if needed: gnome-extensions enable nonlinear-animation@nbgroup\n'
fi

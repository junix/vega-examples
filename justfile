set shell := ["bash", "-euo", "pipefail", "-c"]

default: build

# Headless validation gate: directory contract, spec parse, data actually
# loads, no runtime errors, and every demo renders to a non-empty SVG.
build:
    node tools/validate.cjs

# The validation gate is the test gate.
test: build
    @echo "all demos validated"

# Gallery repo — no binary, no launcher (ADR-749: nothing to install).
install:
    @echo "vega-examples: gallery repo, nothing to install"

# Regenerate gallery thumbnails (needs headless Chromium).
thumbs:
    node tools/thumbs.cjs

# Batch-export every demo to exports/ (SVG + 2x transparent PNG).
export:
    node tools/export.cjs

# Serve the interactive gallery at http://localhost:8000/.
serve:
    ./serve.sh

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

# Publish the existing offline catalog under the explicit gallery.html name.
gallery:
    node tools/build-gallery.cjs

gallery-check:
    node tools/build-gallery.cjs --check
    node tools/thumbs.cjs --check

# Batch-export every demo to out/ (SVG + 2x transparent PNG).
export:
    node tools/export.cjs

# Serve the interactive gallery at http://localhost:8000/.
serve:
    ./serve.sh

# Remove batch-exported images (thumbs/ is committed and untouched).
clean: clean-artifacts

# Remove untracked intermediates. Preview: CLEAN_DRY_RUN=1 just clean-artifacts.
clean-artifacts:
    #!/usr/bin/env python3
    import fnmatch
    import glob
    import os
    from pathlib import Path
    import shutil
    import subprocess

    root = Path(r"""{{justfile_directory()}}""")
    os.chdir(root)
    dry_run = os.environ.get("CLEAN_DRY_RUN") == "1"
    if not (root / ".git").exists():
        print("No Git checkout at project root; preserving files.")
        raise SystemExit(0)
    # Fail closed if Git cannot identify protected files, including in worktrees.
    tracked = set(os.fsdecode(p) for p in subprocess.check_output(
        ["git", "ls-files", "-z"]).split(b"\0") if p)
    protected = set(tracked)
    for name in tracked:
        protected.update(str(p) for p in Path(name).parents)
    def remove(path):
        name = path.as_posix()
        if name in protected or path.is_symlink():
            return
        if path.is_dir():
            for directory, children, files in os.walk(path, followlinks=False):
                if (Path(directory) / ".git").exists():
                    return
                if any(Path(n).suffix in {".tex", ".typ", ".blend", ".ipynb"} for n in files):
                    return
                children[:] = [n for n in children if not (Path(directory) / n).is_symlink()]
        print(("Would remove " if dry_run else "Removing ") + name)
        if not dry_run:
            shutil.rmtree(path) if path.is_dir() else path.unlink()

    # Project-specific build outputs. Keep dependencies, models and final media.
    build_dirs = ["out"]
    for pattern in build_dirs:
        if Path(pattern).is_absolute() or ".." in Path(pattern).parts or pattern in {"", "."}:
            raise SystemExit("Build cleanup paths must stay within the project")
        for name in glob.glob(pattern):
            path = Path(name)
            if path.exists() and not any(p.is_symlink() for p in [path, *path.parents]):
                remove(path)

    caches = {"__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"}
    skip = {".git", ".hg", ".svn", "legacy", "node_modules", ".venv", "venv", "vendor", "third_party", "target", ".build", ".lake", "dist-newstyle", ".stack-work"}
    tex = ("*.aux", "*.fls", "*.fdb_latexmk", "*.synctex.gz", "*.nav", "*.snm", "*.vrb", "*.bcf", "*.run.xml", "*.toc", "*.lof", "*.lot")
    images = {".png", ".jpg", ".jpeg", ".webp"}
    def walk_error(error):
        raise error
    for current, dirs, files in os.walk(".", onerror=walk_error, followlinks=False):
        base = Path(current)
        for name in dirs[:]:
            path = base / name
            if path.is_symlink() or name in skip or (path / ".git").exists():
                dirs.remove(name)
            elif name in caches or name.endswith(".egg-info"):
                remove(path)
                dirs.remove(name)
            elif name in {".cache", ".render-cache"} and "docs" in path.parts:
                ignored = subprocess.run(["git", "check-ignore", "-q", "--", str(path)])
                if ignored.returncode not in (0, 1):
                    raise SystemExit(ignored.returncode)
                if ignored.returncode == 0:
                    remove(path)
                    dirs.remove(name)
        for name in files:
            path = base / name
            if path.as_posix() in tracked or path.is_symlink():
                continue
            is_tex = any(fnmatch.fnmatchcase(name, pattern) for pattern in tex)
            is_tex_log = path.suffix == ".log" and path.with_suffix(".tex").is_file()
            parts = path.parts
            in_docs = any(p in {"docs", "doc", "infographics"} or p.endswith("-explainer") for p in parts[:-1])
            inspection = name.endswith(".lint.png") or name.startswith("slice-") or any(p in {"crops", "inspect", "slices", "tiles", "sections"} for p in parts[:-1])
            # Only ignored inspection images qualify; finished render/evidence trees stay.
            is_image = in_docs and inspection and path.suffix.lower() in images
            if is_image:
                result = subprocess.run(["git", "check-ignore", "-q", "--", str(path)])
                if result.returncode not in (0, 1):
                    raise SystemExit(result.returncode)
                is_image = result.returncode == 0
            if is_tex or is_tex_log or is_image:
                remove(path)

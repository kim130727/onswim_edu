"""Build the React + Vite student app and copy the identical `dist/` bundle to Django static."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

FORBIDDEN_SUFFIXES = (
    ".dsl.py",
    ".semantic.json",
    ".solvable.json",
    ".layout.json",
    ".renderer.json",
)
FORBIDDEN_DIR_NAMES = {"generated"}


def verify_student_bundle(bundle_dir: Path) -> list[str]:
    """Return a list of leaked private problem artifact paths in the built student bundle."""
    leaked: list[str] = []
    if not bundle_dir.is_dir():
        return [f"Missing bundle directory: {bundle_dir}"]
    for path in bundle_dir.rglob("*"):
        if any(part in FORBIDDEN_DIR_NAMES for part in path.parts):
            leaked.append(str(path))
            continue
        name = path.name.lower()
        if any(name.endswith(suffix) for suffix in FORBIDDEN_SUFFIXES):
            leaked.append(str(path))
    return leaked


def verify_bundle(bundle_dir: Path) -> None:
    """Reject any private authored problem artifacts in the built student bundle."""
    leaked = verify_student_bundle(bundle_dir)
    if leaked:
        raise RuntimeError(f"Private problem artifact leaked into student bundle: {leaked[0]}")


def copy_dist_to_django(dist_dir: Path, output_dir: Path) -> None:
    verify_bundle(dist_dir)
    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.copytree(dist_dir, output_dir)
    verify_bundle(output_dir)


def main() -> int:
    mobile_root = Path(__file__).resolve().parents[1]
    repo_root = mobile_root.parents[1]
    dist_dir = mobile_root / "dist"
    output_dir = (
        repo_root
        / "src"
        / "modu_math_web"
        / "editor_next"
        / "static"
        / "editor_next"
        / "student_app"
    )

    npm_cmd = "npm.cmd" if sys.platform.startswith("win") else "npm"
    subprocess.run([npm_cmd, "run", "build"], cwd=mobile_root, check=True)
    copy_dist_to_django(dist_dir, output_dir)
    print(f"Student React web bundle synced: {dist_dir} -> {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

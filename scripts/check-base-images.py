#!/usr/bin/env python3
"""Fail a pull request whose Dockerfiles pull a floating external base image.

Every external `FROM` must be written `image:tag@sha256:<digest>`, with the digest of the
multi-architecture index (`docker buildx imagetools inspect image:tag`): the tag stays readable for
people and for Renovate, the digest makes two builds of the same commit start from the same image.
A bare image, `:latest` or a tag without a digest lets the base image (and its CVEs) change between
builds without anything changing in git.

Not checked:
  * a reference to an earlier build stage (`FROM builder`) and `scratch`,
  * our own images (`ghcr.io/instamedsolutions/...`, a private ECR registry),
  * an image built from a build argument (`FROM ${BASE_IMAGE}`), which cannot be read statically.

A line can opt out with `# image-policy: ignore -- <reason>` on the line above. The reason is
mandatory, so the exception is explained where it lives.

Same rule as `scripts/check-external-images.py` in the infra repository.

Usage: check-base-images.py [ROOT] [--exclude PATH ...]    (ROOT defaults to the current directory)
  --exclude PATH   skip the Dockerfiles under PATH (relative to ROOT), e.g. files kept from an
                   upstream project that our builds never use.
Exit status: 0 when every external base image is pinned, 1 otherwise.
"""

import argparse
import re
import sys
from pathlib import Path

SKIPPED_DIRS = {".git", "node_modules", ".venv", "venv", ".idea"}

OWN_IMAGE_PREFIXES = ("ghcr.io/instamedsolutions/", "instamedsolutions/")
PRIVATE_ECR = re.compile(r"^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/")

FROM_LINE = re.compile(r"^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?\s*$", re.IGNORECASE)
IGNORE = re.compile(r"#\s*image-policy:\s*ignore\s*--\s*\S+")
PINNED = re.compile(r"^[^@\s]+:(?P<tag>[A-Za-z0-9_][A-Za-z0-9._-]{0,127})@sha256:[0-9a-f]{64}$")


def dockerfiles(root: Path, excluded=()):
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if any(part in SKIPPED_DIRS for part in relative.parts):
            continue
        if any(relative.is_relative_to(Path(prefix)) for prefix in excluded):
            continue
        name = path.name.lower()
        if path.is_file() and (name == "dockerfile" or name.endswith(".dockerfile") or name.startswith("dockerfile.")):
            yield path


def logical_lines(text: str):
    """Yields (first line number, instruction) with `\\` continuations joined, as Docker reads them.

    Comment lines inside a continued instruction are dropped, like Docker does. A comment is kept
    as its own line otherwise, for the `image-policy: ignore` opt-out.
    """
    buffer, start = [], None
    for number, line in enumerate(text.splitlines(), start=1):
        if buffer and line.lstrip().startswith("#"):
            continue
        if start is None:
            start = number
        stripped = line.rstrip()
        if stripped.endswith("\\") and not line.lstrip().startswith("#"):
            buffer.append(stripped[:-1])
            continue
        buffer.append(line)
        yield start, " ".join(part.strip() for part in buffer)
        buffer, start = [], None
    if buffer:
        yield start, " ".join(part.strip() for part in buffer)


def check(path: Path, root: Path) -> list[str]:
    findings = []
    stages = set()
    previous = ""
    for number, line in logical_lines(path.read_text(encoding="utf-8")):
        match = FROM_LINE.match(line)
        if match:
            image, stage = match.group(1), match.group(2)
            ignored = bool(IGNORE.search(previous))
            if not ignored and not is_exempt(image, stages):
                pinned = PINNED.match(image)
                if not pinned:
                    findings.append(f"{path.relative_to(root)}:{number}: {image} n'est pas figée en image:tag@sha256:<digest>")
                elif pinned.group("tag") == "latest":
                    findings.append(f"{path.relative_to(root)}:{number}: {image} utilise le tag latest")
            if stage:
                stages.add(stage.lower())
        if line.strip():
            previous = line
    return findings


def is_exempt(image: str, stages: set) -> bool:
    return (
        image.lower() in stages
        or image == "scratch"
        or "$" in image
        or image.startswith(OWN_IMAGE_PREFIXES)
        or bool(PRIVATE_ECR.match(image))
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--exclude", action="append", default=[], metavar="PATH")
    args = parser.parse_args()
    root = Path(args.root).resolve()

    files = list(dockerfiles(root, args.exclude))
    findings = [finding for path in files for finding in check(path, root)]
    for finding in findings:
        print(f"::error::{finding}")
    print(f"{len(files)} Dockerfile(s) vérifié(s), {len(findings)} image(s) de base non figée(s).")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())

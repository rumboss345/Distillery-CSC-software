#!/usr/bin/env python3
"""Extract IBD Diploma revision PDFs to plain text for Ask Nelly."""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("Install pypdf: pip install pypdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "server" / "knowledge" / "ibd" / "sources"
UPLOAD_DIRS = [
    ROOT / "uploads",
    Path("/home/ubuntu/.cursor/projects/workspace/uploads"),
    Path("/tmp/distil-notes"),
]


def slugify(name: str) -> str:
    base = re.sub(r"[^\w\s.-]", "", name, flags=re.UNICODE)
    base = re.sub(r"\s+", "_", base.strip())
    return base[:120] or "document"


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)


def collect_pdfs() -> list[Path]:
    pdfs: list[Path] = []
    seen: set[str] = set()

    def add_pdf(p: Path) -> None:
        key = p.name.lower()
        if key in seen or key.startswith("._"):
            return
        seen.add(key)
        pdfs.append(p)

    for base in UPLOAD_DIRS:
        if not base.exists():
            continue
        for path in base.rglob("*.pdf"):
            add_pdf(path)

    return sorted(pdfs, key=lambda p: p.name.lower())


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdfs = collect_pdfs()
    if not pdfs:
        print("No PDFs found under uploads or /tmp/distil-notes", file=sys.stderr)
        sys.exit(1)

    manifest: list[dict[str, str | int]] = []
    skip_name_parts = ("table_3", "table3", "receipes", "recipes_2024", "liqour_blending")
    for pdf in pdfs:
        lower = pdf.name.lower()
        if any(part in lower for part in skip_name_parts):
            continue
        text = extract_pdf_text(pdf)
        if len(text.strip()) < 80:
            continue
        out_name = slugify(pdf.stem) + ".txt"
        out_path = OUT_DIR / out_name
        out_path.write_text(text, encoding="utf-8", errors="replace")
        manifest.append(
            {
                "id": out_name,
                "title": pdf.stem,
                "sourcePdf": str(pdf),
                "chars": len(text),
            }
        )
        print(f"Wrote {out_name} ({len(text):,} chars)")

    manifest_path = OUT_DIR.parent / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Manifest: {manifest_path} ({len(manifest)} sources)")


if __name__ == "__main__":
    main()

"""
Scan E:\Paper_Intro\ and generate papers.json
Parses .md files and subdirectories with intro.md
"""

import os
import re
import json
import datetime

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT = os.path.join(os.path.dirname(__file__), "papers.json")

# Source inference from filename/dirname
SOURCE_PATTERNS = [
    (r"TMC_", "TMC 2026"),
    (r"ACL\d{4}", "ACL"),
    (r"ICML\d{4}", "ICML"),
    (r"NeurIPS\d{4}", "NeurIPS"),
    (r"ICLR\d{4}", "ICLR"),
    (r"CVPR\d{4}", "CVPR"),
    (r"ICCV\d{4}", "ICCV"),
    (r"AAAI\d{4}", "AAAI"),
    (r"TMC\d{4}", "TMC"),
]


def infer_date(name: str, filepath: str) -> str:
    """Infer date from filename. Returns YYYY-MM or YYYY-MM-DD."""
    # Pattern: YYYYMMDD_...
    m = re.match(r"^(\d{4})(\d{2})(\d{2})_", name)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"

    # Pattern: YYMM.xxxxx_...  (arXiv ID)
    m = re.match(r"^(\d{2})(\d{2})\.\d+", name)
    if m:
        yy, mm = int(m.group(1)), int(m.group(2))
        year = 2000 + yy if yy < 50 else 1900 + yy
        return f"{year}-{mm:02d}"

    # Fallback: file modification time
    try:
        mtime = os.path.getmtime(filepath)
        dt = datetime.datetime.fromtimestamp(mtime)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return "Unknown"


def infer_source(name: str) -> str:
    """Infer paper source from filename/dirname."""
    for pattern, source in SOURCE_PATTERNS:
        if re.search(pattern, name):
            return source
    return "arXiv"


def parse_md_content(text: str) -> dict:
    """Extract structured fields from markdown content."""
    fields = {}

    # Keywords
    m = re.search(r"\*\*关键词\*\*\s*[:：]\s*(.+)", text)
    if m:
        fields["keywords"] = m.group(1).strip()

    # arXiv ID
    m = re.search(r"📚\s*arXiv\s*[:：]\s*(\S+)", text)
    if m:
        fields["arxiv_id"] = m.group(1).strip()

    # Title (English)
    m = re.search(r"✏️\s*标题\s*[:：]\s*(.+)", text)
    if m:
        fields["title"] = m.group(1).strip()

    # Chinese title
    m = re.search(r"🏷️\s*中文标题\s*[:：]\s*(.+)", text)
    if m:
        fields["title_cn"] = m.group(1).strip()

    # One-line summary
    m = re.search(r"📄\s*一句话介绍\s*[:：]\s*(.+)", text)
    if m:
        fields["summary"] = m.group(1).strip()

    return fields


def title_from_filename(name: str) -> str:
    """Generate a readable title from filename."""
    # Remove arXiv prefix, date prefix, extension
    t = re.sub(r"^\d{4}\.\d+_", "", name)
    t = re.sub(r"^\d{8}_", "", t)
    t = re.sub(r"\.md$", "", t)
    t = t.replace("_", " ")
    return t


def scan():
    papers = []
    seen = set()

    for entry in os.listdir(BASE_DIR):
        full_path = os.path.join(BASE_DIR, entry)

        # Skip app directory and special files
        if entry in ("app", "figures", "pdf", "build_card.py", "extract_figure.py",
                      ".git", ".gitignore", ".claude", "README.md"):
            continue

        md_path = None
        entry_name = entry

        if os.path.isdir(full_path):
            # Directory: look for intro.md
            intro_path = os.path.join(full_path, "intro.md")
            if os.path.exists(intro_path):
                md_path = intro_path
            else:
                # Check for any .md file in the directory
                for f in os.listdir(full_path):
                    if f.endswith(".md"):
                        md_path = os.path.join(full_path, f)
                        break
            if md_path is None:
                continue
        elif entry.endswith(".md"):
            md_path = full_path
            entry_name = entry
        else:
            continue

        if md_path in seen:
            continue
        seen.add(md_path)

        # Read and parse content
        try:
            with open(md_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            content = ""

        fields = parse_md_content(content)
        date = infer_date(entry_name, md_path)
        source = infer_source(entry_name)

        # Get file modification time (used for "recently added" sort)
        try:
            mtime = os.path.getmtime(md_path)
        except Exception:
            mtime = 0

        # Build paper entry
        paper = {
            "id": entry_name.replace(".md", ""),
            "title": fields.get("title", title_from_filename(entry_name)),
            "title_cn": fields.get("title_cn", ""),
            "keywords": fields.get("keywords", ""),
            "summary": fields.get("summary", ""),
            "arxiv_id": fields.get("arxiv_id", ""),
            "source": source,
            "date": date,
            "mtime": mtime,
            "path": os.path.relpath(md_path, BASE_DIR).replace("\\", "/"),
            "abs_path": md_path.replace("\\", "/"),
        }
        papers.append(paper)

    # Sort by file modification time descending (most recently added/modified first)
    papers.sort(key=lambda p: p.get("mtime", 0), reverse=True)

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(papers, f, ensure_ascii=False, indent=2)

    print(f"Scanned {len(papers)} papers -> {OUTPUT}")
    return papers


if __name__ == "__main__":
    scan()

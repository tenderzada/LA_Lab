"""
Personal annotations: stars, reading status, notes.
Stored in annotations.json keyed by paper_id.
"""

import os
import json

ANNOTATIONS_FILE = os.path.join(os.path.dirname(__file__), "annotations.json")


def load_annotations() -> dict:
    if not os.path.exists(ANNOTATIONS_FILE):
        return {}
    try:
        with open(ANNOTATIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_annotations(data: dict):
    with open(ANNOTATIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_annotation(paper_id: str) -> dict:
    """Get annotation for a paper. Returns default if not set."""
    data = load_annotations()
    return data.get(paper_id, {
        "starred": False,
        "status": "",  # "" | "todo" | "reading" | "read"
        "notes": "",
    })


def update_annotation(paper_id: str, updates: dict) -> dict:
    """Update annotation for a paper. Merges with existing."""
    data = load_annotations()
    existing = data.get(paper_id, {
        "starred": False,
        "status": "",
        "notes": "",
    })
    existing.update(updates)
    data[paper_id] = existing
    save_annotations(data)
    return existing

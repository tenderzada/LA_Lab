"""
Personal annotations: stars, reading status, notes, tags.
Stored in annotations.json keyed by paper_id.
Tag definitions stored in tags.json.
"""

import os
import json

ANNOTATIONS_FILE = os.path.join(os.path.dirname(__file__), "annotations.json")
TAGS_FILE = os.path.join(os.path.dirname(__file__), "tags.json")

DEFAULT_TAGS = [
    {"name": "自进化", "icon": "🔄"},
    {"name": "智能体RL", "icon": "🎮"},
    {"name": "工具智能体", "icon": "🔧"},
    {"name": "低空经济", "icon": "🛩️"},
    {"name": "Harness", "icon": "🏗️"},
    {"name": "Skill", "icon": "⚡"},
    {"name": "边缘智能", "icon": "📡"},
    {"name": "SWE Agent", "icon": "💻"},
    {"name": "RAG", "icon": "📚"},
    {"name": "多模态", "icon": "👁️"},
    {"name": "数据合成", "icon": "🧪"},
]


def load_tags() -> list:
    if not os.path.exists(TAGS_FILE):
        save_tags(DEFAULT_TAGS)
        return DEFAULT_TAGS
    try:
        with open(TAGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return DEFAULT_TAGS


def save_tags(tags: list):
    with open(TAGS_FILE, "w", encoding="utf-8") as f:
        json.dump(tags, f, ensure_ascii=False, indent=2)


def add_tag(name: str, icon: str) -> list:
    tags = load_tags()
    if any(t["name"] == name for t in tags):
        return tags
    tags.append({"name": name, "icon": icon})
    save_tags(tags)
    return tags


def delete_tag(name: str) -> list:
    tags = load_tags()
    tags = [t for t in tags if t["name"] != name]
    save_tags(tags)
    data = load_annotations()
    for pid, ann in data.items():
        if "tags" in ann and name in ann["tags"]:
            ann["tags"].remove(name)
    save_annotations(data)
    return tags


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

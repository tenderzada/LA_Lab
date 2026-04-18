"""
arXiv auto-import: fetch metadata, download PDF, extract text, generate intro.md with Qwen.
"""

import os
import re
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

from llm import get_chat_client

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
SKILLS_FILE = os.path.join(os.path.dirname(__file__), "skills.json")


def load_skills() -> list:
    if not os.path.exists(SKILLS_FILE):
        return []
    with open(SKILLS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_skill(skill_id: str = None) -> dict:
    skills = load_skills()
    if skill_id:
        s = next((s for s in skills if s["id"] == skill_id), None)
        if s:
            return s
    return next((s for s in skills if s.get("is_default")), skills[0] if skills else None)


def parse_arxiv_id(text: str) -> str:
    """Extract arXiv ID from URL or plain ID."""
    text = text.strip()
    # URL patterns: https://arxiv.org/abs/2604.04949, https://arxiv.org/pdf/2604.04949
    m = re.search(r"arxiv\.org/(?:abs|pdf)/([0-9]{4}\.[0-9]{4,5})", text)
    if m:
        return m.group(1)
    # Plain ID: 2604.04949 or 2604.04949v1
    m = re.match(r"^([0-9]{4}\.[0-9]{4,5})(?:v\d+)?$", text)
    if m:
        return m.group(1)
    raise ValueError(f"Cannot parse arXiv ID from: {text}")


def fetch_metadata(arxiv_id: str) -> dict:
    """Query arXiv API for paper metadata."""
    url = f"http://export.arxiv.org/api/query?id_list={arxiv_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "PaperKB/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        xml_data = resp.read().decode("utf-8")

    # Parse XML
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(xml_data)
    entry = root.find("atom:entry", ns)
    if entry is None:
        raise ValueError(f"No entry found for {arxiv_id}")

    title = entry.find("atom:title", ns).text.strip()
    summary = entry.find("atom:summary", ns).text.strip()
    authors = [a.find("atom:name", ns).text for a in entry.findall("atom:author", ns)]
    published = entry.find("atom:published", ns).text

    return {
        "id": arxiv_id,
        "title": re.sub(r"\s+", " ", title),
        "abstract": re.sub(r"\s+", " ", summary),
        "authors": authors,
        "published": published,
    }


def download_pdf(arxiv_id: str, save_dir: str) -> str:
    """Download the PDF to save_dir."""
    os.makedirs(save_dir, exist_ok=True)
    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    pdf_path = os.path.join(save_dir, f"{arxiv_id}.pdf")

    req = urllib.request.Request(pdf_url, headers={"User-Agent": "PaperKB/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        with open(pdf_path, "wb") as f:
            f.write(resp.read())

    return pdf_path


def extract_pdf_text(pdf_path: str, max_pages: int = 6) -> str:
    """Extract text from first N pages of PDF."""
    try:
        import fitz
    except ImportError:
        return ""

    doc = fitz.open(pdf_path)
    text = ""
    for i in range(min(max_pages, len(doc))):
        text += doc[i].get_text()
    doc.close()
    return text


def generate_intro(metadata: dict, pdf_text: str, skill_id: str = None) -> str:
    """Use LLM to generate intro.md using the selected skill's prompt template."""
    pdf_excerpt = pdf_text[:8000] if len(pdf_text) > 8000 else pdf_text

    skill = get_skill(skill_id)
    if skill and skill.get("prompt"):
        prompt = skill["prompt"].format(
            title=metadata["title"],
            arxiv_id=metadata["id"],
            abstract=metadata["abstract"],
            pdf_text=pdf_excerpt,
        )
    else:
        prompt = f"Summarize this paper:\nTitle: {metadata['title']}\nAbstract: {metadata['abstract']}\n\n{pdf_excerpt}"

    client, model = get_chat_client()
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are an academic paper summarizer. Output strictly follows the requested format."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=2000,
    )

    return resp.choices[0].message.content


def sanitize_filename(title: str) -> str:
    """Convert title to a safe directory name."""
    s = re.sub(r"[^\w\s-]", "", title)
    s = re.sub(r"\s+", "_", s.strip())
    return s[:50]


def import_arxiv(arxiv_input: str, skill_id: str = None) -> dict:
    """End-to-end: parse input, fetch metadata, download PDF, generate intro, save."""
    arxiv_id = parse_arxiv_id(arxiv_input)

    # Check if already exists
    for entry in os.listdir(BASE_DIR):
        if entry.startswith(arxiv_id):
            return {"success": False, "error": f"Paper {arxiv_id} already exists as {entry}"}

    # Fetch metadata
    metadata = fetch_metadata(arxiv_id)

    # Create directory
    short_title = sanitize_filename(metadata["title"])
    dir_name = f"{arxiv_id}_{short_title}"
    save_dir = os.path.join(BASE_DIR, dir_name)

    # Download PDF
    pdf_path = download_pdf(arxiv_id, save_dir)

    # Extract text
    pdf_text = extract_pdf_text(pdf_path)

    # Generate intro using selected skill
    intro_content = generate_intro(metadata, pdf_text, skill_id=skill_id)

    # Save intro.md
    intro_path = os.path.join(save_dir, "intro.md")
    with open(intro_path, "w", encoding="utf-8") as f:
        f.write(intro_content)

    return {
        "success": True,
        "arxiv_id": arxiv_id,
        "title": metadata["title"],
        "dir": dir_name,
        "intro_path": f"{dir_name}/intro.md",
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        result = import_arxiv(sys.argv[1])
        print(result)

"""
arXiv auto-import: fetch metadata, download PDF, extract text, generate intro.md with Qwen.
"""

import os
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from openai import OpenAI

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))

DASHSCOPE_KEY = os.environ.get("DASHSCOPE_API_KEY", "")
qwen_client = OpenAI(
    api_key=DASHSCOPE_KEY or "not-set",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)


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


def generate_intro(metadata: dict, pdf_text: str) -> str:
    """Use Qwen to generate three-section intro.md."""
    # Truncate PDF text if too long
    pdf_excerpt = pdf_text[:8000] if len(pdf_text) > 8000 else pdf_text

    prompt = f"""请根据以下论文信息，生成一份严格符合格式要求的中文三段式论文介绍。

论文标题: {metadata['title']}
arXiv ID: {metadata['id']}
摘要: {metadata['abstract']}

论文正文节选:
{pdf_excerpt}

请严格按以下格式输出（字数控制在700字以内）：

**关键词**: [关键词1], [关键词2], [关键词3]

📚arXiv: {metadata['id']}
✏️标题: {metadata['title']}
🏷️中文标题：[≤20字的中文标题]
📄一句话介绍：[20-30字的核心概括]

🎯动机
[介绍研究背景、发展脉络、研究空白，200字左右]

💡方法与创新
[聚焦核心创新点，用"一是…二是…"组织，250字左右]

📊实验设计
[主要基准、关键结果、消融结论，200字左右]

注意：
- 语言学术规范，避免口语化
- 动机部分梳理脉络而非罗列问题
- 方法部分聚焦创新点
- 实验部分数据驱动"""

    resp = qwen_client.chat.completions.create(
        model="qwen-plus",
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


def import_arxiv(arxiv_input: str) -> dict:
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

    # Generate intro
    intro_content = generate_intro(metadata, pdf_text)

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

"""
Weekly digest: scan papers added in the last N days, summarize with Qwen,
and optionally push to Feishu webhook.
"""

import os
import json
import time
import urllib.request

from llm import get_chat_client

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
FEISHU_WEBHOOK = os.environ.get("FEISHU_WEBHOOK", "")


def find_recent_papers(days: int = 7) -> list:
    """Find papers whose intro.md was modified in the last N days."""
    cutoff = time.time() - days * 86400
    papers_json = os.path.join(os.path.dirname(__file__), "papers.json")

    if not os.path.exists(papers_json):
        return []

    with open(papers_json, "r", encoding="utf-8") as f:
        all_papers = json.load(f)

    recent = []
    for p in all_papers:
        abs_path = p.get("abs_path", "").replace("/", os.sep)
        if not os.path.exists(abs_path):
            continue
        mtime = os.path.getmtime(abs_path)
        if mtime >= cutoff:
            # Load the intro text
            try:
                with open(abs_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                content = ""
            recent.append({
                "id": p["id"],
                "title": p.get("title", ""),
                "title_cn": p.get("title_cn", ""),
                "summary": p.get("summary", ""),
                "keywords": p.get("keywords", ""),
                "date": p["date"],
                "source": p["source"],
                "content": content,
            })

    # Sort by date desc
    recent.sort(key=lambda x: x["date"], reverse=True)
    return recent


def generate_digest(papers: list) -> str:
    """Use Qwen to generate a narrative digest of recent papers."""
    if not papers:
        return "本周没有新增论文。"

    # Build a compact summary of each paper for the LLM
    entries = []
    for p in papers[:30]:  # Cap at 30 papers to avoid token overflow
        display = p["title_cn"] or p["title"] or p["id"]
        entry = f"- [{display}]({p['keywords']}) {p['summary']}"
        entries.append(entry)

    papers_text = "\n".join(entries)

    prompt = f"""你是一位研究助手。以下是本周新增的 {len(papers)} 篇论文：

{papers_text}

请生成一份本周论文研究动态简报，要求：
1. 总字数控制在500字以内
2. 按研究方向分组（例如：自进化、智能体强化学习、低空经济等），每组1-2句话概括
3. 在开头用一句话总结本周总体研究趋势
4. 在结尾点出2-3篇最值得关注的论文，并简述原因
5. 语言专业简洁，避免口语化"""

    client, model = get_chat_client()
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "你是一位专业的研究助手，擅长撰写学术研究简报。"},
            {"role": "user", "content": prompt},
        ],
        temperature=0.5,
        max_tokens=1500,
    )

    return resp.choices[0].message.content


def build_digest(days: int = 7) -> dict:
    """Build a digest for the last N days."""
    papers = find_recent_papers(days=days)
    if not papers:
        return {
            "count": 0,
            "days": days,
            "summary": "本周没有新增论文。",
            "papers": [],
        }

    summary = generate_digest(papers)
    return {
        "count": len(papers),
        "days": days,
        "summary": summary,
        "papers": [
            {
                "id": p["id"],
                "title": p["title"],
                "title_cn": p["title_cn"],
                "summary": p["summary"],
                "date": p["date"],
            }
            for p in papers
        ],
    }


def push_to_feishu(digest: dict) -> bool:
    """Push digest to Feishu via webhook."""
    webhook = os.environ.get("FEISHU_WEBHOOK", "") or FEISHU_WEBHOOK
    if not webhook:
        return False

    # Build markdown card
    paper_list = "\n".join([
        f"• {p['title_cn'] or p['title']}" for p in digest["papers"][:15]
    ])

    message = {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": f"📚 Paper KB · 本周简报（{digest['count']} 篇）",
                },
                "template": "orange",
            },
            "elements": [
                {
                    "tag": "markdown",
                    "content": digest["summary"],
                },
                {"tag": "hr"},
                {
                    "tag": "markdown",
                    "content": f"**新增论文列表**\n{paper_list}",
                },
            ],
        },
    }

    data = json.dumps(message).encode("utf-8")
    req = urllib.request.Request(
        webhook,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = resp.read().decode("utf-8")
            # Feishu returns {"code":0,"msg":"ok"} on success, non-zero code on failure
            try:
                result_json = json.loads(result)
                if result_json.get("code", 0) != 0:
                    print(f"Feishu push failed: {result_json}")
                    return False
            except Exception:
                pass
        return True
    except Exception as e:
        print(f"Feishu push failed: {e}")
        return False


if __name__ == "__main__":
    import sys
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    digest = build_digest(days=days)
    print(f"=== Weekly Digest ({digest['count']} papers in last {days} days) ===\n")
    print(digest["summary"])
    print("\n=== Papers ===")
    for p in digest["papers"]:
        print(f"  - {p['title_cn'] or p['title']} ({p['date']})")

    if FEISHU_WEBHOOK:
        ok = push_to_feishu(digest)
        print(f"\nFeishu push: {'✓' if ok else '✕'}")

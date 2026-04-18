"""
Deep Research agent: ReAct loop over the local paper KB, with optional arXiv / web tools.
Yields streaming events so the frontend can render the reasoning trace in real time.
"""

import os
import json
import re
import urllib.request
import urllib.parse

from rag import retrieve
from llm import get_chat_client

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))


# ────────────────────────── Tools ──────────────────────────

def tool_search_kb(query: str, top_k: int = 5) -> dict:
    chunks = retrieve(query, top_k=top_k)
    hits = []
    seen = set()
    for c in chunks:
        pid = c["paper_id"]
        if pid in seen:
            continue
        seen.add(pid)
        hits.append({
            "paper_id": pid,
            "title": c.get("title_cn") or c.get("title") or pid,
            "path": c.get("path", ""),
            "similarity": c.get("similarity", 0),
            "snippet": (c.get("content", "") or "")[:400],
        })
    return {"hits": hits, "count": len(hits)}


def tool_read_paper(paper_id: str) -> dict:
    # papers.json has rel paths; scan BASE_DIR for a matching dir or md
    papers_json = os.path.join(os.path.dirname(__file__), "papers.json")
    if os.path.exists(papers_json):
        with open(papers_json, "r", encoding="utf-8") as f:
            papers = json.load(f)
        for p in papers:
            if p.get("id") == paper_id:
                abs_path = p.get("abs_path", "").replace("/", os.sep)
                if os.path.exists(abs_path):
                    with open(abs_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    return {
                        "paper_id": paper_id,
                        "title": p.get("title_cn") or p.get("title") or paper_id,
                        "content": content[:6000],
                    }
    return {"error": f"paper not found: {paper_id}"}


def tool_search_arxiv(query: str, max_results: int = 5) -> dict:
    url = (
        "http://export.arxiv.org/api/query?"
        + urllib.parse.urlencode({
            "search_query": f"all:{query}",
            "start": 0,
            "max_results": max_results,
            "sortBy": "relevance",
        })
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            xml = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        return {"error": f"arxiv fetch failed: {e}"}

    entries = re.findall(r"<entry>(.*?)</entry>", xml, re.S)
    results = []
    for e in entries[:max_results]:
        def grab(tag):
            m = re.search(fr"<{tag}[^>]*>(.*?)</{tag}>", e, re.S)
            return (m.group(1).strip() if m else "").replace("\n", " ")
        arxiv_id = grab("id").split("/")[-1]
        results.append({
            "arxiv_id": arxiv_id,
            "title": grab("title"),
            "summary": grab("summary")[:500],
            "published": grab("published")[:10],
        })
    return {"results": results, "count": len(results)}


def tool_web_search(query: str) -> dict:
    key = os.environ.get("SERPER_API_KEY", "").strip()
    if not key:
        return {"error": "SERPER_API_KEY 未配置，web_search 不可用。请在 app/.env.local 中配置后重试。"}
    try:
        req = urllib.request.Request(
            "https://google.serper.dev/search",
            data=json.dumps({"q": query, "num": 5}).encode("utf-8"),
            headers={"X-API-KEY": key, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode("utf-8"))
        hits = [
            {"title": o.get("title", ""), "link": o.get("link", ""), "snippet": o.get("snippet", "")}
            for o in data.get("organic", [])[:5]
        ]
        return {"results": hits, "count": len(hits)}
    except Exception as e:
        return {"error": f"web search failed: {e}"}


TOOL_REGISTRY = {
    "search_kb": {
        "fn": tool_search_kb,
        "desc": "在本地论文知识库中语义检索相关片段。输入: {\"query\": str, \"top_k\": int(可选,默认5)}",
        "always": True,
    },
    "read_paper": {
        "fn": tool_read_paper,
        "desc": "读取某篇论文的完整 intro 内容。输入: {\"paper_id\": str}",
        "always": True,
    },
    "search_arxiv": {
        "fn": tool_search_arxiv,
        "desc": "在 arXiv 上检索相关论文元数据（标题+摘要）。输入: {\"query\": str}",
        "always": False,
    },
    "web_search": {
        "fn": tool_web_search,
        "desc": "使用 Serper 对公网进行搜索。输入: {\"query\": str}",
        "always": False,
    },
}


# ────────────────────────── ReAct Loop ──────────────────────────

SYSTEM_PROMPT = """你是一位深度研究助手（Deep Researcher），通过 ReAct 循环在本地论文知识库上完成长程调研。

## 可用工具
{tools}

## 输出协议（必须严格遵守）
每一轮你只能输出一个 JSON 对象（不要加 ```、不要加多余文字）。两种形式二选一：

1) 继续调研：
{{"thought": "我接下来的推理与计划", "action": "工具名", "action_input": {{...}}}}

2) 结束调研并给出最终报告（Markdown 格式）：
{{"thought": "证据已足够", "final_answer": "# 报告标题\\n\\n..."}}

## 策略
- 优先使用 search_kb 检索本地论文；发现相关论文后可用 read_paper 深入阅读。
- 同一个查询不要重复检索；每轮要推进调研（换关键词 / 读原文 / 交叉比对）。
- 最终报告要求：
  * 按子问题分组呈现关键发现
  * 用【论文标题】标注每一条论断的证据来源
  * 末尾给出"研究空白 / 未解问题"一节
  * 中文作答，风格学术、精炼
- 最多 {max_rounds} 轮，请合理分配。"""


def _build_tools_desc(enable_arxiv: bool, enable_web: bool) -> tuple:
    lines = []
    allowed = []
    for name, spec in TOOL_REGISTRY.items():
        if spec["always"]:
            ok = True
        elif name == "search_arxiv":
            ok = enable_arxiv
        elif name == "web_search":
            ok = enable_web
        else:
            ok = False
        if ok:
            lines.append(f"- **{name}**: {spec['desc']}")
            allowed.append(name)
    return "\n".join(lines), allowed


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    if start == -1:
        raise ValueError("no JSON object found")
    try:
        obj, _ = json.JSONDecoder().raw_decode(text, start)
        return obj
    except json.JSONDecodeError:
        end = text.rfind("}")
        if end == -1:
            raise ValueError("no JSON object found")
        return json.loads(text[start:end + 1])


def _truncate_obs(obs: dict, limit: int = 2000) -> str:
    s = json.dumps(obs, ensure_ascii=False)
    if len(s) > limit:
        s = s[:limit] + " …(truncated)"
    return s


def run(question: str, max_rounds: int = 4, enable_arxiv: bool = False, enable_web: bool = False):
    """Generator yielding SSE-friendly event dicts."""
    max_rounds = max(1, min(int(max_rounds), 16))
    tools_desc, allowed = _build_tools_desc(enable_arxiv, enable_web)
    system_prompt = SYSTEM_PROMPT.format(tools=tools_desc, max_rounds=max_rounds)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"研究问题：{question}\n\n请开始调研。"},
    ]

    yield {"type": "start", "question": question, "max_rounds": max_rounds,
           "enable_arxiv": enable_arxiv, "enable_web": enable_web,
           "allowed_tools": allowed}

    for round_idx in range(1, max_rounds + 1):
        try:
            client, model = get_chat_client()
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.3,
                max_tokens=1800,
            )
            raw = resp.choices[0].message.content or ""
        except Exception as e:
            yield {"type": "error", "message": f"LLM 调用失败: {e}"}
            return

        try:
            step = _parse_json(raw)
        except Exception:
            yield {"type": "error", "message": f"解析模型输出失败: {raw[:300]}"}
            return

        thought = step.get("thought", "")
        yield {"type": "thought", "round": round_idx, "content": thought}

        if "final_answer" in step:
            yield {"type": "final", "round": round_idx, "answer": step["final_answer"]}
            return

        action = step.get("action", "")
        action_input = step.get("action_input", {}) or {}

        if action not in allowed:
            obs = {"error": f"未知或未启用的工具: {action}。可用工具: {allowed}"}
        else:
            yield {"type": "action", "round": round_idx, "tool": action, "input": action_input}
            try:
                obs = TOOL_REGISTRY[action]["fn"](**action_input)
            except TypeError as e:
                obs = {"error": f"工具参数错误: {e}"}
            except Exception as e:
                obs = {"error": f"工具执行异常: {e}"}

        yield {"type": "observation", "round": round_idx, "tool": action, "result": obs}

        # feed back into the model
        messages.append({"role": "assistant", "content": raw})
        messages.append({
            "role": "user",
            "content": f"Observation: {_truncate_obs(obs)}\n\n请继续下一步（或给出 final_answer）。",
        })

    # Ran out of rounds — force a final summary
    messages.append({
        "role": "user",
        "content": "已达到最大轮数，请立即以 final_answer 形式输出最终报告（只返回 JSON）。",
    })
    try:
        resp = qwen_client.chat.completions.create(
            model="qwen-plus",
            messages=messages,
            temperature=0.3,
            max_tokens=1800,
        )
        raw = resp.choices[0].message.content or ""
        step = _parse_json(raw)
        yield {"type": "final", "round": max_rounds, "answer": step.get("final_answer", raw)}
    except Exception as e:
        yield {"type": "error", "message": f"生成最终报告失败: {e}"}


# ────────────────────────── History ──────────────────────────

HISTORY_FILE = os.path.join(os.path.dirname(__file__), "research_history.json")


def _load_history() -> list:
    if not os.path.exists(HISTORY_FILE):
        return []
    with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_history(history: list):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def save_research(question: str, trace: list, final_answer: str, rounds: int):
    import time
    history = _load_history()
    entry = {
        "id": f"r_{int(time.time())}",
        "question": question,
        "answer": final_answer,
        "rounds": rounds,
        "trace_count": len(trace),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    history.insert(0, entry)
    history = history[:50]
    _save_history(history)
    return entry


def get_history() -> list:
    return _load_history()


def delete_history(research_id: str) -> list:
    history = _load_history()
    history = [h for h in history if h["id"] != research_id]
    _save_history(history)
    return history

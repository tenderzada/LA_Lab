"""
RAG module: index papers with FAISS + OpenAI Embedding, answer with Qwen.
"""

import os
import json
import numpy as np
import faiss
from openai import OpenAI

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
INDEX_DIR = os.path.join(os.path.dirname(__file__), "rag_index")
FAISS_PATH = os.path.join(INDEX_DIR, "index.faiss")
META_PATH = os.path.join(INDEX_DIR, "meta.json")

EMBED_DIM = 1536  # text-embedding-3-small dimension

from llm import get_chat_client, get_embed_client


def get_embedding(texts: list) -> np.ndarray:
    """Get embeddings via OpenRouter. Returns numpy array (N, dim)."""
    resp = get_embed_client().embeddings.create(
        model="openai/text-embedding-3-small",
        input=texts,
    )
    vecs = [d.embedding for d in resp.data]
    return np.array(vecs, dtype="float32")


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start += chunk_size - overlap
    return chunks


def is_indexed() -> bool:
    return os.path.exists(FAISS_PATH) and os.path.exists(META_PATH)


def get_index_info() -> dict:
    if not is_indexed():
        return {"indexed": False, "chunks": 0}
    with open(META_PATH, "r", encoding="utf-8") as f:
        meta = json.load(f)
    return {"indexed": True, "chunks": len(meta)}


def build_index() -> int:
    """Scan all papers and build FAISS index."""
    os.makedirs(INDEX_DIR, exist_ok=True)

    # Load papers.json for metadata
    papers_json = os.path.join(os.path.dirname(__file__), "papers.json")
    papers_meta = {}
    if os.path.exists(papers_json):
        with open(papers_json, "r", encoding="utf-8") as f:
            for p in json.load(f):
                papers_meta[p["path"]] = p

    all_chunks = []
    all_metas = []

    for entry in os.listdir(BASE_DIR):
        full_path = os.path.join(BASE_DIR, entry)

        if entry in ("app", "figures", "pdf", "build_card.py", "extract_figure.py",
                      ".git", ".gitignore", ".claude", "README.md"):
            continue

        md_path = None
        if os.path.isdir(full_path):
            intro = os.path.join(full_path, "intro.md")
            if os.path.exists(intro):
                md_path = intro
            else:
                for f in os.listdir(full_path):
                    if f.endswith(".md"):
                        md_path = os.path.join(full_path, f)
                        break
        elif entry.endswith(".md"):
            md_path = full_path

        if not md_path:
            continue

        try:
            with open(md_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            continue

        if not content.strip():
            continue

        rel_path = os.path.relpath(md_path, BASE_DIR).replace("\\", "/")
        paper_id = rel_path.replace("/intro.md", "").replace(".md", "").split("/")[-1]

        meta = papers_meta.get(rel_path, {})
        title = meta.get("title", paper_id)
        title_cn = meta.get("title_cn", "")

        chunks = chunk_text(content)
        for ci, chunk in enumerate(chunks):
            all_chunks.append(chunk)
            all_metas.append({
                "paper_id": paper_id,
                "title": title[:200],
                "title_cn": title_cn[:200] if title_cn else "",
                "path": rel_path,
                "chunk_index": ci,
            })

    if not all_chunks:
        return 0

    # Embed in batches
    all_embeddings = []
    batch_size = 64
    for i in range(0, len(all_chunks), batch_size):
        batch = all_chunks[i:i + batch_size]
        embs = get_embedding(batch)
        all_embeddings.append(embs)
        print(f"  Embedded {min(i + batch_size, len(all_chunks))}/{len(all_chunks)} chunks")

    vectors = np.vstack(all_embeddings)

    # Normalize for cosine similarity
    faiss.normalize_L2(vectors)

    # Build FAISS index (Inner Product = cosine after normalization)
    index = faiss.IndexFlatIP(EMBED_DIM)
    index.add(vectors)

    # Save
    faiss.write_index(index, FAISS_PATH)
    # Save metadata + chunks together
    for i, m in enumerate(all_metas):
        m["text"] = all_chunks[i]
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(all_metas, f, ensure_ascii=False)

    n_papers = len(set(m["paper_id"] for m in all_metas))
    print(f"Index built: {len(all_chunks)} chunks from {n_papers} papers")
    return len(all_chunks)


def find_similar(paper_id: str, top_k: int = 5) -> list:
    """Find papers similar to the given paper_id by averaging its chunk embeddings."""
    if not is_indexed():
        return []

    index = faiss.read_index(FAISS_PATH)
    with open(META_PATH, "r", encoding="utf-8") as f:
        metas = json.load(f)

    # Find all chunks for this paper
    chunk_indices = [i for i, m in enumerate(metas) if m["paper_id"] == paper_id]
    if not chunk_indices:
        return []

    # Get vectors by reconstructing from FAISS
    source_vecs = np.array([index.reconstruct(i) for i in chunk_indices], dtype="float32")
    # Average the vectors as paper representation
    paper_vec = source_vecs.mean(axis=0, keepdims=True)
    faiss.normalize_L2(paper_vec)

    # Search for more to filter out same paper, get at least top_k distinct papers
    scores, indices = index.search(paper_vec, top_k * 20)

    # Dedupe by paper_id (exclude source paper)
    results = []
    seen = {paper_id}
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0 or idx >= len(metas):
            continue
        m = metas[idx]
        pid = m["paper_id"]
        if pid in seen:
            continue
        seen.add(pid)
        results.append({
            "paper_id": pid,
            "title": m.get("title", ""),
            "title_cn": m.get("title_cn", ""),
            "path": m.get("path", ""),
            "similarity": round(float(score), 3),
        })
        if len(results) >= top_k:
            break

    return results


def retrieve(query: str, top_k: int = 6) -> list:
    """Retrieve relevant chunks for a query."""
    if not is_indexed():
        return []

    index = faiss.read_index(FAISS_PATH)
    with open(META_PATH, "r", encoding="utf-8") as f:
        metas = json.load(f)

    q_vec = get_embedding([query])
    faiss.normalize_L2(q_vec)

    scores, indices = index.search(q_vec, top_k)

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0 or idx >= len(metas):
            continue
        m = metas[idx]
        results.append({
            "content": m["text"],
            "paper_id": m["paper_id"],
            "title": m.get("title", ""),
            "title_cn": m.get("title_cn", ""),
            "path": m.get("path", ""),
            "similarity": round(float(score), 3),
        })

    return results


def ask(query: str, history: list = None, top_k: int = 6) -> dict:
    """RAG: retrieve context and generate answer with Qwen. Supports multi-turn conversation."""
    history = history or []

    # For multi-turn: rewrite query using history for better retrieval
    search_query = query
    if history:
        # Use last user message + current query as search context
        recent_context = " ".join(
            [m["content"] for m in history[-4:] if m["role"] == "user"]
        )
        search_query = f"{recent_context} {query}"

    chunks = retrieve(search_query, top_k=top_k)

    if not chunks:
        return {
            "answer": "知识库尚未建立索引，请先点击 Build Index 按钮。",
            "sources": [],
        }

    # Build context & deduplicate sources
    context_parts = []
    sources = []
    seen = set()
    for c in chunks:
        pid = c["paper_id"]
        display = c["title_cn"] or c["title"] or pid
        context_parts.append(f"[{display}]\n{c['content']}")
        if pid not in seen:
            seen.add(pid)
            sources.append({
                "paper_id": pid,
                "title": c["title"],
                "title_cn": c["title_cn"],
                "path": c["path"],
                "similarity": c["similarity"],
            })

    context = "\n\n---\n\n".join(context_parts)

    system_prompt = """You are a research assistant for an academic paper knowledge base.
Rules:
- Answer in Chinese
- Cite which paper(s) support your answer using【论文标题】format
- If the context doesn't contain enough information, say so honestly
- Be concise and precise
- For follow-up questions, use the conversation history for context"""

    # Build messages: system + history + new turn with context
    messages = [{"role": "system", "content": system_prompt}]

    # Include recent history (last 6 turns max to save tokens)
    for m in history[-6:]:
        messages.append({"role": m["role"], "content": m["content"]})

    # Current turn: question + retrieved context
    user_content = f"""问题: {query}

相关论文片段:
{context}"""

    messages.append({"role": "user", "content": user_content})

    client, model = get_chat_client()
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.3,
        max_tokens=1500,
    )

    answer = resp.choices[0].message.content
    return {"answer": answer, "sources": sources}


if __name__ == "__main__":
    print("Building index...")
    count = build_index()
    print(f"Done. {count} chunks indexed.")

    if count > 0:
        result = ask("哪些论文研究了低空经济的信道估计问题？")
        print("\n=== Answer ===")
        print(result["answer"])
        print("\n=== Sources ===")
        for s in result["sources"]:
            print(f"  - {s['title_cn'] or s['title']} ({s['similarity']})")

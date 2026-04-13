"""
Flask server for Paper Knowledge Base
Run: python server.py
Visit: http://localhost:5100
"""

import os
import json
import traceback

# Load .env.local if present (simple parser, no external dep)
_env_local = os.path.join(os.path.dirname(__file__), ".env.local")
if os.path.exists(_env_local):
    with open(_env_local, "r", encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

from flask import Flask, render_template, jsonify, request
from scan import scan
from rag import build_index, ask, get_index_info, find_similar
from annotations import load_annotations, update_annotation
from arxiv_import import import_arxiv
from weekly_digest import build_digest, push_to_feishu

app = Flask(__name__)
BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
DATA_FILE = os.path.join(os.path.dirname(__file__), "papers.json")


def load_papers():
    if not os.path.exists(DATA_FILE):
        scan()
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/papers")
def api_papers():
    papers = load_papers()
    return jsonify(papers)


@app.route("/api/rescan", methods=["POST"])
def api_rescan():
    papers = scan()
    return jsonify({"count": len(papers)})


@app.route("/api/content")
def api_content():
    """Return the markdown content of a paper's intro file."""
    rel_path = request.args.get("path", "")
    if not rel_path:
        return jsonify({"error": "No path provided"}), 400

    abs_path = os.path.normpath(os.path.join(BASE_DIR, rel_path))
    # Security: ensure path is within BASE_DIR
    if not abs_path.startswith(BASE_DIR):
        return jsonify({"error": "Invalid path"}), 403

    if not os.path.exists(abs_path):
        return jsonify({"error": "File not found"}), 404

    with open(abs_path, "r", encoding="utf-8") as f:
        content = f.read()

    return jsonify({"content": content, "path": rel_path})


@app.route("/api/annotations")
def api_annotations_list():
    return jsonify(load_annotations())


@app.route("/api/annotations/<paper_id>", methods=["POST"])
def api_annotation_update(paper_id):
    data = request.get_json() or {}
    result = update_annotation(paper_id, data)
    return jsonify(result)


@app.route("/api/rag/status")
def rag_status():
    """Check if RAG index exists and its size."""
    info = get_index_info()
    return jsonify(info)


@app.route("/api/rag/build", methods=["POST"])
def rag_build():
    """Build or rebuild the RAG index."""
    try:
        # Ensure papers.json is fresh
        scan()
        count = build_index()
        return jsonify({"success": True, "chunks": count})
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "trace": traceback.format_exc()}), 500


@app.route("/api/digest")
def api_digest():
    """Generate a weekly digest of recent papers."""
    days = int(request.args.get("days", 7))
    try:
        result = build_digest(days=days)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route("/api/digest/push", methods=["POST"])
def api_digest_push():
    """Push the latest digest to Feishu."""
    if not os.environ.get("FEISHU_WEBHOOK", "").strip():
        return jsonify({
            "success": False,
            "error": "FEISHU_WEBHOOK 未配置。请在 app/.env.local 中添加此变量后重启服务。"
        })

    data = request.get_json() or {}
    days = int(data.get("days", 7))
    try:
        digest = build_digest(days=days)
        if digest["count"] == 0:
            return jsonify({"success": False, "error": "最近 7 天没有新增论文，无需推送。"})
        ok = push_to_feishu(digest)
        if ok:
            return jsonify({"success": True, "count": digest["count"]})
        else:
            return jsonify({"success": False, "error": "飞书 API 返回失败，请检查 Webhook 或关键词设置。"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/import_arxiv", methods=["POST"])
def api_import_arxiv():
    """Import a paper from arXiv."""
    data = request.get_json() or {}
    arxiv_input = data.get("input", "").strip()
    if not arxiv_input:
        return jsonify({"success": False, "error": "No input provided"}), 400

    try:
        result = import_arxiv(arxiv_input)
        if result.get("success"):
            scan()  # Refresh papers.json
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "trace": traceback.format_exc()}), 500


@app.route("/api/rag/similar")
def rag_similar():
    """Find papers similar to given paper_id."""
    paper_id = request.args.get("paper_id", "")
    if not paper_id:
        return jsonify({"error": "No paper_id"}), 400
    try:
        results = find_similar(paper_id, top_k=6)
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/rag/ask", methods=["POST"])
def rag_ask():
    """Ask a question using RAG with optional conversation history."""
    data = request.get_json()
    query = data.get("query", "").strip()
    history = data.get("history", [])
    if not query:
        return jsonify({"error": "Empty query"}), 400

    try:
        result = ask(query, history=history, top_k=6)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


if __name__ == "__main__":
    # Initial scan on startup
    if not os.path.exists(DATA_FILE):
        scan()
    print("Paper Knowledge Base: http://localhost:5100")
    app.run(host="0.0.0.0", port=5100, debug=False)

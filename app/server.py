"""
Flask server for Paper Knowledge Base
Run: python server.py
Visit: http://localhost:5100
"""

import os
import json
from flask import Flask, render_template, jsonify, request
from scan import scan

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


if __name__ == "__main__":
    # Initial scan on startup
    if not os.path.exists(DATA_FILE):
        scan()
    print("Paper Knowledge Base: http://localhost:5100")
    app.run(host="0.0.0.0", port=5100, debug=False)

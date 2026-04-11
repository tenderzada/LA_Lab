# Paper KB - Personal Research Knowledge Base

A lightweight Flask web app for browsing and searching your paper reading notes.

## Features

- Auto-scan `E:\Paper_Intro\` for `.md` paper introductions
- Date navigation (inferred from arXiv IDs or filenames)
- Source filtering (arXiv, TMC, ACL, etc.)
- Research topic categories (Self-Evolution, Agent RL, Tool Agents, LAE, etc.)
- Full-text search by title, keywords, or topic
- Click-to-read modal with markdown rendering
- Local file links for quick access

## Usage

```bash
cd E:/Paper_Intro/app
python server.py
# Visit http://localhost:5100
```

## Requirements

- Python 3.9+
- Flask (`pip install flask`)

## File Structure

```
app/
├── server.py          # Flask server (port 5100)
├── scan.py            # Scanner: parses all entries → papers.json
├── templates/
│   └── index.html     # Main page
└── static/
    ├── style.css      # Claude-style light theme
    └── app.js         # Frontend logic
```

## Adding Papers

Place `.md` files or subdirectories (with `intro.md`) under `E:\Paper_Intro\`, then click **Rescan** in the web UI.

Naming conventions:
- `2604.04949_LRAT.md` → date: 2026-04, source: arXiv
- `TMC_AutoRAN/intro.md` → source: TMC 2026
- `20260411_SomeWork.md` → date: 2026-04-11

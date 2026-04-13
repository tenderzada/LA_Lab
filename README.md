# 📚 Paper KB · 个人论文知识库

一个轻量级的本地 AI 论文知识管理 Web 应用。基于 Flask + FAISS + LLM，
为学术研究者提供**浏览、搜索、RAG 对话**三合一的私有知识库。

![Status](https://img.shields.io/badge/status-active-success)
![Python](https://img.shields.io/badge/python-3.9%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 核心功能

### 📖 知识库浏览
- **卡片式列表** 展示所有论文，标题、一句话介绍、关键词、来源一目了然
- **日期导航** 按年月折叠侧边栏，快速定位某个月的论文
- **多维过滤**：来源（arXiv / TMC / ACL 等）× 研究领域（10 个预设类别）× 阅读状态
- **全文搜索** 支持标题、关键词、核心主题的即时过滤
- **Markdown 渲染** 点击论文标题弹出完整的三段式介绍（动机 / 方法 / 实验）

### 🤖 RAG 智能对话
- 跨论文自然语言提问（"哪些论文用了自蒸馏做持续学习？"）
- **OpenAI Embedding** 向量化 + **FAISS** 语义检索
- **Qwen-Plus** 生成带引用的中文回答
- **多轮对话** 支持追问，对话历史自动传递上下文
- **引用可点击** 直接查看原文片段

### 🏷️ 个人标注系统
- **⭐ 星标** 标记重要论文
- **阅读状态** 📌 To Read → 📖 Reading → ✅ Read 循环切换
- 按状态过滤（仅看已加星 / 仅看待读）
- 所有标注持久化到本地 `annotations.json`

### 🔍 相似论文推荐
基于 FAISS 向量空间，一键找到语义相似的论文。原理：对目标论文的所有段落向量取平均作为"论文向量"，在索引中检索最近邻。

### 📰 每周研究简报
- 扫描最近 7 天新增 / 修改的论文
- Qwen 自动按研究方向分组，生成 500 字内的中文研究动态
- 支持一键推送到**飞书群聊**（可选）

### ⚡ arXiv 一键录入
输入 arXiv ID 或 URL，自动完成：
1. 从 arXiv API 拉取元数据
2. 下载 PDF 到论文目录
3. PyMuPDF 提取正文前 6 页
4. Qwen 生成三段式中文介绍（动机 / 方法 / 实验）
5. 自动保存为 `intro.md` 并刷新索引

### ⌨️ 键盘快捷键
| 快捷键 | 作用 |
|--------|------|
| `Ctrl+K` 或 `/` | 聚焦搜索框 |
| `Ctrl+J` | 打开/关闭对话面板 |
| `Esc` | 关闭弹窗或对话面板 |
| `Enter`（聊天框内） | 发送问题 |

---

## 🎨 视觉风格

深度参考 Claude.ai 的浅色暖白设计系统：
- 陶土橙（`#C8553A`）强调色
- 奶油白（`#FAF9F6`）主背景
- 清晰的层级与留白
- 平滑的过渡动画

---

## 🚀 快速开始

### 环境要求
- Python 3.9+
- Windows / macOS / Linux（已在 Windows 11 测试通过）

### 1. 安装依赖

```bash
pip install flask openai faiss-cpu numpy PyMuPDF
```

### 2. 配置 API Key

本项目使用两个 LLM 服务：

| 用途 | 服务 | 环境变量 |
|------|------|---------|
| Embedding | OpenAI / OpenRouter | `OPENAI_API_KEY` |
| 对话 & 摘要 | Qwen (DashScope) | `DASHSCOPE_API_KEY` |
| 飞书推送（可选） | Feishu Webhook | `FEISHU_WEBHOOK` |

**设置方式（Windows PowerShell）**：
```powershell
$env:OPENAI_API_KEY = "sk-..."
$env:DASHSCOPE_API_KEY = "sk-..."
$env:FEISHU_WEBHOOK = "https://open.feishu.cn/..."  # 可选
```

**设置方式（Bash / Zsh）**：
```bash
export OPENAI_API_KEY="sk-..."
export DASHSCOPE_API_KEY="sk-..."
```

> **申请渠道**：
> - OpenAI: https://platform.openai.com/api-keys
> - OpenRouter（OpenAI 兼容，支持多模型）: https://openrouter.ai/
> - Qwen / DashScope: https://dashscope.console.aliyun.com/

### 3. 准备论文数据

把你的论文介绍 `.md` 文件放到项目根目录（与 `app/` 同级）下。

**命名约定**（决定日期和来源的自动推断）：

| 格式 | 示例 | 推断结果 |
|------|------|---------|
| arXiv 编号前缀 | `2604.04949_LRAT.md` | 日期: 2026-04，来源: arXiv |
| 日期前缀 | `20260411_SomeWork.md` | 日期: 2026-04-11，来源: arXiv |
| 子目录 + `intro.md` | `TMC_AutoRAN/intro.md` | 来源: TMC 2026 |
| 会议前缀 | `ACL2025_XXX.md` | 来源: ACL |

**建议的 intro.md 三段式结构**：

```markdown
**关键词**: 关键词1, 关键词2, 关键词3

📚arXiv: 2604.04949
✏️标题: Learning to Retrieve from Agent Trajectories
🏷️中文标题：基于智能体轨迹的检索模型训练
📄一句话介绍：利用搜索智能体的交互轨迹作为监督信号训练检索模型

🎯动机
（研究背景、发展脉络、研究空白）

💡方法与创新
（核心方法、创新点、技术亮点）

📊实验设计
（基准、主要结果、消融结论）
```

扫描器会自动提取这些字段用于展示。

### 4. 启动服务

```bash
cd app
python server.py
```

访问 **http://localhost:5100**

首次启动会自动扫描论文目录生成 `papers.json`。

### 5. 构建 RAG 索引

1. 点击右下角的 💬 对话气泡打开对话面板
2. 点击 **Build Index** 按钮（首次需等 1-3 分钟，取决于论文数量）
3. 构建完成后即可开始提问

---

## 📋 界面说明

```
┌──────────────────┬──────────────────────────────────────────────┐
│   Sidebar        │  Top Bar (Search + Import + Digest + Rescan) │
│                  ├──────────────────────────────────────────────┤
│  📚 Paper KB     │  [All] [arXiv] [TMC] ...         ← 来源过滤 │
│                  │  [All] [⭐ Starred] [📌 To Read] ← 状态过滤 │
│  📊 Stats        │                                              │
│  228 / 4         │  Research Topics:                            │
│                  │  [🔄 自进化] [🎮 智能体RL] [🔧 工具智能体]  │
│  📅 Date Nav     │  [🛩️ 低空经济] ...            ← 领域过滤   │
│  ▼ 2026  (180)   │                                              │
│    4月    15     │  ┌──────────────────────────────────┐        │
│    3月    43     │  │  1. 论文标题 ☆ [状态]           │        │
│    2月    62     │  │     English Title                │        │
│    1月    55     │  │     一句话介绍                   │        │
│  ▼ 2025   (48)   │  │     [arXiv] [2026-04] [标签]     │        │
│    12月    9     │  │                   ✨ Similar ↗   │        │
│    ...           │  └──────────────────────────────────┘        │
│                  │  ...                                         │
│                  │                                         💬   │
└──────────────────┴──────────────────────────────────────────────┘
```

### 顶部操作
- **Search** — 全文搜索（快捷键 `Ctrl+K` 或 `/`）
- **+ arXiv** — 从 arXiv ID/URL 一键导入新论文
- **📰 Digest** — 查看本周研究简报
- **Rescan** — 重新扫描论文目录（新增 `.md` 后点这个）

### 论文卡片
- **标题** 点击查看完整介绍弹窗
- **☆ / ★** 点击切换星标
- **状态按钮** 点击循环切换阅读状态
- **✨ Similar** 点击查找相似论文
- **Open file ↗** 打开本地原文件

### 对话面板（右下角 💬 按钮）
- 输入问题 → Enter 发送
- **+** 按钮开始新对话（清空历史）
- 回答下方显示引用来源，可点击查看原文
- 索引状态显示（`● Index ready (N chunks)`）

---

## 🏗️ 项目结构

```
Paper_Intro/
├── app/
│   ├── server.py           # Flask 服务器（端口 5100）
│   ├── scan.py             # 扫描器：生成 papers.json
│   ├── rag.py              # RAG 核心：索引构建 + 检索 + 问答
│   ├── annotations.py      # 个人标注持久化
│   ├── arxiv_import.py     # arXiv 自动抓取
│   ├── weekly_digest.py    # 每周简报生成
│   ├── templates/
│   │   └── index.html      # 主页面
│   ├── static/
│   │   ├── style.css       # Claude 风格设计系统
│   │   └── app.js          # 前端逻辑
│   ├── papers.json         # 论文元数据（自动生成）
│   ├── annotations.json    # 个人标注（自动生成）
│   └── rag_index/          # FAISS 索引持久化
│       ├── index.faiss
│       └── meta.json
│
├── 2604.xxxxx_PaperName.md      # 论文介绍（单文件）
├── TMC_SomeTitle/                # 或子目录形式
│   ├── intro.md
│   └── paper.pdf                # PDF 可选
├── ...
├── README.md
└── .gitignore
```

---

## 🔧 常见操作

### 添加新论文

**方式 A：手动添加**
1. 把 `.md` 文件按命名约定放到根目录
2. 点击页面顶部的 **Rescan**
3. 如需加入对话，在对话面板点 **Build Index**

**方式 B：arXiv 自动录入**
1. 点击顶部 **+ arXiv** 按钮
2. 粘贴 arXiv ID（如 `2604.04949`）或完整 URL
3. 等待 30-60 秒自动下载 + 生成介绍
4. 对话面板点 **Build Index** 加入索引

### 让 LLM 回答更精准

- **多轮追问**：对答案不满意时直接追问 "能更具体展开这个方法吗？"
- **加 Context**：提问时明确范围 "在低空经济类论文中，..."
- **定期更新索引**：新增论文后重新 Build Index

### 导出数据

所有数据都是纯文本 / JSON，可以直接备份：
```bash
# 备份论文数据（所有 .md 文件）
# 备份标注
cp app/annotations.json backup/

# 备份向量索引（可选，可重建）
cp -r app/rag_index backup/
```

---

## 🎯 设计理念

1. **本地优先** — 所有数据留在本地，不依赖云服务
2. **零配置上手** — 两个 API key 就能运行，无需 Docker / 数据库
3. **增量索引** — 新论文只需重建 FAISS 索引，不影响现有数据
4. **三段式结构** — 强制论文介绍遵循"动机 / 方法 / 实验"格式，方便检索和对比
5. **视觉简洁** — 克制的配色和留白，减少阅读疲劳

---

## 🤝 贡献

欢迎提 Issue 和 PR。一些待做方向：

- [ ] 按章节智能分块（动机/方法/实验独立切块）
- [ ] Reranker 重排序提升 RAG 精度
- [ ] 流式输出（Server-Sent Events）
- [ ] 按研究领域限定对话范围
- [ ] 引用高亮原文段落
- [ ] 暗色模式切换
- [ ] Docker Compose 一键部署

---

## 📜 License

MIT License — 自由使用和修改。

## 🙏 致谢

- **Claude.ai** — 视觉设计灵感
- **FAISS** — Facebook AI 高效向量检索
- **Qwen** — 阿里通义千问大模型
- **Flask** — 简洁的 Python Web 框架

---

> Built with ☕ by tianjiang · Powered by Claude Code

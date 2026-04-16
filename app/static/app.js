// Paper Knowledge Base - Frontend Logic

let allPapers = [];
let annotations = {};
let currentFilter = { date: null, source: null, category: null, status: null, search: "" };

// ── Research Categories ──
const CATEGORIES = [
  {
    name: "自进化",
    icon: "🔄",
    keywords: ["self-evolv", "self-improv", "self-refin", "self-distill", "self-play", "自进化",
               "continual learn", "lifelong", "self-train", "bootstrap", "自蒸馏", "持续学习"]
  },
  {
    name: "智能体RL",
    icon: "🎮",
    keywords: ["reinforcement learn", "rl agent", "agent rl", "agentic rl", "reward model",
               "policy optim", "ppo", "dpo", "grpo", "rlhf", "rlvr", "强化学习"]
  },
  {
    name: "工具智能体",
    icon: "🔧",
    keywords: ["tool use", "tool-use", "tool call", "tool learn", "function call",
               "tool agent", "api agent", "工具调用", "工具使用", "tool augment"]
  },
  {
    name: "低空经济",
    icon: "🛩️",
    keywords: ["low-altitude", "low altitude", "uav", "drone", "aerial", "低空",
               "lawn", "lae", "unmanned aerial"]
  },
  {
    name: "Harness",
    icon: "🏗️",
    keywords: ["harness", "benchmark", "swe-bench", "testbed", "sandbox", "gym",
               "evaluation framework", "eval bench"]
  },
  {
    name: "Skill",
    icon: "⚡",
    keywords: ["skill", "skill learn", "skill discov", "skill transfer", "skill acqui",
               "capability", "技能"]
  },
  {
    name: "边缘智能",
    icon: "📡",
    keywords: ["edge intellig", "edge comput", "edge-cloud", "edge ai", "on-device",
               "mobile comput", "边缘智能", "边缘计算", "端侧", "端云"]
  },
  {
    name: "SWE Agent",
    icon: "💻",
    keywords: ["swe-agent", "swe agent", "software engineer", "code agent", "coding agent",
               "swe-bench", "auto debug", "auto fix", "code repair"]
  },
  {
    name: "RAG",
    icon: "📚",
    keywords: ["rag", "retrieval augment", "retrieval-augment", "graphrag", "knowledge graph",
               "retriev", "检索增强"]
  },
  {
    name: "多模态",
    icon: "👁️",
    keywords: ["multimodal", "multi-modal", "vision-language", "vlm", "多模态",
               "visual question", "image understanding"]
  }
];

function matchCategory(paper) {
  const haystack = [paper.title, paper.title_cn, paper.keywords, paper.summary, paper.id]
    .join(" ").toLowerCase();
  const matched = [];
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(kw => haystack.includes(kw))) {
      matched.push(cat);
    }
  }
  return matched;
}

const MONTH_NAMES = [
  "", "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月"
];

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  loadPapers();
  document.getElementById("searchInput").addEventListener("input", onSearch);
});

async function loadPapers() {
  showLoading(true);
  try {
    const [papersRes, annotRes] = await Promise.all([
      fetch("/api/papers"),
      fetch("/api/annotations"),
    ]);
    allPapers = await papersRes.json();
    annotations = await annotRes.json();
    buildSidebar();
    renderCards();
    updateStats();
  } catch (e) {
    console.error("Failed to load papers:", e);
  }
  showLoading(false);
}

function getAnnotation(paperId) {
  return annotations[paperId] || { starred: false, status: "", notes: "" };
}

async function saveAnnotation(paperId, updates) {
  try {
    const res = await fetch(`/api/annotations/${encodeURIComponent(paperId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    annotations[paperId] = data;
    return data;
  } catch (e) {
    console.error("Failed to save annotation:", e);
  }
}

async function toggleStar(paperId, e) {
  if (e) e.stopPropagation();
  const curr = getAnnotation(paperId);
  await saveAnnotation(paperId, { starred: !curr.starred });
  renderCards();
}

async function cycleStatus(paperId, e) {
  if (e) e.stopPropagation();
  const curr = getAnnotation(paperId);
  const cycle = ["", "todo", "reading", "read"];
  const idx = cycle.indexOf(curr.status || "");
  const next = cycle[(idx + 1) % cycle.length];
  await saveAnnotation(paperId, { status: next });
  renderCards();
}

const STATUS_LABELS = {
  "": { icon: "", label: "None" },
  "todo": { icon: "📌", label: "To Read" },
  "reading": { icon: "📖", label: "Reading" },
  "read": { icon: "✅", label: "Read" },
};

// ── Sidebar ──
function buildSidebar() {
  const nav = document.getElementById("dateNav");
  const grouped = {};

  allPapers.forEach(p => {
    const ym = p.date.substring(0, 7);
    const year = ym.substring(0, 4);
    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][ym]) grouped[year][ym] = 0;
    grouped[year][ym]++;
  });

  const years = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  let html = `<div class="nav-all active" onclick="filterAll()">
    <span>All Papers</span>
    <span class="count">${allPapers.length}</span>
  </div>`;

  years.forEach(year => {
    const months = Object.keys(grouped[year]).sort((a, b) => b.localeCompare(a));
    const yearCount = months.reduce((s, m) => s + grouped[year][m], 0);

    html += `<div class="nav-year">
      <div class="nav-year-header" onclick="toggleYear(this)">
        <span class="arrow">▼</span>
        <span>${year}</span>
        <span class="count">${yearCount}</span>
      </div>
      <div class="nav-months">`;

    months.forEach(ym => {
      const parts = ym.split("-");
      const monthNum = parts.length > 1 ? parseInt(parts[1]) : 0;
      const label = monthNum > 0 ? MONTH_NAMES[monthNum] : ym;
      html += `<div class="nav-month" data-ym="${ym}" onclick="filterByDate('${ym}', this)">
        <span class="month-name">${label}</span>
        <span class="month-count">${grouped[year][ym]}</span>
      </div>`;
    });

    html += `</div></div>`;
  });

  nav.innerHTML = html;
  buildSourceFilters();
  buildStatusFilters();
  buildCategoryFilters();
}

function buildSourceFilters() {
  const sources = {};
  allPapers.forEach(p => { sources[p.source] = (sources[p.source] || 0) + 1; });

  const container = document.getElementById("sourceFilters");
  let html = `<button class="source-pill active" onclick="filterBySource(null, this)">All</button>`;
  Object.entries(sources)
    .sort((a, b) => b[1] - a[1])
    .forEach(([src, count]) => {
      html += `<button class="source-pill" onclick="filterBySource('${src}', this)">${src} (${count})</button>`;
    });
  container.innerHTML = html;
}

function buildStatusFilters() {
  const container = document.getElementById("statusFilters");
  let starredCount = 0;
  const statusCounts = { todo: 0, reading: 0, read: 0 };
  Object.values(annotations).forEach(a => {
    if (a.starred) starredCount++;
    if (a.status && statusCounts[a.status] !== undefined) statusCounts[a.status]++;
  });

  let html = `<button class="status-pill active" onclick="filterByStatus(null, this)">All</button>`;
  if (starredCount > 0) {
    html += `<button class="status-pill star" onclick="filterByStatus('starred', this)">★ Starred (${starredCount})</button>`;
  }
  if (statusCounts.todo > 0) {
    html += `<button class="status-pill" onclick="filterByStatus('todo', this)">📌 To Read (${statusCounts.todo})</button>`;
  }
  if (statusCounts.reading > 0) {
    html += `<button class="status-pill" onclick="filterByStatus('reading', this)">📖 Reading (${statusCounts.reading})</button>`;
  }
  if (statusCounts.read > 0) {
    html += `<button class="status-pill" onclick="filterByStatus('read', this)">✅ Read (${statusCounts.read})</button>`;
  }
  container.innerHTML = html;
}

function filterByStatus(status, el) {
  currentFilter.status = status;
  document.querySelectorAll(".status-pill").forEach(e => e.classList.remove("active"));
  el.classList.add("active");
  renderCards();
}

function buildCategoryFilters() {
  const container = document.getElementById("categoryFilters");
  // Count papers per category
  const counts = {};
  CATEGORIES.forEach(cat => { counts[cat.name] = 0; });
  allPapers.forEach(p => {
    matchCategory(p).forEach(cat => { counts[cat.name]++; });
  });

  let html = `<button class="cat-pill active" onclick="filterByCategory(null, this)">All</button>`;
  CATEGORIES.forEach(cat => {
    if (counts[cat.name] > 0) {
      html += `<button class="cat-pill" onclick="filterByCategory('${cat.name}', this)">${cat.icon} ${cat.name} (${counts[cat.name]})</button>`;
    }
  });
  container.innerHTML = html;
}

// ── Filtering ──
function filterAll() {
  currentFilter.date = null;
  document.querySelectorAll(".nav-month, .nav-all").forEach(el => el.classList.remove("active"));
  document.querySelector(".nav-all").classList.add("active");
  updateFilterLabel();
  renderCards();
}

function filterByDate(ym, el) {
  currentFilter.date = ym;
  document.querySelectorAll(".nav-month, .nav-all").forEach(el => el.classList.remove("active"));
  el.classList.add("active");
  updateFilterLabel();
  renderCards();
}

function filterBySource(source, el) {
  currentFilter.source = source;
  document.querySelectorAll(".source-pill").forEach(el => el.classList.remove("active"));
  el.classList.add("active");
  renderCards();
}

function filterByCategory(catName, el) {
  currentFilter.category = catName;
  document.querySelectorAll(".cat-pill").forEach(el => el.classList.remove("active"));
  el.classList.add("active");
  renderCards();
}

function onSearch(e) {
  currentFilter.search = e.target.value.toLowerCase();
  renderCards();
}

function toggleYear(header) {
  header.classList.toggle("collapsed");
  const months = header.nextElementSibling;
  if (header.classList.contains("collapsed")) {
    months.style.maxHeight = "0";
    months.style.overflow = "hidden";
  } else {
    months.style.maxHeight = "500px";
    months.style.overflow = "";
  }
}

function updateFilterLabel() {
  const label = document.getElementById("filterLabel");
  if (!currentFilter.date) {
    label.innerHTML = "Showing <strong>all papers</strong>";
  } else {
    label.innerHTML = `Showing papers from <strong>${currentFilter.date}</strong>`;
  }
}

// ── Filtered papers ──
function getFilteredPapers() {
  return allPapers.filter(p => {
    if (currentFilter.date && !p.date.startsWith(currentFilter.date)) return false;
    if (currentFilter.source && p.source !== currentFilter.source) return false;
    if (currentFilter.status) {
      const ann = getAnnotation(p.id);
      if (currentFilter.status === "starred") {
        if (!ann.starred) return false;
      } else if (ann.status !== currentFilter.status) {
        return false;
      }
    }
    if (currentFilter.category) {
      const cats = matchCategory(p).map(c => c.name);
      if (!cats.includes(currentFilter.category)) return false;
    }
    if (currentFilter.search) {
      const q = currentFilter.search;
      const haystack = [p.title, p.title_cn, p.keywords, p.summary, p.source, p.id]
        .join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// ── Card Rendering ──
function renderCards() {
  const papers = getFilteredPapers();
  const container = document.getElementById("paperList");

  if (papers.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="icon">📭</div>
      <p>No papers match your filters</p>
    </div>`;
    return;
  }

  container.innerHTML = papers.map((p, i) => {
    const displayTitle = p.title_cn || p.title || p.id;
    const enTitle = (p.title && p.title_cn) ? p.title : "";
    const fileUrl = "file:///" + p.abs_path.replace(/\\/g, "/");
    const sourceClass = p.source.toLowerCase().includes("arxiv") ? "arxiv"
      : p.source.toLowerCase().includes("tmc") ? "tmc" : "other";
    const cats = matchCategory(p);
    const catTags = cats.map(c => `<span class="paper-cat-tag" onclick="filterByCategory('${c.name}', document.querySelector('.cat-pill[onclick*=\\'${c.name}\\']'))">${c.icon} ${c.name}</span>`).join("");
    const ann = getAnnotation(p.id);
    const statusInfo = STATUS_LABELS[ann.status || ""];
    const starClass = ann.starred ? "starred" : "";

    return `<div class="paper-card">
      <div class="paper-card-top">
        <div class="paper-num">${i + 1}</div>
        <div class="paper-info">
          <div class="paper-title-row">
            <a class="paper-title" onclick="showPaperContent('${encodeURIComponent(p.path)}', '${escapeAttr(displayTitle)}')">${escapeHtml(displayTitle)}</a>
            <button class="paper-star ${starClass}" onclick="toggleStar('${escapeAttr(p.id)}', event)" title="${ann.starred ? 'Unstar' : 'Star'}">${ann.starred ? "★" : "☆"}</button>
            <button class="paper-status-btn" onclick="cycleStatus('${escapeAttr(p.id)}', event)" title="Click to cycle status">${statusInfo.icon || "○"} <span class="status-label">${statusInfo.label}</span></button>
          </div>
          ${enTitle ? `<div class="paper-en-title">${escapeHtml(enTitle)}</div>` : ""}
          ${p.summary ? `<div class="paper-summary-text">${escapeHtml(p.summary)}</div>` : ""}
          <div class="paper-meta">
            <span class="paper-source ${sourceClass}">${escapeHtml(p.source)}</span>
            <span class="paper-date-tag">${p.date}</span>
            ${catTags}
            <a class="paper-action-link" onclick="findSimilar('${escapeAttr(p.id)}', '${escapeAttr(displayTitle)}')">✨ Similar</a>
            <a class="paper-path-link" href="${fileUrl}" title="${escapeAttr(p.abs_path)}">Open file ↗</a>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

// ── Modal ──
async function showPaperContent(encodedPath, title) {
  const path = decodeURIComponent(encodedPath);
  const overlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  modalTitle.textContent = title;
  modalBody.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading...</div>';
  overlay.classList.add("active");

  try {
    const res = await fetch(`/api/content?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.error) {
      modalBody.innerHTML = `<p style="color:var(--accent)">${data.error}</p>`;
    } else {
      modalBody.innerHTML = renderMarkdown(data.content);
    }
  } catch (e) {
    modalBody.innerHTML = `<p style="color:var(--accent)">Failed to load content</p>`;
  }
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("active");
}

// ── Find Similar Papers ──
async function findSimilar(paperId, title) {
  const overlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  modalTitle.textContent = `Papers similar to: ${title}`;
  modalBody.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Finding similar papers...</div>';
  overlay.classList.add("active");

  try {
    const res = await fetch(`/api/rag/similar?paper_id=${encodeURIComponent(paperId)}`);
    const data = await res.json();
    if (data.error) {
      modalBody.innerHTML = `<p style="color:var(--accent)">${data.error}</p>`;
      return;
    }
    if (!data.results || data.results.length === 0) {
      modalBody.innerHTML = `<p style="color:var(--text-muted)">No similar papers found. Make sure the RAG index is built.</p>`;
      return;
    }

    let html = '<div class="similar-list">';
    data.results.forEach((r, i) => {
      const display = r.title_cn || r.title || r.paper_id;
      const sim = Math.round(r.similarity * 100);
      html += `<div class="similar-item" onclick="showPaperContent('${encodeURIComponent(r.path)}', '${escapeAttr(display)}')">
        <div class="similar-num">${i + 1}</div>
        <div class="similar-info">
          <div class="similar-title">${escapeHtml(display)}</div>
          ${r.title && r.title_cn ? `<div class="similar-entitle">${escapeHtml(r.title)}</div>` : ""}
        </div>
        <div class="similar-score">${sim}%</div>
      </div>`;
    });
    html += '</div>';
    modalBody.innerHTML = html;
  } catch (e) {
    modalBody.innerHTML = `<p style="color:var(--accent)">Failed to find similar papers</p>`;
  }
}

document.addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// ── Markdown Renderer ──
function renderMarkdown(text) {
  let html = text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, '<h3 style="margin:18px 0 8px;font-size:15px;font-weight:600;color:var(--accent)">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="margin:22px 0 10px;font-size:17px;font-weight:650;color:var(--accent)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="margin:22px 0 10px;font-size:19px;font-weight:700;color:var(--accent)">$1</h1>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return `<p>${html}</p>`;
}

// ── Utilities ──
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function truncate(str, len) {
  if (!str || str.length <= len) return str;
  return str.substring(0, len) + "...";
}

function showLoading(show) {
  const el = document.getElementById("loadingState");
  if (el) el.style.display = show ? "block" : "none";
}

function updateStats() {
  document.getElementById("statTotal").textContent = allPapers.length;
  const sources = new Set(allPapers.map(p => p.source));
  document.getElementById("statSources").textContent = sources.size;
}

// ── Help / Usage Guide ──
let helpLang = "zh";  // "zh" or "en"

function showHelp() {
  const overlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  modalTitle.textContent = "📚 Paper KB · 使用说明";
  renderHelpContent(modalBody);
  overlay.classList.add("active");
}

function toggleHelpLang() {
  helpLang = helpLang === "zh" ? "en" : "zh";
  const modalBody = document.getElementById("modalBody");
  const modalTitle = document.getElementById("modalTitle");
  modalTitle.textContent = helpLang === "zh" ? "📚 Paper KB · 使用说明" : "📚 Paper KB · How to Use";
  renderHelpContent(modalBody);
}

function renderHelpContent(modalBody) {
  const langBtn = `<button class="help-lang-btn" onclick="toggleHelpLang()">
    ${helpLang === "zh" ? "🌐 English" : "🌐 中文"}
  </button>`;

  if (helpLang === "zh") {
    modalBody.innerHTML = `
      ${langBtn}
      <div class="help-content">
        <h3>✨ 核心功能</h3>

        <div class="help-section">
          <h4>📖 浏览与过滤</h4>
          <p>左侧边栏按<strong>年 / 月</strong>分组展示论文（日期从 arXiv 编号自动推断）。
          顶部 pills 支持三维过滤：<strong>来源</strong>（arXiv / TMC / ACL 等）、
          <strong>状态</strong>（星标 / 待读 / 阅读中）、<strong>研究领域</strong>（10 个预设分类）。</p>
          <p>搜索框支持跨标题、关键词、一句话介绍的即时模糊匹配。</p>
        </div>

        <div class="help-section">
          <h4>🤖 RAG 智能对话</h4>
          <p>点击右下角 <strong>💬 对话气泡</strong> 打开对话面板。<strong>首次使用</strong>需要先点
          <strong>Build Index</strong> 构建向量索引（1-3 分钟，取决于论文数量）。</p>
          <p>之后可以用自然语言跨论文提问，例如"哪些论文用了自蒸馏做持续学习？"。系统会检索相关段落并用中文回答，
          附带可点击的引用来源。</p>
          <p><strong>多轮追问：</strong>对答案不满意可直接追问"能更具体展开吗？"，对话历史会自动传递上下文。
          点击头部 <strong>+</strong> 按钮开启新对话。</p>
        </div>

        <div class="help-section">
          <h4>🏷️ 个人标注</h4>
          <ul>
            <li><strong>★ 星标</strong> —— 点击标题旁的星号标记重要论文</li>
            <li><strong>阅读状态</strong> —— 点击状态按钮循环切换：无 → 📌 待读 → 📖 阅读中 → ✅ 已读</li>
            <li>顶部过滤条可快速查看"仅星标"或"仅待读"的论文</li>
            <li>所有标注持久化在本地 <code>annotations.json</code></li>
          </ul>
        </div>

        <div class="help-section">
          <h4>✨ 相似论文推荐</h4>
          <p>在任意论文卡片点击 <strong>✨ Similar</strong>，基于 FAISS 向量空间找到 6 篇语义最相似的论文。
          原理：对目标论文所有段落向量取平均作为"论文向量"，在索引中检索最近邻。</p>
        </div>

        <div class="help-section">
          <h4>+ arXiv 一键录入</h4>
          <p>点击顶部 <strong>+ arXiv</strong> 按钮，粘贴 arXiv ID（如 <code>2604.04949</code>）或完整 URL，
          系统会自动：</p>
          <ol>
            <li>从 arXiv API 拉取论文元数据</li>
            <li>下载 PDF 到对应目录</li>
            <li>PyMuPDF 提取正文前 6 页</li>
            <li>Qwen-Plus 生成三段式中文介绍</li>
            <li>自动保存为 <code>intro.md</code></li>
          </ol>
          <p>整个流程约 30-60 秒。</p>
        </div>

        <div class="help-section">
          <h4>📰 每周研究简报</h4>
          <p>点击 <strong>📰 Digest</strong> 按钮，系统扫描最近 7 天新增 / 修改的论文，
          调用 Qwen 按研究方向分组生成 500 字内的中文研究动态简报。</p>
          <p>如果配置了飞书 Webhook 环境变量 <code>FEISHU_WEBHOOK</code>，可一键推送到群聊。</p>
        </div>

        <h3 style="margin-top:24px">⌨️ 键盘快捷键</h3>
        <div class="shortcut-grid">
          <div class="shortcut-row"><kbd>Ctrl+K</kbd> 或 <kbd>/</kbd><span>聚焦搜索框</span></div>
          <div class="shortcut-row"><kbd>Ctrl+J</kbd><span>打开 / 关闭对话面板</span></div>
          <div class="shortcut-row"><kbd>Esc</kbd><span>关闭弹窗或对话面板</span></div>
          <div class="shortcut-row"><kbd>Enter</kbd><span>发送对话消息（聊天框内）</span></div>
        </div>

        <h3 style="margin-top:24px">📝 论文文件规范</h3>
        <p>为了获得最佳解析效果，推荐按以下三段式结构撰写 <code>.md</code> 文件：</p>
        <pre class="help-code">**关键词**: 关键词1, 关键词2, 关键词3

📚arXiv: 2604.xxxxx
✏️标题: English Paper Title
🏷️中文标题：中文简短标题（≤20字）
📄一句话介绍：核心贡献的一句话概括

🎯动机
（研究背景、发展脉络、研究空白）

💡方法与创新
（核心方法、创新点、技术亮点）

📊实验设计
（评测基准、主要结果、消融结论）</pre>

        <p><strong>文件命名约定</strong>（决定日期和来源的自动推断）：</p>
        <ul>
          <li><code>2604.04949_PaperName.md</code> —— arXiv 编号前缀 → 日期: 2026-04，来源: arXiv</li>
          <li><code>TMC_AutoRAN/intro.md</code> —— 子目录 + intro.md → 来源: TMC 2026</li>
          <li><code>20260412_SomeWork.md</code> —— 日期前缀 → 精确日期</li>
          <li><code>ACL2025_XXX.md</code> —— 会议前缀 → 来源: ACL</li>
        </ul>

        <h3 style="margin-top:24px">🔧 使用技巧</h3>
        <ul>
          <li>新增论文文件后，点击顶部 <strong>Rescan</strong> 刷新论文列表</li>
          <li>若要让对话功能检索到新论文，还需在对话面板点 <strong>Build Index</strong> 重建向量索引</li>
          <li>论文按<strong>最近修改时间</strong>排序，新导入的论文会自动置顶</li>
          <li>所有数据都在本地 —— 论文文件、标注、向量索引都不会上传到云端</li>
          <li>提问时可以缩小范围，例如"在低空经济类论文中，哪些用了 Mamba 架构？"</li>
        </ul>

        <h3 style="margin-top:24px">🔑 环境变量</h3>
        <p>首次运行前需要配置两个 API Key（通过环境变量或 <code>app/.env.local</code> 文件）：</p>
        <ul>
          <li><code>OPENAI_API_KEY</code> —— 用于 Embedding（支持 OpenAI 或 OpenRouter）</li>
          <li><code>DASHSCOPE_API_KEY</code> —— 用于 Qwen 对话与摘要生成</li>
          <li><code>FEISHU_WEBHOOK</code>（可选）—— 用于推送周报到飞书</li>
        </ul>
      </div>
    `;
  } else {
    modalBody.innerHTML = `
      ${langBtn}
      <div class="help-content">
        <h3>✨ Core Features</h3>

        <div class="help-section">
          <h4>📖 Browse & Filter</h4>
          <p>Left sidebar lists papers grouped by <strong>year / month</strong>, inferred from arXiv IDs.
          Use top pills to filter by <strong>source</strong> (arXiv / TMC / ...), <strong>status</strong>
          (starred / reading), or <strong>research topic</strong> (10 pre-defined categories).</p>
        </div>

        <div class="help-section">
          <h4>🤖 Ask Your Papers (RAG Chat)</h4>
          <p>Click the <strong>💬 chat bubble</strong> (bottom-right). First time: click <strong>Build Index</strong>
          to create vector embeddings of all papers (1-3 min).</p>
          <p>Then ask natural language questions across all your papers. The assistant retrieves relevant
          passages and answers in Chinese with clickable citations.</p>
          <p><strong>Multi-turn:</strong> Follow up with "can you elaborate?". Click <strong>+</strong>
          to start a new conversation.</p>
        </div>

        <div class="help-section">
          <h4>🏷️ Annotations</h4>
          <ul>
            <li><strong>★ Star</strong> — click the star icon to mark important papers</li>
            <li><strong>Status</strong> — click to cycle: None → 📌 To Read → 📖 Reading → ✅ Read</li>
            <li>Filter bar lets you view only starred / unread / reading papers</li>
          </ul>
        </div>

        <div class="help-section">
          <h4>✨ Similar Papers</h4>
          <p>Click <strong>✨ Similar</strong> on any paper card to find the 6 most semantically similar papers.
          Based on averaged FAISS embeddings of the source paper's chunks.</p>
        </div>

        <div class="help-section">
          <h4>+ arXiv Import</h4>
          <p>Click <strong>+ arXiv</strong> in the top bar, paste an arXiv ID (e.g., <code>2604.04949</code>)
          or URL. The system will: download the PDF → extract text → generate a Chinese three-section intro
          using Qwen-Plus → save it. Takes ~30-60 seconds.</p>
        </div>

        <div class="help-section">
          <h4>📰 Weekly Digest</h4>
          <p>Click <strong>📰 Digest</strong> to generate a narrative summary of papers added in the
          last 7 days, grouped by research direction. Can be pushed to Feishu via webhook
          (set <code>FEISHU_WEBHOOK</code> env variable).</p>
        </div>

        <h3 style="margin-top:24px">⌨️ Keyboard Shortcuts</h3>
        <div class="shortcut-grid">
          <div class="shortcut-row"><kbd>Ctrl+K</kbd> or <kbd>/</kbd><span>Focus search</span></div>
          <div class="shortcut-row"><kbd>Ctrl+J</kbd><span>Toggle chat panel</span></div>
          <div class="shortcut-row"><kbd>Esc</kbd><span>Close modal / chat</span></div>
          <div class="shortcut-row"><kbd>Enter</kbd><span>Send chat message</span></div>
        </div>

        <h3 style="margin-top:24px">📝 Paper Format</h3>
        <pre class="help-code">**关键词**: keyword1, keyword2, keyword3

📚arXiv: 2604.xxxxx
✏️标题: English Title
🏷️中文标题：中文简短标题
📄一句话介绍：核心贡献一句话

🎯动机
...

💡方法与创新
...

📊实验设计
...</pre>
        <p>Naming: <code>2604.04949_Name.md</code>, <code>TMC_Xxx/intro.md</code>, <code>20260412_Xxx.md</code></p>

        <h3 style="margin-top:24px">🔑 Environment Variables</h3>
        <ul>
          <li><code>OPENAI_API_KEY</code> — for embeddings (OpenAI / OpenRouter)</li>
          <li><code>DASHSCOPE_API_KEY</code> — for Qwen chat & summaries</li>
          <li><code>FEISHU_WEBHOOK</code> (optional) — for weekly digest push</li>
        </ul>
      </div>
    `;
  }
}

// ── Weekly Digest ──
async function showDigest() {
  const overlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  modalTitle.textContent = "📰 Weekly Digest";
  modalBody.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Generating weekly digest... (may take 10-20s)</div>';
  overlay.classList.add("active");

  try {
    const res = await fetch("/api/digest?days=7");
    const data = await res.json();
    if (data.error) {
      modalBody.innerHTML = `<p style="color:var(--accent)">${data.error}</p>`;
      return;
    }

    if (data.count === 0) {
      modalBody.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>No new papers in the last 7 days.</p></div>`;
      return;
    }

    const summaryHtml = renderMarkdown(data.summary);
    let paperList = '<div class="digest-papers"><h3 style="margin:20px 0 10px;font-size:15px;color:var(--accent)">Recent Papers</h3>';
    data.papers.forEach(p => {
      const display = p.title_cn || p.title || p.id;
      paperList += `<div class="digest-item">
        <span class="digest-date">${p.date}</span>
        <span class="digest-title">${escapeHtml(display)}</span>
      </div>`;
    });
    paperList += '</div>';

    modalBody.innerHTML = `
      <div class="digest-toolbar">
        <div style="font-size:13px;color:var(--text-muted)">
          ${data.count} new papers in the last ${data.days} days
        </div>
        <button class="btn-push-feishu" onclick="pushDigestToFeishu()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
          推送到飞书
        </button>
      </div>
      <div id="pushStatus" style="margin-bottom:12px"></div>
      ${summaryHtml}
      ${paperList}
    `;
  } catch (e) {
    modalBody.innerHTML = `<p style="color:var(--accent)">Failed to generate digest: ${e.message}</p>`;
  }
}

async function pushDigestToFeishu() {
  const statusEl = document.getElementById("pushStatus");
  statusEl.innerHTML = `<div style="color:var(--text-secondary);font-size:13px">◌ 正在推送...</div>`;

  try {
    const res = await fetch("/api/digest/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 7 }),
    });
    const data = await res.json();

    if (data.success) {
      statusEl.innerHTML = `<div style="color:#4A9B5D;font-size:13px">✓ 已成功推送到飞书（共 ${data.count} 篇）</div>`;
    } else {
      const errMsg = data.error || "推送失败，请检查 FEISHU_WEBHOOK 环境变量是否已设置";
      statusEl.innerHTML = `<div style="color:var(--accent);font-size:13px">✕ ${errMsg}</div>`;
    }
  } catch (e) {
    statusEl.innerHTML = `<div style="color:var(--accent);font-size:13px">✕ 请求失败: ${e.message}</div>`;
  }
}

// ── arXiv Import ──
function openArxivImport() {
  const overlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  modalTitle.textContent = "Import from arXiv";
  modalBody.innerHTML = `
    <div style="padding: 8px 0;">
      <p style="font-size:14px;color:var(--text-secondary);margin-bottom:12px">
        Enter an arXiv ID (e.g., <code>2604.04949</code>) or URL to auto-generate a paper summary.
      </p>
      <input type="text" id="arxivInput" placeholder="2604.04949 or https://arxiv.org/abs/..."
        style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:var(--font-sans);outline:none;margin-bottom:12px"
        onkeydown="if(event.key==='Enter')importArxiv()" />
      <button class="btn-accent" onclick="importArxiv()"
        style="padding:10px 20px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer">
        Import
      </button>
      <div id="arxivImportStatus" style="margin-top:16px;font-size:13px"></div>
    </div>
  `;
  overlay.classList.add("active");
  setTimeout(() => document.getElementById("arxivInput")?.focus(), 100);
}

async function importArxiv() {
  const input = document.getElementById("arxivInput");
  const status = document.getElementById("arxivImportStatus");
  const value = input.value.trim();
  if (!value) return;

  status.innerHTML = `<div style="color:var(--text-secondary)">◌ Fetching metadata, downloading PDF, generating summary... (30-60s)</div>`;

  try {
    const res = await fetch("/api/import_arxiv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: value }),
    });
    const data = await res.json();

    if (data.success) {
      status.innerHTML = `<div style="color:#4A9B5D">
        ✓ Imported: <strong>${escapeHtml(data.title)}</strong><br>
        Saved to: <code>${escapeHtml(data.intro_path)}</code>
      </div>`;
      await loadPapers();
    } else {
      status.innerHTML = `<div style="color:var(--accent)">✕ ${escapeHtml(data.error || "Import failed")}</div>`;
    }
  } catch (e) {
    status.innerHTML = `<div style="color:var(--accent)">✕ Request failed: ${e.message}</div>`;
  }
}

async function rescan() {
  const btn = event.target;
  btn.textContent = "Scanning...";
  btn.disabled = true;
  try {
    const res = await fetch("/api/rescan", { method: "POST" });
    const data = await res.json();
    await loadPapers();
    btn.textContent = `Done! (${data.count})`;
    setTimeout(() => { btn.textContent = "Rescan"; btn.disabled = false; }, 2000);
  } catch (e) {
    btn.textContent = "Error";
    btn.disabled = false;
  }
}

// ══════════════════════════════════
// ── RAG Chat ──
// ══════════════════════════════════

let chatHistory = [];

function toggleChat() {
  const panel = document.getElementById("chatPanel");
  panel.classList.toggle("open");
  if (panel.classList.contains("open")) {
    document.getElementById("chatInput").focus();
    checkRagStatus();
  }
}

async function checkRagStatus() {
  const statusEl = document.getElementById("ragStatus");
  try {
    const res = await fetch("/api/rag/status");
    const data = await res.json();
    if (data.indexed) {
      statusEl.innerHTML = `<span class="rag-ready">● Index ready (${data.chunks} chunks)</span>`;
    } else {
      statusEl.innerHTML = `<span class="rag-empty">○ No index yet</span>
        <button class="btn-build" onclick="buildIndex()">Build Index</button>`;
    }
  } catch (e) {
    statusEl.innerHTML = `<span class="rag-empty">○ Status unknown</span>`;
  }
}

async function buildIndex() {
  const statusEl = document.getElementById("ragStatus");
  statusEl.innerHTML = `<span class="rag-building">◌ Building index... (this may take 1-2 min)</span>`;

  try {
    const res = await fetch("/api/rag/build", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      statusEl.innerHTML = `<span class="rag-ready">● Index ready (${data.chunks} chunks)</span>`;
      addSystemMessage(`Index built successfully: ${data.chunks} chunks from your papers.`);
    } else {
      statusEl.innerHTML = `<span class="rag-empty">✕ Build failed</span>
        <button class="btn-build" onclick="buildIndex()">Retry</button>`;
      addSystemMessage(`Index build failed: ${data.error}`);
    }
  } catch (e) {
    statusEl.innerHTML = `<span class="rag-empty">✕ Error</span>`;
    addSystemMessage(`Error: ${e.message}`);
  }
}

function addSystemMessage(text) {
  const messages = document.getElementById("chatMessages");
  messages.innerHTML += `<div class="chat-msg system"><div class="msg-content">${escapeHtml(text)}</div></div>`;
  messages.scrollTop = messages.scrollHeight;
}

function addUserMessage(text) {
  const messages = document.getElementById("chatMessages");
  messages.innerHTML += `<div class="chat-msg user"><div class="msg-bubble user-bubble">${escapeHtml(text)}</div></div>`;
  messages.scrollTop = messages.scrollHeight;
}

function addAssistantMessage(answer, sources) {
  const messages = document.getElementById("chatMessages");

  // Render answer with basic markdown
  let answerHtml = answer
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/【(.+?)】/g, '<span class="cite">$1</span>')
    .replace(/\n/g, "<br>");

  // Render sources
  let sourcesHtml = "";
  if (sources && sources.length > 0) {
    sourcesHtml = `<div class="msg-sources"><div class="sources-title">References</div>`;
    sources.forEach(s => {
      const display = s.title_cn || s.title || s.paper_id;
      const sim = Math.round(s.similarity * 100);
      sourcesHtml += `<div class="source-item">
        <a class="source-link" onclick="showPaperContent('${encodeURIComponent(s.path)}', '${escapeAttr(display)}')">${escapeHtml(display)}</a>
        <span class="source-sim">${sim}%</span>
      </div>`;
    });
    sourcesHtml += `</div>`;
  }

  messages.innerHTML += `<div class="chat-msg assistant">
    <div class="msg-bubble assistant-bubble">${answerHtml}${sourcesHtml}</div>
  </div>`;
  messages.scrollTop = messages.scrollHeight;
}

async function sendChat() {
  const input = document.getElementById("chatInput");
  const query = input.value.trim();
  if (!query) return;

  input.value = "";
  addUserMessage(query);

  // Show thinking indicator
  const messages = document.getElementById("chatMessages");
  const thinkingId = "thinking-" + Date.now();
  messages.innerHTML += `<div class="chat-msg assistant" id="${thinkingId}">
    <div class="msg-bubble assistant-bubble thinking">
      <div class="thinking-dots"><span></span><span></span><span></span></div>
      Searching papers...
    </div>
  </div>`;
  messages.scrollTop = messages.scrollHeight;

  try {
    const res = await fetch("/api/rag/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, history: chatHistory }),
    });
    const data = await res.json();

    // Remove thinking indicator
    document.getElementById(thinkingId)?.remove();

    if (data.error) {
      addSystemMessage(`Error: ${data.error}`);
    } else {
      addAssistantMessage(data.answer, data.sources);
      // Save to history for next turn
      chatHistory.push({ role: "user", content: query });
      chatHistory.push({ role: "assistant", content: data.answer });
      // Keep last 10 turns
      if (chatHistory.length > 20) {
        chatHistory = chatHistory.slice(-20);
      }
    }
  } catch (e) {
    document.getElementById(thinkingId)?.remove();
    addSystemMessage(`Request failed: ${e.message}`);
  }
}

function newConversation() {
  chatHistory = [];
  const messages = document.getElementById("chatMessages");
  messages.innerHTML = `<div class="chat-msg system">
    <div class="msg-content">New conversation started. Ask questions across your papers.</div>
  </div>`;
}

// ── Keyboard Shortcuts ──
document.addEventListener("keydown", (e) => {
  // Chat input: Enter to send
  if (e.target.id === "chatInput" && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChat();
    return;
  }

  // Skip if typing in an input/textarea
  const tag = e.target.tagName;
  const isTyping = tag === "INPUT" || tag === "TEXTAREA";

  // Cmd/Ctrl+K: focus search
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    document.getElementById("searchInput").focus();
    document.getElementById("searchInput").select();
    return;
  }

  // Cmd/Ctrl+J: toggle chat
  if ((e.metaKey || e.ctrlKey) && e.key === "j") {
    e.preventDefault();
    toggleChat();
    return;
  }

  // / key: focus search (only when not typing)
  if (e.key === "/" && !isTyping) {
    e.preventDefault();
    document.getElementById("searchInput").focus();
    return;
  }

  // Escape: close modal or chat
  if (e.key === "Escape") {
    const modal = document.getElementById("modalOverlay");
    const chat = document.getElementById("chatPanel");
    if (modal.classList.contains("active")) {
      closeModal();
    } else if (chat.classList.contains("open")) {
      chat.classList.remove("open");
    }
  }
});

// ── Deep Research (OpenResearcher-style ReAct) ──
let _researchES = null;

function openResearch() {
  if (_researchES) { try { _researchES.close(); } catch(_) {} _researchES = null; }
  document.getElementById("modalTitle").textContent = "🔬 Deep Research";
  document.getElementById("modalBody").innerHTML = `
    <div class="research-form">
      <label class="research-label">研究问题</label>
      <textarea id="researchQ" class="research-input" rows="3"
        placeholder="例如：综述近期低空经济中信道估计与波束成形的主流方法与对比"></textarea>

      <div class="research-controls">
        <label class="research-label">最大轮数 <span id="researchRoundsVal">4</span></label>
        <input type="range" id="researchRounds" min="1" max="16" value="4"
          oninput="document.getElementById('researchRoundsVal').textContent=this.value">
      </div>

      <div class="research-toggles">
        <label><input type="checkbox" id="researchArxiv"> 启用 arXiv 搜索</label>
        <label><input type="checkbox" id="researchWeb"> 启用 Web 搜索 (需 SERPER_API_KEY)</label>
      </div>

      <button class="btn btn-primary" onclick="startResearch()">开始调研</button>
      <div class="research-hint">本地知识库始终启用。深度调研将以 ReAct 方式多轮推理，过程实时展示。</div>
    </div>
  `;
  document.getElementById("modalOverlay").classList.add("active");
}

function startResearch() {
  const q = document.getElementById("researchQ").value.trim();
  if (!q) { alert("请先输入研究问题"); return; }
  const rounds = document.getElementById("researchRounds").value;
  const arxiv = document.getElementById("researchArxiv").checked ? "1" : "0";
  const web = document.getElementById("researchWeb").checked ? "1" : "0";

  document.getElementById("modalBody").innerHTML = `
    <div class="research-header">
      <div class="research-question"><strong>Q:</strong> ${escapeHtml(q)}</div>
      <div class="research-status" id="researchStatus">调研中... · 最多 ${rounds} 轮</div>
    </div>
    <div class="research-trace" id="researchTrace"></div>
    <div class="research-final" id="researchFinal" style="display:none;"></div>
  `;

  const url = `/api/research?q=${encodeURIComponent(q)}&rounds=${rounds}&arxiv=${arxiv}&web=${web}`;
  const es = new EventSource(url);
  _researchES = es;

  es.onmessage = (msg) => {
    let ev;
    try { ev = JSON.parse(msg.data); } catch(_) { return; }
    handleResearchEvent(ev);
    if (ev.type === "done" || ev.type === "final" || ev.type === "error") {
      es.close();
      _researchES = null;
    }
  };
  es.onerror = () => {
    document.getElementById("researchStatus").textContent = "连接中断";
    es.close();
    _researchES = null;
  };
}

function handleResearchEvent(ev) {
  const trace = document.getElementById("researchTrace");
  const status = document.getElementById("researchStatus");
  if (!trace) return;

  if (ev.type === "start") {
    const tools = (ev.allowed_tools || []).join(", ");
    trace.insertAdjacentHTML("beforeend",
      `<div class="trace-meta">启用工具: ${escapeHtml(tools)}</div>`);
  } else if (ev.type === "thought") {
    status.textContent = `第 ${ev.round} 轮 · 思考中`;
    trace.insertAdjacentHTML("beforeend", `
      <div class="trace-step trace-thought">
        <div class="trace-head">💭 Thought · Round ${ev.round}</div>
        <div class="trace-body">${escapeHtml(ev.content || "")}</div>
      </div>`);
  } else if (ev.type === "action") {
    status.textContent = `第 ${ev.round} 轮 · 调用 ${ev.tool}`;
    trace.insertAdjacentHTML("beforeend", `
      <div class="trace-step trace-action">
        <div class="trace-head">🔧 Action · ${escapeHtml(ev.tool)}</div>
        <pre class="trace-body">${escapeHtml(JSON.stringify(ev.input || {}, null, 2))}</pre>
      </div>`);
  } else if (ev.type === "observation") {
    const preview = JSON.stringify(ev.result || {}, null, 2);
    const short = preview.length > 800 ? preview.slice(0, 800) + " …" : preview;
    trace.insertAdjacentHTML("beforeend", `
      <div class="trace-step trace-obs">
        <details open>
          <summary class="trace-head">👁 Observation · ${escapeHtml(ev.tool || "")}</summary>
          <pre class="trace-body">${escapeHtml(short)}</pre>
        </details>
      </div>`);
  } else if (ev.type === "final") {
    status.textContent = `完成 · 共 ${ev.round} 轮`;
    const box = document.getElementById("researchFinal");
    box.style.display = "block";
    box.innerHTML = `<div class="research-final-title">📋 研究报告</div>
      <div class="research-final-body">${renderMarkdown(ev.answer || "")}</div>`;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (ev.type === "error") {
    status.textContent = "出错";
    trace.insertAdjacentHTML("beforeend",
      `<div class="trace-step trace-error">❌ ${escapeHtml(ev.message || "")}</div>`);
  }
  trace.scrollTop = trace.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
}


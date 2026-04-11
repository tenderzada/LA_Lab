// Paper Knowledge Base - Frontend Logic

let allPapers = [];
let currentFilter = { date: null, source: null, category: null, search: "" };

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
    const res = await fetch("/api/papers");
    allPapers = await res.json();
    buildSidebar();
    renderCards();
    updateStats();
  } catch (e) {
    console.error("Failed to load papers:", e);
  }
  showLoading(false);
}

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

    return `<div class="paper-card">
      <div class="paper-card-top">
        <div class="paper-num">${i + 1}</div>
        <div class="paper-info">
          <div class="paper-title-row">
            <a class="paper-title" onclick="showPaperContent('${encodeURIComponent(p.path)}', '${escapeAttr(displayTitle)}')">${escapeHtml(displayTitle)}</a>
          </div>
          ${enTitle ? `<div class="paper-en-title">${escapeHtml(enTitle)}</div>` : ""}
          ${p.summary ? `<div class="paper-summary-text">${escapeHtml(p.summary)}</div>` : ""}
          <div class="paper-meta">
            <span class="paper-source ${sourceClass}">${escapeHtml(p.source)}</span>
            <span class="paper-date-tag">${p.date}</span>
            ${catTags}
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

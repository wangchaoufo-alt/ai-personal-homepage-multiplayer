const fallbackNewsItems = [
  {
    title: "大模型正在从聊天助手走向完整生产系统",
    category: "大模型",
    date: "2026-06-09",
    summary: "未来更重要的不只是对话能力，而是模型能否参与搜索、写作、编程、决策和执行。"
  },
  {
    title: "本地AI部署持续升温，隐私和可控性成为核心理由",
    category: "本地AI",
    date: "2026-06-09",
    summary: "个人用户和创作者越来越希望把模型运行在自己的设备上，以获得更高的可控性和更低的长期成本。"
  },
  {
    title: "AI视频生成正在改变内容创作者的生产方式",
    category: "AI视频",
    date: "2026-06-09",
    summary: "从脚本到镜头、从配音到剪辑，AI 正在把视频创作流程变得更自动化。"
  },
  {
    title: "显存仍是本地AI部署体验的决定性因素",
    category: "硬件",
    date: "2026-06-09",
    summary: "对于大模型和视频生成场景，显存容量、带宽与散热策略往往比单纯跑分更重要。"
  },
  {
    title: "AI 智能体让复杂任务从单次问答变成持续执行",
    category: "工作流",
    date: "2026-06-09",
    summary: "Agent 可以把目标拆解成多个动作步骤，并结合搜索、文档、代码与工具联动。"
  },
  {
    title: "个人 AI 主页正在成为长期积累知识与品牌的新入口",
    category: "工作流",
    date: "2026-06-09",
    summary: "把你对 AI 的观察、项目与实验沉淀下来，长期看会形成独特的数字资产。"
  }
];

const API_BASE = "/api";
const tokenKey = "aiForumToken";
const userKey = "aiForumUser";

const newsGrid = document.querySelector("#newsGrid");
const searchInput = document.querySelector("#searchInput");
const lczCategories = document.querySelector("#lczCategories");
const lczPopularTopics = document.querySelector("#lczPopularTopics");
const lczRecentTopics = document.querySelector("#lczRecentTopics");
const chips = Array.from(document.querySelectorAll(".chip"));
const menuBtn = document.querySelector("#menuBtn");
const navLinks = document.querySelector("#navLinks");
const subscribeForm = document.querySelector("#subscribeForm");
const emailInput = document.querySelector("#emailInput");
const formMsg = document.querySelector("#formMsg");
const year = document.querySelector("#year");

let activeCategory = "all";
let newsItems = [...fallbackNewsItems];

function renderNews() {
  if (!newsGrid) return;
  const keyword = (searchInput?.value || "").trim().toLowerCase();

  const filtered = newsItems.filter((item) => {
    const titleText = String(item.title || "");
    const summaryText = String(item.summary || "");
    const categoryText = String(item.category || "");
    const sourceText = String(item.source || "");
    const matchCategory = activeCategory === "all" || item.category === activeCategory;
    const matchKeyword =
      titleText.toLowerCase().includes(keyword) ||
      summaryText.toLowerCase().includes(keyword) ||
      categoryText.toLowerCase().includes(keyword) ||
      sourceText.toLowerCase().includes(keyword);
    return matchCategory && matchKeyword;
  });

  newsGrid.innerHTML = filtered.map((item) => {
    const title = escapeHTML(item.title || "AI 新闻更新");
    const category = escapeHTML(item.category || "AI消息");
    const summary = escapeHTML(item.summary || "最新 AI 动态正在更新中。");
    const date = escapeHTML(item.date || "");
    const source = escapeHTML(item.source || "AI观察");
    const link = safeNewsLink(item.link);

    return `
      <article class="news-card">
        <span class="tag">${category}</span>
        <h3>${link ? `<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</h3>
        <p>${summary}</p>
        <div class="news-meta">${date} · ${source}</div>
      </article>
    `;
  }).join("");

  if (!filtered.length) {
    newsGrid.innerHTML = `<article class="news-card"><h3>没有找到相关消息</h3><p>换个关键词或切换分类再试试看。</p></article>`;
  }
}

async function loadLatestNews() {
  if (!newsGrid) return;

  newsGrid.innerHTML = `
    <article class="news-card">
      <span class="tag">AI消息</span>
      <h3>正在加载最新 AI 消息...</h3>
      <p>主页会每天自动更新，稍等片刻。</p>
    </article>
  `;

  try {
    const res = await fetch(`${API_BASE}/news`);
    const data = await res.json();
    newsItems = res.ok && Array.isArray(data.news) && data.news.length
      ? data.news
      : [...fallbackNewsItems];
  } catch {
    newsItems = [...fallbackNewsItems];
  }

  renderNews();
}

function renderLczCategories(categories = []) {
  if (!lczCategories) return;

  if (!categories.length) {
    lczCategories.innerHTML = `<div class="lcz-empty">暂时没有读取到版块。</div>`;
    return;
  }

  lczCategories.innerHTML = categories.map((category) => {
    const url = safeNewsLink(category.url);
    const color = escapeHTML(category.color || "#00d4ff");
    const name = escapeHTML(category.name || "论坛版块");
    const description = escapeHTML(category.description || "公开论坛版块");

    return `
      <a class="lcz-category" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
        <span class="lcz-dot" style="background:${color}"></span>
        <span>
          <strong>${name}</strong>
          <small>${description}</small>
        </span>
        <em>${Number(category.topicCount || 0)} 主题</em>
      </a>
    `;
  }).join("");
}

function renderLczTopics(container, topics = []) {
  if (!container) return;

  if (!topics.length) {
    container.innerHTML = `<div class="lcz-empty">暂时没有读取到主题。</div>`;
    return;
  }

  container.innerHTML = topics.map((topic) => {
    const url = safeNewsLink(topic.url);
    const title = escapeHTML(topic.title || "LCZ 论坛主题");
    const summary = escapeHTML(topic.summary || "点击查看原帖详情。");
    const category = escapeHTML(topic.category || "LCZ论坛");
    const date = escapeHTML(topic.date || "");

    return `
      <a class="lcz-topic" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
        <span class="tag">${category}</span>
        <h4>${title}</h4>
        <p>${summary}</p>
        <div class="lcz-meta">
          <span>${date}</span>
          <span>${Number(topic.replies || 0)} 回复</span>
          <span>${Number(topic.views || 0)} 浏览</span>
        </div>
      </a>
    `;
  }).join("");
}

async function loadLczForumDigest() {
  if (!lczCategories && !lczPopularTopics && !lczRecentTopics) return;

  const loading = `<div class="lcz-empty">正在读取 LCZ 论坛公开内容...</div>`;
  if (lczCategories) lczCategories.innerHTML = loading;
  if (lczPopularTopics) lczPopularTopics.innerHTML = loading;
  if (lczRecentTopics) lczRecentTopics.innerHTML = loading;

  try {
    const res = await fetch(`${API_BASE}/lcz-forum`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "LCZ 论坛读取失败");

    renderLczCategories(data.categories || []);
    renderLczTopics(lczPopularTopics, data.popularTopics || []);
    renderLczTopics(lczRecentTopics, data.recentTopics || []);
  } catch {
    const error = `<div class="lcz-empty">LCZ 论坛暂时读取失败，稍后再试。</div>`;
    if (lczCategories) lczCategories.innerHTML = error;
    if (lczPopularTopics) lczPopularTopics.innerHTML = error;
    if (lczRecentTopics) lczRecentTopics.innerHTML = error;
  }
}

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeCategory = chip.dataset.category;
    renderNews();
  });
});

if (searchInput) searchInput.addEventListener("input", renderNews);
if (menuBtn && navLinks) {
  menuBtn.addEventListener("click", () => navLinks.classList.toggle("show"));
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => navLinks.classList.remove("show"));
  });
}

if (subscribeForm) {
  subscribeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    formMsg.textContent = `已记录：${emailInput.value}。后续可接入真实邮件服务。`;
    emailInput.value = "";
  });
}

if (year) year.textContent = new Date().getFullYear();
loadLatestNews();
loadLczForumDigest();

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("visible");
  });
}, { threshold: 0.15 });

document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

// Multiplayer forum
const forumList = document.querySelector("#forumList");
const forumSearchInput = document.querySelector("#forumSearchInput");
const forumFilters = Array.from(document.querySelectorAll(".forum-filter"));
const postComposer = document.querySelector("#postComposer");
const openPostComposer = document.querySelector("#openPostComposer");
const closePostComposer = document.querySelector("#closePostComposer");
const forumPostForm = document.querySelector("#forumPostForm");
const postCategory = document.querySelector("#postCategory");
const postTitle = document.querySelector("#postTitle");
const postContent = document.querySelector("#postContent");
const postMsg = document.querySelector("#postMsg");

const authForm = document.querySelector("#authForm");
const authUsername = document.querySelector("#authUsername");
const authPassword = document.querySelector("#authPassword");
const authMsg = document.querySelector("#authMsg");
const authSubmitBtn = document.querySelector("#authSubmitBtn");
const authTabs = Array.from(document.querySelectorAll(".auth-tab"));
const guestPanel = document.querySelector("#guestPanel");
const userPanel = document.querySelector("#userPanel");
const currentUsername = document.querySelector("#currentUsername");
const logoutBtn = document.querySelector("#logoutBtn");

let activeForumCategory = "all";
let authMode = "login";

function getToken() {
  return localStorage.getItem(tokenKey);
}

function getUser() {
  const saved = localStorage.getItem(userKey);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function setSession(token, user) {
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(userKey, JSON.stringify(user));
  updateAuthUI();
}

function clearSession() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
  updateAuthUI();
}

function updateAuthUI() {
  const user = getUser();
  if (!guestPanel || !userPanel) return;

  if (user) {
    guestPanel.style.display = "none";
    userPanel.style.display = "block";
    currentUsername.textContent = user.username;
  } else {
    guestPanel.style.display = "block";
    userPanel.style.display = "none";
  }
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeNewsLink(link) {
  try {
    const url = new URL(link, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

async function renderForum() {
  if (!forumList) return;

  const keyword = forumSearchInput.value.trim();
  const params = new URLSearchParams();
  if (activeForumCategory !== "all") params.set("category", activeForumCategory);
  if (keyword) params.set("q", keyword);

  forumList.innerHTML = `<div class="glass-card empty-forum">正在加载论坛帖子...</div>`;

  try {
    const { posts } = await apiFetch(`/forum/posts?${params.toString()}`);
    const user = getUser();

    if (!posts.length) {
      forumList.innerHTML = `<div class="glass-card empty-forum">没有找到相关帖子，试试换个关键词，或者发布第一条讨论。</div>`;
      return;
    }

    forumList.innerHTML = posts.map((post) => {
      const comments = post.comments || [];
      const canDelete = user && user.id === post.userId;

      return `
        <article class="forum-post" data-post-id="${post.id}">
          <div class="post-top">
            <div>
              <span class="tag">${escapeHTML(post.category)}</span>
              <h3 class="post-title">${escapeHTML(post.title)}</h3>
              <div class="post-meta">
                <span>作者：${escapeHTML(post.author)}</span>
                <span>${escapeHTML(post.createdAt)}</span>
              </div>
            </div>
            <span class="mini-tag">${comments.length} 评论</span>
          </div>

          <p class="post-content">${escapeHTML(post.content)}</p>

          <div class="post-actions">
            <button class="action-btn like-post" type="button">${post.likedByMe ? "❤️" : "👍"} ${post.likes || 0}</button>
            <button class="action-btn toggle-comments" type="button">评论</button>
            ${canDelete ? `<button class="action-btn delete-post" type="button">删除</button>` : ""}
          </div>

          <div class="comment-box">
            <form class="comment-form">
              <input type="text" placeholder="${user ? "写一条评论..." : "登录后才能评论"}" ${user ? "" : "disabled"} required />
              <button class="btn ghost" type="submit" ${user ? "" : "disabled"}>发送</button>
            </form>
            <div class="comment-list">
              ${comments.map((comment) => `
                <div class="comment-item">
                  <strong>${escapeHTML(comment.author)}</strong>：${escapeHTML(comment.content)}
                  <small>· ${escapeHTML(comment.createdAt)}</small>
                </div>
              `).join("")}
            </div>
          </div>
        </article>
      `;
    }).join("");
  } catch (error) {
    forumList.innerHTML = `<div class="glass-card empty-forum">论坛加载失败：${escapeHTML(error.message)}</div>`;
  }
}

if (forumList) {
  updateAuthUI();

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      authTabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      authMode = tab.dataset.authMode;
      authSubmitBtn.textContent = authMode === "login" ? "登录" : "注册";
      authMsg.textContent = "";
    });
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authMsg.textContent = "处理中...";

    try {
      const data = await apiFetch(`/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({
          username: authUsername.value.trim(),
          password: authPassword.value
        })
      });

      setSession(data.token, data.user);
      authForm.reset();
      authMsg.textContent = "";
      await renderForum();
    } catch (error) {
      authMsg.textContent = error.message;
    }
  });

  logoutBtn.addEventListener("click", () => {
    clearSession();
    renderForum();
  });

  forumSearchInput.addEventListener("input", () => {
    clearTimeout(window.__forumSearchTimer);
    window.__forumSearchTimer = setTimeout(renderForum, 250);
  });

  forumFilters.forEach((filter) => {
    filter.addEventListener("click", () => {
      forumFilters.forEach((item) => item.classList.remove("active"));
      filter.classList.add("active");
      activeForumCategory = filter.dataset.forumCategory;
      renderForum();
    });
  });

  openPostComposer.addEventListener("click", () => {
    if (!getUser()) {
      alert("请先登录或注册，再发布帖子。");
      authUsername.focus();
      return;
    }
    postComposer.classList.add("show");
    postTitle.focus();
  });

  closePostComposer.addEventListener("click", () => {
    postComposer.classList.remove("show");
  });

  forumPostForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    postMsg.textContent = "发布中...";

    try {
      await apiFetch("/forum/posts", {
        method: "POST",
        body: JSON.stringify({
          title: postTitle.value.trim(),
          content: postContent.value.trim(),
          category: postCategory.value
        })
      });

      forumPostForm.reset();
      postComposer.classList.remove("show");
      postMsg.textContent = "";
      await renderForum();
    } catch (error) {
      postMsg.textContent = error.message;
    }
  });

  forumList.addEventListener("click", async (event) => {
    const postElement = event.target.closest(".forum-post");
    if (!postElement) return;
    const postId = postElement.dataset.postId;

    if (event.target.classList.contains("toggle-comments")) {
      const box = postElement.querySelector(".comment-box");
      box.classList.toggle("show");
    }

    if (event.target.classList.contains("like-post")) {
      if (!getUser()) {
        alert("请先登录或注册，再点赞。");
        return;
      }
      try {
        await apiFetch(`/forum/posts/${postId}/like`, { method: "POST" });
        await renderForum();
      } catch (error) {
        alert(error.message);
      }
    }

    if (event.target.classList.contains("delete-post")) {
      if (!confirm("确定删除这条帖子吗？")) return;
      try {
        await apiFetch(`/forum/posts/${postId}`, { method: "DELETE" });
        await renderForum();
      } catch (error) {
        alert(error.message);
      }
    }
  });

  forumList.addEventListener("submit", async (event) => {
    if (!event.target.classList.contains("comment-form")) return;
    event.preventDefault();

    if (!getUser()) {
      alert("请先登录或注册，再评论。");
      return;
    }

    const postElement = event.target.closest(".forum-post");
    const postId = postElement.dataset.postId;
    const input = event.target.querySelector("input");

    try {
      await apiFetch(`/forum/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: input.value.trim() })
      });
      await renderForum();
      const newPostElement = document.querySelector(`[data-post-id="${postId}"]`);
      if (newPostElement) newPostElement.querySelector(".comment-box").classList.add("show");
    } catch (error) {
      alert(error.message);
    }
  });

  renderForum();
}

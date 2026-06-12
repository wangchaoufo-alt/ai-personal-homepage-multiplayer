require("dotenv").config();

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const Parser = require("rss-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { attachDafuwengGame } = require("./dafuweng-game");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "development_secret_change_me";
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, "data", "forum.json");
const NEWS_CACHE_PATH = process.env.NEWS_CACHE_PATH || path.join(path.dirname(DATABASE_PATH), "ai-news.json");
const configuredNewsRefreshInterval = Number(process.env.NEWS_REFRESH_INTERVAL_MS);
const NEWS_REFRESH_INTERVAL_MS = Number.isFinite(configuredNewsRefreshInterval) && configuredNewsRefreshInterval > 0
  ? configuredNewsRefreshInterval
  : 24 * 60 * 60 * 1000;
const NEWS_CACHE_VERSION = 2;
const NEWS_TRANSLATION_ENABLED = process.env.NEWS_TRANSLATION_ENABLED !== "false";
const TRANSLATION_TIMEOUT_MS = Number(process.env.TRANSLATION_TIMEOUT_MS || 12000);
const TRANSLATION_SPLIT_TOKEN = "AI_NEWS_TRANSLATION_SPLIT_927";
const LCZ_FORUM_BASE_URL = process.env.LCZ_FORUM_BASE_URL || "https://lcz.me";
const LCZ_FORUM_CACHE_PATH = process.env.LCZ_FORUM_CACHE_PATH || path.join(path.dirname(DATABASE_PATH), "lcz-forum.json");
const configuredLczRefreshInterval = Number(process.env.LCZ_FORUM_REFRESH_INTERVAL_MS);
const LCZ_FORUM_REFRESH_INTERVAL_MS = Number.isFinite(configuredLczRefreshInterval) && configuredLczRefreshInterval > 0
  ? configuredLczRefreshInterval
  : 60 * 60 * 1000;
const LCZ_FORUM_TIMEOUT_MS = Number(process.env.LCZ_FORUM_TIMEOUT_MS || 12000);
const allowedCategories = new Set(["AI消息", "本地部署", "显卡硬件", "AI视频", "工作流"]);
const newsFeeds = [
  { source: "OpenAI", url: "https://openai.com/news/rss.xml", category: "大模型" },
  { source: "MIT Technology Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed/", category: "AI消息" },
  { source: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "AI消息" },
  { source: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "AI消息" },
  { source: "AI News", url: "https://www.artificialintelligence-news.com/feed/", category: "AI消息" }
];
const rssParser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "AIHomepageNewsBot/1.0 (+https://ai-personal-homepage-multiplayer.onrender.com)"
  }
});

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 160,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(express.static(path.join(__dirname, "public")));

function createEmptyState() {
  return {
    nextUserId: 1,
    nextPostId: 1,
    nextCommentId: 1,
    users: [],
    posts: [],
    comments: [],
    likes: []
  };
}

function readState() {
  if (!fs.existsSync(DATABASE_PATH)) {
    return createEmptyState();
  }

  try {
    return { ...createEmptyState(), ...JSON.parse(fs.readFileSync(DATABASE_PATH, "utf8")) };
  } catch {
    return createEmptyState();
  }
}

let state = readState();

function saveState() {
  fs.writeFileSync(DATABASE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function formatDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function summarizeText(value, maxLength = 150) {
  const text = decodeHtmlEntities(stripHtml(value));
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function hasChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function cleanTranslatedText(value, fallback = "") {
  const text = summarizeText(value, 260)
    .replace(/^MYMEMORY WARNING:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

async function translateTextToChinese(text) {
  const cleanText = summarizeText(text, 460);
  if (!NEWS_TRANSLATION_ENABLED || !cleanText || hasChinese(cleanText)) return cleanText;

  const params = new URLSearchParams({
    q: cleanText,
    langpair: "en|zh-CN"
  });

  const res = await fetchWithTimeout(`https://api.mymemory.translated.net/get?${params.toString()}`, {
    headers: {
      "User-Agent": "AIHomepageNewsBot/1.0 (+https://ai-personal-homepage-multiplayer.onrender.com)",
      "Accept": "application/json"
    }
  }, TRANSLATION_TIMEOUT_MS);

  if (!res.ok) {
    throw new Error(`Translation service returned ${res.status}`);
  }

  const data = await res.json();
  return cleanTranslatedText(data.responseData?.translatedText, cleanText);
}

function splitTranslatedNewsText(value) {
  const parts = String(value || "")
    .split(/_*\s*AI_NEWS_TRANSLATION_SPLIT_927\s*_*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      title: parts[0],
      summary: parts.slice(1).join(" ")
    };
  }

  const lines = String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    title: lines[0] || value,
    summary: lines.slice(1).join(" ")
  };
}

async function translateNewsItemToChinese(item) {
  if (!NEWS_TRANSLATION_ENABLED || hasChinese(`${item.title} ${item.summary}`)) {
    return {
      ...item,
      language: "zh-CN",
      translated: false
    };
  }

  const originalTitle = item.title;
  const originalSummary = item.summary;

  try {
    const combined = `${originalTitle}\n___${TRANSLATION_SPLIT_TOKEN}___\n${originalSummary}`;
    const translated = await translateTextToChinese(combined);
    const parts = splitTranslatedNewsText(translated);

    return {
      ...item,
      title: cleanTranslatedText(parts.title, originalTitle),
      summary: cleanTranslatedText(parts.summary, originalSummary),
      originalTitle,
      originalSummary,
      language: "zh-CN",
      translated: true
    };
  } catch (error) {
    console.warn(`AI news translation failed: ${item.source}`, error.message);
    return {
      ...item,
      originalTitle,
      originalSummary,
      language: "en",
      translated: false
    };
  }
}

async function fetchLczJson(apiPath) {
  const url = new URL(apiPath, LCZ_FORUM_BASE_URL);
  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      "User-Agent": "AIHomepageForumDigest/1.0 (+https://ai-personal-homepage-multiplayer.onrender.com)",
      "Accept": "application/json"
    }
  }, LCZ_FORUM_TIMEOUT_MS);

  if (!res.ok) {
    throw new Error(`LCZ forum returned ${res.status}`);
  }

  return res.json();
}

function lczTopicUrl(topic) {
  return new URL(`/topic/${topic.slug || topic.tid}`, LCZ_FORUM_BASE_URL).toString();
}

function lczCategoryUrl(category) {
  return new URL(`/category/${category.slug || category.cid}`, LCZ_FORUM_BASE_URL).toString();
}

function normalizeLczCategory(category) {
  return {
    id: category.cid,
    name: decodeHtmlEntities(stripHtml(category.name)),
    description: summarizeText(category.description || category.descriptionParsed || "", 80),
    topicCount: Number(category.topic_count || 0),
    postCount: Number(category.post_count || 0),
    color: category.bgColor || category.color || "#00d4ff",
    url: lczCategoryUrl(category)
  };
}

function normalizeLczTopic(topic) {
  const teaser = topic.teaser?.content || topic.teaser?.contentRaw || topic.title || "";

  return {
    id: topic.tid,
    title: summarizeText(topic.titleRaw || topic.title, 110),
    summary: summarizeText(teaser, 92),
    category: decodeHtmlEntities(stripHtml(topic.category?.name || "")),
    replies: Math.max(Number(topic.postcount || 1) - 1, 0),
    views: Number(topic.viewcount || 0),
    date: formatDate(topic.timestampISO || topic.timestamp || new Date()),
    url: lczTopicUrl(topic),
    source: "LCZ论坛"
  };
}

function readLczForumCache() {
  return readJsonFile(LCZ_FORUM_CACHE_PATH, {
    updatedAt: null,
    sourceUrl: LCZ_FORUM_BASE_URL,
    categories: [],
    recentTopics: [],
    popularTopics: []
  });
}

async function refreshLczForumDigest() {
  const [categoriesData, recentData, popularData] = await Promise.all([
    fetchLczJson("/api/categories"),
    fetchLczJson("/api/recent"),
    fetchLczJson("/api/popular")
  ]);

  const categories = (categoriesData.categories || [])
    .filter((category) => !category.disabled && !category.isSection && Number(category.topic_count || 0) > 0)
    .slice(0, 8)
    .map(normalizeLczCategory);

  const recentTopics = (recentData.topics || [])
    .filter((topic) => !topic.deleted && topic.slug)
    .slice(0, 8)
    .map(normalizeLczTopic);

  const popularTopics = (popularData.topics || [])
    .filter((topic) => !topic.deleted && topic.slug)
    .slice(0, 8)
    .map(normalizeLczTopic);

  const cache = {
    updatedAt: new Date().toISOString(),
    sourceUrl: LCZ_FORUM_BASE_URL,
    categories,
    recentTopics,
    popularTopics
  };

  writeJsonFile(LCZ_FORUM_CACHE_PATH, cache);
  return cache;
}

function scheduleLczForumRefresh() {
  refreshLczForumDigest().catch((error) => {
    console.warn("Initial LCZ forum refresh failed:", error.message);
  });

  const timer = setInterval(() => {
    refreshLczForumDigest().catch((error) => {
      console.warn("Scheduled LCZ forum refresh failed:", error.message);
    });
  }, LCZ_FORUM_REFRESH_INTERVAL_MS);

  if (typeof timer.unref === "function") timer.unref();
}

function detectNewsCategory(item, fallbackCategory) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.content || ""}`.toLowerCase();

  if (/(video|sora|veo|runway|pika|film|视频|影像|生成视频)/i.test(text)) return "AI视频";
  if (/(gpu|nvidia|cuda|chip|semiconductor|data center|datacenter|显卡|芯片|算力|数据中心)/i.test(text)) return "硬件";
  if (/(agent|workflow|automation|coding|developer|copilot|codex|智能体|工作流|自动化|编程)/i.test(text)) return "工作流";
  if (/(local|on-device|edge ai|open source|本地|端侧|开源)/i.test(text)) return "本地AI";
  if (/(model|llm|gpt|claude|gemini|deepseek|llama|mistral|大模型|模型)/i.test(text)) return "大模型";

  return fallbackCategory || "AI消息";
}

function readNewsCache() {
  return readJsonFile(NEWS_CACHE_PATH, {
    version: 0,
    updatedAt: null,
    items: [],
    sources: newsFeeds.map((feed) => ({ source: feed.source, url: feed.url }))
  });
}

function normalizeNewsItem(item, feed) {
  const publishedAt = item.isoDate || item.pubDate || item.pubdate || new Date().toISOString();
  const parsedDate = new Date(publishedAt);
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const summary = summarizeText(item.contentSnippet || item.summary || item.content || item.description || item.title);

  return {
    title: summarizeText(item.title, 120) || "AI 新闻更新",
    category: detectNewsCategory(item, feed.category),
    date: formatDate(safeDate),
    summary,
    source: feed.source,
    link: item.link || item.guid || feed.url,
    publishedAt: safeDate.toISOString()
  };
}

async function refreshAiNews() {
  const settledFeeds = await Promise.allSettled(newsFeeds.map(async (feed) => {
    const parsed = await rssParser.parseURL(feed.url);
    return (parsed.items || []).slice(0, 8).map((item) => normalizeNewsItem(item, feed));
  }));

  const items = [];
  settledFeeds.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      console.warn(`AI news feed failed: ${newsFeeds[index].source}`, result.reason.message);
    }
  });

  const seen = new Set();
  const deduped = items
    .filter((item) => {
      const key = String(item.link || item.title).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 12);

  if (deduped.length) {
    const translated = [];
    for (const item of deduped) {
      translated.push(await translateNewsItemToChinese(item));
    }

    writeJsonFile(NEWS_CACHE_PATH, {
      version: NEWS_CACHE_VERSION,
      updatedAt: new Date().toISOString(),
      items: translated,
      sources: newsFeeds.map((feed) => ({ source: feed.source, url: feed.url }))
    });
  }

  return readNewsCache();
}

function scheduleNewsRefresh() {
  refreshAiNews().catch((error) => {
    console.warn("Initial AI news refresh failed:", error.message);
  });

  const timer = setInterval(() => {
    refreshAiNews().catch((error) => {
      console.warn("Scheduled AI news refresh failed:", error.message);
    });
  }, NEWS_REFRESH_INTERVAL_MS);

  if (typeof timer.unref === "function") timer.unref();
}

function seedData() {
  if (state.users.length > 0) return;

  const passwordHash = bcrypt.hashSync("123456", 10);
  const aiPlayer = createUser("AI玩家", passwordHash);
  const workflow = createUser("工作流设计师", passwordHash);

  const p1 = createPost(
    "本地部署 AI，16GB 显存够用吗？",
    "如果主要跑文本大模型、小规模图像生成和学习工作流，16GB 显存可以入门；如果做 AI 视频或更大的模型，24GB 以上体验会明显更好。",
    "本地部署",
    aiPlayer.id
  );

  const p2 = createPost(
    "我的 AI 工作流：选题、搜索、总结、生成、发布",
    "我建议把 AI 当成一套生产流程，而不是单个聊天工具。先建立固定模板，再逐步自动化。",
    "工作流",
    workflow.id
  );

  createComment(p1.id, workflow.id, "可以先从轻量模型和 ComfyUI 入门，后面再升级显存更大的显卡。");
  createComment(p2.id, aiPlayer.id, "这个方向很适合做个人品牌，也适合沉淀成长期内容资产。");
  toggleLike(p1.id, workflow.id);
  toggleLike(p2.id, aiPlayer.id);
  saveState();
}

function createUser(username, passwordHash) {
  const user = {
    id: state.nextUserId++,
    username,
    password_hash: passwordHash,
    created_at: new Date().toISOString()
  };
  state.users.push(user);
  return user;
}

function createPost(title, content, category, userId) {
  const post = {
    id: state.nextPostId++,
    title,
    content,
    category,
    user_id: userId,
    created_at: new Date().toISOString()
  };
  state.posts.push(post);
  return post;
}

function createComment(postId, userId, content) {
  const comment = {
    id: state.nextCommentId++,
    post_id: postId,
    user_id: userId,
    content,
    created_at: new Date().toISOString()
  };
  state.comments.push(comment);
  return comment;
}

function toggleLike(postId, userId) {
  const index = state.likes.findIndex((like) => like.post_id === postId && like.user_id === userId);
  if (index >= 0) {
    state.likes.splice(index, 1);
    return false;
  }

  state.likes.push({
    post_id: postId,
    user_id: userId,
    created_at: new Date().toISOString()
  });
  return true;
}

seedData();

if (process.argv.includes("--init-db")) {
  console.log("Database initialized:", DATABASE_PATH);
  process.exit(0);
}

scheduleNewsRefresh();
scheduleLczForumRefresh();

function normalizeUsername(username) {
  return String(username || "").trim();
}

function validateUsername(username) {
  return /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,24}$/.test(username);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "请先登录" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    req.user = null;
  }

  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "AI Forum API" });
});

app.get("/api/news", async (req, res) => {
  const cache = readNewsCache();
  const cachedAt = cache.updatedAt ? new Date(cache.updatedAt).getTime() : 0;
  const stale = cache.version !== NEWS_CACHE_VERSION || !cachedAt || Date.now() - cachedAt > NEWS_REFRESH_INTERVAL_MS;

  try {
    const data = req.query.refresh === "1" || stale || !cache.items.length
      ? await refreshAiNews()
      : cache;

    res.json({
      news: data.items,
      updatedAt: data.updatedAt,
      sources: data.sources
    });
  } catch (error) {
    const fallback = readNewsCache();
    res.json({
      news: fallback.items,
      updatedAt: fallback.updatedAt,
      sources: fallback.sources,
      warning: error.message
    });
  }
});

app.get("/api/lcz-forum", async (req, res) => {
  const cache = readLczForumCache();
  const cachedAt = cache.updatedAt ? new Date(cache.updatedAt).getTime() : 0;
  const stale = !cachedAt || Date.now() - cachedAt > LCZ_FORUM_REFRESH_INTERVAL_MS;

  try {
    const data = req.query.refresh === "1" || stale || !cache.recentTopics.length
      ? await refreshLczForumDigest()
      : cache;

    res.json(data);
  } catch (error) {
    const fallback = readLczForumCache();
    res.json({
      ...fallback,
      warning: error.message
    });
  }
});

app.post("/api/auth/register", (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");

  if (!validateUsername(username)) {
    return res.status(400).json({ error: "用户名需为 2-24 位，可包含中文、英文、数字、下划线和短横线" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "密码至少需要 6 位" });
  }

  if (state.users.some((user) => user.username === username)) {
    return res.status(409).json({ error: "用户名已存在" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = createUser(username, passwordHash);
  saveState();

  const publicUser = { id: user.id, username: user.username };
  res.status(201).json({ token: signToken(publicUser), user: publicUser });
});

app.post("/api/auth/login", (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");
  const userRecord = state.users.find((user) => user.username === username);

  if (!userRecord || !bcrypt.compareSync(password, userRecord.password_hash)) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  const user = { id: userRecord.id, username: userRecord.username };
  res.json({ token: signToken(user), user });
});

app.get("/api/me", authRequired, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

app.get("/api/forum/posts", optionalAuth, (req, res) => {
  const category = String(req.query.category || "").trim();
  const q = String(req.query.q || "").trim().toLowerCase();
  const currentUserId = req.user ? req.user.id : 0;

  const posts = state.posts
    .filter((post) => !category || post.category === category)
    .filter((post) => {
      if (!q) return true;
      const author = state.users.find((user) => user.id === post.user_id)?.username || "";
      return [post.title, post.content, author].some((value) => value.toLowerCase().includes(q));
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id)
    .slice(0, 100)
    .map((post) => {
      const author = state.users.find((user) => user.id === post.user_id);
      const comments = state.comments
        .filter((comment) => comment.post_id === post.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id)
        .map((comment) => ({
          id: comment.id,
          content: comment.content,
          userId: comment.user_id,
          author: state.users.find((user) => user.id === comment.user_id)?.username || "用户",
          createdAt: formatDate(comment.created_at)
        }));

      return {
        id: post.id,
        title: post.title,
        content: post.content,
        category: post.category,
        userId: post.user_id,
        author: author ? author.username : "用户",
        createdAt: formatDate(post.created_at),
        likes: state.likes.filter((like) => like.post_id === post.id).length,
        likedByMe: state.likes.some((like) => like.post_id === post.id && like.user_id === currentUserId),
        comments
      };
    });

  res.json({ posts });
});

app.post("/api/forum/posts", authRequired, (req, res) => {
  const title = String(req.body.title || "").trim();
  const content = String(req.body.content || "").trim();
  const category = String(req.body.category || "").trim();

  if (title.length < 2 || title.length > 120) {
    return res.status(400).json({ error: "帖子标题需为 2-120 个字符" });
  }

  if (content.length < 2 || content.length > 5000) {
    return res.status(400).json({ error: "帖子内容需为 2-5000 个字符" });
  }

  if (!allowedCategories.has(category)) {
    return res.status(400).json({ error: "请选择有效频道" });
  }

  const post = createPost(title, content, category, req.user.id);
  saveState();
  res.status(201).json({ id: post.id });
});

app.delete("/api/forum/posts/:id", authRequired, (req, res) => {
  const id = Number(req.params.id);
  const post = state.posts.find((item) => item.id === id);

  if (!post) {
    return res.status(404).json({ error: "帖子不存在" });
  }

  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: "只能删除自己发布的帖子" });
  }

  state.posts = state.posts.filter((item) => item.id !== id);
  state.comments = state.comments.filter((comment) => comment.post_id !== id);
  state.likes = state.likes.filter((like) => like.post_id !== id);
  saveState();
  res.json({ ok: true });
});

app.post("/api/forum/posts/:id/like", authRequired, (req, res) => {
  const postId = Number(req.params.id);
  const post = state.posts.find((item) => item.id === postId);

  if (!post) {
    return res.status(404).json({ error: "帖子不存在" });
  }

  const liked = toggleLike(postId, req.user.id);
  saveState();
  const likes = state.likes.filter((like) => like.post_id === postId).length;
  res.json({ liked, likes });
});

app.post("/api/forum/posts/:id/comments", authRequired, (req, res) => {
  const postId = Number(req.params.id);
  const content = String(req.body.content || "").trim();

  if (content.length < 1 || content.length > 1000) {
    return res.status(400).json({ error: "评论内容需为 1-1000 个字符" });
  }

  if (!state.posts.some((post) => post.id === postId)) {
    return res.status(404).json({ error: "帖子不存在" });
  }

  const comment = createComment(postId, req.user.id, content);
  saveState();
  res.status(201).json({ id: comment.id });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
attachDafuwengGame(io);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI homepage multiplayer forum running at http://localhost:${PORT}`);
});

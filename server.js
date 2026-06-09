require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "development_secret_change_me";
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, "data", "forum.sqlite");

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const db = new Database(DATABASE_PATH);

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

function initDb() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS likes (
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
  `);

  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount === 0) {
    const passwordHash = bcrypt.hashSync("123456", 10);
    const insertUser = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
    const aiPlayer = insertUser.run("AI玩家", passwordHash).lastInsertRowid;
    const workflow = insertUser.run("工作流设计师", passwordHash).lastInsertRowid;

    const insertPost = db.prepare(`
      INSERT INTO posts (title, content, category, user_id)
      VALUES (?, ?, ?, ?)
    `);

    const p1 = insertPost.run(
      "本地部署 AI，16GB 显存够用吗？",
      "如果主要跑文本大模型、小规模图像生成和学习工作流，16GB 显存可以入门；如果做 AI 视频或更大的模型，24GB 以上体验会明显更好。",
      "本地部署",
      aiPlayer
    ).lastInsertRowid;

    const p2 = insertPost.run(
      "我的 AI 工作流：选题、搜索、总结、生成、发布",
      "我建议把 AI 当成一套生产流程，而不是单个聊天工具。先建立固定模板，再逐步自动化。",
      "工作流",
      workflow
    ).lastInsertRowid;

    db.prepare("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)").run(
      p1,
      workflow,
      "可以先从轻量模型和 ComfyUI 入门，后面再升级显存更大的显卡。"
    );

    db.prepare("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)").run(
      p2,
      aiPlayer,
      "这个方向很适合做个人品牌，也适合沉淀成长期内容资产。"
    );

    db.prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)").run(p1, workflow);
    db.prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)").run(p2, aiPlayer);
  }
}

initDb();

if (process.argv.includes("--init-db")) {
  console.log("Database initialized:", DATABASE_PATH);
  process.exit(0);
}

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
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
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

app.post("/api/auth/register", (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");

  if (!validateUsername(username)) {
    return res.status(400).json({ error: "用户名需为 2-24 位，可包含中文、英文、数字、下划线和短横线" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "密码至少需要 6 位" });
  }

  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    return res.status(409).json({ error: "用户名已存在" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, passwordHash);
  const user = { id: result.lastInsertRowid, username };
  const token = signToken(user);

  res.status(201).json({ token, user });
});

app.post("/api/auth/login", (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");

  const userRecord = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username);
  if (!userRecord || !bcrypt.compareSync(password, userRecord.password_hash)) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  const user = { id: userRecord.id, username: userRecord.username };
  const token = signToken(user);

  res.json({ token, user });
});

app.get("/api/me", authRequired, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

app.get("/api/forum/posts", optionalAuth, (req, res) => {
  const category = String(req.query.category || "").trim();
  const q = String(req.query.q || "").trim();

  const where = [];
  const params = {};

  if (category) {
    where.push("p.category = @category");
    params.category = category;
  }

  if (q) {
    where.push("(p.title LIKE @q OR p.content LIKE @q OR u.username LIKE @q)");
    params.q = `%${q}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const posts = db.prepare(`
    SELECT
      p.id,
      p.title,
      p.content,
      p.category,
      p.user_id AS userId,
      u.username AS author,
      strftime('%Y-%m-%d', p.created_at) AS createdAt,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.user_id = @currentUserId) AS likedByMe
    FROM posts p
    JOIN users u ON u.id = p.user_id
    ${whereSql}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 100
  `).all({ ...params, currentUserId: req.user ? req.user.id : 0 });

  const commentsStmt = db.prepare(`
    SELECT
      c.id,
      c.content,
      c.user_id AS userId,
      u.username AS author,
      strftime('%Y-%m-%d', c.created_at) AS createdAt
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC, c.id ASC
  `);

  const result = posts.map((post) => ({
    ...post,
    likedByMe: Boolean(post.likedByMe),
    comments: commentsStmt.all(post.id)
  }));

  res.json({ posts: result });
});

app.post("/api/forum/posts", authRequired, (req, res) => {
  const title = String(req.body.title || "").trim();
  const content = String(req.body.content || "").trim();
  const category = String(req.body.category || "").trim();

  const allowedCategories = new Set(["AI消息", "本地部署", "显卡硬件", "AI视频", "工作流"]);

  if (title.length < 2 || title.length > 120) {
    return res.status(400).json({ error: "帖子标题需为 2-120 个字符" });
  }

  if (content.length < 2 || content.length > 5000) {
    return res.status(400).json({ error: "帖子内容需为 2-5000 个字符" });
  }

  if (!allowedCategories.has(category)) {
    return res.status(400).json({ error: "请选择有效频道" });
  }

  const result = db.prepare(`
    INSERT INTO posts (title, content, category, user_id)
    VALUES (?, ?, ?, ?)
  `).run(title, content, category, req.user.id);

  res.status(201).json({ id: result.lastInsertRowid });
});

app.delete("/api/forum/posts/:id", authRequired, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare("SELECT id, user_id FROM posts WHERE id = ?").get(id);

  if (!post) {
    return res.status(404).json({ error: "帖子不存在" });
  }

  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: "只能删除自己发布的帖子" });
  }

  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.post("/api/forum/posts/:id/like", authRequired, (req, res) => {
  const postId = Number(req.params.id);
  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(postId);

  if (!post) {
    return res.status(404).json({ error: "帖子不存在" });
  }

  const liked = db.prepare("SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?").get(postId, req.user.id);

  if (liked) {
    db.prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?").run(postId, req.user.id);
  } else {
    db.prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)").run(postId, req.user.id);
  }

  const likes = db.prepare("SELECT COUNT(*) AS count FROM likes WHERE post_id = ?").get(postId).count;
  res.json({ liked: !liked, likes });
});

app.post("/api/forum/posts/:id/comments", authRequired, (req, res) => {
  const postId = Number(req.params.id);
  const content = String(req.body.content || "").trim();

  if (content.length < 1 || content.length > 1000) {
    return res.status(400).json({ error: "评论内容需为 1-1000 个字符" });
  }

  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
  if (!post) {
    return res.status(404).json({ error: "帖子不存在" });
  }

  const result = db.prepare(`
    INSERT INTO comments (post_id, user_id, content)
    VALUES (?, ?, ?)
  `).run(postId, req.user.id, content);

  res.status(201).json({ id: result.lastInsertRowid });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI homepage multiplayer forum running at http://localhost:${PORT}`);
});

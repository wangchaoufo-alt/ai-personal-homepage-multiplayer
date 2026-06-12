# AI前沿观察站 Pro - 多人论坛版

这是你的 AI 科技个人主页升级版，论坛已经从“浏览器本地保存”升级为“真实多人版”。

## 已实现功能

前端主页：

- AI 科技感首页
- AI 消息中心，每天自动拉取最新 AI RSS 消息
- 项目案例展示
- 路线图模块
- 响应式布局
- 科技感背景图片

多人论坛：

- 用户注册
- 用户登录
- JWT 登录状态
- 发布帖子
- 分类频道
- 搜索帖子
- 点赞 / 取消点赞
- 评论
- 只能删除自己发布的帖子
- JSON 文件存储
- 多人访问共享同一套数据

## 技术栈

- 前端：HTML + CSS + JavaScript
- 后端：Node.js + Express
- 数据存储：JSON 文件
- AI 消息源：RSS 自动更新并缓存
- 登录：JWT
- 密码加密：bcryptjs

## 本地运行

先安装 Node.js 18 或以上版本。

打开终端，进入项目目录：

```bash
cd ai_personal_homepage_multiplayer
```

安装依赖：

```bash
npm install
```

复制环境变量文件：

```bash
cp .env.example .env
```

Windows PowerShell 可以用：

```powershell
copy .env.example .env
```

启动：

```bash
npm start
```

打开浏览器访问：

```text
http://localhost:3000
```

## 测试账号

系统第一次启动时会自动创建两个测试账号：

```text
用户名：AI玩家
密码：123456
```

```text
用户名：工作流设计师
密码：123456
```

也可以直接在页面注册新账号。

## 局域网多人访问

如果你的电脑和手机在同一个 Wi-Fi：

1. 在电脑上运行 `npm start`
2. 查看电脑局域网 IP，例如 `192.168.1.20`
3. 手机浏览器访问：

```text
http://192.168.1.20:3000
```

这样手机和电脑看到的是同一个论坛。

## 上线部署建议

适合部署到：

- VPS 云服务器
- Render
- Railway
- Fly.io
- 自己的 Linux 服务器

### Render 部署

仓库已包含 `render.yaml`，推送到 GitHub 后可以在 Render 选择 Blueprint 部署。Render 会自动执行：

```bash
npm install
npm start
```

需要保留的环境变量：

```text
NODE_ENV=production
JWT_SECRET=由平台自动生成或手动设置为长随机字符串
DATABASE_PATH=/var/data/forum.json
NEWS_CACHE_PATH=/var/data/ai-news.json
NEWS_REFRESH_INTERVAL_MS=86400000
```

健康检查地址：

```text
/api/health
```

### Docker 部署

仓库已包含 `Dockerfile` 和 `.dockerignore`。构建并运行：

```bash
docker build -t ai-homepage-forum .
docker run -p 3000:3000 --env-file .env ai-homepage-forum
```

如果需要持久化论坛数据，建议挂载数据目录：

```bash
docker run -p 3000:3000 --env-file .env -v ./data:/app/data ai-homepage-forum
```

如果要正式公开使用，建议继续增加：

- HTTPS
- 管理员后台
- 帖子审核
- 图片上传
- 用户头像
- 忘记密码
- 邮箱验证
- 敏感词过滤
- 数据库备份
- PostgreSQL / MySQL 替代 SQLite

## 项目结构

```text
ai_personal_homepage_multiplayer/
├── public/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets/
├── data/
│   ├── forum.json    启动后自动生成
│   └── ai-news.json  AI 消息缓存，启动后自动生成
├── server.js
├── package.json
├── package-lock.json
├── .env.example
└── README.md
```

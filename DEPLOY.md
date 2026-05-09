# 部署指南 — 自有云服务器

> 本指南覆盖 **Stage 2.1**：Next.js + PostgreSQL + Prisma + NextAuth v5（GitHub OAuth）。
> 生产环境为 DigitalOcean Singapore，域名 `aiquant.kwinweng.com`。

## 前置条件

- 一台 Ubuntu 22.04 服务器（推荐 Vultr Tokyo / DigitalOcean Singapore，1GB RAM 起步）
- 一个域名（已解析 A 记录到服务器 IP）
- SSH 访问权限
- 一个 GitHub OAuth App（详见第六节）

---

## 一、服务器初始化（首次登录后执行一次）

```bash
# 用 root 登录，创建非 root 用户（替换 deploy 为你想要的名字）
adduser deploy
usermod -aG sudo deploy

# 切换到新用户
su - deploy

# 更新系统
sudo apt update && sudo apt upgrade -y

# 装 Node.js 20（用 NodeSource 官方源）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 装 Nginx + Certbot + Git
sudo apt install -y nginx certbot python3-certbot-nginx git

# 全局装 PM2（Node 进程守护）
sudo npm install -g pm2

# 防火墙开放 80/443
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 二、安装 PostgreSQL 14 并创建数据库

```bash
# 安装 PostgreSQL（Ubuntu 22.04 自带 14）
sudo apt install -y postgresql postgresql-contrib

# 启动并设置开机自启
sudo systemctl enable --now postgresql

# 创建数据库角色和库（替换密码！）
sudo -u postgres psql <<'SQL'
CREATE ROLE aiquant WITH LOGIN PASSWORD '<replace-with-strong-password>';
CREATE DATABASE ai_quant_copilot OWNER aiquant;
GRANT ALL PRIVILEGES ON DATABASE ai_quant_copilot TO aiquant;
SQL
```

只允许本机连接（默认行为）。如需远程访问再改 `pg_hba.conf` + `postgresql.conf`，但本项目所有连接都来自同机 Next.js，无须开放。

---

## 三、克隆代码并配置 .env

```bash
# 配置 Git 凭证（用 SSH key 或 GitHub Personal Access Token）
# 推荐 SSH：在服务器生成 ssh-keygen，把 ~/.ssh/id_ed25519.pub 加到 GitHub Settings > SSH Keys

cd ~
git clone git@github.com:kwinweng/ai-quant-copilot.git
cd ai-quant-copilot

# 复制 env 模板并填入真实值
cp .env.example .env
nano .env
```

`.env` 必填字段（变量名是 NextAuth v5 规范，注意 `AUTH_*` 而非 `NEXTAUTH_*`）：

```dotenv
DATABASE_URL=postgresql://aiquant:<password>@localhost:5432/ai_quant_copilot

# openssl rand -base64 32
AUTH_SECRET=<32-byte-random>

AUTH_URL=https://aiquant.kwinweng.com
AUTH_TRUST_HOST=true

# 第六节会创建 OAuth App 拿到这两个值
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=

# DeepSeek API key（plan / conclusion 生成用）
# 在 https://platform.deepseek.com/api_keys 创建
DEEPSEEK_API_KEY=
# 可选：默认 deepseek-chat，可改成 deepseek-reasoner
AI_MODEL=
```

`.env` 已在 `.gitignore` 中，**绝不要**提交进 Git。

---

## 四、安装依赖、迁移数据库、构建

```bash
npm install

# 生成 Prisma client（读 .env 的 DATABASE_URL）
npx prisma generate

# 在生产库上执行迁移（首次部署会创建所有表）
npx prisma migrate deploy

# 编译 Next.js
npm run build
```

> 本地开发首次建表用 `npx prisma migrate dev --name init`，会同时生成 migration 文件并写入 schema 历史。
> 生产只跑 `migrate deploy` 应用既有 migration，**永远不要**在生产跑 `migrate dev`。

---

## 五、用 PM2 启动 Next.js

```bash
# 启动（默认端口 3000）
pm2 start npm --name "ai-quant-copilot" -- start

# 设置开机自启
pm2 startup    # 复制输出的命令并执行
pm2 save
```

---

## 六、创建 GitHub OAuth App 并写回 .env

1. 去 https://github.com/settings/developers → New OAuth App
2. 填：
   - Application name：`AI Quant Copilot (Prod)`
   - Homepage URL：`https://aiquant.kwinweng.com`
   - Authorization callback URL：`https://aiquant.kwinweng.com/api/auth/callback/github`
3. 点 **Register application**，进入详情页：
   - 复制 **Client ID** → `AUTH_GITHUB_ID`
   - 点 **Generate a new client secret** → 复制一次 → `AUTH_GITHUB_SECRET`
4. 把这两个值填进服务器 `~/ai-quant-copilot/.env`，然后 `pm2 reload ai-quant-copilot` 让进程拿到新值。

> 本地开发再建一个 OAuth App，回调写 `http://localhost:3000/api/auth/callback/github`，凭证写进 `.env.local`。

---

## 七、Nginx 反向代理（绑定域名）

替换 `your-domain.com` 为你的实际域名：

```bash
sudo nano /etc/nginx/sites-available/ai-quant-copilot
```

粘贴以下内容：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/ai-quant-copilot /etc/nginx/sites-enabled/
sudo nginx -t        # 测试配置
sudo systemctl reload nginx
```

此时浏览器访问 `http://your-domain.com` 应该能看到登录页。

---

## 八、配置 HTTPS（Let's Encrypt 免费证书）

```bash
sudo certbot --nginx -d your-domain.com

# 输入邮箱、同意条款
# Certbot 会自动改 Nginx 配置加上 SSL，并设置自动续期
```

完成后访问 `https://your-domain.com` 就有锁了。**记得 `AUTH_URL` 也要改成 `https://...`，不然 OAuth 回调会失败。**

---

## 九、首次登录验证 + Demo Seed

1. 浏览器打开 `https://your-domain.com` → 自动跳到 `/login`
2. 点"使用 GitHub 登录" → 授权 → 回到首页
3. 第一次登录会自动 seed 3 条 demo studies（由 `src/auth.ts` 的 `events.createUser` 钩子触发）
4. 已存在用户想补 seed：`npx prisma db seed`

---

## 十、后续更新流程

```bash
cd ~/ai-quant-copilot
git pull
npm install                  # 如果 package.json 改过
npx prisma migrate deploy    # 如果 schema 改过
npm run build
pm2 reload ai-quant-copilot
```

---

## 十一、（可选）GitHub Actions 自动部署

每次 push 到 main 自动部署。在仓库添加 `.github/workflows/deploy.yml`：

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd ~/ai-quant-copilot
            git pull
            npm install
            npx prisma migrate deploy
            npm run build
            pm2 reload ai-quant-copilot
```

在 GitHub Settings > Secrets 添加 `SERVER_HOST`、`SERVER_USER`、`SERVER_SSH_KEY`。

---

## 故障排查

**端口被占**：`sudo lsof -i :3000` 查看占用
**PM2 看日志**：`pm2 logs ai-quant-copilot`
**Nginx 报错**：`sudo tail -f /var/log/nginx/error.log`
**证书续期测试**：`sudo certbot renew --dry-run`
**数据库连不上**：`sudo -u postgres psql -c "\l"` 看 db 是否存在；`psql -U aiquant -d ai_quant_copilot -h localhost` 验证用户能否登录
**OAuth 回调失败**：检查 GitHub OAuth App 的 callback URL 是否和 `AUTH_URL` 完全一致；HTTPS 部署后 `AUTH_URL` 必须是 `https://`
**Prisma client 报 schema 不匹配**：拉了新代码后跑 `npx prisma generate && npx prisma migrate deploy`

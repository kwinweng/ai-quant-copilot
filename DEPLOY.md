# 部署指南 — 自有云服务器

## 前置条件

- 一台 Ubuntu 22.04 服务器（推荐 Vultr Tokyo / DigitalOcean Singapore，1GB RAM 起步）
- 一个域名（已解析 A 记录到服务器 IP）
- SSH 访问权限

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

## 二、克隆代码并构建

```bash
# 配置 Git 凭证（用 SSH key 或 GitHub Personal Access Token）
# 推荐 SSH：在服务器生成 ssh-keygen，把 ~/.ssh/id_ed25519.pub 加到 GitHub Settings > SSH Keys

cd ~
git clone git@github.com:kwinweng/ai-quant-copilot.git
cd ai-quant-copilot

npm install
npm run build
```

---

## 三、用 PM2 启动 Next.js

```bash
# 启动（默认端口 3000）
pm2 start npm --name "ai-quant-copilot" -- start

# 设置开机自启
pm2 startup    # 复制输出的命令并执行
pm2 save
```

---

## 四、Nginx 反向代理（绑定域名）

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

此时浏览器访问 `http://your-domain.com` 应该能看到原型。

---

## 五、配置 HTTPS（Let's Encrypt 免费证书）

```bash
sudo certbot --nginx -d your-domain.com

# 输入邮箱、同意条款
# Certbot 会自动改 Nginx 配置加上 SSL，并设置自动续期
```

完成后访问 `https://your-domain.com` 就有锁了。

---

## 六、后续更新流程

```bash
cd ~/ai-quant-copilot
git pull
npm install        # 如果 package.json 改过
npm run build
pm2 reload ai-quant-copilot
```

---

## 七、（可选）GitHub Actions 自动部署

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

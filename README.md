# Mihomo Manager

Mihomo Manager 是一个基于 Cloudflare 边缘计算的 Mihomo (Clash) 订阅管理与分发平台。

## ✨ 特性

- 🚀 **边缘部署**: 依托 Cloudflare Workers/Pages，全球 CDN 加速，无需自建服务器。
- 🔑 **安全认证**: 支持 WebAuthn (Passkeys) 无密码登录，确保管理端极致安全。
- 📝 **智能模板**: 内置强大的 YAML 配置模板与在线编辑器 (CodeMirror)。
- ☁️ **云端存储**: 使用 Cloudflare KV 存储配置，R2 托管附件。
- 🔄 **自动更新**: 每日定时任务 (Cron) 自动拉取并刷新订阅节点。

## 🛠️ 技术栈

- **前端**: React 19, Vite, Tailwind CSS 4, Framer Motion
- **后端**: Cloudflare Workers
- **存储**: Cloudflare KV (数据), Cloudflare R2 (附件)
- **其他**: WebAuthn, js-yaml

## 🚀 部署与运行

### 环境要求

- Node.js 22+
- Cloudflare 账号 (Wrangler CLI)

### 本地开发

1. **安装依赖**
   ```bash
   npm install
   ```

2. **本地运行**
   启动前端开发服务器（开发模式下会自动调用配置的 Worker 环境）：
   ```bash
   npm run dev
   ```
   如需独立调试 Worker：
   ```bash
   npm run dev:worker
   ```

### 部署到 Cloudflare

使用 Wrangler 一键构建并部署:

```bash
npm run deploy
```

*(注意: 首次部署时，Wrangler 自动生成的 KV 和 R2 绑定配置需要确认一致。)*

## 📄 许可证

本项目仅供学习交流使用。

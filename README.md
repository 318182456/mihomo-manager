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

## Windows：设置或清除代理环境变量

可将 `src/scripts/antigravity-proxy.cmd` 单独复制到任意位置，双击后选择 **设置代理环境变量**、**清除代理环境变量** 或退出。也可传入 `set`、`clear`；`check` 只查看当前设置。

脚本顶部的 `PROXY_SERVER` 默认为 `127.0.0.1:7890`，要求 Mihomo 等软件已经提供 HTTP/mixed 代理端口。设置只向当前 Windows 用户持久写入 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY`。这也会影响其他读取这些用户设置的软件。

清除只删除上述四个用户环境变量。系统代理由用户自行在 Clash 等软件中管理，脚本不读取或修改 Windows 的 Internet Settings。脚本不会启动或停止 Mihomo、Antigravity、Antigravity IDE、VS Code，也不改 TUN、hosts、机器级环境变量或扩展启用状态；不使用 PowerShell 或管理员权限。

已有进程仍保留旧环境。设置或清除后，先保存工作并注销再登录，可确保手动启动的应用取得新环境；脚本不会替用户注销或关闭程序。旧 `antigravity-proxy` 代理助手应保持禁用，避免重新写入 hosts。

`template/ai_rules.yaml` 已覆盖 Antigravity 的接口、登录、头像和后端更新域名，统一走 `AI` 分组；更新服务使用 `DOMAIN-KEYWORD,antigravity-cli-auto-updater,AI`，避免绑定项目编号或区域。修改本地模板不会自动发布云端模板。规则仅处理已经进入 Mihomo 的连接，不会捕获不遵循代理设置的直连流量。

## 📄 许可证

本项目仅供学习交流使用。

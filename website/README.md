# After Zero 公网页面

这是可部署到静态托管服务的隐私政策和技术支持页面，不需要后端服务器或数据库。

## 页面

- `privacy.html`：提交到 App Store Connect 的隐私政策 URL
- `support.html`：提交到 App Store Connect 的技术支持 URL
- `index.html`：站点首页

部署后建议使用清晰的公开地址，例如：

- `https://afterzero.tech/privacy.html`
- `https://afterzero.tech/support.html`

## 发布前检查

1. 确认域名 DNS 指向静态托管服务。
2. 确认三个页面均能在手机浏览器中通过 HTTPS 打开，不要求登录。
3. 确认隐私政策和支持邮箱仍然有效。
4. 在 App Store Connect 填写 `privacy.html` 和 `support.html` 的完整 URL。

当前仓库没有既有托管配置，因此本目录只负责页面源码；部署到 GitHub Pages、Cloudflare Pages、Netlify、Vercel 或现有域名托管平台需要单独配置域名和发布权限。

本项目根目录的 `netlify.toml` 已将 Netlify 发布目录配置为 `website`，连接 GitHub 后无需再填写构建命令。

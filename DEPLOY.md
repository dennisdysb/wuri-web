# 戊日网页版 · 双线部署说明

站点有两条同源同版的线（仓库 `www/` 是唯一源码）：

| 线 | 地址 | 用途 |
|---|---|---|
| GitHub Pages | https://dennisdysb.github.io/wuri-web/www/ | 海外主站 |
| Cloudflare Pages | https://wuri.shengboyu.ca/（项目 wuri-web，预览域 wuri-web.pages.dev） | 国内入口（GitHub 在大陆时通时断） |

> 注意：两个地址的 localStorage 不互通（解锁状态、兑换都按域名存）。
> 用户在哪个地址兑换，就固定用哪个地址使用，不要混用。

## 发版流程（两边必须同版）

1. 改 `www/` 内容，按既有规矩同步 bump：显示版本（括号号）、SW 缓存名、CSS 的 `?v=` 三者一起动。
2. `git push` —— GitHub Pages 自动部署。
3. `./deploy-cf.sh` —— 把同一份 `www/` 部署到 Cloudflare Pages。
4. 两边各抽验一次：首页能开、「关于」版本号一致、图鉴入口在。

## deploy-cf.sh 做的三项镜像适配（只作用于临时副本，不改 www 源码）

1. **诵读音频基址相对化**：`js/jingwen.js` 的 `JING_BASE` 在源码里写死 github.io
   绝对地址（播放/下载都走它）；镜像副本里 sed 成相对路径 `audio/jing/`，
   否则国内用户在镜像站听经仍要连 GitHub。
2. **媒体图标**：`js/media-session.js` 的 `ICON_SRC` 改指
   `https://wuri.shengboyu.ca/img/logo-96.png`。
3. **大音频转码**：Cloudflare Pages 单文件上限 25 MiB；`audio/jing/` 里
   s01/s02 的男女声 mp3 原文件 36–48 MB（128kbps），镜像副本里转 64kbps
   单声道（约 19–23 MB）。GitHub 线仍是原音质，两边内容一致、仅这 4 个
   文件的码率不同。

## 自定义域名状态（2026-10-18）

- Pages 项目侧已添加 `wuri.shengboyu.ca`，状态 pending，等 DNS 生效。
- 现有 API token **没有 DNS 权限**，zone 里还差一条记录，需账号持有人在
  Cloudflare Dashboard → shengboyu.ca → DNS 里手动添加：
  - 类型：`CNAME`，主机名：`wuri`，目标：`wuri-web.pages.dev`，代理：开启（橙云）
- 记录生效后 Pages 会自动签发证书，`https://wuri.shengboyu.ca` 即通。

## 凭据

脚本从环境变量 `CLOUDFLARE_API_TOKEN` 或 `~/.config/cloudflare/api_token` 读
token（文件在本机、权限 600），脚本与仓库里不存任何 token 值。

#!/usr/bin/env bash
# 把 www/ 部署到 Cloudflare Pages 项目 wuri-web（国内入口 wuri.shengboyu.ca）。
# 与 GitHub Pages 同一份源码；本脚本在临时暂存副本上做三项「镜像本地化」适配，
# 绝不修改 www/ 源码本身：
#   1) js/jingwen.js 的 JING_BASE 由 github.io 绝对地址改相对路径 audio/jing/
#      （否则镜像站的诵读音频仍从 GitHub 拉，大陆照样卡）；
#   2) js/media-session.js 的 ICON_SRC 改指 https://wuri.shengboyu.ca/img/logo-96.png；
#   3) 超过 Pages 单文件上限 25 MiB 的 mp3 转码为 64kbps 单声道（仅镜像副本，
#      GitHub 上的原音质不受影响）。
# 凭据：优先环境变量 CLOUDFLARE_API_TOKEN；没有则读 ~/.config/cloudflare/api_token。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$REPO_ROOT/www"
PROJECT="wuri-web"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-1efdb108f4dac16ca93762cf3df54302}"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "$HOME/.config/cloudflare/api_token" ]; then
  CLOUDFLARE_API_TOKEN="$(cat "$HOME/.config/cloudflare/api_token")"
  export CLOUDFLARE_API_TOKEN
fi
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "缺 CLOUDFLARE_API_TOKEN（环境变量或 ~/.config/cloudflare/api_token）" >&2; exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -a "$SRC/." "$STAGE/"

sed -i.bak "s#https://dennisdysb.github.io/wuri-web/www/audio/jing/#audio/jing/#" "$STAGE/js/jingwen.js"
sed -i.bak "s#https://dennisdysb.github.io/wuri-web/www/img/logo-96.png#https://wuri.shengboyu.ca/img/logo-96.png#" "$STAGE/js/media-session.js"
rm -f "$STAGE/js/jingwen.js.bak" "$STAGE/js/media-session.js.bak"

# Pages 单文件上限 25 MiB：超限 mp3 在镜像副本里转码
while IFS= read -r f; do
  case "$f" in
    *.mp3)
      echo "转码超限音频（镜像专用 64kbps 单声道）：${f#$STAGE/}"
      ffmpeg -nostdin -y -v error -i "$f" -ac 1 -b:a 64k "$f.min.mp3" < /dev/null && mv "$f.min.mp3" "$f"
      ;;
    *)
      echo "文件超过 25 MiB 且不是 mp3，Pages 无法托管：$f" >&2; exit 1
      ;;
  esac
done < <(find "$STAGE" -type f -size +26214400c)

cd "$STAGE"
npx --yes wrangler pages deploy . --project-name "$PROJECT" --branch main --commit-dirty=true
echo "CF Pages 部署完成：https://wuri-web.pages.dev（正式域名 https://wuri.shengboyu.ca）"

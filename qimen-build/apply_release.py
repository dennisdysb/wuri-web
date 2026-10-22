#!/usr/bin/env python3
"""v1.3.9 (38) 装配：把奇门视图/入口/付费墙/鸣谢装进 index.html，并四处同步 bump 版本。
四处：①index.html 可见版本串 ②sw.js CACHE ③index.html CSS ?v=（含 sw ASSETS） ④i18n.js 简繁 me_ver。
"""
import os

WWW = os.path.expanduser("~/workspace/wuri-web/www")
BUILD = os.path.expanduser("~/workspace/wuri-web/qimen-build")

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

def write(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)

def rep(text, old, new, count=1, tag=""):
    n = text.count(old)
    assert n == count, f"[{tag}] 期望 {count} 次，实际 {n} 次：{old[:90]!r}"
    return text.replace(old, new)

idx = read(os.path.join(WWW, "index.html"))
frag = read(os.path.join(BUILD, "fragment.html")).rstrip("\n")

# 1) 首页入口卡（紫微卡之后）
idx = rep(idx,
"""        <button class="btn primary" id="ziwei-enter">开始排盘</button>
      </div>
    </section>
    <div class="tab-spacer"></div>""",
"""        <button class="btn primary" id="ziwei-enter">开始排盘</button>
      </div>
    </section>

    <!-- 奇门遁甲（Pro）入口 -->
    <section class="card" id="qimen-entry-card">
      <div class="card-title">奇门遁甲</div>
      <p class="hint">问事起局，时家奇门排盘，九宫格局一览。</p>
      <div class="btn-row">
        <button class="btn primary" id="qimen-enter">开始排盘</button>
      </div>
    </section>
    <div class="tab-spacer"></div>""", tag="entry-card")

# 2) 奇门视图（我的页之前）
view = """  <!-- ============ 奇门遁甲 ============ -->
  <main id="view-qimen" class="view" hidden>
    <button class="jing-back-fab show" style="position:fixed" onclick="document.getElementById('qimen-back').click()" title="返回">‹</button>
    <header class="appbar">
      <button class="mini-btn" id="qimen-back">‹ 返回</button>
      <h1 class="brand-title">奇门遁甲</h1>
    </header>
    <div id="qm-root" class="qm-scope">
""" + frag + """
    </div>
  </main>

  <!-- ============ 我的 ============ -->"""
idx = rep(idx, "  <!-- ============ 我的 ============ -->", view, tag="view-qimen")

# 3) 付费墙权益清单加一条
idx = rep(idx, "        <li>六爻占卜：铜钱起卦、装卦断卦</li>",
          "        <li>六爻占卜：铜钱起卦、装卦断卦</li>\n        <li>奇门遁甲排盘：问事起局、九宫格局判定</li>", tag="paywall-li")

# 4) 我的页高级版卡片简介补奇门（与 i18n 两词条同步，顺带对齐旧词条与页面文案的漂移）
idx = rep(idx, "内丹典籍、八字排盘、紫微斗数、六爻占卜、年历总览，一次买断，永久使用。",
          "内丹典籍、八字排盘、紫微斗数、六爻占卜、奇门遁甲、年历总览，一次买断，永久使用。", tag="pro-card-hint-html")

# 5) 关于页鸣谢行
idx = rep(idx,
    '      <p class="hint" data-i18n="me_about_hint">',
    '      <p class="hint">奇门遁甲排盘功能基于开源项目「掌上乾坤 · 奇门遁甲助手」（作者 qzp001，依 MIT 许可证使用），特此鸣谢。</p>\n'
    '      <p class="hint" data-i18n="me_about_hint">', tag="ack")

# 6) 版本串（38）与 CSS ?v=78 + qimen.css 链接
idx = rep(idx, "戊日不上香 v1.3.9（37） (2026-10-21)", "戊日不上香 v1.3.9（38） (2026-10-22)", tag="me-ver-html")
idx = rep(idx, '<link rel="stylesheet" href="css/style.css?v=77">',
          '<link rel="stylesheet" href="css/style.css?v=78">\n<link rel="stylesheet" href="css/qimen.css?v=78">', tag="css-link")

# 7) 脚本引入（ziwei.js 之后）
idx = rep(idx, '<script src="js/ziwei.js"></script>',
"""<script src="js/ziwei.js"></script>
<script src="js/qimen-engine.js"></script>
<script src="js/qimen-geju.js"></script>
<script src="js/qimen-data.js"></script>
<script src="js/qimen-cases.js"></script>
<script src="js/qimen-cal.js"></script>
<script src="js/qimen-render3d.js"></script>
<script src="js/qimen-app.js"></script>""", tag="scripts")
write(os.path.join(WWW, "index.html"), idx)

# i18n.js：me_ver ×2 + pro_card_hint ×2
i18n = read(os.path.join(WWW, "js/i18n.js"))
i18n = rep(i18n, "me_ver: '戊日不上香 v1.3.9（37） (2026-10-21)'", "me_ver: '戊日不上香 v1.3.9（38） (2026-10-22)'", count=2, tag="me-ver-i18n")
i18n = rep(i18n, "pro_card_hint: '内丹经文库、年历总览、八字排盘，一次买断，永久使用。'",
           "pro_card_hint: '内丹典籍、八字排盘、紫微斗数、六爻占卜、奇门遁甲、年历总览，一次买断，永久使用。'", tag="hint-cn")
i18n = rep(i18n, "pro_card_hint: '內丹經文庫、年曆總覽、八字排盤，一次買斷，永久使用。'",
           "pro_card_hint: '內丹典籍、八字排盤、紫微斗數、六爻占卜、奇門遁甲、年曆總覽，一次買斷，永久使用。'", tag="hint-tw")
write(os.path.join(WWW, "js/i18n.js"), i18n)

# sw.js：缓存名 + ASSETS
sw = read(os.path.join(WWW, "sw.js"))
sw = rep(sw, "const CACHE = 'wuri-v77-20261021-icstime';", "const CACHE = 'wuri-v78-20261022-qimen';", tag="sw-cache")
sw = rep(sw, "'./css/style.css?v=77',", "'./css/style.css?v=78',\n  './css/qimen.css?v=78',", tag="sw-css")
sw = rep(sw, "  './js/pro.js',",
"""  './js/pro.js',
  './js/qimen-engine.js',
  './js/qimen-geju.js',
  './js/qimen-data.js',
  './js/qimen-cases.js',
  './js/qimen-cal.js',
  './js/qimen-render3d.js',
  './js/qimen-app.js',""", tag="sw-assets")
write(os.path.join(WWW, "sw.js"), sw)
print("RELEASE ASSEMBLY OK")

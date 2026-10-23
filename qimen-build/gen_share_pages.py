#!/usr/bin/env python3
"""生成「神仙缘分测试」专属分享页：www/yuanfen/<slug>.html × 74（整屏海报式、独立地址、带 OG）。

数据源（仓内同源，两处都是定版数据的机器可读形态）：
- www/content/deities.json —— 图鉴数据（name / title / image / domain）
- www/js/affinity-data.js  —— AFFINITY_TAGS（needs / traits / motifs，源 affinity-tags.json）

重跑时机：图鉴数据（deities.json）或缘分标签（affinity-data.js）任何变更后重跑本脚本；
产物（www/yuanfen/*.html）入仓，随 www 一起发布（GitHub Pages / CF 镜像同源）。

地址口径：对外绝对地址统一 https://wuri.shengboyu.ca/yuanfen/<slug>.html；
og:image 用同域造像图绝对地址。页面内造像用相对路径 ../img/deities/<image>（复用现有图，不复制）。
slug：图鉴 id 本身即 URL 安全拼音，SLUG_MAP 为显式映射表（id → slug）；
将来某位要改对外地址时只改此表，不要改 id。
结语文案：通用式——以该神祇「主所求 + 第一气质」组句，不虚构具体答题者信息。
"""
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, "www")
OUT_DIR = os.path.join(WWW, "yuanfen")
SITE = "https://wuri.shengboyu.ca"

# id → slug 显式映射（当前与 id 相同；id 本身为拼音、URL 安全）
SLUG_MAP = {
    "yuanshi": "yuanshi", "lingbao": "lingbao", "daode": "daode",
    "yuhuang": "yuhuang", "wangmu": "wangmu", "ziwei": "ziwei",
    "gouchen": "gouchen", "houtu": "houtu", "changsheng": "changsheng",
    "taiyi": "taiyi", "doumu": "doumu", "donghua": "donghua",
    "xuannv": "xuannv", "puhua": "puhua", "taiyang": "taiyang",
    "taiyin": "taiyin", "nandou": "nandou", "beidou": "beidou",
    "taisui": "taisui", "tianguan": "tianguan", "diguan": "diguan",
    "shuiguan": "shuiguan", "dongyue": "dongyue", "bixia": "bixia",
    "xiyue": "xiyue", "nanyue": "nanyue", "zhongyue": "zhongyue",
    "beiyue": "beiyue", "longwang": "longwang", "fengdu": "fengdu",
    "chenghuang": "chenghuang", "zhenwu": "zhenwu", "erlang": "erlang",
    "nezha": "nezha", "wanglingguan": "wanglingguan", "huaguang": "huaguang",
    "wenqiong": "wenqiong", "zhongkui": "zhongkui", "wenchang": "wenchang",
    "kuixing": "kuixing", "guandi": "guandi", "zhaogongming": "zhaogongming",
    "bigan": "bigan", "zhangdaoling": "zhangdaoling", "gexuan": "gexuan",
    "xuxun": "xuxun", "sashoujian": "sashoujian", "sanmao": "sanmao",
    "wangchongyang": "wangchongyang", "zhangsanfeng": "zhangsanfeng",
    "qiuchuji": "qiuchuji", "liuhai": "liuhai", "tieguai": "tieguai",
    "zhongli": "zhongli", "zhangguolao": "zhangguolao", "lvdongbin": "lvdongbin",
    "hexiangu": "hexiangu", "lancaihe": "lancaihe", "hanxiangzi": "hanxiangzi",
    "caoguojiu": "caoguojiu", "shennong": "shennong", "yaowang": "yaowang",
    "baosheng": "baosheng", "luban": "luban", "mazu": "mazu",
    "linshui": "linshui", "guangze": "guangze", "lishan": "lishan",
    "magu": "magu", "zhusheng": "zhusheng", "tudi": "tudi",
    "zaojun": "zaojun", "yuelao": "yuelao", "hehe": "hehe",
}

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{background:#EFE9D6;font-family:"Noto Serif SC","Songti SC","STSong","SimSun",serif;color:#2A251B;
  -webkit-text-size-adjust:100%}
.poster{min-height:100svh;display:flex;align-items:stretch;justify-content:center;padding:14px}
.frame{flex:1;max-width:480px;background:#F5F1E5;border:2px solid #A2813B;outline:1px solid #A2813B;
  outline-offset:-9px;display:flex;flex-direction:column;align-items:center;text-align:center;
  padding:30px 30px 24px}
.brand{font-size:1.32rem;font-weight:600;letter-spacing:.42em;text-indent:.42em;color:#86702E}
.brand-sub{font-size:.82rem;letter-spacing:.5em;text-indent:.5em;color:#8C8371;margin-top:7px}
.imgbox{width:min(100%,340px);margin-top:22px;border-radius:14px;overflow:hidden;border:2px solid #E3DBC3;
  aspect-ratio:420/500;background:#E9E2CC}
.imgbox img{display:block;width:100%;height:100%;object-fit:cover;object-position:top center}
.name{font-size:2.6rem;font-weight:700;letter-spacing:.06em;margin-top:20px;line-height:1.15}
.title{font-size:1.02rem;color:#86702E;margin-top:8px}
.divider{display:flex;align-items:center;gap:10px;margin:18px 0 4px;width:190px}
.divider span{flex:1;height:2px;background:#A2813B}
.divider i{width:9px;height:9px;background:#A2813B;transform:rotate(45deg);flex:none}
.match{font-size:1.28rem;font-weight:600;color:#2A5044;margin-top:10px}
.tags{font-size:.95rem;color:#5B5340;margin-top:9px}
.domain{font-size:.86rem;line-height:1.75;color:#5B5340;margin-top:13px;max-width:21em}
.cta{display:block;margin-top:auto;padding-top:26px;text-decoration:none}
.cta b{display:block;background:#2A5044;color:#F5F1E5;font-weight:600;font-size:1.05rem;letter-spacing:.14em;
  padding:14px 30px;border-radius:999px}
.cta:active b{background:#1E3B32}
.honest{font-size:.7rem;color:#8C8371;margin-top:16px;line-height:1.7}
.sitedomain{font-size:.78rem;letter-spacing:.24em;color:#86702E;margin-top:12px;font-weight:600}
""".strip()

TPL = """<!DOCTYPE html>
<!-- 本页由 qimen-build/gen_share_pages.py 生成，勿手改；图鉴/标签数据变更后重跑脚本。 -->
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>我的神仙缘分：{name} · 戊日不上香</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="戊日不上香">
<meta property="og:title" content="我的神仙缘分：{name}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{abs_img}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="我的神仙缘分：{name}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{abs_img}">
<style>{css}</style>
</head>
<body>
<main class="poster">
  <div class="frame">
    <p class="brand">戊 日 不 上 香</p>
    <p class="brand-sub">神 仙 缘 分 测 试</p>
    <div class="imgbox"><img src="../img/deities/{image}" alt="{name}造像"></div>
    <h1 class="name">{name}</h1>
    <p class="title">{title}</p>
    <div class="divider"><span></span><i></i><span></span></div>
    <p class="match">与{name}最相合</p>
    <p class="tags">所求「{need}」 · 气质「{trait}」</p>
    <p class="domain">{domain}</p>
    <a class="cta" href="{cta}"><b>测测与你有缘的神仙</b></a>
    <p class="honest">题目为现代创作 · 文化趣味与自我认识 · 不作吉凶断言</p>
    <p class="sitedomain">wuri.shengboyu.ca</p>
  </div>
</main>
</body>
</html>
"""


def load_tags():
    src = open(os.path.join(WWW, "js", "affinity-data.js"), encoding="utf-8").read()
    m = re.search(r"window\.AFFINITY_TAGS = (\[.*?\]);", src, re.S)
    if not m:
        raise SystemExit("AFFINITY_TAGS 未在 affinity-data.js 中找到")
    return {d["id"]: d for d in json.loads(m.group(1))}


def main():
    deities = json.load(open(os.path.join(WWW, "content", "deities.json"), encoding="utf-8"))["deities"]
    tags = load_tags()
    assert len(deities) == 74, f"图鉴应为 74 位，实得 {len(deities)}"
    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    seen_slugs = set()
    for d in deities:
        did = d["id"]
        assert did in SLUG_MAP, f"SLUG_MAP 缺 {did}"
        assert did in tags, f"affinity 标签缺 {did}"
        slug = SLUG_MAP[did]
        assert re.fullmatch(r"[a-z0-9-]+", slug), f"slug 不安全：{slug}"
        assert slug not in seen_slugs, f"slug 重复：{slug}"
        seen_slugs.add(slug)
        t = tags[did]
        need = (t["needs"]["primary"] or [""])[0]
        trait = (t["traits"] or [""])[0]
        url = f"{SITE}/yuanfen/{slug}.html"
        abs_img = f"{SITE}/img/deities/{d['image']}"
        desc = (f"{d['name']}（{d['title']}）——{d['domain']}。"
                f"十二道情境小题，看看七十四位尊神之中，谁与你最相合。")
        page = TPL.format(
            css=CSS,
            name=html.escape(d["name"]),
            title=html.escape(d["title"]),
            domain=html.escape(d["domain"]),
            image=html.escape(d["image"]),
            need=html.escape(need),
            trait=html.escape(trait),
            url=url,
            abs_img=abs_img,
            desc=html.escape(desc, quote=True),
            cta=f"{SITE}/?yuanfen=1",
        )
        path = os.path.join(OUT_DIR, slug + ".html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(page)
        total += len(page.encode("utf-8"))
    print(f"wrote {len(seen_slugs)} pages -> {OUT_DIR} (total {total} bytes, avg {total // len(seen_slugs)})")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""v2.3.0（SW v116）样张专项冒烟：《步天歌》点句浮图（作用域：角宿 13 句）。

断言：
①版本口径：SW wuri-v116／CSS ?v=116／显示版本仍 v2.3.0（用户明示不变），
  关于页版本行带内部号——me_ver 简体「（内部 v116）」繁体「（內部 v116）」＋index 静态兜底。
②数据层：xingguan.json 主星标记恰两颗（角宿一＝角宿距星、进贤＝独星成官），
  star-module 真源与 www 副本逐字一致；butiange 角宿 13 句映射与浮图高亮期望一致。
③运行时真点击（390×844 日间）：角宿 13 句逐句点击行身开浮层——浮层出现、
  高亮组集合与本句星官逐句对账、中性组补集正确、主星金环恰 2（角宿一＋进贤常驻）、
  elementFromPoint 浮层中心落在浮层内（最上层）、关闭（✕）后浮层消失且
  view-butiange 滚动位置逐像素回到点击前；柱句图注含「柱尚有 4 星待考」；
  行内星官签点击同样开浮图（不跳详情）；点浮层外关闭；浮层「看详情」进详情且浮层已收。
④非样张段不回归：亢宿句无 data-sx-pop，星官签点击仍进详情。
⑤412×915 复跑四句（首/中/柱/末）；夜间（emulated dark）高亮朱砂与金环 computed 值在位；
  红光模式下浮层可开、高亮与中性组 computed 笔色不同且高亮更粗（滤镜下仍可辨）。
⑥全程零 JS 异常。截图：日间（柱句）/夜间（角句）存 verse-pop-shots/。
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/verse-pop-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- ① 版本口径 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v116 缓存名", "wuri-v116-20261025-v230" in sw and "style.css?v=116" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("CSS ?v=116＋index 静态版本行带内部号", "css/style.css?v=116" in html and "戊日不上香 v2.3.0（内部 v116）" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简（内部 v116）＋繁（內部 v116）",
       "me_ver: '戊日不上香 v2.3.0（内部 v116）'" in i18n and "me_ver: '戊日不上香 v2.3.0（內部 v116）'" in i18n)
report("显示版本仍 v2.3.0（无 2.3.1/2.4.0 漂移）", "v2.3.1" not in i18n and "v2.4.0" not in html)

# ---------- ② 数据层 ----------
xg = json.load(open(os.path.join(WWW, "data/xingguan.json"), encoding="utf-8"))
prin = sorted((a["section"], s["cn_name"]) for a in xg["asterisms"] for s in a["stars"] if s.get("principal"))
report("主星标记恰两颗：角宿一＋进贤（均在角宿）", prin == [("角宿", "角宿一"), ("角宿", "进贤")], prin)
src = os.path.expanduser("~/workspace/wuri-app/star-module/xingguan.json")
report("star-module 真源与 www 副本逐字一致",
       open(src, encoding="utf-8").read() == open(os.path.join(WWW, "data/xingguan.json"), encoding="utf-8").read())
bt = json.load(open(os.path.join(WWW, "data/butiange.json"), encoding="utf-8"))
jiao = [s for s in bt["sections"] if s["section"] == "角宿"][0]
EXPECT = [["角宿|" + n for n in l["asterism"].split("、")] for l in jiao["lines"]]
report("角宿 13 句齐备且逐句有星官映射", len(EXPECT) == 13 and all(EXPECT), len(EXPECT))

# ---------- ③ 运行时 ----------
chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--remote-debugging-port=%d" % PORT, "about:blank"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ws_url = None
    for _ in range(40):
        try:
            targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3))
            pages = [t for t in targets if t.get("type") == "page"]
            if pages: ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    assert ws_url, "chrome CDP 未就绪"
    cdp = base.CDP(base.ws_connect(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source":
        "window.__errs=[]; addEventListener('error', e=>window.__errs.push(String(e.message||e.error)));"
        " addEventListener('unhandledrejection', e=>window.__errs.push('rej:'+String(e.reason)));"})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def mouse(x, y):
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    def click_sel(sel):
        box = ev("""(() => { const e = document.querySelector(%s);
          if (!e) return null; e.scrollIntoView({block:'center'});
          const r = e.getBoundingClientRect();
          return {x: r.left + r.width/2, y: r.top + r.height/2}; })()""" % json.dumps(sel))
        if not box: return False
        mouse(box["x"], box["y"])
        return True

    def click_xy(x, y):
        mouse(x, y)

    def pop_probe():
        return ev("""(() => { const pop = document.getElementById('sx-pop');
          const hl = [], dim = [];
          pop.querySelectorAll('g.sx-rmap-g').forEach(g => {
            (g.classList.contains('sx-hl') ? hl : dim).push(g.getAttribute('data-sx-gkey')); });
          const card = pop.querySelector('.sx-pop-card');
          const r = card.getBoundingClientRect();
          const svgEl = pop.querySelector('svg.sx-popmap');
          const svgCs = svgEl ? getComputedStyle(svgEl) : null;
          const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
          return { hidden: pop.hidden, hl: hl.sort(), dimN: dim.length,
            cardRatio: r.height / window.innerHeight,
            svgBw: svgCs ? svgCs.borderTopWidth : '?', svgBg: svgCs ? svgCs.backgroundColor : '?',
            rings: pop.querySelectorAll('.sx-principal-ring').length,
            prinStars: pop.querySelectorAll('.sx-star.sx-principal').length,
            verse: (pop.querySelector('#sx-pop-verse')||{}).textContent || '',
            note: (pop.querySelector('#sx-pop-note')||{}).textContent || '',
            links: Array.from(pop.querySelectorAll('[data-sx-pop-detail]')).map(x => x.getAttribute('data-sx-pop-detail')),
            topInPop: !!(top && top.closest && top.closest('#sx-pop')),
            detailHidden: document.getElementById('view-star-detail').hidden,
            scroll: document.getElementById('view-butiange').scrollTop }; })()""")

    def set_viewport(w, h):
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 2, "mobile": True})

    set_viewport(390, 844)
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 0.5)
    for _ in range(40):
        if ev("!!document.querySelector('#sx-home .sx-yuan-name')"): break
        time.sleep(0.5)
    ev("window.Stars.openButiange(%s); true" % json.dumps("角宿"), 1.2)
    nrows = ev("document.querySelectorAll('[data-sx-pop]').length")
    report("角宿 13 句行均可点（data-sx-pop×13）", nrows == 13, nrows)

    all_ok, hl_ok, close_ok = True, True, True
    for i in range(13):
        sel = '[data-sx-pop="角宿:%d"]' % i
        ev("document.querySelector(%s).scrollIntoView({block:'center'}); true" % json.dumps(sel), 0.25)
        pre = ev("document.getElementById('view-butiange').scrollTop")
        if not click_sel(sel):
            all_ok = False; report("第 %d 句可点击" % (i + 1), False, sel); continue
        time.sleep(0.4)
        p = pop_probe()
        if p["hidden"] or not p["topInPop"] or not p["detailHidden"]:
            all_ok = False
            report("第 %d 句浮层出现＋最上层＋不跳页" % (i + 1), False, p)
        if p["hl"] != sorted(EXPECT[i]) or p["dimN"] != 11 - len(EXPECT[i]) or sorted(p["links"]) != sorted(EXPECT[i]):
            hl_ok = False
            report("第 %d 句高亮对象" % (i + 1), False, {"hl": p["hl"], "want": sorted(EXPECT[i]), "dimN": p["dimN"], "links": p["links"]})
        if p["rings"] != 2 or p["prinStars"] != 2:
            hl_ok = False
            report("第 %d 句主星金环常驻×2" % (i + 1), False, {"rings": p["rings"], "prin": p["prinStars"]})
        if i == 9:
            report("柱句图注如实标注待考（柱尚有 4 星待考）", "柱尚有 4 星待考" in p["note"], p["note"])
            shot("pop-day-zhu")
        if i == 0:
            report("角句图注无待考字样＋图例在位", "待考" not in p["note"] and "金环＝本官主星" in p["note"], p["note"])
            report("浮层精简：卡片高≤72%视口＋图区无内框（边框 0/底色透明）",
                   p["cardRatio"] <= 0.72 and p["svgBw"] == "0px" and p["svgBg"] in ("transparent", "rgba(0, 0, 0, 0)"),
                   {"cardRatio": round(p["cardRatio"], 3), "svgBw": p["svgBw"], "svgBg": p["svgBg"]})
        click_sel("#sx-pop-x")
        time.sleep(0.3)
        post = pop_probe()
        if not post["hidden"] or abs(post["scroll"] - pre) > 1:
            close_ok = False
            report("第 %d 句关闭回位" % (i + 1), False, {"hidden": post["hidden"], "pre": pre, "post": post["scroll"]})
    report("13 句逐句浮层出现/最上层/不跳页", all_ok)
    report("13 句逐句高亮对象与映射对账（含主星金环常驻）", hl_ok)
    report("13 句逐句 ✕ 关闭且滚动回位", close_ok)

    # 点浮层外空白关闭（先验证该点最上层确为浮层背板）
    click_sel('[data-sx-pop="角宿:2"]'); time.sleep(0.4)
    topc = ev("(() => { const t = document.elementFromPoint(10, 10); return t ? t.id : ''; })()")
    click_xy(10, 10); time.sleep(0.3)
    report("点浮层外空白关闭（背板点最上层为浮层本体）", topc == "sx-pop" and pop_probe()["hidden"], topc)

    # 行内星官签点击也开浮图（不跳详情）
    click_sel('[data-sx-pop="角宿:0"] .sx-verse-tag'); time.sleep(0.4)
    p = pop_probe()
    report("行内星官签点击开浮图而非跳详情", (not p["hidden"]) and p["detailHidden"] and p["hl"] == ["角宿|角"], p)
    click_sel("#sx-pop-x"); time.sleep(0.3)

    # 浮层内「看详情」进详情且浮层先收
    click_sel('[data-sx-pop="角宿:0"]'); time.sleep(0.4)
    click_sel('.sx-pop-link[data-sx-pop-detail="角宿|角"]'); time.sleep(0.7)
    d = ev("""(() => ({ popHidden: document.getElementById('sx-pop').hidden,
      detailHidden: document.getElementById('view-star-detail').hidden,
      hasSpica: (document.getElementById('sx-detail').textContent || '').includes('角宿一') }))()""")
    report("浮层「看详情」进角详情且浮层已收", d and d["popHidden"] and not d["detailHidden"] and d["hasSpica"], d)
    ev("document.getElementById('star-detail-back').click(); true", 0.5)

    # ---------- ④ 非样张段不回归 ----------
    click_sel('[data-sx-toc="亢宿"]'); time.sleep(0.8)
    kang = ev("""(() => { const sec = document.getElementById('sx-sec-亢宿');
      return { pops: sec.querySelectorAll('[data-sx-pop]').length,
               tags: sec.querySelectorAll('.sx-verse-tag[data-sx-detail]').length }; })()""")
    report("亢宿段无浮图行、星官签保留", kang and kang["pops"] == 0 and kang["tags"] > 0, kang)
    click_sel('#sx-sec-亢宿 .sx-verse-tag[data-sx-detail]'); time.sleep(0.7)
    d2 = ev("document.getElementById('view-star-detail').hidden")
    report("亢宿签点击仍直进详情（原行为不变）", d2 is False, d2)
    ev("document.getElementById('star-detail-back').click(); true", 0.5)

    # 运行时版本行（简体）
    ver = ev("document.querySelector('[data-i18n=\"me_ver\"]').textContent")
    report("运行时关于版本行带内部号（简体）", ver and "v2.3.0（内部 v116）" in ver, ver)

    # ---------- ⑤ 412 视口＋夜间＋红光 ----------
    set_viewport(412, 915)
    ev("window.Stars.openButiange(%s); true" % json.dumps("角宿"), 1.0)
    ok412 = True
    for i in (0, 5, 9, 12):
        click_sel('[data-sx-pop="角宿:%d"]' % i); time.sleep(0.4)
        p = pop_probe()
        if p["hidden"] or p["hl"] != sorted(EXPECT[i]) or not p["topInPop"]: ok412 = False
        click_sel("#sx-pop-x"); time.sleep(0.25)
    report("412×915 复跑四句：浮层/高亮/最上层", ok412)

    cdp.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-color-scheme", "value": "dark"}]})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    theme = ev("document.documentElement.getAttribute('data-theme')")
    ev("window.Stars.openButiange(%s); true" % json.dumps("角宿"), 1.2)
    click_sel('[data-sx-pop="角宿:0"]'); time.sleep(0.4)
    night = ev("""(() => { const pop = document.getElementById('sx-pop');
      const hlStar = pop.querySelector('.sx-hl .sx-star:not(.sx-principal)');
      const dimStar = pop.querySelector('.sx-dim .sx-star:not(.sx-principal)');
      const ring = pop.querySelector('.sx-principal-ring');
      const cs = e => e ? getComputedStyle(e) : {};
      return { hidden: pop.hidden, hlFill: cs(hlStar).fill, dimFill: cs(dimStar).fill,
               dimOpacity: cs(dimStar).opacity, ringStroke: cs(ring).stroke }; })()""")
    report("夜间主题生效（data-theme=night）", theme == "night", theme)
    report("夜间高亮朱砂 #C8452F＋金环 #C9A86A＋中性组压暗",
           night and not night["hidden"] and night["hlFill"] == "rgb(200, 69, 47)"
           and night["ringStroke"] == "rgb(201, 168, 106)" and night["dimFill"] == "rgb(200, 191, 164)"
           and float(night["dimOpacity"]) < 1, night)
    shot("pop-night-jiao")

    # 红光：作用域含 view-butiange，浮层继承变量重映射＋SVG 滤镜；高亮以色相/线宽/不透明度与中性拉开
    ev("window.WuriRedlight.set(true); true", 0.4)
    red = ev("""(() => { const pop = document.getElementById('sx-pop');
      const hlLine = pop.querySelector('.sx-hl .sx-plot-line');
      const dimLine = pop.querySelector('.sx-dim .sx-plot-line');
      const cs = e => e ? getComputedStyle(e) : {};
      return { bodyRed: document.body.classList.contains('sky-red'), hidden: pop.hidden,
               hlStroke: cs(hlLine).stroke, hlW: cs(hlLine).strokeWidth,
               dimStroke: cs(dimLine).stroke, dimW: cs(dimLine).strokeWidth, dimO: cs(dimLine).opacity }; })()""")
    report("红光下浮层可开、高亮与中性仍可辨（笔色异＋线更粗＋不透明）",
           red and red["bodyRed"] and not red["hidden"] and red["hlStroke"] != red["dimStroke"]
           and float(red["hlW"].replace("px", "")) > float(red["dimW"].replace("px", ""))
           and float(red["dimO"]) < 1, red)
    ev("window.WuriRedlight.set(false); true", 0.3)
    click_sel("#sx-pop-x"); time.sleep(0.3)

    # 繁体：版本行內部＋浮层图例繁体
    ev("localStorage.setItem('wuri_lang_v1','zh-TW'); location.reload(); true")
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    vertw = ev("document.querySelector('[data-i18n=\"me_ver\"]').textContent")
    ev("window.Stars.openButiange(%s); true" % json.dumps("角宿"), 1.2)
    click_sel('[data-sx-pop="角宿:0"]'); time.sleep(0.4)
    notetw = pop_probe()["note"]
    report("繁体版本行（內部 v116）＋浮层图例繁体", vertw and "v2.3.0（內部 v116）" in vertw and "金環＝本官主星" in notetw,
           {"ver": vertw, "note": notetw})
    click_sel("#sx-pop-x"); time.sleep(0.2)

    errs = ev("window.__errs")
    exc = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    report("全程零 JS 异常", not errs and len(exc) == 0, {"hook": errs, "exc": len(exc)})
finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== SMOKE v2313 verse-pop: %d/%d PASS ====" % (len(results) - len(bad), len(results)))
sys.exit(1 if bad else 0)

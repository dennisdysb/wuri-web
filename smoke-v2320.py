#!/usr/bin/env python3
"""v2.3.0（SW v120）角宿图式层生产样张专项冒烟。

本批：①新增图式层 data/xingguan-schema.json（角宿一区，几何据《漫步中国星空》
p.030 文图，2026-10-25 用户裁定以书图为准）；②regionMapHTML 加 schema 模式——
区页总览图（角宿区）与步天歌浮图（角宿段）同吃图式层，其余 30 区回落投影；
③浮窗紧凑化：卡宽 432→250 CSS px（现行约 65%），内容按图式包围盒适配。

断言：
①版本四件套：SW wuri-v120／CSS ?v=120／me_ver 简繁带（内部 v120）／显示仍 v2.3.0。
②数据层：schema www 副本与 star-module 真源逐字一致；角宿 45 点、逐官点数＝传统
  星数、命名 ref 全部能在 xingguan.json 对上；实心官恰周鼎/天田/平道/天门、余皆空心；
  柱 15 点（未定 5＋not_plotted 柱十）；主星标记仍恰一颗（角宿一）。
③区页真点击（390 日间）：角宿区总览 svg 带 sx-schema、星点 45（实心 9/空心 36/
  未定 5）、图式连边 31（柱存疑虚线 10）、官名牌 11、图注为图式口径；elementFromPoint
  命中库楼组命中圈、真点击进库楼详情、返回滚动恢复。
④回落：房宿区 svg 无 sx-schema、投影星点 >0、图注为旧口径。
⑤浮图逐句（390）：角宿 13 句逐句开浮层——svg 带 sx-schema、星点 45、金环恰 1、
  主星盘径 = 图式统一径 2.6、高亮组与映射逐句对账、卡宽 ≈250（65% 口径）、
  浮层中心 elementFromPoint 在浮层内、✕ 关闭滚动逐像素回位；角句图注含图式出处、
  柱句图注含「柱尚有 4 星待考」＋图式出处。
⑥412 复跑两句；夜间高亮朱砂＋金环在位；红光下高亮/中性可辨；繁体图注；
⑦全程零 JS 异常。截图存 schema120-shots/。
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/schema120-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- ① 版本口径 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v120 缓存名＋CSS ?v=120 在 SW 预缓存", "wuri-v120-20261025-v230" in sw and "style.css?v=120" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("CSS ?v=120＋index 静态版本行带内部号 v120", "css/style.css?v=120" in html and "戊日不上香 v2.3.0（内部 v120）" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简（内部 v120）＋繁（內部 v120）",
       "me_ver: '戊日不上香 v2.3.0（内部 v120）'" in i18n and "me_ver: '戊日不上香 v2.3.0（內部 v120）'" in i18n)
report("显示版本仍 v2.3.0（无漂移）", "v2.3.1" not in i18n and "v2.4.0" not in html)
report("i18n 图式注记键简繁在位", "sx_map_note_schema" in i18n and "sx_pop_schema_note" in i18n)

# ---------- ② 数据层 ----------
sch_path = os.path.join(WWW, "data/xingguan-schema.json")
sch = json.load(open(sch_path, encoding="utf-8"))
src = os.path.expanduser("~/workspace/wuri-app/star-module/xingguan-schema.json")
report("schema 真源与 www 副本逐字一致",
       open(src, encoding="utf-8").read() == open(sch_path, encoding="utf-8").read())
xg = json.load(open(os.path.join(WWW, "data/xingguan.json"), encoding="utf-8"))
xgmap = {a["name"]: a for a in xg["asterisms"] if a["section"] == "角宿"}
sec = sch["sections"]["角宿"]
tot, data_ok, bad = 0, True, ""
FILLED = {"周鼎", "天田", "平道", "天门"}
for name, sa in sec["asterisms"].items():
    a = xgmap[name]; tot += len(sa["stars"])
    if len(sa["stars"]) != a["star_count_tradition"]: data_ok, bad = False, name + " 点数"
    known = {s["cn_name"] for s in a["stars"]}
    for sp in sa["stars"]:
        if "ref" in sp and sp["ref"] not in known: data_ok, bad = False, name + " ref " + sp["ref"]
        want = "filled" if name in FILLED else "hollow"
        if sp["dot"] != want: data_ok, bad = False, name + " dot " + sp["dot"]
    for i, j in sa["edges"]:
        if not (0 <= i < len(sa["stars"]) and 0 <= j < len(sa["stars"])): data_ok, bad = False, name + " edge"
report("角宿 45 点：逐官点数＝传统星数、ref 全对上、实心/空心从书图", tot == 45 and data_ok, bad or tot)
zhu = sec["asterisms"]["柱"]
report("柱 15 点：未定 5＋柱十不落点（not_plotted）",
       len(zhu["stars"]) == 15 and sum(1 for s in zhu["stars"] if s.get("unlocated")) == 5
       and zhu.get("not_plotted") == ["柱十"])
prin = sorted((a["section"], s["cn_name"]) for a in xg["asterisms"] for s in a["stars"] if s.get("principal"))
report("主星标记恰一颗：仅角宿一", prin == [("角宿", "角宿一")], prin)
bt = json.load(open(os.path.join(WWW, "data/butiange.json"), encoding="utf-8"))
jiao = [s for s in bt["sections"] if s["section"] == "角宿"][0]
EXPECT = [["角宿|" + n for n in l["asterism"].split("、")] for l in jiao["lines"]]
report("角宿 13 句映射齐备", len(EXPECT) == 13 and all(EXPECT))

# ---------- 运行时 ----------
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
        mouse(box["x"], box["y"]); return True

    def set_viewport(w, h):
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 2, "mobile": True})

    def nav_stars():
        ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 0.5)
        for _ in range(40):
            if ev("!!document.querySelector('#sx-home .sx-yuan-name')"): break
            time.sleep(0.5)

    def region_probe():
        return ev("""(() => { const svg = document.querySelector('#sx-region svg.sx-rmap');
          if (!svg) return null;
          const q = s => svg.querySelectorAll(s).length;
          const note = svg.querySelector('text.sx-plot-s');
          return { schema: svg.classList.contains('sx-schema'), n: q('.sx-star'),
            dot: q('.sx-star.sx-sch-dot'), ring: q('.sx-star.sx-sch-ring'), unloc: q('.sx-star.sx-sch-unloc'),
            lines: q('line.sx-plot-line') + q('line.sx-plot-dash'), dash: q('line.sx-plot-dash'),
            labels: q('text.sx-plot-t'), hits: q('circle.sx-rmap-hit'),
            note: note ? note.textContent : '' }; })()""")

    def pop_probe():
        return ev("""(() => { const pop = document.getElementById('sx-pop');
          const hl = [], dim = [];
          pop.querySelectorAll('g.sx-rmap-g').forEach(g => {
            (g.classList.contains('sx-hl') ? hl : dim).push(g.getAttribute('data-sx-gkey')); });
          const card = pop.querySelector('.sx-pop-card');
          const r = card.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
          const svgEl = pop.querySelector('svg.sx-popmap');
          return { hidden: pop.hidden, hl: hl.sort(), dimN: dim.length,
            cardW: Math.round(r.width), cardRatio: r.height / window.innerHeight,
            schema: svgEl ? svgEl.classList.contains('sx-schema') : false,
            stars: pop.querySelectorAll('.sx-star').length,
            rings: pop.querySelectorAll('.sx-principal-ring').length,
            prinR: parseFloat((pop.querySelector('.sx-star.sx-principal') || { getAttribute: () => 'NaN' }).getAttribute('r')),
            note: (pop.querySelector('#sx-pop-note')||{}).textContent || '',
            topInPop: !!(top && top.closest && top.closest('#sx-pop')),
            detailHidden: document.getElementById('view-star-detail').hidden,
            scroll: document.getElementById('view-butiange').scrollTop }; })()""")

    set_viewport(390, 844)
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    nav_stars()

    # ---------- ③ 区页：角宿图式 ----------
    ev("window.Stars.openRegion(%s); true" % json.dumps("角宿"), 1.0)
    rp = region_probe()
    report("角宿区总览图走图式层（sx-schema）", rp and rp["schema"], rp)
    report("区图星点 45：实心 9／空心 36／未定 5",
           rp and rp["n"] == 45 and rp["dot"] == 9 and rp["ring"] == 36 and rp["unloc"] == 5, rp)
    report("区图图式连边 31（柱存疑虚线 10）＋官名牌 11",
           rp and rp["lines"] == 31 and rp["dash"] == 10 and rp["labels"] == 11, rp)
    report("区图图注为图式口径", rp and "据《漫步中国星空》文图临摹" in rp["note"], rp and rp["note"])
    shot("region-jiao-schema-390")

    # elementFromPoint：库楼命中圈中心必须落在库楼组内
    pt = ev("""(() => { const g = document.querySelector('#sx-region g.sx-rmap-g[data-sx-detail="角宿|库楼"]');
      const hit = g.querySelector('circle.sx-rmap-hit'); if (!hit) return null;
      const svg = document.querySelector('#sx-region svg.sx-rmap');
      svg.scrollIntoView({block:'center'});
      const r = hit.getBoundingClientRect();
      const x = r.left + r.width/2, y = r.top + r.height/2;
      const top = document.elementFromPoint(x, y);
      const og = top && top.closest ? top.closest('g.sx-rmap-g') : null;
      return { x: x, y: y, inGroup: !!og && og.getAttribute('data-sx-detail') === '角宿|库楼',
               scroll: document.getElementById('view-star-region').scrollTop }; })()""")
    report("库楼命中圈中心 elementFromPoint 落在本组（最上层）", pt and pt["inGroup"], pt)
    mouse(pt["x"], pt["y"]); time.sleep(0.8)
    d = ev("""(() => ({ detailHidden: document.getElementById('view-star-detail').hidden,
      txt: (document.getElementById('sx-detail').textContent || '').includes('库楼') }))()""")
    report("真点击库楼星点进库楼详情", d and not d["detailHidden"] and d["txt"], d)
    ev("document.getElementById('star-detail-back').click(); true", 0.6)
    back = ev("""(() => ({ region: !document.getElementById('view-star-region').hidden,
      scroll: document.getElementById('view-star-region').scrollTop }))()""")
    report("返回区页且滚动恢复", back and back["region"] and abs(back["scroll"] - pt["scroll"]) <= 2, (back, pt))

    # ---------- ④ 回落：房宿仍投影 ----------
    ev("window.Stars.openRegion(%s); true" % json.dumps("房宿"), 1.0)
    fp = region_probe()
    report("房宿区回落投影（无 sx-schema、星点>0、旧图注）",
           fp and not fp["schema"] and fp["n"] > 0 and "赤经向左递增" in fp["note"], fp)

    # ---------- ⑤ 浮图逐句 ----------
    ev("window.Stars.openButiange(%s); true" % json.dumps("角宿"), 1.2)
    nrows = ev("document.querySelectorAll('[data-sx-pop]').length")
    report("角宿 13 句行均可点", nrows == 13, nrows)
    all_ok, hl_ok, close_ok = True, True, True
    for i in range(13):
        sel = '[data-sx-pop="角宿:%d"]' % i
        ev("document.querySelector(%s).scrollIntoView({block:'center'}); true" % json.dumps(sel), 0.25)
        pre = ev("document.getElementById('view-butiange').scrollTop")
        if not click_sel(sel):
            all_ok = False; report("第 %d 句可点击" % (i + 1), False, sel); continue
        time.sleep(0.4)
        p = pop_probe()
        if p["hidden"] or not p["topInPop"] or not p["detailHidden"] or not p["schema"] or p["stars"] != 45:
            all_ok = False
            report("第 %d 句浮层/图式/45 点/最上层" % (i + 1), False, p)
        if p["hl"] != sorted(EXPECT[i]) or p["rings"] != 1:
            hl_ok = False
            report("第 %d 句高亮/金环" % (i + 1), False, {"hl": p["hl"], "want": sorted(EXPECT[i]), "rings": p["rings"]})
        if i == 0:
            report("角句图注：图例＋图式出处，无待考字样",
                   "金环＝本官主星" in p["note"] and "图式据《漫步中国星空》文图" in p["note"] and "待考" not in p["note"], p["note"])
            report("主星盘径＝图式统一径 2.6", abs((p["prinR"] or 99) - 2.6) < 0.15, p["prinR"])
            report("浮窗紧凑：卡宽 ≈250（65% 口径）＋卡高 ≤72% 视口",
                   240 <= p["cardW"] <= 258 and p["cardRatio"] <= 0.72, {"cardW": p["cardW"], "ratio": round(p["cardRatio"], 3)})
        if i == 9:
            report("柱句图注：柱尚有 4 星待考＋图式出处",
                   "柱尚有 4 星待考" in p["note"] and "图式据《漫步中国星空》文图" in p["note"], p["note"])
            shot("pop-schema-day-zhu")
        click_sel("#sx-pop-x"); time.sleep(0.3)
        post = pop_probe()
        if not post["hidden"] or abs(post["scroll"] - pre) > 1:
            close_ok = False
            report("第 %d 句关闭回位" % (i + 1), False, {"hidden": post["hidden"], "pre": pre, "post": post["scroll"]})
    report("13 句逐句浮层出现/图式呈现/最上层/不跳页", all_ok)
    report("13 句逐句高亮对账＋金环常驻×1", hl_ok)
    report("13 句逐句 ✕ 关闭且滚动回位", close_ok)

    # ---------- ⑥ 412＋夜间＋红光＋繁体 ----------
    set_viewport(412, 915)
    ev("window.Stars.openButiange(%s); true" % json.dumps("角宿"), 1.0)
    ok412 = True
    for i in (0, 9):
        click_sel('[data-sx-pop="角宿:%d"]' % i); time.sleep(0.4)
        p = pop_probe()
        if p["hidden"] or not p["schema"] or p["cardW"] > 258 or p["hl"] != sorted(EXPECT[i]): ok412 = False
        click_sel("#sx-pop-x"); time.sleep(0.25)
    report("412×915 复跑两句：图式＋卡宽仍 ≈250", ok412)

    cdp.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-color-scheme", "value": "dark"}]})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    theme = ev("document.documentElement.getAttribute('data-theme')")
    nav_stars()
    ev("window.Stars.openButiange(%s); true" % json.dumps("角宿"), 1.2)
    click_sel('[data-sx-pop="角宿:0"]'); time.sleep(0.4)
    night = ev("""(() => { const pop = document.getElementById('sx-pop');
      const hlStar = pop.querySelector('.sx-hl .sx-star');
      const ring = pop.querySelector('.sx-principal-ring');
      const cs = e => e ? getComputedStyle(e) : {};
      return { hidden: pop.hidden, hlFill: cs(hlStar).fill, ringStroke: cs(ring).stroke }; })()""")
    report("夜间：主题生效＋图式高亮朱砂＋金环在位",
           theme == "night" and night and not night["hidden"]
           and night["hlFill"] == "rgb(200, 69, 47)" and night["ringStroke"] == "rgb(201, 168, 106)",
           {"theme": theme, "night": night})
    shot("pop-schema-night-jiao")
    ev("window.WuriRedlight.set(true); true", 0.4)
    red = ev("""(() => { const pop = document.getElementById('sx-pop');
      const hlLine = pop.querySelector('.sx-hl .sx-plot-line');
      const dimLine = pop.querySelector('.sx-dim .sx-plot-line');
      const cs = e => e ? getComputedStyle(e) : {};
      return { bodyRed: document.body.classList.contains('sky-red'), hidden: pop.hidden,
               hlStroke: cs(hlLine).stroke, hlW: cs(hlLine).strokeWidth,
               dimStroke: cs(dimLine).stroke, dimW: cs(dimLine).strokeWidth, dimO: cs(dimLine).opacity }; })()""")
    report("红光下图式浮层可开、高亮与中性可辨（笔色异＋线更粗＋中性压暗）",
           red and red["bodyRed"] and not red["hidden"] and red["hlStroke"] != red["dimStroke"]
           and float(red["hlW"].replace("px", "")) > float(red["dimW"].replace("px", ""))
           and float(red["dimO"]) < 1, red)
    ev("window.WuriRedlight.set(false); true", 0.3)
    click_sel("#sx-pop-x"); time.sleep(0.3)

    ev("localStorage.setItem('wuri_lang_v1','zh-TW'); location.reload(); true")
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    vertw = ev("document.querySelector('[data-i18n=\"me_ver\"]').textContent")
    nav_stars()
    ev("window.Stars.openButiange(%s); true" % json.dumps("角宿"), 1.2)
    click_sel('[data-sx-pop="角宿:0"]'); time.sleep(0.4)
    notetw = pop_probe()["note"]
    report("繁体版本行（內部 v120）＋浮层图式出处繁体",
           vertw and "v2.3.0（內部 v120）" in vertw and "圖式據《漫步中國星空》文圖" in notetw,
           {"ver": vertw, "note": notetw})
    click_sel("#sx-pop-x"); time.sleep(0.2)

    errs = ev("window.__errs")
    exc = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    report("全程零 JS 异常", not errs and len(exc) == 0, {"hook": errs, "exc": len(exc)})
finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
final = "\n==== SMOKE v2320 schema-jiao: %d/%d PASS ====" % (len(results) - len(bad), len(results))
print(final)
open(os.path.join(SHOTS, "smoke-v2320-results.txt"), "w", encoding="utf-8").write(
    "\n".join(("PASS " if ok else "FAIL ") + n for n, ok in results) + "\n" + final + "\n")
sys.exit(1 if bad else 0)

#!/usr/bin/env python3
"""v2.1.0 (1) 二期一步专项冒烟（本地 file:// + CDP）：
投影引擎（Astronomy Engine 垫片加载/锚点数值）、星象页双入口、今夜可见
（非空＋北极在列＋最佳时刻/高度格式＋点行进详情＋返回来处）、平面星图
（连线层/星点层/方位标/标签计数、拖动自旋、拨时重绘、真点选进详情＋返回）、
双宽度双主题零溢出、无 JS 异常。
引擎锚点期望值出自 sky210-engine-test.js（独立 Meeus 公式链对照，Δ≤0.002°）。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/sky210-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
assets = sw.split("const ASSETS = [")[1].split("];")[0]
report("SW v97 缓存名", "wuri-v97-20261023-v210-1" in sw)
report("SW 预缓存含 vendor 与引擎/星图", all(x in assets for x in
       ["js/vendor/astronomy.js", "js/vendor/d3-array.min.js", "js/vendor/d3-geo.min.js", "js/sky-engine.js", "js/sky-chart.js"]))
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("CSS ?v=97 与版本 v2.1.0 (1)", "css/style.css?v=97" in html and "v2.1.0 (1)" in html)
report("两新视图在位", 'id="view-sky-tonight"' in html and 'id="view-sky-chart"' in html)
astr = open(os.path.join(WWW, "js/vendor/astronomy.js"), encoding="utf-8").read()
report("astronomy.js 原样（MIT 头＋体积）", "MIT License" in astr[:2000] and len(astr) > 400000, len(astr))
report("vendor 许可证齐备", all(os.path.exists(os.path.join(WWW, "js/vendor", f)) for f in
       ["LICENSE-astronomy.txt", "LICENSE-d3-array.txt", "LICENSE-d3-geo.txt"]))
report("关于鸣谢两条", "Astronomy Engine" in html and "d3-geo" in html)

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
            if pages:
                ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception:
            pass
        time.sleep(0.5)
    assert ws_url, "chrome CDP 未就绪"
    cdp = base.CDP(base.ws_connect(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def waitfor(js, timeout=20.0, step=0.4):
        end = time.time() + timeout
        while time.time() < end:
            if ev(js): return True
            time.sleep(step)
        return False

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        import base64
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def mouse(x, y, kind, btn="left", click_count=1):
        cdp.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": btn, "clickCount": click_count})

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)

    # ---------- 引擎 ----------
    r = ev("""(() => ({ av: !!(window.WuriSky && window.WuriSky.available),
                        ast: typeof window.Astronomy, d3: !!(window.d3 && window.d3.geoStereographic) }))()""")
    report("引擎与 d3 已加载", r["av"] and r["ast"] == "object" and r["d3"], r)
    r = ev("""(() => { const o = {lat: 45.5122, lon: -73.4253}, d = new Date('2026-10-24T02:00:00Z');
      const a = WuriSky.altAz(d, o, 165.93208, 61.75083, 0);
      const b = WuriSky.altAz(d, o, 206.88497, 49.31328, 0);
      const c = WuriSky.altAz(d, o, 165.93208, 61.75083);
      return {a, b, refr: c.alt - a.alt}; })()""")
    report("锚点 天樞 alt/az（±0.02°）", abs(r["a"]["alt"] - 17.1404) < 0.02 and abs(r["a"]["az"] - 1.3547) < 0.02, r["a"])
    report("锚点 搖光 alt/az（±0.02°）", abs(r["b"]["alt"] - 10.3286) < 0.02 and abs(r["b"]["az"] - 335.8051) < 0.02, r["b"])
    report("折射口径生效（normal 比 0 高 0.02–0.09°）", 0.02 < r["refr"] < 0.09, r["refr"])

    TOPMOST = """(() => { const el = document.elementFromPoint(Math.floor(innerWidth/2), Math.floor(innerHeight/2));
      if (!el) return 'none';
      const inV = id => { const v = document.getElementById(id); return v && !v.hidden && v.contains(el); };
      if (inV('view-sky-tonight')) return 'tonight';
      if (inV('view-sky-chart')) return 'chart';
      if (inV('view-star-detail')) return 'detail';
      const ts = document.getElementById('tab-stars'); if (ts && ts.contains(el)) return 'stars-home';
      return 'other:' + el.tagName; })()"""

    # ---------- 星象页入口 ----------
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 1.2)
    ok = waitfor("!!document.getElementById('sx2-entries') && document.querySelectorAll('#sx2-entries .sx-entry').length === 2")
    report("星象页双入口已注入（今夜可见/平面星图）", ok)

    # ---------- 今夜可见 ----------
    ev("document.querySelector('[data-sx2=\"tonight\"]').click(); true", 0.3)
    ok = waitfor("document.querySelectorAll('#sx-tonight .sx-row').length >= 5", timeout=30)
    rows = ev("document.querySelectorAll('#sx-tonight .sx-row').length")
    report("今夜可见列表非空（≥5）", ok and rows >= 5, rows)
    head = ev("document.querySelector('#sx-tonight .sk-night-head') ? document.querySelector('#sx-tonight .sk-night-head').textContent : ''")
    report("今夜表头含天文暮光终了与时刻", "天文暮光终了" in (head or "") and ":" in (head or ""), head)
    names = ev("[...document.querySelectorAll('#sx-tonight .sx-row-name')].map(e => e.textContent)")
    report("今夜含恒显官（北极或北斗）", any(n in (names or []) for n in ["北极", "北斗"]), names[:8] if names else names)
    row0 = ev("""(() => { const r = document.querySelector('#sx-tonight .sx-row'); return r ? r.textContent : ''; })()""")
    import re as _re
    report("首行含最佳时刻与高度格式", bool(_re.search(r"最佳 \d{2}:\d{2}", row0 or "")) and bool(_re.search(r"高 \d+°", row0 or "")), row0[:80])
    report("硬断言：今夜页为最上层", ev(TOPMOST) == "tonight", ev(TOPMOST))
    shot("tonight-390-day")
    # 点「北极」行进详情 → 返回来处
    ev("""(() => { const rows = [...document.querySelectorAll('#sx-tonight .sx-row')];
      const r = rows.find(x => x.querySelector('.sx-row-name').textContent === '北极') || rows[0];
      r.click(); return true; })()""", 1.0)
    det = ev("document.getElementById('sx-detail').textContent") or ""
    report("硬断言：今夜行→星官详情（可见＋最上层）",
           ev("!document.getElementById('view-star-detail').hidden") and ev(TOPMOST) == "detail", ev(TOPMOST))
    ev("(document.getElementById('star-detail-back').click(), true)", 0.5)
    report("硬断言：详情返回→回今夜页", ev("!document.getElementById('view-sky-tonight').hidden && document.getElementById('view-star-detail').hidden")
           and ev(TOPMOST) == "tonight", ev(TOPMOST))
    ev("(document.getElementById('sky-tonight-back').click(), true)", 0.4)

    # ---------- 平面星图 ----------
    ev("document.querySelector('[data-sx2=\"chart\"]').click(); true", 0.3)
    ok = waitfor("document.querySelectorAll('#sk-chart-svg path.sk-line').length >= 100", timeout=30)
    nline = ev("document.querySelectorAll('#sk-chart-svg path.sk-line').length")
    nstar = ev("document.querySelectorAll('#sk-chart-svg circle.sk-star').length")
    nlab = ev("document.querySelectorAll('#sk-chart-svg text.sk-label').length")
    cards = ev("[...document.querySelectorAll('#sk-chart-svg text.sk-cardinal')].map(e => e.textContent)")
    report("星图连线层渲染（≥100）", ok and nline >= 100, nline)
    report("星图星点层渲染（≥600）", nstar >= 600, nstar)
    report("星图方位标齐备（北/东/南/西）", all(x in (cards or []) for x in ["北", "东", "南", "西"]), cards)
    report("星图官名标签（≥10）", nlab >= 10, nlab)
    report("硬断言：星图页为最上层", ev(TOPMOST) == "chart", ev(TOPMOST))
    shot("chart-390-day")
    # 拖动自旋：transform 改变
    rect = ev("(() => { const r = document.getElementById('sk-chart-svg').getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })()")
    cxp, cyp = rect["x"] + rect["w"] / 2, rect["y"] + rect["h"] / 2
    t0 = ev("document.getElementById('sk-chart-g').getAttribute('transform')")
    mouse(cxp, cyp, "mousePressed"); mouse(cxp + 60, cyp, "mouseMoved"); mouse(cxp + 60, cyp, "mouseReleased")
    time.sleep(0.3)
    t1 = ev("document.getElementById('sk-chart-g').getAttribute('transform')")
    report("拖动自旋（transform 含 rotate 且角度变化）", t1 != t0 and "rotate(18" in (t1 or ""), (t0, t1))
    # 拨时：滑杆 +120 分钟 → 读数与图面重绘
    lab0 = ev("document.getElementById('sk-time-lab').textContent")
    ev("""(() => { const s = document.getElementById('sk-time'); s.value = '120';
      s.dispatchEvent(new Event('input', {bubbles: true})); return true; })()""", 0.8)
    lab1 = ev("document.getElementById('sk-time-lab').textContent")
    report("拨时两小时：读数变化（含 +2h）", lab1 != lab0 and "+2h" in (lab1 or ""), (lab0, lab1))
    ev("""(() => { const s = document.getElementById('sk-time'); s.value = '0';
      s.dispatchEvent(new Event('input', {bubbles: true})); return true; })()""", 0.8)
    # 真点选：北斗标签点 → 详情
    pt = ev("window.WuriSkyChart.pickPointOf('紫微垣|北斗')")
    report("北斗点位可得", bool(pt), pt)
    if pt:
        px = rect["x"] + pt["x"] / 400 * rect["w"]; py = rect["y"] + pt["y"] / 400 * rect["h"]
        mouse(px, py, "mousePressed"); mouse(px, py, "mouseReleased")
        time.sleep(1.0)
        det2 = ev("document.getElementById('sx-detail').textContent") or ""
        report("硬断言：星图点选北斗→详情（北斗＋最上层）",
               "北斗" in det2 and ev("!document.getElementById('view-star-detail').hidden") and ev(TOPMOST) == "detail",
               (ev(TOPMOST), det2[:50]))
        ev("(document.getElementById('star-detail-back').click(), true)", 0.5)
        report("硬断言：详情返回→回星图页", ev("!document.getElementById('view-sky-chart').hidden && document.getElementById('view-star-detail').hidden")
               and ev(TOPMOST) == "chart", ev(TOPMOST))
    shot("chart-390-day-2")
    ev("(document.getElementById('sky-chart-back').click(), true)", 0.4)

    # ---------- 零溢出（390 日 / 412 夜） ----------
    def overflow():
        return ev("document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1")
    ev("document.querySelector('[data-sx2=\"tonight\"]').click(); true", 1.2)
    report("390 日间：今夜页零溢出", overflow())
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    ev("document.documentElement.setAttribute('data-theme', 'night'); true", 0.4)
    report("412 夜间：今夜页零溢出", overflow())
    shot("tonight-412-night")
    ev("(document.getElementById('sky-tonight-back').click(), true)", 0.4)
    ev("document.querySelector('[data-sx2=\"chart\"]').click(); true", 1.2)
    report("412 夜间：星图页零溢出", overflow())
    shot("chart-412-night")

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    report("全程无 JS 异常", len(excs) == 0, json.dumps(excs)[:300] if excs else "")
finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(bad), len(results)))
if bad:
    print("FAILED:", bad); sys.exit(1)

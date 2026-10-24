#!/usr/bin/env python3
"""v2.1.0 专项冒烟（本地 file:// + CDP）：(1) 投影引擎（Astronomy Engine
垫片加载/锚点数值）、星象页双入口、今夜可见（非空＋北极在列＋最佳时刻/
高度格式＋点行进详情＋返回来处）、平面星图（连线层/星点层/方位标/标签计数、
拖动自旋、拨时重绘、真点选进详情＋返回）；(2) 追加：标签恒正立（自旋
180° 后标签净角度 0＋锚点跟随）、搜索定位聚焦、黄道/太阳/赤道开关、
时间播放与手动暂停、最暗星等共用口径、点选信息条、传感器跟随模式。
双宽度双主题零溢出、无 JS 异常。
引擎锚点期望值出自 sky210-engine-test.js（独立 Meeus 公式链对照，Δ≤0.002°）。
星官名标签选择器须排除线标（.sk-linelabel/.sk-sunlabel 同挂 .sk-label）。"""
LABSEL = "#sk-chart-svg text.sk-label:not(.sk-linelabel):not(.sk-sunlabel)"
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
report("SW v98 缓存名", "wuri-v98-20261024-v210-2" in sw)
report("SW 预缓存含 vendor 与引擎/星图", all(x in assets for x in
       ["js/vendor/astronomy.js", "js/vendor/d3-array.min.js", "js/vendor/d3-geo.min.js", "js/sky-engine.js", "js/sky-chart.js"]))
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("CSS ?v=98 与版本 v2.1.0 (2)", "css/style.css?v=98" in html and "v2.1.0 (2)" in html)
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
    nlab = ev("document.querySelectorAll('" + LABSEL + "').length")
    cards = ev("[...document.querySelectorAll('#sk-chart-svg text.sk-cardinal')].map(e => e.textContent)")
    report("星图连线层渲染（≥100）", ok and nline >= 100, nline)
    report("星图星点层渲染（≥600）", nstar >= 600, nstar)
    report("星图方位标齐备（北/东/南/西）", all(x in (cards or []) for x in ["北", "东", "南", "西"]), cards)
    report("星图官名标签（≥10）", nlab >= 10, nlab)
    # ---------- 标签分级（v2.1.0 (2)：字号/分级上限/锚点让位/放大补全） ----------
    fsi = ev("""(() => { const el = document.querySelector('""" + LABSEL + """');
      const svg = document.getElementById('sk-chart-svg');
      return { fs: el ? parseFloat(getComputedStyle(el).fontSize) : 0, w: svg.getBoundingClientRect().width }; })()""")
    exp_fs = 8.5 / (fsi["w"] / 400.0) if fsi["w"] else 0
    report("标签字号按显示标定（屏上 8.5px 口径）", abs(fsi["fs"] - exp_fs) < 0.7, (fsi, exp_fs))
    report("全天（0 级）标签数有上限 ≤46（分级口径：61 官中高度>2° 者）", 8 <= nlab <= 46, nlab)
    anch = ev("""(() => { const L = window.WuriSkyChart.labelInfo().filter(x => x.shown);
      let bad = 0, minD = 1e9;
      L.forEach(x => { const d = Math.hypot(x.lx - x.x, x.ly - x.y); minD = Math.min(minD, d - x.halfW); if (d < x.halfW + 4) bad++; });
      return {n: L.length, bad, minD}; })()""")
    report("标签锚点让位（距本官最亮星 ≥ 半文宽+4）", anch["bad"] == 0, anch)
    ev("window.WuriSkyChart.setZoom(2.6); true", 0.6)
    nlab2 = ev("document.querySelectorAll('" + LABSEL + "').length")
    report("放大至 2 级后标签增多", nlab2 > nlab, (nlab, nlab2))
    ev("window.WuriSkyChart.setZoom(1); true", 0.6)
    # ---------- 标签恒正立（v2.1.0 (2) 追加：图转字不转） ----------
    ev("window.WuriSkyChart.setSpin(180); true", 0.4)
    gt = ev("document.getElementById('sk-chart-g').getAttribute('transform')") or ""
    upr = ev("""(() => { const els = [...document.querySelectorAll('""" + LABSEL + """')].slice(0, 4);
      return els.map(e => { const m = /rotate\\((-?[\\d.]+)/.exec(e.getAttribute('transform') || ''); return m ? parseFloat(m[1]) : null; }); })()""")
    report("自旋 180°：组变换含 rotate(180)，抽验标签反向旋转 −180（净角度 0）",
           "rotate(180" in gt and len(upr) >= 2 and all(v is not None and abs(v + 180) < 0.6 for v in upr), (gt[:60], upr))
    mir = ev("""(() => { const L = window.WuriSkyChart.labelInfo().find(x => x.key === '紫微垣|北斗');
      const sp = window.WuriSkyChart.labelScreenPos('紫微垣|北斗');
      return L && sp ? { dx: Math.abs(sp.x - (400 - L.lx)), dy: Math.abs(sp.y - (400 - L.ly)) } : null; })()""")
    report("自旋 180°：标签锚点跟随星官至镜像位（400−lx, 400−ly）",
           bool(mir) and mir["dx"] < 1.6 and mir["dy"] < 1.6, mir)
    ev("window.WuriSkyChart.setSpin(0); true", 0.3)
    # ---------- 黄道 / 太阳 / 天赤道（默认：黄道开＋太阳点，赤道关） ----------
    ecl = ev("""(() => { const p = document.querySelector('#sk-chart-svg path.sk-ecliptic');
      const s = document.querySelector('#sk-chart-svg circle.sk-sun');
      const q = document.querySelector('#sk-chart-svg path.sk-eqline');
      return { ecl: p ? (p.getAttribute('d') || '').length : 0, sun: !!s, equ: !!q }; })()""")
    report("黄道线默认绘出＋太阳位置点在位＋赤道默认关", ecl["ecl"] > 100 and ecl["sun"] and not ecl["equ"], ecl)
    ev("document.getElementById('sk-tg-ecl').click(); true", 0.5)
    report("黄道开关：关后线消失", ev("!document.querySelector('#sk-chart-svg path.sk-ecliptic')"))
    ev("document.getElementById('sk-tg-ecl').click(); true", 0.5)
    ev("document.getElementById('sk-tg-equ').click(); true", 0.5)
    report("赤道开关：开后天赤道线绘出", ev("!!document.querySelector('#sk-chart-svg path.sk-eqline')"))
    ev("document.getElementById('sk-tg-equ').click(); true", 0.5)
    # ---------- 时间播放（300× 推进＋手动拨杆暂停） ----------
    ev("document.getElementById('sk-speed').value = '300'; document.getElementById('sk-speed').dispatchEvent(new Event('change', {bubbles: true})); true")
    ev("document.getElementById('sk-play').click(); true", 1.4)
    pst = ev("window.WuriSkyChart.state()")
    report("播放中：300× 约 1.4 秒推进 ≥2 分钟", pst["playing"] and pst["offsetMin"] >= 2, pst)
    ev("""(() => { const s = document.getElementById('sk-time'); s.dispatchEvent(new Event('input', {bubbles: true})); return true; })()""", 0.3)
    report("手动拨动时间滑杆即暂停", ev("window.WuriSkyChart.state().playing") is False)
    ev("""(() => { const s = document.getElementById('sk-time'); s.value = '0';
      s.dispatchEvent(new Event('input', {bubbles: true})); return true; })()""", 0.6)
    # ---------- 最暗星等共用口径（6→4：星点明显减少；恢复 6 后回升） ----------
    nst6 = ev("document.querySelectorAll('#sk-chart-svg circle.sk-star').length")
    ev("""(() => { const m = document.getElementById('sk-mag'); m.value = '4';
      m.dispatchEvent(new Event('input', {bubbles: true})); return true; })()""", 0.6)
    nst4 = ev("document.querySelectorAll('#sk-chart-svg circle.sk-star').length")
    report("最暗星等 4 等：星点较 6 等减少 ≥25%", nst4 < nst6 * 0.75 and ev("window.WuriSkyChart.state().magLim") == 4, (nst6, nst4))
    ev("""(() => { const m = document.getElementById('sk-mag'); m.value = '6';
      m.dispatchEvent(new Event('input', {bubbles: true})); return true; })()""", 0.6)
    nst6b = ev("document.querySelectorAll('#sk-chart-svg circle.sk-star').length")
    report("恢复 6 等：星点回升（±12%）", abs(nst6b - nst6) <= nst6 * 0.12, (nst6, nst6b))
    # ---------- 搜索定位（搜「心」→心宿聚焦居中＋高亮＋信息条） ----------
    ev("""(() => { const q = document.getElementById('sk-q'); q.value = '心';
      document.getElementById('sk-go').click(); return true; })()""", 0.7)
    fst2 = ev("window.WuriSkyChart.state()")
    fpos = ev("window.WuriSkyChart.pickPointOf('心宿|心')")
    fdist = (fpos["x"] - 200) ** 2 + (fpos["y"] - 200) ** 2 if fpos else 1e9
    info1 = ev("(() => { const b = document.getElementById('sk-info'); return b && !b.hidden ? document.getElementById('sk-info-name').textContent : ''; })()")
    report("搜索定位：心宿聚焦＋高亮圈＋居中（距心 <42）＋信息条",
           fst2["focus"] == "心宿|心" and ev("!!document.querySelector('#sk-chart-svg circle.sk-hl')")
           and fdist < 42 ** 2 and "心" in (info1 or ""), (fst2, fpos, info1))
    shot("chart-search-focus")
    ev("document.getElementById('sk-unfocus').click(); true", 0.6)
    report("回天顶：聚焦解除", ev("window.WuriSkyChart.state().focus") is None)
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
    # 真点选：北斗标签点 → 先出信息条（名＋高度/方位＋今晚最佳）→ 看详情 → 详情
    pt = ev("window.WuriSkyChart.pickPointOf('紫微垣|北斗')")
    report("北斗点位可得", bool(pt), pt)
    if pt:
        px = rect["x"] + pt["x"] / 400 * rect["w"]; py = rect["y"] + pt["y"] / 400 * rect["h"]
        mouse(px, py, "mousePressed"); mouse(px, py, "mouseReleased")
        time.sleep(0.8)
        ib = ev("""(() => { const b = document.getElementById('sk-info');
          return { vis: !!b && !b.hidden, name: document.getElementById('sk-info-name').textContent,
                   data: document.getElementById('sk-info-data').textContent }; })()""")
        report("硬断言：点北斗→信息条（名＋高度/方位＋今晚最佳）",
               ib["vis"] and "北斗" in (ib["name"] or "") and "高度" in (ib["data"] or "")
               and "方位" in (ib["data"] or "") and "今晚最佳" in (ib["data"] or ""), ib)
        # 点空白处 → 信息条收起
        far = ev("""(() => { const svg = document.getElementById('sk-chart-svg'); const r = svg.getBoundingClientRect();
          const pts = window.WuriSkyChart.labelInfo().map(x => window.WuriSkyChart.pickPointOf(x.key)).filter(Boolean);
          for (let gx = 16; gx <= 384; gx += 16) for (let gy = 16; gy <= 384; gy += 16) {
            if (pts.every(p => Math.hypot(p.x - gx, p.y - gy) > 52)) return { x: r.x + gx / 400 * r.width, y: r.y + gy / 400 * r.height };
          } return null; })()""")
        if far:
            mouse(far["x"], far["y"], "mousePressed"); mouse(far["x"], far["y"], "mouseReleased")
            time.sleep(0.5)
            report("点空白处→信息条收起", ev("document.getElementById('sk-info').hidden") is True)
            mouse(px, py, "mousePressed"); mouse(px, py, "mouseReleased")
            time.sleep(0.8)
        ev("document.getElementById('sk-info-detail').click(); true", 1.0)
        det2 = ev("document.getElementById('sx-detail').textContent") or ""
        report("硬断言：信息条「看详情」→北斗详情（＋最上层）",
               "北斗" in det2 and ev("!document.getElementById('view-star-detail').hidden") and ev(TOPMOST) == "detail",
               (ev(TOPMOST), det2[:50]))
        ev("(document.getElementById('star-detail-back').click(), true)", 0.5)
        report("硬断言：详情返回→回星图页", ev("!document.getElementById('view-sky-chart').hidden && document.getElementById('view-star-detail').hidden")
               and ev(TOPMOST) == "chart", ev(TOPMOST))
    # ---------- 传感器跟随模式（与 AR 共用姿态管线；合成姿态驱动） ----------
    ev("document.getElementById('sk-tg-sensor').click(); true", 0.3)
    ev("window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {alpha: 0, beta: 135, gamma: 0})); true", 0.4)
    sp1 = ev("window.WuriSkyChart.state().spin")
    ev("window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {alpha: 90, beta: 135, gamma: 0})); true", 0.4)
    sp2 = ev("window.WuriSkyChart.state().spin")
    report("传感器跟随：姿态 (0,135) 自旋≈0、(90,135) 自旋≈270",
           abs(sp1) < 4 and abs(sp2 - 270) < 4, (sp1, sp2))
    ev("document.getElementById('sk-tg-sensor').click(); true", 0.2)
    ev("window.WuriSkyChart.setSpin(0); true", 0.2)
    report("传感器跟随：关后 state.sensor=false", ev("window.WuriSkyChart.state().sensor") is False)
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

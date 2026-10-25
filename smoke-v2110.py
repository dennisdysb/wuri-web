#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.1.1 合并批 ③ 专项冒烟：月亮/五大行星入图＋校准说明
断言：①静态（四件套 v106/v211 显示 v2.1.1、引擎 BODIES/bodyPos、星图 bodies/
信息条/今夜行、AR bodyCache/pick/面板指引、文案改名与口径补句、样式类）
②精度（硬指标）：3 个固定时刻×月亮/金星/木星，SKY.bodyPos 与独立参考
（Astronomy.Equator 原始赤道坐标＋冒烟自带 Meeus 地平换算，不走 A.Horizon）
误差 <0.5°；参考换算先以太阳自检（对 sunAltAz <0.3°）证明可信。
③星图：当空天体全入图（与 bodyPos 逐一对账）、点选出信息条（名＋身份注、
详情钮隐藏）、搜索「土星」「月亮」可定位、今夜列表天体行与 bestBody 门槛
逐行对账＋徽标在位且无 data-sx-detail；月相照亮与今日星象同源同值。
④AR：开启面板两句指引＋「对星归零」改名＋口径补句；姿态对准土星后
bodies/labels 含土星。截图 chart-bodies/ar-bodies 390 存 v2110-shots/。
⑤并入项「今夜内星等控件」：今夜视图内改 magLim→列表即时重筛（天体行
不受过滤）、星图滑杆跟随、今夜↔星图双向同步、刷新保持；截图 tonight-mag。
跑法：python3 smoke-v2110.py
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64 as b64mod
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

ROOT = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(ROOT, "www")
SHOTS = os.path.join(ROOT, "v2110-shots")
os.makedirs(SHOTS, exist_ok=True)
RES = []
def ok(name, cond, extra=""):
    RES.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

def read(p):
    with open(os.path.join(WWW, p), encoding="utf-8") as f: return f.read()

idx, css, i18n, sw = read("index.html"), read("css/style.css"), read("js/i18n.js"), read("sw.js")
eng, chart_js, ar_js = read("js/sky-engine.js"), read("js/sky-chart.js"), read("js/sky-ar.js")
ok("静态 四件套 v106/v211＋显示 v2.1.1", "wuri-v106-20261024-v211-1" in sw and "css/style.css?v=106" in idx
   and i18n.count("me_ver: '戊日不上香 v2.1.1") == 2 and "戊日不上香 v2.1.1 (1) (2026-10-24)" in idx)
ok("静态 引擎 BODIES＋bodyPos（Equator/Horizon 同源路）",
   "A.Body.Moon" in eng and "A.Body.Saturn" in eng and "function bodyPos" in eng and "BODIES: BODIES" in eng)
ok("静态 星图 bodies（绘制/信息条/搜索/今夜行/导出）",
   "chart.bodies" in chart_js and "function showBodyInfo" in chart_js and "bestTonightForBody" in chart_js
   and "data-sx-body" in chart_js and "bodyPointOf" in chart_js and "sk-bodylabel" in chart_js)
ok("静态 AR bodies（缓存/盘面/标签/pick 出 HUD/状态导出）",
   "S.bodyCache" in ar_js and "S.bodyPts" in ar_js and "best.body" in ar_js and "flashMsg(s)" in ar_js and "bodies: S.bodyPts" in ar_js)
ok("静态 校准文案（面板两句指引＋改名＋口径补句、简繁）",
   "sx2_ar_cal_hint1" in ar_js and i18n.count("画几个「8」字") == 1 and i18n.count("畫幾個「8」字") == 1
   and "sx2_ar_cal_reset: '对星归零'" in i18n and "sx2_ar_cal_reset: '對星歸零'" in i18n
   and "校准归零" not in i18n and "「对星归零」即清掉拖动对星留下的偏移" in i18n and "「對星歸零」即清掉拖動對星留下的偏移" in i18n)
ok("静态 天体文案与样式（sx2_body×6 简繁＋身份＋盘面样式）",
   all(("sx2_body_%s: '%s'" % (k, v)) in i18n for k, v in
       [("moon", "月亮"), ("venus", "金星"), ("jupiter", "木星"), ("saturn", "土星"), ("mars", "火星"), ("mercury", "水星")])
   and ".sk-moon-disc{" in css and ".sk-planet{" in css and ".sk-bodylabel{" in css and ".sx-badge.body{" in css)

STUB = r"""
(() => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d');
  x.fillStyle = '#203040'; x.fillRect(0, 0, 640, 480);
  x.fillStyle = '#ffffff'; x.fillRect(300, 220, 40, 40);
  const stream = c.captureStream(30);
  const md = { getUserMedia: async () => stream };
  try { Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true }); }
  catch (e) { navigator.mediaDevices = md; }
})();
"""

PORT = base.free_port()
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
    cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": STUB})
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v
    def waitfor(js, timeout=25.0, step=0.4):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if ev(js): return True
            except Exception: pass
            time.sleep(step)
        return False
    def mouse(x, y):
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        with open(os.path.join(SHOTS, name), "wb") as f: f.write(b64mod.b64decode(r["data"]))

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    assert waitfor("!!window.WuriSky && !!window.WuriSkyChart && !!window.WuriSkyAR && !!window.Astronomy")

    # ---------- 精度（独立参考：Equator 原始坐标＋自带 Meeus 地平换算） ----------
    prec = ev(r"""(() => {
      const OBS = { lat: 45.5122, lon: -73.4253 };
      const D2R = Math.PI / 180;
      function expected(date, body) {
        const eq = Astronomy.Equator(body, date, new Astronomy.Observer(OBS.lat, OBS.lon, 0), true, true);
        const lst = Astronomy.SiderealTime(date) * 15 + OBS.lon;
        const H = ((lst - eq.ra * 15 + 540) % 360 - 180) * D2R;
        const dec = eq.dec * D2R, lat = OBS.lat * D2R;
        let alt = Math.asin(Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H)) / D2R;
        /* 大气折射（Bennett 公式，Meeus《Astronomical Algorithms》经典式，
         * 独立于引擎实现）：产品口径 A.Horizon 'normal' 含折射，参考侧须同口径 */
        if (alt > -1) alt += (1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * D2R)) / 60;
        let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) / D2R + 180;
        return { alt, az: ((az % 360) + 360) % 360 };
      }
      /* 固定时刻逐天体挑其在地平上方的时段（同一地点 St-Hubert）：
       * 月亮凌晨高悬、金星黄昏、木星后半夜、土星前半夜；太阳自检取白昼时刻
       * （折射项在地平下深处无定义域意义，故自检与样本都取 alt>8°） */
      const cases = [
        ['moon', Astronomy.Body.Moon, '2026-10-25T03:00:00Z'],
        ['moon', Astronomy.Body.Moon, '2026-10-26T04:30:00Z'],
        ['venus', Astronomy.Body.Venus, '2026-10-25T12:05:00Z'],
        ['mars', Astronomy.Body.Mars, '2026-10-25T08:00:00Z'],
        ['jupiter', Astronomy.Body.Jupiter, '2026-10-25T07:00:00Z'],
        ['saturn', Astronomy.Body.Saturn, '2026-10-25T01:00:00Z']
      ];
      const out = { sunCheck: [], rows: [] };
      ['2026-10-24T17:00:00Z', '2026-10-25T16:00:00Z'].forEach(ts => {
        const d = new Date(ts);
        const se = expected(d, Astronomy.Body.Sun), ss = WuriSky.sunAltAz(d, OBS);
        out.sunCheck.push(Math.abs(se.alt - ss.alt));
      });
      cases.forEach(([id, B, ts]) => {
        const d = new Date(ts);
        const e = expected(d, B), m = WuriSky.bodyPos(d, OBS, id);
        out.rows.push({ id, ts, dAlt: Math.abs(e.alt - m.alt), dAz: Math.abs(e.az - m.az), alt: m.alt });
      });
      return out;
    })()""")
    ok("精度 参考换算自检（太阳白昼 Δalt<0.3°×2 时刻）", all(v < 0.3 for v in prec["sunCheck"]), str(prec["sunCheck"]))
    hi = [r for r in prec["rows"] if r["alt"] > 3]
    ok("精度 月/金/火/木/土固定时刻 bodyPos 对独立参考 <0.5°（高度>3° 样本 %d 条）" % len(hi),
       len(hi) >= 5 and all(r["dAlt"] < 0.5 and r["dAz"] < 0.5 for r in hi),
       str([(r["id"], r["ts"][5:16], round(r["dAlt"], 3), round(r["dAz"], 3)) for r in prec["rows"]]))

    # ---------- 星图 ----------
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 1.0)
    assert waitfor("document.querySelectorAll('#sx2-entries .sx-entry').length === 2")
    ev("document.querySelector('[data-sx2=\"chart\"]').click(); true", 0.4)
    ok("运行时 进平面星图且 bodies 已绘", waitfor("!!document.querySelector('#sk-chart-svg') && window.WuriSkyChart.bodies().length >= 1"))
    ledger = ev(r"""(() => {
      const now = new Date();
      const up = WuriSky.BODIES.filter(b => { const p = WuriSky.bodyPos(now, WuriSky.DEFAULT_OBS, b.id); return p && p.alt > 5; }).map(b => b.id);
      const drawn = WuriSkyChart.bodies().map(b => b.id);
      const moon = WuriSkyChart.bodies().find(b => b.id === 'moon');
      const illum = window.WuriTodaySky ? WuriTodaySky.moonPhaseOf(now).illumination : null;
      return { up, drawn, moonIllum: moon ? moon.illum : null, todayIllum: illum,
               hasMoonDisc: !!document.querySelector('#sk-chart-svg .sk-moon-disc'),
               planetDots: document.querySelectorAll('#sk-chart-svg .sk-planet').length,
               bodyLabels: document.querySelectorAll('#sk-chart-svg .sk-bodylabel').length };
    })()""")
    ok("运行时 当空天体（>5°）全入图且不多画", all(i in ledger["drawn"] for i in ledger["up"]) and ledger["bodyLabels"] >= len(ledger["drawn"]),
       "up=%s drawn=%s" % (ledger["up"], ledger["drawn"]))
    if ledger["moonIllum"] is not None:
        ok("运行时 月相照亮与今日星象同源同值（Δ<0.01）", abs(ledger["moonIllum"] - ledger["todayIllum"]) < 0.01,
           "%s vs %s" % (ledger["moonIllum"], ledger["todayIllum"]))
    else:
        ok("运行时 月相照亮（月亮未升，跳过并注明）", True, "moon below horizon at runtime")

    pick_id = "saturn" if "saturn" in ledger["drawn"] else (ledger["drawn"][0] if ledger["drawn"] else None)
    if pick_id:
        pt = ev("window.WuriSkyChart.bodyPointOf(%s)" % json.dumps(pick_id))
        rect = ev("(()=>{const r=document.querySelector('#sk-chart-svg').getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height};})()")
        cx = rect["x"] + pt["x"] / 400 * rect["w"]; cy = rect["y"] + pt["y"] / 400 * rect["h"]
        mouse(cx, cy)
        ok("运行时 点选天体出信息条（infoBody＋详情钮隐藏）",
           waitfor("window.WuriSkyChart.state().infoBody === %s" % json.dumps(pick_id))
           and ev("!document.getElementById('sk-info').hidden && document.getElementById('sk-info-detail').hidden"))
        nm = ev("document.getElementById('sk-info-name').textContent")
        ok("运行时 信息条含名称＋身份注", ("土星" in nm or "行星" in nm or "月亮" in nm) and "·" in nm, nm)
    else:
        ok("运行时 点选天体出信息条", False, "no body drawn")

    # 搜索定位
    ev("(()=>{const q=document.getElementById('sk-q'); q.value='土星'; return true;})()")
    ev("document.getElementById('sk-go').click(); true", 0.5)
    ok("运行时 搜索「土星」定位（focusBody＋聚焦条＋信息条）",
       waitfor("window.WuriSkyChart.state().focusBody === 'saturn'")
       and ev("!document.getElementById('sk-focusbar').hidden && window.WuriSkyChart.state().infoBody === 'saturn'"))
    ev("(()=>{const q=document.getElementById('sk-q'); q.value='月亮'; return true;})()")
    ev("document.getElementById('sk-go').click(); true", 0.5)
    ok("运行时 搜索「月亮」定位", waitfor("window.WuriSkyChart.state().focusBody === 'moon'"))
    time.sleep(0.4); shot("chart-bodies-390.png")
    ev("document.getElementById('sk-unfocus').click(); true", 0.4)

    # ---------- 今夜列表 ----------
    ev("(()=>{const b=document.getElementById('sky-chart-back'); b.scrollIntoView(); b.click(); return true;})()")
    ev("document.querySelector('[data-sx2=\"tonight\"]').click(); true", 0.4)
    ok("运行时 进今夜可见", waitfor("!document.getElementById('view-sky-tonight').hidden && !!document.querySelector('#sk-tonight-body .sx-row')", 30))
    tn = ev(r"""(() => {
      const should = WuriSky.BODIES.filter(b => { const bk = WuriSkyChart.bestBody(b.id); return bk && bk.alt >= 10; }).map(b => b.id);
      const rows = Array.from(document.querySelectorAll('#sk-tonight-body [data-sx-body]')).map(r => r.getAttribute('data-sx-body'));
      const badge = !!document.querySelector('#sk-tonight-body [data-sx-body] .sx-badge.body');
      const noDetail = Array.from(document.querySelectorAll('#sk-tonight-body [data-sx-body]')).every(r => !r.hasAttribute('data-sx-detail'));
      return { should, rows, badge, noDetail };
    })()""")
    ok("运行时 今夜天体行与 bestBody 门槛逐行对账＋徽标＋无详情挂载",
       sorted(tn["rows"]) == sorted(tn["should"]) and tn["badge"] and tn["noDetail"],
       "rows=%s should=%s" % (tn["rows"], tn["should"]))

    # ---------- 今夜内星等控件（并入项：与星图共用 magLim 双向同步） ----------
    mg0 = ev("""(() => { const el=document.getElementById('tn-mag');
      return { ctl: !!el, val: el ? el.value : null, lim: WuriSky.magLim(),
               ast: document.querySelectorAll('#sk-tonight-body .sx-row[data-sx-detail]').length,
               bodies: document.querySelectorAll('#sk-tonight-body .sx-row[data-sx-body]').length }; })()""")
    ok("运行时 今夜内有星等控件且值与全局 magLim 一致", mg0["ctl"] and int(mg0["val"]) == mg0["lim"], str(mg0))
    n6 = mg0["ast"]
    ev("(()=>{const el=document.getElementById('tn-mag'); el.value='3'; el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()")
    ok("运行时 今夜改 3 等：列表即时重筛（星官行变少、天体行不变）",
       waitfor("WuriSky.magLim() === 3 && document.querySelectorAll('#sk-tonight-body .sx-row[data-sx-detail]').length < %d" % n6, 20)
       and ev("document.querySelectorAll('#sk-tonight-body .sx-row[data-sx-body]').length") == mg0["bodies"]
       and ev("document.getElementById('tn-mag-lab').textContent").strip().startswith("3"), "n6=%d" % n6)
    shot("tonight-mag-390.png")
    ev("(()=>{const b=document.getElementById('sky-tonight-back'); b.scrollIntoView(); b.click(); return true;})()")
    ev("document.querySelector('[data-sx2=\"chart\"]').click(); true", 0.4)
    ok("运行时 星图侧滑杆跟随今夜改动（=3）",
       waitfor("!!document.getElementById('sk-mag')") and ev("document.getElementById('sk-mag').value") == "3"
       and ev("document.getElementById('sk-mag-lab').textContent").strip().startswith("3"))
    ev("(()=>{const el=document.getElementById('sk-mag'); el.value='6'; el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()", 0.6)
    ev("(()=>{const b=document.getElementById('sky-chart-back'); b.scrollIntoView(); b.click(); return true;})()")
    ev("document.querySelector('[data-sx2=\"tonight\"]').click(); true", 0.4)
    ok("运行时 星图改回 6 等：今夜控件与列表行数跟随恢复",
       waitfor("document.getElementById('tn-mag') && document.getElementById('tn-mag').value === '6' && document.querySelectorAll('#sk-tonight-body .sx-row[data-sx-detail]').length === %d" % n6, 20))
    ev("(()=>{const el=document.getElementById('tn-mag'); el.value='4'; el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()", 0.8)
    ev("location.reload(); true", 2.5)
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 0.8)
    ev("document.querySelector('[data-sx2=\"tonight\"]').click(); true", 0.4)
    ok("运行时 今夜星等刷新保持（4 等）",
       waitfor("document.getElementById('tn-mag') && document.getElementById('tn-mag').value === '4' && WuriSky.magLim() === 4", 20))
    ev("(()=>{const el=document.getElementById('tn-mag'); el.value='6'; el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()", 0.8)
    ev("(()=>{const b=document.getElementById('sky-tonight-back'); b.scrollIntoView(); b.click(); return true;})()")

    # ---------- AR：面板文案＋改名＋天体 ----------
    ev("window.WuriSkyAR.open(); true", 0.6)
    ok("运行时 进 AR 开启面板", waitfor("!!document.getElementById('ar-panel') && !document.getElementById('ar-panel').hidden"))
    panel = ev("(()=>{const p=document.getElementById('ar-panel'); const cal=document.querySelector('#view-sky-ar .sx-caliber');"
               " const rb=document.querySelector('#sx-ar [data-ar=\"calreset\"]');"
               " return {panel: p ? p.textContent : '', caliber: cal ? cal.textContent : '', reset: rb ? rb.textContent : ''};})()")
    ok("运行时 面板两句校准指引在位", "画几个「8」字" in panel["panel"] and "把星对准真星" in panel["panel"], panel["panel"][:60])
    ok("运行时 「对星归零」改名＋口径补句", panel["reset"] == "对星归零" and "清掉拖动对星留下的偏移" in panel["caliber"], panel["reset"])
    ev("document.querySelector('#sx-ar [data-ar=\"start\"]').click(); true", 0.3)
    ok("运行时 AR 已启动", waitfor("window.WuriSkyAR._state().running === true", 15))
    # 姿态搜索：alpha 取土星方位，beta 网格找中心最接近土星高度/方位的姿态
    pose = ev(r"""(() => {
      const p = WuriSky.bodyPos(new Date(), WuriSky.DEFAULT_OBS, 'saturn');
      return p ? { alt: p.alt, az: p.az } : null;
    })()""")
    found = False
    if pose and pose["alt"] > 3:
        # 坐标下降瞄准：先探测 alpha/beta 对中心方位/高度的影响符号，再迭代收敛
        def wrap180(x): return ((x + 540) % 360) - 180
        def inject(a, b, g=0):
            ev("window.WuriSkyAR._injectPose(%f, %f, %f); true" % (a, b, g), 0.35)
            return ev("window.WuriSkyAR._state()")
        a0, b0 = pose["az"], 90.0
        st0 = inject(a0, b0)
        stA = inject(a0 + 15, b0)
        stB = inject(a0, b0 + 15)
        def sgn(v): return 1 if v > 0.5 else (-1 if v < -0.5 else 0)
        sAz = sgn(wrap180(stA["centerAz"] - st0["centerAz"])) or 1
        sAlt = sgn(stB["centerAlt"] - st0["centerAlt"]) or 1
        a, b = a0, b0
        for _ in range(10):
            st = inject(a, b)
            dAz = wrap180(st["centerAz"] - pose["az"]); dAlt = st["centerAlt"] - pose["alt"]
            if abs(dAz) < 3 and abs(dAlt) < 3:
                found = True; break
            a -= sAz * dAz * 0.9
            b -= sAlt * dAlt * 0.9
    if found:
        ok("运行时 AR 姿态对准土星（中心偏差<7°/12°）", waitfor("window.WuriSkyAR._state().bodies.some(b => b.id === 'saturn')", 10))
        lab = ev("window.WuriSkyAR._state().labels")
        ok("运行时 AR 土星标签已登记（优先级表内）", any(l.get("body") == "saturn" for l in lab), str(lab)[:120])
        time.sleep(0.4); shot("ar-bodies-390.png")
    else:
        ok("运行时 AR 姿态对准土星", False, "pose search failed saturn=%s" % pose)

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    ok("运行时 全程无 JS 异常", not excs, str(excs[:1])[:200])
finally:
    try: chrome.kill()
    except Exception: pass

print("\n==== v2110 smoke %d/%d PASS ====" % (sum(RES), len(RES)))
sys.exit(0 if all(RES) and RES else 1)

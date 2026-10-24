#!/usr/bin/env python3
"""v2.1.0 (4) 专项冒烟（本地 file:// + CDP）：今日星空卡斗柄圆盘——
红色楔形指针（.sx-needle）换北斗七星小图（.sx-dipper）。
断言：①楔形元素已不存在（源码＋DOM 双查）；②七星组存在且可见——
7 星点＋连线（折线＋斗身闭合线）、组包围盒 >0、每星心距盘心 ≤ (44+星半径)
归一半径；③圆盘中心 elementFromPoint 命中圆盘 SVG 链；④角度等值——
两个不同注入时刻下，「斗身四星形心→摇光」实测方向角与指向支×30°
（＝原楔形尖端角，取自卡上指向支文本＋组 data-point-deg 双源对齐）差 ≤1°；
⑤日/夜双主题、390/412 双宽截图存 v2104-shots/；⑥全程无 JS 异常。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2104-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v102 缓存名", "wuri-v102-20261024-v210-6" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("四件套：CSS ?v=102＋版本 v2.1.0 (6)", "css/style.css?v=102" in html and "v2.1.0 (6)" in html)
stars = open(os.path.join(WWW, "js/stars.js"), encoding="utf-8").read()
report("七星数据与楔形退场（stars.js）", "DIPPER_STARS" in stars and "sx-dipper" in stars and "sx-needle" not in stars)
css = open(os.path.join(WWW, "css/style.css"), encoding="utf-8").read()
report("七星样式在位、楔形样式已删（style.css）", ".sx-dipper-star" in css and ".sx-dipper-line" in css and ".sx-needle" not in css)
report("北斗坐标与 bugang 同源（天枢/摇光 BSC5 值）",
       "165.93208" in stars and "206.88500" in stars and "49.31333" in stars)

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

    def mouse(x, y):
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    def click_el(sel):
        box = None; last = None
        for _ in range(16):
            box = ev("(() => { const e = document.querySelector(%s); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()" % json.dumps(sel))
            if box and last and abs(box["x"] - last["x"]) < 1 and abs(box["y"] - last["y"]) < 1: break
            last = box; time.sleep(0.25)
        assert box, "元素不存在: " + sel
        mouse(box["x"], box["y"]); time.sleep(0.9)

    def shot(name):
        import base64
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    MEASURE = r"""(() => {
      const DZS = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
      const DZT = {'醜':1};
      const big = document.getElementById('sx-sky-dipper-big');
      const txt = big ? big.textContent : '';
      let branch = txt.includes('·') ? txt.split('·')[1].trim() : '';
      let idx = DZS.indexOf(branch); if (idx < 0 && branch in DZT) idx = DZT[branch];
      const g = document.querySelector('#sx-sky-compass .sx-dipper');
      const pd = g ? Number(g.getAttribute('data-point-deg')) : null;
      const cs = [...document.querySelectorAll('#sx-sky-compass .sx-dipper-star')];
      const pts = cs.map(c => { const r = c.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; });
      const bowl = pts.slice(0, 4).reduce((a, p) => [a[0] + p[0]/4, a[1] + p[1]/4], [0, 0]);
      const tip = pts[6] || [0, 0];
      const dx = tip[0] - bowl[0], dy = tip[1] - bowl[1];
      let ang = Math.atan2(dx, -dy) * 180 / Math.PI; if (ang < 0) ang += 360;
      const exp = (idx >= 0) ? idx * 30 : null;
      let diff = null;
      if (exp !== null) { diff = Math.abs(ang - exp); if (diff > 180) diff = 360 - diff; }
      return { branch, exp, pd, ang: Math.round(ang * 100) / 100, diff: diff === null ? null : Math.round(diff * 100) / 100 };
    })()"""

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    assert waitfor("!!document.querySelector('#tabbar button[data-tab=\\\"tab-stars\\\"]')")
    assert waitfor("!!window.Stars && !!window.WuriTodaySky")

    # ---------- 真点击进星象页 ----------
    click_el('#tabbar button[data-tab="tab-stars"]')
    assert waitfor("!!document.querySelector('#sx-sky-compass svg.sx-compass')")
    ev("document.getElementById('today-sky-card').scrollIntoView({block: 'center'}); true", 0.5)

    report("楔形指针已不存在（DOM）", ev("document.querySelectorAll('#sx-sky-compass .sx-needle').length") == 0)

    vis = ev(r"""(() => {
      const svg = document.querySelector('#sx-sky-compass svg.sx-compass');
      const g = document.querySelector('#sx-sky-compass .sx-dipper');
      if (!svg || !g) return null;
      const sr = svg.getBoundingClientRect();
      const gr = g.getBoundingClientRect();
      const lines = [...document.querySelectorAll('#sx-sky-compass .sx-dipper-line')];
      const linePts = lines.map(l => (l.getAttribute('points') || (l.getAttribute('x1') !== null ? 'seg' : '')).split(' ').filter(Boolean).length);
      const stars = [...document.querySelectorAll('#sx-sky-compass .sx-dipper-star')].map(c => {
        const r = c.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
      });
      const cx = sr.x + sr.width / 2, cy = sr.y + sr.height / 2;
      const maxD = Math.max(...stars.map(s => Math.hypot(s.x - cx, s.y - cy)));
      return { nStars: stars.length, nLines: lines.length, linePts, gW: gr.width, gH: gr.height,
               starW: stars.map(s => Math.round(s.w * 10) / 10),
               maxD: Math.round(maxD * 10) / 10, lim: Math.round(sr.width * (44 + 3.4) / 180 * 10) / 10 + 2,
               inSvg: stars.every(s => s.x >= sr.x && s.x <= sr.x + sr.width && s.y >= sr.y && s.y <= sr.y + sr.height) };
    })()""")
    report("七星组齐备（7 星点＋折线 7 点＋斗身闭合线）",
           vis and vis["nStars"] == 7 and vis["nLines"] == 2 and vis["linePts"][0] == 7, vis)
    report("七星组可见（包围盒>0、星点有尺寸、全在圆盘内、最大半径≤归一半径）",
           vis and vis["gW"] > 20 and vis["gH"] > 10 and all(w > 0 for w in vis["starW"])
           and vis["inSvg"] and vis["maxD"] <= vis["lim"], vis)

    center_hit = ev(r"""(() => {
      const svg = document.querySelector('#sx-sky-compass svg.sx-compass');
      const r = svg.getBoundingClientRect();
      const el = document.elementFromPoint(Math.floor(r.x + r.width / 2), Math.floor(r.y + r.height / 2));
      if (!el) return 'none';
      const inCompass = !!el.closest('#sx-sky-compass');
      const inCard = !!el.closest('#today-sky-card');
      return inCompass && inCard ? 'in-card' : (el.id || el.tagName);
    })()""")
    report("圆盘中心 elementFromPoint 命中卡内圆盘链", center_hit == "in-card", center_hit)

    # ---------- 角度等值：时刻一（真实当前时刻） ----------
    m1 = ev(MEASURE)
    report("角度·时刻一：「斗身→摇光」角 == 指向支×30°（原楔形角，±1°）",
           m1 and m1["exp"] is not None and m1["pd"] == m1["exp"] and m1["diff"] is not None and m1["diff"] <= 1, m1)
    shot("dipper-day-390")

    # ---------- 角度等值：时刻二（注入不同指向支的时刻） ----------
    pick = ev(r"""(() => {
      const cur = Number(document.querySelector('#sx-sky-compass .sx-dipper').getAttribute('data-point-deg')) / 30;
      window.__origSolarNow = window.solarNow;
      for (let h = 0; h < 96; h += 2) {
        const d = new Date(2026, 9, 24, 0, 0); d.setHours(d.getHours() + h);
        if (WuriTodaySky.dipperOf(d, {}).pointingIndex !== cur) {
          window.solarNow = () => d; return d.toString();
        }
      }
      return null;
    })()""")
    assert pick, "48 小时内找不到不同指向支的注入时刻"
    ev("Stars.renderTodaySky(); true", 0.4)
    m2 = ev(MEASURE)
    report("角度·时刻二（注入 %s）：方向角随指向支同步（±1°）且与时刻一不同" % pick[:24],
           m2 and m2["exp"] is not None and m2["pd"] == m2["exp"] and m2["diff"] is not None
           and m2["diff"] <= 1 and m2["exp"] != m1["exp"], m2)
    ev("window.solarNow = window.__origSolarNow; Stars.renderTodaySky(); true", 0.4)
    m3 = ev(MEASURE)
    report("还原真实时刻后角度回到时刻一", m3 and m3["exp"] == m1["exp"] and m3["diff"] <= 1, m3)

    # ---------- 双主题截图 ----------
    ev("document.documentElement.setAttribute('data-theme', 'night'); Stars.renderTodaySky(); true", 0.3)
    ev("document.getElementById('today-sky-card').scrollIntoView({block: 'center'}); true", 0.4)
    shot("dipper-night-390")
    night_cols = ev(r"""(() => {
      const s = document.querySelector('#sx-sky-compass .sx-dipper-star');
      const l = document.querySelector('#sx-sky-compass .sx-dipper-line');
      return { star: getComputedStyle(s).fill, line: getComputedStyle(l).stroke };
    })()""")
    report("夜间取色（星点/连线计算样式非空）", night_cols and night_cols["star"] not in ("", "none") and night_cols["line"] not in ("", "none"), night_cols)
    ev("document.documentElement.setAttribute('data-theme', 'day'); Stars.renderTodaySky(); true", 0.3)

    # ---------- 412 宽截图 ----------
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    ev("document.getElementById('today-sky-card').scrollIntoView({block: 'center'}); true", 0.5)
    shot("dipper-day-412")
    report("412 宽圆盘仍在（七星组可见）",
           ev("(() => { const g = document.querySelector('#sx-sky-compass .sx-dipper'); if (!g) return false; const r = g.getBoundingClientRect(); return r.width > 20 && r.height > 10; })()") is True)

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    logerr = [e for e in cdp.events if e.get("method") == "Log.entryAdded"
              and e.get("params", {}).get("entry", {}).get("level") == "error"]
    report("全程无 JS 异常", len(excs) == 0 and len(logerr) == 0, (excs + logerr)[:1])

finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(bad), len(results)))
if bad:
    print("FAILED:", bad)
    sys.exit(1)

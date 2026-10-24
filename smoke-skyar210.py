#!/usr/bin/env python3
"""v2.1.0 (2) 相机认星 AR 专项冒烟（本地 file:// + CDP + 假相机/合成姿态）：
入口注入、开启流程（假相机授权）、注入姿态管线（朝北上抬 45° → 中心
方位/高度断言＋北极标签落位近中心）、连线段数、校准偏移（az+10 标签右移
＋存档）、点标签进详情＋返回、拍照合成出图（像素多样性）、红光开关、
相机被拒回落面板→平面星图、零溢出、无 JS 异常。
沙箱边界：无真机相机/陀螺仪——姿态由合成 DeviceOrientationEvent 注入，
相机为 Chrome 假设备；跟随手感与罗盘漂移不在本冒烟覆盖内（真机验收）。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/skyar210-shots")
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
report("SW 预缓存含 sky-ar.js", "js/sky-ar.js" in assets)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("AR 视图与脚本在位", 'id="view-sky-ar"' in html and "js/sky-ar.js" in html and "v2.1.0 (2)" in html)
arjs = open(os.path.join(WWW, "js/sky-ar.js"), encoding="utf-8").read()
report("AR 模块含姿态/校准/回落关键件", all(x in arjs for x in
       ["deviceorientation", "getUserMedia", "requestPermission", "_injectPose", "facingMode"]))

chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
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

    TOPMOST = """(() => { const el = document.elementFromPoint(Math.floor(innerWidth/2), Math.floor(innerHeight/2));
      if (!el) return 'none';
      const inV = id => { const v = document.getElementById(id); return v && !v.hidden && v.contains(el); };
      if (inV('view-sky-ar')) return 'ar';
      if (inV('view-sky-chart')) return 'chart';
      if (inV('view-star-detail')) return 'detail';
      const ts = document.getElementById('tab-stars'); if (ts && ts.contains(el)) return 'stars-home';
      return 'other:' + el.tagName; })()"""

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)

    # ---------- 入口 ----------
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 1.2)
    ok = waitfor("!!document.querySelector('[data-sxar=\"open\"]')")
    report("星象页相机认星入口已注入", ok)
    ev("document.querySelector('[data-sxar=\"open\"]').click(); true", 0.5)
    report("硬断言：AR 页为最上层＋开始面板在位",
           ev("!document.getElementById('view-sky-ar').hidden") and ev(TOPMOST) == "ar"
           and ev("!document.getElementById('ar-panel').hidden"), ev(TOPMOST))

    # ---------- 开启（假相机） ----------
    ev("document.querySelector('#ar-panel [data-ar=\"start\"]').click(); true", 0.3)
    ok = waitfor("window.WuriSkyAR && WuriSkyAR._state().running", timeout=25)
    st = ev("window.WuriSkyAR._state()")
    report("开启成功（相机流已起、面板收起）", ok and ev("document.getElementById('ar-panel').hidden"), st)

    # ---------- 注入姿态：朝北、上抬 45°（α0 β135 γ0） ----------
    ev("""(() => { const e = new DeviceOrientationEvent('deviceorientation', {alpha: 0, beta: 135, gamma: 0});
      window.dispatchEvent(e); return true; })()""", 1.6)
    st = ev("window.WuriSkyAR._state()")
    report("姿态已收（合成事件路径）", st["hasPose"], st)
    report("中心指向断言（方位≈0°、高度≈45°）",
           st["centerAz"] is not None and (st["centerAz"] < 3 or st["centerAz"] > 357) and abs(st["centerAlt"] - 45) < 3,
           (st["centerAz"], st["centerAlt"]))
    report("连线段数（视场内 >20）", st["segments"] > 20, st["segments"])
    lab = [x for x in st["labels"] if x["key"] == "紫微垣|北极"]
    dim = ev("(() => { const c = document.getElementById('ar-canvas'); return {w: c.clientWidth, h: c.clientHeight}; })()")
    # 锚点用天北极投影（alt＝纬度、az＝0，任意时刻恒定）：北极官最亮星为
    # 帝星、绕极随时辰漂移，不作位置带断言，只断言其标签在视场内出现。
    pp = st["polePoint"]
    report("天北极投影落位近中心（恒定锚点）",
           pp and dim["w"] * 0.32 < pp["x"] < dim["w"] * 0.68 and dim["h"] * 0.32 < pp["y"] < dim["h"] * 0.68,
           (pp, dim))
    report("北极标签在视场内出现（绕极官恒见）", len(lab) == 1, lab)
    shot("ar-390-polaris")

    # ---------- 校准偏移（以极点投影位移为据） ----------
    x0 = pp["x"] if pp else 0
    ev("window.WuriSkyAR._setCal(10, 0); true", 0.5)
    st2 = ev("window.WuriSkyAR._state()")
    pp2 = st2["polePoint"]
    saved = ev("localStorage.getItem('wuri_sky_ar_cal_v1')")
    report("校准 az+10：极点投影右移 >25px 且已存档",
           pp2 and pp2["x"] - x0 > 25 and saved and '"az":10' in saved,
           (x0, pp2["x"] if pp2 else None, saved))
    ev("window.WuriSkyAR._setCal(0, 0); true", 0.4)

    # ---------- 点标签进详情 → 返回 ----------
    st3 = ev("window.WuriSkyAR._state()")
    lab3 = [x for x in st3["labels"] if x["key"] == "紫微垣|北极"]
    if lab3:
        rect = ev("(() => { const r = document.getElementById('ar-canvas').getBoundingClientRect(); return {x: r.x, y: r.y}; })()")
        px, py = rect["x"] + lab3[0]["x"], rect["y"] + lab3[0]["y"]
        mouse(px, py, "mousePressed"); mouse(px, py, "mouseReleased")
        time.sleep(1.0)
        det = ev("document.getElementById('sx-detail').textContent") or ""
        report("硬断言：点北极标签→星官详情（北极＋最上层）",
               "北极" in det and ev("!document.getElementById('view-star-detail').hidden") and ev(TOPMOST) == "detail",
               (ev(TOPMOST), det[:40]))
        ev("(document.getElementById('star-detail-back').click(), true)", 0.5)
        report("硬断言：详情返回→回 AR 页",
               ev("!document.getElementById('view-sky-ar').hidden && document.getElementById('view-star-detail').hidden"), "")
    else:
        report("硬断言：点北极标签→星官详情", False, "无北极标签")

    # ---------- 红光模式 ----------
    ev("document.querySelector('.ar-bar [data-ar=\"red\"]').click(); true", 0.3)
    red = ev("document.getElementById('ar-stage').classList.contains('red')")
    saved2 = ev("localStorage.getItem('wuri_sky_ar_cal_v1')")
    report("红光模式开关（红类＋存档）", red and saved2 and '"red":true' in saved2, (red, saved2))
    ev("document.querySelector('.ar-bar [data-ar=\"red\"]').click(); true", 0.3)

    # ---------- 拍照合成 ----------
    cap = ev("""(async () => { const u = window.WuriSkyAR._captureDataURL();
      if (!u) return {ok: false};
      const img = new Image(); await new Promise(r => { img.onload = r; img.src = u; });
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
      const d = x.getImageData(0, 0, 32, 32).data, seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
      return {ok: u.startsWith('data:image/png'), len: u.length, colors: seen.size}; })()""")
    report("拍照合成出图（PNG＋像素多样 ≥3 色）", cap and cap["ok"] and cap["len"] > 8000 and cap["colors"] >= 3, cap)

    # ---------- 零溢出 ----------
    report("390 日间：AR 页零横向溢出",
           ev("document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1"))
    ev("(document.getElementById('sky-ar-back').click(), true)", 0.5)
    report("返回后 AR 已停（流关闭）", ev("!window.WuriSkyAR._state().running"))

    # ---------- 星等共用口径（WuriSky.magLim，默认 6 → 设 3 后标签锐减） ----------
    ev("window.WuriSkyAR._injectPose(0, 90, 0); true", 1.2)
    l6 = ev("window.WuriSkyAR._state().labels.length")
    ev("window.WuriSkyAR._stop(); localStorage.setItem('wuri_sky_maglim_v1', '3'); true", 0.3)
    ev("document.querySelector('[data-sxar=\"open\"]').click(); true", 0.3)
    ev("document.querySelector('[data-ar=\"start\"]').click(); true", 0.8)
    ev("window.WuriSkyAR._injectPose(0, 90, 0); true", 1.4)
    l3 = ev("window.WuriSkyAR._state().labels.length")
    report("星等设定 3 等：AR 标签较 6 等明显减少", 1 <= l3 < l6, (l6, l3))
    ev("window.WuriSkyAR._stop(); localStorage.removeItem('wuri_sky_maglim_v1'); true", 0.3)

    # ---------- 回落路径：相机被拒 ----------
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    ev("""(() => { navigator.mediaDevices.getUserMedia = function () {
      return Promise.reject(new DOMException('denied', 'NotAllowedError')); }; return true; })()""")
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 1.2)
    ev("document.querySelector('[data-sxar=\"open\"]').click(); true", 0.5)
    ev("document.querySelector('#ar-panel [data-ar=\"start\"]').click(); true", 1.2)
    stf = ev("window.WuriSkyAR._state()")
    panel_txt = ev("document.getElementById('ar-panel').textContent") or ""
    report("相机被拒：回落面板（fallback=camera＋人话＋未运行）",
           stf["fallback"] == "camera" and not stf["running"] and "平面星图" in panel_txt,
           (stf["fallback"], panel_txt[:60]))
    ev("document.querySelector('#ar-panel [data-ar=\"tochart\"]').click(); true", 1.2)
    report("硬断言：回落→平面星图打开、AR 页收起",
           ev("!document.getElementById('view-sky-chart').hidden && document.getElementById('view-sky-ar').hidden")
           and ev(TOPMOST) == "chart", ev(TOPMOST))

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    report("全程无 JS 异常", len(excs) == 0, json.dumps(excs)[:300] if excs else "")
finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(bad), len(results)))
if bad:
    print("FAILED:", bad); sys.exit(1)

#!/usr/bin/env python3
"""v2.1.0 (2) 平板适配专项冒烟（本地 file:// + CDP）：
390 手机基线星盘直径 → 768×1024 / 1024×768 两档：星盘直径显著变大、
主体＋侧栏并排（侧栏可见、同排）、整页与视图零横向溢出、今夜可见双列、
标签恒正立断言在大屏成立、AR 舞台全幅（宽 ≥ 视口 80%、高 ≥500）。
SVG 矢量渲染与 DPR 无关（任意尺寸不糊），故断言以 CSS 显示尺寸为准。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/skytab-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:260]) if not ok and extra != "" else ""))

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

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def waitfor(js, timeout=25.0, step=0.4):
        end = time.time() + timeout
        while time.time() < end:
            if ev(js): return True
            time.sleep(step)
        return False

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        import base64
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def set_metrics(w, h):
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": w, "height": h, "deviceScaleFactor": 2, "mobile": True})

    def open_chart():
        ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 0.8)
        waitfor("!!document.getElementById('sx2-entries')")
        ev("document.querySelector('[data-sx2=\"chart\"]').click(); true", 0.3)
        return waitfor("document.querySelectorAll('#sk-chart-svg path.sk-line').length >= 100", timeout=30)

    def layout_probe():
        return ev("""(() => { const svg = document.getElementById('sk-chart-svg');
          const side = document.querySelector('.sk-side'), main = document.querySelector('.sk-main');
          const view = document.getElementById('view-sky-chart');
          const sr = svg.getBoundingClientRect(), sd = side.getBoundingClientRect(), mn = main.getBoundingClientRect();
          return { dia: sr.width, sideW: sd.width, sideX: sd.x, mainX: mn.x, sideY: sd.y, mainY: mn.y,
                   viewOverflow: view.scrollWidth - view.clientWidth,
                   docOverflow: document.documentElement.scrollWidth - innerWidth }; })()""")

    # ---------- 390 基线 ----------
    set_metrics(390, 844)
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    ok = open_chart()
    p0 = layout_probe()
    report("390 基线：星图打开、星盘直径记录", ok and p0["dia"] > 300, p0)
    phone_dia = p0["dia"]
    ev("(document.getElementById('sky-chart-back').click(), true)", 0.4)

    # ---------- 768×1024 ----------
    set_metrics(768, 1024)
    ev("location.reload(); true", 1.2)
    ok = open_chart()
    p1 = layout_probe()
    report("768×1024：星图打开", ok)
    report("768×1024：星盘直径 ≥440 且 ≥ 手机档 ×1.15", p1["dia"] >= 440 and p1["dia"] >= phone_dia * 1.15, (phone_dia, p1["dia"]))
    report("768×1024：侧栏可见（宽 ≥240）且与主体同排并列",
           p1["sideW"] >= 240 and p1["sideX"] > p1["mainX"] and abs(p1["sideY"] - p1["mainY"]) < 60, p1)
    report("768×1024：视图与文档零横向溢出", p1["viewOverflow"] <= 1 and p1["docOverflow"] <= 1, p1)
    shot("chart-768x1024")
    ev("(document.getElementById('sky-chart-back').click(), true)", 0.4)

    # ---------- 1024×768 ----------
    set_metrics(1024, 768)
    ev("location.reload(); true", 1.2)
    ok = open_chart()
    p2 = layout_probe()
    report("1024×768：星图打开", ok)
    report("1024×768：星盘直径 ≥560 且 ≥ 手机档 ×1.45", p2["dia"] >= 560 and p2["dia"] >= phone_dia * 1.45, (phone_dia, p2["dia"]))
    report("1024×768：侧栏可见（宽 ≥240）且并列", p2["sideW"] >= 240 and p2["sideX"] > p2["mainX"], p2)
    report("1024×768：视图与文档零横向溢出", p2["viewOverflow"] <= 1 and p2["docOverflow"] <= 1, p2)
    # 大屏标签恒正立：自旋 180 后抽验
    ev("window.WuriSkyChart.setSpin(180); true", 0.4)
    upr = ev("""(() => { const els = [...document.querySelectorAll('#sk-chart-svg text.sk-label:not(.sk-linelabel):not(.sk-sunlabel)')].slice(0, 4);
      return els.map(e => { const m = /rotate\\((-?[\\d.]+)/.exec(e.getAttribute('transform') || ''); return m ? parseFloat(m[1]) : null; }); })()""")
    report("1024×768：标签恒正立（自旋 180 后反向旋转 −180）",
           len(upr) >= 2 and all(v is not None and abs(v + 180) < 0.6 for v in upr), upr)
    ev("window.WuriSkyChart.setSpin(0); true", 0.2)
    shot("chart-1024x768")
    ev("(document.getElementById('sky-chart-back').click(), true)", 0.4)
    # 今夜可见双列
    ev("document.querySelector('[data-sx2=\"tonight\"]').click(); true", 0.3)
    ok = waitfor("document.querySelectorAll('#sx-tonight .sx-row').length >= 5", timeout=30)
    cols = ev("""(() => { const xs = [...document.querySelectorAll('#sx-tonight .sx-row')].slice(0, 6).map(r => Math.round(r.getBoundingClientRect().x));
      return { n: xs.length, distinct: [...new Set(xs)].length }; })()""")
    report("1024×768：今夜可见双列排布（前 6 行 ≥2 个列位）", ok and cols["distinct"] >= 2, cols)
    shot("tonight-1024x768")
    ev("(document.getElementById('sky-tonight-back').click(), true)", 0.4)
    # AR 全幅
    ev("document.querySelector('[data-sxar=\"open\"]').click(); true", 0.8)
    arp = ev("""(() => { const st = document.getElementById('ar-stage'); if (!st) return null;
      const r = st.getBoundingClientRect(); return { w: r.width, h: r.height, iw: innerWidth }; })()""")
    report("1024×768：AR 舞台全幅（宽 ≥ 视口 80%、高 ≥500）",
           bool(arp) and arp["w"] >= arp["iw"] * 0.8 and arp["h"] >= 500, arp)
    shot("ar-1024x768")
    ev("(document.getElementById('sky-ar-back').click(), true)", 0.4)

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    report("全程无 JS 异常", len(excs) == 0, json.dumps(excs)[:300] if excs else "")
finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(bad), len(results)))
if bad:
    print("FAILED:", bad); sys.exit(1)

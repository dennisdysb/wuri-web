#!/usr/bin/env python3
"""v1.4.0 封版批集成自检：首页三块＋术数子页（整卡点击、双主题、390/412、零溢出、零按钮可见、零 JS 异常）
用法: python3 qimen-build/smoke_hero.py — 截图落 qimen-build/shots-hero/"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
WWW = os.path.expanduser("~/workspace/wuri-web/www")
URL = "file://" + WWW + "/index.html"
OUT = os.path.expanduser("~/workspace/wuri-web/qimen-build/shots-hero")
os.makedirs(OUT, exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not ok: fails.append(name)

def run(width, tag):
    port = free_port()
    chrome = subprocess.Popen(["/opt/meta-chromium/chrome", "--headless=old", "--no-sandbox", "--disable-gpu",
        "--allow-file-access-from-files", f"--remote-debugging-port={port}",
        "--remote-debugging-address=127.0.0.1", f"--window-size={width},1000", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2) as r:
                    pages = json.loads(r.read())
                ws_url = pages[0]["webSocketDebuggerUrl"]; break
            except Exception:
                time.sleep(0.4)
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": width, "height": 915, "deviceScaleFactor": 2, "mobile": True})
        cdp.call("Page.addScriptToEvaluateOnNewDocument",
                 {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); } catch(e) {}"
                            "window.__errs=[]; window.addEventListener('error', function(e){ window.__errs.push(String(e.message||e.error)); });"})
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.5)
        ev = lambda expr: cdp.evaluate(expr)

        def fullshot(name):
            m = cdp.call("Page.getLayoutMetrics")
            h = m["cssContentSize"]["height"]
            r = cdp.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True,
                         "clip": {"x": 0, "y": 0, "width": width, "height": min(h, 2600), "scale": 1}})
            open(os.path.join(OUT, name + ".png"), "wb").write(base64.b64decode(r["data"]))

        st = ev("""(() => {
          const heroes = document.querySelectorAll('#tab-home .hero2');
          const pill = document.getElementById('home-today-pill');
          const visBtns = Array.from(document.querySelectorAll('.hero2 .btn')).filter(b => {
            const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
            return cs.display !== 'none' && r.width > 0; });
          const sw = document.documentElement.scrollWidth, iw = window.innerWidth;
          const bgDay = getComputedStyle(document.querySelector('.h2-bg-practice')).backgroundImage;
          return { nHeroes: heroes.length, pill: pill ? pill.textContent : null,
                   visBtns: visBtns.length, overflow: sw - iw, bgDay: bgDay.slice(0, 80),
                   count: (document.getElementById('deities-count-cn')||{}).textContent };
        })()""")
        check(f"[{tag}] 首页 hero 块 = 3", st["nHeroes"] == 3, st)
        check(f"[{tag}] 今日签已填（农历）", bool(st["pill"]) and "农历" in st["pill"], st["pill"])
        check(f"[{tag}] hero 内可见按钮 = 0", st["visBtns"] == 0, st["visBtns"])
        check(f"[{tag}] 首页无横向溢出", st["overflow"] <= 0, st["overflow"])
        check(f"[{tag}] 日间底图指向 heroes/day", "heroes/day/practice" in st["bgDay"], st["bgDay"])
        check(f"[{tag}] 图鉴计数已填", st["count"] == "七十四", st["count"])
        fullshot(f"home-day-{tag}")

        ev("document.getElementById('shushu-entry-card').click(); 'ok'"); time.sleep(0.8)
        ok = ev("!document.getElementById('view-shushu').hidden")
        check(f"[{tag}] 整卡点击打开术数子页", ok is True)
        minis = ev("document.querySelectorAll('#view-shushu .hero2.mini').length")
        check(f"[{tag}] 子页 mini 块 = 4", minis == 4, minis)
        fullshot(f"sub-day-{tag}")

        ev("document.getElementById('ss-liuyao').click(); 'ok'"); time.sleep(1.2)
        r = ev("({ly: !document.getElementById('view-liuyao').hidden, ss: !document.getElementById('view-shushu').hidden})")
        check(f"[{tag}] 六爻打开且子页已合上", r["ly"] is True and r["ss"] is False, r)
        ev("document.getElementById('liuyao-back').click(); 'ok'"); time.sleep(0.6)

        ev("document.getElementById('shushu-entry-card').click(); 'ok'"); time.sleep(0.5)
        ev("document.getElementById('ss-bazi').click(); 'ok'"); time.sleep(1.0)
        ok = ev("!document.getElementById('bazi-view').hidden")
        check(f"[{tag}] 八字从子页打开", ok is True)
        ev("document.getElementById('bazi-back').click(); 'ok'"); time.sleep(0.6)

        ev("document.getElementById('shushu-entry-card').click(); 'ok'"); time.sleep(0.5)
        ev("document.getElementById('ss-ziwei').click(); 'ok'"); time.sleep(1.2)
        ok = ev("!document.getElementById('view-ziwei').hidden")
        check(f"[{tag}] 紫微从子页打开", ok is True)
        ev("document.getElementById('ziwei-back').click(); 'ok'"); time.sleep(0.6)

        ev("document.getElementById('shushu-entry-card').click(); 'ok'"); time.sleep(0.5)
        ev("document.getElementById('ss-qimen').click(); 'ok'"); time.sleep(1.2)
        ok = ev("!document.getElementById('view-qimen').hidden")
        check(f"[{tag}] 奇门从子页打开", ok is True)
        ev("document.getElementById('qimen-back').click(); 'ok'"); time.sleep(0.6)

        ev("document.getElementById('deities-entry-card').click(); 'ok'"); time.sleep(1.0)
        ok = ev("!document.getElementById('view-deities').hidden")
        check(f"[{tag}] 图鉴整卡打开", ok is True)
        ev("document.getElementById('deities-back').click(); 'ok'"); time.sleep(0.6)

        ev("document.getElementById('practice-entry-card').click(); 'ok'"); time.sleep(1.0)
        ok = ev("!document.getElementById('practice-view').hidden")
        check(f"[{tag}] 修行整卡打开", ok is True)
        ev("document.getElementById('practice-back').click(); 'ok'"); time.sleep(0.6)

        ev("document.documentElement.setAttribute('data-theme','night'); 'ok'"); time.sleep(0.8)
        bgN = ev("getComputedStyle(document.querySelector('.h2-bg-compass')).backgroundImage")
        check(f"[{tag}] 夜间底图指向 heroes 原图", "heroes/compass" in bgN and "/day/" not in bgN, bgN[:80])
        fullshot(f"home-night-{tag}")
        ev("document.getElementById('shushu-entry-card').click(); 'ok'"); time.sleep(0.8)
        fullshot(f"sub-night-{tag}")
        ev("document.getElementById('shushu-back').click(); 'ok'"); time.sleep(0.4)

        errs = ev("window.__errs || []")
        check(f"[{tag}] 零 JS 异常", len(errs) == 0, errs[:3])
    finally:
        chrome.terminate()

run(412, "412")
run(390, "390")
print("FAILS:", fails if fails else "none")
sys.exit(1 if fails else 0)

#!/usr/bin/env python3
"""v2.1.0 (5) 专项冒烟（本地 file:// + CDP）：删除首页「相机认星」小入口行。
背景：(3) 方案3 在首页值神信息区与三块沉浸卡之间加的 .home-ar-entry 小行，
用户真机看了说夹在中间奇怪、要求删掉。本批只删这一处，其余 AR 入口不动。
断言：①静态——index.html/style.css/i18n.js 已无 home-ar-entry/hae-/home_ar_sub，
  悬浮钮 #sx-ar-fab 与 AR 视图/脚本仍在位，四件套 v101/(5)；
②运行时——首页 DOM 无 .home-ar-entry；值神区（节气/四值神/太阳所在）有内容；
  三块沉浸卡（修行/术数/图鉴）齐备可见且修行卡紧随值神信息区（间距 < 40px，
  证明中间那行已摘净、无残留空档）；390 宽截图存 v2105-shots/；无 JS 异常。
星象页悬浮钮直达 AR 由 smoke-v2103 复跑覆盖，本脚本不重复。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2105-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v101 缓存名", "wuri-v101-20261024-v210-5" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
css = open(os.path.join(WWW, "css/style.css"), encoding="utf-8").read()
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("四件套：CSS ?v=101＋版本 v2.1.0 (5)", "css/style.css?v=101" in html and "v2.1.0 (5)" in html)
report("首页小行已删净（html/css/i18n 三处）",
       "home-ar-entry" not in html and "home-ar-entry" not in css and "hae-" not in css
       and "home_ar_sub" not in i18n)
report("其余 AR 入口保留（悬浮钮＋AR 视图＋脚本）",
       'id="sx-ar-fab"' in html and 'id="view-sky-ar"' in html and "js/sky-ar.js" in html
       and "#sx-ar-fab" in css)

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

    def shot(name):
        import base64
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    errs = []
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    assert waitfor("!!document.querySelector('#tabbar')")
    assert waitfor("!!document.getElementById('zhishen-line') && document.getElementById('zhishen-line').textContent.trim().length > 4")

    report("运行时：首页 DOM 无 .home-ar-entry", ev("!document.querySelector('.home-ar-entry')"))
    report("值神区完整（节气＋四值神＋太阳所在均有内容)",
           ev("['jieqi-line','zhishen-line','sun-line'].every(id => { const e = document.getElementById(id); return e && e.textContent.trim().length > 2; })"))
    cards = ev("""(() => {
      const ids = ['practice-entry-card','shushu-entry-card','deities-entry-card'];
      const out = {};
      for (const id of ids) { const e = document.getElementById(id); if (!e) return null;
        const r = e.getBoundingClientRect(); out[id] = {x: r.x, y: r.y + scrollY, w: r.width, h: r.height}; }
      return out; })()""")
    report("三块沉浸卡齐备且有尺寸", bool(cards) and all(cards[k]["w"] > 300 and cards[k]["h"] > 80 for k in cards), cards)
    gap = ev("""(() => {
      const info = document.querySelector('section.card, .today-card, #today-card') || document.getElementById('sun-line');
      const infoBox = document.getElementById('sun-line').closest('section');
      const a = infoBox.getBoundingClientRect(), b = document.getElementById('practice-entry-card').getBoundingClientRect();
      return {infoBottom: a.bottom + scrollY, practiceTop: b.top + scrollY, gap: (b.top + scrollY) - (a.bottom + scrollY)}; })()""")
    report("修行卡紧随值神区（中间无小行残留空档，gap<40px）", gap and -2 <= gap["gap"] < 40, gap)
    report("首页悬浮钮仍在 DOM 且隐藏（仅星象页显示）",
           ev("!!document.getElementById('sx-ar-fab')") and ev("document.getElementById('sx-ar-fab').hidden") is True)
    shot("home-390")

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    logerr = [e for e in cdp.events if e.get("method") == "Log.entryAdded"
              and e.get("params", {}).get("entry", {}).get("level") == "error"]
    report("全程无 JS 异常", len(excs) == 0 and len(logerr) == 0, (excs + logerr)[:1])
finally:
    chrome.terminate()

fails = [n for n, ok in results if not ok]
print("\n== smoke-v2105: %d/%d PASS ==" % (len(results) - len(fails), len(results)))
if fails:
    print("FAIL:", fails); sys.exit(1)

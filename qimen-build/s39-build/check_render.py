#!/usr/bin/env python3
"""s39 查二：390x844 渲染——与现行各部同一渲染路径（file:// 整站 + JingWen.openReader），
断言：零 JS 异常、读者打开、正文段数=28、无横向溢出、稀有字字体位图有字形（canvas 探针）。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/qimen-build/s39-build")
URL = "file://" + WWW + "/index.html"
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not ok: fails.append(name)

feed_idx = json.load(open(os.path.join(WWW, "content/scriptures.json"), encoding="utf-8"))["index"]

port = free_port()
chrome = subprocess.Popen(["/opt/meta-chromium/chrome", "--headless=old", "--no-sandbox", "--disable-gpu",
    "--allow-file-access-from-files", f"--remote-debugging-port={port}",
    "--remote-debugging-address=127.0.0.1", "--window-size=390,844", "about:blank"],
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
             {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.addScriptToEvaluateOnNewDocument",
             {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); } catch(e) {}"
                        "window.__errs=[]; window.addEventListener('error', function(e){ window.__errs.push(String(e.message||e.error)); });"})
    cdp.call("Page.navigate", {"url": URL})
    time.sleep(4)
    ev = lambda expr: cdp.evaluate(expr)
    idx_json = json.dumps(feed_idx, ensure_ascii=False)
    r = ev(f"""(() => {{
      window.JINGWEN_INDEX = {idx_json};
      window.WURI_JING_BASE = 'content/jing/';
      try {{ localStorage.removeItem('wuri_feed_cache_v1'); }} catch(e) {{}}
      document.querySelector('[data-tab="tab-jing"]').click();
      JingWen.openReader('s39');
      return 'called';
    }})()""")
    time.sleep(3)
    st = ev("""(() => {
      const doc = document.documentElement;
      const reader = document.getElementById('jing-reader');
      let maxRight = 0, paraCount = 0, sample = '';
      const hist = {};
      reader.querySelectorAll('*').forEach(el => {
        const cls = (el.className && el.className.baseVal !== undefined) ? '' : (el.className || '');
        if (cls) hist[cls] = (hist[cls] || 0) + 1;
      });
      reader.querySelectorAll('.para, [class*="para"], p').forEach(p => {
        const r = p.getBoundingClientRect();
        if (r.width > 0 && p.textContent.trim()) { paraCount++; if (r.right > maxRight) maxRight = r.right; }
        if (!sample && p.textContent.length > 10) sample = p.textContent.slice(0, 30);
      });
      const title = (document.querySelector('#jing-title') || {}).textContent || '';
      return { errs: window.__errs || [], paraCount, maxRight: Math.round(maxRight),
               clientW: doc.clientWidth, scrollW: doc.scrollWidth, title, sample, hist,
               hasAudioBtn: (() => { const b = document.getElementById('jing-speak');
                 return b ? (b.style.display !== 'none') : null; })(),
               followBtn: (() => { const b = document.getElementById('jing-follow');
                 return b ? (b.style.display !== 'none') : null; })() };
    })()""")
    print(json.dumps(st, ensure_ascii=False, indent=1))
    check("零JS异常", not st["errs"], st["errs"][:2])
    check("段落渲染=28", st["paraCount"] == 28, st["paraCount"])
    check("无横向溢出", st["maxRight"] <= 390 and st["scrollW"] <= 390, f"maxRight={st['maxRight']} scrollW={st['scrollW']}")
    check("音频按钮可见(hasAudio登记)", st["hasAudioBtn"] is True, st["hasAudioBtn"])
    check("跟读按钮可见", st["followBtn"] is True, st["followBtn"])
    # 字体字形探针：稀有字逐字与 .notdef 豆腐块比对像素
    glyph = ev("""(() => {
      const chars = ['羣','遶','呪','祕','臻','燼','囹','圄','歿','佞','跣','噎','裾','詣','慾','徧','竈','妬','囹圄'];
      const cv = document.createElement('canvas'); cv.width = 60; cv.height = 60;
      const cx = cv.getContext('2d');
      function ink(ch, font) {
        cx.clearRect(0,0,60,60); cx.fillStyle = '#000'; cx.font = font; cx.textBaseline = 'top';
        cx.fillText(ch, 2, 2);
        const d = cx.getImageData(0,0,60,60).data; let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return n;
      }
      const tofu = ink('\\uFFFF', '40px "JingSerif", serif');
      const res = {};
      chars.forEach(ch => { res[ch] = ink(ch, '40px "JingSerif", serif'); });
      return { tofu, res };
    })()""")
    print("字形探针:", json.dumps(glyph, ensure_ascii=False))
    bad = [c for c, n in glyph["res"].items() if n <= glyph["tofu"]]
    check("稀有字有字形(非豆腐)", not bad, bad)
    shot = cdp.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, "s39-reader-390.png"), "wb").write(base64.b64decode(shot["data"]))
    print("截图: s39-reader-390.png")
finally:
    chrome.terminate()
print("FAILS:", fails if fails else "none")
sys.exit(1 if fails else 0)

#!/usr/bin/env python3
"""v2.1.0 (6) 专项冒烟：相机认星「拍照合成」黑底修复。
根因：旧 captureCanvas 先 drawImage(video) 再调 drawScene，后者开头
clearRect 把实景帧整张擦掉 → JPEG 成品必然黑底（真机实证）。
本脚本用 canvas.captureStream 注入已知图案帧（左品红/右青＋中央白块）
替身 getUserMedia，走真实开启→注入姿态→合成全链，断言：
①合成图底图＝注入图案（品红＋青色像素占比 ≥0.5、非黑占比 ≥0.9）；
②合成图尺寸＝舞台 CSS 尺寸 ×dpr（与预览同几何、cover 口径一致）；
③星层在位（亮像素计数）；④注入纯黑帧时合成返回 null、点拍照只出
HUD 报错文案、不产图（toBlob 零调用）——绝不拿黑底交差；
⑤恢复图案后合成复常。截图与合成图存 v2106-shots/。
沙箱边界：无真实摄像头/传感器——视频源为注入的 canvas 流、姿态由
_injectPose 注入；真机（安卓 Chrome drawImage/ImageCapture 实际行为、
与真实夜空的贴合）须用户复验，本冒烟不覆盖。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2106-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v105 缓存名", "wuri-v105-20261024-v211" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("四件套：CSS ?v=105＋版本 v2.1.1", "css/style.css?v=105" in html and "v2.1.1" in html)
arjs = open(os.path.join(WWW, "js/sky-ar.js"), encoding="utf-8").read()
report("新合成管线在位（grabFrame/cover/死帧检测/keepBase）",
       all(x in arjs for x in ["ImageCapture", "grabFrame", "drawBaseCover", "frameAlive", "keepBase", "sx2_ar_snap_fail"]))
report("旧同步合成已退场（captureCanvas 不存）", "captureCanvas" not in arjs)
report("drawScene 预览路径仍清屏（keepBase 仅合成用）", "if (!keepBase) ctx.clearRect" in arjs)

STUB = r"""
(() => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d');
  window.__paintPattern = () => {
    x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 320, 480);
    x.fillStyle = '#00ffff'; x.fillRect(320, 0, 320, 480);
    x.fillStyle = '#ffffff'; x.fillRect(270, 190, 100, 100);
  };
  window.__paintBlack = () => { x.fillStyle = '#000000'; x.fillRect(0, 0, 640, 480); };
  window.__paintPattern();
  const stream = c.captureStream(30);
  const md = { getUserMedia: async () => stream };
  try { Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true }); }
  catch (e) { navigator.mediaDevices = md; }
  window.__toBlobCalls = 0;
  const _tb = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (...a) { window.__toBlobCalls++; return _tb.apply(this, a); };
})();
"""

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
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": STUB})

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
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    assert waitfor("!!window.WuriSkyAR && !!document.querySelector('#tabbar button[data-tab=\\\"tab-stars\\\"]')")
    ev("document.querySelector('#tabbar button[data-tab=\\\"tab-stars\\\"]').click(); true", 1.0)
    assert waitfor("!document.getElementById('sx-ar-fab').hidden")
    ev("document.getElementById('sx-ar-fab').click(); true", 0.5)
    assert waitfor("!!document.querySelector('#ar-panel [data-ar=\\\"start\\\"]')")
    ev("document.querySelector('#ar-panel [data-ar=\\\"start\\\"]').click(); true", 0.3)
    assert waitfor("window.WuriSkyAR._state().running")
    ev("window.WuriSkyAR._injectPose(0, 90, 0); true", 1.4)
    assert waitfor("window.WuriSkyAR._state().labels.length > 0")
    shot("ar-pattern-live")

    SAMPLE = """(async () => { const u = await window.WuriSkyAR._captureDataURL();
      if (!u) return null;
      const img = new Image(); await new Promise(r => { img.onload = r; img.src = u; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let mag = 0, cyn = 0, lit = 0, bright = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { const r = d[i], g = d[i+1], b = d[i+2]; n++;
        if (r > 170 && g < 110 && b > 170) mag++;
        if (r < 110 && g > 170 && b > 170) cyn++;
        if (Math.max(r, g, b) > 24) lit++;
        if (r > 225 && g > 215 && b > 190) bright++; }
      const st = document.getElementById('ar-stage');
      return { url: u, w: img.width, h: img.height, stageW: st.clientWidth, stageH: st.clientHeight,
               magFrac: mag / n, cynFrac: cyn / n, patFrac: (mag + cyn) / n,
               litFrac: lit / n, bright: bright }; })()"""
    cap = ev(SAMPLE)
    report("合成出图（图案帧）", bool(cap), cap)
    if cap:
        open(os.path.join(SHOTS, "composite.png"), "wb").write(base64.b64decode(cap["url"].split(",", 1)[1]))
        report("底图＝注入图案（品红＋青占比 ≥0.5）", cap["patFrac"] >= 0.5, cap)
        report("底图非黑占比 ≥0.9（实景真进来了）", cap["litFrac"] >= 0.9, cap)
        report("合成尺寸＝舞台×dpr（与预览同几何）",
               abs(cap["w"] - cap["stageW"] * 2) <= 2 and abs(cap["h"] - cap["stageH"] * 2) <= 2, cap)
        report("星层在位（亮像素 ≥20）", cap["bright"] >= 20, cap)

    # ---------- 黑帧：报错不产图 ----------
    ev("window.__paintBlack(); true", 0.6)
    dead = ev("(async () => await window.WuriSkyAR._captureDataURL())()")
    report("纯黑帧→合成返回 null（死帧被拦）", dead is None, dead)
    ev("window.__toBlobCalls = 0; true")
    ev("document.querySelector('.ar-bar [data-ar=\\\"snap\\\"]').click(); true", 1.6)
    hud = ev("document.getElementById('ar-hud').textContent")
    report("点拍照→HUD 出报错文案", hud and "没抓到" in hud, hud)
    report("报错时不产图（toBlob 零调用）", ev("window.__toBlobCalls") == 0, ev("window.__toBlobCalls"))

    # ---------- 恢复图案：合成复常 ----------
    ev("window.__paintPattern(); true", 0.6)
    cap2 = ev(SAMPLE)
    report("恢复图案后合成复常（图案占比 ≥0.5）", bool(cap2) and cap2["patFrac"] >= 0.5, cap2 and {k: cap2[k] for k in ("patFrac", "litFrac")})

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    logerr = [e for e in cdp.events if e.get("method") == "Log.entryAdded"
              and e.get("params", {}).get("entry", {}).get("level") == "error"]
    report("全程无 JS 异常", len(excs) == 0 and len(logerr) == 0, (excs + logerr)[:1])
finally:
    chrome.terminate()

fails = [n for n, ok in results if not ok]
print("\n== smoke-v2106: %d/%d PASS ==" % (len(results) - len(fails), len(results)))
if fails:
    print("FAIL:", fails); sys.exit(1)

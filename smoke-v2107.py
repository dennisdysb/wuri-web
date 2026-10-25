#!/usr/bin/env python3
"""v2.1.0 (7) 专项冒烟：相机认星 AR 页底部工具栏排版整顿。
现状（用户 vivo 真机截图）：.ar-bar 原为 flex 流式＋左内边距 62px（让位悬浮
返回钮），四钮「拍照/红光/对星归零/打开平面星图」挤成 3+1、第二行孤钮左
对齐。本批改为 2×2 等宽网格（与舞台同为 max-width:430 居中、格等宽等高、
间距 8 一致、钮高 44、文字居中 nowrap），平板 ≥768 工具栏上限 640 居中。
断言：①静态四件套 v103/(7)＋网格规则在位、旧流式规则退场；②390 日间与
412 夜间两档几何：工具栏与舞台同宽同左缘、四格成网格（列左缘/行顶对齐、
宽高差 ≤2px、横纵间距同为 8±1.5）、文字不溢出（scrollWidth≤clientWidth）、
四钮中心 elementFromPoint 命中自身；③CDP 真实坐标点击四钮功能不回归：
红光开关翻转、对星归零（先 _setCal(10,0) 再真点→偏移清零、极点回位）、
拍照走合成（toBlob 计数 ≥1）、打开平面星图（图表视图显示且最上层）。
截图存 v2107-shots/（390 日间全幅＋工具栏特写、412 夜间同）。
沙箱边界同前：视频源为 canvas.captureStream 注入图案帧、姿态注入；
真机手感须用户复验。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2107-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v108 缓存名", "wuri-v108-20261025-v211-3" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("四件套：CSS ?v=106＋版本 v2.1.1", "css/style.css?v=108" in html and "v2.1.1" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简繁 v2.1.1", i18n.count("v2.1.1") >= 2)
css = open(os.path.join(WWW, "css/style.css"), encoding="utf-8").read()
report("工具栏网格规则在位（2 列等宽＋钮高 44）",
       ".ar-bar{display:grid;grid-template-columns:1fr 1fr" in css and ".ar-bar .mini-btn{height:44px" in css)
report("旧流式工具栏退场（flex-wrap＋62px 让位）",
       "flex-wrap:wrap;padding:10px 2px 0 62px" not in css)
report("平板工具栏上限 640 居中在位", ".ar-bar{max-width:640px}" in css)

STUB = r"""
(() => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d');
  window.__paintPattern = () => {
    x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 320, 480);
    x.fillStyle = '#00ffff'; x.fillRect(320, 0, 320, 480);
    x.fillStyle = '#ffffff'; x.fillRect(270, 190, 100, 100);
  };
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

MEASURE = r"""(() => {
  const q = s => document.querySelector(s);
  const R = el => { const r = el.getBoundingClientRect();
    return {x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2}; };
  const btns = {};
  document.querySelectorAll('.ar-bar [data-ar]').forEach(b => {
    btns[b.dataset.ar] = Object.assign(R(b), {sw: b.scrollWidth, cw: b.clientWidth, txt: b.textContent});
  });
  const stage = R(q('#ar-stage')), bar = R(q('.ar-bar'));
  const top = {};
  for (const k in btns) { const e = document.elementFromPoint(btns[k].cx, btns[k].cy);
    top[k] = e ? (e.dataset && e.dataset.ar === k) : false; }
  return {btns, stage, bar, top};
})()"""

def check_grid(tag, m):
    b = m["btns"]
    need = ["snap", "red", "calreset", "tochart"]
    report(tag + " 四钮齐备", all(k in b and b[k]["txt"] for k in need), list(b.keys()))
    if not all(k in b for k in need): return
    s, r, c, t = b["snap"], b["red"], b["calreset"], b["tochart"]
    report(tag + " 工具栏与舞台同宽同左缘（差 ≤2px）",
           abs(m["bar"]["w"] - m["stage"]["w"]) <= 2 and abs(m["bar"]["x"] - m["stage"]["x"]) <= 2,
           (m["bar"], m["stage"]))
    report(tag + " 两列左缘对齐（差 ≤2px）",
           abs(s["x"] - c["x"]) <= 2 and abs(r["x"] - t["x"]) <= 2, (s["x"], c["x"], r["x"], t["x"]))
    report(tag + " 两行顶缘对齐（差 ≤2px）",
           abs(s["y"] - r["y"]) <= 2 and abs(c["y"] - t["y"]) <= 2, (s["y"], r["y"], c["y"], t["y"]))
    ws = [s["w"], r["w"], c["w"], t["w"]]; hs = [s["h"], r["h"], c["h"], t["h"]]
    report(tag + " 四格等宽（差 ≤2px）", max(ws) - min(ws) <= 2, ws)
    report(tag + " 四格等高 ≥40（差 ≤2px）", max(hs) - min(hs) <= 2 and min(hs) >= 40, hs)
    gh, gv = r["x"] - (s["x"] + s["w"]), c["y"] - (s["y"] + s["h"])
    report(tag + " 横纵间距一致（同为 8±1.5）", 6.5 <= gh <= 9.5 and 6.5 <= gv <= 9.5, (gh, gv))
    report(tag + " 四钮文字不溢出（scrollWidth ≤ clientWidth）",
           all(b[k]["sw"] <= b[k]["cw"] + 1 for k in need),
           {k: (b[k]["sw"], b[k]["cw"], b[k]["txt"]) for k in need})
    report(tag + " 四钮中心最上层命中自身", all(m["top"][k] for k in need), m["top"])

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

    def mouse(x, y):
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    def shot(name, clip=None):
        p = {"format": "png"}
        if clip: p["clip"] = clip
        r = cdp.call("Page.captureScreenshot", p)
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def open_ar():
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        assert waitfor("!!window.WuriSkyAR && !!document.querySelector('#tabbar button[data-tab=\\\"tab-stars\\\"]')")
        ev("document.querySelector('#tabbar button[data-tab=\\\"tab-stars\\\"]').click(); true", 1.0)
        assert waitfor("!document.getElementById('sx-ar-fab').hidden")
        ev("document.getElementById('sx-ar-fab').click(); true", 0.5)
        assert waitfor("!!document.querySelector('#ar-panel [data-ar=\\\"start\\\"]')")
        ev("document.querySelector('#ar-panel [data-ar=\\\"start\\\"]').click(); true", 0.3)
        assert waitfor("window.WuriSkyAR._state().running")
        ev("window.WuriSkyAR._injectPose(0, 90, 0); true", 1.2)
        assert waitfor("window.WuriSkyAR._state().labels.length > 0")

    # ---------- 390 日间 ----------
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    open_ar()
    m = ev(MEASURE)
    check_grid("[390日间]", m)
    shot("toolbar-day-390")
    bar = m["bar"]
    shot("toolbar-day-390-clip", {"x": bar["x"] - 6, "y": bar["y"] - 14, "width": bar["w"] + 12, "height": bar["h"] + 68, "scale": 2})

    b = m["btns"]
    # 红光：真点开/关
    mouse(b["red"]["cx"], b["red"]["cy"]); time.sleep(0.4)
    red_on = ev("document.getElementById('ar-stage').classList.contains('red') && document.querySelector('.ar-bar [data-ar=\\\"red\\\"]').classList.contains('on')")
    mouse(b["red"]["cx"], b["red"]["cy"]); time.sleep(0.4)
    red_off = ev("!document.getElementById('ar-stage').classList.contains('red')")
    report("[真点] 红光切换开→关", red_on and red_off, (red_on, red_off))
    # 对星归零：先注入偏移，再真点归零
    st0 = ev("window.WuriSkyAR._state()")
    pole0 = st0.get("polePoint") or {}
    ev("window.WuriSkyAR._setCal(10, 0); true", 0.5)
    st1 = ev("window.WuriSkyAR._state()")
    pole1 = st1.get("polePoint") or {}
    mouse(b["calreset"]["cx"], b["calreset"]["cy"]); time.sleep(0.5)
    st2 = ev("window.WuriSkyAR._state()")
    pole2 = st2.get("polePoint") or {}
    saved = ev("localStorage.getItem('wuri_sky_ar_cal_v1')") or ""
    report("[真点] 对星归零（偏移生效后清零、极点回位、存档 az:0）",
           pole1.get("x", 0) - pole0.get("x", 0) > 25 and abs(pole2.get("x", 0) - pole0.get("x", 999)) <= 3 and '"az":0' in saved,
           (pole0.get("x"), pole1.get("x"), pole2.get("x"), saved))
    # 拍照：真点走合成
    ev("window.__toBlobCalls = 0; true")
    mouse(b["snap"]["cx"], b["snap"]["cy"])
    ok_blob = waitfor("window.__toBlobCalls >= 1", timeout=12)
    report("[真点] 拍照走合成（toBlob ≥1）", ok_blob, ev("window.__toBlobCalls"))
    # 打开平面星图：真点 → 图表视图显示且最上层
    mouse(b["tochart"]["cx"], b["tochart"]["cy"]); time.sleep(1.0)
    chart_ok = ev("!document.getElementById('view-sky-chart').hidden && document.getElementById('view-sky-ar').hidden")
    top_el = ev("(() => { const e = document.elementFromPoint(innerWidth/2, innerHeight/2);"
                " return e ? (e.closest('#view-sky-chart') ? 'chart' : (e.id || e.className)) : null; })()")
    report("[真点] 打开平面星图（视图切换＋中心最上层）", chart_ok and top_el == "chart", (chart_ok, top_el))

    # ---------- 412 夜间 ----------
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    open_ar()
    ev("document.documentElement.setAttribute('data-theme','night'); true", 0.3)
    m2 = ev(MEASURE)
    check_grid("[412夜间]", m2)
    shot("toolbar-night-412")
    bar2 = m2["bar"]
    shot("toolbar-night-412-clip", {"x": bar2["x"] - 6, "y": bar2["y"] - 14, "width": bar2["w"] + 12, "height": bar2["h"] + 68, "scale": 2})

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    logerr = [e for e in cdp.events if e.get("method") == "Log.entryAdded" and e.get("params", {}).get("entry", {}).get("level") == "error"]
    report("全程无 JS 异常", len(excs) == 0 and len(logerr) == 0, (excs + logerr)[:1])
finally:
    chrome.terminate()

fails = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(fails), len(results)))
if fails: print("FAIL:", fails)
sys.exit(1 if fails else 0)

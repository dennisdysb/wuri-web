#!/usr/bin/env python3
"""v2.1.1 (4) 专项冒烟：包内数据双通道加载（fetch→XHR 兜底）。

真机报障（2026-10-25）：安卓原生版（file:///android_asset）星象页
「星官数据加载失败」——WebView 的 fetch 读 file:// 被现代 CORS 拦死，
旧 WebSettings 标志只放行 XHR（经文时间码走 XHR 一直正常即对照组）。
既有冒烟全在 --allow-file-access-from-files 的桌面 Chrome 下跑，
该标志恰好把 fetch 也放行了，故此 bug 一直漏检。本冒烟补上这一课：

环境模拟：file:// 直读本地树（XHR 靠 --allow-file-access-from-files
放行，与 WebView 开 AllowFileAccessFromFileURLs 同效），同时在页面
脚本运行前注入垫片——凡 fetch 到 data/*.json 一律 reject（模拟
WebView 行为），并给 XMLHttpRequest 打点记录 URL。

断言：
①fetch 对 data/ 确实被封杀（垫片自检，否则全场断言无意义）；
②XHR 打点证明四份数据（xingguan/butiange/xingguan-lines/fenye）
  全部改走 XHR 通道；
③星象标签页图鉴首页渲染 287 官、无「加载失败」；
④区页（角宿）总览图 SVG 在位、星官组数与数据对账；
⑤今夜可见（sky-chart）与平面星图打开且渲染、无失败文案——
  两者与 stars 共用 WuriSky.starData 同一份结果；
⑥手动调 WuriSky.loadJSON 在 fetch 封杀下仍能取回 fenye（XHR 兜底）；
⑦无 JS 异常（window error / unhandledrejection 钩子）。
静态：四件套 v109/v2.1.1 (4)；三模块源码无 fetch('data/ 残留；
sky-engine 有 loadJSON/starData/XMLHttpRequest。
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2114-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v109 缓存名", "wuri-v109-20261025-v211-4" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("四件套：CSS ?v=109＋版本 v2.1.1 (4)", "css/style.css?v=109" in html and "v2.1.1 (4)" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简繁 v2.1.1 (4)", i18n.count("v2.1.1 (4)") >= 2)
eng = open(os.path.join(WWW, "js/sky-engine.js"), encoding="utf-8").read()
report("sky-engine 双通道助手在位", "function loadJSON" in eng and "function starData" in eng
       and "XMLHttpRequest" in eng and "starData: starData" in eng)
for fn in ("stars.js", "sky-chart.js", "sky-ar.js"):
    src = open(os.path.join(WWW, "js", fn), encoding="utf-8").read()
    report(fn + " 无 fetch 直读包内 data", "fetch('data/" not in src and 'fetch("data/' not in src)
sjs = open(os.path.join(WWW, "js/stars.js"), encoding="utf-8").read()
report("stars.js 走 loadJSON/starData", "loadJSON('data/butiange.json')" in sjs
       and "loadJSON('data/fenye.json')" in sjs and "starData()" in sjs)
cjs = open(os.path.join(WWW, "js/sky-chart.js"), encoding="utf-8").read()
ajs = open(os.path.join(WWW, "js/sky-ar.js"), encoding="utf-8").read()
report("星图/AR 走共享 starData", "SKY.starData()" in cjs and "SKY.starData()" in ajs)

XG = json.load(open(os.path.join(WWW, "data/xingguan.json"), encoding="utf-8"))
def sec_groups(sec):
    n = 0
    for a in XG["asterisms"]:
        if a["section"] != sec: continue
        if [s for s in (a.get("stars") or []) if isinstance(s.get("ra_deg"), (int, float))]: n += 1
    return n

INJECT = r"""
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push('error: ' + (e.message || e.type)); });
window.addEventListener('unhandledrejection', function (e) { window.__errs.push('rejection: ' + (e.reason && (e.reason.message || e.reason))); });
window.__fetchBlocked = [];
(function () {
  var of = window.fetch;
  window.fetch = function (u) {
    var s = String(u && u.url ? u.url : u);
    if (s.indexOf('data/') >= 0 && s.indexOf('.json') >= 0) {
      window.__fetchBlocked.push(s);
      return Promise.reject(new TypeError('fetch blocked: simulated WebView file:// CORS'));
    }
    return of.apply(this, arguments);
  };
  window.__xhrLog = [];
  var oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    window.__xhrLog.push(String(u));
    return oo.apply(this, arguments);
  };
})();
true;
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
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": INJECT})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)

    # ① 垫片自检：fetch 读 data/ 必须被拒
    r = ev("""(async () => {
      let fetchState = 'ok';
      try { await fetch('data/fenye.json'); } catch (e) { fetchState = 'blocked'; }
      return { fetchState, blockedN: (window.__fetchBlocked || []).length };
    })()""", 0.3)
    report("环境自检：fetch 读 data/ 被封杀", r["fetchState"] == "blocked" and r["blockedN"] >= 1, r)

    # 打开星象标签页，等图鉴首页
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 0.5)
    home_ok = False
    for _ in range(40):
        if ev("!!document.querySelector('#sx-home .sx-yuan-name')"): home_ok = True; break
        time.sleep(0.5)
    r = ev("""(() => { const h = document.getElementById('sx-home');
      return { txt: h ? h.textContent : '', xhr: window.__xhrLog || [] }; })()""")
    report("星象图鉴首页渲染（287 官）", home_ok and "287 星官" in r["txt"], r["txt"][:160])
    report("无「加载失败」文案", "加载失败" not in r["txt"], r["txt"][:160])
    need = ["data/xingguan.json", "data/butiange.json", "data/xingguan-lines.json", "data/fenye.json"]
    got = [u for u in r["xhr"] if any(n in u for n in need)]
    report("四份数据全走 XHR 通道", all(any(n in u for u in r["xhr"]) for n in need), r["xhr"])
    shot("stars-home-xhr-390")

    # ⑥ loadJSON 在 fetch 封杀下走 XHR 兜底
    r = ev("""(async () => {
      const j = await window.WuriSky.loadJSON('data/fenye.json');
      return { ok: !!j && typeof j === 'object', keys: j ? Object.keys(j).length : 0 };
    })()""", 0.3)
    report("WuriSky.loadJSON fetch 封杀下 XHR 兜底成功", r["ok"] and r["keys"] > 0, r)

    # ④ 区页总览图（角宿）
    ev("window.Stars.openRegion(%s); true" % json.dumps("角宿"), 1.0)
    r = ev("""(() => { const svg = document.querySelector('#sx-region svg.sx-rmap');
      const view = document.getElementById('view-star-region');
      return { has: !!svg, vis: !!view && !view.hidden,
               groups: svg ? svg.querySelectorAll('g.sx-rmap-g').length : 0,
               fail: (document.getElementById('sx-region') || {}).textContent || '' }; })()""")
    report("角宿区页总览图渲染（XHR 数据）", r["has"] and r["vis"] and r["groups"] == sec_groups("角宿")
           and "加载失败" not in r["fail"], r)
    ev("document.getElementById('star-region-back').click(); true", 0.8)

    # ⑤ 今夜可见（sky-chart 共享数据）
    ev("window.WuriSkyChart.openTonight(); true", 1.2)
    r = ev("""(() => { const el = document.getElementById('sx-tonight');
      const view = document.getElementById('view-sky-tonight');
      return { vis: !!view && !view.hidden, txt: el ? el.textContent : '',
               rows: el ? el.querySelectorAll('.tn-row, .sx-tn-row, li, .tn-item').length : 0 }; })()""")
    report("今夜可见打开且无失败文案", r["vis"] and "加载失败" not in r["txt"] and len(r["txt"]) > 30, r["txt"][:160])
    shot("tonight-xhr-390")
    ev("document.getElementById('sky-tonight-back').click(); true", 0.8)

    # ⑤ 平面星图
    ev("window.WuriSkyChart.openChart(); true", 1.5)
    r = ev("""(() => { const el = document.getElementById('sx-chart');
      const view = document.getElementById('view-sky-chart');
      return { vis: !!view && !view.hidden,
               circles: el ? el.querySelectorAll('circle').length : 0,
               txt: el ? el.textContent : '' }; })()""")
    report("平面星图渲染（星点在位）", r["vis"] and r["circles"] > 50 and "加载失败" not in r["txt"],
           {"circles": r["circles"], "txt": r["txt"][:120]})
    shot("chart-xhr-390")

    # ⑦ JS 异常（滤掉沙箱已知的媒体/网络类噪音，只认脚本错误）
    errs = ev("window.__errs || []")
    bad = [e for e in errs if "fetch blocked" not in e]
    report("无 JS 异常", len(bad) == 0, bad[:5])
finally:
    chrome.terminate()

n_ok = sum(1 for _, ok in results if ok)
print("== smoke-v2114: %d/%d ==" % (n_ok, len(results)))
sys.exit(0 if n_ok == len(results) else 1)

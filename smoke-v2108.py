#!/usr/bin/env python3
"""v2.1.0 (8) 专项冒烟：悬浮返回键两处处置（星图页撤除／AR 页改快门进框）。
背景一（用户真机截图）：平面星图页左下绿色圆形悬浮返回键压在控制区上——
挡住时间播放钮一角、蹭最暗星等滑杆行首；而星图页顶部本有正式「‹ 返回」，
该键纯属重复 → 本批把 view-sky-chart 内的那枚 .jing-back-fab 直接摘除（每
个子视图各有自己的一枚、作用域限于本视图，其他视图一律不动）。
背景二（用户 AR 真机）：AR 页的悬浮返回键悬在舞台框外左下、压工具栏
「拍照」钮左上角 → 改为舞台内快门钮：由 sky-ar.js 的 shellHTML 在舞台内
生成 .ar-shutter（data-ar="snap"，与工具栏拍照钮同走宿主委托 → 同一
snap() 合成流程），锚定舞台内侧左下 15px、整钮在框内；开启/回落面板
在场时由 setPanel 联动藏起。样式按追加口径做低亮度夜间款（用户夜间真机
指出旧悬浮键是整块淡金近白实心盘、夜景里最亮、毁暗适应）：深色毛玻璃底
＋HUD 同族淡金细环＋内圈描边不填实；红光模式转暗红调。
断言：①静态四件套 v104/(8)＋两视图 fab 摘净、他视图 fab 仍在、快门规则
在位；②星图页：视图内 fab 数为 0、播放钮/时间滑杆/星等滑杆中心
elementFromPoint 命中自身、旧悬浮键原位置（左 46, 下 118）命中星图视图
内元素而非悬浮键、真点播放开→关、真点顶部返回退出、今夜页 fab 仍在；
③AR：快门包围盒 ⊆ 舞台（左/下偏移 15±3）、中心命中自身、底色相对亮度
<0.25、内圈不填实、真点快门走合成（toBlob ≥1）；夜间＋红光：舞台 .red、
快门边框红调主导、底色仍低亮；真点顶部返回退出 AR。截图存 v2108-shots/
（星图控制区 390、AR 日间 390、AR 夜间红光 390）。
沙箱边界同前：视频源为 canvas.captureStream 注入图案帧、姿态注入；
真机观感（暗适应亮度量级）须用户复验。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2108-shots")
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
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简繁 v2.1.1", i18n.count("v2.1.1") >= 2)

def view_section(vid, nxt):
    a = html.index('id="%s"' % vid)
    b = html.index('id="%s"' % nxt, a) if nxt else len(html)
    return html[a:b]
chart_sec = view_section("view-sky-chart", "view-sky-ar")
ar_sec = view_section("view-sky-ar", "view-star-detail")
tonight_sec = view_section("view-sky-tonight", "view-sky-chart")
report("星图视图内悬浮返回键已摘除", "jing-back-fab" not in chart_sec and "sky-chart-back').click()" not in html)
report("AR 视图内悬浮返回键已摘除", "jing-back-fab" not in ar_sec and "sky-ar-back').click()" not in html)
report("其他视图悬浮键仍在（今夜/星官详情）",
       "jing-back-fab" in tonight_sec and "jing-back-fab" in view_section("view-star-detail", None))
report("两视图顶部正式返回钮仍在", 'id="sky-chart-back"' in chart_sec and 'id="sky-ar-back"' in ar_sec)
arjs = open(os.path.join(WWW, "js/sky-ar.js"), encoding="utf-8").read()
report("快门钮在舞台模板内（data-ar=snap 与工具栏同委托）",
       'class="ar-shutter" id="ar-shutter" data-ar="snap"' in arjs and arjs.count('data-ar="snap"') >= 2)
report("快门显隐与面板联动（setPanel）", "sh.hidden = !!kind" in arjs)
css = open(os.path.join(WWW, "css/style.css"), encoding="utf-8").read()
report("快门低亮样式在位（深色玻璃底＋细环＋红光变调）",
       ".ar-shutter{position:absolute;left:15px;bottom:15px" in css and "rgba(10,14,20,.45)" in css
       and ".ar-stage.red .ar-shutter{" in css)

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

LUM = r"""(col) => { const m = /rgba?\(([^)]+)\)/.exec(col || '');
  if (!m) return -1; const p = m[1].split(',').map(Number);
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); }"""

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

    def nav_stars():
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        # 等 JS 引导完成再点标签：按钮在静态 HTML 里先于 app.js 就绪，过早点会让
        # stars.js 的委托先行注入入口、而 app.js 的 active 类没跟上（实测竞态：
        # entries 已出但按钮无 active → 悬浮相机钮同步不到、保持隐藏）
        assert waitfor("!!window.WuriSkyAR && !!window.WuriSkyChart && !!document.querySelector('[data-tab=\\\"tab-stars\\\"]')")
        ev("document.querySelector('[data-tab=\\\"tab-stars\\\"]').click(); true", 1.0)
        assert waitfor("document.querySelectorAll('#sx2-entries .sx-entry').length === 2"
                       " && document.querySelector('[data-tab=\\\"tab-stars\\\"]').classList.contains('active')")

    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})

    # ---------- 平面星图：悬浮键消失、控制区可点 ----------
    nav_stars()
    ev("document.querySelector('[data-sx2=\\\"chart\\\"]').click(); true", 0.3)
    assert waitfor("document.querySelectorAll('#sk-chart-svg path.sk-line').length >= 100", timeout=30)
    report("星图页已打开", ev("!document.getElementById('view-sky-chart').hidden"))
    report("运行时星图视图内悬浮键数 = 0",
           ev("document.querySelectorAll('#view-sky-chart .jing-back-fab').length") == 0)
    ev("document.getElementById('sk-play').scrollIntoView({block:'center'}); true", 0.6)
    ctl = ev("""(() => { const R = el => { const r = el.getBoundingClientRect();
        return {x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2}; };
      const play = R(document.getElementById('sk-play')), mag = R(document.getElementById('sk-mag')),
            tim = R(document.getElementById('sk-time'));
      const hit = o => { const e = document.elementFromPoint(o.cx, o.cy); return e ? e.id : 'none'; };
      const oldSpot = document.elementFromPoint(46, innerHeight - 118);
      return {play, mag, tim, hitPlay: hit(play), hitMag: hit(mag), hitTim: hit(tim),
              oldSpotFab: !!(oldSpot && oldSpot.closest && oldSpot.closest('.jing-back-fab')),
              oldSpotInChart: !!(oldSpot && oldSpot.closest && oldSpot.closest('#view-sky-chart'))}; })()""")
    report("播放钮中心命中自身", ctl["hitPlay"] == "sk-play", ctl)
    report("星等滑杆中心命中自身", ctl["hitMag"] == "sk-mag", ctl)
    report("时间滑杆中心命中自身", ctl["hitTim"] == "sk-time", ctl)
    report("旧悬浮键原位置（左46/下118）不再是悬浮键、且属星图视图",
           ctl["oldSpotFab"] is False and ctl["oldSpotInChart"] is True, ctl)
    shot("chart-390")
    mouse(ctl["play"]["cx"], ctl["play"]["cy"]); time.sleep(0.5)
    p_on = ev("window.WuriSkyChart.state().playing")
    bb = ev("(() => { const r = document.getElementById('sk-play').getBoundingClientRect(); return {cx: r.x + r.width/2, cy: r.y + r.height/2}; })()")
    mouse(bb["cx"], bb["cy"]); time.sleep(0.5)
    report("[真点] 播放钮开→关不回归", p_on is True and ev("window.WuriSkyChart.state().playing") is False, p_on)
    ev("document.getElementById('sky-chart-back').scrollIntoView({block:'center'}); true", 0.4)
    bk = ev("(() => { const r = document.getElementById('sky-chart-back').getBoundingClientRect(); return {cx: r.x + r.width/2, cy: r.y + r.height/2}; })()")
    mouse(bk["cx"], bk["cy"]); time.sleep(0.6)
    report("[真点] 星图顶部返回退出", ev("document.getElementById('view-sky-chart').hidden") is True)

    # ---------- 今夜可见：悬浮键照常 ----------
    ev("document.querySelector('[data-sx2=\\\"tonight\\\"]').click(); true", 0.3)
    assert waitfor("!document.getElementById('view-sky-tonight').hidden")
    fab_t = ev("(() => { const f = document.querySelector('#view-sky-tonight .jing-back-fab');"
               " return f ? getComputedStyle(f).display : 'missing'; })()")
    report("今夜页悬浮返回键仍在且显示", fab_t == "block", fab_t)
    ev("document.getElementById('sky-tonight-back').click(); true", 0.5)

    # ---------- AR：快门进框 ----------
    nav_stars()
    assert waitfor("!document.getElementById('sx-ar-fab').hidden")
    ev("document.getElementById('sx-ar-fab').click(); true", 0.5)
    assert waitfor("!!document.querySelector('#ar-panel [data-ar=\\\"start\\\"]')")
    sh_panel = ev("(() => { const s = document.getElementById('ar-shutter'); return s ? s.hidden : 'missing'; })()")
    report("开启面板在场时快门藏起", sh_panel is True, sh_panel)
    ev("document.querySelector('#ar-panel [data-ar=\\\"start\\\"]').click(); true", 0.3)
    assert waitfor("window.WuriSkyAR._state().running")
    ev("window.WuriSkyAR._injectPose(0, 90, 0); true", 1.2)
    assert waitfor("window.WuriSkyAR._state().labels.length > 0")
    geo = ev("""(() => { const R = el => { const r = el.getBoundingClientRect();
        return {x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2,
                r: r.right, b: r.bottom}; };
      const st = R(document.getElementById('ar-stage')), sh = R(document.getElementById('ar-shutter'));
      const e = document.elementFromPoint(sh.cx, sh.cy);
      const cs = getComputedStyle(document.getElementById('ar-shutter'));
      const ca = getComputedStyle(document.getElementById('ar-shutter'), '::after');
      const lum = %s;
      return {st, sh, hitShutter: e === document.getElementById('ar-shutter'),
              bg: cs.backgroundColor, bgLum: lum(cs.backgroundColor),
              afterBg: ca.backgroundColor, hidden: document.getElementById('ar-shutter').hidden}; })()""" % LUM)
    report("快门整钮在舞台框内（包围盒 ⊆ 舞台）",
           geo["sh"]["x"] >= geo["st"]["x"] - 1 and geo["sh"]["r"] <= geo["st"]["r"] + 1
           and geo["sh"]["y"] >= geo["st"]["y"] - 1 and geo["sh"]["b"] <= geo["st"]["b"] + 1, geo)
    report("快门锚左下（距左/下缘 15±3）",
           abs(geo["sh"]["x"] - geo["st"]["x"] - 15) <= 3 and abs(geo["st"]["b"] - geo["sh"]["b"] - 15) <= 3,
           (geo["sh"]["x"] - geo["st"]["x"], geo["st"]["b"] - geo["sh"]["b"]))
    report("快门中心最上层命中自身", geo["hitShutter"] is True, geo)
    report("快门运行中可见", geo["hidden"] is False)
    report("快门底色低亮（相对亮度 <0.25）", 0 <= geo["bgLum"] < 0.25, (geo["bg"], geo["bgLum"]))
    report("快门内圈不填实（::after 背景透明）", geo["afterBg"] in ("rgba(0, 0, 0, 0)", "transparent"), geo["afterBg"])
    shot("ar-day-390")
    ev("window.__toBlobCalls = 0; true")
    mouse(geo["sh"]["cx"], geo["sh"]["cy"])
    ok_blob = waitfor("window.__toBlobCalls >= 1", timeout=12)
    report("[真点] 快门触发合成（toBlob ≥1，与工具栏拍照同流程）", ok_blob, ev("window.__toBlobCalls"))

    # ---------- 夜间＋红光 ----------
    ev("document.documentElement.setAttribute('data-theme','night'); true", 0.3)
    rb = ev("(() => { const r = document.querySelector('.ar-bar [data-ar=\\\"red\\\"]').getBoundingClientRect();"
            " return {cx: r.x + r.width/2, cy: r.y + r.height/2}; })()")
    mouse(rb["cx"], rb["cy"]); time.sleep(0.5)
    red = ev("""(() => { const sh = document.getElementById('ar-shutter');
      const cs = getComputedStyle(sh);
      const parse = c => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ''); return m ? m[1].split(',').map(Number) : null; };
      const lum = %s;
      return {stageRed: document.getElementById('ar-stage').classList.contains('red'),
              border: cs.borderTopColor, bp: parse(cs.borderTopColor),
              bg: cs.backgroundColor, bgLum: lum(cs.backgroundColor),
              disp: cs.display, inStage: (() => { const a = sh.getBoundingClientRect(), b = document.getElementById('ar-stage').getBoundingClientRect();
                return a.left >= b.left - 1 && a.bottom <= b.bottom + 1; })()}; })()""" % LUM)
    report("红光模式已开（舞台 .red）", red["stageRed"] is True)
    report("红光下快门呈红调（边框 R 主导）",
           red["bp"] and red["bp"][0] > red["bp"][1] + 40 and red["bp"][0] > red["bp"][2] + 40, red["border"])
    report("红光下快门底色仍低亮（<0.25）", 0 <= red["bgLum"] < 0.25, (red["bg"], red["bgLum"]))
    report("红光下快门仍可见且在框内", red["disp"] == "block" and red["inStage"] is True, red)
    shot("ar-night-390")
    ev("document.getElementById('sky-ar-back').scrollIntoView({block:'center'}); true", 0.4)
    bk2 = ev("(() => { const r = document.getElementById('sky-ar-back').getBoundingClientRect(); return {cx: r.x + r.width/2, cy: r.y + r.height/2}; })()")
    mouse(bk2["cx"], bk2["cy"]); time.sleep(0.6)
    report("[真点] AR 顶部返回退出", ev("document.getElementById('view-sky-ar').hidden") is True)

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    logerr = [e for e in cdp.events if e.get("method") == "Log.entryAdded" and e.get("params", {}).get("entry", {}).get("level") == "error"]
    report("全程无 JS 异常", len(excs) == 0 and len(logerr) == 0, (excs + logerr)[:1])
finally:
    chrome.terminate()

fails = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(fails), len(results)))
if fails: print("FAIL:", fails)
sys.exit(1 if fails else 0)

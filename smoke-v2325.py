#!/usr/bin/env python3
"""v2.3.0（SW v125）平面星图控制条小修专项冒烟（与 v124 互链同批跟发）。

用户真机报障：时间偏移读数未收尾浮点长串「+5.35964999999999905h」，把同一行
「播放」钮挤窄、钮字竖排。本批：①sky-chart.js 读数格式化（偏移小时两位小数
去尾零）；②CSS #sk-play{flex:none;white-space:nowrap}＋#sk-time-lab nowrap。

断言：
①版本四件套 v125；②源码层：格式化逻辑在位、CSS 防挤压规则在位；
③真交互（390）：星象页→平面星图→倍速 900×→真点播放→约 2.2 秒后读数断言：
  state.playing 且 offsetMin 已推进；#sk-time-lab 文案全串匹配短格式
  HH:MM (±X[.YY]h)、无三位以上小数；④布局：播放钮单行（高≤34、宽≥40、
  white-space=nowrap、elementFromPoint 命中本体）、控制条无横向溢出；
⑤截图存档；全程零 JS 异常。结果存 chartbar125-shots/。

同批第二项（用户报障：红光模式下底部全局导航栏 #tabbar 仍浅色、毁暗适应）：
⑥源码层：CSS 有 body.sky-red #tabbar 红谱重映射与 #toast 压红；
⑦真开关（星象页 #sky-red-toggle 真点）：日间开红光→底栏底色/文字/选中态
  断言红谱（R 主导、低亮）＋截图；夜间开红光→底栏仍红谱非中性黑＋截图；
⑧关红光（回日间）→底栏恢复浅底与黛青选中态。
"""
import importlib.util, json, os, re, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/chartbar125-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- ① 版本口径 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v125 缓存名＋CSS ?v=125 预缓存", "wuri-v125-20261025-v230" in sw and "style.css?v=125" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("CSS ?v=125＋index 静态版本行 v125", "css/style.css?v=125" in html and "戊日不上香 v2.3.0（内部 v125）" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简繁 v125", "（内部 v125）" in i18n and "（內部 v125）" in i18n)
report("显示版本仍 v2.3.0", "v2.3.1" not in i18n)

# ---------- ② 源码层 ----------
chart_js = open(os.path.join(WWW, "js/sky-chart.js"), encoding="utf-8").read()
report("读数格式化逻辑在位（两位小数去尾零）",
       "toFixed(2).replace(/\\.?0+$/, '')" in chart_js and "chart.offsetMin / 60 + 'h'" not in chart_js)
css = open(os.path.join(WWW, "css/style.css"), encoding="utf-8").read()
report("CSS 防挤压：#sk-play flex:none＋nowrap、#sk-time-lab nowrap",
       "#sk-play{flex:none;white-space:nowrap}" in css and "#sk-time-lab{flex:none;min-width:86px;text-align:right;color:var(--ink);white-space:nowrap}" in css)
report("CSS 红光跟随：body.sky-red #tabbar 红谱重映射＋#toast 压红",
       "body.sky-red #tabbar{" in css and "body.sky-red #tabbar button.active{color:#eda88f}" in css
       and "body.sky-red #toast{background:rgba(26,8,6,.92);color:#f2c1b2}" in css)

# ---------- 浏览器 ----------
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
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source":
        "window.__errs=[]; addEventListener('error', e=>window.__errs.push(String(e.message||e.error)));"
        " addEventListener('unhandledrejection', e=>window.__errs.push('rej:'+String(e.reason)));"})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def mouse(x, y):
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    def locate(sel):
        ev("""(() => { const e = document.querySelector(%s);
          if (e) e.scrollIntoView({block:'center'}); return !!e; })()""" % json.dumps(sel), 0.35)
        return ev("""(() => { const e = document.querySelector(%s);
          if (!e) return null; const r = e.getBoundingClientRect();
          return {x: r.left + r.width/2, y: r.top + r.height/2}; })()""" % json.dumps(sel))

    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    time.sleep(2.5)
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 1.2)
    ev("document.querySelector('[data-sx2=\"chart\"]').click(); true", 0.3)
    ok = False
    for _ in range(60):
        if ev("document.querySelectorAll('#sk-chart-svg path.sk-line').length") >= 100: ok = True; break
        time.sleep(0.5)
    report("平面星图渲染（连线 ≥100）", ok)

    # 900× 播放
    ev("document.getElementById('sk-speed').value = '900'; document.getElementById('sk-speed').dispatchEvent(new Event('change', {bubbles: true})); true")
    box = locate('#sk-play')
    if box: mouse(box["x"], box["y"])
    time.sleep(2.2)
    st = ev("window.WuriSkyChart.state()")
    report("900× 播放中且偏移已推进（>5 分钟）", st and st["playing"] and st["offsetMin"] > 5, st)
    lab = ev("document.getElementById('sk-time-lab').textContent")
    report("偏移读数短格式 HH:MM (±X[.YY]h)",
           bool(lab) and bool(re.fullmatch(r"\d{2}:\d{2} \([+-]\d+(\.\d{1,2})?h\)", lab)), lab)
    report("读数无三位以上小数长串", bool(lab) and not re.search(r"\.\d{3,}", lab), lab)

    geo = ev("""(() => { const b = document.getElementById('sk-play');
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      const ctl = b.closest('.sk-controls');
      return { w: r.width, h: r.height, ws: getComputedStyle(b).whiteSpace,
        txt: b.textContent, hit: !!hit && (hit === b || b.contains(hit)),
        overflow: ctl.scrollWidth <= ctl.clientWidth + 1 }; })()""")
    report("播放钮单行不竖排（高≤34、宽≥40、nowrap、命中本体、无溢出）",
           geo and geo["h"] <= 34 and geo["w"] >= 40 and geo["ws"] == "nowrap" and geo["hit"] and geo["overflow"], geo)
    report("播放钮文案为暂停（播放态）", geo and geo["txt"].strip() == "暂停", geo)
    shot("chart-controls-900x-390")
    ev("document.getElementById('sk-play').click(); true", 0.3)

    # ---------- 红光模式：全局底栏跟随 ----------
    def tabbar_colors():
        return ev("""(() => { const tb = document.getElementById('tabbar');
          const cs = getComputedStyle(tb);
          const act = tb.querySelector('button.active');
          const ina = tb.querySelector('button:not(.active)');
          const parse = s => { let m = s.match(/[\\d.]+/g).map(Number);
            if (s.indexOf('color(') === 0) m = m.map(v => Math.round(v * 255));
            return {r:m[0], g:m[1], b:m[2]}; };
          return { bg: parse(cs.backgroundColor),
                   act: act ? parse(getComputedStyle(act).color) : null,
                   ina: ina ? parse(getComputedStyle(ina).color) : null,
                   red: document.body.classList.contains('sky-red') }; })()""")

    def is_red(c, bright=False):
        # 文字红：R 通道显著主导；底色近黑时通道差天然小，另用 bg_red
        if not c: return False
        return c["r"] > c["g"] + 18 and c["r"] > c["b"] + 18 and (c["r"] > 140 if bright else True)

    def bg_red(c):
        return bool(c) and c["r"] < 90 and c["r"] > c["g"] + 3 and c["r"] > c["b"] + 3

    ev("document.getElementById('sky-chart-back').click(); true", 0.8)
    tbox = locate('#sky-red-toggle')
    if tbox: mouse(tbox["x"], tbox["y"])
    time.sleep(0.6)
    tc = tabbar_colors()
    report("红光开（日间）：body 类在位＋底栏底色红谱低亮",
           tc and tc["red"] and bg_red(tc["bg"]), tc)
    report("红光开（日间）：底栏选中态亮红、未选态暗红",
           tc and is_red(tc["act"], bright=True) and is_red(tc["ina"]), tc)
    shot("red-tabbar-390-day")
    ev("document.documentElement.setAttribute('data-theme','night'); document.body.setAttribute('data-theme','night'); true", 0.4)
    tc = tabbar_colors()
    report("红光开（夜间）：底栏仍红谱（非中性黑）", tc and tc["red"] and bg_red(tc["bg"]) and is_red(tc["act"], bright=True), tc)
    shot("red-tabbar-390-night")
    ev("document.documentElement.removeAttribute('data-theme'); document.body.removeAttribute('data-theme'); true", 0.3)
    ev("window.WuriRedlight.set(false); true", 0.4)
    tc = tabbar_colors()
    report("红光关：底栏恢复浅底＋非红选中态",
           tc and not tc["red"] and tc["bg"]["r"] > 200 and not is_red(tc["act"], bright=True), tc)

    errs = ev("window.__errs || []")
    report("全程零 JS 异常", errs == [], errs)
finally:
    chrome.terminate()

n_ok = sum(1 for _, ok in results if ok)
line = "TOTAL %d/%d" % (n_ok, len(results))
print(line)
open(os.path.join(SHOTS, "smoke-v2325-results.txt"), "w", encoding="utf-8").write(
    "\n".join(("PASS " if ok else "FAIL ") + n for n, ok in results) + "\n" + line + "\n")
sys.exit(0 if n_ok == len(results) else 1)

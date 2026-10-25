#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.1.0 (9) 专项冒烟：星象模块全红光模式
一个总开关（localStorage wuri_sky_redlight_v1）、两入口（星象页页首＋设置页）同步、AR 红光共用同一状态；
开启后星象子视图整体红谱低亮（变量重映射＋img/svg 红处理滤镜、无亮盘），非星象模块不受影响。
断言：①静态（四件套 v105/v211、CSS body.sky-red 规则＋滤镜、WuriRedlight、i18n 简繁键、两开关在位、AR setRed 导出）
②运行时：星象页开关真点→body.sky-red＋LS=1＋设置开关同步 checked；采样色（卡面底低亮红谱、题字 R 主导、
悬浮相机钮暗红低亮、已勾选开关底为暗红）；星君图滤镜在位；星图 svg 滤镜在位＋底低亮；星官详情底红谱（截图）；
AR 联动（红开进 AR→stage.red 在位＋红光钮 .on；AR 内点红光钮→全模块同步关）；设置页开关开→刷新保持；
非星象（首页卡面日间仍为浅色）。截图 stars-red/chart-red/detail-red 390 存 v2109-shots/。
跑法：python3 smoke-v2109.py
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64 as b64mod
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
CDP = base.CDP

ROOT = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(ROOT, "www")
SHOTS = os.path.join(ROOT, "v2109-shots")
os.makedirs(SHOTS, exist_ok=True)
RES = []
def ok(name, cond, extra=""):
    RES.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

def read(p):
    with open(os.path.join(WWW, p), encoding="utf-8") as f: return f.read()

# ---------- 静态 ----------
idx, css, i18n, sw = read("index.html"), read("css/style.css"), read("js/i18n.js"), read("sw.js")
stars_js, ar_js = read("js/stars.js"), read("js/sky-ar.js")
ok("静态 四件套 v105/v211", "wuri-v105-20261024-v211" in sw and "css/style.css?v=105" in idx
   and i18n.count("v2.1.1") >= 2 and 'id="sky-red-toggle"' in idx and 'id="sky-red-toggle-me"' in idx)
ok("静态 CSS 红光作用域（变量重映射＋滤镜＋悬浮钮/横幅覆盖＋页首行样式）",
   "body.sky-red #tab-stars" in css and "--cinnabar:#e0563a" in css
   and "body.sky-red #tab-stars img" in css and "hue-rotate(-52deg)" in css
   and "body.sky-red #sx-ar-fab" in css and "body.sky-red .sx-band" in css and ".sx-red-row{" in css)
ok("静态 WuriRedlight 状态模块（键＋两入口监听＋AR 同步调用）",
   "wuri_sky_redlight_v1" in stars_js and "window.WuriRedlight" in stars_js
   and "WuriSkyAR.setRed" in stars_js and "sky-red-toggle-me" in stars_js)
ok("静态 AR 联动（setRed 导出＋open 同步＋红光钮走总开关）",
   "setRed: function" in ar_js and "window.WuriRedlight.on()" in ar_js
   and "window.WuriRedlight.set(!cal.red)" in ar_js)
ok("静态 i18n 红光文案简繁齐", i18n.count("sx_redlight: '红光模式'") == 1 and i18n.count("sx_redlight: '紅光模式'") == 1
   and "夜里看星不毁暗适应" in i18n and "夜裡看星不毀暗適應" in i18n)

# ---------- 运行时 ----------
PORT = base.free_port()
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
    def waitfor(js, timeout=25.0, step=0.4):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if ev(js): return True
            except Exception: pass
            time.sleep(step)
        return False
    def mouse(x, y):
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    def real_click(sel):
        box = ev("(()=>{const el=document.querySelector(%s);if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()" % json.dumps(sel))
        if not box: return False
        time.sleep(0.25); mouse(box["x"], box["y"]); return True
    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        with open(os.path.join(SHOTS, name), "wb") as f: f.write(b64mod.b64decode(r["data"]))
    def parse_rgb(s):
        import re as _re
        m = _re.findall(r"[\d.]+", s or "")
        return tuple(float(x) for x in m[:3]) if len(m) >= 3 else (0, 0, 0)
    def lum(rgb):
        r, g, b = (c / 255.0 for c in rgb)
        f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    def nav_stars():
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        assert waitfor("!!window.WuriRedlight && !!window.WuriSkyAR && !!window.WuriSkyChart")
        ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 1.0)
        assert waitfor("document.querySelectorAll('#sx2-entries .sx-entry').length === 2"
                       " && document.querySelector('[data-tab=\"tab-stars\"]').classList.contains('active')")

    nav_stars()
    ok("运行时 初始红光关（body 无 sky-red＋星象开关未勾）",
       ev("!document.body.classList.contains('sky-red') && !document.getElementById('sky-red-toggle').checked"))

    # 真点星象页页首开关 → 开红光
    real_click('label.switch:has(#sky-red-toggle)')
    ok("运行时 星象页开关开红光（body 类＋LS=1＋设置开关同步勾）",
       waitfor("document.body.classList.contains('sky-red')")
       and ev("localStorage.getItem('wuri_sky_redlight_v1')") == "1"
       and ev("document.getElementById('sky-red-toggle-me').checked && document.getElementById('sky-red-toggle').checked"))
    time.sleep(0.7)  # .card/.switch 的 background 有 .2–.25s 过渡，等沉降后采样
    samp = ev("""(()=>{const cs=(el,p)=>el?getComputedStyle(el)[p]:'';
      const card=document.querySelector('#tab-stars .sx-sky');
      const kick=document.querySelector('#tab-stars .sx-sky .h1');
      const fab=document.getElementById('sx-ar-fab');
      const swsp=document.querySelector('#tab-stars .sx-red-row .switch span');
      const lord=document.getElementById('sx-sky-img');
      return {cardBg:cs(card,'backgroundColor'), kick:cs(kick,'color'),
        fabBg:cs(fab,'backgroundColor'), fabCol:cs(fab,'color'), swBg:cs(swsp,'backgroundColor'),
        lordFilter:cs(lord,'filter'), fabShown: !!fab && !fab.hidden};})()""")
    cbg, kickc = parse_rgb(samp["cardBg"]), parse_rgb(samp["kick"])
    fbg, fcol, swbg = parse_rgb(samp["fabBg"]), parse_rgb(samp["fabCol"]), parse_rgb(samp["swBg"])
    ok("运行时 红光采样（卡面底低亮红谱＋题字 R 主导）", lum(cbg) < 0.25 and cbg[0] > cbg[1] >= cbg[2] and kickc[0] > kickc[1] and kickc[0] - kickc[2] >= 40,
       "%s %s" % (samp["cardBg"], samp["kick"]))
    ok("运行时 悬浮相机钮红光下非亮盘（底低亮＋字红谱）", samp["fabShown"] and lum(fbg) < 0.25 and fcol[0] > fcol[1] > fcol[2], samp["fabBg"])
    ok("运行时 已勾选开关底为暗红（teal 变量重映射）", swbg[0] > swbg[1] and swbg[0] - swbg[2] >= 40 and lum(swbg) < 0.3, samp["swBg"])
    ok("运行时 星君图红处理滤镜在位", "sepia" in (samp["lordFilter"] or ""), samp["lordFilter"])
    time.sleep(0.4); shot("stars-red-390.png")

    # 今夜（红光下验根底）→ 回星象页 → 入口直达星图
    ev("document.querySelector('[data-sx2=\"tonight\"]').click(); true", 0.4)
    ok("运行时 进今夜可见", waitfor("!document.getElementById('view-sky-tonight').hidden"))
    time.sleep(0.5)
    tnbg = parse_rgb(ev("getComputedStyle(document.getElementById('view-sky-tonight')).backgroundColor"))
    ok("运行时 今夜可见底红谱低亮", lum(tnbg) < 0.25 and tnbg[0] > tnbg[1], str(tnbg))
    ev("(()=>{const b=document.getElementById('sky-tonight-back'); b.scrollIntoView(); b.click(); return true;})()")
    ok("运行时 回星象页", waitfor("document.getElementById('view-sky-tonight').hidden"))
    ev("document.querySelector('[data-sx2=\"chart\"]').click(); true", 0.4)
    ok("运行时 进平面星图", waitfor("!document.getElementById('view-sky-chart').hidden && !!document.querySelector('#view-sky-chart svg')"))
    ch = ev("""(()=>{const v=document.getElementById('view-sky-chart');const svg=v.querySelector('svg');
      return {bg:getComputedStyle(v).backgroundColor, f: svg?getComputedStyle(svg).filter:''};})()""")
    chbg = parse_rgb(ch["bg"])
    ok("运行时 星图红光（根底低亮红谱＋svg 红处理滤镜）", lum(chbg) < 0.25 and chbg[0] > chbg[1] and "sepia" in ch["f"], "%s %s" % (ch["bg"], ch["f"][:40]))
    time.sleep(0.4); shot("chart-red-390.png")
    ev("(()=>{const b=document.getElementById('sky-chart-back'); b.scrollIntoView(); b.click(); return true;})()")
    ok("运行时 星图返回星象页", waitfor("document.getElementById('view-sky-chart').hidden"))

    # 星官详情：星象页→区页→首行详情（红光截图）
    ok("运行时 进区页", real_click('#sx-home .sx-card.sx-yuan') and waitfor("!document.getElementById('view-star-region').hidden"))
    ok("运行时 打开一位星官详情", real_click('#view-star-region [data-sx-detail]') and waitfor("!document.getElementById('view-star-detail').hidden"))
    dtbg = parse_rgb(ev("getComputedStyle(document.getElementById('view-star-detail')).backgroundColor"))
    ok("运行时 星官详情底红谱低亮", lum(dtbg) < 0.25 and dtbg[0] > dtbg[1], str(dtbg))
    time.sleep(0.4); shot("detail-red-390.png")
    ev("(()=>{const b=document.querySelector('#view-star-detail .mini-btn'); if(b){b.scrollIntoView(); b.click();} return true;})()")
    waitfor("!document.getElementById('view-star-region').hidden")
    ev("(()=>{const b=document.getElementById('star-region-back'); if(b){b.scrollIntoView(); b.click();} return true;})()")
    waitfor("document.getElementById('view-star-region').hidden")

    # 非星象不受影响：首页卡面日间仍浅色
    ev("document.querySelector('[data-tab=\"tab-home\"]').click(); true", 0.6)
    ok("运行时 进首页", waitfor("document.querySelector('[data-tab=\"tab-home\"]').classList.contains('active')"))
    homebg = ev("(()=>{const cs=Array.from(document.querySelectorAll('#tab-home .card'));const c=cs.find(x=>getComputedStyle(x).backgroundColor!=='rgba(0, 0, 0, 0)');return c?getComputedStyle(c).backgroundColor:'';})()")
    ok("运行时 红光开时首页卡面仍浅色（非星象不受影响）", lum(parse_rgb(homebg)) > 0.5, homebg)

    # AR 联动：红光开进 AR 即红；AR 内点红光钮 → 全模块同步关
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 0.6)
    waitfor("document.querySelector('[data-tab=\"tab-stars\"]').classList.contains('active')")
    ev("window.WuriSkyAR.open(); true", 0.5)
    ok("运行时 进 AR（红光开）", waitfor("!!document.getElementById('ar-stage')"))
    arst = ev("""(()=>{const st=document.getElementById('ar-stage');
      const rb=document.querySelector('#sx-ar [data-ar="red"]');
      return {red: st.classList.contains('red'), on: rb.classList.contains('on')};})()""")
    ok("运行时 总开→进 AR 即红光（stage.red＋红光钮 .on）", arst["red"] and arst["on"], str(arst))
    real_click('#sx-ar [data-ar="red"]')
    ok("运行时 AR 内点红光钮→全模块同步关（body 类去＋LS=0＋星象开关未勾＋stage 去红）",
       waitfor("!document.body.classList.contains('sky-red')")
       and ev("localStorage.getItem('wuri_sky_redlight_v1')") == "0"
       and ev("!document.getElementById('sky-red-toggle').checked && !document.getElementById('ar-stage').classList.contains('red')"))
    ev("(()=>{const b=document.getElementById('sky-ar-back'); b.scrollIntoView(); b.click(); return true;})()")
    waitfor("document.getElementById('view-sky-ar').hidden")

    # 设置页入口开 → 刷新保持
    ev("document.querySelector('[data-tab=\"tab-me\"]').click(); true", 0.6)
    ok("运行时 进我的页", waitfor("document.querySelector('[data-tab=\"tab-me\"]').classList.contains('active')"))
    real_click('label.switch:has(#sky-red-toggle-me)')
    ok("运行时 设置页开关开红光（body 类＋星象开关同步）",
       waitfor("document.body.classList.contains('sky-red')") and ev("document.getElementById('sky-red-toggle').checked"))
    cdp.call("Page.reload")
    ok("运行时 刷新后红光保持（持久化＋两开关仍勾）",
       waitfor("!!window.WuriRedlight && document.body.classList.contains('sky-red')", 20)
       and ev("document.getElementById('sky-red-toggle').checked && document.getElementById('sky-red-toggle-me').checked"))
    ev("window.WuriRedlight.set(false); true")
    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    ok("运行时 全程无 JS 异常", not excs, str(excs[:1])[:200])
finally:
    try: chrome.kill()
    except Exception: pass

print("\n==== v2109 smoke %d/%d PASS ====" % (sum(RES), len(RES)))
sys.exit(0 if all(RES) and RES else 1)

#!/usr/bin/env python3
"""v2.3.0（SW v116）专项冒烟：步罡踏斗暂时隐藏（2026-10-25 用户定）。

口径：只是隐藏、不是删除——入口卡片保留在 DOM 但 hidden 不渲染；视图本体与
步序数据保留；开关在 js/bugang.js 的 BUGANG_ENABLED=false，open() 被开关挡回
（入口程序化点击与 window.Bugang.open() 直达都不开）。恢复＝改开关为 true。

断言：
①版本口径：SW wuri-v116／CSS ?v=116／显示版本仍 v2.3.0、关于页内部号 v116（简繁＋静态兜底）。
②静态隐藏态：index.html 入口卡带 hidden；bugang.js 含 BUGANG_ENABLED = false 与 open 守卫；
  CSS 有 #bugang-entry-card[hidden] 规则；视图本体 #bugang-view 与步序（贪狼/破军/二十一步文案）仍在。
③运行时：修行打卡页可达且打卡列表正常渲染；步罡入口卡不可见（hidden＋computed display:none）；
  程序化 click #bugang-open 后视图仍 hidden；window.Bugang.open() 直达仍 hidden；Bugang.enabled===false。
④全程零 JS 异常。
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- ① 版本口径 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v116 缓存名", "wuri-v116-20261025-v230" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("CSS ?v=116＋index 静态版本行内部号 v116",
       "css/style.css?v=116" in html and "戊日不上香 v2.3.0（内部 v116）" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简（内部 v116）＋繁（內部 v116）",
       "me_ver: '戊日不上香 v2.3.0（内部 v116）'" in i18n and "me_ver: '戊日不上香 v2.3.0（內部 v116）'" in i18n)

# ---------- ② 静态隐藏态 ----------
report("入口卡 HTML 带 hidden", '<section class="card" id="bugang-entry-card" hidden>' in html)
bg = open(os.path.join(WWW, "js/bugang.js"), encoding="utf-8").read()
report("开关 BUGANG_ENABLED = false 在位", "var BUGANG_ENABLED = false;" in bg)
report("open() 开关守卫在位", "if (!BUGANG_ENABLED) return;" in bg)
report("bind() 按开关控制卡片 hidden 在位", "card.hidden = !BUGANG_ENABLED" in bg)
css = open(os.path.join(WWW, "css/style.css"), encoding="utf-8").read()
report("CSS #bugang-entry-card[hidden] 规则在位", "#bugang-entry-card[hidden]{display:none}" in css)
report("视图本体保留（#bugang-view＋步序数据未删）",
       'id="bugang-view"' in html and "贪狼" in bg and "破军" in bg and "TOTAL" in bg)

# ---------- ③ 运行时 ----------
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

    cdp.call("Emulation.setDeviceMetricsOverride",
             {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    time.sleep(2.5)

    r = ev("""(() => {
      const card = document.getElementById('bugang-entry-card');
      const cs = card ? getComputedStyle(card) : null;
      return { exists: !!card, hidden: card ? card.hidden : null,
               display: cs ? cs.display : null,
               bugangEnabled: window.Bugang ? window.Bugang.enabled : 'no-Bugang',
               viewExists: !!document.getElementById('bugang-view') };
    })()""")
    report("运行时：入口卡在 DOM、hidden 生效、computed display:none",
           r["exists"] and r["hidden"] is True and r["display"] == "none", r)
    report("运行时：Bugang.enabled === false、视图本体在 DOM", r["bugangEnabled"] is False and r["viewExists"], r)

    # 进修行打卡页：卡片不可见、打卡列表照常
    ev("document.querySelector('#practice-enter').click(); true", 0.8)
    r = ev("""(() => {
      const pv = document.getElementById('practice-view');
      const card = document.getElementById('bugang-entry-card');
      const r2 = card ? card.getBoundingClientRect() : null;
      return { practiceVisible: !!pv && !pv.hidden,
               cardRectH: r2 ? r2.height : -1,
               dakaItems: document.querySelectorAll('#daka-habit-list .daka-item').length,
               entryTextVisible: false };
    })()""")
    report("修行打卡页可达、打卡项渲染、步罡卡零高度（不可见）",
           r["practiceVisible"] and r["dakaItems"] > 0 and r["cardRectH"] == 0, r)

    # 直达挡回 1：程序化点击入口
    ev("var e=document.getElementById('bugang-open'); if(e) e.click(); true", 0.5)
    r = ev("(() => { const v = document.getElementById('bugang-view'); return v ? v.hidden : null; })()")
    report("直达挡回：程序化 click #bugang-open 后视图仍 hidden", r is True, r)

    # 直达挡回 2：window.Bugang.open()
    ev("if (window.Bugang) window.Bugang.open(); true", 0.5)
    r = ev("(() => { const v = document.getElementById('bugang-view');"
           " return { hidden: v ? v.hidden : null, bodyClass: document.body.classList.contains('bugang-open') }; })()")
    report("直达挡回：window.Bugang.open() 后视图仍 hidden 且 body 无 bugang-open",
           r["hidden"] is True and r["bodyClass"] is False, r)

    errs = ev("window.__errs || []")
    report("全程零 JS 异常", errs == [], errs)
finally:
    chrome.terminate()

fails = [n for n, ok in results if not ok]
print("== smoke-v2316: %d/%d PASS ==" % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)

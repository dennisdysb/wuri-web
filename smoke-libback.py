#!/usr/bin/env python3
# 专项冒烟：文库返回定位（2026-10-27 用户反馈）——
# 从列表深处点开经文，点「‹ 目录」返回时须回到原分类/原滚动位，
# 并给刚读的那条加短暂金色描边（.lib-ret-hl）。三条来路各验：
# ①道藏全集分类（正一部第 ~150 条）②精选内丹架 ③统一检索结果（全藏命中）。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "libback-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

def launch():
    port = base.free_port(); prof = "/tmp/chrome-libback-%d" % port
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                             "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=500,1000", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    wsurl = None
    for _ in range(40):
        try:
            tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
            pg = [t for t in tg if t.get("type") == "page"]
            if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    c = base.CDP(base.ws_connect(wsurl))
    c.call("Page.enable"); c.call("Runtime.enable")
    c.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 1, "mobile": True})
    init = "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"
    init += "try{localStorage.setItem('wuri_pro_redeem','1');}catch(e){}"
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(4)
    return proc, c

def ev(c, expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return r["result"].get("value")

def wait_for(c, expr, secs=25):
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if ev(c, expr): return True
        except Exception: pass
        time.sleep(0.4)
    return False

def shot(c, name):
    r = c.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

proc, c = launch()
try:
    ok = wait_for(c, "!!document.querySelector('[data-dz-toggle]') && !!document.querySelector('.jing-item[data-jing=\"s48\"]')", 40)
    report("P1 目录渲染就绪", ok)
    report("P0 Pro 基线", ev(c, "!!(window.WuriPro && WuriPro.isPro())") is True)
    ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()"); time.sleep(1.2)

    # ---------- ① 道藏全集 · 正一部第 ~150 条 ----------
    ev(c, "document.querySelector('[data-dz-toggle]').click()"); time.sleep(0.8)
    ok = wait_for(c, "!!document.querySelector('[data-dz-bu=\"正一部\"]')")
    ev(c, "document.querySelector('[data-dz-bu=\"正一部\"]').click()")
    ok = wait_for(c, "document.querySelectorAll('[data-dz-works=\"正一部\"] .dz-work').length >= 240")
    report("A1 正一部 242 条渲染", ok, ev(c, "document.querySelectorAll('[data-dz-works=\"正一部\"] .dz-work').length"))
    pre = ev(c, """(function(){var rows=document.querySelectorAll('[data-dz-works="正一部"] .dz-work');
      var el=rows[149]; el.scrollIntoView({block:'center'}); return {id: el.getAttribute('data-dz-work')};})()""")
    time.sleep(0.6)
    geo0 = ev(c, """(function(){var el=document.querySelector('[data-dz-work="%s"]');
      return {y: window.scrollY, top: el.getBoundingClientRect().top};})()""" % pre["id"])
    ev(c, "document.querySelector('[data-dz-work=\"%s\"]').click()" % pre["id"])
    ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>0")
    report("A2 点开第150条进阅读器", ok)
    ev(c, "document.getElementById('jing-back').click()"); time.sleep(0.9)
    geo1 = ev(c, """(function(){var el=document.querySelector('[data-dz-work="%s"]');
      var body=document.querySelector('[data-dz-body]'); var wrap=document.querySelector('[data-dz-works="正一部"]');
      return {y: window.scrollY, top: el?el.getBoundingClientRect().top:-99999,
        homeHidden: document.getElementById('jing-home').hidden,
        readerHidden: document.getElementById('jing-reader').hidden,
        bodyHidden: body?body.hidden:true, wrapHidden: wrap?wrap.hidden:true,
        hl: el?el.classList.contains('lib-ret-hl'):false};})()""" % pre["id"])
    report("A3 返回仍是正一部展开态", (not geo1["homeHidden"]) and geo1["readerHidden"] and (not geo1["bodyHidden"]) and (not geo1["wrapHidden"]), geo1)
    report("A4 滚动位恢复（|Δy|≤4）", abs(geo1["y"] - geo0["y"]) <= 4, "y0=%s y1=%s" % (geo0["y"], geo1["y"]))
    report("A5 条目位置恢复（|Δtop|≤14）", abs(geo1["top"] - geo0["top"]) <= 14, "top0=%s top1=%s" % (geo0["top"], geo1["top"]))
    report("A6 刚读条目带高亮描边", geo1["hl"], geo1)
    rowtxt = ev(c, "document.querySelector('[data-dz-work=\"%s\"]').textContent" % pre["id"])
    report("A7 返回后该行书名已还原（非「载入中…」）", ("载入中" not in rowtxt) and len(rowtxt.strip()) > 4, rowtxt[:60])
    shot(c, "a-dz-back.png")

    # ---------- ② 精选内丹架 ----------
    ev(c, "window.scrollTo(0,0)"); time.sleep(0.3)
    ev(c, "document.querySelector('[data-neidan-toggle]').click()"); time.sleep(0.5)
    pre2 = ev(c, """(function(){var el=document.querySelector('.jing-item[data-jing="s48"]');
      el.scrollIntoView({block:'center'}); return {id:'s48'};})()""")
    time.sleep(0.6)
    geo0 = ev(c, """(function(){var el=document.querySelector('.jing-item[data-jing="s48"]');
      return {y: window.scrollY, top: el.getBoundingClientRect().top};})()""")
    ev(c, "document.querySelector('.jing-item[data-jing=\"s48\"]').click()")
    ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>0")
    report("B1 内丹《坐忘论》打开", ok)
    ev(c, "document.getElementById('jing-back').click()"); time.sleep(0.9)
    geo1 = ev(c, """(function(){var el=document.querySelector('.jing-item[data-jing="s48"]');
      var nb=document.querySelector('.jing-neidan-body');
      return {y: window.scrollY, top: el?el.getBoundingClientRect().top:-99999,
        ndHidden: nb?nb.hidden:true, hl: el?el.classList.contains('lib-ret-hl'):false,
        listHidden: document.getElementById('jing-list').hidden};})()""")
    report("B2 返回内丹架展开且滚动恢复", (not geo1["listHidden"]) and (not geo1["ndHidden"]) and abs(geo1["y"] - geo0["y"]) <= 4,
           "y0=%s y1=%s nd=%s" % (geo0["y"], geo1["y"], geo1["ndHidden"]))
    report("B3 条目位置恢复＋高亮", abs(geo1["top"] - geo0["top"]) <= 14 and geo1["hl"], geo1)
    shot(c, "b-neidan-back.png")

    # ---------- ③ 统一检索来路（全藏命中） ----------
    ev(c, """(function(){var q=document.getElementById('jing-q'); q.focus(); q.value='正一';
      q.dispatchEvent(new Event('input',{bubbles:true}));})()""")
    ok = wait_for(c, "document.querySelectorAll('#jing-results .jing-res[data-dz-work]').length >= 10", 30)
    report("C1 检索出全藏命中", ok, ev(c, "document.querySelectorAll('#jing-results .jing-res').length"))
    pre3 = ev(c, """(function(){var rows=document.querySelectorAll('#jing-results .jing-res[data-dz-work]');
      var el=rows[5]; el.scrollIntoView({block:'center'}); return {id: el.getAttribute('data-dz-work')};})()""")
    time.sleep(0.6)
    geo0 = ev(c, """(function(){var el=document.querySelector('#jing-results .jing-res[data-dz-work="%s"]');
      return {y: window.scrollY, top: el?el.getBoundingClientRect().top:-99999};})()""" % pre3["id"])
    ev(c, "document.querySelector('#jing-results .jing-res[data-dz-work=\"%s\"]').click()" % pre3["id"])
    ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>0")
    report("C2 检索命中点开进阅读器", ok)
    ev(c, "document.getElementById('jing-back').click()"); time.sleep(0.9)
    geo1 = ev(c, """(function(){var el=document.querySelector('#jing-results .jing-res[data-dz-work="%s"]');
      return {y: window.scrollY, top: el?el.getBoundingClientRect().top:-99999,
        resHidden: document.getElementById('jing-results').hidden,
        listHidden: document.getElementById('jing-list').hidden,
        hl: el?el.classList.contains('lib-ret-hl'):false};})()""" % pre3["id"])
    report("C3 返回仍是搜索结果态", (not geo1["resHidden"]) and geo1["listHidden"], geo1)
    report("C4 搜索态滚动恢复＋高亮", abs(geo1["y"] - geo0["y"]) <= 4 and abs(geo1["top"] - geo0["top"]) <= 14 and geo1["hl"],
           "y0=%s y1=%s top0=%s top1=%s hl=%s" % (geo0["y"], geo1["y"], geo0["top"], geo1["top"], geo1["hl"]))
    shot(c, "c-search-back.png")

    errs = ev(c, "window.__errs || []")
    report("Z 零 JS 异常", len(errs) == 0, errs[:3])
finally:
    proc.terminate()

npass = sum(1 for _, ok in results if ok)
print("== %d/%d PASS ==" % (npass, len(results)))
sys.exit(0 if npass == len(results) else 1)

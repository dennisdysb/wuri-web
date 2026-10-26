#!/usr/bin/env python3
# 专项冒烟：pro.js 付费墙 t is not a function 根因修复（v139）
# 根因：refreshProUI 等处直用裸全局 t（window.t），该绑定可被任意全局同名赋值覆盖；
# 修复：pro.js 加载时把 window.t 绑定为模块私有引用 T，全部调用走 T。
# 本冒烟含敌意回归：人为把 window.t 覆写成非函数后，付费墙全路径仍须零异常。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/profix139-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
FEED_SEED = json.dumps({"scriptures": json.loads(rd("content/scriptures.json"))}, ensure_ascii=False)

def launch(pro):
    port = base.free_port(); prof = "/tmp/chrome-profix-%s-%d" % ("pro" if pro else "free", port)
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=500,900", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    wsurl = None
    for _ in range(40):
        try:
            tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
            pg = [x for x in tg if x.get("type") == "page"]
            if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    c = base.CDP(base.ws_connect(wsurl))
    c.call("Page.enable"); c.call("Runtime.enable")
    c.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 1, "mobile": True})
    init = "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"
    init += "try{localStorage.setItem('wuri_feed_cache_v1', %s);}catch(e){}" % json.dumps(FEED_SEED)
    if pro: init += "try{localStorage.setItem('wuri_pro_redeem','1');}catch(e){}"
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(4.0)
    return proc, c

def ev(c, expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return r["result"].get("value")

def goto_jing(c):
    ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()")
    time.sleep(1.5)
    ev(c, "var tg=document.querySelector('[data-neidan-toggle]'); tg && tg.click()")
    time.sleep(0.6)

# ----- 非 Pro：旧部 s18 + 新部 s40 开墙零异常；墙面行为不变 -----
proc, c = launch(False)
goto_jing(c)
for sid in ["s18", "s40"]:
    ev(c, "document.querySelector('.jing-neidan-body .jing-item[data-jing=\"%s\"]').click()" % sid)
    time.sleep(1.0)
    wall = ev(c, "document.getElementById('paywall').classList.contains('show')")
    reader_open = ev(c, "!document.getElementById('jing-reader').hidden")
    report("P1 非Pro点%s弹付费墙且不开卷" % sid, wall is True and not reader_open, (wall, reader_open))
    if sid == "s18":
        note = ev(c, "(document.querySelector('#paywall [data-pro-paynote]')||{}).textContent || ''")
        restore_txt = ev(c, "(document.querySelector('#paywall [data-pro-act=\"restore\"]')||{}).textContent || ''")
        price = ev(c, "(document.querySelector('#paywall [data-pro-price]')||{}).textContent || ''")
        report("P2 墙面刷新到位（Stripe说明/找回激活码/价格）",
               "Stripe" in (note or "") and (restore_txt or "").strip() == "找回激活码" and "4.99" in (price or ""),
               (note, restore_txt, price))
        r = c.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, "paywall-412.png"), "wb").write(base64.b64decode(r["data"]))
        ev(c, "document.querySelector('#paywall [data-pro-act=\"close\"]').click()")
        time.sleep(0.5)
        closed = ev(c, "!document.getElementById('paywall').classList.contains('show')")
        report("P3 点关闭钮收墙", closed is True, closed)
errs = ev(c, "window.__errs")
report("P4 非Pro轮零JS异常", not errs, errs)

# ----- 敌意回归：window.t 被覆写成非函数，pro.js 全路径仍须工作 -----
ev(c, "window.t = {clobbered: true}; 'typeof t=' + typeof window.t")
r = ev(c, "try { WuriPro.refreshProUI(); WuriPro.showPaywall('smoke'); 'ok'; } catch (e) { 'THROW: ' + e.message; }")
wall = ev(c, "document.getElementById('paywall').classList.contains('show')")
state_txt = ev(c, "(document.querySelector('[data-pro-state]')||{}).textContent || ''")
report("P5 window.t被覆写后 refreshProUI+showPaywall 不抛且墙可开", r == "ok" and wall is True, (r, wall))
report("P6 覆写下状态文案仍由私有绑定刷新", bool(state_txt), state_txt)
ev(c, "WuriPro.hidePaywall()")
errs = ev(c, "window.__errs")
report("P7 敌意轮零JS异常", not errs, errs)
proc.terminate()

# ----- Pro：开卷零回归、状态文案为已解锁 -----
proc, c = launch(True)
goto_jing(c)
ev(c, "JingWen.openReader('s40')")
time.sleep(1.5)
opened = ev(c, "!document.getElementById('jing-reader').hidden && document.getElementById('jing-title').textContent.indexOf('悟真篇')>=0")
wall = ev(c, "document.getElementById('paywall').classList.contains('show')")
report("P8 Pro点新部s40直接开卷无墙", opened is True and wall is False, (opened, wall))
state = ev(c, "(function(){var e=document.querySelector('[data-pro-state]'); return e ? {txt: e.textContent, on: e.classList.contains('on')} : null;})()")
report("P9 Pro状态文案已刷新（已解锁态）", bool(state and state["on"]), state)
errs = ev(c, "window.__errs")
report("P10 Pro轮零JS异常", not errs, errs)
proc.terminate()

np = sum(1 for _, ok in results if ok)
print("== %d/%d PASS ==" % (np, len(results)))
open(os.path.join(OUT, "smoke-profix-v139-results.txt"), "w", encoding="utf-8").write(
    "\n".join(("PASS " if ok else "FAIL ") + n for n, ok in results) + "\n== %d/%d ==\n" % (np, len(results)))

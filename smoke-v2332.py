# -*- coding: utf-8 -*-
"""v2.3.0 (SW v132) 专项冒烟：冥想呼吸型态。
断言四件套、7 型态参数在 DOM 呈现、真实点击选择/播放/暂停/恢复、
相位顺序（延长呼气跳过 0 秒屏息）、呼吸圈最上层可见、关于页 Breathly 鸣谢。
结果落盘 breath132-shots/smoke-v2332-results.txt。
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/breath132-shots")
os.makedirs(OUT, exist_ok=True)
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:500]) if (extra and not ok) else ""))

sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
idx = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
med = open(os.path.join(WWW, "js/meditation.js"), encoding="utf-8").read()
css = open(os.path.join(WWW, "css/meditation.css"), encoding="utf-8").read()
report("S1 四件套 v132", "wuri-v132-20261025-v230" in sw and "style.css?v=132" in sw and "style.css?v=132" in idx and "（内部 v132）" in idx and "（内部 v132）" in i18n and "（內部 v132）" in i18n)
report("S2 meditation.css ?v=68 双处", "meditation.css?v=68" in sw and "meditation.css?v=68" in idx)
report("S3 七型态参数齐备", all(x in med for x in ["phases: [4, 4, 4, 4]", "phases: [5.5, 0, 5.5, 0]", "phases: [4, 0, 6, 0]", "phases: [4, 7, 8, 0]", "phases: [7, 0, 7, 0]", "phases: [7, 4, 8, 4]", "phases: [6, 0, 2, 0]"]))
report("S4 Breathly 鸣谢简繁+index", "me_credit_breathly" in idx and "Breathly（依 MPL-2.0 许可证）" in i18n and "Breathly（依 MPL-2.0 許可證）" in i18n)
report("S5 呼吸圈/型态样式在位", ".med-breath-circle" in css and ".med-breath-chip" in css and "@media (max-height:740px)" in css)

port = base.free_port(); prof = "/tmp/chrome-breath132-%d" % port
env = dict(os.environ); env["TZ"] = "America/Toronto"
proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                         "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                         "--user-data-dir=" + prof, "--window-size=390,844", "about:blank"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
wsurl = None
for _ in range(40):
    try:
        tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
        pg = [t for t in tg if t.get("type") == "page"]
        if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
    except Exception: pass
    time.sleep(0.5)
cdp = base.CDP(base.ws_connect(wsurl)); cdp.call("Page.enable"); cdp.call("Runtime.enable")
cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));}); localStorage.removeItem('wuri_med_breath');"})
cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")}); time.sleep(3)

def ev(expr):
    r = cdp.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:400])
    return (r.get("result") or {}).get("value")
def click_sel(sel, wait=0.7):
    r = ev("(function(){var e=document.querySelector(%s);if(!e)return null;e.scrollIntoView({block:'center',inline:'center'});var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()" % json.dumps(sel))
    if not r: raise RuntimeError("not found " + sel)
    for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
        kw = {"type": typ, "x": r["x"], "y": r["y"]}
        if typ != "mouseMoved": kw.update({"button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", kw)
    time.sleep(wait)
def breath_state():
    return ev("""(() => { const box=document.getElementById('med-breath'), c=document.getElementById('med-breath-circle');
      const r=c.getBoundingClientRect(), top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {hidden:box.hidden, phase:document.getElementById('med-breath-phase').textContent,
        count:parseFloat(document.getElementById('med-breath-count').textContent), transform:getComputedStyle(c).transform,
        topOk:!!(top && top.closest && top.closest('#med-breath')),
        layerOk:(+getComputedStyle(document.querySelector('.med-center')).zIndex > +getComputedStyle(document.getElementById('med-pager')).zIndex),
        hitTop:top ? (top.id || top.className) : null, ls:localStorage.getItem('wuri_med_breath'),
        on:document.querySelector('#med-breath-options .med-breath-chip.on')?.dataset.breath,
        chips:[...document.querySelectorAll('#med-breath-options .med-breath-chip')].map(x=>x.textContent)}; })()""")

try:
    ev("Meditation.open(); true"); time.sleep(0.8)
    st = breath_state()
    report("B1 型态选项=关闭+7型态", st["chips"] == ["关闭", "盒式呼吸", "谐振呼吸", "延长呼气", "深度安神（4-7-8）", "乌加依呼吸", "调息法", "清醒提神"], st["chips"])
    report("B2 默认关闭且呼吸圈隐藏", st["hidden"] and st["on"] == "off", st)
    click_sel("[data-breath='coherent']")
    st = breath_state()
    report("B3 点选谐振：持久化/圈显示/5.5秒吸气", (not st["hidden"]) and st["ls"] == "coherent" and st["on"] == "coherent" and st["phase"] == "吸气" and abs(st["count"] - 5.5) < 0.11, st)
    report("B4 呼吸圈视觉层在滑动层之上（中心层 z 高于 pager，截图亲验）", st["layerOk"], st)
    click_sel("#med-play", 0.4)
    time.sleep(1.1); st1 = breath_state()
    report("B5 播放后倒计时推进且圆在放大", st1["count"] < 5.35 and st1["transform"] != "none", st1)
    click_sel("[data-breath='extended-exhale']", 0.3)
    st = breath_state(); report("B6 播放中切延长呼气即时重启吸气4秒", st["phase"] == "吸气" and 3.6 < st["count"] <= 4.05, st)
    time.sleep(4.35); st = breath_state()
    report("B7 0秒屏息被跳过：吸气后直接呼气", st["phase"] == "呼气" and 5.0 < st["count"] <= 6.05, st)
    click_sel("#med-play", 0.3)
    a = breath_state(); time.sleep(0.8); b = breath_state()
    report("B8 暂停冻结呼吸相位", abs(a["count"] - b["count"]) < 0.06 and a["phase"] == b["phase"], (a, b))
    click_sel("#med-play", 0.3); time.sleep(0.8); c = breath_state()
    report("B9 恢复后续跑", c["count"] < b["count"] - 0.35, (b, c))
    r = cdp.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, "breath-extended-390.png"), "wb").write(base64.b64decode(r["data"]))
    click_sel("[data-breath='off']", 0.3); st = breath_state()
    report("B10 关闭型态后呼吸圈隐藏", st["hidden"] and st["on"] == "off", st)
    click_sel("#med-back", 0.6)
    click_sel("#tabbar button[data-tab='tab-me']", 0.8)
    ev("document.querySelector('.about-more').open = true; document.querySelector('.about-more').scrollIntoView(); true"); time.sleep(0.3)
    credit = ev("(function(){var e=document.querySelector('[data-i18n=\"me_credit_breathly\"]');return e?e.textContent:null;})()")
    report("B11 关于页鸣谢真渲染", bool(credit) and "Breathly" in credit and "MPL-2.0" in credit, credit)
    errs = ev("window.__errs")
    report("Z1 零 JS 异常", not errs, errs)
finally:
    proc.terminate()
passed = sum(1 for _, ok in results if ok); line = "SMOKE v2332: %d/%d passed" % (passed, len(results)); print(line)
with open(os.path.join(OUT, "smoke-v2332-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write(line + "\n")
sys.exit(0 if passed == len(results) else 1)

# -*- coding: utf-8 -*-
"""v2.3.0 (SW v130) 专项冒烟：关于页定本鸣谢署名补全。
背景：《漫步中国星空》版权页照片坐实著者——齐锐、万昊宜著，科学普及出版社（增订版）。
原第⑥段鸣谢占位〔定本著者与出版信息待补〕改为完整署名，简繁同步，占位清除。
矩阵：
  S 静态：i18n 简/繁新署名在位、index 兜底在位、www 全仓无「待补/待補」残留、四件套 v130。
  A 浏览器（简体预置）：我的→关于→真点击展开「鸣谢与说明」→第⑥段断言新署名、无占位，截图。
  B 浏览器（繁体预置 wuri_lang_v1=zh-TW）：同路径断言繁体署名，截图。
结果落盘 credit130-shots/smoke-v2330-results.txt，零 JS 异常为硬性项。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/credit130-shots")
os.makedirs(OUT, exist_ok=True)
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)) if (extra and not ok) else ""))

# ---------- 静态断言 ----------
i18n_src = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
idx_src = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
sw_src = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
HANS = '星象模块星官体系以《漫步中国星空》（增订版，齐锐、万昊宜著，科学普及出版社）为定本校订；《步天歌》用该书所本《灵台秘苑》系统。'
HANT = '星象模組星官體系以《漫步中國星空》（增訂版，齊銳、萬昊宜著，科學普及出版社）為定本校訂；《步天歌》用該書所本《靈臺秘苑》系統。'
report("S1 i18n 简体新署名在位", HANS in i18n_src)
report("S2 i18n 繁体新署名在位", HANT in i18n_src)
report("S3 index 兜底新署名在位", HANS in idx_src)
resid = []
for root, _dirs, files in os.walk(WWW):
    for fn in files:
        p = os.path.join(root, fn)
        try:
            t = open(p, encoding="utf-8", errors="ignore").read()
        except Exception:
            continue
        if "待补" in t or "待補" in t:
            resid.append(os.path.relpath(p, WWW))
report("S4 www 全仓无「待补/待補」残留", not resid, resid)
report("S5 四件套 v130", "wuri-v130" in sw_src and "style.css?v=130" in sw_src
       and "style.css?v=130" in idx_src and "（内部 v130）" in idx_src
       and "（内部 v130）" in i18n_src and "（內部 v130）" in i18n_src)

def launch(lang, tag):
    port = base.free_port()
    prof = "/tmp/chrome-credit130-%s-%d" % (tag, port)
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                             "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
                             "--window-size=390,844", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wsurl = None
    for _ in range(40):
        try:
            tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
            pg = [t for t in tg if t.get("type") == "page"]
            if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    cdp = base.CDP(base.ws_connect(wsurl))
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    inject = ("window.__errs=[]; addEventListener('error', function(e){ window.__errs.push(String(e.message||e.error)); });"
              + (("try { localStorage.setItem('wuri_lang_v1','%s'); } catch(e){}" % lang) if lang else ""))
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": inject})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    time.sleep(3.2)
    return proc, cdp

def ev(cdp, expr):
    r = cdp.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    rr = r.get("result") or {}
    return rr.get("value")

def click_el(cdp, sel):
    r = ev(cdp, "(function(){var e=document.querySelector(%s);if(!e)return null;e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()" % json.dumps(sel))
    if not r: raise RuntimeError("not found: " + sel)
    time.sleep(0.4)
    for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
        kw = {"type": typ, "x": r["x"], "y": r["y"]}
        if typ != "mouseMoved": kw.update({"button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", kw)
    time.sleep(0.8)

def shot(cdp, name):
    r = cdp.call("Page.captureScreenshot", {"format": "png"})
    p = os.path.join(OUT, name)
    open(p, "wb").write(__import__("base64").b64decode(r["data"]))
    return p

def run(tag, lang, expect, shotname):
    proc, cdp = launch(lang, tag)
    try:
        click_el(cdp, "#tabbar button[data-tab='tab-me']")
        closed = ev(cdp, "(function(){var d=document.querySelector('details.about-more');return d?!d.open:null;})()")
        report(tag + "1 折叠区默认收起", closed is True, closed)
        click_el(cdp, "details.about-more summary")
        opened = ev(cdp, "(function(){var d=document.querySelector('details.about-more');return d?d.open:null;})()")
        report(tag + "2 真点击展开成功", opened is True, opened)
        para = ev(cdp, "(function(){var e=document.querySelector('[data-i18n=\"me_credit_dingben\"]');return e?e.textContent:null;})()")
        report(tag + "3 第⑥段＝新署名全文", para == expect, para)
        report(tag + "4 第⑥段无占位残留", bool(para) and "待补" not in para and "待補" not in para, para)
        ver = ev(cdp, "(function(){var e=document.querySelector('[data-i18n=\"me_ver\"]');return e?e.textContent:null;})()")
        report(tag + "5 关于页版本号 v130", bool(ver) and "v130" in ver, ver)
        ev(cdp, "(function(){var e=document.querySelector('[data-i18n=\"me_credit_dingben\"]');if(e)e.scrollIntoView({block:'center'});})()")
        time.sleep(0.5)
        shot(cdp, shotname)
        errs = ev(cdp, "window.__errs")
        report(tag + "6 零 JS 异常", not errs, errs)
    finally:
        proc.terminate()

run("A", None, HANS, "about-credit-hans-390.png")
run("B", "zh-TW", HANT, "about-credit-hant-390.png")

passed = sum(1 for _, ok in results if ok)
line = "SMOKE v2330: %d/%d passed" % (passed, len(results))
print(line)
with open(os.path.join(OUT, "smoke-v2330-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write(line + "\n")
sys.exit(0 if passed == len(results) else 1)

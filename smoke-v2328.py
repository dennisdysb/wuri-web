# -*- coding: utf-8 -*-
"""v2.3.0 (SW v128) 专项冒烟：红光模式下 .hero2 照片卡底图红移。
- 根因：底图是 CSS background-image（.h2-bg），v126 的 img 滤镜罩不到。
- 修：body.sky-red 下仅 .h2-bg 套红移滤镜；文字层单独红谱色（标题/副文/胶囊/金字行）。
- 真点击：首页→点术数卡进子页；像素断言：照片区 (R-G) 红开比红关显著增大。截图落盘直读。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request
from PIL import Image

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/redhero128-shots")
os.makedirs(OUT, exist_ok=True)
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)) if (extra and not ok) else ""))

sw_src = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
idx_src = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
i18n_src = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
css_src = open(os.path.join(WWW, "css/style.css"), encoding="utf-8").read()
report("SW v128 缓存名＋CSS ?v=128 预缓存", "wuri-v128" in sw_src and "style.css?v=128" in sw_src)
report("index CSS ?v=128＋静态内部号 v128", "style.css?v=128" in idx_src and "（内部 v128）" in idx_src)
report("me_ver 简繁 v128", "（内部 v128）" in i18n_src and "（內部 v128）" in i18n_src)
report("显示版本仍 v2.3.0", "v2.3.0" in i18n_src)
report("CSS 含 .h2-bg 红光滤镜规则", "body.sky-red .hero2 .h2-bg{filter:brightness(.78) sepia(1)" in css_src)
report("CSS 含副文红谱色规则", "body.sky-red .hero2 .h2-sub{color:rgba(237,168,143,.94)}" in css_src)

PORT = base.free_port()
prof = "/tmp/chrome-v2328-%d" % PORT
chrome_proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                                "--remote-debugging-port=%d" % PORT, "--user-data-dir=" + prof,
                                "--window-size=390,844", "about:blank"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
wsurl = None
for _ in range(40):
    try:
        tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3))
        pg = [t for t in tg if t.get("type") == "page"]
        if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
    except Exception: pass
    time.sleep(0.5)
cdp = base.CDP(base.ws_connect(wsurl))
cdp.call("Page.enable"); cdp.call("Runtime.enable")
cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source":
    "window.__errs=[]; addEventListener('error', e=>window.__errs.push(String(e.message||e.error)));"}) 
def ev(expr):
    r = cdp.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return (r.get("result") or {}).get("value")
def shot(name):
    r = cdp.call("Page.captureScreenshot", {"format": "png"})
    p = os.path.join(OUT, name)
    open(p, "wb").write(__import__("base64").b64decode(r["data"]))
    return p
def click_xy(x, y):
    cdp.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
    cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
    cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    time.sleep(0.7)
def rg_mean(png, box):
    im = Image.open(png).convert("RGB").crop(box)
    px = list(im.getdata())
    n = len(px)
    return (sum(p[0] for p in px) / n, sum(p[1] for p in px) / n)

cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
time.sleep(3.0)

cs = lambda sel, prop: ev("(()=>{var e=document.querySelector(%s);return e?getComputedStyle(e).%s:null;})()" % (json.dumps(sel), prop))
ev("document.querySelector('#practice-entry-card').scrollIntoView({block:'center'})")
time.sleep(0.6)
rect = ev("(()=>{var b=document.querySelector('#practice-entry-card').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()")
box = (int(rect["x"] + 10), int(rect["y"] + 10), int(rect["x"] + rect["w"] * 0.30), int(rect["y"] + rect["h"] * 0.25))

# ---- 红光关基线 ----
report("基线：.h2-bg 无滤镜", cs("#practice-entry-card .h2-bg", "filter") == "none", cs("#practice-entry-card .h2-bg", "filter"))
p_off = shot("home-off-390.png")
r_off, g_off = rg_mean(p_off, box)

# ---- 红光开 ----
ev("WuriRedlight.set(true)")
time.sleep(0.5)
report("红光开：body.sky-red 在", ev("document.body.classList.contains('sky-red')"))
f_bg = cs("#practice-entry-card .h2-bg", "filter")
report("红光开：照片层滤镜生效（sepia）", f_bg and "sepia" in f_bg, f_bg)
report("红光开：标题红谱色", cs("#practice-entry-card .h2-title", "color") == "rgb(242, 193, 178)", cs("#practice-entry-card .h2-title", "color"))
report("红光开：副文红谱浅色", cs("#shushu-entry-card .h2-sub", "color") == "rgba(237, 168, 143, 0.94)", cs("#shushu-entry-card .h2-sub", "color"))
report("红光开：图鉴卡副文红谱浅色", cs("#deities-entry-card .h2-sub", "color") == "rgba(237, 168, 143, 0.94)", cs("#deities-entry-card .h2-sub", "color"))
report("红光开：胶囊文字红谱", cs("#shushu-entry-card .h2-seg", "color") == "rgb(242, 193, 178)", cs("#shushu-entry-card .h2-seg", "color"))
report("红光开：文字层本身无滤镜（不二次色偏）", cs("#shushu-entry-card .h2-in", "filter") == "none", cs("#shushu-entry-card .h2-in", "filter"))
p_on = shot("home-on-390.png")
r_on, g_on = rg_mean(p_on, box)
report("像素：照片区红开比红关明显更红 (R-G 增幅>25)", (r_on - g_on) - (r_off - g_off) > 25, "off R-G=%.1f on R-G=%.1f" % (r_off - g_off, r_on - g_on))

# ---- 真点击进术数子页 ----
hit = ev("(()=>{var e=document.querySelector('#shushu-entry-card');e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();var t=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return t?(t.closest('#shushu-entry-card')?'card':t.tagName+':'+t.className):null;})()")
time.sleep(0.4)
xy = ev("(()=>{var b=document.querySelector('#shushu-entry-card').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()")
report("术数卡点击点命中卡本体", hit == "card", hit)
click_xy(xy["x"], xy["y"])
vis = ev("(()=>{var v=document.querySelector('#view-shushu');return v&&!v.hidden&&getComputedStyle(v).display!=='none';})()")
report("点开术数子页", bool(vis), vis)
f_mini = cs("#ss-bazi .h2-bg", "filter")
report("红光开：子页四卡照片层滤镜生效", f_mini and "sepia" in f_mini, f_mini)
report("红光开：子页副文红谱浅色", cs("#ss-ziwei .h2-sub", "color") == "rgba(237, 168, 143, 0.94)", cs("#ss-ziwei .h2-sub", "color"))
shot("shushu-on-390.png")

# ---- 412 宽 ----
cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 1, "mobile": True})
time.sleep(0.6)
shot("shushu-on-412.png")
bk = ev("(()=>{var bs=[...document.querySelectorAll('#view-shushu button')];var b=bs.find(x=>x.textContent.includes('返回'));if(!b)return null;b.scrollIntoView({block:'center'});var r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()")
if bk: click_xy(bk["x"], bk["y"])
time.sleep(0.5)
report("子页返回回首页", ev("document.querySelector('#view-shushu').hidden"))
shot("home-on-412.png")

# ---- 红光关恢复 ----
ev("WuriRedlight.set(false)")
time.sleep(0.5)
report("红光关：照片层滤镜摘除", cs("#practice-entry-card .h2-bg", "filter") == "none", cs("#practice-entry-card .h2-bg", "filter"))
report("红光关：副文不再是红谱色", cs("#shushu-entry-card .h2-sub", "color") != "rgba(237, 168, 143, 0.94)", cs("#shushu-entry-card .h2-sub", "color"))
shot("home-off-412.png")

errs = ev("window.__errs")
report("零 JS 异常", not errs, errs)
with open(os.path.join(OUT, "smoke-v2328-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write("TOTAL %d/%d\n" % (sum(1 for _, ok in results if ok), len(results)))
print("TOTAL %d/%d" % (sum(1 for _, ok in results if ok), len(results)))
try: chrome_proc.terminate()
except Exception: pass

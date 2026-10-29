#!/usr/bin/env python3
# 专项冒烟：冥想混音面板「配方区」重排（2026-10-29 用户真机反馈）。
# 旧状：配方 chip 与「存为配方/清空」同行 flex-wrap，多了换行叠高、长自动名
# 撑成大块。定版：chip 行移出按钮行、按钮行下方独立成「我的配方」专属区
# （小标题＋计数；零配方整区不显）；区限高 64px（约两行）超出内部纵向滚动；
# chip 限宽 46%＋名字 span 省略号、title 带全名；存储键/格式零变化。
# 断言（360/390/412 三档 × 种子 0/1/2/9 个配方，含超长自动名）：
#   S0 零配方：专属区 hidden、占高 0；
#   S1/S2 计数与 chip 数对、长名 chip 省略生效（scrollWidth>clientWidth）、
#        chip 高 ≤36（不再撑块）、宽 ≤ 容器 46%+2；
#   S9 区内可滚（scrollHeight>clientHeight、clientHeight≤68）、滚到底末 chip
#        可达、面板高 ≤82vh+2、轨道列表区高 ≥120（不被无限挤压）；
#   R 载入回归（点 chip→wuri_med_mix 轨集与「已选N轨」同步）、删除回归
#      （✕→存储与 DOM 同步减、删空整区隐）、存配方入口仍开命名面板；
#   T 日/夜/红光三态下专属区与 chip 可见（截图存 /tmp/mixrecipes-shots/）。
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib, base64

_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
OUT = "/tmp/mixrecipes-shots"; os.makedirs(OUT, exist_ok=True)
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]), flush=True)

LONG = "颂钵·静·溪流·温柔雨声·森林鸟鸣"
SEEDS = {
    0: [],
    1: [{"name": "海边读经", "tracks": {"ocean": 70, "night": 55, "bowl": 80}}],
    2: [{"name": "海边读经", "tracks": {"ocean": 70, "night": 55, "bowl": 80}},
        {"name": LONG, "tracks": {"bowl": 80, "creek": 65, "rain": 72, "forest": 60}}],
    9: [{"name": "海边读经", "tracks": {"ocean": 70, "night": 55, "bowl": 80}},
        {"name": LONG, "tracks": {"bowl": 80, "creek": 65, "rain": 72, "forest": 60}},
        {"name": "雨夜", "tracks": {"rain": 60, "thunder": 40}},
        {"name": "山间晨雾", "tracks": {"wind": 50, "forest": 66}},
        {"name": "晨钟", "tracks": {"bowl": 90}},
        {"name": "夜读", "tracks": {"fire": 58, "night": 44}},
        {"name": "听雨", "tracks": {"rain": 77}},
        {"name": "空山", "tracks": {"creek": 52, "wind": 38}},
        {"name": "静坐观云", "tracks": {"silence": 0, "wind": 30}}],
}

port = base.free_port(); prof = f"/tmp/chrome-mixrecipes-{port}"
proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
    "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required",
    "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
    f"--remote-debugging-port={port}", f"--user-data-dir={prof}",
    "--window-size=412,860", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    env={**os.environ, "TZ": "America/Toronto"})
ws = None
for _ in range(40):
    try:
        tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=3))
        pages = [t for t in tabs if t["type"] == "page"]
        if pages: ws = pages[0]["webSocketDebuggerUrl"]; break
    except Exception: pass
    time.sleep(0.5)
assert ws, "chrome CDP 未就绪"
cdp = base.CDP(base.ws_connect(ws))
cdp.call("Page.enable"); cdp.call("Runtime.enable")
cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": """
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e.error))});
try{ localStorage.setItem('wuri_pro_redeem','1'); }catch(e){}
"""})
cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
time.sleep(3.5)

def ev(expr):
    r = cdp.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    res = r.get("result", {})
    if res.get("subtype") == "error" or "exceptionDetails" in r:
        raise RuntimeError(str(r)[:300])
    return res.get("value")

def shot(name):
    r = cdp.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

PROBE = """(function(){
  var sec=document.getElementById('med-mix-recipes');
  var box=document.getElementById('med-mix-recipe-chips');
  var cnt=document.getElementById('med-mix-recipes-count');
  var panel=document.getElementById('med-mix-panel');
  var list=document.querySelector('.med-mix-listwrap');
  var chips=[].slice.call(box.querySelectorAll('.med-mix-recipe'));
  var long=chips.filter(function(c){return c.title.length>10;})[0];
  var lo=null;
  if(long){ var nm=long.querySelector('.med-mix-recipe-name');
    lo={chipW:Math.round(long.getBoundingClientRect().width), chipH:Math.round(long.getBoundingClientRect().height),
        boxW:Math.round(box.getBoundingClientRect().width),
        nmSW:nm?nm.scrollWidth:0, nmCW:nm?nm.clientWidth:0}; }
  return {secHidden: sec.hidden, secH: Math.round(sec.getBoundingClientRect().height),
    count: cnt.textContent, nChips: chips.length,
    boxCH: box.clientHeight, boxSH: box.scrollHeight,
    panelH: Math.round(panel.getBoundingClientRect().height), listH: list.clientHeight,
    long: lo, errs:(window.__errs||[]).slice(0,3)};
})()"""

def open_panel(width, n):
    cdp.call("Emulation.setDeviceMetricsOverride",
             {"width": width, "height": 780, "deviceScaleFactor": 2, "mobile": True})
    ev("localStorage.setItem('wuri_med_mix_recipes', %s); 'ok'" % json.dumps(json.dumps(SEEDS[n], ensure_ascii=False)))
    cdp.call("Page.reload"); time.sleep(3.2)
    ev("Meditation.open()"); time.sleep(1.0)
    ev("document.getElementById('med-key-mix').click(); 'ok'"); time.sleep(0.9)

for width in (360, 390, 412):
    for n in (0, 1, 2, 9):
        open_panel(width, n)
        p = ev(PROBE)
        tag = f"W{width}/S{n}"
        report(tag + " 无页面错误", not p["errs"], p["errs"])
        if n == 0:
            report(tag + " 零配方整区不显且占高0", p["secHidden"] and p["secH"] == 0, p)
        else:
            report(tag + " 专属区显+计数对+chip数对",
                   (not p["secHidden"]) and p["count"] == str(n) and p["nChips"] == n, p)
            report(tag + " chip区限高≤68", p["boxCH"] <= 68, p)
        if n >= 2:
            lo = p["long"]
            report(tag + " 长名省略生效", bool(lo) and lo["nmSW"] > lo["nmCW"], lo)
            report(tag + " 长名chip不撑块(高≤36,宽≤46%+2)",
                   bool(lo) and lo["chipH"] <= 36 and lo["chipW"] <= lo["boxW"] * 0.46 + 2, lo)
        if n == 9:
            report(tag + " 9个区内可滚", p["boxSH"] > p["boxCH"] + 4, p)
            report(tag + " 面板高有界(≤82vh+2)", p["panelH"] <= 0.82 * 780 + 2, p)
            report(tag + " 轨道列表不被挤压(≥120)", p["listH"] >= 120, p)
            reach = ev("""(function(){ var box=document.getElementById('med-mix-recipe-chips');
              box.scrollTop=box.scrollHeight; var cs=box.querySelectorAll('.med-mix-recipe');
              var last=cs[cs.length-1]; var br=box.getBoundingClientRect(), lr=last.getBoundingClientRect();
              return {ok: lr.bottom<=br.bottom+2 && lr.top>=br.top-2, last:last.title}; })()""")
            report(tag + " 滚到底末chip可达", reach["ok"], reach)
        if width == 360 and n in (2, 9):
            shot(f"w360-s{n}.png")

# ---- 回归（390 档，种子 2） ----
open_panel(390, 2)
ev("document.querySelectorAll('.med-mix-recipe')[0].click(); 'ok'"); time.sleep(0.6)
mix = ev("""(function(){ var m={}; try{m=JSON.parse(localStorage.getItem('wuri_med_mix')||'{}');}catch(e){}
  return {tracks:Object.keys(m.tracks||{}).sort(), count:document.getElementById('med-mix-panel-count').textContent}; })()""")
report("R 载入配方→轨集同步", mix["tracks"] == ["bowl", "night", "ocean"], mix)
report("R 载入配方→已选轨数同步", "3" in mix["count"], mix)
ev("document.querySelectorAll('.med-mix-recipe')[1].querySelector('.med-mix-recipe-del').click(); 'ok'"); time.sleep(0.5)
after = ev("""(function(){ var r=[]; try{r=JSON.parse(localStorage.getItem('wuri_med_mix_recipes')||'[]');}catch(e){}
  return {stored:r.length, dom:document.querySelectorAll('.med-mix-recipe').length,
          count:document.getElementById('med-mix-recipes-count').textContent}; })()""")
report("R 删除一个→存储/DOM/计数同步", after == {"stored": 1, "dom": 1, "count": "1"}, after)
ev("document.querySelector('.med-mix-recipe .med-mix-recipe-del').click(); 'ok'"); time.sleep(0.5)
emp = ev("""(function(){ var r=[]; try{r=JSON.parse(localStorage.getItem('wuri_med_mix_recipes')||'[]');}catch(e){}
  var s=document.getElementById('med-mix-recipes'); return {stored:r.length, hidden:s.hidden, h:Math.round(s.getBoundingClientRect().height)}; })()""")
report("R 删空→整区隐", emp["stored"] == 0 and emp["hidden"] and emp["h"] == 0, emp)
ev("document.getElementById('med-mix-save').click(); 'ok'"); time.sleep(0.6)
ns = ev("!document.getElementById('med-name-sheet').hidden")
report("R 存为配方入口仍开命名面板", ns, ns)
ev("document.getElementById('med-name-cancel').click(); 'ok'"); time.sleep(0.4)

# ---- 三态（390 档，种子 9） ----
open_panel(390, 9)
shot("t-day.png")
ev("(function(){var t=document.querySelector('[data-theme-toggle]'); if(t) t.click(); return 'night';})()"); time.sleep(0.8)
vis = ev("""(function(){ var s=document.getElementById('med-mix-recipes');
  return {hidden:s.hidden, chips:document.querySelectorAll('.med-mix-recipe').length}; })()""")
report("T 夜间态专属区可见", (not vis["hidden"]) and vis["chips"] == 9, vis)
shot("t-night.png")
ev("document.body.classList.add('sky-red'); 'red'"); time.sleep(0.5)
vis = ev("""(function(){ var s=document.getElementById('med-mix-recipes');
  return {hidden:s.hidden, chips:document.querySelectorAll('.med-mix-recipe').length}; })()""")
report("T 红光态专属区可见", (not vis["hidden"]) and vis["chips"] == 9, vis)
shot("t-red.png")
ev("document.body.classList.remove('sky-red'); 'ok'")

fails = [n for n, ok in R if not ok]
print(f"\n==== {len(R) - len(fails)}/{len(R)} PASS" + (("  FAIL: " + " | ".join(fails)) if fails else ""))
try: proc.terminate()
except Exception: pass
sys.exit(1 if fails else 0)

#!/usr/bin/env python3
"""v2.3.0（SW v126）红光 theme-color 联动专项冒烟。

用户真机报障（2026-10-25 17:19）：红光模式下页面与底栏已红，但最顶部
系统状态栏一带仍白底。网页可影响它的手段是 meta theme-color——本批把
红光总开关（stars.js WuriRedlight）与 theme-color 联动：开→#080201
（tabbar 红光底 rgba(8,2,1) 实色）；关→按当前日/夜主题恢复
（夜 #060608／日 #F5F1E6，与 app.js applyTheme 同口径，不写死单一值）；
applyTheme 侧同口径回压，系统主题切换不把红盖掉。

断言：①版本四件套 v126；②源码层：redThemeColor 在位且 redSet/redBoot
均调用、applyTheme 红光回压在位；③DOM 真开关：日间 关→开→关 meta
#F5F1E6→#080201→#F5F1E6；④夜间同路：#060608→#080201→#060608；
⑤红光开时调 applyTheme（模拟系统主题切换）meta 仍 #080201；
⑥LS 预置开启整页重载（redBoot 冷启恢复）meta 直接 #080201；
全程零 JS 异常。结果存 themecolor126-shots/。
注：真机状态栏实际染色受浏览器/PWA 形态影响，以用户真机为准，本冒烟只验 DOM 口径。
"""
import base64, importlib.util, json, os, sys, time

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/themecolor126-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- ① 版本口径 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v126 缓存名＋CSS ?v=126 预缓存", "wuri-v126-20261025-v230" in sw and "style.css?v=126" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("CSS ?v=126＋index 静态版本行 v126", "css/style.css?v=126" in html and "戊日不上香 v2.3.0（内部 v126）" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简繁 v126", "（内部 v126）" in i18n and "（內部 v126）" in i18n)
report("显示版本仍 v2.3.0", "v2.3.1" not in i18n)

# ---------- ② 源码层 ----------
stars = open(os.path.join(WWW, "js/stars.js"), encoding="utf-8").read()
report("redThemeColor 在位（#080201＋日夜恢复口径）",
       "function redThemeColor(v)" in stars and "'#080201'" in stars and "'#060608'" in stars and "'#F5F1E6'" in stars)
report("redSet 与 redBoot 均调用 redThemeColor", stars.count("redThemeColor(v)") >= 3)
app = open(os.path.join(WWW, "js/app.js"), encoding="utf-8").read()
report("applyTheme 红光回压在位", "WuriRedlight.on()) mc.setAttribute('content', '#080201')" in app)

# ---------- ③–⑥ DOM 真开关 ----------
import subprocess, urllib.request
prof = "/tmp/chrome-v2326-%d" % PORT
chrome_proc = subprocess.Popen([base.CHROME, "--headless=old", "--disable-gpu", "--no-sandbox",
                  "--remote-debugging-port=%d" % PORT, "--user-data-dir=" + prof,
                  "--window-size=390,844", "about:blank"],
                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
URL = "file://" + os.path.join(WWW, "index.html")
JS_META = "document.querySelector('meta[name=theme-color]').getAttribute('content')"
def ev(expr):
    r = cdp.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return (r.get("result") or {}).get("value")

cdp.call("Page.navigate", {"url": URL}); time.sleep(2.5)
def set_theme(v):
    return ev("(()=>{var r=document.querySelector('input[name=theme][value=\"" + v + "\"]'); if(!r) return false; r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true})); return true;})()")


ev("localStorage.removeItem('wuri_sky_redlight_v1')")
cdp.call("Page.reload"); time.sleep(2.5)
# 日间
ev("localStorage.setItem('wuri_cfg','{}')"); 
report("③日间·红光关 meta=日色 #F5F1E6", ev(JS_META) == "#F5F1E6", ev(JS_META))
ev("WuriRedlight.set(true)")
report("③日间·红光开 meta=#080201 且 body.sky-red", ev(JS_META) == "#080201" and ev("document.body.classList.contains('sky-red')"), ev(JS_META))
ev("WuriRedlight.set(false)")
report("③日间·红光关 meta 恢复 #F5F1E6", ev(JS_META) == "#F5F1E6", ev(JS_META))
ev("WuriRedlight.set(true)"); set_theme("night")
report("⑤红光开时切夜间主题（applyTheme 内部路径）meta 不被盖回", ev(JS_META) == "#080201", ev(JS_META))
# 夜间
ev("WuriRedlight.set(false)")  # ⑤ 遗留开态，先关
report("④夜间·红光关 meta=夜色 #060608", ev(JS_META) == "#060608", ev(JS_META))
ev("WuriRedlight.set(true)")
report("④夜间·红光开 meta=#080201", ev(JS_META) == "#080201", ev(JS_META))
ev("WuriRedlight.set(false)")
report("④夜间·红光关 meta 恢复 #060608（不写死日色）", ev(JS_META) == "#060608", ev(JS_META))
# LS 冷启恢复
ev("WuriRedlight.set(true)")
cdp.call("Page.reload"); time.sleep(2.5)
report("⑥LS 预置开启·重载后 meta 直接 #080201", ev(JS_META) == "#080201", ev(JS_META))
report("⑥重载后 body.sky-red 在位", ev("document.body.classList.contains('sky-red')") is True)
report("零 JS 异常", ev("(window.__errs||[]).length") == 0, ev("window.__errs"))
ev("WuriRedlight.set(false)")

# ---------- ⑦–⑪ 全域抽样＋双开关同步（2026-10-25 全局口径） ----------
def click_xy(x, y):
    cdp.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
    cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
    cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    time.sleep(0.6)
def click_sel(sel):
    r = ev("(()=>{var e=document.querySelector(%s);if(!e)return null;e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();if(b.width<2||b.height<2)return null;return {x:b.left+b.width/2,y:b.top+b.height/2};})()" % json.dumps(sel))
    if not r: return False
    click_xy(r["x"], r["y"]); return True
def ensure_tab(tab):
    """点标签按钮并校验目标页真的显示；CDP 坐标点击偶发不触发时用 DOM click 兜底。"""
    if ev("getComputedStyle(document.getElementById(%s)).display" % json.dumps(tab)) != "none":
        return True
    click_sel("#tabbar button[data-tab=%s]" % tab)
    for _ in range(6):
        if ev("getComputedStyle(document.getElementById(%s)).display" % json.dumps(tab)) != "none":
            return True
        time.sleep(0.4)
    ev("document.querySelector('#tabbar button[data-tab=%s]').click()" % tab)
    time.sleep(0.6)
    return ev("getComputedStyle(document.getElementById(%s)).display" % json.dumps(tab)) != "none"
def click_text(txt):
    r = ev("(()=>{var es=[].slice.call(document.querySelectorAll('#tab-stars *'));var e=es.filter(function(x){return x.children.length<4 && (x.textContent||'').indexOf(%s)>=0;})[0];if(!e)return null;e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()" % json.dumps(txt))
    if not r: return False
    click_xy(r["x"], r["y"]); return True
def is_red(css_color):
    m = re.findall(r"\d+", css_color or "")
    if len(m) < 3: return False
    r, g, b = int(m[0]), int(m[1]), int(m[2])
    return r > g and r > b and r <= 60
import re
set_theme("day"); ev("WuriRedlight.set(false)"); time.sleep(0.6)
report("⑦body 底色红光关为宣纸（基线）", ev("getComputedStyle(document.body).backgroundColor") == "rgb(245, 241, 229)", ev("getComputedStyle(document.body).backgroundColor"))
ev("WuriRedlight.set(true)"); time.sleep(0.6)
report("⑦body 底色红光开 = rgb(5,2,2)（衬底/浅色带同源）", ev("getComputedStyle(document.body).backgroundColor") == "rgb(5, 2, 2)", ev("getComputedStyle(document.body).backgroundColor"))
report("⑦底栏红光底在位", is_red(ev("getComputedStyle(document.getElementById('tabbar')).backgroundColor")), ev("getComputedStyle(document.getElementById('tabbar')).backgroundColor"))
for tab, label in [("tab-home", "首页"), ("tab-cal", "黄历"), ("tab-jing", "经文"), ("tab-remind", "提醒"), ("tab-me", "我的")]:
    click_sel("#tabbar button[data-tab=%s]" % tab) if ev("!!document.querySelector('#tabbar button[data-tab=%s]')" % tab) else click_sel("#tabbar button")
    bg = ev("(()=>{var t=document.getElementById(%s);if(!t)return '';var es=[].slice.call(t.querySelectorAll('.card'));for(var i=0;i<es.length;i++){var b=getComputedStyle(es[i]).backgroundColor;if(b && b!=='rgba(0, 0, 0, 0)' && b!=='transparent') return b;}return '';})()" % json.dumps(tab))
    report("⑦主标签「%s」代表元素红谱" % label, is_red(bg), bg)
# 图鉴真点击路径：回星象页→「二十八宿星君」入口卡（stars.js 转发 deities-enter）
click_sel("#tabbar button[data-tab=stars]")
ev("window.scrollTo(0,0)")
click_text("二十八宿星君")
time.sleep(0.8)
if ev("document.getElementById('view-deities').hidden"):
    ev("document.getElementById('deities-enter').click()"); time.sleep(0.8)
dbg = ev("getComputedStyle(document.getElementById('view-deities')).backgroundColor")
report("⑧图鉴列表红化（背景红谱）", is_red(dbg), dbg)
shot1 = cdp.call("Page.captureScreenshot", {"format": "png"})
open(os.path.join(SHOTS, "red-deities-list-390.png"), "wb").write(base64.b64decode(shot1["data"]))
ev("(()=>{var c=document.querySelector('#view-deities .deity-card, #view-deities .d-item, #view-deities [data-deity]'); if(c) c.click();})()")
time.sleep(0.8)
ddb = ev("document.getElementById('view-deity-detail').hidden ? '' : getComputedStyle(document.getElementById('view-deity-detail')).backgroundColor")
report("⑧神祇详情红化（背景红谱）", is_red(ddb), ddb)
imgf = ev("(()=>{var i=document.querySelector('#view-deity-detail img'); return i? getComputedStyle(i).filter : 'noimg';})()")
report("⑧神像图片红移滤镜在位", "hue-rotate" in (imgf or ""), imgf)
shot2 = cdp.call("Page.captureScreenshot", {"format": "png"})
open(os.path.join(SHOTS, "red-deity-detail-390.png"), "wb").write(base64.b64decode(shot2["data"]))
click_sel("#deity-detail-back"); time.sleep(0.5)
click_sel("#deities-back"); time.sleep(0.5)
report("⑧返回后图鉴列表已收起", ev("document.getElementById('view-deities').hidden") is True)
report("⑩前置：红光仍开（防空过）", ev("WuriRedlight.on()") is True)
# 双开关同步：在设置页真点 #sky-red-toggle-me 关→星象开关同步；星象页真点开→设置同步
ensure_tab("tab-me"); ev("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(0.4)
for _ in range(3):
    if ev("WuriRedlight.on()") is False: break
    click_sel("label.switch:has(#sky-red-toggle-me)") or click_sel("#sky-red-toggle-me")
    time.sleep(0.3)
report("⑩设置页真点关红光→全局关＋星象开关同步关",
       ev("WuriRedlight.on()") is False and ev("document.getElementById('sky-red-toggle').checked") is False and ev(JS_META) == "#F5F1E6",
       ev(JS_META))
tab_ok = ensure_tab("tab-stars")
report("⑩星象标签页已激活", tab_ok)
ev("window.scrollTo(0,0)"); time.sleep(0.4)
for _ in range(3):
    if ev("document.getElementById('sky-red-toggle').checked") is True: break
    click_sel("label.switch:has(#sky-red-toggle)")
    time.sleep(0.3)
report("⑩星象页真点开红光→设置开关同步开＋meta 红",
       ev("document.getElementById('sky-red-toggle-me').checked") is True and ev(JS_META) == "#080201", ev(JS_META))
# 夜间基底全域抽样
set_theme("night"); ev("WuriRedlight.set(true)"); time.sleep(0.6)
report("⑪夜间基底红光仍全域（body 红＋meta 红）",
       ev("getComputedStyle(document.body).backgroundColor") == "rgb(5, 2, 2)" and ev(JS_META) == "#080201")
ev("WuriRedlight.set(false)"); time.sleep(0.6)
report("⑪夜间关红光全恢复（body 玄黑＋meta 夜色）",
       ev("getComputedStyle(document.body).backgroundColor") == "rgb(6, 6, 8)" and ev(JS_META) == "#060608",
       ev("getComputedStyle(document.body).backgroundColor"))
set_theme("day")
report("⑦–⑪后零 JS 异常", ev("(window.__errs||[]).length") == 0, ev("window.__errs"))

# ---------- ⑫ AR「重置对齐」改名断言 ----------
i18n_src = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("⑫i18n 简繁改名落齐且无旧名残留",
       "sx2_ar_cal_reset: '重置对齐'" in i18n_src and "sx2_ar_cal_reset: '重置對齊'" in i18n_src
       and "对星归零" not in i18n_src and "對星歸零" not in i18n_src)
ev("WuriSkyAR.open()")
time.sleep(1.8)
btn_txt = ev("(()=>{var b=document.querySelector('[data-ar=calreset]'); return b? b.textContent.trim() : '';})()")
report("⑫AR 面板按钮文案=重置对齐（DOM）", btn_txt == "重置对齐", btn_txt)
red_txt = ev("(()=>{var b=document.querySelector('[data-ar=red]'); return b? b.textContent.trim() : '';})()")
report("⑫AR 面板按钮文案=红光模式（叫法统一，DOM）", red_txt == "红光模式", red_txt)
report("⑫i18n 红光叫法统一落齐", "sx2_ar_red: '红光模式'" in i18n_src and "sx2_ar_red: '紅光模式'" in i18n_src)
ev("(()=>{try{WuriSkyAR.close();}catch(e){}})()")

shot = cdp.call("Page.captureScreenshot", {"format": "png"})
import base64
open(os.path.join(SHOTS, "meta-linkage-390.png"), "wb").write(base64.b64decode(shot["data"]))
report("截图存档", os.path.exists(os.path.join(SHOTS, "meta-linkage-390.png")))

try: chrome_proc.terminate()
except Exception: pass
npass = sum(1 for _, ok in results if ok)
out = os.path.join(SHOTS, "smoke-v2326-results.txt")
with open(out, "w", encoding="utf-8") as f:
    for name, ok in results:
        f.write(("PASS " if ok else "FAIL ") + name + "\n")
    f.write("TOTAL %d/%d\n" % (npass, len(results)))
print("TOTAL %d/%d -> %s" % (npass, len(results), out))

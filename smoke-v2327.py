# -*- coding: utf-8 -*-
"""v2.3.0 (SW v127) 专项冒烟：「我的」页设置归组 + 关于长文折叠。
- 「我的」页只剩 高级版/设置入口/关于；8 张设置卡迁入 #view-settings 子页。
- 真点击：我的→设置入口→子页打开（最上层断言）→ 时区单选翻转/恢复、主题切换、
  红光开关（与星象页开关同步 + theme-color）、语言简繁切换/恢复 → 返回滚动位保持。
- 数据备份/离线音频/图鉴素材：存在性 + 可点（elementFromPoint 命中）抽验，不真跑下载/导出。
- 关于：details 默认折叠（段落不可见）→ 点 summary 展开 8 段全在 → 再点收起；390/412 两轮截图。
结果落盘 themecolor 同级 settings127-shots/smoke-v2327-results.txt（直读为准）。
"""
import base64, importlib.util, json, os, re, subprocess, sys, time, urllib.request

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/settings127-shots")
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
report("SW v127 缓存名＋CSS ?v=127 预缓存", "wuri-v127" in sw_src and "style.css?v=127" in sw_src)
report("index CSS ?v=127＋静态内部号 v127", "style.css?v=127" in idx_src and "（内部 v127）" in idx_src)
report("me_ver 简繁 v127", "（内部 v127）" in i18n_src and "（內部 v127）" in i18n_src)
report("显示版本仍 v2.3.0", "v2.3.0" in i18n_src)

PORT = base.free_port()
prof = "/tmp/chrome-v2327-%d" % PORT
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
    if ev("getComputedStyle(document.getElementById(%s)).display" % json.dumps(tab)) != "none": return True
    click_sel("#tabbar button[data-tab=%s]" % tab)
    for _ in range(6):
        if ev("getComputedStyle(document.getElementById(%s)).display" % json.dumps(tab)) != "none": return True
        time.sleep(0.4)
    ev("document.querySelector('#tabbar button[data-tab=%s]').click()" % tab); time.sleep(0.6)
    return ev("getComputedStyle(document.getElementById(%s)).display" % json.dumps(tab)) != "none"
def shot(name):
    r = cdp.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
def set_theme(v):
    want = "night" if v == "night" else "day"
    for _ in range(3):
        ev("(()=>{var r=document.querySelector('input[name=theme][value=\"" + v + "\"]'); if(!r) return false; r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true})); return true;})()")
        time.sleep(0.5)
        if ev("document.documentElement.getAttribute('data-theme')") == want: return True
    return False
JS_META = "document.querySelector('meta[name=theme-color]').getAttribute('content')"

cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
time.sleep(3.2)
ev("localStorage.clear()")
cdp.call("Page.reload"); time.sleep(3)

# ② 我的页结构
ensure_tab("tab-me")
n_me = ev("document.querySelectorAll('#tab-me > section.card').length")
report("②「我的」页顶层卡 = 3（高级版/设置入口/关于）", n_me == 3, n_me)
report("②设置子页存在且初始隐藏，内含 8 卡",
       ev("!!document.getElementById('view-settings') && document.getElementById('view-settings').hidden && document.querySelectorAll('#view-settings section.card').length") == 8)
report("②设置卡已不在「我的」页直属（红光开关已随迁）",
       ev("!!document.querySelector('#tab-me #sky-red-toggle-me')") is False and ev("!!document.querySelector('#view-settings #sky-red-toggle-me')") is True)

# ③ 真点击进设置
ev("window.scrollTo(0, 260)"); time.sleep(0.4)
y_before = ev("window.scrollY")
shot("me-390.png")
clicked = click_sel("#settings-open")
time.sleep(0.5)
top_ok = ev("(()=>{var v=document.getElementById('view-settings'); if(v.hidden) return false; var r=v.getBoundingClientRect(); var t=document.elementFromPoint(r.left+r.width/2, 120); return !!(t && (t===v || v.contains(t)));})()")
report("③真点击设置入口→子页打开且在最上层", clicked and ev("document.getElementById('view-settings').hidden") is False and top_ok)
shot("settings-390.png")

# ④ 控件抽验
# 时区单选组：翻转一个再恢复
tz = ev("(()=>{var rs=[].slice.call(document.querySelectorAll('#view-settings input[type=radio]')); var g={}; rs.forEach(function(r){(g[r.name]=g[r.name]||[]).push(r);}); var names=Object.keys(g).filter(function(n){return n!=='theme' && n!=='lang';}); if(!names.length) return null; var arr=g[names[0]]; var cur=arr.filter(function(r){return r.checked;})[0]; var other=arr.filter(function(r){return !r.checked;})[0]; if(!other) return null; return {name:names[0], cur:cur.value, other:other.value};})()")
if tz:
    ev("(()=>{var r=document.querySelector('#view-settings input[name=%s][value=\\\"" + "\\\"]');})()" % "x") if False else None
    flip = ev("(()=>{var r=document.querySelector('#view-settings input[name=\"" + tz["name"] + "\"][value=\"" + tz["other"] + "\"]'); if(!r) return false; r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true})); return document.querySelector('#view-settings input[name=\"" + tz["name"] + "\"]:checked').value;})()")
    back = ev("(()=>{var r=document.querySelector('#view-settings input[name=\"" + tz["name"] + "\"][value=\"" + tz["cur"] + "\"]'); if(!r) return false; r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true})); return document.querySelector('#view-settings input[name=\"" + tz["name"] + "\"]:checked').value;})()")
    report("④时区单选组（%s）翻转→生效→恢复" % tz["name"], flip == tz["other"] and back == tz["cur"], (flip, back))
else:
    report("④时区单选组存在", False, "未找到单选组")
# 主题切换
set_theme("night"); time.sleep(0.3)
night_ok = ev("document.documentElement.getAttribute('data-theme')") == "night"
set_theme("day"); time.sleep(0.3)
report("④外观主题子页内切换夜→日恢复", night_ok and ev("document.documentElement.getAttribute('data-theme')") == "day")
# 红光开关（设置内真点击）+ 同步 + theme-color
for _ in range(3):
    if ev("WuriRedlight.on()") is True: break
    click_sel("label.switch:has(#sky-red-toggle-me)")
    time.sleep(0.3)
report("④设置内真点开红光→全红＋星象开关同步＋meta 红",
       ev("WuriRedlight.on()") is True and ev("document.body.classList.contains('sky-red')")
       and ev("document.getElementById('sky-red-toggle').checked") is True and ev(JS_META) == "#080201", ev(JS_META))
for _ in range(3):
    if ev("WuriRedlight.on()") is False: break
    click_sel("label.switch:has(#sky-red-toggle-me)")
    time.sleep(0.3)
report("④设置内真点关红光→全恢复＋meta 回日色",
       ev("WuriRedlight.on()") is False and ev(JS_META) == "#F5F1E6", ev(JS_META))
# 语言：切繁→标题变「設定」→切简恢复
lang_vals = ev("(()=>{var rs=[].slice.call(document.querySelectorAll('#view-settings input[name=lang]')); return rs.map(function(r){return r.value;});})()")
if lang_vals and len(lang_vals) >= 2:
    cur_lang = ev("document.querySelector('#view-settings input[name=lang]:checked') ? document.querySelector('#view-settings input[name=lang]:checked').value : ''")
    tw = [v for v in lang_vals if v != cur_lang and ('TW' in v or 'HK' in v or 'Hant' in v)]
    target = tw[0] if tw else [v for v in lang_vals if v != cur_lang][0]
    ev("(()=>{var r=document.querySelector('#view-settings input[name=lang][value=\"" + target + "\"]'); r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true}));})()")
    time.sleep(0.8)
    h1_tw = ev("document.querySelector('#view-settings .brand-title').textContent.trim()")
    ev("(()=>{var r=document.querySelector('#view-settings input[name=lang][value=\"" + cur_lang + "\"]'); r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true}));})()")
    time.sleep(0.8)
    h1_back = ev("document.querySelector('#view-settings .brand-title').textContent.trim()")
    report("④语言切换繁（%s）→子页标题「設定」→切简恢复「设置」" % target,
           h1_tw == "設定" and h1_back == "设置", (h1_tw, h1_back))
else:
    report("④语言单选组存在", False, lang_vals)
# 下载/备份类：存在 + 可点命中（不真跑）
for bid, label in [("backup-export", "数据备份·导出"), ("deity-dl-btn", "图鉴素材·下载"), ("deity-del-btn", "图鉴素材·删除")]:
    hit = ev("(()=>{var e=document.getElementById('" + bid + "'); if(!e) return false; e.scrollIntoView({block:'center'}); var b=e.getBoundingClientRect(); var t=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2); return !!(t && (t===e || e.contains(t)));})()")
    report("④%s 按钮在位且可点命中" % label, hit is True)
off_btn = ev("(()=>{var bs=[].slice.call(document.querySelectorAll('#view-settings button')); return bs.some(function(b){return /离线|下載|下载/.test(b.textContent) && b.closest('section') && /离线音频|離線音頻/.test(b.closest('section').textContent);});})()")
report("④离线音频卡与下载按钮在位", off_btn is True)
report("④图鉴素材说明含清单口径（102 位）", "102" in (ev("document.getElementById('deity-dl-desc').textContent") or ""))

# ⑤ 返回与滚动位
y_open = ev("window.scrollY")
click_sel("#settings-back"); time.sleep(0.5)
report("⑤返回→子页收起＋关闭不重置滚动（与打开时一致）",
       ev("document.getElementById('view-settings').hidden") is True and abs((ev("window.scrollY") or 0) - (y_open or 0)) <= 2,
       (y_open, ev("window.scrollY")))

# ⑥ 关于折叠
ev("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(0.5)
report("⑥关于基本信息可见（版本行含 v127）",
       "v127" in (ev("(()=>{var e=document.querySelector('[data-i18n=me_ver]'); return e? e.textContent:'';})()") or ""))
fold_state = ev("(()=>{var d=document.querySelector('details.about-more'); if(!d) return null; return {open:d.open, summary:d.querySelector('summary').textContent.trim(), h:Math.round(d.getBoundingClientRect().height)};})()")
report("⑥鸣谢折叠默认关闭＋标题「鸣谢与说明」＋折叠高度仅标题行",
       fold_state and fold_state["open"] is False and fold_state["summary"] == "鸣谢与说明" and fold_state["h"] < 64, fold_state)
shot("about-folded-390.png")
click_sel("details.about-more > summary"); time.sleep(0.5)
opened = ev("(()=>{var d=document.querySelector('details.about-more'); var ps=[].slice.call(d.querySelectorAll('p')); return {open:d.open, vis:ps.filter(function(p){return p.getClientRects().length>0;}).length, total:ps.length, txt:d.textContent};})()")
KW = ["掌上乾坤", "liuyao-tool", "增删卜易", "Astronomy", "Bostock", "漫步中国星空", "灵台秘苑", "清玄道长"]
h_open = ev("Math.round(document.querySelector('details.about-more').getBoundingClientRect().height)")
report("⑥点开折叠→展开且 8 段全可见、署名关键词全在、高度远超折叠态",
       opened and opened["open"] is True and opened["vis"] == opened["total"] and all(k in opened["txt"] for k in KW) and h_open > fold_state["h"] + 200,
       (opened or {}).get("vis"))
shot("about-expanded-390.png")
click_sel("details.about-more > summary"); time.sleep(0.4)
report("⑥再点→收起恢复", ev("document.querySelector('details.about-more').open") is False)

# ⑦ 412 宽度轮
cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
time.sleep(0.8)
ev("window.scrollTo(0, 260)"); click_sel("#settings-open"); time.sleep(0.5)
report("⑦412：设置子页可打开", ev("document.getElementById('view-settings').hidden") is False)
shot("settings-412.png")
click_sel("#settings-back"); time.sleep(0.4)
ev("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(0.4)
click_sel("details.about-more > summary"); time.sleep(0.5)
report("⑦412：关于折叠可展开", ev("document.querySelector('details.about-more').open") is True)
shot("about-expanded-412.png")

report("零 JS 异常", ev("(window.__errs||[]).length") == 0, ev("window.__errs"))
try: chrome_proc.terminate()
except Exception: pass
npass = sum(1 for _, ok in results if ok)
lines = [("PASS " if ok else "FAIL ") + n for n, ok in results]
lines.append("TOTAL %d/%d" % (npass, len(results)))
open(os.path.join(OUT, "smoke-v2327-results.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))

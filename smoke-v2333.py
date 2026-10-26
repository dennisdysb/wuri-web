#!/usr/bin/env python3
# 阶段B第2件专项冒烟（SW v133）：七十二候接入黄历详情。
# 口径：日期级、节气区间三等分定候；交节当日入新节气。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/pentads133-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:600]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
idx, sw, i18n = rd("index.html"), rd("sw.js"), rd("js/i18n.js")
feedjs = rd("js/content-feed.js")
report("S1 四件套 v133", "wuri-v133-20261025-v230" in sw and 'css/style.css?v=133' in idx
       and 'css/style.css?v=133' in sw and i18n.count("v133") == 2 and "内部 v133" in idx)
report("S2 pentads-data 进 SW 预缓存", "'./js/pentads-data.js'" in sw and 'src="js/pentads-data.js"' in idx)
man = json.load(open(os.path.join(WWW, "content/manifest.json"), encoding="utf-8"))
pdata = json.load(open(os.path.join(WWW, "content/pentads.json"), encoding="utf-8"))
report("S3 feed manifest 含 pentads 段", man["sections"].get("pentads", {}).get("count") == 72
       and man["sections"]["pentads"].get("file") == "pentads.json", man["sections"].keys())
report("S4 数据72候且裁定鹰始挚", len(pdata["pentads"]) == 72 and any(
    x["term"] == "小暑" and x["phase"] == 3 and x["name"] == "鹰始挚" for x in pdata["pentads"]))
report("S5 content-feed 接 pentads", "pentads" in feedjs and "validPentads" in feedjs and "WURI_PENTADS_DATA" in feedjs)
report("S6 两源 MIT 鸣谢简繁齐", i18n.count("health-calendar") == 2 and i18n.count("PimplesOnNose") == 2
       and "me_credit_pentads_a" in idx and "me_credit_pentads_b" in idx)

port = base.free_port(); prof = f"/tmp/chrome-pentads133-{port}"
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
c = base.CDP(base.ws_connect(wsurl)); errs = []
c.call("Page.enable"); c.call("Runtime.enable")
c.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"})
c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
time.sleep(3)

def ev(expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return r["result"].get("value")
def click_el(sel):
    ev(f"document.querySelector({json.dumps(sel)}).click()"); time.sleep(.45)
def pentad():
    return ev("""(()=>{const c=document.getElementById('pentad-card');if(!c)return null;return {
      hidden:c.hidden,title:document.getElementById('pentad-title').textContent,
      desc:document.getElementById('pentad-desc').textContent,
      chips:[...document.querySelectorAll('.pentad-chip')].map(x=>x.textContent),
      on:[...document.querySelectorAll('.pentad-chip.on')].map(x=>x.textContent),
      h:c.getBoundingClientRect().height};})()""")
def click_day(d):
    ev(f"""(()=>{{const cells=[...document.querySelectorAll('#cal-grid .day:not(.other)')];
      const cell=cells.find(x=>x.querySelector('.s')&&x.querySelector('.s').textContent==='{d}');if(cell)cell.click();}})()""")
    time.sleep(.5)
def title_text():
    return ev("document.getElementById('cal-title').textContent")

click_el('[data-tab="tab-cal"]')
st = pentad()
report("P1 当前日候卡可见且为霜降初候豺乃祭兽", st and not st["hidden"] and st["h"] > 40
       and "霜降" in st["title"] and "初候" in st["title"] and "豺乃祭兽" in st["title"], st)
report("P2 三候进度=3 且仅当前候高亮", st and len(st["chips"]) == 3 and len(st["on"]) == 1
       and "豺乃祭兽" in st["on"][0], st)
shot = c.call("Page.captureScreenshot", {"format": "png"})
open(os.path.join(OUT, "pentad-cal-390.png"), "wb").write(base64.b64decode(shot["data"]))

click_day(23)  # 霜降交节当日
st = pentad(); report("P3 交节当日仍入霜降初候", st and "霜降" in st["title"] and "初候" in st["title"], st)
click_el("#cal-next")
report("P4 翻月到 2026年11月", "2026年11月" in title_text(), title_text())
click_day(13)  # 立冬（11/7）后第 6 天 → 二候地始冻
st = pentad(); report("P5 立冬二候地始冻", st and "立冬" in st["title"] and "二候" in st["title"] and "地始冻" in st["title"], st)
for _ in range(4): click_el("#cal-prev")
report("P6 回到 2026年7月", "2026年7月" in title_text(), title_text())
click_day(13)  # 小暑（7/7）后第 6 天，16 天区间三等分 → 二候蟋蟀居壁
st = pentad(); report("P7 小暑二候蟋蟀居壁", st and "小暑" in st["title"] and "二候" in st["title"] and "蟋蟀居壁" in st["title"], st)
for _ in range(5): click_el("#cal-prev")
report("P8 回到 2026年2月", "2026年2月" in title_text(), title_text())
click_day(4)  # 立春当日
st = pentad(); report("P9 立春当日初候东风解冻", st and "立春" in st["title"] and "初候" in st["title"] and "东风解冻" in st["title"], st)
report("P10 feed 回落数据已装载", ev("!!(window.WURI_PENTADS_DATA&&window.WURI_PENTADS_DATA.pentads.length===72)"))
ev("localStorage.setItem('wuri_lang_v1','zh-TW')"); c.call("Page.reload", {}); time.sleep(2.5)
body = ev("document.body.textContent") or ""
report("P11 繁体鸣谢渲染", "七十二候數據據" in body and "Suìshí 歲時" in body)
errs = ev("window.__errs") or []
report("Z1 零 JS 异常", not errs, errs[:3])
n = sum(1 for _, ok in results if ok)
open(os.path.join(OUT, "smoke-v2333-results.txt"), "w", encoding="utf-8").write(
    "\n".join(("PASS " if ok else "FAIL ") + name for name, ok in results) + f"\nSMOKE v2333: {n}/{len(results)} passed\n")
print(f"SMOKE v2333: {n}/{len(results)} passed")
proc.terminate()
sys.exit(0 if n == len(results) else 1)

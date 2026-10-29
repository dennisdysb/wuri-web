#!/usr/bin/env python3
# 专项冒烟：磬钮全书开放（用户 2026-10-29 晚定，supersede v316 收紧）
# 三类书（常见经文/常见内丹书籍/道藏全集）阅读器内一律显示磬悬浮钮、
# 点即敲磬（audio/qing.mp3）；标注书内联（敲磬）渲染与点按保持原样。
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib

_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/qing-all/www")
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:300]), flush=True)

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
jw = rd("js/jingwen.js")

report("S1 磬闸已拆：无 fabIsNdDz、显隐只随 showReader",
       "fabIsNdDz" not in jw and "qFab.classList.toggle('show', !!showReader)" in jw)
report("S2 内联（敲磬）渲染与点按播放路径原样在位",
       "qing-inline" in jw and "data-qing" in jw and "audio/qing.mp3" in jw)

port = base.free_port(); prof = f"/tmp/chrome-qingall-{port}"
proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
    "--allow-file-access-from-files",
    "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
    f"--remote-debugging-port={port}",
    f"--user-data-dir={prof}", "--window-size=360,740", "about:blank"],
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
window.__plays=[];(function(){var OP=HTMLAudioElement.prototype.play;
HTMLAudioElement.prototype.play=function(){window.__plays.push(this.src||'');return OP.apply(this,arguments);};})();
try{ localStorage.setItem('wuri_pro_redeem','1'); }catch(e){}
"""})
cdp.call("Emulation.setDeviceMetricsOverride", {"width": 360, "height": 740, "deviceScaleFactor": 2, "mobile": True})
cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})

def ev(expr):
    last = None
    for _ in range(4):
        try: return cdp.evaluate(expr)
        except Exception as e:
            if '"type": "undefined"' in str(e): return None
            last = e; time.sleep(1)
    raise last

for _ in range(120):
    try:
        if ev("document.readyState") == "complete" and ev("!!window.JingWen"): break
    except Exception: pass
    time.sleep(0.5)
time.sleep(1.0)

def open_book(bid, tries=60):
    ev("window.JingWen.openReader(%s); true" % json.dumps(bid))
    for _ in range(tries):
        if ev("window._jingCurrentId") == bid and ev("document.getElementById('jing-reader').hidden") is False:
            break
        time.sleep(0.5)
    time.sleep(0.9)  # 等 updateFab 500ms 周期落闸
    return ev("window._jingCurrentId") == bid

def qing_shown():
    return ev("(function(){var b=document.getElementById('qing-btn');return !!(b&&b.classList.contains('show'));})()")

def plays_qing():
    return ev("(window.__plays||[]).filter(function(s){return s.indexOf('audio/qing.mp3')>=0;}).length")

# ---------- 常见经文（带标注）：《全真早晚功课经》s02 ----------
ok_open = open_book("s02")
report("Q1 打开常见经文 s02（功课经）", ok_open)
report("Q2 常见经文磬钮在位（show）", qing_shown())
n_marks = ev("document.querySelectorAll('#jing-content [data-qing]').length")
report("Q3 内联（敲磬）标注仍渲染（标注书不回归）", (n_marks or 0) > 0, n_marks)
p0 = plays_qing()
ev("document.getElementById('qing-btn').click(); true")
time.sleep(0.4)
report("Q4 点磬钮出声（qing.mp3 播放调用）", plays_qing() > p0, plays_qing())
p1 = plays_qing()
ev("(function(){var m=document.querySelector('#jing-content [data-qing]'); if(m){m.dispatchEvent(new MouseEvent('click',{bubbles:true}));} return !!m;})()")
time.sleep(0.4)
report("Q5 点内联（敲磬）标注仍出声（原行为保持）", plays_qing() > p1, plays_qing())

# ---------- 悬浮钮拖拽位置记忆（qing 分格） ----------
ev("""(function(){var el=document.getElementById('qing-btn');var r=el.getBoundingClientRect();
var cx=r.left+r.width/2, cy=r.top+r.height/2;
el.dispatchEvent(new PointerEvent('pointerdown',{clientX:cx,clientY:cy,pointerId:7,bubbles:true}));
window.dispatchEvent(new PointerEvent('pointermove',{clientX:cx-60,clientY:cy-80,pointerId:7,bubbles:true}));
window.dispatchEvent(new PointerEvent('pointerup',{clientX:cx-60,clientY:cy-80,pointerId:7,bubbles:true}));
return true;})()""")
time.sleep(0.5)
pos = ev("JSON.parse(localStorage.getItem('wuri_jing_fabpos_v1')||'{}')")
report("Q6 磬钮拖拽后位置入 wuri_jing_fabpos_v1.qing", isinstance(pos, dict) and "qing" in pos, pos)

# ---------- 常见内丹书籍：s18 ----------
ok_open = open_book("s18")
report("Q7 打开内丹书 s18", ok_open)
report("Q8 内丹书磬钮在位（本批新增面）", qing_shown())
p2 = plays_qing()
ev("document.getElementById('qing-btn').click(); true")
time.sleep(0.4)
report("Q9 内丹书点磬出声", plays_qing() > p2, plays_qing())

# ---------- 道藏全集：KR5a0220 ----------
try:
    ok_open = open_book("KR5a0220", tries=80)
    paras = ev("document.querySelectorAll('#jing-content .jing-para').length")
    report("Q10 打开道藏书 KR5a0220", ok_open and (paras or 0) > 0, paras)
    report("Q11 道藏书磬钮在位（本批新增面）", qing_shown())
    p3 = plays_qing()
    ev("document.getElementById('qing-btn').click(); true")
    time.sleep(0.4)
    report("Q12 道藏书点磬出声", plays_qing() > p3, plays_qing())
except Exception as e:
    report("Q10 打开道藏书 KR5a0220", False, str(e)[:200])
    report("Q11 道藏书磬钮在位（本批新增面）", False, "open failed")
    report("Q12 道藏书点磬出声", False, "open failed")

# ---------- 关阅读器：磬钮随之隐 ----------
ev("if(window.closeReader) window.closeReader(); true")
time.sleep(0.9)
report("Q13 关阅读器后磬钮隐（显隐只随阅读器）", qing_shown() is False)

# ---------- 夜间＋红光态：内丹书再开仍在位；360 档无横溢 ----------
ev("document.querySelector('input[name=theme][value=night]').click(); true")
time.sleep(1.0)
ev("var __rbt = document.getElementById('sky-red-toggle-me'); if (__rbt && !__rbt.checked) __rbt.click(); true")
time.sleep(0.4)
open_book("s18")
report("Q14 夜间＋红光态内丹书磬钮仍在位", qing_shown())
report("Q15 360 档阅读器无横向溢出", (ev("document.documentElement.scrollWidth") or 999) <= 362,
       ev("document.documentElement.scrollWidth"))

errs = ev("window.__errs || []")
report("Q16 全程无 JS 异常", errs == [], errs)

fails = [n for n, ok in R if not ok]
print("\n结果: PASS %d / FAIL %d %s" % (len(R) - len(fails), len(fails), fails))
try: proc.terminate()
except Exception: pass
sys.exit(1 if fails else 0)

#!/usr/bin/env python3
# 机制实验：toggleRecite 兜底（openReader 整书重渲）在「autopos 展开集不满」
# 存档下是否落到篇首——renderReaderBody 有明文：autoAll && posExp 不满全节
# → posY=0。本实验不改 App 代码：人为把 JINGWEN.s04 挪走使 toggleRecite 的
# 未就绪判定成立（模拟真机误触发），观察落点是否为用户截图三联征：
# 背诵形态＋scrollY≈0＋状态行＝开经玄蕴咒。
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib

_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/recite-fix2/www")
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]), flush=True)

port = base.free_port(); prof = f"/tmp/chrome-recitemech-{port}"
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
try{ localStorage.setItem('wuri_pro_redeem','1'); localStorage.setItem('wuri_jing_recite','0');
     localStorage.setItem('wuri_jing_py','0'); localStorage.setItem('wuri_jing_font','28');
     /* 真机式存档：展开集不满全节（上次关书时只开着读的那节）＋已读过一段 */
     localStorage.setItem('wuri_jing_autopos', JSON.stringify({s04:{y:9000, expanded:[5], ts:Date.now()-86400000, covFrac:0.34, off:900}}));
}catch(e){}
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
ev("document.querySelector('button[data-tab=\"tab-jing\"]').click(); true")
time.sleep(1.2)

try:
    ev("""(function(){ var el=document.querySelector('#jing-list .jing-item[data-jing="s04"]');
        if(el){ el.scrollIntoView({block:'center'}); el.click(); } return !!el; })()""")
    for _ in range(40):
        if ev("window._jingCurrentId") == "s04" and (ev("document.querySelectorAll('#jing-content p.jing-para').length") or 0) > 0:
            break
        time.sleep(0.5)
    time.sleep(4.2)  # 等开书 insistReaderPos 收工（偏展开集→posY=0 落顶，符合其注释口径）
    # 滚到持诵功德节首（直接定位，避免 insist 干扰已过窗口）
    ev("""(function(){ var el=document.querySelector('#jing-content p.jing-para[data-sec="5"][data-para="0"]');
        if(el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 110); return !!el; })()""")
    time.sleep(1.0)
    st = ev("JSON.stringify({y: window.scrollY, status: (document.getElementById('jing-status-text')||{}).textContent})")
    print("  点背前:", st, flush=True)
    # 制造未就绪：挪走数据模型（DOM 还在）→ 点背应走兜底
    ev("window.__stash = window.JINGWEN['s04']; delete window.JINGWEN['s04']; true")
    ev("""(function(){ window.__mut=0; var mo=new MutationObserver(function(ms){ ms.forEach(function(m){ window.__mut += (m.addedNodes.length+m.removedNodes.length); }); });
        mo.observe(document.getElementById('jing-content'), {childList:true}); return 'ok'; })()""")
    ev("document.getElementById('jing-recite').click(); true")
    time.sleep(3.5)
    out = ev("""JSON.stringify({ y: window.scrollY, mut: window.__mut,
        reciteOn: document.getElementById('jing-content').classList.contains('recite-on'),
        status: (document.getElementById('jing-status-text')||{}).textContent,
        titleVis: (function(){ var t=document.getElementById('jing-title'); var r=t?t.getBoundingClientRect():null; return r? Math.round(r.top):null; })() })""")
    print("  兜底后:", out, flush=True)
    o = json.loads(out)
    report("M1 兜底被触发（整书重渲）", o["mut"] and o["mut"] > 10, out)
    report("M2 兜底落点＝篇首（scrollY≈0、书名入视口）", o["y"] is not None and o["y"] <= 4 and o["titleVis"] is not None and o["titleVis"] > -50, out)
    report("M3 形态与状态行同截图（背诵态＋开经玄蕴咒）", o["reciteOn"] and o["status"] and "开经玄蕴咒" in o["status"], out)
    ev("window.JINGWEN['s04'] = window.__stash; true")
    errs = ev("window.__errs")
    report("Z0 无 JS 异常", not errs, json.dumps(errs)[:200] if errs else "")
finally:
    try: proc.terminate()
    except Exception: pass
fails = [n for n, ok in R if not ok]
print(f"\n==== {len(R)-len(fails)}/{len(R)} PASS" + ((" FAIL: " + ", ".join(fails)) if fails else ""))
sys.exit(1 if fails else 0)

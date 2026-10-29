#!/usr/bin/env python3
# 专项冒烟：背诵落点三案（2026-10-29 15:13 真机三报 s04《太上玄灵北斗本命
# 延生真经》读到持诵功德点「背」回篇首）修复验收：
# A 真机同构：列表点开＋两程有机历史＋注音关＋字号 28，原地进/出背落点不动；
# B 数据误触发兜底收紧：点背瞬间数据模型不可达——B1 数据 0.6s 后回来：
#   轮询接住、原地换段（零整书重渲）、落点不动；B2 数据始终不回：重渲＋
#   jumpToSec 锚点接管，落点仍在持诵功德、绝不回篇首；
# C 晚到位移看守：进背收敛后（旧 1.7s 窗口已过）人为把上方节行高撑大
#   （模拟网络字体切片迟到改高），看守应把锚点纠回原位。
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib

_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]), flush=True)

port = base.free_port(); prof = f"/tmp/chrome-recites04fix-{port}"
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
     localStorage.setItem('wuri_jing_py','0'); localStorage.setItem('wuri_jing_font','28'); }catch(e){}
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

HELPERS = """
window.__ri = {
  expanded: function(){ var o=[]; document.querySelectorAll('#jing-content .jing-sec-body').forEach(function(b){ if(!b.hidden) o.push(+b.parentNode.getAttribute('data-sec')); }); return o; },
  anchor: function(){ var ps=document.querySelectorAll('#jing-content p.jing-para');
    for(var i=0;i<ps.length;i++){ var b=ps[i].closest('.jing-sec-body'); if(!b||b.hidden) continue;
      var r=ps[i].getBoundingClientRect(); if(r.bottom>0) return {sec:+ps[i].getAttribute('data-sec'), para:+ps[i].getAttribute('data-para'), top:(Math.round(r.top)|0)}; } return null; },
  status: function(){ var t=document.getElementById('jing-status-text'); return t?t.textContent.trim():null; },
  paraTop: function(s,p){ var el=document.querySelector('#jing-content p.jing-para[data-sec="'+s+'"][data-para="'+p+'"]');
    return el?(Math.round(el.getBoundingClientRect().top)|0):null; },
  paraDocTop: function(s,p){ var el=document.querySelector('#jing-content p.jing-para[data-sec="'+s+'"][data-para="'+p+'"]');
    if(!el) return null; return Math.round(el.getBoundingClientRect().top + window.scrollY); },
  reciteOn: function(){ var c=document.getElementById('jing-content'); return !!(c&&c.classList.contains('recite-on')); }
};
'ok'"""
ev(HELPERS)

def open_from_list():
    ev("""(function(){ var el=document.querySelector('#jing-list .jing-item[data-jing="s04"]');
        if(el){ el.scrollIntoView({block:'center'}); el.click(); } return !!el; })()""")
    for _ in range(40):
        if ev("window._jingCurrentId") == "s04" and (ev("document.querySelectorAll('#jing-content p.jing-para').length") or 0) > 0:
            break
        time.sleep(0.5)
    time.sleep(1.0)
    ev(HELPERS)

def goto_sec5():
    """迭代收敛：量测→滚→等→再量，直到持诵功德首段 top 落在 [90,130]
    （页面在字体落定前会持续长高，一次 scrollTo 必失位）"""
    for _ in range(8):
        t = ev("window.__ri.paraTop(5,0)")
        if t is None: break
        if 25 <= t <= 55: break
        ev("window.scrollBy(0, %d); 'ok'" % (t - 40))
        time.sleep(0.45)
    time.sleep(0.6)

def arm_mut():
    ev("""(function(){ window.__mut=0;
      if(window.__mo) window.__mo.disconnect();
      var mo=new MutationObserver(function(ms){ ms.forEach(function(m){ window.__mut += (m.addedNodes.length+m.removedNodes.length); }); });
      mo.observe(document.getElementById('jing-content'), {childList:true}); window.__mo=mo; return 'ok'; })()""")

TOL = 60
try:
    # ---------- A 真机同构 ----------
    open_from_list()
    E = ev("window.__ri.expanded()")
    report("A1 列表点开 s04、全节展开", ev("window._jingCurrentId") == "s04" and len(E or []) == 11, json.dumps(E))
    goto_sec5()
    A = ev("window.__ri.anchor()")
    report("A2 到达持诵功德", A and A["sec"] == 5, json.dumps(A))
    ev("window.JingWen.closeReader(); true"); time.sleep(0.8)
    open_from_list()
    time.sleep(4.2)  # 开书 insistReaderPos 收工后再动
    goto_sec5()
    A0 = ev("window.__ri.anchor()"); P0 = ev("window.__ri.status()")
    report("A3 点背前：人在持诵功德首段", A0 and A0["sec"] == 5 and A0["para"] == 0, json.dumps({"A0": A0, "S": P0}))
    arm_mut()
    ev("document.getElementById('jing-recite').click(); true")
    time.sleep(2.6)
    A1 = ev("window.__ri.anchor()"); mut = ev("window.__mut")
    top1 = ev("window.__ri.paraTop(%d,%d)" % (A0["sec"], A0["para"])) if A0 else None
    report("A4 进背：原地换段（零重渲）＋落点不动",
           ev("window.__ri.reciteOn()") and mut == 0 and A1 and A1["sec"] == A0["sec"] and A1["para"] == A0["para"]
           and top1 is not None and A0 and abs(top1 - A0["top"]) <= TOL,
           json.dumps({"mut": mut, "A1": A1, "top1": top1, "A0top": A0 and A0["top"]}))
    ev("document.getElementById('jing-recite').click(); true")
    time.sleep(2.6)
    A2 = ev("window.__ri.anchor()"); top2 = ev("window.__ri.paraTop(%d,%d)" % (A0["sec"], A0["para"])) if A0 else None
    report("A5 退背：回原位", (not ev("window.__ri.reciteOn()")) and A2 and A2["sec"] == A0["sec"] and A2["para"] == A0["para"]
           and top2 is not None and abs(top2 - A0["top"]) <= TOL,
           json.dumps({"A2": A2, "top2": top2}))

    # ---------- B1 数据迟到：轮询接住、原地换段 ----------
    goto_sec5()
    A0 = ev("window.__ri.anchor()")
    ev("window.__stash = window.JINGWEN['s04']; delete window.JINGWEN['s04']; true")
    arm_mut()
    ev("document.getElementById('jing-recite').click(); true")
    time.sleep(0.6)
    ev("window.JINGWEN['s04'] = window.__stash; true")  # 数据 0.6s 后回来
    time.sleep(2.6)
    A1 = ev("window.__ri.anchor()"); mut = ev("window.__mut"); top1 = ev("window.__ri.paraTop(%d,%d)" % (A0["sec"], A0["para"])) if A0 else None
    report("B1 数据迟到被轮询接住：原地换段、零重渲、落点不动",
           ev("window.__ri.reciteOn()") and mut == 0 and A1 and A1["sec"] == A0["sec"] and A1["para"] == A0["para"]
           and top1 is not None and A0 and abs(top1 - A0["top"]) <= TOL,
           json.dumps({"mut": mut, "A0": A0, "A1": A1, "top1": top1}))
    ev("document.getElementById('jing-recite').click(); true"); time.sleep(2.6)
    report("B1x 退背复原", not ev("window.__ri.reciteOn()"))

    # ---------- B2 数据真缺：重渲＋锚点接管 ----------
    goto_sec5()
    ev("window.__stash = window.JINGWEN['s04']; delete window.JINGWEN['s04']; true")
    ev("""(function(){ var ap={}; try{ ap=JSON.parse(localStorage.getItem('wuri_jing_autopos')||'{}'); }catch(e){}
        if(ap.s04){ ap.s04.expanded=[5]; localStorage.setItem('wuri_jing_autopos', JSON.stringify(ap)); } return 'ok'; })()""")
    ev("document.getElementById('jing-recite').click(); true")
    time.sleep(7.5)  # 2s 轮询期满→重渲→jumpInsist 与开书落位赛跑，留足收敛时间
    S = ev("window.__ri.status()"); Y = ev("window.scrollY"); topB = ev("window.__ri.paraTop(5,0)")
    report("B2 数据真缺走重渲＋接管：落点在持诵功德、绝不回篇首",
           ev("window.__ri.reciteOn()") and S and "持诵功德" in S and Y and Y > 1000
           and topB is not None and -80 <= topB <= 220,
           json.dumps({"S": S, "Y": Y, "topB": topB}))
    ev("window.JINGWEN['s04'] = window.__stash; true")
    ev("document.getElementById('jing-recite').click(); true"); time.sleep(3.0)
    report("B2x 退背复原", not ev("window.__ri.reciteOn()"))

    # ---------- C 晚到位移看守 ----------
    goto_sec5()
    A0 = ev("window.__ri.anchor()")
    ev("document.getElementById('jing-recite').click(); true")
    time.sleep(2.6)  # 旧坚持窗口（1.7s）已过、看守期内
    topBefore = ev("window.__ri.paraTop(5,0)")
    ev("""(function(){ var st=document.createElement('style'); st.id='smoke-shift';
        st.textContent='#jing-content .jing-sec[data-sec="0"] p.jing-para, #jing-content .jing-sec[data-sec="1"] p.jing-para, #jing-content .jing-sec[data-sec="2"] p.jing-para{line-height:2.6 !important;}';
        document.head.appendChild(st); return 'ok'; })()""")
    time.sleep(2.2)
    topAfter = ev("window.__ri.paraTop(5,0)")
    ev("var s=document.getElementById('smoke-shift'); if(s) s.remove(); 'ok'")
    report("C1 晚到位移后看守纠回（锚点回原位 ±60px）",
           topBefore is not None and topAfter is not None and abs(topAfter - topBefore) <= TOL,
           json.dumps({"topBefore": topBefore, "topAfter": topAfter, "A0": A0}))
    ev("document.getElementById('jing-recite').click(); true"); time.sleep(2.0)

    errs = ev("window.__errs")
    report("Z0 全程无 JS 异常", not errs, json.dumps(errs)[:200] if errs else "")
finally:
    try: proc.terminate()
    except Exception: pass

fails = [n for n, ok in R if not ok]
print(f"\n==== {len(R)-len(fails)}/{len(R)} PASS" + ((" FAIL: " + ", ".join(fails)) if fails else ""))
sys.exit(1 if fails else 0)

#!/usr/bin/env python3
# 专项冒烟：背诵模式原地进入（2026-10-29 晚用户真机两例实证）
# 例一 多节内丹书《钟吕传道集》s22：读到卷十四中段点「背」不得全书收回；
# 例二 《太上老君开天经》KR5h0026：读到中段点「背」不得跳回篇首。
# 定版口径：进/出背诵不整书重渲——展开集不变、视口锚点段不变、遮盖原地
# 生效、页脚覆盖 % 不回退；点句展开既有交互不回归；360 档三态各验一次。
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
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:300]), flush=True)

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
jw = rd("js/jingwen.js")
report("S0 源码口径：toggleRecite 原地换段＋dzFill 按现行模式出",
       "reciteSwapInPlace" in jw and "captureReciteAnchor" in jw
       and "(reciteMode ? recitePara(p) : rubyPara(p, si, pi))" in jw)

port = base.free_port(); prof = f"/tmp/chrome-reciteinplace-{port}"
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
try{ localStorage.setItem('wuri_pro_redeem','1'); localStorage.setItem('wuri_jing_recite','0'); }catch(e){}
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
# 必须先激活经文 Tab：#tab-jing 未激活时 display:none，阅读器矩形全 0、
# 滚动锚点无从谈起（脚本侧前置，非 App 问题）
ev("document.querySelector('button[data-tab=\"tab-jing\"]').click(); true")
time.sleep(1.0)

HELPERS = """
window.__ri = {
  expanded: function(){ var o=[]; document.querySelectorAll('#jing-content .jing-sec-body').forEach(function(b){ if(!b.hidden) o.push(+b.parentNode.getAttribute('data-sec')); }); return o; },
  anchor: function(){ var ps=document.querySelectorAll('#jing-content p.jing-para');
    for(var i=0;i<ps.length;i++){ var b=ps[i].closest('.jing-sec-body'); if(!b||b.hidden) continue;
      var r=ps[i].getBoundingClientRect(); if(r.bottom>0) return {sec:+ps[i].getAttribute('data-sec'), para:+ps[i].getAttribute('data-para'), top:(Math.round(r.top)|0)}; } return null; },
  paraTop: function(s,p){ var el=document.querySelector('#jing-content p.jing-para[data-sec="'+s+'"][data-para="'+p+'"]'); return el?(Math.round(el.getBoundingClientRect().top)|0):null; },
  paraMasked: function(s,p){ var el=document.querySelector('#jing-content p.jing-para[data-sec="'+s+'"][data-para="'+p+'"]'); return el?el.querySelectorAll('.recite-sen').length:-1; },
  pct: function(){ var t=document.getElementById('jing-status-text'); if(!t) return null; var m=t.textContent.match(/(\\d+)%/); return m?+m[1]:null; },
  reciteOn: function(){ var c=document.getElementById('jing-content'); return !!(c&&c.classList.contains('recite-on')); }
};
'ok'"""

def open_book(bid, tries=100):
    for attempt in range(2):
        ev("window.JingWen.openReader(%s); true" % json.dumps(bid))
        for _ in range(tries):
            if ev("window._jingCurrentId") == bid and ev("document.getElementById('jing-reader').hidden") is False \
               and ev("document.querySelectorAll('#jing-content p.jing-para').length") > 0:
                break
            time.sleep(0.5)
        if ev("window._jingCurrentId") == bid and ev("document.querySelectorAll('#jing-content p.jing-para').length") > 0:
            break
        print("  [open_book retry]", bid, ev("""JSON.stringify({cur: window._jingCurrentId,
          rhidden: document.getElementById('jing-reader').hidden,
          paras: document.querySelectorAll('#jing-content p.jing-para').length,
          errs: window.__errs.slice(0,2)})"""), flush=True)
    time.sleep(1.2)
    ev(HELPERS)
    if ev("window.__ri.reciteOn()"):
        ev("document.getElementById('jing-recite').click(); true"); time.sleep(2.2)
    return ev("window._jingCurrentId") == bid

def click_recite():
    ev("document.getElementById('jing-recite').click(); true")
    time.sleep(2.4)  # 锚点坚持轮询约 1.7s 封顶，留足余量

TOL = 60
try:
    # ---------- 例一：s22 钟吕传道集 多节中段 ----------
    ok = open_book("s22")
    report("A0 s22 打开", ok)
    nsec = ev("document.querySelectorAll('#jing-content .jing-sec').length")
    # s22 共 3 节：卷之十四＝index 0（25,277 字 >2 万，不触发开卷全展开，
    # 与真机同构）。展开卷十四＋卷十五，滚到卷十四中段一段作锚点。
    ev("document.querySelector('.jing-sec-h[data-fold=\"0\"]').click(); true"); time.sleep(0.5)
    ev("document.querySelector('.jing-sec-h[data-fold=\"1\"]').click(); true"); time.sleep(0.8)
    ev("""(function(){ var el=document.querySelector('#jing-content p.jing-para[data-sec="0"][data-para="10"]')
        || document.querySelector('#jing-content .jing-sec[data-sec="0"] p.jing-para');
        if(el) el.scrollIntoView({block:'start'}); return !!el; })()""")
    time.sleep(0.8)
    E0 = ev("window.__ri.expanded()"); A0 = ev("window.__ri.anchor()"); P0 = ev("window.__ri.pct()")
    report("A1 前置：卷十四已展开且锚点在该卷", 0 in (E0 or []) and A0 and A0["sec"] == 0,
           json.dumps({"E0": E0, "A0": A0, "nsec": nsec}))
    click_recite()
    E1 = ev("window.__ri.expanded()"); A1 = ev("window.__ri.anchor()")
    top1 = ev("window.__ri.paraTop(%d,%d)" % (A0["sec"], A0["para"])) if A0 else None
    masked = ev("window.__ri.paraMasked(%d,%d)" % (A0["sec"], A0["para"])) if A0 else -1
    report("A2 进背：背诵态开＋展开集不变", ev("window.__ri.reciteOn()") and E1 == E0,
           json.dumps({"E0": E0, "E1": E1}))
    report("A3 进背：锚点段不变且仍在视口原位", A1 and A1["sec"] == A0["sec"] and A1["para"] == A0["para"]
           and top1 is not None and abs(top1 - A0["top"]) <= TOL,
           json.dumps({"A0": A0, "A1": A1, "top1": top1}))
    report("A4 进背：锚点段遮盖生效（句子首字态）", masked and masked > 0, "masked=" + str(masked))
    # 既有交互：点句展开该句
    ev("""(function(){ var el=document.querySelector('#jing-content p.jing-para[data-sec="%d"][data-para="%d"] .recite-sen');
        if(el) el.click(); return !!el; })()""" % (A0["sec"], A0["para"]))
    time.sleep(0.5)
    rest_shown = ev("""(function(){ var el=document.querySelector('#jing-content p.jing-para[data-sec="%d"][data-para="%d"] .recite-sen .recite-rest');
        return el ? !el.hidden : null; })()""" % (A0["sec"], A0["para"]))
    report("A5 既有交互：点句展开该句不回归", rest_shown is True, str(rest_shown))
    click_recite()
    E2 = ev("window.__ri.expanded()"); A2 = ev("window.__ri.anchor()")
    top2 = ev("window.__ri.paraTop(%d,%d)" % (A0["sec"], A0["para"])) if A0 else None
    P2 = ev("window.__ri.pct()")
    report("A6 退背：展开集不变＋锚点回原位＋遮盖撤除",
           (not ev("window.__ri.reciteOn()")) and E2 == E0 and A2 and A2["sec"] == A0["sec"] and A2["para"] == A0["para"]
           and top2 is not None and abs(top2 - A0["top"]) <= TOL
           and (ev("window.__ri.paraMasked(%d,%d)" % (A0["sec"], A0["para"])) == 0),
           json.dumps({"E2": E2, "A2": A2, "top2": top2}))
    report("A7 进出背诵页脚 % 不回退", (P0 is None or P2 is None or P2 >= P0), f"P0={P0} P2={P2}")

    # ---------- 例二：KR5h0026 太上老君开天经 中段 ----------
    ok = open_book("KR5h0026")
    report("B0 KR5h0026 打开", ok)
    # 滚到约 45%：先按文档高度滚，再把顶线处的节展开（多节形态时）、锚定其一段
    ev("window.scrollTo(0, document.documentElement.scrollHeight*0.45); 'ok'"); time.sleep(0.8)
    ev("""(function(){ var secs=document.querySelectorAll('#jing-content .jing-sec');
        for(var i=0;i<secs.length;i++){ var r=secs[i].getBoundingClientRect();
          if(r.bottom>120){ var h=secs[i].querySelector('.jing-sec-h'); var b=secs[i].querySelector('.jing-sec-body');
            if(h && b && b.hidden) h.click(); break; } } return 'ok'; })()""")
    time.sleep(1.0)
    ev("""(function(){ var a=window.__ri.anchor(); if(!a) return 'noanchor';
        var el=document.querySelector('#jing-content p.jing-para[data-sec="'+a.sec+'"][data-para="'+a.para+'"]');
        if(el) window.scrollBy(0, el.getBoundingClientRect().top-140); return 'ok'; })()""")
    time.sleep(0.8)
    E0 = ev("window.__ri.expanded()"); A0 = ev("window.__ri.anchor()"); P0 = ev("window.__ri.pct()")
    Y0 = ev("window.scrollY")
    report("B1 前置：已滚至中段（scrollY 显著大于 0）且有锚点段", A0 and Y0 and Y0 > 800,
           json.dumps({"A0": A0, "Y0": Y0, "E0": E0}))
    click_recite()
    A1 = ev("window.__ri.anchor()"); Y1 = ev("window.scrollY")
    top1 = ev("window.__ri.paraTop(%d,%d)" % (A0["sec"], A0["para"])) if A0 else None
    masked = ev("window.__ri.paraMasked(%d,%d)" % (A0["sec"], A0["para"])) if A0 else -1
    report("B2 进背：不回篇首（scrollY 不塌回顶部）", Y1 and Y1 > 800, f"Y0={Y0} Y1={Y1}")
    report("B3 进背：锚点段一致且在原位、遮盖生效",
           A1 and A1["sec"] == A0["sec"] and A1["para"] == A0["para"] and top1 is not None
           and abs(top1 - A0["top"]) <= TOL and masked and masked > 0,
           json.dumps({"A0": A0, "A1": A1, "top1": top1, "masked": masked}))
    click_recite()
    A2 = ev("window.__ri.anchor()"); P2 = ev("window.__ri.pct()")
    top2 = ev("window.__ri.paraTop(%d,%d)" % (A0["sec"], A0["para"])) if A0 else None
    report("B4 退背：回同一位置", A2 and A2["sec"] == A0["sec"] and A2["para"] == A0["para"]
           and top2 is not None and abs(top2 - A0["top"]) <= TOL,
           json.dumps({"A2": A2, "top2": top2}))
    report("B5 进出背诵页脚 % 不回退", (P0 is None or P2 is None or P2 >= P0), f"P0={P0} P2={P2}")

    # ---------- 三态抽验（红光下再进/退一次背，结构不塌、无异常） ----------
    ev("document.body.classList.add('sky-red'); 'ok'"); time.sleep(0.4)
    click_recite()
    red_ok = ev("window.__ri.reciteOn()") and (ev("window.__ri.paraMasked(%d,%d)" % (A0["sec"], A0["para"])) or 0) > 0
    click_recite()
    report("C1 红光态进/出背诵可用", red_ok and not ev("window.__ri.reciteOn()"))
    ev("document.body.classList.remove('sky-red'); 'ok'")
    tt = ev("(function(){var t=document.querySelector('[data-theme-toggle]'); if(t){t.click(); return 'night';} return 'none';})()")
    time.sleep(0.6)
    click_recite()
    night_ok = ev("window.__ri.reciteOn()")
    click_recite()
    report("C2 夜态进/出背诵可用", night_ok and not ev("window.__ri.reciteOn()"), "toggle=" + str(tt))

    errs = ev("window.__errs")
    report("Z0 全程无 JS 异常", not errs, json.dumps(errs)[:200] if errs else "")
finally:
    try: proc.terminate()
    except Exception: pass

fails = [n for n, ok in R if not ok]
print(f"\n==== {len(R)-len(fails)}/{len(R)} PASS" + ((" FAIL: " + ", ".join(fails)) if fails else ""))
sys.exit(1 if fails else 0)

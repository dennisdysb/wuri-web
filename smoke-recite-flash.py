#!/usr/bin/env python3
# 专项冒烟：背诵切换「闪一下」消除（2026-10-29 15:53 真机四报：v385 落点
# 已对，但切换瞬间先闪一下才转到锚点）。旧实现逐帧实证：换段在点击任务
# 内同步完成，定位却靠 120ms 间隔轮询——点击后约 6 帧（≈140ms）画的是
# 「新形态＋旧滚动位」（锚点段在视口上方 −1306px），轮询首拍才跳回。
# 修后口径：换段＋同步定位在同一任务内完成（settleReciteAnchorNow）、
# insistReciteAnchor 改 rAF 逐帧看守（绘制前纠偏、已对位零动作）。
# 本冒烟逐帧断言（rAF 采样 scrollY/锚点 rect/视口顶段身份，采样回调在
# 每帧绘制前执行、记录的即当帧将绘制的状态）：
#   F1 s04 进背：自首个背诵形态帧起——顶段身份恒为锚点段、锚点 top 偏
#      移 ≤4px、scrollY 零再变（无可见纠偏跳动）、无空白帧；
#   F2 s04 退背：同上（回普通形态）；
#   F3 晚到位移：看守期内注入改高样式（模拟字体切片迟到），采样回调
#      注册于看守之后（帧内回调序：看守先行纠偏、采样后行观察），断言
#      全部帧锚点不离位——纠回须发生在位移被画出之前；
#   F4/F5 夜间/红光态各进背一次逐帧同断。
# 方法论自检：本脚本对旧代码（v385 jingwen.js）运行 F1 应 FAIL（已实测）。
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

port = base.free_port(); prof = f"/tmp/chrome-reciteflash-{port}"
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
  anchor: function(){ var ps=document.querySelectorAll('#jing-content p.jing-para');
    for(var i=0;i<ps.length;i++){ var b=ps[i].closest('.jing-sec-body'); if(!b||b.hidden) continue;
      var r=ps[i].getBoundingClientRect(); if(r.bottom>0) return {sec:+ps[i].getAttribute('data-sec'), para:+ps[i].getAttribute('data-para'), top:(Math.round(r.top)|0)}; } return null; },
  paraTop: function(s,p){ var el=document.querySelector('#jing-content p.jing-para[data-sec="'+s+'"][data-para="'+p+'"]');
    return el?(Math.round(el.getBoundingClientRect().top)|0):null; },
  reciteOn: function(){ var c=document.getElementById('jing-content'); return !!(c&&c.classList.contains('recite-on')); }
};
window.__fstart = function(){
  window.__ftrace = []; window.__ftraceOn = true;
  var ps = document.querySelectorAll('#jing-content p.jing-para');
  window.__anchorEl = null;
  for (var i=0;i<ps.length;i++){ var b=ps[i].closest('.jing-sec-body'); if(!b||b.hidden) continue;
    if (ps[i].getBoundingClientRect().bottom>0){ window.__anchorEl = ps[i]; break; } }
  window.__anchorId = window.__anchorEl ? (window.__anchorEl.getAttribute('data-sec')+'/'+window.__anchorEl.getAttribute('data-para')) : null;
  window.__anchorTop0 = window.__anchorEl ? Math.round(window.__anchorEl.getBoundingClientRect().top*10)/10 : null;
  if (!window.__floopOn) { window.__floopOn = true;
    (function loop(){
      requestAnimationFrame(loop);
      if (!window.__ftraceOn) return;
      var rec = { t: Math.round(performance.now()*10)/10, y: window.scrollY };
      var a = window.__anchorEl;
      if (a && a.isConnected){ var r=a.getBoundingClientRect(); rec.aTop = Math.round(r.top*10)/10; } else rec.aTop = null;
      var ps2 = document.querySelectorAll('#jing-content p.jing-para');
      rec.topId = null;
      for (var j=0;j<ps2.length;j++){ var b2=ps2[j].closest('.jing-sec-body'); if(!b2||b2.hidden) continue;
        var rr=ps2[j].getBoundingClientRect(); if(rr.bottom>0){ rec.topId = ps2[j].getAttribute('data-sec')+'/'+ps2[j].getAttribute('data-para'); break; } }
      rec.rec = window.__ri.reciteOn();
      window.__ftrace.push(rec);
    })();
  }
  return window.__anchorId;
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
    for _ in range(8):
        t = ev("window.__ri.paraTop(5,0)")
        if t is None: break
        if 25 <= t <= 55: break
        ev("window.scrollBy(0, %d); 'ok'" % (t - 40))
        time.sleep(0.45)
    time.sleep(0.6)

TOL = 4  # 逐帧 top 偏移容差（px）：同步定位实测残差 ≤1，留采样取整余量
def analyze(mode_on, label):
    """读回 trace：自首个目标形态帧起逐帧断言。返回 (ok, detail)"""
    trace = ev("window.__ftrace") or []
    aid = ev("window.__anchorId"); top0 = ev("window.__anchorTop0")
    post_all = trace
    idx = None
    for i, r in enumerate(post_all):
        if r.get("rec") == mode_on: idx = i; break
    if idx is None:
        return False, f"{label}: 无目标形态帧 trace={len(post_all)}"
    post = post_all[idx:]
    bad = [r for r in post if r.get("aTop") is None or abs(r["aTop"] - top0) > TOL]
    wrong = [r for r in post if r.get("topId") != aid]
    blank = [r for r in post if r.get("topId") is None]
    ys = []
    for r in post:
        if not ys or ys[-1] != r["y"]: ys.append(r["y"])
    ok = not bad and not wrong and not blank and len(ys) <= 1 and len(post) >= 5
    det = {"frames": len(post), "bad": len(bad), "wrong": len(wrong), "blank": len(blank),
           "y_seq": ys[:5], "aid": aid, "top0": top0,
           "firstBad": bad[0] if bad else None, "firstWrong": wrong[0] if wrong else None}
    return ok, json.dumps(det)[:380]

def toggle_with_frames(mode_on, label, settle_s=2.2):
    ev("window.__fstart(); true")
    ev("document.getElementById('jing-recite').click(); true")
    time.sleep(settle_s)
    ev("window.__ftraceOn = false; true")
    time.sleep(0.15)
    return analyze(mode_on, label)

try:
    open_from_list()
    ev("window.JingWen.closeReader(); true"); time.sleep(0.8)
    open_from_list()
    time.sleep(4.2)  # 等开书落位坚持收工、字体落定
    goto_sec5()
    A0 = ev("window.__ri.anchor()")
    report("F0 到达持诵功德（点背前）", A0 and A0["sec"] == 5 and A0["para"] == 0, json.dumps(A0))

    ok, det = toggle_with_frames(True, "F1")
    report("F1 进背逐帧：首帧即对位、无错位/空白/纠偏跳帧", ok, det)
    report("F1b 进背后落点（终态复核）", ev("window.__ri.reciteOn()") and (ev("window.__ri.paraTop(5,0)") or 999) <= 100,
           str(ev("window.__ri.paraTop(5,0)")))

    ok, det = toggle_with_frames(False, "F2")
    report("F2 退背逐帧：首帧即对位、无错位/空白/纠偏跳帧", ok, det)

    # ---- F3 晚到位移：看守绘制前纠回 ----
    goto_sec5()
    ev("document.getElementById('jing-recite').click(); true")
    time.sleep(2.6)  # 同步定位早已收工、看守期（4.5s）内
    ev("window.__fstart(); true")  # 采样后于看守注册：帧内看守先纠偏、采样后观察
    time.sleep(0.3)
    ev("""(function(){ var st=document.createElement('style'); st.id='smoke-shift';
        st.textContent='#jing-content .jing-sec[data-sec="0"] p.jing-para, #jing-content .jing-sec[data-sec="1"] p.jing-para, #jing-content .jing-sec[data-sec="2"] p.jing-para{line-height:2.6 !important;}';
        document.head.appendChild(st); return 'ok'; })()""")
    time.sleep(1.5)
    ev("window.__ftraceOn = false; true"); time.sleep(0.15)
    trace = ev("window.__ftrace") or []
    aid = ev("window.__anchorId"); top0 = ev("window.__anchorTop0")
    bad = [r for r in trace if r.get("aTop") is None or abs(r["aTop"] - top0) > TOL]
    wrong = [r for r in trace if r.get("topId") != aid]
    report("F3 晚到位移逐帧：看守在绘制前纠回、全帧不离位",
           len(trace) >= 5 and not bad and not wrong,
           json.dumps({"frames": len(trace), "bad": len(bad), "wrong": len(wrong), "top0": top0,
                       "firstBad": bad[0] if bad else None})[:380])
    ev("var s=document.getElementById('smoke-shift'); if(s) s.remove(); 'ok'")
    time.sleep(0.8)
    ev("document.getElementById('jing-recite').click(); true"); time.sleep(2.0)
    report("F3x 退背复原", not ev("window.__ri.reciteOn()"))

    # ---- F4 夜间态逐帧 ----
    ev("(function(){var t=document.querySelector('[data-theme-toggle]'); if(t) t.click(); return 'night';})()")
    time.sleep(0.8)
    goto_sec5()
    ok, det = toggle_with_frames(True, "F4")
    report("F4 夜间态进背逐帧不闪", ok, det)
    ev("document.getElementById('jing-recite').click(); true"); time.sleep(2.0)

    # ---- F5 红光态逐帧 ----
    ev("document.body.classList.add('sky-red'); 'red'")
    time.sleep(0.4)
    goto_sec5()
    ok, det = toggle_with_frames(True, "F5")
    report("F5 红光态进背逐帧不闪", ok, det)
    ev("document.getElementById('jing-recite').click(); true"); time.sleep(2.0)
    ev("document.body.classList.remove('sky-red'); 'ok'")

    errs = ev("window.__errs")
    report("Z0 全程无 JS 异常", not errs, json.dumps(errs)[:200] if errs else "")
finally:
    try: proc.terminate()
    except Exception: pass

fails = [n for n, ok in R if not ok]
print(f"\n==== {len(R)-len(fails)}/{len(R)} PASS" + ((" FAIL: " + ", ".join(fails)) if fails else ""))
sys.exit(1 if fails else 0)

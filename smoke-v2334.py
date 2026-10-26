#!/usr/bin/env python3
# 专项冒烟（SW v134）：冥想呼吸三修——说明居中 / 呼吸态上移放大 / 播放常亮 Wake Lock。
# 改前基线（measure-med134.py，412x915 与 390x844）：圈 112px、说明中心偏 +46px、呼吸态 center top=29.0%。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/med134-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:500]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
idx, sw, i18n = rd("index.html"), rd("sw.js"), rd("js/i18n.js")
medjs, medcss = rd("js/meditation.js"), rd("css/meditation.css")
report("S1 四件套 v134", "wuri-v134-20261025-v230" in sw and 'css/style.css?v=134' in idx
       and 'css/style.css?v=134' in sw and i18n.count("v134") == 2 and "内部 v134" in idx
       and 'css/meditation.css?v=69' in idx and 'css/meditation.css?v=69' in sw)
report("S2 CSS 三修在位", "#meditation-view.med-breathing .med-center{top:15%}" in medcss
       and "width:min(41vw,160px)" in medcss and ".med-breath-note{width:min(320px,84vw)" in medcss
       and "text-align:center" in medcss.split(".med-breath-note{")[1].split("}")[0])
report("S3 WakeLock 代码路径在位", medjs.count("acquireWakeLock()") >= 4 and medjs.count("releaseWakeLock()") >= 3
       and "navigator.wakeLock.request('screen')" in medjs and "med-breathing" in medjs)

MEASURE = """(()=>{const W=innerWidth,H=innerHeight;
  const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();
    return {top:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),
            cx:Math.round(r.left+r.width/2),bottom:Math.round(r.bottom)};};
  const circ=document.getElementById('med-breath-circle');
  const note=document.getElementById('med-breath-note');
  return {W,H,center:R('.med-center'),clock:R('#med-clock'),dots:R('#med-dots'),
    circleLayoutW: circ?circ.offsetWidth:null,
    note:R('#med-breath-note'), noteAlign: note?getComputedStyle(note).textAlign:null,
    noteCenterDelta: note?Math.round(note.getBoundingClientRect().left+note.getBoundingClientRect().width/2-W/2):null,
    controls:R('.med-controls'), breathHidden: document.getElementById('med-breath').hidden,
    viewCls: document.getElementById('meditation-view').className,
    playing: document.getElementById('med-play').innerHTML.indexOf('M6 5h4v14H6z')>=0,
    errs: window.__errs||[]};})()"""

WL_PATCH = """(()=>{window.__wl={req:0,rel:0,held:false,patchOk:false,sentinel:null};
  try{ const o=navigator.wakeLock; if(!o) return 'no-api';
    const orig=o.request.bind(o);
    o.request=function(t){ window.__wl.req++;
      return orig(t).then(function(s){ window.__wl.held=true; window.__wl.sentinel=s;
        const orel=s.release.bind(s);
        s.release=function(){ window.__wl.rel++; window.__wl.held=false; return orel(); };
        try{ s.addEventListener('release',function(){ window.__wl.held=false; }); }catch(e){}
        return s; }); };
    window.__wl.patchOk=true; return 'ok';
  }catch(e){ return 'patch-fail:'+e; }})()"""

def session(width, height, tag):
    port = base.free_port(); prof = f"/tmp/chrome-med134s-{tag}-{port}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=500,900", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    wsurl = None
    for _ in range(40):
        try:
            tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
            pg = [t for t in tg if t.get("type") == "page"]
            if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    c = base.CDP(base.ws_connect(wsurl))
    c.call("Page.enable"); c.call("Runtime.enable")
    c.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": True})
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(3)
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    def shot(name):
        r = c.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
    def click(sel):
        ev(f"document.querySelector({json.dumps(sel)}).click()")

    ev("Meditation.open()"); time.sleep(1.2)
    # ---- 纯计时态回归 ----
    mp = ev(MEASURE)
    ratio_p = mp["center"]["top"] / mp["H"]
    report(f"B{tag} 纯计时 center 仍在 29%", abs(ratio_p - 0.29) < 0.006 and mp["breathHidden"]
           and "med-breathing" not in mp["viewCls"], f"ratio={ratio_p:.4f} cls={mp['viewCls']}")
    shot(f"med-{tag}-plain.png")
    # ---- 呼吸态布局 ----
    click('[data-breath="pranayama"]'); time.sleep(0.5)
    mb = ev(MEASURE)
    ratio_b = mb["center"]["top"] / mb["H"]
    report(f"B{tag} 呼吸态类已挂", "med-breathing" in mb["viewCls"] and not mb["breathHidden"], mb["viewCls"])
    report(f"B{tag} 时钟/圆点上移 center top 29%→15%", abs(ratio_b - 0.15) < 0.008, f"ratio={ratio_b:.4f} clockTop={mb['clock']['top']}")
    report(f"B{tag} 呼吸圈放大 112→160 (≥1.4x)", mb["circleLayoutW"] and 155 <= mb["circleLayoutW"] <= 162, mb["circleLayoutW"])
    report(f"B{tag} 说明居中 (align=center, |偏差|≤2px)", mb["noteAlign"] == "center" and abs(mb["noteCenterDelta"]) <= 2,
           f"align={mb['noteAlign']} delta={mb['noteCenterDelta']}")
    report(f"B{tag} 呼吸区不压控制层", mb["note"]["bottom"] <= mb["controls"]["top"] - 4,
           f"noteBottom={mb['note']['bottom']} controlsTop={mb['controls']['top']}")
    # ---- Wake Lock 全路径 ----
    patch = ev(WL_PATCH)
    click('#med-play'); time.sleep(0.8)
    wl1 = ev("window.__wl")
    st1 = ev(MEASURE)
    report(f"B{tag} 播放中 (状态+无异常)", st1["playing"] and not st1["errs"], st1["errs"])
    shot(f"med-{tag}-breath.png")
    if patch == "ok":
        report(f"B{tag} 播放→申请常亮锁", wl1["req"] >= 1 and wl1["held"], wl1)
        click('#med-play'); time.sleep(0.5)   # 暂停
        wl2 = ev("window.__wl")
        report(f"B{tag} 暂停→释放常亮锁", wl2["rel"] >= 1 and not wl2["held"], wl2)
        click('#med-play'); time.sleep(0.8)   # 续播
        wl3 = ev("window.__wl")
        report(f"B{tag} 续播→重新申请", wl3["req"] >= 2 and wl3["held"], wl3)
        # 模拟切后台：系统回收锁（手动 release sentinel）→ 回前台派发 visibilitychange 应重新申请
        ev("if(window.__wl.sentinel) window.__wl.sentinel.release()"); time.sleep(0.3)
        ev("document.dispatchEvent(new Event('visibilitychange'))"); time.sleep(0.8)
        wl4 = ev("window.__wl")
        report(f"B{tag} 回前台→自动重申请", wl4["req"] >= 3 and wl4["held"], wl4)
        click('#med-back'); time.sleep(0.5)   # 退出冥想
        wl5 = ev("window.__wl")
        gone = ev("document.getElementById('meditation-view').hidden")
        report(f"B{tag} 退出→释放常亮锁", wl5["rel"] >= 2 and not wl5["held"] and gone, wl5)
    else:
        report(f"B{tag} WakeLock 插桩", False, f"环境限制: patch={patch}，改走降级断言")
    # ---- 降级分支：无 Wake Lock API 时播放不得报错 ----
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"}); time.sleep(3)
    ev("Object.defineProperty(navigator,'wakeLock',{value:undefined,configurable:true})")
    ev("Meditation.open()"); time.sleep(1.0)
    click('[data-breath="pranayama"]'); time.sleep(0.3)
    click('#med-play'); time.sleep(0.8)
    md = ev(MEASURE)
    report(f"B{tag} 无 WakeLock API 降级无异常", md["playing"] and not md["errs"], md["errs"])
    try: proc.terminate()
    except Exception: pass

session(412, 915, "412")
session(390, 844, "390")

fails = [n for n, ok in results if not ok]
print(f"\n==== {len(results) - len(fails)}/{len(results)} PASS" + (f" FAILS={fails}" if fails else ""))
with open(os.path.join(OUT, "smoke-v2334-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write(f"==== {len(results) - len(fails)}/{len(results)} PASS\n")
sys.exit(1 if fails else 0)

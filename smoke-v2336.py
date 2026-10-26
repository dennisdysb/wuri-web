#!/usr/bin/env python3
# 专项冒烟（SW v136）：冥想呼吸说明下移至控制层 + 呼吸圈再放大；v134 成果（居中/上移/常亮/纯计时）回归。
# 改前基线（measure-med136.py before，worktree HEAD=v134）：note top 496/485/344、圈 160/160/128、
# 圈底→控制层间距 154/94/109、纯计时 center top 265/245/161、clock top 300/280/192、controls top 638/567/447。
# 注：版本号取 v136——主树已有并行批次（道藏）占用 v135（未提交），本批在独立 worktree 备制待父级排序。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web-med136/www")
OUT = os.path.expanduser("~/workspace/wuri-web/med136-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:500]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
idx, sw, i18n = rd("index.html"), rd("sw.js"), rd("js/i18n.js")
medjs, medcss = rd("js/meditation.js"), rd("css/meditation.css")
report("S1 四件套 v136", "wuri-v136-20261025-v230" in sw and 'css/style.css?v=136' in idx
       and 'css/style.css?v=136' in sw and i18n.count("v136") == 2 and "内部 v136" in idx
       and 'css/meditation.css?v=70' in idx and 'css/meditation.css?v=70' in sw)
i_note, i_ctl, i_row = idx.find('id="med-breath-note"'), idx.find('class="med-controls"'), idx.find('class="med-breath-row"')
breath_block = idx[idx.find('id="med-breath"'):idx.find('class="med-controls"')]
report("S2 说明已移入控制层首位", -1 < i_ctl < i_note < i_row and 'id="med-breath-note" hidden' in idx
       and 'med-breath-note' not in breath_block)
report("S3 CSS/JS 改动在位", "width:min(43vw,176px)" in medcss and ".med-breath-circle{width:140px;height:140px}" in medcss
       and ".med-breath-note[hidden]{display:none}" in medcss and "noteEl.hidden = !breathPattern()" in medjs)

MEASURE = """(()=>{const W=innerWidth,H=innerHeight;
  const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();
    return {top:Math.round(r.top),left:Math.round(r.left),w:Math.round(r.width),h:Math.round(r.height),
            cx:Math.round(r.left+r.width/2),bottom:Math.round(r.bottom)};};
  const circ=document.getElementById('med-breath-circle');
  const note=document.getElementById('med-breath-note');
  let circLayout=null;
  if(circ){ const t=circ.style.transform; circ.style.transform='none';
    const r=circ.getBoundingClientRect();
    circLayout={top:Math.round(r.top),bottom:Math.round(r.bottom),w:Math.round(r.width)};
    circ.style.transform=t; }
  const ctl=R('.med-controls');
  return {W,H,center:R('.med-center'),clock:R('#med-clock'),
    circleLayoutW: circ?circ.offsetWidth:null, circLayout,
    note:R('#med-breath-note'), noteAlign: note?getComputedStyle(note).textAlign:null,
    noteHidden: note?note.hidden:null,
    noteCenterDelta: note?Math.round(note.getBoundingClientRect().left+note.getBoundingClientRect().width/2-W/2):null,
    noteParent: note?note.parentElement.className:null,
    controls: ctl, breathRow:R('.med-breath-row'),
    gapCircleToControls: (ctl&&circLayout)?Math.round(ctl.top-circLayout.bottom):null,
    breathHidden: document.getElementById('med-breath').hidden,
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

BEFORE = {  # measure-med136.py before 基线
  "412":  dict(noteTop=496, clockTopB=172, clockTopP=300, ctlTop=638, dia=160),
  "390":  dict(noteTop=485, clockTopB=162, clockTopP=280, ctlTop=567, dia=160),
  "390s": dict(noteTop=344, clockTopB=94,  clockTopP=192, ctlTop=447, dia=128),
}
DIA_AFTER = {"412": 176, "390": 168, "390s": 140}
NOTE_DROP_MIN = {"412": 120, "390": 60, "390s": 80}

def session(width, height, tag):
    b = BEFORE[tag]; short = height <= 740
    port = base.free_port(); prof = f"/tmp/chrome-med136s-{tag}-{port}"
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
    # ---- 纯计时态逐项回归（与基线逐像素比对） ----
    mp = ev(MEASURE)
    ratio_p = mp["center"]["top"] / mp["H"]
    exp_ratio = 0.23 if short else 0.29
    report(f"B{tag} 纯计时 center 仍在 {round(exp_ratio*100)}%", abs(ratio_p - exp_ratio) < 0.006 and mp["breathHidden"]
           and "med-breathing" not in mp["viewCls"], f"ratio={ratio_p:.4f} cls={mp['viewCls']}")
    report(f"B{tag} 纯计时时钟/控制层零位移", abs(mp["clock"]["top"] - b["clockTopP"]) <= 2
           and abs(mp["controls"]["top"] - b["ctlTop"]) <= 2,
           f"clock={mp['clock']['top']} vs {b['clockTopP']}, ctl={mp['controls']['top']} vs {b['ctlTop']}")
    report(f"B{tag} 纯计时说明隐藏不占位", mp["noteHidden"] is True, f"noteHidden={mp['noteHidden']}")
    shot(f"after-med-{tag}-plain.png")
    # ---- 呼吸态 ----
    click('[data-breath="pranayama"]'); time.sleep(0.5)
    mb = ev(MEASURE)
    gap_nc = mb["breathRow"]["top"] - mb["note"]["bottom"]
    exp_gap = 8 if short else 12
    report(f"B{tag} 呼吸态类已挂+说明在控制层", "med-breathing" in mb["viewCls"] and not mb["breathHidden"]
           and mb["noteParent"] == "med-controls" and mb["noteHidden"] is False,
           f"cls={mb['viewCls']} parent={mb['noteParent']} hidden={mb['noteHidden']}")
    drop = mb["note"]["top"] - b["noteTop"]
    report(f"B{tag} 说明大幅下移 ({b['noteTop']}→{mb['note']['top']})", drop >= NOTE_DROP_MIN[tag], f"drop={drop}")
    report(f"B{tag} 说明贴控制区 (chips 上方常规间距 {exp_gap}px)", mb["note"]["top"] >= mb["controls"]["top"]
           and abs(gap_nc - exp_gap) <= 2, f"gapNoteToChips={gap_nc}")
    report(f"B{tag} 呼吸圈再放大 {b['dia']}→{DIA_AFTER[tag]}", abs(mb["circleLayoutW"] - DIA_AFTER[tag]) <= 1, mb["circleLayoutW"])
    report(f"B{tag} 圈底→控制层间距 ≥35 (实测 {mb['gapCircleToControls']})", mb["gapCircleToControls"] >= 35, mb["gapCircleToControls"])
    report(f"B{tag} 说明仍居中", mb["noteAlign"] == "center" and abs(mb["noteCenterDelta"]) <= 2,
           f"align={mb['noteAlign']} delta={mb['noteCenterDelta']}")
    exp_rb = 0.09 if short else 0.15
    ratio_breath = mb["center"]["top"] / mb["H"]
    report(f"B{tag} 呼吸态时钟零位移 (v134 上移成果不变)", abs(mb["clock"]["top"] - b["clockTopB"]) <= 2
           and abs(ratio_breath - exp_rb) < 0.008, f"clock={mb['clock']['top']} vs {b['clockTopB']} ratio={ratio_breath:.4f}")
    report(f"B{tag} 呼吸态无 JS 异常", not mb["errs"], mb["errs"])
    # ---- Wake Lock 回归 ----
    patch = ev(WL_PATCH)
    click('#med-play'); time.sleep(0.8)
    wl1 = ev("window.__wl"); st1 = ev(MEASURE)
    report(f"B{tag} 播放中 (状态+无异常)", st1["playing"] and not st1["errs"], st1["errs"])
    shot(f"after-med-{tag}-breath.png")
    if patch == "ok":
        report(f"B{tag} 播放→申请常亮锁", wl1["req"] >= 1 and wl1["held"], wl1)
        click('#med-play'); time.sleep(0.5)
        wl2 = ev("window.__wl")
        report(f"B{tag} 暂停→释放常亮锁", wl2["rel"] >= 1 and not wl2["held"], wl2)
        if tag == "412":
            click('#med-play'); time.sleep(0.8)
            wl3 = ev("window.__wl")
            report(f"B{tag} 续播→重新申请", wl3["req"] >= 2 and wl3["held"], wl3)
            ev("if(window.__wl.sentinel) window.__wl.sentinel.release()"); time.sleep(0.3)
            ev("document.dispatchEvent(new Event('visibilitychange'))"); time.sleep(0.8)
            wl4 = ev("window.__wl")
            report(f"B{tag} 回前台→自动重申请", wl4["req"] >= 3 and wl4["held"], wl4)
            click('#med-back'); time.sleep(0.5)
            wl5 = ev("window.__wl")
            gone = ev("document.getElementById('meditation-view').hidden")
            report(f"B{tag} 退出→释放常亮锁", wl5["rel"] >= 2 and not wl5["held"] and gone, wl5)
            # 降级分支：无 Wake Lock API
            c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"}); time.sleep(3)
            ev("Object.defineProperty(navigator,'wakeLock',{value:undefined,configurable:true})")
            ev("Meditation.open()"); time.sleep(1.0)
            click('[data-breath="pranayama"]'); time.sleep(0.3)
            click('#med-play'); time.sleep(0.8)
            md = ev(MEASURE)
            report(f"B{tag} 无 WakeLock API 降级无异常", md["playing"] and not md["errs"], md["errs"])
    else:
        report(f"B{tag} WakeLock 插桩", False, f"环境限制: patch={patch}")
    try: proc.terminate()
    except Exception: pass

session(412, 915, "412")
session(390, 844, "390")
session(390, 700, "390s")

fails = [n for n, ok in results if not ok]
print(f"\n==== {len(results) - len(fails)}/{len(results)} PASS" + (f" FAILS={fails}" if fails else ""))
with open(os.path.join(OUT, "smoke-v2336-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write(f"==== {len(results) - len(fails)}/{len(results)} PASS\n")
sys.exit(1 if fails else 0)

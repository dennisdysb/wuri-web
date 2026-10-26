#!/usr/bin/env python3
# 冥想呼吸版式测量（v136 改前/改后通用）：412x915 / 390x844 / 390x700(短高屏)。
# 用法: python3 measure-med136.py <www_dir> <out_dir> <prefix>
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = sys.argv[1]; OUT = sys.argv[2]; PREFIX = sys.argv[3]
os.makedirs(OUT, exist_ok=True)

MEASURE = """(()=>{const W=innerWidth,H=innerHeight;
  const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();
    return {top:Math.round(r.top),left:Math.round(r.left),w:Math.round(r.width),h:Math.round(r.height),
            cx:Math.round(r.left+r.width/2),bottom:Math.round(r.bottom)};};
  const circ=document.getElementById('med-breath-circle');
  const note=document.getElementById('med-breath-note');
  let circLayout=null;
  if(circ){ const t=circ.style.transform; circ.style.transform='none';
    const r=circ.getBoundingClientRect();
    circLayout={top:Math.round(r.top),bottom:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height)};
    circ.style.transform=t; }
  const ctl=R('.med-controls');
  return {W,H,center:R('.med-center'),clock:R('#med-clock'),dots:R('#med-dots'),
    circleLayoutW: circ?circ.offsetWidth:null, circLayout,
    note:R('#med-breath-note'), noteAlign: note?getComputedStyle(note).textAlign:null,
    noteHidden: note?note.hidden:null,
    noteCenterDelta: note?Math.round(note.getBoundingClientRect().left+note.getBoundingClientRect().width/2-W/2):null,
    noteParent: note?note.parentElement.className:null,
    controls: ctl, breathRow:R('.med-breath-row'),
    gapCircleToControls: (ctl&&circLayout)?Math.round(ctl.top-circLayout.bottom):null,
    gapNoteToChips: null,
    breathHidden: document.getElementById('med-breath').hidden,
    viewCls: document.getElementById('meditation-view').className,
    errs: window.__errs||[]};})()"""

def run(width, height, tag):
    port = base.free_port(); prof = f"/tmp/chrome-med136-{PREFIX}-{tag}-{port}"
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
    ev("Meditation.open()"); time.sleep(1.2)
    # 呼吸态（调息法 + 播放，与 v134 测量同程序）
    ev("document.querySelector('[data-breath=\"pranayama\"]').click()"); time.sleep(0.4)
    ev("document.getElementById('med-play').click()"); time.sleep(1.0)
    m = ev(MEASURE)
    if m and m["note"] and m["breathRow"]:
        m["gapNoteToChips"] = m["breathRow"]["top"] - m["note"]["bottom"]
    print(tag, "BREATH", json.dumps(m, ensure_ascii=False))
    shot(f"{PREFIX}-med-{tag}-breath.png")
    # 纯计时态
    ev("document.getElementById('med-play').click()"); time.sleep(0.3)
    ev("document.querySelector('[data-breath=\"off\"]').click()"); time.sleep(0.4)
    m2 = ev(MEASURE)
    print(tag, "PLAIN ", json.dumps(m2, ensure_ascii=False))
    shot(f"{PREFIX}-med-{tag}-plain.png")
    try: proc.terminate()
    except Exception: pass

run(412, 915, "412")
run(390, 844, "390")
run(390, 700, "390s")

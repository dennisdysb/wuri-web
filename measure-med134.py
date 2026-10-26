#!/usr/bin/env python3
# 冥想呼吸布局测量（改前/改后通用）：412 与 390 两档，呼吸激活态（调息法）+ 纯计时态。
import importlib.util, json, os, subprocess, sys, time, urllib.request
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/med134-shots")
os.makedirs(OUT, exist_ok=True)

def run(width, height, tag):
    port = base.free_port(); prof = f"/tmp/chrome-med134-{tag}-{port}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=%d,%d" % (width, height), "about:blank"],
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
    c.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": True})
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(3)
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    def shot(name):
        r = c.call("Page.captureScreenshot", {"format": "png"})
        import base64
        open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
    ev("Meditation.open()")
    time.sleep(1.2)
    # 选调息法并开始播放（呼吸激活态）
    ev("document.querySelector('[data-breath=\"pranayama\"]').click()")
    time.sleep(0.4)
    ev("document.getElementById('med-play').click()")
    time.sleep(1.0)
    m = ev("""(()=>{const W=innerWidth,H=innerHeight;
      const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();
        return {top:Math.round(r.top),left:Math.round(r.left),w:Math.round(r.width),h:Math.round(r.height),
                cx:Math.round(r.left+r.width/2),bottom:Math.round(r.bottom)};};
      const circ=document.getElementById('med-breath-circle');
      const note=document.getElementById('med-breath-note');
      return {W,H,center:R('.med-center'),clock:R('#med-clock'),dots:R('#med-dots'),
        circleLayoutW: circ?circ.offsetWidth:null, circleRect:R('#med-breath-circle'),
        note:R('#med-breath-note'), noteAlign: note?getComputedStyle(note).textAlign:null,
        noteCenterDelta: note?Math.round(note.getBoundingClientRect().left+note.getBoundingClientRect().width/2-W/2):null,
        controls:R('.med-controls'), play:R('#med-play'),
        viewCls: document.getElementById('meditation-view').className,
        wlSupported: ('wakeLock' in navigator), errs: window.__errs||[]};})()""")
    print(tag, "BREATH", json.dumps(m, ensure_ascii=False))
    shot(f"med-{tag}-breath.png")
    # 暂停 → 纯计时态：关呼吸（选「关闭」chip）
    ev("document.getElementById('med-play').click()")
    time.sleep(0.3)
    ev("document.querySelector('[data-breath=\"off\"]').click()")
    time.sleep(0.4)
    m2 = ev("""(()=>{const W=innerWidth,H=innerHeight;
      const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();
        return {top:Math.round(r.top),h:Math.round(r.height)};};
      return {W,H,center:R('.med-center'),clock:R('#med-clock'),
        breathHidden: document.getElementById('med-breath').hidden,
        viewCls: document.getElementById('meditation-view').className,
        errs: window.__errs||[]};})()""")
    print(tag, "PLAIN ", json.dumps(m2, ensure_ascii=False))
    shot(f"med-{tag}-plain.png")
    try: proc.terminate()
    except Exception: pass

run(412, 915, "412")
run(390, 844, "390")

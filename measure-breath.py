#!/usr/bin/env python3
# 冥想呼吸圈量测（改前/改后通用）：选调息法播放，在吸气→屏息平台期采峰值，
# 记录峰值直径/圈心 Y/与圆点行、说明小字、chips 行的间距；谷值用定格 scale 量。
# 用法: python3 measure-breath.py <www_dir> <out_dir> <prefix>
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = sys.argv[1]; OUT = sys.argv[2]; PREFIX = sys.argv[3]
os.makedirs(OUT, exist_ok=True)

GEOM = """(()=>{const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();
    return {top:Math.round(r.top*10)/10,bottom:Math.round(r.bottom*10)/10,left:Math.round(r.left*10)/10,
            w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10,cy:Math.round((r.top+r.bottom)/2*10)/10};};
  const circ=document.getElementById('med-breath-circle');
  const out={W:innerWidth,H:innerHeight,
    circ:R('#med-breath-circle'), dots:R('#med-dots'), clock:R('#med-clock'),
    note:R('#med-breath-note'), breathRow:R('.med-breath-row'), controls:R('.med-controls'),
    baseW: circ?circ.offsetWidth:null,
    transform: circ?circ.style.transform:null,
    errs: window.__errs||[]};
  if(out.circ&&out.dots) out.gapDotsToCircTop=Math.round((out.circ.top-out.dots.bottom)*10)/10;
  if(out.circ&&out.note) out.gapCircBottomToNote=Math.round((out.note.top-out.circ.bottom)*10)/10;
  return out;})()"""

def run(width, height, tag):
    port = base.free_port(); prof = f"/tmp/chrome-breath-{PREFIX}-{tag}-{port}"
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
    c.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 2, "mobile": True})
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
    ev("document.querySelector('[data-breath=\"pranayama\"]').click()"); time.sleep(0.4)
    ev("document.getElementById('med-play').click()")
    # 轮询采峰值：吸气 7s 内 scale 单调升至峰值并在屏息期平台 4s
    peak = None; t0 = time.time()
    while time.time() - t0 < 11:
        m = ev(GEOM)
        if m and m["circ"]:
            if peak is None or m["circ"]["w"] > peak["circ"]["w"]:
                peak = m
        time.sleep(0.25)
    print(tag, "PEAK", json.dumps(peak, ensure_ascii=False))
    shot(f"{PREFIX}-med-{tag}-peak.png")
    # 谷值定格：读当前 meta 谷值不易得，直接量 scale 到达低谷（呼气 8s 太久）——改为暂停动画定格：
    # 用页面现行 transform 最小采样补测：再轮询 12s 覆盖呼气段取最小宽
    valley = peak; t0 = time.time()
    while time.time() - t0 < 13:
        m = ev(GEOM)
        if m and m["circ"]:
            if m["circ"]["w"] < valley["circ"]["w"]:
                valley = m
        time.sleep(0.25)
    print(tag, "VALLEY", json.dumps(valley, ensure_ascii=False))
    try: proc.terminate()
    except Exception: pass

run(412, 915, "412")
run(390, 844, "390")
run(390, 700, "390s")

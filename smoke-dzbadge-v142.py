#!/usr/bin/env python3
# 量测＋截图：道藏列表行「本文」徽标＋卷字簇宽度（改前/改后两用，参数 before|after）
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
TAG = sys.argv[1] if len(sys.argv) > 1 else "before"
OUT = os.path.expanduser("~/workspace/wuri-web/dzbadge142-shots"); os.makedirs(OUT, exist_ok=True)

def launch(width):
    port = base.free_port(); prof = f"/tmp/chrome-dzb-{port}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
                             "--window-size=500,1000", "about:blank"],
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
    c.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": 915, "deviceScaleFactor": 1, "mobile": True})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(3.5)
    return proc, c

def ev(c, expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return r["result"].get("value")

def shot(c, name):
    r = c.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

MEASURE = """(function(){
  var row=document.querySelector('[data-dz-work="KR5b0028"]')||document.querySelector('.dz-work');
  if(!row) return null;
  var wt=row.querySelector('.dz-wt'), lei=row.querySelector('.dz-lei'), wm=row.querySelector('.dz-wm');
  function w(el){ return el? Math.round(el.getBoundingClientRect().width*10)/10 : 0; }
  function fs(el){ return el? parseFloat(getComputedStyle(el).fontSize) : 0; }
  return {rowW:w(row), titleW:w(wt), titleFs:fs(wt), leiW:w(lei), leiFs:fs(lei),
    wmW:w(wm), wmFs:fs(wm), wmColor:getComputedStyle(wm).color,
    cluster: Math.round((w(lei)+w(wm))*10)/10,
    titleLines: Math.round(wt.getBoundingClientRect().height/ (fs(wt)*1.65))};
})()"""

for width in (412, 390):
    proc, c = launch(width)
    try:
        ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()"); time.sleep(1.0)
        ev(c, "document.querySelector('[data-dz-toggle]').click()"); time.sleep(0.8)
        ev(c, "document.querySelector('[data-dz-bu=\"洞玄部\"]').click()"); time.sleep(0.8)
        ev(c, "document.querySelector('[data-dz-work=\"KR5b0015\"]').scrollIntoView({block:'start'})"); time.sleep(0.5)
        m = ev(c, MEASURE)
        print(TAG, width, json.dumps(m, ensure_ascii=False))
        shot(c, f"{TAG}-{width}.png")
    finally:
        proc.terminate()

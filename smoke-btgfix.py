#!/usr/bin/env python3
# 步天歌入口卡标题隐形修复冒烟：量测 .sx-entry-book 内 .e1/.e2/.bk-k 的 computed 颜色、
# 与卡面渐变三站色的最小对比度、elementFromPoint 命中，日/夜两态。
# 用法：smoke-btgfix.py <www路径> <tag>
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = sys.argv[1]; TAG = sys.argv[2]
OUT = os.path.expanduser("~/workspace/wuri-web-btgfix/btgfix-shots"); os.makedirs(OUT, exist_ok=True)

def launch(width):
    port = base.free_port(); prof = f"/tmp/chrome-btg-{port}"
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
  var card=document.querySelector('[data-sx-book]');
  if(!card) return null;
  var e1=card.querySelector('.e1'), e2=card.querySelector('.e2'), bk=card.querySelector('.bk-k');
  function col(el){ return getComputedStyle(el).color; }
  function lum(rgb){ var m=rgb.match(/[\\d.]+/g).map(Number); var a=m.slice(0,3).map(function(v){ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    var op = m.length>3? m[3] : 1; return {L:0.2126*a[0]+0.7152*a[1]+0.0722*a[2], op:op}; }
  function lumHex(h){ var n=parseInt(h.slice(1),16); return lum('rgb('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+')').L; }
  var stops=['#101725','#1d2c42','#0c1420'].map(lumHex);
  function minContrast(el){ var c=lum(col(el)); var fg=c.L; if(c.op<1){ /* 以最不利站色近似合成 */ }
    return Math.min.apply(null, stops.map(function(bg){ var hi=Math.max(fg,bg), lo=Math.min(fg,bg); return (hi+0.05)/(lo+0.05); })); }
  var r=e1.getBoundingClientRect();
  var hit=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
  return {text:e1.textContent, e1col:col(e1), e2col:col(e2), bkcol:col(bk),
    e1contrast:Math.round(minContrast(e1)*100)/100, e2contrast:Math.round(minContrast(e2)*100)/100,
    hitIsE1: hit===e1, hitCls: hit? hit.className : null,
    cardBg: getComputedStyle(card).backgroundImage.slice(0,60),
    rect:{w:Math.round(r.width),h:Math.round(r.height)}};
})()"""

results = []
proc, c = launch(412)
try:
    for _ in range(30):
        if ev(c, "!!document.querySelector('[data-tab=\"tab-stars\"]')"): break
        time.sleep(0.5)
    ev(c, "document.querySelector('[data-tab=\"tab-stars\"]').click()")
    for _ in range(30):
        if ev(c, "!!document.querySelector('[data-sx-book]')"): break
        time.sleep(0.5)
    ev(c, "document.querySelector('[data-sx-book]').scrollIntoView({block:'center'})")
    time.sleep(0.6)
    m = ev(c, MEASURE); print(TAG, "day", json.dumps(m, ensure_ascii=False)); results.append(("day", m))
    shot(c, f"{TAG}-day-412.png")
    if TAG == "after":
        ev(c, "document.documentElement.setAttribute('data-theme','night')")
        time.sleep(0.6)
        ev(c, "document.querySelector('[data-sx-book]').scrollIntoView({block:'center'})")
        time.sleep(0.4)
        m2 = ev(c, MEASURE); print(TAG, "night", json.dumps(m2, ensure_ascii=False)); results.append(("night", m2))
        shot(c, f"{TAG}-night-412.png")
finally:
    proc.terminate()
print("DONE", TAG)

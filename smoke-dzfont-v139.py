#!/usr/bin/env python3
# 专项冒烟：道藏全集列表字号对齐精选层（v139，用户 2026-10-26 真机反馈：全藏字小一号）
# 口径：computed font-size/font-weight/line-height 逐项相等——
#   .dz-wt（书名）≡ .jing-item .jing-title；.dz-bu（部题）≡ .jing-sec-h；
#   次级元素（.dz-lei 徽标/.dz-wm 卷字/.dz-count 计数）不得小于改前基线（11.52/12.16/13.056px，见 measure-before.json）。
# file:// 下 fetch 被拦，用 XHR 垫片读本地 feed 文件模拟线上（仅测试环境）。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/dzfont139-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

MEASURE = """(function(){
  function m(el){ if(!el) return null; var cs=getComputedStyle(el);
    return {text:(el.textContent||'').trim().slice(0,18), fontSize:cs.fontSize, fontWeight:cs.fontWeight, lineHeight:cs.lineHeight}; }
  var buX=null, bus=document.querySelectorAll('.dz-bu');
  for (var i=0;i<bus.length;i++){ if((bus[i].textContent||'').indexOf('洞玄')===0){ buX=bus[i]; break; } }
  return {
    refTitle: m(document.querySelector('[data-common-sec] .jing-item .jing-title')),
    refHead:  m(document.querySelector('.jing-sec-h')),
    dzBu:     m(bus[0]),
    dzBuXuan: m(buX),
    dzWt:     m(document.querySelector('.dz-work .dz-wt')),
    dzLei:    m(document.querySelector('.dz-work .dz-lei')),
    dzWm:     m(document.querySelector('.dz-work .dz-wm')),
    dzCount:  m(document.querySelector('.dz-bu .dz-count'))
  };
})()"""

def run(width):
    port = base.free_port(); prof = "/tmp/chrome-dzfont139-%d-%d" % (width, port)
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
                             "--window-size=500,1000", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    wsurl = None
    for _ in range(40):
        try:
            tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
            pg = [x for x in tg if x.get("type") == "page"]
            if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    c = base.CDP(base.ws_connect(wsurl))
    c.call("Page.enable"); c.call("Runtime.enable")
    c.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": 915, "deviceScaleFactor": 1, "mobile": True})
    shim = ("window.fetch=function(url){return new Promise(function(res,rej){var x=new XMLHttpRequest();"
            "x.open('GET',url,true);x.onload=function(){res({ok:true,status:200,"
            "json:function(){return Promise.resolve(JSON.parse(x.responseText));},"
            "text:function(){return Promise.resolve(x.responseText);}});};"
            "x.onerror=function(){rej(new Error('xhr fail'));};x.send();});};")
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": shim})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(4.0)
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    ev("document.querySelector('[data-tab=\"tab-jing\"]').click()")
    time.sleep(1.5)
    ev("var dt=document.querySelector('[data-dz-toggle]'); dt && dt.click()")
    ok = False
    for _ in range(30):
        if ev("document.querySelectorAll('.dz-bu').length") > 0: ok = True; break
        time.sleep(0.5)
    if not ok:
        proc.terminate()
        return None
    ev("(function(){var bs=document.querySelectorAll('.dz-bu'); for(var i=0;i<bs.length;i++){ if((bs[i].textContent||'').indexOf('洞玄')===0){ bs[i].click(); bs[i].scrollIntoView({block:'start'}); return 1; } } return 0;})()")
    time.sleep(1.2)
    data = ev(MEASURE)
    r = c.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, "dz-after-%d.png" % width), "wb").write(base64.b64decode(r["data"]))
    proc.terminate()
    return data

def trio_eq(a, b):
    return a and b and a["fontSize"] == b["fontSize"] and a["fontWeight"] == b["fontWeight"] and a["lineHeight"] == b["lineHeight"]

for w in (412, 390):
    d = run(w)
    report("F%d 全藏列表渲染" % w, d is not None)
    if not d: continue
    report("F%d 书名 .dz-wt ≡ 精选书名（号/重/行高）" % w, trio_eq(d["dzWt"], d["refTitle"]), (d["dzWt"], d["refTitle"]))
    report("F%d 部题 .dz-bu ≡ 精选段头（号/重/行高）" % w, trio_eq(d["dzBu"], d["refHead"]), (d["dzBu"], d["refHead"]))
    report("F%d 洞玄部题同规格" % w, trio_eq(d["dzBuXuan"], d["refHead"]), d["dzBuXuan"])
    sec_ok = (d["dzLei"] and float(d["dzLei"]["fontSize"][:-2]) >= 11.52
              and d["dzWm"] and float(d["dzWm"]["fontSize"][:-2]) >= 12.16
              and d["dzCount"] and float(d["dzCount"]["fontSize"][:-2]) >= 13.056)
    report("F%d 次级元素不小于改前基线（徽标/卷字/计数）" % w, bool(sec_ok), (d["dzLei"], d["dzWm"], d["dzCount"]))
    open(os.path.join(OUT, "measure-after-%d.json" % w), "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1))

np = sum(1 for _, ok in results if ok)
print("== %d/%d PASS ==" % (np, len(results)))
open(os.path.join(OUT, "smoke-dzfont-v139-results.txt"), "w", encoding="utf-8").write(
    "\n".join(("PASS " if ok else "FAIL ") + n for n, ok in results) + "\n== %d/%d ==\n" % (np, len(results)))

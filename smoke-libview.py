#!/usr/bin/env python3
# 冒烟：经文库视图记忆——深滚道藏展开第三部→切 Tab→切回，滚动与展开态恢复；
# v211 阅读器往返回归；内丹架展开记忆；冷启动（reload）恢复；常见区默认展开回归。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web-libview/www")
OUT = os.path.expanduser("~/workspace/wuri-web-libview/libview-shots"); os.makedirs(OUT, exist_ok=True)
FAILS = []
def report(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not ok: FAILS.append(name)

port = base.free_port(); prof = "/tmp/chrome-libv-%d" % port
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
c.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});try{localStorage.setItem('wuri_pro_redeem','1');if(!sessionStorage.getItem('__seeded')){localStorage.removeItem('wuri_lib_view_v1');sessionStorage.setItem('__seeded','1');}}catch(e){}"})
c.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 1, "mobile": True})
c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})

def ev(expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return r["result"].get("value")

def waitfor(expr, timeout=25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if ev(expr): return True
        except Exception: pass
        time.sleep(0.4)
    return False

def click(sel, idx=0):
    """真鼠标点击：取第 idx 个匹配元素中心，elementFromPoint 命中校验后点。"""
    box = ev("""(function(){var els=document.querySelectorAll(%s);var el=els[%d];if(!el)return null;
      el.scrollIntoView({block:'center'});var r=el.getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()""" % (json.dumps(sel), idx))
    if not box: raise RuntimeError("no element " + sel)
    hit = ev("""(function(){var el=document.elementFromPoint(%f,%f);var t=document.querySelectorAll(%s)[%d];
      return !!(el&&(el===t||t.contains(el)||el.contains(t)));})()""" % (box["x"], box["y"], json.dumps(sel), idx))
    if not hit: raise RuntimeError("elementFromPoint miss " + sel)
    c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
    c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
    time.sleep(0.35)

def shot(name):
    r = c.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

try:
    report("app 就绪", waitfor("document.readyState==='complete' && !!window.JingWen && !!window.__wuri_dzCatalog", 90))
    # 进经文 tab
    click('[data-tab="tab-jing"]')
    report("经文列表可见", waitfor("!document.getElementById('jing-list').hidden"))
    # 展开道藏全集
    click('[data-dz-toggle]')
    report("道藏目录渲染", waitfor("document.querySelectorAll('[data-dz-bu]').length>=9"))
    # 展开第三个部
    bu3 = ev("document.querySelectorAll('[data-dz-bu]')[2].getAttribute('data-dz-bu')")
    click('[data-dz-bu]', 2)
    report("第三部展开出书目", waitfor("!document.querySelectorAll('[data-dz-works]')[2].hidden && document.querySelectorAll('[data-dz-works]')[2].children.length>0"))
    # 深滚：把第三部的书目区滚到视口上方并再下滚一段
    ev("document.querySelectorAll('[data-dz-works]')[2].scrollIntoView({block:'start'}); window.scrollBy(0, 420);")
    time.sleep(0.9)  # 等节流存档
    y1 = ev("window.scrollY")
    st = ev("JSON.parse(localStorage.getItem('wuri_lib_view_v1')||'null')")
    report("存档含滚动位", bool(st and st.get("y", 0) > 300), st and st.get("y"))
    report("存档含道藏展开态", bool(st and st.get("dz", {}).get("open")), st and st.get("dz"))
    report("存档含第三部展开", bool(st and (st.get("dz", {}).get("bu") or {}).get(bu3)), bu3)
    # 切去黄历 tab（其他 tab 仍回顶 = 回归）
    click('[data-tab="tab-cal"]')
    time.sleep(0.5)
    report("黄历 tab 仍回顶", ev("window.scrollY") == 0, ev("window.scrollY"))
    # 切回经文 tab → 视图复原
    click('[data-tab="tab-jing"]')
    time.sleep(2.6)
    report("切回后道藏仍展开", ev("!document.querySelector('[data-dz-body]').hidden"))
    report("切回后第三部仍展开", ev("!document.querySelectorAll('[data-dz-works]')[2].hidden"))
    y2 = ev("window.scrollY")
    report("切回后滚动复原", abs(y2 - y1) <= 40, "saved=%s now=%s" % (y1, y2))
    report("常见区仍默认展开", ev("!document.querySelector('[data-common-sec]').classList.contains('collapsed') && !document.querySelector('.jing-common-body').hidden"))
    shot("01-restored.png")
    # ---- v211 回归：深处点开道藏经文 → 阅读器 → ‹ 目录 返回原位 ----
    ev("document.querySelectorAll('[data-dz-works]')[2].querySelector('[data-dz-work]').scrollIntoView({block:'center'})")
    time.sleep(0.9)
    yopen = ev("window.scrollY")
    # 在当前视口位置真点（不再 scrollIntoView，避免落点被二次滚动污染）
    box = ev("""(function(){var el=document.querySelectorAll('[data-dz-works]')[2].querySelector('[data-dz-work]');
      var r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()""")
    c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
    c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
    time.sleep(0.35)
    report("v211 落点在深处（非顶部）", yopen > 800, yopen)
    report("阅读器打开", waitfor("!document.getElementById('jing-reader').hidden"))
    click('#jing-back')
    report("返回后阅读器关闭", waitfor("document.getElementById('jing-reader').hidden"))
    time.sleep(0.9)
    y3 = ev("window.scrollY")
    report("v211 返回落点一致", abs(y3 - yopen) <= 40, "open=%s back=%s" % (yopen, y3))
    # ---- 内丹架展开记忆 ----
    click('[data-neidan-toggle]')
    time.sleep(0.6)
    report("内丹架展开", ev("!document.querySelector('.jing-neidan-body').hidden"))
    click('[data-tab="tab-cal"]'); time.sleep(0.4)
    click('[data-tab="tab-jing"]'); time.sleep(1.6)
    report("切回后内丹架仍展开", ev("!document.querySelector('.jing-neidan-body').hidden"))
    # ---- 冷启动恢复（reload 后从存档复原） ----
    st2 = ev("JSON.parse(localStorage.getItem('wuri_lib_view_v1')||'null')")
    c.call("Page.reload")
    report("冷启 app 就绪", waitfor("document.readyState==='complete' && !!window.JingWen", 90))
    click('[data-tab="tab-jing"]')
    time.sleep(3.0)
    report("冷启后道藏仍展开", ev("var b=document.querySelector('[data-dz-body]'); !!b && !b.hidden"))
    report("冷启后第三部仍展开", ev("var w=document.querySelectorAll('[data-dz-works]')[2]; !!w && !w.hidden"))
    report("冷启后内丹架仍展开", ev("var n=document.querySelector('.jing-neidan-body'); !!n && !n.hidden"))
    yc = ev("window.scrollY")
    report("冷启后滚动复原", abs(yc - (st2 or {}).get("y", -99999)) <= 60, "saved=%s now=%s" % ((st2 or {}).get("y"), yc))
    shot("02-coldstart.png")
    errs = ev("window.__errs || []")
    report("全程零 JS 异常", len(errs) == 0, errs[:2])
finally:
    try: proc.terminate()
    except Exception: pass
print("RESULT:", "ALL PASS" if not FAILS else ("FAIL: " + ", ".join(FAILS)))

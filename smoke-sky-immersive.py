#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""星象沉浸化专项冒烟：星象子视图隐藏底部导航（body.sky-immersive，外壳同路机制）。
矩阵（412×915、390×844 双场）：
  落地页底栏在位 → 区页/星官详情/步天歌/今夜可见/平面星图/相机认星 逐个打开断言
  body.wuri-immersive＋#tabbar display:none＋子视图 rect 满屏（top=0,h=视口高）；
  子视图间跳转（区页→详情→返回区页）全程不脱沉浸（间隔采样两次均 none）；
  星图 svg 尺寸、AR canvas 尺寸与视图一致（底栏显隐不影响取尺寸）；
  图层面板可开、搜星输入无异常；神祇互链（详情→神祇详情 token 释放→返回恢复沉浸）；
  子视图开着切走标签（app.js 批量收起）→ 沉浸自动解除、底栏恢复；
  412 场星图三态（日/夜/红光）截图。全程零 JS 异常。
用法：python3 smoke-sky-immersive.py [www路径]（缺省本 worktree www）
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/workspace/.wt/sky-immersive/www")
OUT = os.path.expanduser("~/workspace/.wt/sky-immersive/sky-immersive-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (("" if ok else " :: " + str(extra)[:400])))

MEAS = """(()=>{const tb=document.getElementById('tabbar');const cs=getComputedStyle(tb);
  const open=['view-star-region','view-butiange','view-star-detail','view-sky-tonight','view-sky-chart','view-sky-ar'].filter(id=>!document.getElementById(id).hidden);
  const el=document.elementFromPoint(Math.floor(innerWidth/2), innerHeight-6);
  const inV=id=>{const v=document.getElementById(id);return v&&!v.hidden&&el&&v.contains(el);};
  let hit='none'; if(el){ if(tb.contains(el))hit='TABBAR'; else if(inV('view-sky-ar'))hit='ar'; else if(inV('view-sky-chart'))hit='chart';
    else if(inV('view-star-detail'))hit='detail'; else if(inV('view-star-region'))hit='region'; else if(inV('view-butiange'))hit='btg';
    else if(inV('view-sky-tonight'))hit='tonight'; else hit=(el.id||el.className||el.tagName); }
  const vr=id=>{const v=document.getElementById(id);if(!v||v.hidden)return null;const r=v.getBoundingClientRect();
    return {top:Math.round(r.top),h:Math.round(r.height),w:Math.round(r.width)};};
  const svg=document.querySelector('#view-sky-chart svg');
  const arc=document.getElementById('ar-canvas');
  return {disp:cs.display, imm:document.body.classList.contains('sky-immersive'),
    hookOn:document.body.classList.contains('sky-immersive'), open:open, hit:hit,
    region:vr('view-star-region'), detail:vr('view-star-detail'), btg:vr('view-butiange'),
    tonight:vr('view-sky-tonight'), chart:vr('view-sky-chart'), ar:vr('view-sky-ar'),
    svg: svg?{w:svg.clientWidth,h:svg.clientHeight}:null,
    arCanvas: arc?{w:arc.clientWidth,h:arc.clientHeight}:null,
    errs:(window.__errs||[])};})()"""

def session(W, H, tag, states):
    port = base.free_port(); prof = "/tmp/chrome-skyimm-%s-%d" % (tag, port)
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--use-fake-device-for-media-stream",
                             "--use-fake-ui-for-media-stream",
                             "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
                             "--window-size=500,1000", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
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
        c.call("Emulation.setDeviceMetricsOverride", {"width": W, "height": H, "deviceScaleFactor": 1, "mobile": True})
        c.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));}); try{localStorage.setItem('wuri_pro_redeem','1');}catch(e){}"})
        c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
        time.sleep(3.5)
        def ev(expr, wait=0.0):
            r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            if wait: time.sleep(wait)
            return r["result"].get("value")
        def waitfor(js, timeout=25.0):
            end = time.time() + timeout
            while time.time() < end:
                if ev(js): return True
                time.sleep(0.4)
            return False
        def shot(name):
            r = c.call("Page.captureScreenshot", {"format": "png"})
            open(os.path.join(OUT, name + ".png"), "wb").write(base64.b64decode(r["data"]))
        def meas(): return ev(MEAS)
        P = tag + " "

        ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 1.5)
        m = meas()
        report(P + "落地页：底栏显示、无沉浸", m["disp"] != "none" and not m["imm"] and m["hit"] == "TABBAR", m)

        # ---- 区页 ----
        ev("window.Stars.openRegion('角宿'); true", 0.3)
        waitfor("!!document.querySelector('#sx-region .sx-card, #sx-region .sx-note')")
        m = meas()
        report(P + "区页：沉浸＋底栏隐藏＋满屏", m["imm"] and m["hookOn"] and m["disp"] == "none"
               and m["region"] and m["region"]["top"] == 0 and m["region"]["h"] == H and m["hit"] == "region", m)
        shot("region-" + tag)

        # ---- 区页 → 详情（跳转全程不脱沉浸） ----
        ev("window.Stars.openMansionAsterism('角宿'); true", 0.3)
        waitfor("!document.getElementById('view-star-detail').hidden && !!document.querySelector('#sx-detail .sx-card, #sx-detail h1, #sx-detail .sx-note')")
        m1 = meas(); time.sleep(0.35); m2 = meas()
        report(P + "详情：沉浸保持（双采样）", m1["disp"] == "none" and m2["disp"] == "none" and m1["imm"] and m2["imm"]
               and m1["detail"] and m1["detail"]["h"] == H, (m1, m2))
        # ---- 神祇互链：详情内神祇卡 → 神祇详情（星象 token 释放） → 返回恢复 ----
        hasDeity = ev("!!document.querySelector('#sx-detail [data-sx-deity]')")
        if hasDeity:
            ev("document.querySelector('#sx-detail [data-sx-deity]').click(); true", 0.5)
            okd = waitfor("!document.getElementById('view-deity-detail').hidden")
            m = meas()
            report(P + "神祇互链：进神祇详情后星象沉浸释放", okd and not m["imm"], m)
            ev("document.getElementById('deity-detail-back').click(); true", 0.5)
            okr = waitfor("!document.getElementById('view-star-detail').hidden")
            m = meas()
            report(P + "神祇互链：返回星官详情恢复沉浸", okr and m["imm"] and m["disp"] == "none", m)
        else:
            report(P + "神祇互链：详情内有神祇卡", False, "角宿详情无 data-sx-deity")
        # ---- 详情返回 → 区页仍沉浸 → 区页返回 → 落地恢复 ----
        ev("document.getElementById('star-detail-back').click(); true", 0.4)
        m = meas()
        report(P + "详情返回区页：仍沉浸", m["imm"] and m["disp"] == "none" and m["open"] == ["view-star-region"], m)
        ev("document.getElementById('star-region-back').click(); true", 0.4)
        m = meas()
        report(P + "区页返回落地：底栏恢复", not m["imm"] and m["disp"] != "none" and m["hit"] == "TABBAR" and m["open"] == [], m)

        # ---- 步天歌 ----
        ev("window.Stars.openButiange(); true", 0.3)
        waitfor("!document.getElementById('view-butiange').hidden")
        m = meas()
        report(P + "步天歌：沉浸＋满屏", m["imm"] and m["disp"] == "none" and m["btg"] and m["btg"]["h"] == H, m)
        ev("document.getElementById('butiange-back').click(); true", 0.4)
        m = meas()
        report(P + "步天歌返回：底栏恢复", not m["imm"] and m["disp"] != "none", m)

        # ---- 今夜可见 ----
        ev("window.WuriSkyChart.openTonight(); true", 0.3)
        waitfor("document.querySelectorAll('#sx-tonight .sx-row').length>=3")
        m = meas()
        report(P + "今夜可见：沉浸＋满屏", m["imm"] and m["disp"] == "none" and m["tonight"] and m["tonight"]["h"] == H, m)
        ev("document.getElementById('sky-tonight-back').click(); true", 0.4)

        # ---- 平面星图 ----
        ev("window.WuriSkyChart.openChart(); true", 0.3)
        waitfor("!!document.querySelector('#view-sky-chart svg')")
        time.sleep(0.6)
        m = meas()
        report(P + "星图：沉浸＋满屏＋svg 尺寸正常", m["imm"] and m["disp"] == "none" and m["chart"] and m["chart"]["h"] == H
               and m["svg"] and m["svg"]["w"] > 300 and m["svg"]["h"] > 300, m)
        shot("chart-day-" + tag)
        # 图层面板
        ev("document.getElementById('sk-tg-layers').click(); true", 0.3)
        lay = ev("!document.getElementById('sk-layers').hidden")
        report(P + "星图：图层面板可开", bool(lay))
        if lay:
            ev("document.getElementById('sk-tg-layers').click(); true", 0.2)
        # 搜星输入
        ev("""(()=>{const q=document.getElementById('sk-q'); if(!q) return false;
               q.value='北极'; q.dispatchEvent(new Event('input',{bubbles:true})); return true;})()""", 0.9)
        m = meas()
        report(P + "星图：搜星输入无异常仍沉浸", m["imm"] and not m["errs"], m)
        if states:
            # 三态截图（夜：data-theme；红光：WuriRedlight）
            ev("document.documentElement.setAttribute('data-theme','night'); true", 0.4)
            shot("chart-night-" + tag)
            ev("document.documentElement.setAttribute('data-theme','day'); if(window.WuriRedlight) WuriRedlight.set(true); true", 0.6)
            red = ev("document.body.classList.contains('sky-red')")
            m = meas()
            report(P + "红光态：沉浸保持＋底栏仍隐藏", bool(red) and m["imm"] and m["disp"] == "none", m)
            shot("chart-red-" + tag)
            ev("if(window.WuriRedlight) WuriRedlight.set(false); true", 0.3)
        ev("document.getElementById('sky-chart-back').click(); true", 0.4)
        m = meas()
        report(P + "星图返回：底栏恢复", not m["imm"] and m["disp"] != "none", m)

        # ---- 相机认星 AR ----
        ev("window.WuriSkyAR.open(); true", 0.4)
        waitfor("!document.getElementById('view-sky-ar').hidden")
        time.sleep(0.5)
        m = meas()
        # AR canvas 按 .ar-stage 公式取尺寸（w=min(视口宽-32,430)、h=min(64vh,660)），
        # 与底栏无关——公式吻合即证底栏显隐不影响 AR 取尺寸（基线 412 场同为 380×586）
        expW = min(W - 32, 430); expH = min(round(0.64 * H), 660)
        report(P + "AR：沉浸＋满屏＋canvas 尺寸合 stage 公式（与底栏无关）", m["imm"] and m["disp"] == "none" and m["ar"] and m["ar"]["h"] == H
               and m["arCanvas"] and m["arCanvas"]["w"] == expW and m["arCanvas"]["h"] == expH, m)
        shot("ar-" + tag)
        ev("document.getElementById('sky-ar-back').click(); true", 0.5)
        m = meas()
        report(P + "AR 返回：底栏恢复", not m["imm"] and m["disp"] != "none" and m["open"] == [], m)

        # ---- 子视图开着切标签：app.js 批量收起 → 自动解沉浸 ----
        ev("window.Stars.openRegion('角宿'); true", 0.4)
        waitfor("!document.getElementById('view-star-region').hidden")
        ev("document.querySelector('[data-tab=\"tab-home\"]').click(); true", 0.5)
        m = meas()
        report(P + "切走标签：沉浸解除＋底栏恢复", not m["imm"] and m["disp"] != "none" and m["open"] == [], m)
        ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 0.8)
        m = meas()
        report(P + "回星象落地：底栏在位无沉浸", not m["imm"] and m["disp"] != "none" and m["open"] == [], m)

        errs = ev("window.__errs")
        report(P + "全程零 JS 异常", not errs, errs)
    finally:
        proc.terminate()

session(412, 915, "412", True)
session(390, 844, "390", False)

fails = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(fails), len(results)))
if fails:
    print("FAILURES:", fails); sys.exit(1)

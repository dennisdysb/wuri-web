#!/usr/bin/env python3
"""v2.1.0 (3) 专项冒烟（本地 file:// + CDP + 假相机/合成姿态）：
①层级互链修复：AR→星官详情→互链神祇卡→神祇详情（多点 elementFromPoint 网格全过、
  相机已停、AR 视图已收）、神祇返回→星官详情恢复（含滚动）＋AR 按来源重开回开启面板；
  星图链同验（星图+详情双双收起、返回双双恢复）；(7) 反向 神祇详情→本宿星官→区页→返回。
②浅入口：星象页悬浮相机钮（可见/切标签隐藏/真点直达 AR）、首页值神区小入口（真点直达 AR）、
  原深层入口（图鉴底双入口＋AR 整行卡）不回归。
沙箱边界：姿态合成注入、相机为 Chrome 假设备；真机手感不在覆盖内。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2103-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v100 缓存名", "wuri-v100-20261024-v210-4" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("四件套：CSS ?v=100＋版本 v2.1.0 (4)", "css/style.css?v=100" in html and "v2.1.0 (4)" in html)
report("浅入口在位（悬浮钮＋首页小行）", 'id="sx-ar-fab"' in html and 'class="home-ar-entry"' in html)
stars = open(os.path.join(WWW, "js/stars.js"), encoding="utf-8").read()
report("openDeity 来源栈含全部六子视图",
       all(("'" + v + "'") in stars for v in ["view-star-region", "view-butiange", "view-star-detail", "view-sky-tonight", "view-sky-chart", "view-sky-ar"])
       and "STAR_SUBVIEWS" in stars)
arjs = open(os.path.join(WWW, "js/sky-ar.js"), encoding="utf-8").read()
report("AR 导出 close＋悬浮钮同步逻辑", "close: function () { stopAR(); hide('view-sky-ar'); }" in arjs and "syncArFab" in arjs)
deijs = open(os.path.join(WWW, "js/deities.js"), encoding="utf-8").read()
report("神祇返回对 view-sky-ar 特判重开", "vid === 'view-sky-ar'" in deijs and "WuriSkyAR.open()" in deijs)

chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                           "--remote-debugging-port=%d" % PORT, "about:blank"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ws_url = None
    for _ in range(40):
        try:
            targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3))
            pages = [t for t in targets if t.get("type") == "page"]
            if pages: ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    assert ws_url, "chrome CDP 未就绪"
    cdp = base.CDP(base.ws_connect(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v
    def waitfor(js, timeout=20.0, step=0.4):
        end = time.time() + timeout
        while time.time() < end:
            if ev(js): return True
            time.sleep(step)
        return False
    def shot(name):
        import base64
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))
    def mouse(x, y):
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    def click_el(sel):
        # scrollIntoView 与量 rect 必须分开两拍：同一 JS 回合内量到的是滚动前旧 rect，
        # 点击会落空（首页小入口首跑实测）。等 rect 连续两拍不变再落点。
        ev("(() => { const e = document.querySelector(%s); if (!e) return false; e.scrollIntoView({block:'center'}); return true; })()" % json.dumps(sel), 0.3)
        box, last = None, None
        for _ in range(12):
            box = ev("(() => { const e = document.querySelector(%s); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()" % json.dumps(sel))
            if box and last and abs(box["x"] - last["x"]) < 1 and abs(box["y"] - last["y"]) < 1: break
            last = box; time.sleep(0.25)
        assert box, "元素不存在: " + sel
        mouse(box["x"], box["y"]); time.sleep(0.9)

    OWNER = """((x, y) => {
      const el = document.elementFromPoint(Math.floor(x), Math.floor(y));
      if (!el) return 'none';
      const views = ['view-deity-detail','view-star-detail','view-sky-ar','view-sky-chart','view-sky-tonight','view-star-region','view-butiange','view-deities','tab-stars','tab-home'];
      for (const id of views) { const v = document.getElementById(id); if (v && !v.hidden && v.contains(el)) return id; }
      return el.id ? '#' + el.id : (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : el.tagName);
    })"""
    CENTER = "(() => { const f = %s; return f(innerWidth/2, innerHeight/2); })()" % OWNER
    GRID = """(() => { const f = %s;
      return [[0.5,0.12],[0.5,0.35],[0.5,0.55],[0.5,0.75],[0.5,0.9],[0.2,0.93],[0.8,0.93]].map(([a,b]) => f(innerWidth*a, innerHeight*b)); })()""" % OWNER
    OPEN = """(() => ['view-deity-detail','view-star-detail','view-sky-ar','view-sky-chart','view-sky-tonight','view-star-region','view-butiange']
      .filter(id => { const v = document.getElementById(id); return v && !v.hidden; }))()"""

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    assert waitfor("!!document.querySelector('#tabbar button[data-tab=\\\"tab-stars\\\"]')")
    assert waitfor("!!window.WuriSkyAR && !!window.WuriSkyChart && !!window.Stars")

    # ---------- ② 首页小入口 ----------
    report("首屏（首页）悬浮钮隐藏", ev("document.getElementById('sx-ar-fab').hidden") is True)
    click_el(".home-ar-entry")
    report("硬断言：首页小入口真点→AR 视图（最上层＋开启面板）",
           ev("!document.getElementById('view-sky-ar').hidden") and ev(CENTER) == "view-sky-ar"
           and ev("!!document.querySelector('#ar-panel [data-ar=\\\"start\\\"]')"), ev(CENTER))
    shot("home-entry-ar")
    ev("document.getElementById('sky-ar-back').click(); true", 0.6)

    # ---------- ② 星象页悬浮钮 ----------
    ev("document.querySelector('#tabbar button[data-tab=\\\"tab-stars\\\"]').click(); true", 1.2)
    fabvis = ev("(() => { const f = document.getElementById('sx-ar-fab'); if (f.hidden) return false; const r = f.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return el === f || f.contains(el); })()")
    report("硬断言：星象页悬浮钮可见且为最上层", fabvis is True)
    shot("star-tab-fab")
    click_el("#sx-ar-fab")
    report("硬断言：悬浮钮真点→AR 视图（最上层＋开启面板）",
           ev("!document.getElementById('view-sky-ar').hidden") and ev(CENTER) == "view-sky-ar"
           and ev("!!document.querySelector('#ar-panel [data-ar=\\\"start\\\"]')"), ev(CENTER))
    ev("document.getElementById('sky-ar-back').click(); true", 0.6)
    ev("document.querySelector('#tabbar button[data-tab=\\\"tab-cal\\\"]').click(); true", 0.8)
    report("硬断言：切到黄历标签→悬浮钮隐藏", ev("document.getElementById('sx-ar-fab').hidden") is True)
    ev("document.querySelector('#tabbar button[data-tab=\\\"tab-stars\\\"]').click(); true", 1.0)
    report("切回星象标签→悬浮钮恢复显示", ev("document.getElementById('sx-ar-fab').hidden") is False)

    # ---------- ② 深层入口不回归 ----------
    assert waitfor("!!document.querySelector('[data-sx2=\\\"chart\\\"]')")
    click_el("[data-sx2=\"chart\"]")
    report("深层入口：星象页底「平面星图」卡→星图（最上层）",
           ev("!document.getElementById('view-sky-chart').hidden") and ev(CENTER) == "view-sky-chart", ev(CENTER))
    ev("document.getElementById('sky-chart-back').click(); true", 0.6)
    click_el("#sx3-ar-entry [data-sxar=\"open\"]")
    report("深层入口：星象页底 AR 整行卡→AR 视图（最上层）",
           ev("!document.getElementById('view-sky-ar').hidden") and ev(CENTER) == "view-sky-ar", ev(CENTER))
    ev("document.getElementById('sky-ar-back').click(); true", 0.6)

    # ---------- ① AR 链（真机报障原路） ----------
    click_el("#sx-ar-fab")
    ev("document.querySelector('#ar-panel [data-ar=\\\"start\\\"]').click(); true", 0.3)
    assert waitfor("window.WuriSkyAR && WuriSkyAR._state().running", timeout=25)
    target = None
    for az in range(0, 360, 15):
        ev("""(() => { const e = new DeviceOrientationEvent('deviceorientation', {alpha: %d, beta: 130, gamma: 0});
          window.dispatchEvent(e); return true; })()""" % ((360 - az) % 360), 0.9)
        labels = ev("window.WuriSkyAR._state().labels") or []
        cand = [L for L in labels if L["key"].split("|")[0].endswith("宿")]
        if cand: target = cand[0]; break
    report("AR 姿态轮询找到宿部星官标签", bool(target), target and target["key"])
    rect = ev("(() => { const r = document.getElementById('ar-canvas').getBoundingClientRect(); return {x: r.x, y: r.y}; })()")
    mouse(rect["x"] + target["x"], rect["y"] + target["y"]); time.sleep(1.2)
    report("硬断言：点标签→星官详情（最上层）",
           ev("!document.getElementById('view-star-detail').hidden") and ev(CENTER) == "view-star-detail", ev(CENTER))
    assert waitfor("!!document.querySelector('#sx-detail [data-sx-deity]')")
    ev("(() => { document.querySelector('#sx-detail [data-sx-deity]').scrollIntoView({block:'center'}); return true; })()", 0.6)
    sc_before = ev("document.getElementById('view-star-detail').scrollTop")
    box = ev("(() => { const r = document.querySelector('#sx-detail [data-sx-deity]').getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()")
    mouse(box["x"], box["y"]); time.sleep(1.2)
    grid = ev(GRID)
    dname = ev("document.getElementById('deity-detail-name').textContent")
    report("硬断言：互链神祇卡→神祇详情完整在最上层（网格 7 点全过）",
           all(g == "view-deity-detail" for g in grid) and ev("!document.getElementById('view-deity-detail').hidden"), grid)
    report("神祇详情名号已渲染（非空）", bool(dname and dname.strip()), dname)
    report("硬断言：AR 已收起且相机已停（无后台拍摄）",
           ev("document.getElementById('view-sky-ar').hidden") and ev("window.WuriSkyAR._state().running") is False,
           ev(OPEN))
    report("星官详情已随来源栈收起", ev("document.getElementById('view-star-detail').hidden") is True, ev(OPEN))
    shot("ar-chain-deity")
    # (7) 反向：神祇详情→本宿星官→区页→返回
    has_starlink = ev("!!document.querySelector('#deity-star-link button')")
    report("神祇详情含「本宿星官」链（星君）", has_starlink is True)
    if has_starlink:
        ev("document.querySelector('#deity-star-link button').click(); true", 0.9)
        report("硬断言：本宿星官→区页在最上层（盖住神祇详情）",
               ev("!document.getElementById('view-star-region').hidden") and ev(CENTER) == "view-star-region", ev(CENTER))
        ev("document.getElementById('star-region-back').click(); true", 0.7)
        report("硬断言：区页返回→露回神祇详情（最上层）",
               ev("document.getElementById('view-star-region').hidden") and ev(CENTER) == "view-deity-detail", ev(CENTER))
    # 神祇返回 → 星官详情恢复＋滚动恢复＋AR 重开回开启面板
    ev("document.getElementById('deity-detail-back').click(); true", 0.9)
    sc_after = ev("document.getElementById('view-star-detail').scrollTop")
    report("硬断言：神祇返回→星官详情恢复（最上层＋滚动恢复）",
           ev("!document.getElementById('view-star-detail').hidden") and ev(CENTER) == "view-star-detail"
           and abs((sc_after or 0) - (sc_before or 0)) <= 3, (sc_before, sc_after, ev(CENTER)))
    report("硬断言：AR 按来源重开（开启面板在位、待用户手势开启）",
           ev("!document.getElementById('view-sky-ar').hidden") and ev("!!document.querySelector('#ar-panel [data-ar=\\\"start\\\"]')"), ev(OPEN))
    shot("ar-chain-restored")
    ev("document.getElementById('star-detail-back').click(); true", 0.6)
    ev("document.getElementById('sky-ar-back').click(); true", 0.6)
    report("收尾：星官详情与 AR 均已关闭", ev(OPEN) == [], ev(OPEN))

    # ---------- ① 星图链（同族路径） ----------
    click_el("[data-sx2=\"chart\"]")
    assert waitfor("!!document.getElementById('sk-q')")
    ev("""(() => { const q = document.getElementById('sk-q'); q.value = '心';
      document.getElementById('sk-go').click(); return true; })()""", 0.8)
    ev("document.getElementById('sk-info-detail').click(); true", 1.0)
    report("星图链：搜索心宿→看详情→星官详情（最上层）",
           ev("!document.getElementById('view-star-detail').hidden") and ev(CENTER) == "view-star-detail", ev(CENTER))
    assert waitfor("!!document.querySelector('#sx-detail [data-sx-deity]')")
    click_el("#sx-detail [data-sx-deity]")
    grid2 = ev(GRID)
    report("硬断言：星图链互链→神祇详情完整在最上层（网格 7 点全过）",
           all(g == "view-deity-detail" for g in grid2), grid2)
    report("硬断言：星图与星官详情双双收起", ev(OPEN) == ["view-deity-detail"], ev(OPEN))
    shot("chart-chain-deity")
    ev("document.getElementById('deity-detail-back').click(); true", 0.9)
    report("硬断言：神祇返回→星官详情恢复且星图在下层待命",
           ev("!document.getElementById('view-star-detail').hidden") and ev("!document.getElementById('view-sky-chart').hidden")
           and ev(CENTER) == "view-star-detail", ev(OPEN))
    ev("document.getElementById('star-detail-back').click(); true", 0.6)
    report("硬断言：星官详情返回→回星图（最上层）",
           ev("!document.getElementById('view-sky-chart').hidden") and ev(CENTER) == "view-sky-chart", ev(CENTER))
    ev("document.getElementById('sky-chart-back').click(); true", 0.6)

    errs = ev("window.__errs ? window.__errs.length : 0")
    print("TOTAL %d/%d" % (sum(1 for _, ok in results if ok), len(results)))
finally:
    chrome.terminate()

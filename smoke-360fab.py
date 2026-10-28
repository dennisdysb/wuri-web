#!/usr/bin/env python3
# 360 档底栏五钮适配＋磬/返回圆形悬浮钮恢复批验证
# 用法: python3 smoke-360fab.py
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/reader-360/www")
OUT = os.path.expanduser("~/workspace/.wt/reader-360/fab360-shots"); os.makedirs(OUT, exist_ok=True)
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

class Sess:
    def __init__(self, vw, vh, theme=None):
        self.vw, self.vh = vw, vh
        self.dialogs = 0; self._ev_seen = 0
        port = base.free_port(); prof = "/tmp/chrome-r360fab-%d" % port
        env = dict(os.environ); env["TZ"] = "America/Toronto"
        self.proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
            "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof, "--window-size=500,1000",
            "--autoplay-policy=no-user-gesture-required", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        wsurl = None
        for _ in range(120):
            try:
                tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
                pg = [t for t in tg if t.get("type") == "page"]
                if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
            except Exception: pass
            time.sleep(0.5)
        self.c = base.CDP(base.ws_connect(wsurl))
        self.c.call("Page.enable"); self.c.call("Runtime.enable")
        theme_line = "localStorage.setItem('wuri_cfg_v1', JSON.stringify({theme:'night'}));" if theme == "night" else ""
        seed = r"""
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});
window.__plays=[];(function(){var OP=HTMLAudioElement.prototype.play;HTMLAudioElement.prototype.play=function(){window.__plays.push(this.getAttribute('src')||this.src||'');return OP.apply(this,arguments);};})();
try{
  localStorage.setItem('wuri_pro_redeem','1');
  localStorage.setItem('wuri_jing_turn','scroll');
  localStorage.setItem('wuri_jing_font','29');
  localStorage.setItem('wuri_jing_py','1');
  localStorage.removeItem('wuri_jing_autopos');
  localStorage.removeItem('wuri_jing_highlights');
  %s
}catch(e){}
""" % theme_line
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": seed})
        self.c.call("Emulation.setDeviceMetricsOverride", {"width": vw, "height": vh, "deviceScaleFactor": 3.0, "mobile": True})
        self.c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def ev(self, expr):
        r = self.c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True}, timeout=60)
        if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:400])
        return r["result"].get("value")
    def waitfor(self, x, t=60):
        t0 = time.time()
        while time.time() - t0 < t:
            try:
                if self.ev(x): return True
            except Exception: pass
            time.sleep(0.4)
        return False
    def click(self, sel, idx=0):
        box = self.ev("""(function(){var els=document.querySelectorAll(%s);var el=els[%d];if(!el)return null;
          var r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()""" % (json.dumps(sel), idx))
        if not box: raise RuntimeError("no element " + sel)
        self.c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        self.c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        time.sleep(0.4)
    def tap(self, x, y, wait=0.55):
        self.c.call("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 1}]})
        time.sleep(0.06)
        self.c.call("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        time.sleep(wait)
    def shot(self, name):
        r = self.c.call("Page.captureScreenshot", {"format": "png"})
        p = os.path.join(OUT, name); open(p, "wb").write(base64.b64decode(r["data"])); return p
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

def ensure_tab(s):
    for _ in range(120):
        if s.ev("document.getElementById('tab-jing').classList.contains('active')"): return True
        try: s.ev("document.querySelector('[data-tab=\"tab-jing\"]').click(); 'ok'")
        except Exception: pass
        time.sleep(0.6)
    return False

def open_book(s, book="s01"):
    s.waitfor("typeof window.JingOpenReader==='function'", 150)
    for _ in range(30):
        try: s.ev("window.JingOpenReader && window.JingOpenReader('%s'); 'ok'" % book)
        except Exception: pass
        if s.waitfor("!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>5", 10): return True
    return False

GEOM = r"""(function(){
  var iw = window.innerWidth;
  function R(el){ if(!el) return null; var r = el.getBoundingClientRect();
    return {l:Math.round(r.left*10)/10, r:Math.round(r.right*10)/10, t:Math.round(r.top*10)/10, b:Math.round(r.bottom*10)/10, w:Math.round(r.width*10)/10, h:Math.round(r.height*10)/10}; }
  var dock = document.getElementById('jing-dock');
  var row = dock.querySelector('.jing-dock-row');
  var btns = [].map.call(row.querySelectorAll('.jd-btn'), function(b){ var x = R(b); x.id = b.id; x.hidden = b.hidden; return x; });
  var vis = btns.filter(function(b){ return !b.hidden && b.h > 0; });
  var q = R(document.getElementById('qing-btn'));
  var bk = R(document.getElementById('jing-back-fab'));
  var sb = document.getElementById('jing-statusbar');
  function inter(a, b){ return a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; }
  return {
    iw: iw, dock: R(dock),
    lastR: vis.length ? vis[vis.length-1].r : 0,
    btns: vis, singleLine: (new Set(vis.map(function(b){return Math.round(b.t);}))).size === 1,
    eqH: vis.length ? (Math.max.apply(null, vis.map(function(b){return b.h;})) - Math.min.apply(null, vis.map(function(b){return b.h;}))) <= 3 : false,
    qingBtnInDock: !!dock.querySelector('#qing-btn'),
    qing: q, back: bk,
    qingShown: document.getElementById('qing-btn').classList.contains('show'),
    backShown: document.getElementById('jing-back-fab').classList.contains('show'),
    qingDockInter: inter(q, R(dock)), backDockInter: inter(bk, R(dock)), fabInter: inter(q, bk),
    statusOv: sb.scrollWidth - sb.clientWidth,
    docSW: document.documentElement.scrollWidth,
    errs: window.__errs
  };
})()"""

def geom_checks(s, tag):
    m = s.ev(GEOM)
    ok(m["qingBtnInDock"] is False, tag + ": 磬已撤出底栏")
    ok(len(m["btns"]) == 5, tag + ": 底栏主行五钮 (n=%d)" % len(m["btns"]))
    ok(m["lastR"] <= m["iw"], tag + ": 末钮右缘 %s <= %s" % (m["lastR"], m["iw"]))
    ok(m["docSW"] <= m["iw"], tag + ": 无横滚 docSW=%s" % m["docSW"])
    ok(m["singleLine"] and m["eqH"], tag + ": 五钮单行等高")
    ok(m["statusOv"] <= 0, tag + ": 状态行不溢出 (ov=%s)" % m["statusOv"])
    ok(m["qingShown"] and m["backShown"], tag + ": 两悬浮钮 .show 在场")
    q, bk, dk = m["qing"], m["back"], m["dock"]
    ok(q and q["w"] == 56 and q["h"] == 56, tag + ": 磬钮 56×56 圆形")
    ok(bk and bk["w"] == 56 and bk["h"] == 56, tag + ": 返回钮 56×56 圆形")
    ok(q and abs(q["r"] - (m["iw"] - 18)) <= 1, tag + ": 磬钮右距 18 (r=%s)" % (q and q["r"]))
    ok(bk and abs(bk["l"] - 18) <= 1, tag + ": 返回钮左距 18 (l=%s)" % (bk and bk["l"]))
    ok(not m["qingDockInter"] and not m["backDockInter"], tag + ": 两钮不压底栏 (磬底=%s 返回底=%s 栏顶=%s)" % (q and q["b"], bk and bk["b"], dk and dk["t"]))
    ok(not m["fabInter"], tag + ": 两钮互不重叠")
    ok(m["errs"] == [], tag + ": 零 JS 错误 %s" % m["errs"])
    return m

# ---------- 360 主场 ----------
s = Sess(360, 740)
try:
    ok(s.waitfor("!!document.querySelector('[data-tab=\"tab-jing\"]')"), "360: app loaded")
    ok(ensure_tab(s), "360: jing tab active")
    ok(open_book(s), "360: s01 opened (scroll)")
    time.sleep(1.5)
    geom_checks(s, "360")
    ok(s.ev("document.getElementById('jing-bookmark-fab').classList.contains('show')") is False,
       "360: 精选书不显示书签悬浮钮")
    s.shot("day-scroll-360.png")
    # 沉浸同进同退（点实测段落中心，避开节题/叩磬标注等手势排除区）
    pc = s.ev("""(function(){var ps=document.querySelectorAll('#jing-content .jing-para');
      for(var i=0;i<ps.length;i++){var r=ps[i].getBoundingClientRect();
        if(r.top>80 && r.bottom<600 && r.height>30) return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)};}
      return {x:180,y:370};})()""")
    s.tap(pc["x"], pc["y"])
    imm = s.ev("""(function(){var cs=function(id){var c=getComputedStyle(document.getElementById(id));return {o:c.opacity, pe:c.pointerEvents};};
      return {cls: document.body.classList.contains('jing-immersive'), dock: cs('jing-dock'), qing: cs('qing-btn'), back: cs('jing-back-fab')};})()""")
    ok(imm["cls"] and imm["dock"]["o"] == "0" and imm["qing"]["o"] == "0" and imm["back"]["o"] == "0"
       and imm["qing"]["pe"] == "none" and imm["back"]["pe"] == "none", "360: 沉浸时底栏与两钮同收 %s" % imm)
    s.tap(pc["x"], pc["y"])
    imm2 = s.ev("""(function(){var cs=function(id){return getComputedStyle(document.getElementById(id)).opacity;};
      return {cls: document.body.classList.contains('jing-immersive'), dock: cs('jing-dock'), qing: cs('qing-btn'), back: cs('jing-back-fab')};})()""")
    ok((not imm2["cls"]) and imm2["dock"] == "1" and imm2["qing"] == "1" and imm2["back"] == "1", "360: 退出沉浸三者同回 %s" % imm2)
    # 末行净空：滚到底，末段底缘不得压过磬钮顶
    s.ev("window.scrollTo(0, document.body.scrollHeight); document.scrollingElement.scrollTop = 1e7; 'ok'")
    time.sleep(0.8)
    clr = s.ev("""(function(){var ps=document.querySelectorAll('#jing-content .jing-para');var last=ps[ps.length-1];
      var q=document.getElementById('qing-btn').getBoundingClientRect();
      return {paraB: Math.round(last.getBoundingClientRect().bottom), fabT: Math.round(q.top)};})()""")
    ok(clr["paraB"] <= clr["fabT"] + 1, "360: 滚到底末行底缘 %s 不压磬钮顶 %s" % (clr["paraB"], clr["fabT"]))
    s.ev("window.scrollTo(0,0); document.scrollingElement.scrollTop = 0; 'ok'")
    time.sleep(0.5)
    # 敲磬真触发
    n0 = s.ev("window.__plays.length")
    s.click("#qing-btn")
    time.sleep(0.5)
    plays = s.ev("window.__plays")
    ok(any("qing.mp3" in p for p in plays[n0:]), "360: 点磬触发 qing.mp3 播放 %s" % plays[n0:])
    # 设置面板 360 可用性
    s.click("#jing-more-btn"); time.sleep(0.5)
    pm = s.ev("""(function(){var p=document.getElementById('jing-more-panel');var r=p.getBoundingClientRect();
      var hs=[].map.call(p.querySelectorAll('.jmp-h'),function(h){return h.textContent.trim();});
      return {hidden:p.hidden, ov:p.scrollWidth-p.clientWidth, l:Math.round(r.left), r:Math.round(r.right), hs:hs};})()""")
    ok(pm["hidden"] is False and pm["ov"] <= 1 and pm["l"] >= 0 and pm["r"] <= 360, "360: 设置面板不溢出 %s" % pm)
    ok(pm["hs"] == ["播放", "显示", "翻页", "本书"], "360: 面板四组齐 %s" % pm["hs"])
    s.shot("day-panel-360.png")
    # 面板内切翻页模式：底栏仍合、两钮仍在
    s.click("#jing-turn-btn")
    ok(s.waitfor("document.getElementById('jing-reader').classList.contains('reader-paged')", 20), "360: 切入翻页模式")
    ok(s.waitfor(r"/\d+\s*\/\s*\d+/.test((document.getElementById('jing-page-ind')||{}).textContent||'')", 45), "360: 翻页页码发布")
    if not s.ev("document.getElementById('jing-more-panel').hidden"):
        s.click("#jing-more-btn"); time.sleep(0.4)  # 关面板后量稳态几何（面板是 dock 的展开态、不计入打架口径）
    geom_checks(s, "360-paged")
    s.shot("day-paged-360.png")
    # 切回滚动并关面板，再验返回钮真退出
    if s.ev("document.getElementById('jing-more-panel').hidden"):
        s.click("#jing-more-btn"); time.sleep(0.3)
    s.click("#jing-turn-btn")
    ok(s.waitfor("!document.getElementById('jing-reader').classList.contains('reader-paged')", 20), "360: 切回滚动模式")
    if not s.ev("document.getElementById('jing-more-panel').hidden"):
        s.click("#jing-more-btn"); time.sleep(0.3)
    s.click("#jing-back-fab")
    ok(s.waitfor("document.getElementById('jing-reader').hidden", 10), "360: 点返回钮真退出阅读器")
    time.sleep(1.2)
    gone = s.ev("(function(){return {q: document.getElementById('qing-btn').classList.contains('show'), b: document.getElementById('jing-back-fab').classList.contains('show')};})()")
    ok(gone["q"] is False and gone["b"] is False, "360: 退出后两钮同隐 %s" % gone)
    ok(s.ev("window.__errs") == [], "360: 全程零 JS 错误")
finally:
    s.close()

# ---------- 390 / 412 几何 ----------
for vw, vh in [(390, 844), (412, 915)]:
    s = Sess(vw, vh)
    try:
        s.waitfor("!!document.querySelector('[data-tab=\"tab-jing\"]')")
        ensure_tab(s)
        ok(open_book(s), "%d: s01 opened" % vw)
        time.sleep(1.2)
        geom_checks(s, str(vw))
        s.shot("day-scroll-%d.png" % vw)
    finally:
        s.close()

# ---------- 360 夜间 ----------
s = Sess(360, 740, theme="night")
try:
    s.waitfor("!!document.querySelector('[data-tab=\"tab-jing\"]')")
    ensure_tab(s)
    ok(open_book(s), "360-night: s01 opened")
    time.sleep(1.2)
    ok(s.ev("document.documentElement.getAttribute('data-theme')") == "night", "360-night: 夜间主题生效")
    geom_checks(s, "360-night")
    s.shot("night-scroll-360.png")
finally:
    s.close()

# ---------- 360 内丹：书签图标与悬浮钮不重叠 ----------
s = Sess(360, 740)
try:
    s.waitfor("!!document.querySelector('[data-tab=\"tab-jing\"]')")
    ensure_tab(s)
    ok(open_book(s, "s18"), "360-s18: 内丹书 opened")
    time.sleep(1.2)
    bm = s.ev("""(function(){function R(el){if(!el)return null;var r=el.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,h:r.height};}
      function inter(a,b){return a&&b&&a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b;}
      var ico=document.getElementById('jing-bookmark-ico');
      return {icoHidden: ico.hidden, ico: R(ico), q: R(document.getElementById('qing-btn')), bk: R(document.getElementById('jing-back-fab')),
              iq: inter(R(ico), R(document.getElementById('qing-btn'))), ib: inter(R(ico), R(document.getElementById('jing-back-fab')))};})()""")
    ok(bm["icoHidden"] is False, "360-s18: 状态行书签图标可见")
    ok(bm["iq"] is False and bm["ib"] is False, "360-s18: 书签图标与两悬浮钮不重叠")
    # 书签悬浮钮：显示/竖叠几何
    bf = s.ev("""(function(){function R(el){if(!el)return null;var r=el.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height};}
      function inter(a,b){return a&&b&&a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b;}
      var f=document.getElementById('jing-bookmark-fab');
      return {shown: f.classList.contains('show'), f: R(f),
              interBack: inter(R(f), R(document.getElementById('jing-back-fab'))),
              interQing: inter(R(f), R(document.getElementById('qing-btn'))),
              interDock: inter(R(f), R(document.getElementById('jing-dock'))),
              gap: Math.round(R(document.getElementById('jing-back-fab')).t - R(f).b)};})()""")
    ok(bf["shown"] is True, "360-s18: 书签悬浮钮显示")
    ok(bf["f"] and bf["f"]["w"] == 56 and bf["f"]["h"] == 56 and abs(bf["f"]["l"] - 18) <= 1, "360-s18: 书签钮 56×56 左距 18")
    ok(bf["interBack"] is False and bf["interQing"] is False and bf["interDock"] is False,
       "360-s18: 书签钮与返回/磬/底栏互不重叠 (距返回钮 %s)" % bf["gap"])
    ok(bf["gap"] is not None and 10 <= bf["gap"] <= 18, "360-s18: 书签钮在返回钮上方间隙 %s" % bf["gap"])
    s.shot("day-s18-fabs-360.png")
    # 点书签钮真落签
    ok(s.ev("(window.JingMark && window.JingMark.getBookmark('s18')) == null"), "360-s18: 点前无书签")
    s.click("#jing-bookmark-fab")
    time.sleep(0.6)
    saved = s.ev("(function(){var b=window.JingMark && window.JingMark.getBookmark('s18');return b?{y:b.scrollTop,exp:(b.expanded||[]).length}:null;})()")
    ok(saved is not None, "360-s18: 点书签钮落后一枚书签 %s" % saved)
    # 退出重进，书签还在
    s.click("#jing-back-fab")
    ok(s.waitfor("document.getElementById('jing-reader').hidden", 10), "360-s18: 退出阅读器")
    ok(open_book(s, "s18"), "360-s18: 重进内丹书")
    time.sleep(1.0)
    again = s.ev("(window.JingMark && window.JingMark.getBookmark('s18')) != null")
    ok(again is True, "360-s18: 重进书签还在")
    ok(s.ev("document.getElementById('jing-bookmark-fab').classList.contains('show')") is True, "360-s18: 重进书签钮复现")
    ok(s.ev("window.__errs") == [], "360-s18: 零 JS 错误")
finally:
    s.close()

print("\n==== %d PASS / %d FAIL ====" % (len(PASS), len(FAIL)))
for f in FAIL: print("FAILED:", f)
sys.exit(1 if FAIL else 0)

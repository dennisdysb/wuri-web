#!/usr/bin/env python3
# 阅读器撤翻页＋内丹/道藏底栏注音钮（2026-10-29 批）验证：
#  - 分页整体不存在：无切换钮/无页码元素/无 reader-paged/钩子全无
#  - 存量 wuri_jing_turn='page' 迁移：开书直接滚动、偏好规范化为 scroll
#  - 滚动能力全保：滚动进度/跟读锚点/目录/标记往返
#  - 内丹/道藏底栏：目录｜字｜全展开/全收回｜注音（单节：目录｜字｜注音），
#    我的标记底栏钮撤下（DOM 不存在）、字面板本书组仍可进且返回原位
#  - v315/v316 回归：悬浮钮分书类、磬闸、常见五钮、回选部、账号卡删节
# 用法: python3 smoke-nopage.py
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/nopage/www")
OUT = os.path.expanduser("~/workspace/.wt/nopage/nopage-shots"); os.makedirs(OUT, exist_ok=True)
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

import hashlib as _hl
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = _hl.sha256(open(_WG, "rb").read()).hexdigest()

class Sess:
    def __init__(self, vw, vh, theme=None, red=False, turn=None):
        self.vw, self.vh = vw, vh
        port = base.free_port(); prof = "/tmp/chrome-nopage-%d" % port
        env = dict(os.environ); env["TZ"] = "America/Toronto"
        self.proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
            "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
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
        turn_js = ("localStorage.setItem('wuri_jing_turn','%s');" % turn) if turn else ""
        seed = r"""
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});
window.__plays=[];(function(){
  var d=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
  Object.defineProperty(HTMLAudioElement.prototype,'currentTime',{
    get:function(){return (window.__fakePos!=null)?window.__fakePos:d.get.call(this);},
    set:function(v){try{d.set.call(this,v);}catch(e){}}});
  HTMLAudioElement.prototype.play=function(){window.__plays.push(this.getAttribute('src')||this.src||'');return Promise.resolve();};
})();
try{
  localStorage.setItem('wuri_pro_redeem','1');
  localStorage.setItem('wuri_jing_py','1');
  localStorage.removeItem('wuri_jing_autopos');
  localStorage.removeItem('wuri_jing_highlights');
  localStorage.removeItem('wuri_jing_bookmarks');
  %s
  %s
}catch(e){}
""" % (turn_js, "localStorage.setItem('wuri_cfg_v1', JSON.stringify({theme:'night'}));" if theme == "night" else "")
        if red:
            seed = seed.replace("}catch(e){}", "localStorage.setItem('wuri_sky_redlight_v1','1');}catch(e){}")
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
    def shot(self, name):
        r = self.c.call("Page.captureScreenshot", {"format": "png"})
        p = os.path.join(OUT, name); open(p, "wb").write(base64.b64decode(r["data"])); return p
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

def ensure_tab(s):
    if not s.waitfor("typeof window.t==='function' && typeof window.JingOpenReader==='function'", 90):
        s.c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
        s.waitfor("typeof window.t==='function' && typeof window.JingOpenReader==='function'", 90)
    for _ in range(120):
        try:
            if s.ev("!!(document.getElementById('tab-jing')||{}).classList && document.getElementById('tab-jing').classList.contains('active')"): return True
            s.ev("document.querySelector('[data-tab=\\\"tab-jing\\\"]').click(); 'ok'")
        except Exception: pass
        time.sleep(0.6)
    return False

def open_book(s, book="s01"):
    s.waitfor("typeof window.JingOpenReader==='function'", 150)
    cond = "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>3 && document.querySelectorAll('#jing-content .jing-sec-body').length>0"
    for _ in range(3):
        try: s.ev("window.JingOpenReader && window.JingOpenReader('%s'); 'ok'" % book)
        except Exception: pass
        if s.waitfor(cond, 90): return True
    return False

DOCKVIS = r"""(function(){var m=document.getElementById('jing-dock-main');
  return [].map.call(m.querySelectorAll('.jd-btn'), function(b){return b.id;})
    .filter(function(id){var b=document.getElementById(id);return !b.hidden && getComputedStyle(b).display!=='none';});})()"""
FABS = r"""(function(){function R(id){var el=document.getElementById(id);if(!el)return null;
    var r=el.getBoundingClientRect();var cs=getComputedStyle(el);
    return {show: el.classList.contains('show'), l:Math.round(r.left), r:Math.round(r.right),
            t:Math.round(r.top), b:Math.round(r.bottom), op: cs.opacity};}
  return {qing: R('qing-btn'), back: R('jing-back-fab'), bm: R('jing-bookmark-fab'),
          ghost: document.body.classList.contains('fabs-ghost'), iw: window.innerWidth};})()"""
NOPAGE = r"""(function(){return {
  turnBtn: !!document.getElementById('jing-turn-btn'),
  pageInd: !!document.getElementById('jing-page-ind'),
  dockMarks: !!document.getElementById('jing-dock-marks'),
  pagedCls: document.getElementById('jing-reader').classList.contains('reader-paged'),
  hookActive: typeof window.__wuriPagedActive, hookFuse: typeof window.__wuriPagedFuse,
  hookModel: typeof window.__wuriPageModel, hookOfOff: typeof window.__wuriPageOfOffset,
  hookGoPara: typeof window.__wuriReaderGoToPara,
  bodyOv: document.body.style.overflow,
  turnPref: (function(){try{return localStorage.getItem('wuri_jing_turn')}catch(e){return 'ERR'}})(),
  statusTxt: (document.getElementById('jing-status-text')||{}).textContent || '',
  statusAll: (document.getElementById('jing-statusbar')||{}).textContent || ''};})()"""

def check_nopage(s, tag):
    np_ = s.ev(NOPAGE)
    ok(not np_["turnBtn"] and not np_["pageInd"] and not np_["dockMarks"],
       "%s: 翻页切换钮/页码元素/底栏我的标记钮 DOM 皆不存在 %s" % (tag, {k: np_[k] for k in ("turnBtn", "pageInd", "dockMarks")}))
    ok(np_["hookActive"] == "undefined" and np_["hookFuse"] == "undefined" and np_["hookModel"] == "undefined"
       and np_["hookOfOff"] == "undefined" and np_["hookGoPara"] == "undefined",
       "%s: 分页跨闭包钩子全无 %s" % (tag, {k: np_[k] for k in ("hookActive", "hookFuse", "hookModel", "hookOfOff", "hookGoPara")}))
    ok(not np_["pagedCls"] and np_["bodyOv"] == "", "%s: 无 reader-paged 类、body 未锁滚动 %s" % (tag, {"pagedCls": np_["pagedCls"], "bodyOv": np_["bodyOv"]}))
    import re as _re
    ok(not _re.search(r"\d+\s*/\s*\d+", np_["statusAll"]), "%s: 状态行无页码形态「%s」" % (tag, np_["statusAll"].strip()[:40]))
    return np_

# ================= N1: 360 日间，存量 turn='page' 迁移 + s01 =================
s = Sess(360, 740, turn="page")
try:
    ok(s.waitfor("!!document.querySelector('[data-tab=\\\"tab-jing\\\"]')"), "N1: app loaded")
    ok(ensure_tab(s), "N1: jing tab active")
    s.ev("window.__errs.length = 0; 'ok'")
    ok(open_book(s, "s01"), "N1: s01 opened（存量 pref=page）")
    time.sleep(1.2)
    np_ = check_nopage(s, "N1")
    ok(np_["turnPref"] == "scroll", "N1: 存量偏好已规范化为 scroll（实测 %s）" % np_["turnPref"])
    ok("本书" in np_["statusTxt"] or "已读完" in np_["statusTxt"], "N1: 状态行为滚动口径「%s」" % np_["statusTxt"].strip()[:30])
    dv = s.ev(DOCKVIS)
    ok(dv == ["jing-read-btn", "jing-recite", "jing-font-btn", "jing-foldall", "jing-pybtn"], "N1: 常见经文底栏五钮 %s" % dv)
    f = s.ev(FABS)
    ok(f["qing"]["show"] and f["back"]["show"] and f["bm"]["show"] and not f["ghost"], "N1/v316: s01 三悬浮钮齐现（磬闸：常见经文＋敲磬标注）")
    # 字面板：显示组仅字小/字大；本书组仅我的标记
    s.click("#jing-font-btn"); time.sleep(0.5)
    panel = s.ev("""(function(){var fp=document.getElementById('jing-font-panel');
      var secs=fp.querySelectorAll('.jmp-sec');
      var disp=[].map.call(secs[0].querySelectorAll('button'), function(b){return b.id;});
      var bk=[].map.call(secs[1].querySelectorAll('button'), function(b){return b.id;});
      var mb=document.getElementById('jing-marks-btn');
      return {disp: disp, bk: bk, mbVis: !!mb && !mb.hidden, mbTxt: mb?mb.textContent.trim():''};})()""")
    ok(panel["disp"] == ["jing-font-dec", "jing-font-inc"], "N1: 字面板显示组仅字小/字大（翻页切换已删）%s" % panel["disp"])
    ok(panel["bk"] == ["jing-marks-btn"] and panel["mbVis"] and panel["mbTxt"] == "我的标记", "N1: 字面板本书组仅「我的标记」且可见 %s" % panel)
    s.click("#jing-font-btn"); time.sleep(0.4)
    # 滚动进度：窗口滚动生效、百分比随滚动推进
    s.ev("(function(){var h=document.documentElement.scrollHeight; window.scrollTo(0, Math.round(h*0.45)); return h;})()")
    time.sleep(1.6)
    st = s.ev("""(function(){return {y: window.scrollY, txt: (document.getElementById('jing-status-text')||{}).textContent||''};})()""")
    ok(st["y"] > 800, "N1: 窗口可滚动（scrollY=%s）" % st["y"])
    import re as _re
    m = _re.search(r"本书\s*(\d+)%", st["txt"])
    ok(m and int(m.group(1)) > 0, "N1: 滚动后状态行百分比推进「%s」" % st["txt"].strip()[:40])
    # 跟读开关锚点不动（滚动口径回归）
    s.ev("window.scrollTo(0, 6000); 'ok'"); time.sleep(0.8)
    ANCH = """(function(){var ps=document.querySelectorAll('#jing-content .jing-para');
      for(var i=0;i<ps.length;i++){var r=ps[i].getBoundingClientRect();
        if(r.top>150 && r.top<400) return {sec:ps[i].getAttribute('data-sec'),para:ps[i].getAttribute('data-para'),top:Math.round(r.top*10)/10,y:window.scrollY};}
      return null;})()"""
    a0 = s.ev(ANCH)
    s.ev("document.getElementById('jing-read-btn').click(); 'ok'"); time.sleep(0.3)
    s.ev("document.getElementById('jing-follow').click(); 'ok'"); time.sleep(1.0)
    a1 = s.ev(ANCH)
    ok(a0 and a1 and a0["sec"] == a1["sec"] and a0["para"] == a1["para"] and abs(a0["y"] - a1["y"]) <= 2 and abs(a0["top"] - a1["top"]) <= 3,
       "N1: 开跟读锚点不动 (%s -> %s)" % (a0, a1))
    s.ev("document.getElementById('jing-follow').click(); 'ok'"); time.sleep(1.0)
    a2 = s.ev(ANCH)
    ok(a0 and a2 and a0["sec"] == a2["sec"] and a0["para"] == a2["para"] and abs(a0["y"] - a2["y"]) <= 2,
       "N1: 关跟读锚点不动 (%s -> %s)" % (a0, a2))
    s.ev("document.getElementById('jing-read-btn').click(); 'ok'"); time.sleep(0.3)
    s.shot("nopage-s01-360.png")
    errs = s.ev("window.__errs")
    ok(errs == [], "N1: 全程零 JS 错误 %s" % errs)
finally:
    s.close()

# ================= N2: 360 日间 内丹 s18 + 单节 s41 =================
s = Sess(360, 740)
try:
    ok(ensure_tab(s), "N2: jing tab active")
    s.ev("window.__errs.length = 0; 'ok'")
    ok(open_book(s, "s18"), "N2: 内丹 s18 opened")
    time.sleep(1.2)
    check_nopage(s, "N2")
    dv = s.ev(DOCKVIS)
    ok(dv == ["jing-toc-btn", "jing-font-btn", "jing-foldall", "jing-pybtn"], "N2: 内丹底栏＝目录｜字｜全展开｜注音 %s" % dv)
    py = s.ev("""(function(){var b=document.getElementById('jing-pybtn');
      return {label: b.textContent.trim(), store: localStorage.getItem('wuri_jing_py')};})()""")
    ok(py["label"] == "注音关" and py["store"] == "1", "N2: 注音钮初始＝注音关/py=1 %s" % py)
    s.click("#jing-pybtn"); time.sleep(0.5)
    py = s.ev("""(function(){var b=document.getElementById('jing-pybtn');
      return {label: b.textContent.trim(), store: localStorage.getItem('wuri_jing_py')};})()""")
    ok(py["label"] == "注音开" and py["store"] == "0", "N2: 点注音钮→注音开/py=0（全局偏好同源）%s" % py)
    s.click("#jing-pybtn"); time.sleep(0.5)
    py = s.ev("""(function(){var b=document.getElementById('jing-pybtn');
      return {label: b.textContent.trim(), store: localStorage.getItem('wuri_jing_py')};})()""")
    ok(py["label"] == "注音关" and py["store"] == "1", "N2: 再点→注音关/py=1 %s" % py)
    f = s.ev(FABS)
    ok(f["ghost"] and not f["qing"]["show"] and f["back"]["show"] and f["bm"]["show"], "N2/v316: 内丹悬浮钮 ghost 且无磬")
    # 我的标记：字面板本书组进、返回回原位
    s.ev("window.scrollTo(0, 2600); 'ok'"); time.sleep(0.9)
    y0 = s.ev("window.scrollY")
    s.click("#jing-font-btn"); time.sleep(0.5)
    s.click("#jing-marks-btn"); time.sleep(0.9)
    ok(s.ev("!document.getElementById('jing-marks').hidden && document.getElementById('jing-reader').hidden"), "N2: 字面板进我的标记")
    s.click("#marks-back"); time.sleep(1.2)
    back = s.ev("""(function(){return {reader: !document.getElementById('jing-reader').hidden,
      id: window._jingCurrentId, y: window.scrollY};})()""")
    ok(back["reader"] and back["id"] == "s18" and abs(back["y"] - y0) <= 6, "N2: 标记返回回原书原位 %s (y0=%s)" % (back, y0))
    # 单节书：s41 入药镜（节数按数据动态判定，单节时期望无展开钮）
    s.ev("if(window.closeReader) window.closeReader(); 'ok'"); time.sleep(0.6)
    ok(open_book(s, "s41"), "N2: 内丹 s41 opened")
    time.sleep(1.0)
    nsec = s.ev("(window.JINGWEN && window.JINGWEN['s41'] && window.JINGWEN['s41'].sections) ? window.JINGWEN['s41'].sections.length : -1")
    dv = s.ev(DOCKVIS)
    if nsec == 1:
        ok(dv == ["jing-toc-btn", "jing-font-btn", "jing-pybtn"], "N2: 单节内丹底栏＝目录｜字｜注音 %s" % dv)
    else:
        ok("jing-pybtn" in dv and "jing-dock-marks" not in dv and dv[-1] == "jing-pybtn",
           "N2: s41 节数=%s（非单节），注音居底栏最右 %s" % (nsec, dv))
    s.shot("nopage-neidan-360.png")
    errs = s.ev("window.__errs")
    ok(errs == [], "N2: 全程零 JS 错误 %s" % errs)
finally:
    s.close()

# ================= N3: 390 夜+红光 道藏 KR5b0001（单卷） =================
s = Sess(390, 844, theme="night", red=True)
try:
    ok(ensure_tab(s), "N3: jing tab active")
    s.ev("window.__errs.length = 0; 'ok'")
    s.ev("var h=document.querySelector('[data-dz-toggle]'); if(h) h.click(); 'ok'"); time.sleep(2.0)
    s.waitfor("!!document.querySelector('[data-dz-bu]')", 60)
    s.ev("if(window.__wuri_dzOpenWork) window.__wuri_dzOpenWork('KR5b0001'); 'ok'")
    ok(s.waitfor("!document.getElementById('jing-reader').hidden && window._jingCurrentId==='KR5b0001'", 60), "N3: 道藏 KR5b0001 opened")
    time.sleep(1.2)
    ok(s.ev("document.body.classList.contains('sky-red')"), "N3: 红光态生效")
    check_nopage(s, "N3")
    dv = s.ev(DOCKVIS)
    ok(dv == ["jing-toc-btn", "jing-font-btn", "jing-pybtn"], "N3: 单卷道藏底栏＝目录｜字｜注音 %s" % dv)
    f = s.ev(FABS)
    ok(f["ghost"] and not f["qing"]["show"], "N3/v316: 道藏悬浮钮 ghost 且无磬")
    # 道藏注音实开关：关→正文 .no-py；开→恢复
    py0 = s.ev("""(function(){return {noPy: document.getElementById('jing-content').classList.contains('no-py'),
      rt: document.querySelectorAll('#jing-content rt').length,
      label: document.getElementById('jing-pybtn').textContent.trim()};})()""")
    ok(not py0["noPy"] and py0["rt"] > 0 and py0["label"] == "注音关", "N3: 道藏注音开态（rt=%s）%s" % (py0["rt"], py0["label"]))
    s.click("#jing-pybtn"); time.sleep(0.8)
    py1 = s.ev("""(function(){return {noPy: document.getElementById('jing-content').classList.contains('no-py'),
      store: localStorage.getItem('wuri_jing_py'),
      label: document.getElementById('jing-pybtn').textContent.trim()};})()""")
    ok(py1["noPy"] and py1["store"] == "0" and py1["label"] == "注音开", "N3: 点注音钮→关（.no-py/py=0）%s" % py1)
    s.click("#jing-pybtn"); time.sleep(0.8)
    py2 = s.ev("""(function(){return {noPy: document.getElementById('jing-content').classList.contains('no-py'),
      store: localStorage.getItem('wuri_jing_py'),
      label: document.getElementById('jing-pybtn').textContent.trim()};})()""")
    ok(not py2["noPy"] and py2["store"] == "1" and py2["label"] == "注音关", "N3: 再点→开 %s" % py2)
    # 目录钮开目录（首行我的标记）
    s.click("#jing-toc-btn"); time.sleep(0.5)
    ok(s.ev("!document.getElementById('jing-toc').hidden && !!document.querySelector('[data-toc-marks]')"), "N3: 目录钮开目录视图（首行我的标记）")
    s.ev("var t=document.querySelector('[data-toc-close]'); if(t) t.click(); 'ok'"); time.sleep(0.4)
    # 字面板本书组进标记并返回
    s.click("#jing-font-btn"); time.sleep(0.5)
    s.click("#jing-marks-btn"); time.sleep(0.9)
    ok(s.ev("!document.getElementById('jing-marks').hidden && document.getElementById('jing-reader').hidden"), "N3: 道藏字面板进我的标记")
    s.click("#marks-back"); time.sleep(1.0)
    ok(s.ev("!document.getElementById('jing-reader').hidden && window._jingCurrentId==='KR5b0001'"), "N3: 返回回道藏原书")
    s.shot("nopage-dz-390-red.png")
    errs = s.ev("window.__errs")
    ok(errs == [], "N3: 全程零 JS 错误 %s" % errs)
finally:
    s.close()

# ================= N4: 412 日间 s02 + 回选部 + 账号卡删节回归 =================
s = Sess(412, 915)
try:
    ok(ensure_tab(s), "N4: jing tab active")
    s.ev("window.__errs.length = 0; 'ok'")
    ok(open_book(s, "s02"), "N4: s02 opened")
    time.sleep(1.2)
    check_nopage(s, "N4")
    dv = s.ev(DOCKVIS)
    ok(dv == ["jing-read-btn", "jing-recite", "jing-font-btn", "jing-foldall", "jing-pybtn"], "N4: 412 五钮齐全 %s" % dv)
    geo = s.ev("""(function(){var iw=window.innerWidth;
      return {docSW: document.documentElement.scrollWidth, iw: iw,
              lastR: Math.round(document.getElementById('jing-pybtn').getBoundingClientRect().right)};})()""")
    ok(geo["docSW"] <= geo["iw"] and geo["lastR"] <= geo["iw"], "N4: 412 无横滚、末钮不溢出 %s" % geo)
    s.ev("if(window.closeReader) window.closeReader(); 'ok'"); time.sleep(0.8)
    s.ev("var h=document.querySelector('[data-dz-toggle]'); if(h) h.click(); 'ok'"); time.sleep(2.0)
    s.waitfor("!!document.querySelector('[data-dz-bu]')", 60)
    # 回选部（道藏架深滚）
    fab0 = s.ev("!!document.getElementById('dz-bu-fab') && !document.getElementById('dz-bu-fab').hidden")
    ok(not fab0, "N4/reg: 未深滚时回选部钮不出现")
    s.ev("var b=document.querySelector('[data-dz-bu=\\\"洞玄部\\\"]'); var w=document.querySelector('[data-dz-works=\\\"洞玄部\\\"]'); if(b && w && w.hidden) b.click(); 'ok'")
    time.sleep(1.2)
    s.ev("""(function(){var w=document.querySelector('[data-dz-works="洞玄部"]');
      var rows=w.querySelectorAll('.dz-work'); if(rows[150]) rows[150].scrollIntoView({block:'start'}); return rows.length;})()""")
    time.sleep(1.2)
    fab1 = s.ev("""(function(){var f=document.getElementById('dz-bu-fab');
      if(!f) return {vis:false};
      var r=f.getBoundingClientRect();
      return {vis: !f.hidden && r.height>0, txt: f.textContent.trim()};})()""")
    ok(fab1["vis"] and "选部" in fab1["txt"], "N4/reg: 深滚后回选部钮出现 %s" % fab1)
    s.click("#dz-bu-fab")
    back_ok = False
    for _ in range(14):
        time.sleep(0.4)
        t = s.ev("""(function(){var h=document.querySelector('[data-dz-bu="洞玄部"]');
          return h ? Math.round(h.getBoundingClientRect().top) : null;})()""")
        if t is not None and -10 <= t <= 130: back_ok = True; break
    ok(back_ok, "N4/reg: 点钮后洞玄部标题行回到视口顶部区域 (top=%s)" % t)
    # 账号卡删节（v315 第 18/19 条回归）
    acct = s.ev("""(function(){return {
      gift: !!document.getElementById('acct-gift-code') || !!document.getElementById('acct-gift-btn'),
      mig: !!document.getElementById('acct-mig-code') || !!document.getElementById('acct-mig-issue-btn'),
      bind: !!document.getElementById('acct-bind-code') && !!document.getElementById('acct-bind-btn')};})()""")
    ok(not acct["gift"] and not acct["mig"] and acct["bind"], "N4/reg: 账号卡赠送/迁移节已删、绑码在位 %s" % acct)
    errs = s.ev("window.__errs")
    ok(errs == [], "N4: 全程零 JS 错误 %s" % errs)
finally:
    s.close()

# ================= N5: 360 分享钮（share 模拟 + 复制回落） =================
SEL_JS = r"""(function(){var ps=document.querySelectorAll('#jing-content .jing-para');
  for(var i=0;i<ps.length;i++){ var p=ps[i]; if(!p.offsetParent) continue;
    var w=document.createTreeWalker(p, NodeFilter.SHOW_TEXT); var n; var nodes=[];
    while((n=w.nextNode())){ if(n.parentNode && n.parentNode.tagName==='RT') continue;
      if(n.textContent) nodes.push(n); }
    var total=nodes.reduce(function(a,x){return a+x.textContent.length;},0);
    if(total<6) continue;
    var last=nodes[nodes.length-1];
    var r=document.createRange(); r.setStart(nodes[0],0);
    var acc=0, endNode=nodes[0], endOff=0;
    for(var j=0;j<nodes.length;j++){ if(acc+nodes[j].textContent.length>=6){ endNode=nodes[j]; endOff=6-acc; break; } acc+=nodes[j].textContent.length; }
    r.setEnd(endNode, endOff);
    var sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    var txt=nodes.map(function(x){return x.textContent;}).join('').slice(0,6);
    return sel.rangeCount? txt : null; }
  return null;})()"""
POP_STATE = r"""(function(){var pop=document.getElementById('hl-pop');
  var sh=document.getElementById('hl-share'); var cb=pop.querySelector('[data-hl-color]');
  function R(el){ if(!el) return null; var r=el.getBoundingClientRect();
    return {l:Math.round(r.left), r:Math.round(r.right), t:Math.round(r.top), w:Math.round(r.width)}; }
  var idx=(window.JINGWEN_INDEX||[]).filter(function(x){return x.id==='s01';})[0]||{};
  var d=(window.JINGWEN||{})['s01']||{};
  var a=window.getSelection().anchorNode; var el=a&&(a.nodeType===1?a:a.parentElement);
  var pp=el&&el.closest?el.closest('.jing-para'):null;
  var si=pp?+(pp.getAttribute('data-sec')||0):0; var secN=(d.sections||[])[si]||{};
  return {popHidden: pop.hidden, pop: R(pop), share: R(sh), color: R(cb),
          inPop: !!sh && sh.parentElement===pop,
          title: idx.title||'', sec: secN.h||''};})()"""
s = Sess(360, 740)
try:
    ok(ensure_tab(s), "N5: jing tab active")
    s.ev("window.__errs.length = 0; 'ok'")
    ok(open_book(s, "s01"), "N5: s01 opened")
    time.sleep(1.0)
    # Phase A: 模拟支持 navigator.share
    s.ev("""(function(){window.__shareCalls=[];
      Object.defineProperty(navigator,'share',{configurable:true,writable:true,
        value:function(o){window.__shareCalls.push(o);return Promise.resolve();}}); return 1;})()""")
    sel_txt = s.ev(SEL_JS)
    ok(bool(sel_txt), "N5: 程序化选中正文「%s」" % sel_txt)
    time.sleep(2.0)  # selectionchange 防抖 800ms + 渲染
    ps = s.ev(POP_STATE)
    ok(not ps["popHidden"] and ps["share"] and ps["inPop"], "N5: 选字弹窗含分享钮（与色板同容器）%s" % ps)
    ok(ps["share"]["l"] >= 0 and ps["share"]["r"] <= 360 and ps["pop"]["r"] <= 361,
       "N5: 360 档分享钮与弹窗不溢出 %s" % {"share": ps["share"], "pop": ps["pop"]})
    ok(abs(ps["share"]["t"] - ps["color"]["t"]) <= 8, "N5: 分享钮与色板同排（top 差 %s）" % abs(ps["share"]["t"] - ps["color"]["t"]))
    exp = (sel_txt or "").strip() + "\n——《" + ps["title"] + "》" + ("·" + ps["sec"] if ps["sec"] else "")
    s.click("#hl-share"); time.sleep(0.8)
    calls = s.ev("window.__shareCalls")
    ok(len(calls) == 1 and calls[0].get("text") == exp, "N5: navigator.share 以正确文案调用\n  期望 %r\n  实得 %r" % (exp, calls))
    tail = s.ev("""(function(){return {popHidden: document.getElementById('hl-pop').hidden,
      sel: window.getSelection().toString()};})()""")
    ok(tail["popHidden"] and tail["sel"] == "", "N5: 分享后弹窗收起、选区清空 %s" % tail)
    # Phase B: 不支持 share → 复制回落 + toast
    s.ev("""(function(){window.__copied=null;
      Object.defineProperty(navigator,'share',{configurable:true,writable:true,value:undefined});
      Object.defineProperty(navigator,'clipboard',{configurable:true,writable:true,
        value:{writeText:function(t){window.__copied=t;return Promise.resolve();}}}); return 1;})()""")
    sel2 = s.ev(SEL_JS)
    time.sleep(2.0)
    ps2 = s.ev(POP_STATE)
    ok(not ps2["popHidden"] and ps2["share"], "N5: 回落相弹窗再现分享钮")
    exp2 = (sel2 or "").strip() + "\n——《" + ps2["title"] + "》" + ("·" + ps2["sec"] if ps2["sec"] else "")
    s.click("#hl-share"); time.sleep(0.8)
    copied = s.ev("window.__copied")
    ok(copied == exp2, "N5: 不支持 share 时复制全文案 %r" % (copied,))
    toast = s.ev("""(function(){var t=document.getElementById('jing-toast');
      return t ? {txt: t.textContent, op: t.style.opacity} : null;})()""")
    ok(toast and toast["txt"] == "已复制，去粘贴分享", "N5: 复制回落 toast 出现 %s" % toast)
    tail2 = s.ev("document.getElementById('hl-pop').hidden && window.getSelection().toString()===''")
    ok(tail2, "N5: 回落后弹窗/选区收尾正常")
    s.shot("nopage-share-360.png")
    errs = s.ev("window.__errs")
    ok(errs == [], "N5: 全程零 JS 错误 %s" % errs)
finally:
    s.close()

# ================= N6: 360 书签（继续阅读）日期+时间 =================
s = Sess(360, 740)
try:
    ok(ensure_tab(s), "N6: jing tab active")
    s.ev("window.__errs.length = 0; 'ok'")
    ok(open_book(s, "s01"), "N6: s01 opened")
    time.sleep(1.0)
    import time as _time
    t_click = _time.time()
    s.click("#jing-bookmark-fab"); time.sleep(0.8)
    ok(s.ev("(JSON.parse(localStorage.getItem('wuri_jing_bookmarks')||'{}')['s01']||[]).length>=1"), "N6: 悬浮钮存下书签")
    # 存量仅日期记录（旧格式：单对象 + ts 为 'YYYY-MM-DD' 字符串）
    s.ev("""(function(){var bm=JSON.parse(localStorage.getItem('wuri_jing_bookmarks')||'{}');
      bm['s02']={ts:'2026-10-20', id:'bmlegacy1', off:0, scrollTop:0, expanded:[]};
      localStorage.setItem('wuri_jing_bookmarks', JSON.stringify(bm)); return 1;})()""")
    s.click("#jing-font-btn"); time.sleep(0.5)
    s.click("#jing-marks-btn"); time.sleep(1.0)
    s.click(".marks-tab[data-tab=\"bookmark\"]"); time.sleep(0.8)
    metas = s.ev("""(function(){return [].map.call(document.querySelectorAll('#jing-marks .jing-hl-item .hl-meta'),
      function(m){return m.textContent.trim();});})()""")
    ok(len(metas) >= 2, "N6: 标记列表含新旧两条书签 %s" % metas)
    import re as _re2
    dt_metas = [m for m in metas if _re2.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2} · 点击继续阅读$", m)]
    ok(len(dt_metas) == 1, "N6: 新书签显日期+时间 %s" % metas)
    if dt_metas:
        from datetime import datetime as _dt
        from zoneinfo import ZoneInfo as _ZI
        parsed = _dt.strptime(dt_metas[0][:16], "%Y-%m-%d %H:%M").replace(tzinfo=_ZI("America/Toronto"))
        ok(abs(parsed.timestamp() - t_click) <= 61, "N6: 时分与开书存签时刻一致（±1min）%s vs click epoch %d" % (dt_metas[0], int(t_click)))
    ok("2026-10-20 · 点击继续阅读" in metas, "N6: 存量仅日期记录只显日期 %s" % metas)
    ok(not any("NaN" in m for m in metas), "N6: 无 NaN 坏值")
    s.shot("nopage-bookmark-time-360.png")
    errs = s.ev("window.__errs")
    ok(errs == [], "N6: 全程零 JS 错误 %s" % errs)
finally:
    s.close()

print("\n==== nopage smoke: %d PASS / %d FAIL ====" % (len(PASS), len(FAIL)))
for f_ in FAIL: print("FAILED:", f_)
sys.exit(1 if FAIL else 0)

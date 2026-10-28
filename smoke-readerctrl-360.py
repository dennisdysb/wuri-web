#!/usr/bin/env python3
# 阅读器底部控制栏批验证：底栏布局/设置面板分节/沉浸零重排/翻页落位稳定采样/
# 页模型/跟读首播零弹窗(dialog 断言)/390 场底栏不溢出
# 用法: python3 smoke-readerctrl.py [412|390|both]
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/reader-360/www")
OUT = os.path.expanduser("~/workspace/.wt/reader-360/ctrl-shots"); os.makedirs(OUT, exist_ok=True)
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

class Sess:
    def __init__(self, vw, vh, dsf, turn):
        self.vw, self.vh = vw, vh
        self.dialogs = 0; self._ev_seen = 0
        port = base.free_port(); prof = "/tmp/chrome-rctrl2-%d" % port
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
        seed = r"""
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});
window.__audios=[];(function(){var OA=window.Audio;window.Audio=function(){var x=new (Function.prototype.bind.apply(OA,[null].concat([].slice.call(arguments))));window.__audios.push(x);return x;};window.Audio.prototype=OA.prototype;})();
try{
  localStorage.setItem('wuri_pro_redeem','1');
  localStorage.setItem('wuri_jing_turn','%s');
  localStorage.setItem('wuri_jing_font','29');
  localStorage.setItem('wuri_jing_py','1');
  localStorage.removeItem('wuri_jing_autopos');
  localStorage.removeItem('wuri_jing_highlights');
}catch(e){}
""" % turn
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": seed})
        self.c.call("Emulation.setDeviceMetricsOverride", {"width": vw, "height": vh, "deviceScaleFactor": dsf, "mobile": True})
        self.c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def pump(self):
        evs = self.c.events
        while self._ev_seen < len(evs):
            m = evs[self._ev_seen]; self._ev_seen += 1
            if m.get("method") == "Page.javascriptDialogOpening":
                self.dialogs += 1
                try: self.c.call("Page.handleJavaScriptDialog", {"accept": True})
                except Exception: pass
    def ev(self, expr):
        r = self.c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True}, timeout=60)
        self.pump()
        if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:400])
        return r["result"].get("value")
    def waitfor(self, x, t=60):
        t0 = time.time()
        while time.time() - t0 < t:
            self.pump()
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
        time.sleep(0.4); self.pump()
    def tap(self, x, y, wait=0.55):
        self.c.call("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 1}]})
        time.sleep(0.06)
        self.c.call("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        time.sleep(wait); self.pump()
    def shot(self, name):
        r = self.c.call("Page.captureScreenshot", {"format": "png"})
        p = os.path.join(OUT, name); open(p, "wb").write(base64.b64decode(r["data"])); return p
    def sample(self, secs=3.0):
        rows = []
        t0 = time.time()
        while time.time() - t0 < secs:
            rows.append(self.ev("""(function(){var sc=document.getElementById('jing-content');
              return {sl:sc.scrollLeft, sw:sc.scrollWidth, ch:sc.clientHeight,
              ind:(document.getElementById('jing-page-ind')||{}).textContent||''};})()"""))
            time.sleep(0.3)
        return rows
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

def const_rows(rows):
    keys = set()
    for r in rows: keys.add(json.dumps(r, sort_keys=True))
    return len(keys) == 1

def ensure_tab(s):
    # 两个坑：①CSS 未加载时 .tab 的 computed display 是默认 block（误判已激活）；
    # ②tab 钮在应用绑事件之前点会被吞。以 classList.contains('active') 为准反复点到激活
    for _ in range(120):
        act = s.ev("document.getElementById('tab-jing').classList.contains('active')")
        if act: return True
        try: s.ev("document.querySelector('[data-tab=\"tab-jing\"]').click(); 'ok'")
        except Exception: pass
        time.sleep(0.6)
    return False

def toggle_turn(s):
    # 面板开/关状态不确定时先确保打开再点翻页钮（turn 钮在面板内，面板关着时零坐标）
    if s.ev("document.getElementById('jing-more-panel').hidden"):
        s.click("#jing-more-btn"); time.sleep(0.3)
    s.click("#jing-turn-btn")

def open_book(s, book="s01"):
    # 沙箱冷加载慢：JingOpenReader 未定义前调用会被 && 静默吞掉——等函数就绪后重试调用直到开书
    s.waitfor("typeof window.JingOpenReader==='function'", 150)
    for _ in range(30):
        try: s.ev("window.JingOpenReader && window.JingOpenReader('%s'); 'ok'" % book)
        except Exception: pass
        if s.waitfor("!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>5", 10): return True
    return False

def run_main():
    s = Sess(412, 915, 2.625, "scroll")
    try:
        ok(s.waitfor("!!document.querySelector('[data-tab=\"tab-jing\"]')"), "app loaded")
        ok(ensure_tab(s), "jing tab active")
        ok(open_book(s), "s01 opened (scroll)")
        time.sleep(1.2)
        m = s.ev("""(function(){
          var rd=document.getElementById('jing-reader');
          var dock=document.getElementById('jing-dock');
          var row=dock.querySelector('.jing-dock-row');
          var btns=[].map.call(row.querySelectorAll('.jd-btn'),function(b){var r=b.getBoundingClientRect();return {id:b.id,t:Math.round(r.top),h:Math.round(r.height),w:Math.round(r.width)};});
          return {
            readerOpen: document.body.classList.contains('reader-open'),
            tabbar: getComputedStyle(document.getElementById('tabbar')).display,
            appbar: getComputedStyle(document.querySelector('#tab-jing .appbar')).display,
            rheadInReader: !!rd.querySelector('.jing-rhead'),
            dockShown: dock.getBoundingClientRect().height>0,
            rowOverflow: row.scrollWidth - row.clientWidth,
            btns: btns,
            status: (document.getElementById('jing-status-text')||{}).textContent||'',
            fabs: {back: !!document.getElementById('jing-back-fab'), qing: !!document.getElementById('qing-fab'), bm: !!document.getElementById('jing-bookmark-fab')}
          };})()""")
        ok(m["readerOpen"] is True, "body.reader-open on")
        ok(m["tabbar"] == "none", "tabbar hidden in reader")
        ok(m["appbar"] == "none", "jing appbar hidden in reader")
        ok(m["rheadInReader"] is False, "top toolbar removed from reader")
        ok(m["dockShown"] is True, "dock visible (scroll)")
        ok(m["rowOverflow"] <= 0, "dock row no overflow @412 (scroll)")
        vis = [b for b in m["btns"] if b["h"] > 0]  # hidden 的停止钮不计
        tops = set(b["t"] for b in vis); hs = set(b["h"] for b in vis)
        ok(len(tops) == 1 and max(hs) - min(hs) <= 3, "dock buttons single line equal height: %s" % m["btns"])
        ok("本书" in m["status"], "status line shows 本书%%: " + m["status"])
        ok(m["fabs"]["back"] and m["fabs"]["bm"], "back/bookmark fabs restored (2026-10-28 user directive)")
        scroll_dock_h = s.ev("document.querySelector('.jing-dock-row').getBoundingClientRect().height")
        s.shot("day-scroll-dock-412.png")
        # 设置面板分节
        s.click("#jing-more-btn")
        time.sleep(0.4)
        pm = s.ev("""(function(){var p=document.getElementById('jing-more-panel');
          return {hidden:p.hidden, heads:[].map.call(p.querySelectorAll('.jmp-h'),function(h){return h.textContent;}),
          ids:['jing-voice','jing-speak-p','jing-follow-p','jing-pybtn-p','jing-font-dec','jing-font-inc','jing-turn-btn','jing-recite','jing-highlight-btn','jing-toc-btn','jing-download','jing-foldall','jing-bookmark-btn','jing-marks-btn'].map(function(id){var e=document.getElementById(id);return id+':'+(e?'y':'MISSING');})};})()""")
        ok(pm["hidden"] is False, "settings panel opens")
        ok(pm["heads"] == ["播放", "显示", "翻页", "本书"], "panel sections 播放/显示/翻页/本书: %s" % pm["heads"])
        ok(all(x.endswith(":y") for x in pm["ids"]), "panel controls all present: %s" % pm["ids"])
        ok(s.ev("document.getElementById('jing-bookmark-btn').hidden") is True, "bookmark btn hidden for non-neidan s01")
        ok(s.ev("document.getElementById('jing-bookmark-ico').hidden") is True, "bookmark ico hidden for non-neidan s01")
        ok(s.ev("document.getElementById('jing-marks-btn').hidden") is True, "marks btn hidden for non-neidan s01")
        s.shot("day-panel-412.png")
        # 字号生效（种子字号 29 已是最大档：先点字小验减小、再点字大验恢复）
        fs0 = s.ev("parseFloat(getComputedStyle(document.querySelector('#jing-content .jing-para')).fontSize)")
        s.click("#jing-font-dec"); time.sleep(0.3)
        fsA = s.ev("parseFloat(getComputedStyle(document.querySelector('#jing-content .jing-para')).fontSize)")
        ok(fsA < fs0, "font dec works %s<%s" % (fsA, fs0))
        s.click("#jing-font-inc"); time.sleep(0.3)
        fs1 = s.ev("parseFloat(getComputedStyle(document.querySelector('#jing-content .jing-para')).fontSize)")
        ok(fs1 > fsA, "font inc restores %s>%s (base %s)" % (fs1, fsA, fs0))
        # 点外关面板（在阅读器容器上派发点击：只走 document 关面板委托，不触发正文沉浸切换）
        s.ev("document.getElementById('jing-reader').dispatchEvent(new MouseEvent('click',{bubbles:true})); 'ok'"); time.sleep(0.4)
        ok(s.ev("document.getElementById('jing-more-panel').hidden") is True, "panel closes on outside click")
        # 滚动沉浸：先展开首节并滚一段，确保点到的是真可见正文段（折叠段 rect 为 0 会误点卷题）
        s.ev("""(function(){var b=document.querySelector('#jing-content .jing-sec-body');if(b&&b.hidden){var h=document.querySelector('#jing-content .jing-sec-h');if(h)h.click();}})(); 'ok'""")
        time.sleep(0.8)
        s.ev("window.scrollTo(0, 260); 'ok'"); time.sleep(0.6)
        y0 = s.ev("window.scrollY")
        box = s.ev("""(function(){var ps=document.querySelectorAll('#jing-content .jing-para');for(var i=0;i<ps.length;i++){if(!ps[i].offsetParent)continue;var r=ps[i].getBoundingClientRect();if(r.top>250&&r.bottom<700)return {x:r.left+r.width/2,y:r.top+r.height/2};}return null;})()""")
        ok(box is not None, "immersive target para visible")
        s.c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        s.c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        time.sleep(0.5); s.pump()
        im = s.ev("""(function(){var d=document.getElementById('jing-dock');return {imm:document.body.classList.contains('jing-immersive'),op:getComputedStyle(d).opacity,pe:getComputedStyle(d).pointerEvents,y:window.scrollY};})()""")
        ok(im["imm"] and im["op"] == "0" and im["pe"] == "none", "scroll immersive hides dock: %s" % im)
        ok(abs(im["y"] - y0) <= 2, "immersive toggle keeps scrollY (%s vs %s)" % (im["y"], y0))
        s.c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        s.c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        time.sleep(0.5)
        ok(s.ev("document.body.classList.contains('jing-immersive')") is False, "immersive exits")
        # 切翻页
        toggle_turn(s)
        ok(s.waitfor("window.__wuriPagedActive && window.__wuriPagedActive()"), "paged mode on")
        ok(s.waitfor("window.__wuriPagedGeoOK && window.__wuriPagedGeoOK()", 40), "paged geometry OK")
        time.sleep(1.5)
        ph = s.ev("document.querySelector('.jing-dock-row').getBoundingClientRect().height")
        ok(abs(ph - scroll_dock_h) <= 3, "dock row height identical paged vs scroll (%s vs %s)" % (ph, scroll_dock_h))
        # 页码总数只在量测定死后发布：给足静置时间等「N / 总」出现
        s.waitfor("'/' in (document.getElementById('jing-page-ind')||{}).textContent", 30)
        ind = s.ev("document.getElementById('jing-page-ind').textContent")
        ok("/" in ind, "page indicator in status line: " + ind)
        s.shot("day-paged-412.png")
        rows = s.sample(3.0)
        ok(const_rows(rows), "paged settle 3s constant: %s" % rows[-1])
        # 翻到第 5-7 页区
        for i in range(5): s.tap(412 * 0.88, 915 * 0.5)
        time.sleep(1.0)
        s.waitfor("'/' in (document.getElementById('jing-page-ind')||{}).textContent", 30)
        cur = s.ev("document.getElementById('jing-page-ind').textContent")
        ok(cur.startswith("6 /"), "tapped to page 6: " + cur)
        rows = s.sample(3.0)
        ok(const_rows(rows), "page6 settle 3s constant (flicker zone)")
        sl0 = rows[-1]["sl"]
        # 沉浸开：几何与落位纹丝不动
        s.tap(412 * 0.5, 915 * 0.5, wait=0.8)
        ok(s.ev("document.body.classList.contains('jing-immersive')") is True, "paged immersive on")
        rows = s.sample(3.0)
        ok(const_rows(rows) and rows[-1]["sl"] == sl0, "immersive ON: geometry+sl frozen (sl=%s)" % rows[-1]["sl"])
        s.tap(412 * 0.5, 915 * 0.5, wait=0.8)
        rows = s.sample(3.0)
        ok(const_rows(rows) and rows[-1]["sl"] == sl0, "immersive OFF: geometry+sl frozen")
        # 连翻 10 页恰 +10
        for i in range(10): s.tap(412 * 0.88, 915 * 0.5, wait=0.16)
        time.sleep(1.2)
        s.waitfor("'/' in (document.getElementById('jing-page-ind')||{}).textContent", 30)
        cur = s.ev("document.getElementById('jing-page-ind').textContent")
        ok(cur.startswith("16 /"), "rapid 10 taps = +10 pages: " + cur)
        rows = s.sample(2.5)
        ok(const_rows(rows), "after rapid paging settle constant")
        # 页模型
        model = s.ev("window.__wuriPageModel && window.__wuriPageModel()")
        if "/" not in cur:
            s.waitfor("'/' in (document.getElementById('jing-page-ind')||{}).textContent", 30)
            cur = s.ev("document.getElementById('jing-page-ind').textContent")
        disp_total = int(cur.split("/")[1].strip()) if "/" in cur else -1
        ok(model and disp_total > 0 and model["count"] == disp_total, "page model count == displayed total (%s vs %s)" % (model and model["count"], disp_total))
        mono = all(model["ranges"][i]["startOff"] <= model["ranges"][i]["endOff"] and (i == 0 or model["ranges"][i]["startOff"] >= model["ranges"][i-1]["startOff"]) for i in range(len(model["ranges"])))
        ok(mono, "page model ranges monotonic")
        pof = s.ev("window.__wuriPageOfOffset(window.__wuriPageModel().ranges[2].startOff)")
        ok(pof == 2, "pageOfOffset(ranges[2].startOff)==2")
        # ===== 音频：跟读首播零弹窗 =====
        toggle_turn(s)  # 回滚动
        ok(s.waitfor("!document.getElementById('jing-reader').classList.contains('reader-paged')"), "back to scroll")
        s.ev("document.getElementById('jing-more-btn').click(); 'ok'"); time.sleep(0.3)
        s.ev("""(function(){var v=document.getElementById('jing-voice');v.value='female';v.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()""")
        time.sleep(0.4)
        s.ev("document.getElementById('jing-more-panel').hidden=true; 'ok'")
        s.click("#jing-follow"); time.sleep(1.2)
        ok(s.ev("document.getElementById('jing-follow').classList.contains('on')") is True, "follow mode on")
        # 点一段正文 -> followSeek 播放（女声，带 seek 的路径正是原弹错路径）
        box = s.ev("""(function(){var ps=document.querySelectorAll('#jing-content .jing-para');for(var i=0;i<ps.length;i++){if(!ps[i].offsetParent)continue;var r=ps[i].getBoundingClientRect();if(r.top>150&&r.bottom<700)return {x:r.left+r.width/2,y:r.top+r.height/2};}return null;})()""")
        s.c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        s.c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        # 沙箱 Chromium 无 MP3 解码（实测 err=4/ns=3、play() 本身成功）：断言口径＝
        # 任一音频元素到达终态（playing 或媒体错误落定）即证明装载/播放链已串行
        # 跑通、无弹窗；可解码环境再加 currentTime 推进断言
        term = "window.__audios.some(function(a){return !a.paused || a.error;})"
        ok(s.waitfor(term, 60), "follow seek issues play (female): %s" % s.ev("window.__audios.map(function(a){return {src:(a.src||'').split('/').pop(),paused:a.paused,err:a.error?a.error.code:null,rs:a.readyState};})"))
        ast = s.ev("""(function(){var a=window.__audios[window.__audios.length-1];return {paused:a.paused,rs:a.readyState,err:a.error?a.error.code:null,ct:a.currentTime,src:(a.src||'').split('/').pop()};})()""")
        ok("female" in ast["src"], "female src loaded: %s" % ast)
        if ast["rs"] >= 2:
            t1 = ast["ct"]; time.sleep(1.6)
            t2 = s.ev("window.__audios[window.__audios.length-1].currentTime")
            ok(t2 > t1, "audio actually advancing %.2f -> %.2f" % (t1, t2))
        else:
            print("NOTE sandbox codec blocked (rs=%s err=%s): advance check skipped" % (ast["rs"], ast["err"]))
        ok(s.dialogs == 0, "zero JS dialogs after follow start (got %d)" % s.dialogs)
        toast = s.ev("""(function(){var all=document.querySelectorAll('div');for(var i=0;i<all.length;i++){if(all[i].textContent&&all[i].textContent.indexOf('播放失败')>=0&&all[i].offsetParent)return true;}return false;})()""")
        ok(toast is False, "no visible 播放失败 toast")
        # 停止 -> 诵读 -> 切男声自动续播（断言口径同上：playing 态或媒体错误均算链路通）
        s.click("#jing-stop"); time.sleep(0.6)
        ok(s.ev("window.__audios[window.__audios.length-1].paused") is True, "stop pauses audio")
        s.click("#jing-speak")
        ok(s.waitfor(term, 60), "speak restarts playback: %s" % s.ev("window.__audios.map(function(a){return {src:(a.src||'').split('/').pop(),paused:a.paused,err:a.error?a.error.code:null,rs:a.readyState};})"))
        s.ev("""(function(){var v=document.getElementById('jing-voice');v.value='male';v.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()""")
        ok(s.waitfor("window.__audios.some(function(a){return a.src.indexOf('male')>=0 && (!a.paused || a.error);})", 60), "voice switch to male auto-resumes")
        ok(s.dialogs == 0, "zero JS dialogs through voice switch (got %d)" % s.dialogs)
        s.click("#jing-stop"); time.sleep(0.4)
        errs = s.ev("window.__errs")
        ok(errs == [], "zero JS errors: %s" % errs)
    finally:
        s.close()

def run_390():
    s = Sess(390, 844, 3, "page")
    try:
        s.waitfor("!!document.querySelector('[data-tab=\"tab-jing\"]')")
        ensure_tab(s)
        open_book(s)
        ok(s.waitfor("window.__wuriPagedActive && window.__wuriPagedActive()"), "390 paged on")
        s.waitfor("window.__wuriPagedGeoOK && window.__wuriPagedGeoOK()", 40)
        time.sleep(1.2)
        m = s.ev("""(function(){var row=document.querySelector('.jing-dock-row');
          var btns=[].map.call(row.querySelectorAll('.jd-btn'),function(b){var r=b.getBoundingClientRect();return {id:b.id,t:Math.round(r.top),h:Math.round(r.height)};});
          return {overflow: row.scrollWidth-row.clientWidth, btns: btns};})()""")
        ok(m["overflow"] <= 0, "390 dock row no overflow")
        tops = set(b["t"] for b in m["btns"] if b["h"] > 0)
        ok(len(tops) == 1, "390 dock buttons single line")
        s.shot("day-paged-390.png")
        rows = s.sample(2.5)
        ok(const_rows(rows), "390 settle constant")
        s.tap(390 * 0.5, 844 * 0.5, wait=0.8)
        rows2 = s.sample(2.5)
        ok(const_rows(rows2) and rows2[-1]["sl"] == rows[-1]["sl"] and rows2[-1]["ch"] == rows[-1]["ch"], "390 immersive toggle freezes geometry")
    finally:
        s.close()

which = sys.argv[1] if len(sys.argv) > 1 else "both"
if which in ("412", "both"): run_main()
if which in ("390", "both"): run_390()
print("\n==== %d PASS / %d FAIL ====" % (len(PASS), len(FAIL)))
for f in FAIL: print("FAILED:", f)
sys.exit(1 if FAIL else 0)

#!/usr/bin/env python3
# 专项冒烟（2026-10-29）：道藏来源书书头「底本」框隐藏扩围——精选 KR 转录书
# （s40《悟真篇》等 10 部）阅读页不显示 #jing-srcnote；道藏全集 KR 书保持不显示；
# 常见经文（s28《臨水夫人寶誥》）书头（傳本 subtitle）与改前一致。
# 判定口径：jingwen.js isKrSourced（daozang 标记／JING_PUNCT_SRC 映射／note 内 KR 编号）。
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
WWW = os.path.expanduser("~/workspace/.wt/srcnote/www")
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

class Sess:
    def __init__(self, vw=360, vh=740):
        port = base.free_port(); prof = "/tmp/chrome-srcnote-%d" % port
        env = dict(os.environ); env["TZ"] = "America/Toronto"
        self.proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
            "--allow-file-access-from-files",
            "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
            "--remote-debugging-port=%d" % port,
            "--user-data-dir=" + prof, "--window-size=500,1000",
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
try{ localStorage.setItem('wuri_pro_redeem','1'); }catch(e){}
"""
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": seed})
        self.c.call("Emulation.setDeviceMetricsOverride", {"width": vw, "height": vh, "deviceScaleFactor": 2, "mobile": True})
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
    def click(self, sel):
        self.ev("(function(){var el=document.querySelector(%s);if(el)el.scrollIntoView({block:'center'});})()" % json.dumps(sel))
        time.sleep(0.5)
        box = self.ev("""(function(){var el=document.querySelector(%s);if(!el)return null;
          var r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()""" % json.dumps(sel))
        if not box: raise RuntimeError("no element " + sel)
        self.c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        self.c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        time.sleep(0.4)
    def open_row(self, sel, bid):
        # 点架上行开卷：先 CDP 真点，未生效则 DOM click 兜底（同为应用委托处理器路径）
        self.click(sel)
        if self.waitfor("window._jingCurrentId===%s" % json.dumps(bid), 12): return True
        self.ev("(function(){var el=document.querySelector(%s);if(el)el.click();})()" % json.dumps(sel))
        return self.waitfor("window._jingCurrentId===%s && !document.getElementById('jing-reader').hidden" % json.dumps(bid), 30)
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

s = Sess()
try:
    ok(s.waitfor("!!document.querySelector('[data-tab=\"tab-jing\"]')"), "S0 应用就绪")
    s.click('[data-tab="tab-jing"]')
    ok(s.waitfor("!!document.querySelector('.jing-item[data-jing=\"s40\"]')"), "S1 经文架含 s40")

    # ---- s40 精选内丹（KR 转录）：底本框须隐藏，subtitle 保留 ----
    ok(s.open_row('.jing-item[data-jing="s40"]', 's40'), "S2 s40 开卷")
    ok(s.waitfor("document.querySelectorAll('#jing-content .jing-para, #jing-content p').length>0", 30), "S2b s40 正文已渲染")
    st = s.ev("""(function(){var n=document.getElementById('jing-srcnote'),t=document.getElementById('jing-title'),u=document.getElementById('jing-subtitle');
      return {noteHidden:n.hidden, noteText:n.textContent, title:t.textContent, subHidden:u.hidden, subText:u.textContent};})()""")
    ok(st["noteHidden"] is True, "S3 s40 底本框隐藏 (hidden=true)")
    ok("悟真篇" in st["title"], "S3b s40 标题正确")
    ok(st["subHidden"] is False and "修真十书" in st["subText"], "S3c s40 subtitle 保留（只撤底本框）")

    # ---- 三态（360）：日/夜/红光下底本框恒隐藏且无横向溢出 ----
    for label, setup in [
        ("日间", "document.documentElement.setAttribute('data-theme','day')"),
        ("夜间", "document.documentElement.setAttribute('data-theme','night')"),
        ("红光", "(window.WuriRedlight&&WuriRedlight.set)?WuriRedlight.set(true):(localStorage.setItem('wuri_sky_redlight_v1','1'),document.body.classList.add('sky-red'))"),
    ]:
        s.ev(setup); time.sleep(0.3)
        v = s.ev("""(function(){var n=document.getElementById('jing-srcnote');
          return {h:n.hidden, sw:document.documentElement.scrollWidth};})()""")
        ok(v["h"] is True and v["sw"] <= 360, "S4 三态-%s：底本框隐藏＋无横溢 (sw=%s)" % (label, v["sw"]))
    s.ev("(window.WuriRedlight&&WuriRedlight.set)?WuriRedlight.set(false):(localStorage.removeItem('wuri_sky_redlight_v1'),document.body.classList.remove('sky-red'))")
    s.ev("document.documentElement.setAttribute('data-theme','day')")

    # ---- 道藏全集 KR5a0268（同一部《悟真篇》全藏本）：保持不显示 ----
    s.ev("window.__wuri_dzOpenWork('KR5a0268')")
    ok(s.waitfor("window._jingCurrentId==='KR5a0268' && !document.getElementById('jing-reader').hidden", 60), "S5 KR5a0268 开卷")
    ok(s.waitfor("document.querySelectorAll('#jing-content .jing-para, #jing-content p').length>0", 30), "S5b KR 正文已渲染")
    st2 = s.ev("(function(){var n=document.getElementById('jing-srcnote');return {h:n.hidden};})()")
    ok(st2["h"] is True, "S6 KR 全藏本底本框隐藏（不回归）")

    # ---- 常见经文 s28：书头与改前一致（傳本 subtitle 照显、无 note 框） ----
    s.ev("(function(){var b=document.getElementById('jing-back-fab'); if(b) b.click();})()")
    time.sleep(0.6)
    s.ev("(function(){var b=document.getElementById('jing-back-fab'); if(b && !document.getElementById('jing-reader').hidden) b.click();})()")
    ok(s.waitfor("!!document.querySelector('.jing-item[data-jing=\"s28\"]')", 30), "S7 回到经文架")
    ok(s.open_row('.jing-item[data-jing="s28"]', 's28'), "S7b s28 开卷")
    st3 = s.ev("""(function(){var n=document.getElementById('jing-srcnote'),u=document.getElementById('jing-subtitle');
      return {noteHidden:n.hidden, subHidden:u.hidden, subText:u.textContent};})()""")
    ok(st3["subHidden"] is False and "闾山三奶派传本" in st3["subText"], "S8 s28 傳本 subtitle 照显（常见经文书头不变）")
    ok(st3["noteHidden"] is True, "S8b s28 无 note 框（与改前一致）")

    errs = s.ev("window.__errs")
    ok(not errs, "S9 零 JS 错误 " + str(errs)[:200])
finally:
    s.close()
print("== %d PASS / %d FAIL ==" % (len(PASS), len(FAIL)))
sys.exit(1 if FAIL else 0)

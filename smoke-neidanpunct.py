#!/usr/bin/env python3
# 专项冒烟（内丹标点优先批）：精选层新内丹 10 部标点接入——逐部开卷默认标点版、
# 标点开/关切换往返、来源条「机器标点·未经校订」、全藏共用偏好键、
# 标点/原文双模式全文 strip 相等（抽 3 部）、旧 5 部无切换钮回归、非 Pro 付费墙回归。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web-neidanpunct/www")
OUT = os.path.expanduser("~/workspace/wuri-web-neidanpunct/neidanpunct-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:500]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()

NEW = [('s40','悟真篇','KR5a0268'), ('s41','入药镜','KR5i0039'), ('s42','金丹四百字','KR5d0104'),
       ('s22','钟吕传道集','KR5a0266'), ('s43','灵宝毕法','KR5f0025'), ('s44','规中指南','KR5a0244'),
       ('s45','金丹大要','KR5d0090'), ('s46','还源篇','KR5d0114'), ('s47','天仙正理','KR5i0067'),
       ('s48','坐忘论','KR5d0059')]

# ---------- 静态检查 ----------
idx = json.loads(rd("content/daozang/index.json"))
report("S1 feed index punct=75", idx.get("version") == 2 and len(idx.get("punct") or []) == 75,
       (idx.get("version"), len(idx.get("punct") or [])))
files = [f for f in os.listdir(os.path.join(WWW, "content/daozang/texts-punct")) if f.endswith(".json")]
report("S2 texts-punct 75 片齐", len(files) == 75, len(files))
tot = 0
for sid, t, kr in NEW:
    if kr == 'KR5f0025': continue
    d = json.loads(rd("content/daozang/texts-punct/%s.json" % kr))
    assert d["id"] == kr and d["partial"] is False
    tot += d["chars_punctuated"]
report("S3 新标 9 部字数 196082", tot == 196082, tot)
jwjs = rd("js/jingwen.js"); dzjs = rd("js/daozang.js")
report("S4 接线齐（映射10部/共用偏好键/dzFindEntry）",
       all(("'%s'" % s) in jwjs or ('"%s"' % s) in jwjs for s, _, _ in NEW)
       and "JING_PUNCT_SRC" in jwjs and "wuri_dz_punct" in jwjs and "dzFindEntry" in dzjs)

def launch(pro):
    port = base.free_port(); prof = "/tmp/chrome-neidanpunct-%d" % port
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=500,1000", "about:blank"],
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
    c.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 1, "mobile": True})
    init = "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"
    if pro: init += "try{localStorage.setItem('wuri_pro_redeem','1');}catch(e){}"
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(4)
    return proc, c

def ev(c, expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return r["result"].get("value")

def shot(c, name):
    r = c.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

def wait_for(c, expr, secs=25):
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if ev(c, expr): return True
        except Exception: pass
        time.sleep(0.5)
    return False

PROBE = ("(function(){var d=window.JINGWEN && JINGWEN['%s']; var b=document.getElementById('jing-punctbtn');"
         " return {has:!!(d&&d.hasPunct), mode:!!(d&&d.punctMode), btnHidden:b?b.hidden:null,"
         " btnText:b?b.textContent:'', cls:document.getElementById('jing-content').classList.contains('dz-punct'),"
         " note:(document.getElementById('jing-srcnote')||{}).textContent||'',"
         " paras:document.querySelectorAll('#jing-content .jing-para').length,"
         " title:document.getElementById('jing-title').textContent};})()")
STRIPALL = ("(function(){var ps=document.querySelectorAll('#jing-content .jing-para'); var s='';"
            " for(var i=0;i<ps.length;i++) s+=ps[i].textContent;"
            " return s.replace(/[。，、；：？！·…—「」『』（）《》〈〉\\s]/g,'');})()")

# ----- Pro 轮：逐部开卷＋切换往返 -----
proc, c = launch(True)
ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()")
time.sleep(1.5)
report("P0 Pro 基线", ev(c, "!!(window.WuriPro && WuriPro.isPro())") is True)
bad = []
for sid, title, kr in NEW:
    ev(c, "JingWen.openReader('%s')" % sid)
    ok = wait_for(c, "!!(window.JINGWEN && JINGWEN['%s'] && JINGWEN['%s'].hasPunct && JINGWEN['%s'].punctMode)"
                     " && !document.getElementById('jing-reader').hidden"
                     " && document.querySelectorAll('#jing-content .jing-para').length>0" % (sid, sid, sid), 25)
    p = ev(c, PROBE % sid) if ok else None
    good = bool(ok and p and p["has"] and p["mode"] and p["btnHidden"] is False and p["btnText"] == "标点开"
                and p["cls"] and "机器标点" in p["note"] and title in p["title"])
    # 切换到原文
    if good:
        ev(c, "document.getElementById('jing-punctbtn').click()")
        ok2 = wait_for(c, "!!(JINGWEN['%s'] && !JINGWEN['%s'].punctMode)" % (sid, sid), 10)
        p2 = ev(c, PROBE % sid)
        good = bool(ok2 and p2["btnText"] == "标点关" and not p2["cls"] and "机器标点" not in p2["note"])
        # 切回标点版
        ev(c, "document.getElementById('jing-punctbtn').click()")
        ok3 = wait_for(c, "!!(JINGWEN['%s'] && JINGWEN['%s'].punctMode)" % (sid, sid), 10)
        p3 = ev(c, PROBE % sid)
        good = bool(good and ok3 and p3["btnText"] == "标点开" and p3["cls"] and "机器标点" in p3["note"])
    if not good: bad.append((sid, p))
    ev(c, "JingWen.closeReader && JingWen.closeReader()"); time.sleep(0.3)
report("P1 逐部开卷默认标点版＋切换往返（10部）", not bad, bad)

# 数据级保真：sectionsPunct 与 sectionsOrig 两侧同口径 strip 全等（抽 s45/s40/s41）
# 注：不用 DOM 文本比对——呈现层简繁转换会因标点断词改变字形（如「乾陽」连读保乾、
# 断开后乾→干），DOM 文本不等不代表数据不对位（2026-10-26 诊断实证）。
DATASTRIP = ("(function(){var d=JINGWEN['%s']; if(!d||!d.sectionsPunct) return null;"
             " function st(s){return s.replace(/[。，、；：？！·…—「」『』﹝﹞（）《》〈〉“”‘’％\\s]/g,'');}"
             " var a=d.sectionsPunct.map(function(s){return s.paras.map(function(p){return p.t}).join('')}).join('');"
             " var b=d.sectionsOrig.map(function(s){return s.paras.map(function(p){return p.t}).join('')}).join('');"
             " var sa=st(a), sb=st(b); return {eq: sa===sb, la: sa.length, lb: sb.length};})()")
bad2 = []
for sid in ["s45", "s40", "s41"]:
    ev(c, "JingWen.openReader('%s')" % sid)
    wait_for(c, "!!(JINGWEN['%s'] && JINGWEN['%s'].hasPunct) && document.querySelectorAll('#jing-content .jing-para').length>0" % (sid, sid), 25)
    r = ev(c, DATASTRIP % sid)
    if not (r and r["eq"]): bad2.append((sid, r))
    ev(c, "JingWen.closeReader && JingWen.closeReader()"); time.sleep(0.3)
report("P2 数据级 strip 全等 sectionsPunct≡sectionsOrig（s45/s40/s41）", not bad2, bad2)

# 截图两张（412）
for sid, fn in [("s45", "reader-s45-punct-412.png"), ("s40", "reader-s40-punct-412.png")]:
    ev(c, "JingWen.openReader('%s')" % sid)
    wait_for(c, "!!(JINGWEN['%s'] && JINGWEN['%s'].punctMode) && document.querySelectorAll('#jing-content .jing-para').length>0" % (sid, sid), 25)
    time.sleep(0.8)
    shot(c, fn)
    ev(c, "JingWen.closeReader && JingWen.closeReader()"); time.sleep(0.3)
report("P3 截图已存（s45/s40 标点版 412）",
       os.path.exists(os.path.join(OUT, "reader-s45-punct-412.png")) and os.path.exists(os.path.join(OUT, "reader-s40-punct-412.png")))

# 旧 5 部回归：s18 无标点切换钮
ev(c, "JingWen.openReader('s18')")
ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>0", 15)
p = ev(c, PROBE % "s18")
report("P4 旧部 s18 无切换钮且正常开卷", bool(ok and p and p["btnHidden"] is True and not p["has"]), p)
ev(c, "JingWen.closeReader && JingWen.closeReader()")
errs = ev(c, "window.__errs")
report("P5 Pro 轮零 JS 异常", not errs, errs)
proc.terminate()

# ----- 非 Pro 轮：付费墙回归 -----
proc, c = launch(False)
ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()")
time.sleep(1.5)
ev(c, "var tg=document.querySelector('[data-neidan-toggle]'); tg && tg.click()")
time.sleep(0.6)
bad3 = []
for sid in ["s45", "s43"]:
    ev(c, "document.getElementById('paywall').classList.remove('show')")
    ev(c, "document.querySelector('.jing-neidan-body .jing-item[data-jing=\"%s\"]').click()" % sid)
    time.sleep(1.0)
    wall = ev(c, "document.getElementById('paywall').classList.contains('show')")
    ropen = ev(c, "!document.getElementById('jing-reader').hidden")
    if not (wall is True and not ropen): bad3.append((sid, wall, ropen))
    ev(c, "document.getElementById('paywall').classList.remove('show')")
report("N1 非Pro点新内丹弹付费墙且不开卷（s45/s43）", not bad3, bad3)
proc.terminate()

np = sum(1 for _, ok in results if ok)
print("== %d/%d PASS ==" % (np, len(results)))
open(os.path.join(OUT, "smoke-neidanpunct-results.txt"), "w", encoding="utf-8").write(
    "\n".join(("PASS " if ok else "FAIL ") + n for n, ok in results) + "\n== %d/%d ==\n" % (np, len(results)))

#!/usr/bin/env python3
# 专项冒烟（SW v141）：道藏标点版接入——默认标点版、原文/标点切换、排版、
# 拼音字流注音、高亮字序投影往返、无标点部无切换钮、部分标点（度人经）、
# 非 Pro 门控回归（取文前拦截、标点分片不取）。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/punct141-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()

# ---------- 静态检查 ----------
idx = json.loads(rd("content/daozang/index.json"))
report("S1 feed index v2+punct66", idx.get("version") == 2 and len(idx.get("punct") or []) == 66 and idx.get("punctPartial") == {"KR5a0001": 6})
report("S2 texts-punct 66 片齐", len([f for f in os.listdir(os.path.join(WWW, "content/daozang/texts-punct")) if f.endswith(".json")]) == 66)
sw, html, i18n = rd("sw.js"), rd("index.html"), rd("js/i18n.js")
report("S3 四件套 v141", "wuri-v141" in sw and "style.css?v=141" in sw and "style.css?v=141" in html
       and "内部 v141" in html and i18n.count("内部 v141") + i18n.count("內部 v141") >= 2)
dzjs, jwjs = rd("js/daozang.js"), rd("js/jingwen.js")
report("S4 接线齐", "__wuri_dzTogglePunct" in dzjs and "__wuri_dzHlToDisp" in dzjs and "__wuri_dzHlToOrig" in dzjs
       and "jing-punctbtn" in jwjs and "机器标点" in jwjs and "dz-punct" in rd("css/style.css"))

def launch(pro):
    port = base.free_port(); prof = f"/tmp/chrome-punct-{port}"
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

def open_work(c, bu, wid):
    ev(c, "document.querySelector('[data-dz-toggle]').click()")
    time.sleep(0.6)
    if not ev(c, f"!!document.querySelector('[data-dz-work=\"{wid}\"]')"):
        ev(c, f"document.querySelector('[data-dz-bu=\"{bu}\"]').click()")
        time.sleep(0.6)
    ev(c, f"document.querySelector('[data-dz-work=\"{wid}\"]').click()")
    ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>0")
    # 多卷本首卷默认折叠则展开
    ev(c, """(function(){var b=document.querySelector('#jing-content .jing-sec[data-sec="0"] .jing-sec-body');
      if(b&&b.hidden){var h=document.querySelector('#jing-content .jing-sec[data-sec="0"] [data-fold]'); if(h)h.click();}})()""")
    time.sleep(0.8)
    return ok

def back(c):
    ev(c, "document.getElementById('jing-back').click()"); time.sleep(0.8)

# ================= Pro =================
proc, c = launch(True)
try:
    report("P0 Pro 基线", ev(c, "!!(window.WuriPro && WuriPro.isPro())") is True)
    ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()"); time.sleep(1.2)
    report("P1 道德真经开卷", open_work(c, "洞神部", "KR5c0045"))
    r = ev(c, """(function(){
      var b=document.getElementById('jing-punctbtn');
      function baseText(el){ var s='',w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false),n;
        while((n=w.nextNode())){ if(n.parentNode&&n.parentNode.tagName==='RT') continue; s+=n.textContent; } return s; }
      var sec0=document.querySelector('#jing-content .jing-sec[data-sec="0"]');
      var allBase=baseText(sec0);
      var note=document.getElementById('jing-srcnote').textContent;
      var cs=getComputedStyle(document.querySelector('#jing-content .jing-para:not(.dz-verse):not(.dz-cht):not(.dz-dlg)'));
      return {btnHidden:b.hidden, btnText:b.textContent, cls:document.getElementById('jing-content').classList.contains('dz-punct'),
        hasPunct:allBase.indexOf('。')>=0, note:note, lh:parseFloat(cs.lineHeight), fs:parseFloat(cs.fontSize), ti:parseFloat(cs.textIndent)};
    })()""")
    report("P2 默认标点版", r and not r["btnHidden"] and r["btnText"] == "标点开" and r["cls"] and r["hasPunct"], r)
    report("P3 来源条机器标点", r and "机器标点 · 未经校订" in r["note"] and "底本直出" not in r["note"], r and r["note"])
    report("P4 排版(行高1.9/缩进2em)", r and abs(r["lh"] / r["fs"] - 1.9) < 0.06 and abs(r["ti"] - 2 * r["fs"]) < 2, r)
    shot(c, "daode-punct-412.png")

    # 拼音：ruby 基字必为内容字（非标点）、数量足
    r = ev(c, """(function(){
      var rubs=document.querySelectorAll('#jing-content ruby');
      var bad=0, n=0;
      rubs.forEach(function(rb){ n++; var t=rb.childNodes[0]&&rb.childNodes[0].textContent||'';
        if(t.length!==1 || '。，、；：？！·…—「」『』（）《》〈〉'.indexOf(t)>=0) bad++; });
      return {n:n, bad:bad, pyBtn:document.getElementById('jing-pybtn').textContent};
    })()""")
    report("P5 拼音字流对齐", r and r["n"] > 100 and r["bad"] == 0 and r["pyBtn"] == "注音开", r)
    ev(c, "document.getElementById('jing-pybtn').click()"); time.sleep(0.7)
    t1 = ev(c, "document.getElementById('jing-pybtn').textContent")
    ev(c, "document.getElementById('jing-pybtn').click()"); time.sleep(1.2)
    t2 = ev(c, "document.getElementById('jing-pybtn').textContent")
    report("P6 拼音开关往返", t1 == "注音关" and t2 == "注音开", (t1, t2))

    # 高亮往返：标点版选「非常道」→ 存档须为原文坐标 → 原文模式落点一致 → 切回标点版仍一致
    r = ev(c, """(function(){
      function plain(el){ var s='',w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false),n;
        while((n=w.nextNode())){ if(n.parentNode&&n.parentNode.tagName==='RT') continue; s+=n.textContent; } return s; }
      var para=null;
      document.querySelectorAll('#jing-content .jing-para').forEach(function(p){ if(!para && plain(p).indexOf('道可道')>=0) para=p; });
      if(!para) return {err:'no para'};
      var nodes=[], offs=[], acc=0, w=document.createTreeWalker(para, NodeFilter.SHOW_TEXT, null, false), n;
      while((n=w.nextNode())){ if(n.parentNode && n.parentNode.tagName==='RT') continue;
        nodes.push(n); offs.push(acc); acc+=n.textContent.length; }
      var plain=nodes.map(function(x){return x.textContent;}).join('');
      var s=plain.indexOf('非常道'); if(s<0) return {err:'no target', plain:plain.slice(0,40)};
      function locate(g){ for(var i=0;i<nodes.length;i++){ if(g>=offs[i] && g<=offs[i]+nodes[i].textContent.length) return [nodes[i], g-offs[i]]; } return [nodes[nodes.length-1], nodes[nodes.length-1].textContent.length]; }
      var a=locate(s), b=locate(s+3);
      var rg=document.createRange(); rg.setStart(a[0],a[1]); rg.setEnd(b[0],b[1]);
      var sel=getSelection(); sel.removeAllRanges(); sel.addRange(rg);
      return {ok:true, selStr:sel.toString()};
    })()""")
    # 注：Selection.toString() 在 Chromium 含 ruby rt 文本，剥拉丁字母后比对（App 偏移走 TreeWalker 跳 RT，P8 验存档为准）
    import re as _re
    report("P7 选区建立", r and r.get("ok") and _re.sub(r"[A-Za-zÀ-ɏ]", "", r.get("selStr", "")) == "非常道", r)
    time.sleep(1.0)
    ev(c, "document.getElementById('jing-highlight-btn').click()"); time.sleep(0.6)
    ev(c, "document.querySelector('#hl-pop [data-hl-color=\"yellow\"]').click()"); time.sleep(1.0)
    r = ev(c, """(function(){
      var arr=JSON.parse(localStorage.getItem('wuri_jing_highlights')||'[]');
      var h=arr.filter(function(x){return x.sid==='KR5c0045';}).pop();
      return h?{sec:h.sec,para:h.para,start:h.start,end:h.end}:null;
    })()""")
    orig = json.loads(rd("content/daozang/texts/KR5c0045.json"))
    seg = ""
    if r: seg = orig["volumes"][r["sec"]]["paras"][r["para"]][r["start"]:r["end"]]
    report("P8 存档为原文坐标", r is not None and seg == "非常道", (r, seg))
    # 切原文 → 高亮落点文本一致
    ev(c, "document.getElementById('jing-punctbtn').click()"); time.sleep(1.4)
    r = ev(c, """(function(){
      function baseText(el){ var s='',w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false),n;
        while((n=w.nextNode())){ if(n.parentNode&&n.parentNode.tagName==='RT') continue; s+=n.textContent; } return s; }
      var spans=document.querySelectorAll('#jing-content .jing-para[data-sec="0"] .hl');
      var txt=''; spans.forEach(function(s){txt+=baseText(s);});
      var b=document.getElementById('jing-punctbtn');
      var p0=document.querySelector('#jing-content .jing-para');
      return {txt:txt, btn:b.textContent, cls:document.getElementById('jing-content').classList.contains('dz-punct'),
        note:document.getElementById('jing-srcnote').textContent, p0:p0.textContent.slice(0,20)};
    })()""")
    report("P9 原文模式高亮落点", r and r["txt"] == "非常道" and r["btn"] == "标点关" and not r["cls"] and "底本直出" in r["note"], r)
    shot(c, "daode-orig-412.png")
    # 切回标点 → 高亮仍一致、偏好记忆
    ev(c, "document.getElementById('jing-punctbtn').click()"); time.sleep(1.4)
    r = ev(c, """(function(){
      function baseText(el){ var s='',w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false),n;
        while((n=w.nextNode())){ if(n.parentNode&&n.parentNode.tagName==='RT') continue; s+=n.textContent; } return s; }
      var txt=''; document.querySelectorAll('#jing-content .jing-para[data-sec="0"] .hl').forEach(function(s){txt+=baseText(s);});
      return {txt:txt.replace(/[。，、；：？！·…—「」『』（）《》〈〉]/g,''), pref:localStorage.getItem('wuri_dz_punct'),
        btn:document.getElementById('jing-punctbtn').textContent};
    })()""")
    report("P10 切回标点高亮一致+偏好", r and r["txt"] == "非常道" and r["pref"] == "punct" and r["btn"] == "标点开", r)
    # 书签（标点模式下保存不报错）
    ev(c, "document.getElementById('jing-bookmark-fab').click()"); time.sleep(0.6)
    r = ev(c, "(JSON.parse(localStorage.getItem('wuri_jing_bookmarks')||'{}')['KR5c0045']||[]).length")
    report("P11 标点模式存书签", r and r >= 1, r)
    back(c)

    # 黄庭：韵文行排版
    report("P12 黄庭开卷", open_work(c, "洞玄部", "KR5b0015"))
    r = ev(c, """(function(){
      var v=document.querySelector('#jing-content .jing-para.dz-verse');
      if(!v) return null;
      var cs=getComputedStyle(v);
      return {lh:parseFloat(cs.lineHeight), fs:parseFloat(cs.fontSize), ti:cs.textIndent, t:v.textContent};
    })()""")
    report("P13 韵文行(1.8/不缩进)", r and abs(r["lh"] / r["fs"] - 1.8) < 0.06 and r["ti"] == "0px", r)
    shot(c, "huangting-punct-412.png")
    back(c)

    # 度人经：部分标点注记
    report("P14 度人经开卷", open_work(c, "洞真部", "KR5a0001"))
    r = ev(c, """(function(){ return {note:document.getElementById('jing-srcnote').textContent,
      btn:document.getElementById('jing-punctbtn').hidden}; })()""")
    report("P15 部分标点注记", r and "已标 6/61 卷" in r["note"] and r["btn"] is False, r)
    back(c)

    # 无标点版：无切换钮
    report("P16 无标点部开卷", open_work(c, "洞真部", "KR5a0002"))
    r = ev(c, """(function(){ return {btnHidden:document.getElementById('jing-punctbtn').hidden,
      cls:document.getElementById('jing-content').classList.contains('dz-punct'),
      paras:document.querySelectorAll('#jing-content .jing-para').length}; })()""")
    report("P17 无标点无钮", r and r["btnHidden"] is True and not r["cls"] and r["paras"] > 0, r)
    errs = ev(c, "window.__errs")
    report("P18 Pro 零 JS 异常", errs == [], errs)
finally:
    proc.terminate()

# ================= 非 Pro =================
proc, c = launch(False)
try:
    ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()"); time.sleep(1.2)
    ev(c, "document.querySelector('[data-dz-toggle]').click()"); time.sleep(0.6)
    ev(c, "document.querySelector('[data-dz-bu=\"洞神部\"]').click()"); time.sleep(0.6)
    ev(c, "document.querySelector('[data-dz-work=\"KR5c0045\"]').click()"); time.sleep(1.2)
    r = ev(c, """(function(){ return {pw:document.getElementById('paywall').classList.contains('show'),
      readerHidden:document.getElementById('jing-reader').hidden,
      loaded:!!(window.JINGWEN && window.JINGWEN['KR5c0045'])}; })()""")
    report("N1 非Pro弹墙不取文", r and r["pw"] and r["readerHidden"] and not r["loaded"], r)
    errs = ev(c, "window.__errs")
    report("N2 非Pro 零 JS 异常", errs == [], errs)
finally:
    proc.terminate()

fails = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(fails), len(results)))
open(os.path.join(OUT, "smoke-punct-v141-results.txt"), "w").write(
    "\n".join(("PASS " if ok else "FAIL ") + n for n, ok in results) + f"\n==== {len(results)-len(fails)}/{len(results)} PASS ====\n")
sys.exit(1 if fails else 0)

#!/usr/bin/env python3
# 专项冒烟（诗跟随简繁＋分架计数后缀统一批）：
# 一、每日一诗接呈现层 t2s 链：简体模式诗题/作者/正文/点题/诗卡全简体，繁体模式复原；底本不动
# 二、三分架标题计数后缀（.dz-count）computed font-size/weight/color 逐项相等
# 用法：python3 smoke-poemfix.py [版本号]（给版本号才跑四件套静态断言）
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web-poemfix/www")
OUT = os.path.expanduser("~/workspace/wuri-web-poemfix/poemfix-shots")
os.makedirs(OUT, exist_ok=True)
VNUM = sys.argv[1] if len(sys.argv) > 1 else None
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:600]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()

# ---------- 静态检查 ----------
appjs, jwjs = rd("js/app.js"), rd("js/jingwen.js")
report("S1 txPoem 接线（诗卡+诗页）", "function txPoem(s)" in appjs and "window.txPoem = txPoem" in appjs
       and "txPoem(pm.poem.title)" in appjs and "txPoem(pm.poem.text[0]" in appjs
       and "txp(p.title)" in appjs and "txp(p.author)" in appjs and "esc(txp(x))" in appjs
       and "txp(p.gloss)" in appjs)
report("S2 三架计数同挂 dz-count", jwjs.count('class="dz-count"') >= 2 and 'data-dz-total' in rd("js/daozang.js"))
pj = json.loads(rd("content/poems.json"))
p103 = [p for p in pj["poems"] if p["id"] == "p103"][0]
report("S3 底本一字未动（p103 仍繁体）", "覽物華" in p103["text"][0] and "竈" in p103["text"][2])
if VNUM:
    sw, html, i18n = rd("sw.js"), rd("index.html"), rd("js/i18n.js")
    report("S4 四件套 v" + VNUM, ("wuri-v" + VNUM) in sw and ("style.css?v=" + VNUM) in sw
           and ("style.css?v=" + VNUM) in html and ("内部 v" + VNUM) in html
           and i18n.count("内部 v" + VNUM) + i18n.count("內部 v" + VNUM) >= 2)

def launch(pro, extra_init=""):
    port = base.free_port(); prof = "/tmp/chrome-poemfix-%d" % port
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                             "--allow-file-access-from-files",
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
    init += extra_init
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
        time.sleep(0.4)
    return False

proc, c = launch(pro=True)
try:
    lang = ev(c, "window.curLang && curLang()")
    report("B0 默认简体模式", lang == "zh-CN", lang)

    # ---- 黄历页诗卡 ----
    ev(c, "document.querySelector('[data-tab=\"tab-cal\"]').click()")
    time.sleep(1.0)
    ev(c, "document.getElementById('poem-card').scrollIntoView({block:'center'})")
    time.sleep(0.4)
    card = ev(c, """(()=>{const cd=document.getElementById('poem-card');
      const t=new Date(); const l=Solar.fromYmd(t.getFullYear(),t.getMonth()+1,t.getDate()).getLunar();
      const a=window.__wuri_poemPick(t.getFullYear(),t.getMonth()+1,t.getDate(),l);
      return {hidden:cd.hidden, id:a.poem.id,
        title:document.getElementById('poem-card-title').textContent,
        line:document.getElementById('poem-card-line').textContent,
        expTitle:window.t2s(a.poem.title)+' · '+window.t2s(a.poem.author),
        expLine:window.t2s(a.poem.text[0])};})()""")
    report("B1 诗卡题/首句已简体（与 t2s 期望全等）", card and not card["hidden"]
           and card["title"] == card["expTitle"] and card["line"] == card["expLine"], json.dumps(card, ensure_ascii=False))
    shot(c, "poem-card-cn-412.png")

    # ---- 点开诗页（真点击）----
    ev(c, "document.getElementById('poem-card').click()")
    time.sleep(0.6)
    view = ev(c, """(()=>{const t=new Date(); const l=Solar.fromYmd(t.getFullYear(),t.getMonth()+1,t.getDate()).getLunar();
      const a=window.__wuri_poemPick(t.getFullYear(),t.getMonth()+1,t.getDate(),l); const p=a.poem;
      const txt=[...document.querySelectorAll('#poem-v-text p')].map(e=>e.textContent);
      return {id:p.id, title:document.getElementById('poem-v-title').textContent,
        author:document.getElementById('poem-v-author').textContent,
        text:txt, gloss:document.getElementById('poem-v-gloss').textContent,
        date:document.getElementById('poem-date').textContent,
        expTitle:window.t2s(p.title), expAuthor:window.t2s(p.dynasty)+' · '+window.t2s(p.author),
        expText:p.text.map(x=>window.t2s(x)), expGloss:window.t2s(p.gloss),
        bucket:a.bucketName};})()""")
    report("B2 诗页题/作者/正文/点题全简体", view and view["title"] == view["expTitle"]
           and view["author"] == view["expAuthor"] and view["text"] == view["expText"]
           and view["gloss"] == view["expGloss"], json.dumps(view, ensure_ascii=False)[:500])
    if view and view["id"] == "p103":
        joined = "".join(view["text"])
        report("B3 p103 验收字（览/灶/颜/驻 在，覽/竈/顏/駐 无）",
               all(x in joined for x in ["览物华", "丹灶", "童颜", "可驻"])
               and not any(x in joined for x in ["覽", "竈", "顏", "駐"])
               and "清明日宴梅道士房" in view["title"], joined)
    else:
        report("B3 p103 验收字（今日非 p103，跳过逐字断言）", True, view and view["id"])
    shot(c, "poem-view-cn-412.png")

    # ---- 切繁体复原 ----
    ev(c, "window.setLangPref && setLangPref('zh-TW')")
    time.sleep(0.8)
    ev(c, "document.getElementById('poem-back').click()")
    time.sleep(0.4)
    ev(c, "document.getElementById('poem-card').scrollIntoView({block:'center'})")
    time.sleep(0.3)
    ev(c, "document.getElementById('poem-card').click()")
    time.sleep(0.6)
    view_tw = ev(c, """(()=>{const t=new Date(); const l=Solar.fromYmd(t.getFullYear(),t.getMonth()+1,t.getDate()).getLunar();
      const a=window.__wuri_poemPick(t.getFullYear(),t.getMonth()+1,t.getDate(),l); const p=a.poem;
      const txt=[...document.querySelectorAll('#poem-v-text p')].map(e=>e.textContent);
      return {text:txt, raw:p.text, gloss:document.getElementById('poem-v-gloss').textContent, rawGloss:p.gloss,
        title:document.getElementById('poem-v-title').textContent, rawTitle:p.title};})()""")
    report("B4 繁体模式复原（正文/题/点题与底本全等）", view_tw and view_tw["text"] == view_tw["raw"]
           and view_tw["title"] == view_tw["rawTitle"] and view_tw["gloss"] == view_tw["rawGloss"],
           json.dumps(view_tw, ensure_ascii=False)[:400])
    shot(c, "poem-view-tw-412.png")
    ev(c, "window.setLangPref && setLangPref('zh-CN')")
    time.sleep(0.5)

    # ---- 文库三分架计数后缀量测 ----
    ev(c, "document.getElementById('poem-back').click()")
    time.sleep(0.3)
    ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()")
    time.sleep(1.0)
    ok_total = wait_for(c, "(document.querySelector('[data-dz-total]')||{}).textContent", 20)
    meas = ev(c, """(()=>{function m(el){ if(!el) return null; const cs=getComputedStyle(el);
        return {fs:cs.fontSize, fw:cs.fontWeight, color:cs.color, text:el.textContent}; }
      return { common: m(document.querySelector('[data-common-sec] .jing-sec-h .dz-count')),
               neidan: m(document.querySelector('[data-neidan-toggle] .dz-count')),
               daozang: m(document.querySelector('[data-dz-toggle] .dz-count')) };})()""")
    ok3 = meas and all(meas[k] for k in ("common", "neidan", "daozang"))
    same = ok3 and len({(meas[k]["fs"], meas[k]["fw"], meas[k]["color"]) for k in meas}) == 1
    report("B5 三架计数后缀 computed 三项逐项相等", bool(ok_total and same), json.dumps(meas, ensure_ascii=False))
    gaps = ev(c, """(()=>{function gap(hsel, csel){ const h=document.querySelector(hsel), s=document.querySelector(csel);
        if(!h||!s) return null; let tn=null;
        for(const n of h.childNodes){ if(n.nodeType===3 && n.textContent.trim()){ tn=n; break; } }
        if(!tn) return null; const r=document.createRange(); r.setStart(tn,0); r.setEnd(tn,tn.length);
        const tr=r.getBoundingClientRect(); return Math.round(s.getBoundingClientRect().left - tr.right); }
      return { common: gap('[data-common-sec] .jing-sec-h', '[data-common-sec] .dz-count'),
               neidan: gap('[data-neidan-toggle]', '[data-neidan-toggle] .dz-count'),
               daozang: gap('[data-dz-toggle]', '[data-dz-toggle] .dz-count') };})()""")
    report("B5b 三架计数紧贴标题（间隙≤14px）", gaps and all(v is not None and -2 <= v <= 14 for v in gaps.values()),
           json.dumps(gaps, ensure_ascii=False))
    with open(os.path.join(OUT, "shelf-measure.json"), "w", encoding="utf-8") as f:
        json.dump(meas, f, ensure_ascii=False, indent=1)
    ev(c, "document.querySelector('[data-common-sec]').scrollIntoView({block:'start'})")
    time.sleep(0.4)
    shot(c, "shelves-412.png")

    errs = ev(c, "window.__errs || []")
    report("B6 零 JS 异常", not errs, errs)
finally:
    try: proc.terminate()
    except Exception: pass

npass = sum(1 for _, ok in results if ok)
with open(os.path.join(OUT, "smoke-poemfix-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write("TOTAL %d/%d\n" % (npass, len(results)))
print("TOTAL %d/%d" % (npass, len(results)))

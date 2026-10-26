#!/usr/bin/env python3
# 专项冒烟（SW v137）：每日一诗全量批——诗卡渲染/三日轮换/同日稳定/节日映射/全诗页真点击。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/poem137-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
idx, sw, i18n = rd("index.html"), rd("sw.js"), rd("js/i18n.js")
appjs, feedjs = rd("js/app.js"), rd("js/content-feed.js")
report("A1 四件套 v137", "wuri-v137" in sw and "style.css?v=137" in idx and "style.css?v=137" in sw
       and i18n.count("v137") == 2 and "内部 v137" in idx)
report("A2 诗数据接线", "'./js/poems-data.js'," in sw and 'src="js/poems-data.js"' in idx
       and "applyPoems" in feedjs and "'poems'" in feedjs and i18n.count("d_poem:") == 2
       and i18n.count("me_credit_poems:") == 2 and "poemPickFor" in appjs and 'id="view-poem"' in idx
       and 'id="poem-card"' in idx)
pj = json.loads(rd("content/poems.json"))
from collections import Counter
bc = Counter(p["bucket"] for p in pj["poems"])
report("A3 feed 158 首分桶", pj["count"] == 158 and len(pj["poems"]) == 158
       and bc == {"star": 54, "xiudao": 46, "gongguan": 35, "jingguan": 23}, str(bc))
fc = Counter(f for p in pj["poems"] for f in p["fest"])
report("A4 节日池", fc == {"qixi": 9, "zhongqiu": 7, "yuanxiao": 4, "chongyang": 3, "zhongyuan": 2}, str(fc))

port = base.free_port(); prof = f"/tmp/chrome-poem137-{port}"
env = dict(os.environ); env["TZ"] = "America/Toronto"
proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                         "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                         "--user-data-dir=" + prof, "--window-size=500,900", "about:blank"],
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
c.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"})
c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
time.sleep(3.5)
def ev(expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return r["result"].get("value")
def shot(name):
    r = c.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

ev("document.querySelector('[data-tab=\"tab-cal\"]').click()")
time.sleep(1.0)
ev("document.getElementById('poem-card').scrollIntoView({block:'center'})")
time.sleep(0.4)
card = ev("""(()=>{const c=document.getElementById('poem-card');
  return {hidden:c.hidden, title:document.getElementById('poem-card-title').textContent,
          line:document.getElementById('poem-card-line').textContent,
          fest:document.getElementById('poem-card-fest').textContent,
          topmost:(()=>{const r=c.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+10);
            return e===c||c.contains(e);})()};})()""")
report("B1 诗卡渲染+最上层", card and not card["hidden"] and "·" in card["title"] and len(card["line"]) > 4 and card["topmost"], json.dumps(card, ensure_ascii=False))
stab = ev("""(()=>{const t=new Date();const l=Solar.fromYmd(t.getFullYear(),t.getMonth()+1,t.getDate()).getLunar();
  const a=window.__wuri_poemPick(t.getFullYear(),t.getMonth()+1,t.getDate(),l);
  const b=window.__wuri_poemPick(t.getFullYear(),t.getMonth()+1,t.getDate(),l);
  return {same:a.poem.id===b.poem.id, id:a.poem.id, fest:a.fest};})()""")
report("B2 同日稳定复现", stab and stab["same"], json.dumps(stab, ensure_ascii=False))
shot("poem-card-412.png")
ev("document.getElementById('poem-card').click()")
time.sleep(0.6)
view1 = ev("""(()=>{const v=document.getElementById('view-poem');
  const t=document.getElementById('poem-v-title');
  const r=t.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return {hidden:v.hidden, title:t.textContent,
    author:document.getElementById('poem-v-author').textContent,
    paras:document.querySelectorAll('#poem-v-text p').length,
    gloss:document.getElementById('poem-v-gloss').textContent,
    date:document.getElementById('poem-date').textContent,
    topmost: e===t||v.contains(e)};})()""")
report("B3 全诗页真点击打开+点题注", view1 and not view1["hidden"] and view1["paras"] >= 2
       and len(view1["gloss"]) > 10 and view1["topmost"] and "年" in view1["date"], json.dumps(view1, ensure_ascii=False))
shot("poem-view-day0-412.png")
seq = [view1["title"]]
for i in (1, 2):
    ev("document.getElementById('poem-next').click()"); time.sleep(0.3)
    seq.append(ev("document.getElementById('poem-v-title').textContent"))
report("B4 连开三日三首不同", len(set(seq)) == 3, " | ".join(seq))
ev("document.getElementById('poem-prev').click()"); time.sleep(0.3)
ev("document.getElementById('poem-prev').click()"); time.sleep(0.3)
back = ev("document.getElementById('poem-v-title').textContent")
report("B5 前翻回到原首", back == seq[0], back)
fest = ev("""(()=>{function find(y0,y1,m,d){for(let y=y0;y<=y1;y++)for(let mo=1;mo<=12;mo++)for(let da=1;da<=31;da++){
    const l=Solar.fromYmd(y,mo,da).getLunar(); if(l.getMonth()===m&&l.getDay()===d) return {y,mo,da,l};} return null;}
  const zq=find(2026,2026,8,15), qx=find(2026,2026,7,7);
  const a=window.__wuri_poemPick(zq.y,zq.mo,zq.da,zq.l), b=window.__wuri_poemPick(qx.y,qx.mo,qx.da,qx.l);
  return {zqDate:zq.y+'-'+zq.mo+'-'+zq.da, zqFest:a.fest, zqPoemFest:a.poem.fest, zqTitle:a.poem.title,
          qxFest:b.fest, qxTitle:b.poem.title};})()""")
report("B6 节日映射命中(中秋/七夕)", fest and fest["zqFest"] == "zhongqiu" and "zhongqiu" in (fest["zqPoemFest"] or [])
       and fest["qxFest"] == "qixi", json.dumps(fest, ensure_ascii=False))
errs = ev("window.__errs||[]")
report("B7 零 JS 异常", errs == [], json.dumps(errs, ensure_ascii=False))
proc.terminate()
fails = [n for n, ok in results if not ok]
with open(os.path.join(OUT, "smoke-poem137-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write("TOTAL %d/%d\n" % (len(results) - len(fails), len(results)))
print("TOTAL %d/%d" % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)

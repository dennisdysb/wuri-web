#!/usr/bin/env python3
# 专项冒烟（内部 v239）：提醒页每日一经——卡片重排（去读经避开右下悬浮置顶钮）＋
# 按日期轮换池（主池常见经文 296 单位＋副池道藏全集正选 540 单位＝836，同日同经）
# ＋点卡直达阅读器卷/章/段锚点（副池 KR 单位含整卷锚与卷内段锚两形态）。
# 日期注入法：addScriptToEvaluateOnNewDocument 覆写 Date，把「今天」钉在指定日期，
# 与 python 侧独立换算的期望单位对账（池文件＋epoch 天数取模）。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
from datetime import date

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-rel-dailyjing/www")
OUT = os.path.expanduser("~/workspace/wuri-rel-dailyjing/dailyjing-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:600]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()

# ---------- S0 静态：四件套 v236 + 池文件 ----------
idx, sw, i18n = rd("index.html"), rd("sw.js"), rd("js/i18n.js")
report("S0a 四件套 v239", "wuri-v239-20261027-v239" in sw and "css/style.css?v=239" in idx
       and "'./css/style.css?v=239'" in sw and i18n.count("内部 v239") + i18n.count("內部 v239") == 4
       and "内部 v239" in idx and "v239" in i18n.split("me_ver")[1][:60])
report("S0b SW 预缓存含 daily-jing.js", "'./js/daily-jing.js'," in sw)
report("S0c index 含 daily-jing.js 脚本与新卡结构", 'src="js/daily-jing.js"' in idx
       and 'id="jingrec-unit"' in idx and 'id="jingrec-gloss"' in idx and 'class="jingrec-foot"' in idx)

pool_txt = rd("js/daily-jing.js")
POOL = json.loads(pool_txt[pool_txt.index("= ") + 2:].rstrip().rstrip(";"))
report("S0d 池 836 单位无重复", len(POOL) == 836 and len(set((u["s"], u["n"], u.get("p", 0)) for u in POOL)) == 836,
       len(POOL))
report("S0e 池构成 主池296＋副池540", sum(1 for u in POOL if u["s"].startswith("s")) == 296
       and sum(1 for u in POOL if u["s"].startswith("KR")) == 540
       and sum(1 for u in POOL if u.get("p")) == 46)
def expected(y, m, d):
    dn = (date(y, m, d) - date(1970, 1, 1)).days
    return POOL[dn % len(POOL)], dn

FAKE_DATE = """
(function(){ var FIXED = new Date('%sT12:00:00').getTime();
  var RD = Date;
  function FD(){ if(arguments.length){ var a=[].slice.call(arguments); return new (Function.prototype.bind.apply(RD,[null].concat(a)))(); }
    return new RD(FIXED); }
  FD.now = function(){ return FIXED; };
  FD.parse = RD.parse; FD.UTC = RD.UTC; FD.prototype = RD.prototype;
  window.Date = FD; })();
"""

CARD_JS = """(()=>{ const q=s=>document.querySelector(s);
  const u = window.__dailyJingUnitForDay ? (()=>{ const dn = Math.floor(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())/86400000); return window.__dailyJingUnitForDay(dn); })() : null;
  return { title:(q('#jingrec-title')||{}).textContent, unit:(q('#jingrec-unit')||{}).textContent,
    gloss:(q('#jingrec-gloss')||{}).textContent, reason:(q('#jingrec-reason')||{}).textContent,
    probe: u, theme: document.documentElement.getAttribute('data-theme'),
    skyRed: document.body.classList.contains('sky-red'),
    goBg: (()=>{ const b=q('#jingrec-go'); return b?getComputedStyle(b).backgroundColor:null; })(),
    errs: window.__errs||[] }; })()"""


PRO_STUB = """(function(){ var iv = setInterval(function(){
  if (window.WuriPro && WuriPro.isPro) { WuriPro.isPro = function(){ return true; };
    WuriPro.requirePro = function(){ return true; }; clearInterval(iv); } }, 100);
  setTimeout(function(){ clearInterval(iv); }, 9000); })();"""

def session(tag, fake_date=None, seed=None):
    port = base.free_port(); prof = f"/tmp/chrome-dailyjing-{tag}-{port}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                             "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required",
                             "--remote-debugging-port=%d" % port,
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
    if fake_date:
        c.call("Page.addScriptToEvaluateOnNewDocument", {"source": FAKE_DATE % fake_date})
    if seed:
        c.call("Page.addScriptToEvaluateOnNewDocument", {"source": seed})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(3.5)
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    def shot(name):
        r = c.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
    def goto_remind():
        ev("document.querySelector('[data-tab=\"tab-remind\"]').click()")
        time.sleep(1.2)
    return proc, c, ev, shot, goto_remind

def check_card(tag, ev, exp_unit, exp_reason="每日一经"):
    card = ev(CARD_JS)
    report(f"{tag} 卡经名与池单位一致", card["title"] == exp_unit["t"], f'{card["title"]} vs {exp_unit["t"]}')
    report(f"{tag} 探针单位与 python 换算一致", card["probe"] == exp_unit,
           f'probe={card["probe"]} exp={exp_unit}')
    exp_unit_line = ev(f"window.txPoem({json.dumps(exp_unit['h'] or '全文', ensure_ascii=False)})") + \
        (f" · 约{exp_unit['m']}分钟" if exp_unit["m"] else "")
    report(f"{tag} 卷章行（题＋约分钟）", card["unit"] == exp_unit_line, f'{card["unit"]} vs {exp_unit_line}')
    exp_gloss = ev(f"window.txPoem({json.dumps(exp_unit['g'], ensure_ascii=False)})")
    report(f"{tag} 题解行", card["gloss"] == exp_gloss, f'{card["gloss"]} vs {exp_gloss}')
    report(f"{tag} reason", card["reason"] == exp_reason, card["reason"])
    return card

# ---------- 日期一：2026-11-05 ----------
u1, dn1 = expected(2026, 11, 5)
proc, c, ev, shot, goto_remind = session("d1", fake_date="2026-11-05")
goto_remind()
check_card("D1(11-05)", ev, u1)
ev("document.querySelector('#jingrec-card').scrollIntoView({block:'center'})"); time.sleep(0.6)
shot("card-20261105-day.png")
report("D1 无 JS 异常", not ev("window.__errs||[]"), ev("window.__errs||[]"))
proc.terminate()

# ---------- 日期二：2026-11-06（必须不同单位） ----------
u2, dn2 = expected(2026, 11, 6)
report("D2 两日期望单位不同", (u1["s"], u1["n"], u1.get("p", 0)) != (u2["s"], u2["n"], u2.get("p", 0)), f'{u1} vs {u2}')
proc, c, ev, shot, goto_remind = session("d2", fake_date="2026-11-06")
goto_remind()
check_card("D2(11-06)", ev, u2)
proc.terminate()

# ---------- 今天（真实日期 2026-10-27 Toronto）：重合与直达 ----------
import datetime
tor = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4)))  # EDT
u0, dn0 = expected(tor.year, tor.month, tor.day)
proc, c, ev, shot, goto_remind = session("today", seed=PRO_STUB)
goto_remind()
card = check_card("T0(今天)", ev, u0)
# 滚到底，让卡进入 FAB 悬浮区高度范围
ev("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(0.8)
GEO = ev("""(()=>{ const q=s=>document.querySelector(s);
  const go=q('#jingrec-go'), fab=q('#tab-remind .to-top');
  const R=e=>{ const r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,cx:r.left+r.width/2,cy:r.top+r.height/2}; };
  const gr=R(go), fr=R(fab);
  const hit=document.elementFromPoint(gr.cx, gr.cy);
  return { go:gr, fab:fr, hitGo: !!(hit && (hit===go || go.contains(hit))),
    overlap: !(gr.r<=fr.l || fr.r<=gr.l || gr.b<=fr.t || fr.b<=gr.t) }; })()""")
report("T1 去读经与悬浮置顶钮零重合", GEO and not GEO["overlap"], GEO)
report("T2 elementFromPoint(去读经中心)=按钮本身", GEO and GEO["hitGo"], GEO)
shot("card-today-bottom.png")
# 真实坐标点击去读经 → 阅读器直达锚点
c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": GEO["go"]["cx"], "y": GEO["go"]["cy"], "button": "left", "clickCount": 1})
c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": GEO["go"]["cx"], "y": GEO["go"]["cy"], "button": "left", "clickCount": 1})
time.sleep(3.5)
LAND = ev(f"""(()=>{{ const sec=document.querySelector('#jing-content .jing-sec[data-sec="{u0['n']}"]');
  const body=sec?sec.querySelector('.jing-sec-body'):null;
  const r=sec?sec.getBoundingClientRect():null;
  return {{ sid: window._jingCurrentId, readerHidden: document.querySelector('#jing-reader').hidden,
    secFound: !!sec, bodyHidden: body?body.hidden:null,
    secTop: r?Math.round(r.top):null, H: innerHeight,
    title: (document.querySelector('#jing-title')||{{}}).textContent }}; }})()""")
report("T3 点击直达正确经文", LAND and LAND["sid"] == u0["s"] and LAND["readerHidden"] is False, LAND)
report("T4 目标节已展开且滚到节首入视口", LAND and LAND["secFound"] and LAND["bodyHidden"] is False
       and LAND["secTop"] is not None and -90 <= LAND["secTop"] < LAND["H"] * 0.6, LAND)
shot("reader-anchor.png")
proc.terminate()


# ---------- 副池段锚日：2028-02-01（KR5i0024 其二，n=0 卷内段锚 p>0；该日无神诞直配，已按 app 神诞表核过） ----------
u3, dn3 = expected(2028, 2, 1)
report("K0 期望单位为副池段锚单位", u3["s"].startswith("KR") and u3.get("p", 0) > 0, u3)
proc, c, ev, shot, goto_remind = session("kr2", fake_date="2028-02-01", seed=PRO_STUB)
goto_remind()
check_card("K1(02-01)", ev, u3)
ev("document.querySelector('#jingrec-card').scrollIntoView({block:'center'})"); time.sleep(0.6)
r = ev("(()=>{ const r=document.querySelector('#jingrec-go').getBoundingClientRect(); return {cx:r.left+r.width/2, cy:r.top+r.height/2}; })()")
c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": r["cx"], "y": r["cy"], "button": "left", "clickCount": 1})
c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": r["cx"], "y": r["cy"], "button": "left", "clickCount": 1})
time.sleep(4)
LAND3 = ev(f"""(()=>{{ const sec=document.querySelector('#jing-content .jing-sec[data-sec="{u3['n']}"]');
  const body=sec?sec.querySelector('.jing-sec-body'):null;
  const STRIP=/[\\s。，、；：？！·…—「」『』﹝﹞（）《》〈〉“”‘’％\\/().,;:?!%]/g;
  let acc=0, tp=null;
  if(body){{ for(const p of body.querySelectorAll('p.jing-para')){{ const cl=p.cloneNode(true);
    cl.querySelectorAll('rt,rp').forEach(x=>x.remove()); acc += cl.textContent.replace(STRIP,'').length;
    if(acc > {u3.get('p', 0)}){{ tp=p; break; }} }} }}
  const tr=tp?tp.getBoundingClientRect():null;
  const firstP=body?body.querySelector('p.jing-para'):null;
  const fr=firstP?firstP.getBoundingClientRect():null;
  return {{ sid: window._jingCurrentId, bodyHidden: body?body.hidden:null,
    tpTop: tr?Math.round(tr.top):null, firstTop: fr?Math.round(fr.top):null, H: innerHeight }}; }})()""")
report("K2 段锚直达正确经文且正文展开", LAND3 and LAND3["sid"] == u3["s"] and LAND3["bodyHidden"] is False, LAND3)
report("K3 目标段（内容字偏移处）已滚入视口且非首段", LAND3 and LAND3["tpTop"] is not None
       and -120 <= LAND3["tpTop"] < LAND3["H"] * 0.7 and LAND3["firstTop"] is not None and LAND3["firstTop"] < 0, LAND3)
shot("reader-kr-para-anchor.png")
proc.terminate()

# ---------- 夜态 ----------
proc, c, ev, shot, goto_remind = session("night", seed="try{localStorage.setItem('wuri_cfg_v1', JSON.stringify({theme:'night'}));}catch(e){}")
goto_remind()
ncard = ev(CARD_JS)
report("N1 夜态卡面正常渲染", ncard["theme"] == "night" and ncard["title"] == u0["t"], ncard)
shot("card-night.png")
proc.terminate()

# ---------- 红光态 ----------
proc, c, ev, shot, goto_remind = session("red", seed="try{localStorage.setItem('wuri_sky_redlight_v1','1');}catch(e){}")
goto_remind()
rcard = ev(CARD_JS)
report("R1 红光 body.sky-red 已挂且卡面渲染", rcard["skyRed"] and rcard["title"] == u0["t"], rcard)
report("R2 红光下按钮底色被红光变量链接管（非日间黛青）", rcard["goBg"] != "rgb(60, 106, 92)", rcard["goBg"])
shot("card-redlight.png")
proc.terminate()

fails = [n for n, ok in results if not ok]
print(f"\n==== {len(results) - len(fails)}/{len(results)} PASS" + (f" FAILS: {fails}" if fails else ""))
sys.exit(1 if fails else 0)

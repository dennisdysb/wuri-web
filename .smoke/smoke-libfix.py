#!/usr/bin/env python3
# 专项冒烟：编辑器构件库二批九项（内部 v209）
import importlib.util, json, os, re, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web-libfix/www")
OUT = os.path.expanduser("~/workspace/wuri-web-libfix/.smoke/shots"); os.makedirs(OUT, exist_ok=True)
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]), flush=True)

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
idx, sw, i18n = rd("index.html"), rd("sw.js"), rd("js/i18n.js")
he, css, jw = rd("js/house-editor.js"), rd("css/style.css"), rd("js/jingwen.js")

report("T1 四件套 v209", "wuri-v209-20261027-v230" in sw and "css/style.css?v=208" in idx
       and "'./css/style.css?v=208'" in sw and i18n.count("（内部 v209）") == 2 and i18n.count("（內部 v209）") == 2
       and "（内部 v209）" in idx)
fix_keys = re.findall(r"^    (\w+):\s+\{ cat:", he, re.M)
report("T2 构件总数 43", len(fix_keys) == 43, fix_keys)
NEW = ["dresser","sideboard","piano","treadmill","ofdesk","kidbed","bunk","ddoor","baldoor","baywin",
       "sink","dishwash","fridge2","bathcab","safe","cooler","plant","mirror"]
report("T3 新件 18 全在且 i18n 简繁齐", all(k in fix_keys for k in NEW)
       and all(i18n.count("hpe_fix_%s:" % k) == 2 for k in NEW))
report("T4 新件砂水签口径", all(x in he for x in [
    "plant:      { cat: 'feng', sw: null", "mirror:     { cat: 'feng', sw: null",
    "dishwash:   { cat: 'kitchen', sw: 'shui'", "cooler:     { cat: 'feng', sw: 'shui'",
    "piano:      { cat: 'furn', sw: 'sha'", "ddoor:      { cat: 'doorwin', sw: 'shui'"]))
report("T5 描图改名：i18n 无描图/描圖残留", "描图" not in i18n and "描圖" not in i18n
       and i18n.count("照片建房") >= 12, i18n.count("照片建房"))
report("T6 空层口径源码：blankPlan overlay none＋hasContent gate＋lijiLock",
       "overlay: 'none'" in he and "hasContent()) s += renderOverlay" in he
       and "if (hasContent()) s += renderLiji" in he and "lijiLock = true" in he
       and "contentExtent()" in he and "hpe_liji_auto" in he)
report("T7 ✕ 钮 SVG 化四处", idx.count('viewBox="0 0 12 12"') >= 3 and 'viewBox="0 0 12 12"' in jw
       and ".hpe-sheet-x { margin-left:auto; flex:none; width:30px; height:30px; display:flex" in css
       and ".sx-pop-x{" in css and "display:flex" in css.split(".sx-pop-x{")[1].split("}")[0])
report("T8 罗盘连续盘源码", "hpe-rose-base" in he and "hpe-rose-div" in he
       and ".hpe-rose-sec { fill:none; stroke:none; }" in css and "#hpe-panel .hpe-tile2 { touch-action:pan-y; }" in css)
report("T9 库 tap-only 源码", "libDown" in he and "libTap" in he
       and "pnl.addEventListener('pointerdown', libDown)" in he
       and "pnl.addEventListener('pointerdown', trayDown)" not in he)

port = base.free_port(); prof = f"/tmp/chrome-libfix-{port}"
proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
    "--allow-file-access-from-files", f"--remote-debugging-port={port}",
    f"--user-data-dir={prof}", "--window-size=412,915", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ws = None
for _ in range(40):
    try:
        tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=3))
        pages = [t for t in tabs if t["type"] == "page"]
        if pages: ws = pages[0]["webSocketDebuggerUrl"]; break
    except Exception: pass
    time.sleep(0.5)
assert ws, "chrome CDP 未就绪"
cdp = base.CDP(base.ws_connect(ws))
cdp.call("Page.enable"); cdp.call("Runtime.enable")
cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})

def ev(expr):
    last = None
    for _ in range(4):
        try: return cdp.evaluate(expr)
        except Exception as e: last = e; time.sleep(1)
    raise last
for _ in range(120):
    try:
        if ev("document.readyState") == "complete" and ev("!!window.__wuriHouse"): break
    except Exception: pass
    time.sleep(0.5)
time.sleep(1.5)

def shot(name):
    r = cdp.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
def mouse(x, y, kind="mousePressed", btn="left", clicks=1):
    cdp.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": btn, "clickCount": clicks})
def tap(x, y):
    mouse(x, y); time.sleep(0.15); mouse(x, y, "mouseReleased"); time.sleep(0.1)
def touch_scroll(x, y0, y1, steps=8):
    cdp.call("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y0, "id": 1}]})
    for i in range(1, steps + 1):
        cdp.call("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y0 + (y1 - y0) * i / steps, "id": 1}]})
        time.sleep(0.03)
    cdp.call("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    time.sleep(0.4)

setup = ev("""(async()=>{ const H=window.__wuriHouse; if(!H||!H.db) return 'no-house';
  const db=H.db;
  const hid=await db.houses.add({name:'冒烟宅',created:Date.now()});
  const fid=await db.floors.add({houseId:hid,name:'一层',sort:0});
  await db.measurements.add({houseId:hid,ts:Date.now(),deg:268.8,facingDeg:270,sitting:'卯',facing:'酉',fixed:true,point:'door'});
  window.__wuriPlan.open(hid,fid);
  return {hid,fid}; })()""")
time.sleep(1.5)
st = ev("""(()=>{ const svg=document.getElementById('hpe-svg');
  return { viewHidden: document.getElementById('view-plan').hidden,
    liji: svg.querySelectorAll('[data-act="liji"]').length,
    rose: svg.querySelectorAll('.hpe-rose-base').length,
    gridCells: svg.querySelectorAll('.hpe-pal').length,
    startCards: document.querySelectorAll('[data-start]').length }; })()""")
report("D1 空层：无立极、无罗盘、无九宫格，起始面弹出", st and not st["viewHidden"] and st["liji"] == 0
       and st["rose"] == 0 and st["startCards"] == 4, st)
shot("01-empty-day.png")

r = ev("""(()=>{ const c=document.querySelector('[data-start="split"]'); if(!c) return null;
  const b=c.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2}; })()""")
tap(r["x"], r["y"]); time.sleep(0.6)
r = ev("""(()=>{ const b=document.getElementById('hpe-fr-go'); if(!b) return null;
  const g=b.getBoundingClientRect(); return {x:g.left+g.width/2,y:g.top+g.height/2}; })()""")
tap(r["x"], r["y"]); time.sleep(0.8)
st = ev("""(async()=>{ const plans=await window.__wuriHouse.db.plans.toArray(); const p=plans[plans.length-1];
  const svg=document.getElementById('hpe-svg');
  const lj=svg.querySelector('[data-act="liji"] circle');
  return { rooms:p.rooms.length, liji:p.liji, lock:p.lijiLock, overlay:p.layers.overlay,
    lijiDom: !!lj, cx: lj?+lj.getAttribute('cx'):null, cy: lj?+lj.getAttribute('cy'):null,
    rose: svg.querySelectorAll('.hpe-rose-base').length }; })()""")
report("D2 定外框后立极出现且居中(0,0)、自动未锁、叠盘默认关", st and st["rooms"] == 1 and st["lijiDom"]
       and abs(st["cx"]) < 0.01 and abs(st["cy"]) < 0.01 and st["lock"] == False and st["overlay"] == "none"
       and st["rose"] == 0, st)

def tray_boxes():
    return ev("""(()=>{ const q=s=>{ const e=document.querySelector(s); if(!e) return null;
      const b=e.getBoundingClientRect(); return {t:Math.round(b.top*10)/10,b:Math.round(b.bottom*10)/10,h:Math.round(b.height*10)/10}; };
      return { lib:q('#hpe-libbtn'), tpl:q('[data-tile="tpl"]'), trace:q('[data-tile="trace"]'),
        ov:q('[data-tile="ovcycle"]'), mode:q('#hpe-modebtn') }; })()""")
tb = tray_boxes()
vals = [tb[k] for k in ("lib","tpl","trace","ov","mode") if tb[k]]
report("D3 托盘五钮同高同基线(412)", len(vals) == 5 and max(v["b"] for v in vals) - min(v["b"] for v in vals) <= 1.5
       and max(v["h"] for v in vals) - min(v["h"] for v in vals) <= 1.5, tb)
shot("02-tray-412.png")

def ov_state():
    return ev("""(()=>{ const t=document.querySelector('[data-tile="ovcycle"]'); if(!t) return null;
      const pill=t.querySelector('.hpe-ovpill');
      return { name:t.querySelector('.n').textContent.trim(), pill: pill?pill.textContent.trim():null,
        noOverflow: t.scrollWidth<=t.clientWidth+1 }; })()""")
def tap_ov():
    r = ev("""(()=>{ const t=document.querySelector('[data-tile="ovcycle"]'); const b=t.getBoundingClientRect();
      return {x:b.left+b.width/2,y:b.top+b.height/2}; })()""")
    tap(r["x"], r["y"]); time.sleep(0.5)
seq = []
for i in range(5):
    seq.append(ov_state()); tap_ov()
pills = [s["pill"] for s in seq if s]
report("D4 叠盘钮名恒为「叠盘」、pill 四态轮转不溢出", all(s["name"] == "叠盘" for s in seq if s)
       and all(s["noOverflow"] for s in seq if s) and set(pills) >= {"罗盘","飞星","八宅扇","关"}, seq)
for _ in range(5):
    cur = ov_state()
    if cur and cur["pill"] == "罗盘": break
    tap_ov()
st = ev("""(()=>{ const svg=document.getElementById('hpe-svg');
  return { base: svg.querySelectorAll('.hpe-rose-base').length,
    sec: svg.querySelectorAll('.hpe-rose-sec').length,
    div: svg.querySelectorAll('.hpe-rose-div').length,
    secStroke: svg.querySelector('.hpe-rose-sec')?getComputedStyle(svg.querySelector('.hpe-rose-sec')).stroke:null }; })()""")
report("D5 罗盘整盘：1 整圆底+8 扇区+8 径向细线、扇区无描边", st and st["base"] == 1 and st["sec"] == 8
       and st["div"] == 8 and st["secStroke"] in ("none", "rgba(0, 0, 0, 0)"), st)
shot("03-compass-day.png")
ev("(()=>{document.body.classList.add('sky-red');return 1})()"); time.sleep(0.3); shot("04-compass-red.png")
ev("(()=>{document.body.classList.remove('sky-red'); document.documentElement.setAttribute('data-theme','night'); return 1})()"); time.sleep(0.3)
shot("05-compass-night.png")
ev("(()=>{document.documentElement.removeAttribute('data-theme'); return 1})()")

r = ev("""(()=>{ const b=document.getElementById('hpe-libbtn').getBoundingClientRect();
  return {x:b.left+b.width/2,y:b.top+b.height/2}; })()""")
tap(r["x"], r["y"]); time.sleep(0.7)
def x_center(sel_btn):
    return ev("""(()=>{ const b=document.querySelector('%s'); if(!b) return null;
      const s=b.querySelector('svg'); if(!s) return {nosvg:true};
      const bb=b.getBoundingClientRect(), sb=s.getBoundingClientRect();
      return {dx:Math.abs((bb.left+bb.width/2)-(sb.left+sb.width/2)), dy:Math.abs((bb.top+bb.height/2)-(sb.top+sb.height/2))}; })()""" % sel_btn)
xc = x_center("#hpe-sheet-x")
report("D6 编辑器面板 ✕ 同心(偏差≤1px)", xc and not xc.get("nosvg") and xc["dx"] <= 1 and xc["dy"] <= 1, xc)
shot("06-lib-open.png")

pre = ev("""(()=>{ const body=document.querySelector('.hpe-sheet-body');
  const t=document.querySelector('#hpe-panel [data-tile="fix"][data-key="piano"]');
  t.scrollIntoView({block:'end'}); const b=t.getBoundingClientRect();
  return {st:body.scrollTop, x:b.left+b.width/2, y:b.top+b.height/2}; })()""")
touch_scroll(pre["x"], pre["y"], pre["y"] - 300)
post = ev("""(()=>{ const body=document.querySelector('.hpe-sheet-body');
  return { st:body.scrollTop, ghost:document.querySelectorAll('.hpe-ghost').length,
    armed: !document.getElementById('hpe-armed').hidden,
    armedTile: document.querySelectorAll('#hpe-panel .hpe-tile2.armed').length }; })()""")
report("D7 库内纵滚300px：滚动发生、无拖影、无选中待放", post and post["st"] > pre["st"] + 100
       and post["ghost"] == 0 and post["armedTile"] == 0 and not post["armed"], {"pre": pre, "post": post})

r = ev("""(()=>{ const t=document.querySelector('#hpe-panel [data-tile="fix"][data-key="piano"]');
  t.scrollIntoView({block:'center'}); const b=t.getBoundingClientRect();
  return {x:b.left+b.width/2,y:b.top+b.height/2}; })()""")
time.sleep(0.3); tap(r["x"], r["y"]); time.sleep(0.6)
st = ev("""(()=>{ const bar=document.getElementById('hpe-armed');
  return { armed: !bar.hidden, txt: bar.textContent }; })()""")
report("D8 干净点按钢琴 → 待放条出现且指名钢琴", st and st["armed"] and "钢琴" in st["txt"], st)
r = ev("""(()=>{ const s=document.getElementById('hpe-svg').getBoundingClientRect();
  return {x:s.left+s.width*0.3,y:s.top+s.height*0.32}; })()""")
tap(r["x"], r["y"]); time.sleep(0.7)
st = ev("""(async()=>{ const plans=await window.__wuriHouse.db.plans.toArray(); const p=plans[plans.length-1];
  return { fixes:(p.fixtures||[]).map(f=>f.type) }; })()""")
report("D9 点画布落件：钢琴入档", st and "piano" in st["fixes"], st)

lj = ev("""(()=>{ const g=document.querySelector('[data-act="liji"]'); if(!g) return null;
  const b=g.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2}; })()""")
mouse(lj["x"], lj["y"]); time.sleep(0.1)
for i in range(1, 6):
    mouse(lj["x"] + 14 * i, lj["y"] + 8 * i, "mouseMoved"); time.sleep(0.05)
mouse(lj["x"] + 70, lj["y"] + 40, "mouseReleased"); time.sleep(0.7)
st = ev("""(async()=>{ const plans=await window.__wuriHouse.db.plans.toArray(); const p=plans[plans.length-1];
  return { liji:p.liji, lock:p.lijiLock }; })()""")
locked_pos = st["liji"]
report("D10 手拖立极后锁定", st and st["lock"] == True and (abs(st["liji"]["x"]) > 0.5 or abs(st["liji"]["y"]) > 0.5), st)
ev("""(async()=>{ const db=window.__wuriHouse.db; const plans=await db.plans.toArray(); const p=plans[plans.length-1];
  p.rooms[0].w=p.rooms[0].w*1.6; await db.plans.put(p);
  window.__wuriPlan.open(p.houseId,p.floorId); return 1; })()""")
time.sleep(1.2)
st = ev("""(async()=>{ const plans=await window.__wuriHouse.db.plans.toArray(); const p=plans[plans.length-1];
  return { liji:p.liji, lock:p.lijiLock }; })()""")
report("D11 锁定后改轮廓：立极不跟随", st and st["lock"] == True
       and abs(st["liji"]["x"] - locked_pos["x"]) < 0.01 and abs(st["liji"]["y"] - locked_pos["y"]) < 0.01, st)
ev("""(()=>{ const g=document.querySelector('[data-act="liji"]');
  g.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); return 1; })()""")
time.sleep(0.7)
st = ev("""(async()=>{ const plans=await window.__wuriHouse.db.plans.toArray(); const p=plans[plans.length-1];
  const r0=p.rooms[0]; return { liji:p.liji, lock:p.lijiLock,
    cx:r0.x+r0.w/2, cy:r0.y+r0.h/2 }; })()""")
report("D12 双击复位：回自动且等于新轮廓中心", st and st["lock"] == False
       and abs(st["liji"]["x"] - st["cx"]) < 0.01 and abs(st["liji"]["y"] - st["cy"]) < 0.01, st)

xc2 = ev("""(()=>{ const out={};
  const meas=(btn)=>{ const s=btn.querySelector('svg'); if(!s) return {nosvg:true};
    const bb=btn.getBoundingClientRect(), sb=s.getBoundingClientRect();
    return {dx:Math.abs((bb.left+bb.width/2)-(sb.left+sb.width/2)), dy:Math.abs((bb.top+bb.height/2)-(sb.top+sb.height/2))}; };
  const pop=document.getElementById('sx-pop'); const x2=document.getElementById('sx-pop-x');
  if(pop&&x2){ const h=pop.hidden; pop.hidden=false; out.sx=meas(x2); pop.hidden=h; }
  const qc=document.getElementById('jing-q-clear');
  if(qc){ const h=qc.hidden; qc.hidden=false; out.qc=meas(qc); qc.hidden=h; }
  return out; })()""")
report("D13 星象浮层 ✕ 与经文清除 ✕ 同心", xc2 and xc2.get("sx", {}).get("dx", 9) <= 1 and xc2.get("sx", {}).get("dy", 9) <= 1
       and xc2.get("qc", {}).get("dx", 9) <= 1 and xc2.get("qc", {}).get("dy", 9) <= 1, xc2)

cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
time.sleep(0.6)
tb2 = tray_boxes(); vals2 = [tb2[k] for k in ("lib","tpl","trace","ov","mode") if tb2[k]]
ov2 = ov_state()
report("D14 390 宽托盘同高 + 叠盘不溢出", len(vals2) == 5
       and max(v["b"] for v in vals2) - min(v["b"] for v in vals2) <= 1.5
       and ov2 and ov2["noOverflow"] and ov2["name"] == "叠盘", {"tb": tb2, "ov": ov2})
shot("07-tray-390.png")

fails = [n for n, ok in R if not ok]
print(f"\n===== {len(R)-len(fails)}/{len(R)} PASS" + (f"  FAIL: {fails}" if fails else ""), flush=True)
try: proc.terminate()
except Exception: pass

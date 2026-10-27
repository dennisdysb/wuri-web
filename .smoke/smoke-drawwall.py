#!/usr/bin/env python3
# 专项冒烟：户型编辑器「画墙」（起始面第五选项/托盘入口/一划成段/端点吸附/
# 围合自动成房+命名胶囊/构件库墙类三件/删墙/撤销/斜墙与 45° 吸附/红光三态/390 宽）
import importlib.util, json, os, re, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web-drawwall/www")
OUT = os.path.expanduser("~/workspace/wuri-web-drawwall/.smoke/shots"); os.makedirs(OUT, exist_ok=True)
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:500]), flush=True)

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
idx, sw, i18n = rd("index.html"), rd("sw.js"), rd("js/i18n.js")
he, css = rd("js/house-editor.js"), rd("css/style.css")

fix_keys = re.findall(r"^    (\w+):\s+\{ cat:", he, re.M)
report("S1 墙件三件入 FIX（cat=wall/wallSeg/sw=null）、总数 46、FIX_CATS 墙第一",
       all(k in fix_keys for k in ("wall1", "wallL", "wallT")) and len(fix_keys) == 46
       and "var FIX_CATS = ['wall', 'doorwin'" in he
       and "wall1:      { cat: 'wall', sw: null" in he and "wallSeg: 1" in he, fix_keys[-4:])
report("S2 i18n 画墙词条简繁齐", all(i18n.count(k) == 2 for k in
       ("hpe_cat_wall:", "hpe_fix_wall1:", "hpe_fix_wallL:", "hpe_fix_wallT:",
        "hpe_start_wall:", "hpe_wall_hint:", "hpe_wall_room_toast:")))
report("S3 数据模型：blankPlan walls＋normalize 兜底＋撤销/清空/范围含墙",
       "walls: []" in he and "(p.walls || []).forEach" in he
       and "E.plan.walls = []" in he and "tryCloseRoom" in he and "finalizeWallStroke" in he)
EV = os.environ.get("EXPECT_V")
if EV:
    report("S4 四件套 v%s" % EV, ("wuri-v%s-" % EV) in sw and ("css/style.css?v=%s" % EV) in idx
           and ("'./css/style.css?v=%s'" % EV) in sw
           and i18n.count("（内部 v%s）" % EV) == 2 and i18n.count("（內部 v%s）" % EV) == 2)

port = base.free_port(); prof = f"/tmp/chrome-drawwall-{port}"
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
def tap_el(sel):
    r = ev("""(()=>{ const e=document.querySelector(%s); if(!e) return null;
      const b=e.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2}; })()""" % json.dumps(sel))
    assert r, "元素不存在: " + sel
    tap(r["x"], r["y"]); time.sleep(0.5)
    return r
def p2c(x, y):
    return ev("""(()=>{ const svg=document.getElementById('hpe-svg');
      const pt=svg.createSVGPoint(); pt.x=%r; pt.y=%r;
      const p=pt.matrixTransform(svg.getScreenCTM()); return {x:p.x,y:p.y}; })()""" % (x, y))
def stroke(x1, y1, x2, y2, steps=7):
    # 在计划坐标里插值、逐事件实时换算客户区坐标：编辑器逐事件用 live CTM 换算，
    # 且 viewBox 高会随画布长宽比反馈微调——按客户区坐标预插值会中途飘位（实测 +0.4 单位）
    a = p2c(x1, y1)
    mouse(a["x"], a["y"]); time.sleep(0.12)
    for i in range(1, steps + 1):
        c = p2c(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps)
        mouse(c["x"], c["y"], "mouseMoved")
        time.sleep(0.04)
    b = p2c(x2, y2)
    mouse(b["x"], b["y"], "mouseReleased"); time.sleep(0.6)
def plan_now():
    return ev("""(async()=>{ const ps=await window.__wuriHouse.db.plans.toArray(); const p=ps[ps.length-1];
      return { walls:(p.walls||[]).map(w=>({x1:w.x1,y1:w.y1,x2:w.x2,y2:w.y2})),
        rooms:(p.rooms||[]).map(r=>({name:r.name,type:r.type,x:r.x,y:r.y,w:r.w,h:r.h})) }; })()""")

setup = ev("""(async()=>{ const H=window.__wuriHouse; if(!H||!H.db) return 'no-house';
  const db=H.db;
  const hid=await db.houses.add({name:'冒烟宅',created:Date.now()});
  const fid=await db.floors.add({houseId:hid,name:'一层',sort:0});
  await db.measurements.add({houseId:hid,ts:Date.now(),deg:268.8,facingDeg:270,sitting:'卯',facing:'酉',fixed:true,point:'door'});
  window.__wuriPlan.open(hid,fid);
  return {hid,fid}; })()""")
time.sleep(1.5)

st = ev("""(()=>{ const cards=[...document.querySelectorAll('[data-start]')].map(e=>e.getAttribute('data-start'));
  const sheetT=document.getElementById('hpe-sheet-title');
  return { cards, title: sheetT?sheetT.textContent:'' }; })()""")
report("D1 起始面五选项、画墙居首", st and st["cards"] == ["wall", "split", "tpl", "trace", "free"], st)
shot("01-start.png")

tap_el('[data-start="wall"]')
st = ev("""(()=>{ const attr=document.getElementById('hpe-attr');
  const tile=document.querySelector('[data-tile="wall"]');
  return { sheetHidden: document.getElementById('hpe-sheet').hidden,
    guide: attr?attr.textContent:'', hot: tile?tile.classList.contains('hot'):false }; })()""")
report("D2 点画墙卡：进画墙态、指引条常驻、托盘画墙钮高亮",
       st and st["sheetHidden"] and "划一笔" in st["guide"] and st["hot"], st)
shot("02-wallmode.png")

stroke(-5.5, 2.4, -2.5, 2.56)  # 近横线：终点略偏下 0.16，应被吸附拉直为水平
p = plan_now()
w = p["walls"][0] if p and p["walls"] else None
report("D3 真划一笔出直线墙（近横自动拉直、长≈3m）", p and len(p["walls"]) == 1 and w
       and abs(w["y2"] - w["y1"]) < 0.001 and abs(abs(w["x2"] - w["x1"]) - 3) < 0.15, p)

tap_el('#hpe-libbtn')
st = ev("""(()=>{ const cats=[...document.querySelectorAll('.hpe-libcat')].map(e=>e.textContent.trim());
  return { cats, wallTiles: document.querySelectorAll('[data-tile="fix"][data-key^="wall"]').length }; })()""")
report("D4 构件库第一分类是「墙」、墙件三只", st and st["cats"] and st["cats"][0] == "墙" and st["wallTiles"] == 3, st)
tap_el('#hpe-panel [data-tile="fix"][data-key="wall1"]')
st = ev("""(()=>{ const bar=document.getElementById('hpe-armed');
  return { armed: !bar.hidden, txt: bar.textContent }; })()""")
report("D5 点选直墙段 → 待放条指名", st and st["armed"] and "直墙段" in st["txt"], st)
c = p2c(-2, -3); tap(c["x"], c["y"]); time.sleep(0.8)
p = plan_now()
nw = p["walls"][-1] if p and p["walls"] else None
report("D6 点图落墙件：成 plan.walls 段（水平 2m、非 fixture）", p and len(p["walls"]) == 2 and nw
       and abs(nw["y2"] - nw["y1"]) < 0.001 and abs(abs(nw["x2"] - nw["x1"]) - 2) < 0.05, p)
ev("(()=>{document.getElementById('hpe-armed').click();return 1})()"); time.sleep(0.3)

# 围三笔成房：已放直墙段作顶边（-3,-3)→(-1,-3)，再划左/底/右三笔闭合
stroke(-3, -3, -3, 1)
stroke(-3, 1, -1, 1)
stroke(-1, 1, -1, -3)
time.sleep(0.5)
p = plan_now()
st = ev("""(()=>{ const caps=document.querySelectorAll('#hpe-attr .hpe-ncap').length;
  const t=document.querySelector('#hpe-attr .t b');
  return { caps, title: t?t.textContent:'' }; })()""")
report("D7 围三笔闭合自动成房：环墙退场（剩散墙 1）、房间 2×4m、命名胶囊弹出",
       p and len(p["rooms"]) == 1 and len(p["walls"]) == 1 and st and st["caps"] >= 10
       and abs(p["rooms"][0]["w"] - 2) < 0.05 and abs(p["rooms"][0]["h"] - 4) < 0.05, {"plan": p, "attr": st})
shot("03-closed-room.png")
tap_el('#hpe-attr .hpe-ncap[data-ncap="living"]')
time.sleep(0.6)
p = plan_now()
report("D8 点命名胶囊成房名「客厅」", p and p["rooms"] and p["rooms"][0]["name"] == "客厅"
       and p["rooms"][0]["type"] == "living", p)

c = p2c(-4, 2.4); tap(c["x"], c["y"]); time.sleep(0.5)
st = ev("""(()=>{ const b=document.querySelector('#hpe-attr .hpe-attr.thin b');
  return { thin: b?b.textContent:'' }; })()""")
report("D9 点选散墙：属性条出「墙段」", st and st["thin"] == "墙段", st)
tap_el('#hpe-w-del')
time.sleep(0.6)
p = plan_now()
report("D10 删墙", p and len(p["walls"]) == 0, p)
ev("(()=>{document.getElementById('hpe-undo').click();return 1})()"); time.sleep(0.7)
p = plan_now()
report("D11 撤销恢复墙", p and len(p["walls"]) == 1, p)

tap_el('#hpe-libbtn'); tap_el('#hpe-panel [data-tile="fix"][data-key="wallL"]')
c = p2c(-5, -1.5); tap(c["x"], c["y"]); time.sleep(0.7)
p = plan_now()
lsegs = p["walls"][-2:] if p else []
share = len(lsegs) == 2 and any(abs(lsegs[0][a] - lsegs[1][b]) < 0.001 and abs(lsegs[0][c] - lsegs[1][d]) < 0.001
                      for a, b, c, d in (("x1", "x1", "y1", "y1"), ("x1", "x2", "y1", "y2"),
                                         ("x2", "x1", "y2", "y1"), ("x2", "x2", "y2", "y2")))
report("D12 L 角墙落位：两段共角", p and len(p["walls"]) == 3 and share, p)
ev("(()=>{document.getElementById('hpe-armed').click();return 1})()"); time.sleep(0.3)
tap_el('#hpe-libbtn'); tap_el('#hpe-panel [data-tile="fix"][data-key="wallT"]')
c = p2c(-4.5, 1.6); tap(c["x"], c["y"]); time.sleep(0.7)
p = plan_now()
tsegs = p["walls"][-2:] if p else []
tj = tsegs and abs(tsegs[1]["x1"] - (tsegs[0]["x1"] + tsegs[0]["x2"]) / 2) < 0.05 and abs(tsegs[1]["y1"] - tsegs[0]["y1"]) < 0.001
report("D13 T 接墙落位：两段、分支起于主段中点", p and len(p["walls"]) == 5 and tj, p)
ev("(()=>{document.getElementById('hpe-armed').click();return 1})()"); time.sleep(0.3)

stroke(-5.7, -2.7, -3.05, -1.3)   # ≈27.8°：离 0/45 都超容差，应原样保留斜墙
p = plan_now()
dw = p["walls"][-1] if p else None
ang = None
if dw:
    import math
    ang = abs(math.degrees(math.atan2(dw["y2"] - dw["y1"], dw["x2"] - dw["x1"])))
report("D14 斜墙保留（非横竖非 45°）", dw and ang is not None and 15 < ang < 40, {"w": dw, "ang": ang})
stroke(-5.6, 0.9, -3.7, 2.4)      # ≈38°：在 45° 容差内，应吸成正 45°
p = plan_now()
sw2 = p["walls"][-1] if p else None
report("D15 近 45° 吸附成正斜（|dx|≈|dy|）", sw2
       and abs(abs(sw2["x2"] - sw2["x1"]) - abs(sw2["y2"] - sw2["y1"])) < 0.06, sw2)

# 自由态拖端点改长：退出画墙态 → 点选 45° 墙 → 拖其终点沿线拉长
tap_el('[data-tile="wall"]')
c = p2c(-4.75, 1.75); tap(c["x"], c["y"]); time.sleep(0.5)
st = ev("""(()=>{ const b=document.querySelector('#hpe-attr .hpe-attr.thin b');
  return { thin: b?b.textContent:'', hdls: document.querySelectorAll('[data-act="wallh"]').length }; })()""")
report("D16a 自由态点选墙出端点手柄", st and st["thin"] == "墙段" and st["hdls"] == 2, st)
a = p2c(-3.89, 2.61)
mouse(a["x"], a["y"]); time.sleep(0.12)
for i in range(1, 6):
    cc = p2c(-3.89 + i / 5, 2.61)
    mouse(cc["x"], cc["y"], "mouseMoved"); time.sleep(0.04)
b = p2c(-2.89, 2.61)
mouse(b["x"], b["y"], "mouseReleased"); time.sleep(0.7)
p = plan_now()
import math
cand = [w for w in (p["walls"] if p else []) if abs(w["x1"] + 5.6) < 0.05 and abs(w["y1"] - 0.9) < 0.05]
wl = cand[0] if cand else None
wlen = math.hypot(wl["x2"] - wl["x1"], wl["y2"] - wl["y1"]) if wl else 0
report("D16b 拖端点改长：2.42→≈3.2m 且保持 45°", wl and abs(wlen - 3.2) < 0.06
       and abs(abs(wl["x2"] - wl["x1"]) - abs(wl["y2"] - wl["y1"])) < 0.06, {"w": wl, "len": wlen})

ev("(()=>{document.body.classList.add('sky-red');return 1})()"); time.sleep(0.3)
st = ev("""(()=>{ const wl=document.querySelector('.hpe-wall');
  return { stroke: wl?getComputedStyle(wl).stroke:null }; })()""")
report("D17 红光：墙线计算色 = #f2b8a0", st and st["stroke"] == "rgb(242, 184, 160)", st)
shot("04-red.png")
ev("(()=>{document.body.classList.remove('sky-red'); document.documentElement.setAttribute('data-theme','night'); return 1})()")
time.sleep(0.3); shot("05-night.png")
ev("(()=>{document.documentElement.removeAttribute('data-theme'); return 1})()")

cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
time.sleep(0.6)
st = ev("""(()=>{ const mb=document.getElementById('hpe-modebtn').getBoundingClientRect();
  const wt=document.querySelector('[data-tile="wall"]').getBoundingClientRect();
  return { modeRight: Math.round(mb.right), wallInTray: wt.width > 0 }; })()""")
report("D18 390 宽：模式钮不溢出、画墙 tile 在托盘内", st and st["modeRight"] <= 391 and st["wallInTray"], st)
shot("06-390.png")

fails = [n for n, ok in R if not ok]
print(f"\n===== {len(R)-len(fails)}/{len(R)} PASS" + (f"  FAIL: {fails}" if fails else ""), flush=True)
try: proc.terminate()
except Exception: pass

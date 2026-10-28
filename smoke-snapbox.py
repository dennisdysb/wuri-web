#!/usr/bin/env python3
"""编辑器体验线冒烟（2026-10-27）：框选面板自动收起＋全编辑器统一磁吸。
断言：开框选→面板即收、点完成/删除后不重开；画墙端点近吸（精确同点）/
远不吸/墙线垂足/本笔起点闭合；房间拖动与拉边近吸贴齐、远不吸；构件边
对边吸附；分切刀口吸邻边。CDP 真拖拽＋三态截图，结果落 snapbox-shots/。"""
import base64, importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location(
    "smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "www")
SHOTS = os.path.join(HERE, "snapbox-shots")
os.makedirs(SHOTS, exist_ok=True)
RESULTS = []

def note(name, ok, extra=""):
    RESULTS.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

STUB_JS = r"""
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e.error)); });
"""

SEED_JS = r"""
(async () => {
  const db = __wuriHouse.db;
  const hid = await db.houses.add({ name: '磁吸冒烟宅', address: '', client: '', phone: '', surveyDate: '2026-10-27', note: '', created: Date.now() });
  const fid = await db.floors.add({ houseId: hid, name: '一楼', sort: 0 });
  await db.measurements.add({ houseId: hid, ts: Date.now(), facingDeg: 179.7, facing: '午', sitting: '子',
    point: '', decl: null, gps: null, gpsAcc: null, accDeg: null, fixed: true });
  const plan = { floorId: fid, houseId: hid, uuid: 'smoke-snap-uuid-1', updated: Date.now(), mPerUnit: 1,
    rooms: [ { id: 'r101', x: 0, y: 0, w: 4, h: 3, name: '客厅', type: 'living' },
             { id: 'r102', x: 4, y: 0, w: 3, h: 3, name: '卧室', type: 'master' },
             { id: 'r103', x: 0, y: 3, w: 2.5, h: 2, name: '书房', type: 'study' } ],
    fixtures: [ { id: 'f201', type: 'door', x: 2, y: 0, rot: 0, flip: false },
                { id: 'f202', type: 'tank', x: 1, y: 1.5, rot: 0, flip: false } ],
    walls: [ { id: 'w301', x1: 0, y1: -2, x2: 4, y2: -2 } ],
    trace: null, liji: null, lijiLock: false, calibNote: '',
    layers: { rooms: true, fixtures: true, dims: true, overlay: 'fx', palNames: true, roomNames: true, traceBg: true, ovOpacity: 0.55, compRadius: 0 } };
  await db.plans.add(plan);
  window.__seed = { hid: hid, fid: fid };
  return window.__seed;
})()
"""

def main():
    port = base.free_port()
    prof = "/tmp/hpe-snap-smoke-%d" % port
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen(
        [base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
         "--allow-file-access-from-files",
         "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
         "--window-size=500,1000", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    try:
        wsurl = None
        for _ in range(40):
            try:
                tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
                pg = [t for t in tg if t.get("type") == "page"]
                if pg:
                    wsurl = pg[0]["webSocketDebuggerUrl"]; break
            except Exception:
                pass
            time.sleep(0.5)
        c = base.CDP(base.ws_connect(wsurl))
        c.call("Page.enable"); c.call("Runtime.enable"); c.call("DOM.enable")
        c.call("Emulation.setDeviceMetricsOverride",
               {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
        c.call("Page.addScriptToEvaluateOnNewDocument", {"source": STUB_JS})
        c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
        time.sleep(3.5)

        def ev(expr):
            r = c.call("Runtime.evaluate",
                       {"expression": expr, "returnByValue": True, "awaitPromise": True})
            if r.get("exceptionDetails"):
                raise RuntimeError(str(r["exceptionDetails"])[:400])
            return r["result"].get("value")

        def click_at(sel):
            info = ev("""(() => { const el = document.querySelector(%s);
              if (!el) return null;
              el.scrollIntoView({block:'center'});
              const r = el.getBoundingClientRect();
              const cx = r.left + r.width/2, cy = r.top + r.height/2;
              const top = document.elementFromPoint(cx, cy);
              return {x: cx, y: cy, ok: !!(top && (top === el || el.contains(top)))}; })()""" % json.dumps(sel))
            assert info and info["ok"], "elementFromPoint 断言失败: " + sel
            c.call("Input.dispatchMouseEvent",
                   {"type": "mousePressed", "x": info["x"], "y": info["y"], "button": "left", "clickCount": 1})
            c.call("Input.dispatchMouseEvent",
                   {"type": "mouseReleased", "x": info["x"], "y": info["y"], "button": "left", "clickCount": 1})
            time.sleep(0.45)

        def visible(sel):
            return ev("(() => { const el = document.querySelector(%s);"
                      " if (!el) return false; const r = el.getBoundingClientRect();"
                      " const cs = getComputedStyle(el);"
                      " return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden'"
                      "        && r.width > 0 && r.height > 0; })()" % json.dumps(sel))

        def shot(name):
            r = c.call("Page.captureScreenshot", {"format": "png"})
            open(os.path.join(SHOTS, name), "wb").write(base64.b64decode(r["data"]))
            print("shot:", name)

        def plan_pt(x, y):
            return ev("""(() => { const svg = document.getElementById('hpe-svg');
              const pt = svg.createSVGPoint(); pt.x = %r; pt.y = %r;
              const p = pt.matrixTransform(svg.getScreenCTM());
              return {x: p.x, y: p.y}; })()""" % (x, y))

        LAST = {"x": 0, "y": 0}
        def mouse(x, y, kind):
            LAST["x"], LAST["y"] = x, y
            c.call("Input.dispatchMouseEvent",
                   {"type": kind, "x": x, "y": y, "button": "left" if kind != "mouseMoved" else "none",
                    "buttons": 1 if kind in ("mousePressed", "mouseMoved") else 0})

        def press_plan(x, y):
            a = plan_pt(x, y); mouse(a["x"], a["y"], "mousePressed"); time.sleep(0.12)

        def move_plan(x, y, steps=4):
            a = plan_pt(x, y)
            sx, sy = LAST["x"], LAST["y"]
            for i in range(1, steps + 1):
                mouse(sx + (a["x"] - sx) * i / steps, sy + (a["y"] - sy) * i / steps, "mouseMoved")
                time.sleep(0.03)
            time.sleep(0.15)

        def release():
            mouse(LAST["x"], LAST["y"], "mouseReleased"); time.sleep(0.5)

        def drag_plan(x0, y0, x1, y1, steps=8):
            press_plan(x0, y0); move_plan(x1, y1, steps); release()

        def dbplan():
            return ev("__wuriHouse.db.plans.get(__seed.fid)")

        def room(rid):
            p = dbplan()
            for r in p["rooms"]:
                if r["id"] == rid: return r
            return None

        def snap_rad():
            return ev("""(() => { const svg = document.getElementById('hpe-svg');
              const vb = svg.getAttribute('viewBox').split(/\\s+/).map(Number);
              const rc = svg.getBoundingClientRect();
              return 16 * vb[2] / rc.width; })()""")

        def has(sel):
            return ev("!!document.querySelector(%s)" % json.dumps(sel))

        def wallprev():
            return ev("""(() => { const el = document.querySelector('#hpe-svg .hpe-wallprev');
              if (!el) return null;
              return { x1: +el.getAttribute('x1'), y1: +el.getAttribute('y1'),
                       x2: +el.getAttribute('x2'), y2: +el.getAttribute('y2') }; })()""")

        for _ in range(30):
            if ev("!!(window.__wuriHouse && window.__wuriPlan)"):
                break
            time.sleep(0.5)
        note("模块就位（house/plan）", ev("!!(window.__wuriHouse && window.__wuriPlan)") is True)

        seed = ev(SEED_JS)
        note("种子入库（3 房＋门/缸＋1 墙）", bool(seed and seed.get("hid")), seed)

        ev("__wuriHouse.openDetail(__seed.hid)")
        time.sleep(0.8)
        click_at("#hd-plan-edit")
        time.sleep(1.0)
        note("编辑器打开", visible("#view-plan"))
        nrooms = ev("document.querySelectorAll('#hpe-svg [data-act=\"room\"]').length")
        note("编辑器里 3 间房", nrooms == 3, nrooms)
        RAD = snap_rad()
        note("实测磁吸半径（计划单位）", 0.15 < RAD < 0.8, RAD)

        # ---------- 第一幕：框选开启 → 面板自动收起 ----------
        click_at('[data-tile="select"]')
        time.sleep(0.5)
        note("选择面板打开", visible("#hpe-selbox"))
        click_at("#hpe-boxmode")
        time.sleep(0.5)
        sheet_hidden = ev("document.getElementById('hpe-sheet').hidden")
        note("开框选瞬间面板自动收起", sheet_hidden is True, sheet_hidden)
        note("框选细条在位（完成键）", has("#hpe-b-x"))
        shot("t1-boxbar-after-autoclose-day.png")
        drag_plan(-0.5, -0.5, 3.9, 2.9)
        attr = ev("document.getElementById('hpe-attr').textContent")
        note("框选计数＝3（客厅＋门＋缸）", "3" in attr, attr[:60])
        click_at("#hpe-b-x")
        time.sleep(0.4)
        note("点完成退出框选后面板不重开", ev("document.getElementById('hpe-sheet').hidden") is True)
        note("框选细条已撤", not has("#hpe-b-x"))

        # ---------- 第二幕：房间拖动 近吸/远不吸 ----------
        drag_plan(5.5, 1.5, 6.7, 1.5)              # 卧室先挪开 +1.2
        r = room("r102")
        note("卧室挪开到 x≈5.2", r and abs(r["x"] - 5.2) < 0.06, r and r["x"])
        press_plan(6.7, 1.5)                        # 近吸：左缘停在距 x=4 边 RAD*0.7 处
        move_plan(6.7 - 1.2 + RAD * 0.7, 1.5)
        note("拖动中引导线出现（吸上了）", has("#hpe-svg .hpe-snapline"))
        ev("document.documentElement.setAttribute('data-theme','night')")
        time.sleep(0.3)
        shot("t2-room-snap-night.png")
        ev("document.documentElement.setAttribute('data-theme','day')")
        release()
        r = room("r102")
        note("近吸：卧室左缘精确贴齐 x=4", r and r["x"] == 4, r and r["x"])
        press_plan(5.5, 1.5)                        # 远不吸：左缘停在距 4 边 RAD*2.2+0.35
        move_plan(5.5 + RAD * 2.2 + 0.35, 1.5)
        # y 轴本就与邻房顶边齐平、横引导线会照常亮——断言只针对 x 轴（竖线不该有）
        note("远距拖动中无竖直引导线（x 轴未吸）",
             ev("![...document.querySelectorAll('#hpe-svg .hpe-snapline')]"
                ".some(l => l.getAttribute('x1') === l.getAttribute('x2'))"))
        release()
        r = room("r102")
        note("远不吸：卧室落在网格位（≠4）", r and r["x"] != 4 and abs(r["x"] - 5.1) < 0.06, r and r["x"])

        # 拉边（西柄）近吸：x1 停在距 4 边 RAD*0.7 → 精确贴 4
        press_plan(r["x"], 1.5)
        move_plan(r["x"] - (r["x"] - 4) + RAD * 0.7, 1.5)
        note("拉边中引导线出现", has("#hpe-svg .hpe-snapline"))
        release()
        r = room("r102")
        note("拉边近吸：卧室左缘精确贴齐 x=4", r and r["x"] == 4, r and r["x"])

        # ---------- 第三幕：构件（鱼缸，非贴墙件）边对边吸附 ----------
        press_plan(1, 1.5)                          # 近吸：左缘停在距 x=0 边 RAD*0.7
        move_plan(1 - 0.4 + RAD * 0.7, 1.5)
        note("构件拖动中引导线出现", has("#hpe-svg .hpe-snapline"))
        release()
        p = dbplan()
        tank = [f for f in p["fixtures"] if f["id"] == "f202"][0]
        note("近吸：鱼缸左缘贴齐 x=0（中心 x=0.6）", abs(tank["x"] - 0.6) < 1e-9, tank["x"])
        press_plan(0.6, 1.5)                        # 远不吸：右移 0.83
        move_plan(0.6 + 0.83, 1.5)
        note("构件远距无引导线", not has("#hpe-svg .hpe-snapline"))
        release()
        p = dbplan()
        tank = [f for f in p["fixtures"] if f["id"] == "f202"][0]
        note("远不吸：鱼缸停在原始落点 x≈1.43", abs(tank["x"] - 1.43) < 0.02, tank["x"])

        # ---------- 第四幕：分切刀口吸邻边 ----------
        click_at("#hpe-modebtn")
        time.sleep(0.5)
        drag_plan(3.5, 2.5, 3.55, 2.5, steps=2)     # 分切态选中客厅（小拖代点选）
        note("分切态属性条出竖切键", has("#hpe-a-cutv"))
        click_at("#hpe-a-cutv")
        time.sleep(0.5)
        note("刀口已武装（切线在图）", has("#hpe-svg .hpe-cutline"))
        press_plan(2, 0.4)                          # 远不吸：刀口停在距 x=2.5 邻边 RAD*2.2
        move_plan(2.5 - RAD * 2.2, 0.4)
        cl = ev("""(() => { const el = document.querySelector('#hpe-svg .hpe-cutline');
          return el ? +el.getAttribute('x1') : null; })()""")
        note("刀口远距不吸（≠2.5）", cl is not None and abs(cl - 2.5) > RAD, cl)
        move_plan(2.5 - RAD * 0.7, 0.4)             # 近吸：精确落 2.5
        cl = ev("""(() => { const el = document.querySelector('#hpe-svg .hpe-cutline');
          return el ? +el.getAttribute('x1') : null; })()""")
        note("刀口近吸：精确对齐邻边 x=2.5", cl == 2.5, cl)
        note("刀口吸住时引导线在位", has("#hpe-svg .hpe-snapline"))
        release()
        click_at("#hpe-cut-cancel")
        time.sleep(0.4)
        note("取消落刀：客厅未被切", room("r101")["w"] == 4)
        click_at("#hpe-modebtn")                    # 退出分切态
        time.sleep(0.4)

        # ---------- 第五幕：画墙四吸 ----------
        click_at('[data-tile="wall"]')
        time.sleep(0.5)
        # (a) 起点近吸已有墙端点 (4,-2)
        press_plan(4 + RAD * 0.55, -2 + RAD * 0.55)
        move_plan(4.3, -3.4)
        wp = wallprev()
        note("画墙起点近吸端点 (4,-2)", wp and wp["x1"] == 4 and wp["y1"] == -2, wp)
        note("命中亮点在位", has("#hpe-svg .hpe-snapdot"))
        shot("t3-wall-snap-day.png")
        release()
        p = dbplan()
        nw = [w for w in p["walls"] if w["x1"] == 4 and w["y1"] == -2 and w["id"] != "w301"]
        note("落墙起点与旧墙端点精确同点", len(nw) == 1, len(p["walls"]))
        # (b) 远不吸：起点距端点 RAD*3.4、距墙线 RAD*2.4（落墙后已自动退画墙态，重入）
        click_at('[data-tile="wall"]')
        time.sleep(0.5)
        sx = 4 + RAD * 2.4
        press_plan(sx, -2 + RAD * 2.4)
        move_plan(sx + 1.5, -2 + RAD * 2.4)
        wp = wallprev()
        exp = round(sx * 10) / 10
        note("远距无亮点", not has("#hpe-svg .hpe-snapdot"))
        note("远不吸：起点落网格位（≠端点）", wp and abs(wp["x1"] - exp) < 1e-9 and wp["x1"] != 4, wp)
        release()
        # (c) 本笔起点闭合：空白处起笔，终点拉回起点 RAD*0.6 内 → 精确同点（先重入画墙态）
        click_at('[data-tile="wall"]')
        time.sleep(0.5)
        press_plan(7.2, 4.2)
        move_plan(7.2 + RAD * 0.6, 4.2 + RAD * 0.3)
        wp = wallprev()
        note("终点吸回本笔起点（精确同点）", wp and wp["x2"] == wp["x1"] and wp["y2"] == wp["y1"], wp)
        note("闭合命中亮点在位", has("#hpe-svg .hpe-snapdot"))
        release()
        p = dbplan()
        note("零长段松手即弃（墙数不增）", len(p["walls"]) == 3, len(p["walls"]))
        # (d) 墙线垂足：终点拉到 w301 线上方 RAD*0.6 → 落线 (2,-2)
        # （(c) 零长段走 finalize 早退、未退画墙态，此处不重入）
        note("仍在画墙态（零长段不退态）", has("#hpe-wall-x"))
        press_plan(1.5, 0.8)
        move_plan(2, -2 + RAD * 0.6)
        wp = wallprev()
        note("终点吸墙线垂足 (2,-2)", wp and wp["x2"] == 2 and wp["y2"] == -2, wp)
        release()
        click_at("#hpe-wall-x") if has("#hpe-wall-x") else None

        # ---------- 第六幕：框选删除后不重开面板 ----------
        click_at('[data-tile="select"]')
        time.sleep(0.5)
        click_at("#hpe-boxmode")
        time.sleep(0.5)
        note("再开框选：面板仍自动收起", ev("document.getElementById('hpe-sheet').hidden") is True)
        drag_plan(0.1, 3.1, 2.4, 5.4)
        attr = ev("document.getElementById('hpe-attr').textContent")
        note("框选计数＝1（书房）", "1" in attr and "已选" in attr, attr[:60])
        click_at("#hpe-b-del")
        time.sleep(0.6)
        note("删除所选后面板不重开", ev("document.getElementById('hpe-sheet').hidden") is True)
        note("书房已删", room("r103") is None)
        click_at("#hpe-b-x")
        time.sleep(0.3)

        # ---------- 三态截图 ----------
        ev("document.body.classList.add('sky-red')")
        time.sleep(0.4)
        red_line = ev("(() => { const el = document.querySelector('#hpe-svg .hpe-wall');"
                      " return el ? getComputedStyle(el).stroke : 'none'; })()")
        note("红光下墙线走变量链色", red_line not in ("none", ""), red_line)
        shot("t4-editor-red.png")
        ev("document.body.classList.remove('sky-red')")
        shot("t5-editor-day.png")

        errs = ev("window.__errs || []")
        note("全程零 JS 异常", len(errs) == 0, errs[:3])
    finally:
        proc.terminate()

    fails = [r for r in RESULTS if not r[1]]
    print("\n==== %d/%d PASS ====" % (len(RESULTS) - len(fails), len(RESULTS)))
    with open(os.path.join(SHOTS, "smoke-snapbox-results.txt"), "w") as f:
        for n, ok, x in RESULTS:
            f.write(("PASS " if ok else "FAIL ") + n + ((" | " + str(x)) if x else "") + "\n")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()

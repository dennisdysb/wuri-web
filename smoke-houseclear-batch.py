#!/usr/bin/env python3
"""家宅线反馈批冒烟（2026-10-27）：清空复活 bug＋「选择」键＋一次性放置＋绘制态叠层收起。
链路：种子数据→编辑器看过户型→退出→详情页真点清空（新文案断言）→再进编辑器
不得复活（本地库）→桩 fetch 跑完整 runSync：旧值重发被删除意图拦下、墓碑照常
推出（同步影子双核）→框选多删＋删房级联无孤儿→放置/画墙一次性→绘制态叠层
收起且不自动恢复→三态截图。结果落 houseclear-shots/。"""
import base64, importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location(
    "smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "www")
SHOTS = os.path.join(HERE, "houseclear-shots")
os.makedirs(SHOTS, exist_ok=True)
RESULTS = []

def note(name, ok, extra=""):
    RESULTS.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

STUB_JS = r"""
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e.error)); });
try {
  localStorage.setItem('wuri_acct_token_v1', 'smoke-token');
  localStorage.setItem('wuri_acct_sync_v1', '1');
  localStorage.setItem('wuri_acct_email_v1', 'smoke@test');
} catch (e) {}
window.__pushes = [];
window.__pullItems = [];
var __of = window.fetch;
window.fetch = function (url, opts) {
  var u = String(url);
  function J(body, status) {
    return Promise.resolve(new Response(JSON.stringify(body),
      { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.indexOf('/api/sync/pull') >= 0) return J({ ok: true, items: window.__pullItems || [] });
  if (u.indexOf('/api/sync/push') >= 0) {
    var body = {};
    try { body = JSON.parse(opts.body); window.__pushes.push(body); } catch (e) {}
    var applied = (body.items || []).map(function (i) { return { dataset: i.dataset, key: i.key }; });
    return J({ ok: true, applied: applied });
  }
  if (u.indexOf('/api/') >= 0) return J({ ok: true, enabled: true });
  return __of.apply(this, arguments);
};
"""

SEED_JS = r"""
(async () => {
  const db = __wuriHouse.db;
  const hid = await db.houses.add({ name: '冒烟宅', address: '', client: '', phone: '', surveyDate: '2026-10-27', note: '', created: Date.now() });
  const fid = await db.floors.add({ houseId: hid, name: '一楼', sort: 0 });
  await db.measurements.add({ houseId: hid, ts: Date.now(), facingDeg: 179.7, facing: '午', sitting: '子',
    point: '', decl: null, gps: null, gpsAcc: null, accDeg: null, fixed: true });
  const plan = { floorId: fid, houseId: hid, uuid: 'smoke-plan-uuid-1', updated: Date.now(), mPerUnit: 1,
    rooms: [ { id: 'r101', x: 0, y: 0, w: 4, h: 3, name: '客厅', type: 'living' },
             { id: 'r102', x: 4, y: 0, w: 3, h: 3, name: '卧室', type: 'master' } ],
    fixtures: [ { id: 'f201', type: 'door', x: 2, y: 0, rot: 0, flip: false },
                { id: 'f202', type: 'tank', x: 2, y: 1.5, rot: 0, flip: false },
                { id: 'f203', type: 'window', x: 5.5, y: 0, rot: 0, flip: false },
                { id: 'f204', type: 'bed', x: 20, y: 20, rot: 0, flip: false } ],
    walls: [ { id: 'w301', x1: 0, y1: -2, x2: 4, y2: -2 } ],
    trace: null, liji: null, lijiLock: false, calibNote: '',
    layers: { rooms: true, fixtures: true, dims: true, overlay: 'fx', palNames: true, roomNames: true, traceBg: true, ovOpacity: 0.55, compRadius: 0 } };
  await db.plans.add(plan);
  window.__seed = { hid: hid, fid: fid };
  const snap = await WuriAccount._snapshot();
  const pu = Object.keys(snap.house['house.plans'] || {})[0];
  window.__seed.planUuid = pu;
  window.__oldPlanJson = snap.house['house.plans'][pu].json;
  const shadow = { ls: {}, house: {}, photo: {} };
  Object.keys(snap.house).forEach(ds => Object.keys(snap.house[ds]).forEach(u => { shadow.house[ds + '|' + u] = snap.house[ds][u].hash; }));
  Object.keys(snap.ls).forEach(k => { shadow.ls[k] = snap.ls[k].hash; });
  localStorage.setItem('wuri_acct_shadow_v1', JSON.stringify(shadow));
  const stamps = {};
  stamps['house.plans|' + pu] = '2026-10-27T00:00:00.000Z';
  localStorage.setItem('wuri_acct_stamps_v1', JSON.stringify(stamps));
  const bp = WuriAccount._computePush(snap);
  window.__seed.baselinePushPlans = bp.items.filter(i => i.dataset === 'house.plans').length;
  return window.__seed;
})()
"""

def main():
    port = base.free_port()
    prof = "/tmp/hpe-clear-smoke-%d" % port
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

        def mouse(x, y, kind):
            c.call("Input.dispatchMouseEvent",
                   {"type": kind, "x": x, "y": y, "button": "left" if kind != "mouseMoved" else "none",
                    "buttons": 1 if kind in ("mousePressed", "mouseMoved") else 0})

        def drag_plan(x0, y0, x1, y1, steps=8):
            a = plan_pt(x0, y0); b = plan_pt(x1, y1)
            mouse(a["x"], a["y"], "mousePressed")
            for i in range(1, steps + 1):
                mouse(a["x"] + (b["x"] - a["x"]) * i / steps,
                      a["y"] + (b["y"] - a["y"]) * i / steps, "mouseMoved")
                time.sleep(0.03)
            mouse(b["x"], b["y"], "mouseReleased")
            time.sleep(0.5)

        def dbplan():
            return ev("__wuriHouse.db.plans.get(__seed.fid)")

        for _ in range(30):
            if ev("!!(window.__wuriHouse && window.__wuriPlan && window.WuriAccount)"):
                break
            time.sleep(0.5)
        note("模块就位（house/plan/account）", ev("!!(window.__wuriHouse && window.__wuriPlan && window.WuriAccount)") is True)

        seed = ev(SEED_JS)
        note("种子入库（宅/层/定稿测量/户型）", bool(seed and seed.get("hid")), seed)
        note("基线 computePush 无 plans 推送", seed.get("baselinePushPlans") == 0, seed.get("baselinePushPlans"))
        plan_uuid = seed["planUuid"]
        note("种子 plan uuid 已被快照认领", plan_uuid == "smoke-plan-uuid-1", plan_uuid)

        # ---------- 第一幕：编辑器看过户型 → 退出 ----------
        ev("__wuriHouse.openDetail(__seed.hid)")
        time.sleep(0.8)
        note("详情页打开", visible("#view-house"))
        click_at("#hd-plan-edit")
        time.sleep(1.0)
        note("编辑器打开", visible("#view-plan"))
        nrooms = ev("document.querySelectorAll('#hpe-svg [data-act=\"room\"]').length")
        note("编辑器里看到 2 间房（旧稿已载入内存）", nrooms == 2, nrooms)
        svg_txt = ev("document.getElementById('hpe-svg').textContent")
        note("飞星叠层在图（山向签可见）", ("山" in svg_txt and "向" in svg_txt), svg_txt[:50])
        shot("s1-editor-with-plan-day.png")
        click_at("#hpe-back")
        time.sleep(0.8)
        note("退出回详情页", visible("#view-house"))

        # ---------- 第二幕：详情页真点清空 ----------
        click_at("#hd-fl-clear")
        time.sleep(0.5)
        dlg_txt = ev("(document.querySelector('.hd-dlg-mask')||{}).textContent || ''")
        note("清空确认文案属实（明示不可撤销）", "不可撤销" in dlg_txt, dlg_txt[:60])
        note("清空确认文案不再单方承诺撤销", ("撤销" in dlg_txt and "编辑器" in dlg_txt), dlg_txt[:60])
        click_at("#hd-dlg-ok")
        time.sleep(0.6)
        p = ev("__wuriHouse.db.plans.get(__seed.fid).then(p => p === undefined ? 'GONE' : 'EXISTS')")
        note("详情清空后 plans 行已删", p == "GONE", p)

        # ---------- 第三幕：再进编辑器不得复活 ----------
        click_at("#hd-plan-edit")
        time.sleep(1.0)
        nrooms = ev("document.querySelectorAll('#hpe-svg [data-act=\"room\"]').length")
        note("再进编辑器：房间数 0（未复活）", nrooms == 0, nrooms)
        p = ev("__wuriHouse.db.plans.get(__seed.fid).then(p => p === undefined ? 'GONE' : JSON.stringify({rooms:(p.rooms||[]).length, fixtures:(p.fixtures||[]).length}))")
        note("再进编辑器后库内仍无旧户型", p == "GONE", p)
        shot("s2-editor-after-clear.png")
        click_at("#hpe-back")
        time.sleep(0.6)
        p = ev("__wuriHouse.db.plans.get(__seed.fid).then(p => p === undefined ? 'GONE' : 'EXISTS')")
        note("空层只看一眼退出不写空行", p == "GONE", p)

        # ---------- 第四幕：完整同步（删除意图＋墓碑） ----------
        ev("""(() => { window.__pullItems = [{ dataset: 'house.plans', key: __seed.planUuid,
          value: window.__oldPlanJson, updated_at: '2026-10-27T00:00:00.000Z' }]; return 1; })()""")
        ev("WuriAccount.runSync().then(() => 'done').catch(e => 'err:' + e.message)")
        time.sleep(0.5)
        intent = ev("localStorage.getItem('wuri_acct_delintent_v1') || ''")
        note("同步后删除意图已清（墓碑确认后）", plan_uuid not in intent, intent[:80])
        p = ev("__wuriHouse.db.plans.get(__seed.fid).then(p => p === undefined ? 'GONE' : 'EXISTS')")
        note("拉取旧值重发未把户型落地复活", p == "GONE", p)
        pushes = ev("window.__pushes")
        flat = [it for body in pushes for it in body.get("items", [])]
        tombs = [it for it in flat if it.get("dataset") == "house.plans" and it.get("key") == plan_uuid and it.get("deleted")]
        note("墓碑已推出（house.plans deleted）", len(tombs) == 1, flat)
        shadow = ev("localStorage.getItem('wuri_acct_shadow_v1') || ''")
        note("影子已摘除该 plan", ("house.plans|" + plan_uuid) not in shadow, shadow[:80])

        # ---------- 第五幕：重种户型，测框选/级联/一次性/叠层 ----------
        ev("""(() => { const plan = JSON.parse(window.__oldPlanJson);
          /* _snapshot 的序列化形态转回编辑器行形态：floorId/houseId 用本地 id */
          return __wuriHouse.db.plans.put({ floorId: __seed.fid, houseId: __seed.hid,
            uuid: 'smoke-plan-uuid-2', updated: Date.now(), mPerUnit: 1,
            rooms: [ { id: 'r101', x: 0, y: 0, w: 4, h: 3, name: '客厅', type: 'living' },
                     { id: 'r102', x: 4, y: 0, w: 3, h: 3, name: '卧室', type: 'master' } ],
            fixtures: [ { id: 'f201', type: 'door', x: 2, y: 0, rot: 0, flip: false },
                        { id: 'f202', type: 'tank', x: 2, y: 1.5, rot: 0, flip: false },
                        { id: 'f203', type: 'window', x: 5.5, y: 0, rot: 0, flip: false },
                        { id: 'f204', type: 'bed', x: 20, y: 20, rot: 0, flip: false } ],
            walls: [ { id: 'w301', x1: 0, y1: -2, x2: 4, y2: -2 } ],
            trace: null, liji: null, lijiLock: false, calibNote: '',
            layers: { rooms: true, fixtures: true, dims: true, overlay: 'fx', palNames: true, roomNames: true, traceBg: true, ovOpacity: 0.55, compRadius: 0 } }); })()""")
        time.sleep(0.3)
        ev("__wuriHouse.openDetail(__seed.hid)")
        time.sleep(0.7)
        click_at("#hd-plan-edit")
        time.sleep(1.0)
        nrooms = ev("document.querySelectorAll('#hpe-svg [data-act=\"room\"]').length")
        note("重种户型进入编辑器（2 房）", nrooms == 2, nrooms)

        # 框选：点开「选择」→ 开框选 → 拉框罩住客厅（房＋门＋鱼缸＝3）
        click_at('[data-tile="select"]')
        time.sleep(0.5)
        note("选择面板打开", visible("#hpe-selbox"))
        click_at("#hpe-boxmode")
        time.sleep(0.4)
        click_at("#hpe-sheet-x")  # 关 sheet 再拉框：合成鼠标无触摸隐式 capture，防 sheet 截事件（真机无此问题）
        time.sleep(0.4)
        drag_plan(-0.5, -0.5, 3.9, 3.5)
        attr = ev("document.getElementById('hpe-attr').textContent")
        note("框选计数＝3（房＋门＋缸）", "3" in attr, attr[:60])
        click_at("#hpe-b-del")
        time.sleep(0.6)
        p = dbplan()
        note("框选删除后剩 1 房（卧室）", p and len(p["rooms"]) == 1 and p["rooms"][0]["id"] == "r102",
             p and [r["id"] for r in p["rooms"]])
        fx_left = sorted(f["type"] for f in p["fixtures"]) if p else []
        note("框内构件清净、框外床保留", fx_left == ["bed", "window"], fx_left)

        # 退框选 → 选中卧室 → 属性条删除 → 窗级联、远床保留
        # （注：合成鼠标「点按」在未改代码上同样选不中房——harness 既有怪癖，
        #   真机触摸选中正常；此处以小拖代点按完成选中，拖幅 0.3 不影响级联判定）
        click_at("#hpe-b-x")
        time.sleep(0.3)
        drag_plan(5.5, 1.5, 5.8, 1.8, steps=4)
        note("小拖选中卧室（属性条出删除键）", ev("!!document.getElementById('hpe-a-del')") is True)
        click_at("#hpe-a-del")
        time.sleep(0.6)
        p = dbplan()
        note("删卧室后房间清空", p and len(p["rooms"]) == 0, p and len(p["rooms"]))
        fx_left = sorted(f["type"] for f in p["fixtures"]) if p else []
        note("贴墙窗随房级联删除、远处床保留（无孤儿）", fx_left == ["bed"], fx_left)
        shot("s3-after-cascade.png")

        # 一次性放置：构件（灶）放下→再点不新生；墙件同理
        click_at("#hpe-libbtn")
        time.sleep(0.5)
        click_at('#hpe-panel [data-tile="fix"][data-key="stove"]')
        time.sleep(0.4)
        nfx0 = len(dbplan()["fixtures"])
        pt1 = plan_pt(1, 1)
        mouse(pt1["x"], pt1["y"], "mousePressed"); mouse(pt1["x"], pt1["y"], "mouseReleased")
        time.sleep(0.5)
        nfx1 = len(dbplan()["fixtures"])
        note("灶放置成功（+1）", nfx1 == nfx0 + 1, (nfx0, nfx1))
        armed = ev("!document.getElementById('hpe-armed').hidden")
        note("放下后待放条已收（一次性）", armed is False, armed)
        pt2 = plan_pt(2.5, 2.5)
        mouse(pt2["x"], pt2["y"], "mousePressed"); mouse(pt2["x"], pt2["y"], "mouseReleased")
        time.sleep(0.5)
        nfx2 = len(dbplan()["fixtures"])
        note("再点画布不新生构件", nfx2 == nfx1, (nfx1, nfx2))

        # 画墙：画一段→自动卸下→再拖一段只平移不生墙
        nw0 = len(dbplan()["walls"])
        click_at('[data-tile="wall"]')
        time.sleep(0.4)
        drag_plan(0.2, 5, 3.5, 5)
        nw1 = len(dbplan()["walls"])
        note("画墙落段（+1）", nw1 == nw0 + 1, (nw0, nw1))
        drag_plan(0.2, 6.2, 3.5, 6.2)
        nw2 = len(dbplan()["walls"])
        note("画完自动卸下：再拖不生新墙", nw2 == nw1, (nw1, nw2))

        # 叠层收起：重开叠层（托盘叠盘钮轮换到 fx）→ 进画墙 → 叠层应收起且落盘 none
        for _ in range(4):
            ov = dbplan()["layers"]["overlay"]
            if ov == "fx":
                break
            click_at('[data-tile="ovcycle"]')
            time.sleep(0.45)
        note("叠层已手动开回飞星", dbplan()["layers"]["overlay"] == "fx", dbplan()["layers"]["overlay"])
        svg_txt = ev("document.getElementById('hpe-svg').textContent")
        note("飞星签重现图上", ("山" in svg_txt and "向" in svg_txt), svg_txt[:50])
        click_at('[data-tile="wall"]')
        time.sleep(0.5)
        svg_txt = ev("document.getElementById('hpe-svg').textContent")
        note("进画墙态：盘面文字已收起", ("山" not in svg_txt and "向" not in svg_txt), svg_txt[:50])
        shot("s4-drawing-no-overlay.png")
        time.sleep(0.5)  # 等 save 防抖落盘
        note("叠层收起已落盘为 none", dbplan()["layers"]["overlay"] == "none", dbplan()["layers"]["overlay"])
        click_at("#hpe-wall-x")  # 属性条「完成」退出画墙
        time.sleep(0.5)
        svg_txt = ev("document.getElementById('hpe-svg').textContent")
        note("退出绘制态不自动恢复叠层", ("山" not in svg_txt), svg_txt[:50])

        # ---------- 三态：选择面板 ----------
        click_at('[data-tile="select"]')
        time.sleep(0.5)
        shot("s5-select-day.png")
        ev("document.documentElement.setAttribute('data-theme','night')")
        time.sleep(0.4)
        shot("s5-select-night.png")
        ev("document.body.classList.add('sky-red')")
        time.sleep(0.4)
        shot("s5-select-red.png")
        chip_on = ev("(() => { const el = document.querySelector('#hpe-selbox .hpe-chip');"
                     " return el ? getComputedStyle(el).color : 'none'; })()")
        note("红光下选择面板签色走变量链", chip_on != "none", chip_on)
        ev("document.body.classList.remove('sky-red'); document.documentElement.setAttribute('data-theme','day')")

        errs = ev("window.__errs || []")
        note("全程零 JS 异常", len(errs) == 0, errs[:3])
    finally:
        proc.terminate()

    fails = [r for r in RESULTS if not r[1]]
    print("\n==== %d/%d PASS ====" % (len(RESULTS) - len(fails), len(RESULTS)))
    with open(os.path.join(SHOTS, "smoke-houseclear-results.txt"), "w") as f:
        for n, ok, x in RESULTS:
            f.write(("PASS " if ok else "FAIL ") + n + ((" | " + str(x)) if x else "") + "\n")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()

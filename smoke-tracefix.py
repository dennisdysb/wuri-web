#!/usr/bin/env python3
"""照片建房（描图）拉正大修 · 真手势冒烟（headless Chrome + 纯 stdlib CDP，file:// 直读）。
覆盖：
 A 舞台可达性：长图初始 fit 四角全在抽屉之上可见可命中；双指缩放后能拖到原够不着的右下角；
   单指拖空白平移；角点拖动有上浮影点（ghost）。
 B 禁系统菜单：contextmenu 在舞台上被 preventDefault；长按 900ms 不产生未拦截的 contextmenu。
 C 拉正有结果：正常四角点「拉正」→ 落盘 trace + 视图切回画布 + 校准步被推到台前；
   自交四角（对角互换）点「拉正」→ 出现人话错误（打叉）且不落盘、不静默。
 D 自动找外框：夹具 A（竖版纸面照）/夹具 B（横版屏幕照）上传后自动检出四角并出拉正预览，
   点「就用这个」落盘；检出角与真值误差 ≤0.05（归一化欧氏）。
 E 三态截图（日/夜/红光）＋390 宽。
用法：python3 smoke-tracefix.py [www目录]   结果与截图落 tracefix-shots/。
"""
import base64, importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location(
    "smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "www")
FIX = os.path.join(HERE, "tracefix-fixtures")
SHOTS = os.path.join(HERE, "tracefix-shots")
os.makedirs(SHOTS, exist_ok=True)
RESULTS = []

# 夹具真值（归一化 TL,TR,BR,BL）
GT_A = [(0.0766, 0.1281), (0.9290, 0.0800), (0.9476, 0.8781), (0.0548, 0.8550)]
GT_B_PLAN = [(0.1984, 0.2593), (0.8202, 0.2234), (0.8308, 0.7889), (0.1877, 0.8200)]
GT_B_SCR = [(0.1156, 0.1364), (0.9050, 0.0891), (0.9237, 0.8591), (0.0969, 0.8982)]

def note(name, ok, extra=""):
    RESULTS.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra != "" else ""))

def dist(p, q):
    return ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) ** 0.5

def main():
    port = base.free_port()
    prof = "/tmp/tracefix-smoke-%d" % port
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen(
        [base.CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
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
        c.call("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
        c.call("Page.addScriptToEvaluateOnNewDocument", {"source":
            "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e.error))});"})
        c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
        time.sleep(3.5)

        def ev(expr):
            r = c.call("Runtime.evaluate",
                       {"expression": expr, "returnByValue": True, "awaitPromise": True})
            if r.get("exceptionDetails"):
                raise RuntimeError(str(r["exceptionDetails"])[:300])
            return r["result"].get("value")

        def wait(expr, tries=40):
            for _ in range(tries):
                try:
                    if ev("!!(" + expr + ")"):
                        return True
                except Exception:
                    pass
                time.sleep(0.4)
            return False

        def touch(points, kind):
            c.call("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})

        def tap_xy(x, y):
            touch([{"x": x, "y": y, "id": 1}], "touchStart"); time.sleep(0.12)
            touch([], "touchEnd"); time.sleep(0.3)

        def tap(sel):
            rc = ev("""(() => { const e = document.querySelector(%s); if (!e) return null;
              e.scrollIntoView({block:'nearest'}); const r = e.getBoundingClientRect();
              return [r.left + r.width/2, r.top + r.height/2]; })()""" % json.dumps(sel))
            assert rc, "找不到元素 " + sel
            tap_xy(rc[0], rc[1])

        def drag(x1, y1, x2, y2, steps=12, hold=0.0):
            touch([{"x": x1, "y": y1, "id": 1}], "touchStart"); time.sleep(0.12 + hold)
            for i in range(1, steps + 1):
                touch([{"x": x1 + (x2 - x1) * i / steps, "y": y1 + (y2 - y1) * i / steps, "id": 1}], "touchMove")
                time.sleep(0.04)
            touch([], "touchEnd"); time.sleep(0.35)

        def pinch(cx, cy, r0, r1):
            p = lambda r, dx: {"x": cx + dx, "y": cy, "id": dx < 0 and 1 or 2}
            touch([{"x": cx - r0, "y": cy, "id": 1}, {"x": cx + r0, "y": cy, "id": 2}], "touchStart")
            time.sleep(0.12)
            for i in range(1, 9):
                r = r0 + (r1 - r0) * i / 8
                touch([{"x": cx - r, "y": cy, "id": 1}, {"x": cx + r, "y": cy, "id": 2}], "touchMove")
                time.sleep(0.04)
            touch([], "touchEnd"); time.sleep(0.4)

        def shot(name):
            r = c.call("Page.captureScreenshot", {"format": "png"})
            open(os.path.join(SHOTS, name), "wb").write(base64.b64decode(r["data"]))
            print("shot:", name)

        def corner_client(i):
            return ev("""(() => { const e = document.querySelector('.hpe-corner[data-i="%d"]');
              if (!e) return null; const r = e.getBoundingClientRect();
              return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width}; })()""" % i)

        def upload(path):
            b64 = base64.b64encode(open(path, "rb").read()).decode()
            ev("window.__up64 = ''; 0")
            for i in range(0, len(b64), 30000):
                ev("window.__up64 += %s; window.__up64.length" % json.dumps(b64[i:i + 30000]))
            ev("""(() => { const bin = atob(window.__up64); const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
              const f = new File([arr], 'photo.jpg', {type: 'image/jpeg'});
              const dt = new DataTransfer(); dt.items.add(f);
              const inp = document.getElementById('hpe-file');
              inp.files = dt.files;
              inp.dispatchEvent(new Event('change', {bubbles: true})); })()""")

        def get_plan(fid):
            return ev("__wuriHouse.db.plans.get(%d)" % fid)

        # ---------- 种子：一宅一空层 ----------
        assert wait("window.__wuriHouse && window.__wuriPlan && __wuriHouse.db"), "app 未就绪"
        ids = ev("""(async () => {
          const db = window.__wuriHouse.db;
          const hid = await db.houses.add({name:'拉正测试宅', address:'', client:'', phone:'', visitDate:'', note:'', created: Date.now()});
          const f1 = await db.floors.add({houseId: hid, name:'一楼', sort: 0});
          await db.plans.put({floorId: f1, houseId: hid, updated: Date.now(), mPerUnit: 1, calibNote:'', liji: null,
            rooms: [], fixtures: [], trace: null,
            layers: {grid:true, liji:true, overlay:'none', scale:1, ovOpacity:0.55, traceBg:true}});
          return [hid, f1];
        })()""")
        HID, F1 = ids
        ev("__wuriPlan.open(%d, %d)" % (HID, F1))
        note("编辑器打开（空层起始面）", wait("document.querySelector('.hpe-start[data-start=\"trace\"]')"))
        tap('.hpe-start[data-start="trace"]')
        note("照片建房层打开", wait("document.getElementById('hpe-photo-up')"))

        # ================= A 舞台可达性（夹具 A） =================
        upload(os.path.join(FIX, "fixture-a-portrait.jpg"))
        # 等检测 settle：出预览，或角点态且面板不在「正在自动找」、拉正钮未禁用（排除两段忙碌中间态）
        wait("document.getElementById('hpe-detect-use') || (document.querySelectorAll('.hpe-corner').length === 4 && document.getElementById('hpe-warp') && !document.getElementById('hpe-warp').disabled && !document.getElementById('hpe-tracebox').textContent.includes('正在自动找'))", 40)
        if ev("!!document.getElementById('hpe-detect-use')"):
            tap("#hpe-detect-adjust")
        in_stage = wait("document.querySelectorAll('.hpe-corner').length === 4 && document.getElementById('hpe-warp')", 30)
        note("上传后进入四角舞台", in_stage)
        time.sleep(1.2)  # 等自动检测/落点动画
        sheet_top = ev("document.getElementById('hpe-sheet').getBoundingClientRect().top")
        occ = []
        for i in range(4):
            cc = corner_client(i)
            occ.append((i, cc, cc and cc["y"] < sheet_top - 2))
        note("初始 fit：四角全在抽屉上方（不被遮）", all(o[2] for o in occ), occ)
        hit = ev("""(() => { const e = document.querySelector('.hpe-corner[data-i="2"]');
          const r = e.getBoundingClientRect();
          const t = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
          return !!(t && (t === e || e.contains(t))); })()""")
        note("右下角 elementFromPoint 直达角点", hit)
        shot("a-stage-fit.png")

        # 双指缩放 → viewBox 变化
        vb0 = ev("document.getElementById('hpe-svg').getAttribute('viewBox')")
        pinch(206, 320, 40, 110)
        vb1 = ev("document.getElementById('hpe-svg').getAttribute('viewBox')")
        note("舞台双指捏合缩放生效", vb1 != vb0, (vb0, vb1))
        # 单指拖空白平移
        drag(120, 200, 190, 260, steps=8)
        vb2 = ev("document.getElementById('hpe-svg').getAttribute('viewBox')")
        note("舞台单指拖空白＝平移", vb2 != vb1, (vb1, vb2))
        # 全图钮回 fit
        tap("#hpe-fitbtn")
        time.sleep(0.3)
        cc2 = corner_client(2)
        note("全图钮在舞台态回 fit（右下角复现）", cc2 and cc2["y"] < sheet_top - 2, cc2)

        # 拖右下角一段，验角点真动 + 拖动时上浮影点
        before = ev("""(() => { const e = document.querySelector('.hpe-corner[data-i="2"]');
          return [e.getAttribute('cx'), e.getAttribute('cy')]; })()""")
        cc = corner_client(2)
        touch([{"x": cc["x"], "y": cc["y"], "id": 1}], "touchStart"); time.sleep(0.15)
        ghost = ev("!!document.querySelector('.hpe-corner-ghost')")
        for i in range(1, 7):
            touch([{"x": cc["x"] - 40 * i / 6, "y": cc["y"] - 34 * i / 6, "id": 1}], "touchMove")
            time.sleep(0.04)
        touch([], "touchEnd"); time.sleep(0.35)
        after = ev("""(() => { const e = document.querySelector('.hpe-corner[data-i="2"]');
          return [e.getAttribute('cx'), e.getAttribute('cy')]; })()""")
        note("右下角可拖动（cx,cy 变化）", before != after, (before, after))
        note("拖动时有上浮影点提示", ghost)

        # ================= B 禁系统菜单 =================
        cm = ev("""(() => { const img = document.querySelector('#hpe-svg image');
          const e = new MouseEvent('contextmenu', {bubbles: true, cancelable: true});
          img.dispatchEvent(e); return e.defaultPrevented; })()""")
        note("舞台 contextmenu 被拦截（不弹图片菜单）", cm is True)
        cc = corner_client(0)
        touch([{"x": cc["x"], "y": cc["y"], "id": 1}], "touchStart")
        time.sleep(0.95)
        cm2 = ev("""(() => { const img = document.querySelector('#hpe-svg image');
          const e = new MouseEvent('contextmenu', {bubbles: true, cancelable: true});
          const t = document.elementFromPoint(%r, %r) || img; t.dispatchEvent(e);
          return e.defaultPrevented; })()""" % (cc["x"], cc["y"]))
        touch([], "touchEnd"); time.sleep(0.2)
        note("长按后 contextmenu 仍被拦截", cm2 is True)

        # ================= C 拉正：成功路径 =================
        t0 = time.time()
        tap("#hpe-warp")
        ok_warp = wait("!document.querySelector('.hpe-corner')", 25)
        dt_warp = round(time.time() - t0, 2)
        p = None
        for _ in range(20):  # 保存是异步防抖，轮询等落盘
            p = get_plan(F1)
            if p and p.get("trace"):
                break
            time.sleep(0.4)
        note("点拉正→舞台退出（%ss）" % dt_warp, ok_warp)
        note("拉正落盘 trace（corners+rect）",
             p and p.get("trace") and len(p["trace"]["corners"]) == 4 and p["trace"]["rect"]["w"] > 0,
             p and p.get("trace") and p["trace"]["rect"])
        cal_front = ev("""(() => { const b = document.getElementById('hpe-calib-start');
          const box = document.getElementById('hpe-tracebox');
          return { calib: !!b, banner: box ? /拉正完成|校准/.test(box.textContent) : false,
                   txt: box ? box.textContent.slice(0, 60) : '' }; })()""")
        note("拉正后校准步被推到台前", cal_front["calib"] and cal_front["banner"], cal_front["txt"])
        shot("c-warp-done.png")

        # ================= C2 拉正：自交失败路径 =================
        tap("#hpe-photo-recorner")
        note("重调四角回舞台", wait("document.querySelectorAll('.hpe-corner').length === 4", 25))
        time.sleep(0.8)
        # 把左上与右下对角互换（真拖拽造自交）：目标必须用拖前原位
        c0 = corner_client(0); c2 = corner_client(2)
        orig0 = (c0["x"], c0["y"])
        drag(c0["x"], c0["y"], c2["x"], c2["y"], steps=14)
        c2b = corner_client(2)
        drag(c2b["x"], c2b["y"], orig0[0], orig0[1], steps=14)
        tap("#hpe-warp")
        time.sleep(0.8)
        err = ev("""(() => { const box = document.getElementById('hpe-tracebox');
          return box ? box.textContent : ''; })()""")
        still = ev("document.querySelectorAll('.hpe-corner').length")
        note("自交点拉正→留舞台且给人话错误（打叉）", still == 4 and ("打叉" in err or "交叉" in err), err[:50])
        shot("c-warp-cross-err.png")
        tap("#hpe-stage-cancel")
        time.sleep(0.4)

        # ================= D 自动找外框（夹具 A 重传） =================
        tap("#hpe-photo-up") if ev("!!document.getElementById('hpe-photo-up')") else None
        # 若已回照片选择态则重新上传；否则从重调进入
        if not ev("!!document.getElementById('hpe-file')"):
            pass
        upload(os.path.join(FIX, "fixture-a-portrait.jpg"))
        detA = None
        for _ in range(30):
            detA = ev("""(() => { const pv = document.querySelector('.hpe-stage-preview-img');
              const cs = [...document.querySelectorAll('.hpe-corner')].map(e =>
                [parseFloat(e.getAttribute('cx')), parseFloat(e.getAttribute('cy'))]);
              return { preview: !!pv, corners: cs,
                       useBtn: !!document.getElementById('hpe-detect-use') }; })()""")
            if detA and (detA["preview"] or detA["useBtn"]):
                break
            time.sleep(0.5)
        note("夹具A：自动检出并出拉正预览", bool(detA and (detA["preview"] or detA["useBtn"])), detA and detA["preview"])
        shot("d-detect-a.png")
        if detA and detA["useBtn"]:
            tap("#hpe-detect-use")
            p = None
            for _ in range(20):
                p = get_plan(F1)
                if p and p.get("trace"):
                    break
                time.sleep(0.4)
            got = p and p.get("trace") and [(round(c["x"], 3), round(c["y"], 3)) for c in p["trace"]["corners"]]
            errs = [round(dist(g, t), 3) for g, t in zip(got, GT_A)] if got else None
            note("夹具A：确认落盘且四角误差≤0.05", bool(errs) and max(errs) <= 0.05, errs)
        else:
            got = detA and detA["corners"]
            note("夹具A：确认落盘且四角误差≤0.05", False, "无预览/确认钮 corners=%s" % (got,))

        # ================= D2 自动找外框（夹具 B） =================
        # 清掉 trace 后重传 B（直接改库 + 重调四角入口不可用，走上传新图替换）
        ev("""(async () => { const db = __wuriHouse.db; const p = await db.plans.get(%d);
          p.trace = null; await db.plans.put(p); })()""" % F1)
        time.sleep(0.5)
        ev("__wuriPlan.close()")
        time.sleep(0.6)
        ev("__wuriPlan.open(%d, %d)" % (HID, F1))
        time.sleep(0.8)
        if ev("!!document.querySelector('.hpe-start[data-start=\"trace\"]')"):
            tap('.hpe-start[data-start="trace"]')
        else:
            tap('[data-tile="trace"]')
        wait("document.getElementById('hpe-photo-up')")
        upload(os.path.join(FIX, "fixture-b-monitor.jpg"))
        detB = None
        for _ in range(30):
            detB = ev("""(() => ({ preview: !!document.querySelector('.hpe-stage-preview-img'),
              useBtn: !!document.getElementById('hpe-detect-use') }))()""")
            if detB and (detB["preview"] or detB["useBtn"]):
                break
            time.sleep(0.5)
        note("夹具B：自动检出并出拉正预览", bool(detB and (detB["preview"] or detB["useBtn"])), detB)
        shot("d-detect-b.png")
        if detB and detB["useBtn"]:
            tap("#hpe-detect-use")
            p = None
            for _ in range(20):
                p = get_plan(F1)
                if p and p.get("trace"):
                    break
                time.sleep(0.4)
            got = p and p.get("trace") and [(round(c["x"], 3), round(c["y"], 3)) for c in p["trace"]["corners"]]
            e_plan = [round(dist(g, t), 3) for g, t in zip(got, GT_B_PLAN)] if got else None
            e_scr = [round(dist(g, t), 3) for g, t in zip(got, GT_B_SCR)] if got else None
            okB = bool(e_plan) and (max(e_plan) <= 0.06 or max(e_scr) <= 0.06)
            note("夹具B：四角命中户型图框或屏幕框（≤0.06）", okB, {"plan": e_plan, "screen": e_scr, "got": got})
        else:
            note("夹具B：四角命中户型图框或屏幕框（≤0.06）", False, "未检出")

        # ================= E 三态 + 390 =================
        ev("__wuriPlan.close()"); time.sleep(0.5)
        ev("__wuriPlan.open(%d, %d)" % (HID, F1)); time.sleep(0.8)
        if ev("!!document.querySelector('.hpe-tray [data-act=\"sheet-trace\"]')"):
            tap('.hpe-tray [data-act="sheet-trace"]')
        else:
            tap('[data-tile="trace"]')
        time.sleep(0.4)
        tap("#hpe-photo-recorner")
        wait("document.querySelectorAll('.hpe-corner').length === 4", 25)
        time.sleep(0.6)
        shot("e-stage-day.png")
        ev("document.documentElement.setAttribute('data-theme','night')"); time.sleep(0.4)
        shot("e-stage-night.png")
        ev("document.body.classList.add('sky-red')"); time.sleep(0.4)
        shot("e-stage-red.png")
        ev("document.body.classList.remove('sky-red'); document.documentElement.setAttribute('data-theme','day')")
        c.call("Emulation.setDeviceMetricsOverride",
               {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        time.sleep(0.6)
        st390 = ev("document.getElementById('hpe-sheet').getBoundingClientRect().top")
        cc390 = corner_client(2)
        note("390 宽右下角仍在抽屉上方", cc390 and cc390["y"] < st390 - 2, cc390)
        shot("e-stage-390.png")

        errs = ev("window.__errs || []")
        note("全程零 JS 异常", len(errs) == 0, errs[:3])
    finally:
        proc.terminate()

    fails = [r for r in RESULTS if not r[1]]
    print("\n==== %d/%d PASS ====" % (len(RESULTS) - len(fails), len(RESULTS)))
    with open(os.path.join(SHOTS, "smoke-tracefix-results.txt"), "w") as f:
        for n, ok, x in RESULTS:
            f.write(("PASS " if ok else "FAIL ") + n + ((" | " + str(x)) if x != "" else "") + "\n")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""家宅档案第二批 A 真点击冒烟：户型图编辑器。
覆盖：详情入口→独立全屏画图页、建房/拉伸手柄/输数字定准、构件放门（贴墙）/灶、
撤销重做、完成回详情验缩略、重进验自动保存、上传户型图→四角拉正→比例尺校准→
描图拖框成间、图层飞星叠盘＋拖立极＋八宅扇、三态截图＋红光 computed、390 宽。
用法：python3 smoke-house-editor.py [www目录]   结果与截图落 hpe-shots/。"""
import base64, importlib.util, json, os, struct, subprocess, sys, time, urllib.request, zlib

spec = importlib.util.spec_from_file_location(
    "smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "www")
SHOTS = os.path.join(HERE, "hpe-shots")
os.makedirs(SHOTS, exist_ok=True)
RESULTS = []

def note(name, ok, extra=""):
    RESULTS.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

def make_plan_png(path):
    """生成一张 800x640 的简易户型图 PNG（白底黑墙线）。"""
    W, H = 800, 640
    px = bytearray([255] * (W * H * 3))
    def rect(x0, y0, x1, y1, t=5):
        for y in range(y0, y1):
            for x in range(x0, x1):
                if x < x0 + t or x >= x1 - t or y < y0 + t or y >= y1 - t:
                    i = (y * W + x) * 3
                    px[i] = px[i + 1] = px[i + 2] = 30
    rect(60, 50, 740, 590)
    rect(60, 50, 420, 330)
    rect(420, 50, 740, 330)
    rect(60, 330, 380, 590)
    rect(380, 330, 740, 590)
    raw = b""
    for y in range(H):
        raw += b"\x00" + bytes(px[y * W * 3:(y + 1) * W * 3])
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
        return c
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 6))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)

def main():
    plan_png = "/tmp/hpe-plan-%d.png" % os.getpid()
    make_plan_png(plan_png)
    port = base.free_port()
    prof = "/tmp/hpe-smoke-%d" % port
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
                tg = json.load(urllib.request.urlopen(
                    "http://127.0.0.1:%d/json" % port, timeout=3))
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
        c.call("Page.addScriptToEvaluateOnNewDocument", {"source":
            "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e.error))});"
            "try{localStorage.setItem('wuri_fs_house_v1', JSON.stringify({facingDeg:179.7, facing:'午', sitting:'子', ts: Date.now()-86400000}));}catch(e){}"})
        c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
        time.sleep(3.5)

        def ev(expr):
            r = c.call("Runtime.evaluate",
                       {"expression": expr, "returnByValue": True, "awaitPromise": True})
            if r.get("exceptionDetails"):
                raise RuntimeError(str(r["exceptionDetails"])[:300])
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
            return ev("""(() => __wuriHouse.db.floors.toArray().then(fs =>
              __wuriHouse.db.plans.get(fs[0].id)))()""")

        for _ in range(30):
            if ev("!!(window.__wuriHouse && window.__wuriPlan)"):
                break
            time.sleep(0.5)
        note("编辑器模块就位", ev("!!(window.__wuriHouse && window.__wuriPlan && __wuriHouse.db)") is True)

        ev("__wuriHouse.openList()")
        time.sleep(0.8)
        click_at(".hd-house")
        note("详情页打开", visible("#view-house"))
        click_at("#hd-plan-edit")
        time.sleep(0.8)
        note("编辑器独立页打开", visible("#view-plan"))

        # ---------- 绘制：建房＋输数字定准 ----------
        click_at("#hpe-addroom")
        p = dbplan()
        note("加房一块入库", p and len(p["rooms"]) == 1, p and len(p.get("rooms", [])))
        ev("""(() => { const n = document.getElementById('hpe-a-name');
          n.focus(); n.value = '客厅'; n.dispatchEvent(new Event('change', {bubbles: true}));
          const l = document.getElementById('hpe-a-len'); l.focus(); l.value = '5.6';
          l.dispatchEvent(new Event('change', {bubbles: true}));
          const w = document.getElementById('hpe-a-wid'); w.focus(); w.value = '3.8';
          w.dispatchEvent(new Event('change', {bubbles: true})); })()""")
        time.sleep(0.5)
        p = dbplan(); r0 = p["rooms"][0]
        note("改名生效", r0["name"] == "客厅", r0["name"])
        note("输数字定准 5.6×3.8", abs(r0["w"] - 5.6) < 0.01 and abs(r0["h"] - 3.8) < 0.01,
             "%sx%s" % (r0["w"], r0["h"]))
        note("属性条面积 21.3", "21.3" in ev("document.getElementById('hpe-attr').textContent"))

        # ---------- 拖动移房 ----------
        x_before = r0["x"]
        drag_plan(r0["x"] + r0["w"] / 2, r0["y"] + r0["h"] / 2,
                  r0["x"] + r0["w"] / 2 + 1.0, r0["y"] + r0["h"] / 2)
        p = dbplan(); r0 = p["rooms"][0]
        note("拖动移房 +1.0", abs((r0["x"] - x_before) - 1.0) < 0.06, r0["x"] - x_before)

        # ---------- 手柄拉伸 ----------
        drag_plan(r0["x"] + r0["w"], r0["y"] + r0["h"],
                  r0["x"] + r0["w"] + 0.5, r0["y"] + r0["h"] + 0.5)
        p = dbplan(); r0 = p["rooms"][0]
        note("SE 手柄拉伸 +0.5/+0.5", abs(r0["w"] - 6.1) < 0.06 and abs(r0["h"] - 4.3) < 0.06,
             "%sx%s" % (r0["w"], r0["h"]))

        click_at("#hpe-addroom")
        p = dbplan()
        note("第二间房入库", p and len(p["rooms"]) == 2, p and len(p.get("rooms", [])))
        shot("editor-draw-day.png")

        # ---------- 构件：门贴墙＋灶 ----------
        click_at('#hpe-seg [data-mode="parts"]')
        click_at('[data-fix="door"]')
        r0 = dbplan()["rooms"][0]
        pt = plan_pt(r0["x"] + r0["w"] / 2, r0["y"])
        mouse(pt["x"], pt["y"], "mousePressed"); mouse(pt["x"], pt["y"], "mouseReleased")
        time.sleep(0.5)
        p = dbplan()
        doors = [f for f in p["fixtures"] if f["type"] == "door"]
        note("门已放置", len(doors) == 1, len(p["fixtures"]))
        note("门贴墙吸附（y≈房顶边、rot=0）", doors and abs(doors[0]["y"] - r0["y"]) < 0.05 and doors[0]["rot"] == 0,
             doors and (doors[0]["y"], doors[0]["rot"]))
        click_at('[data-fixcat="kitchen"]')
        click_at('[data-fix="stove"]')
        pt = plan_pt(r0["x"] + 1.0, r0["y"] + 1.0)
        mouse(pt["x"], pt["y"], "mousePressed"); mouse(pt["x"], pt["y"], "mouseReleased")
        time.sleep(0.5)
        p = dbplan()
        note("灶台已放置", len([f for f in p["fixtures"] if f["type"] == "stove"]) == 1, len(p["fixtures"]))

        # ---------- 撤销/重做 ----------
        click_at('#hpe-seg [data-mode="draw"]')
        click_at("#hpe-undo")
        p = dbplan()
        note("撤销撤掉灶台", len([f for f in p["fixtures"] if f["type"] == "stove"]) == 0, len(p["fixtures"]))
        click_at("#hpe-redo")
        p = dbplan()
        note("重做恢复灶台", len([f for f in p["fixtures"] if f["type"] == "stove"]) == 1, len(p["fixtures"]))

        # ---------- 完成回详情：缩略图 ----------
        click_at("#hpe-done")
        time.sleep(0.8)
        note("完成回详情页", visible("#view-house"))
        thumb = ev("document.getElementById('hd-plan-box').innerHTML")
        note("详情缩略含房间轮廓与名", "<svg" in thumb and "客厅" in thumb, len(thumb))
        shot("detail-thumb-day.png")

        # ---------- 重进验自动保存 ----------
        click_at("#hd-plan-edit")
        time.sleep(0.8)
        p = dbplan()
        note("重进编辑器", visible("#view-plan"))
        note("自动保存留存（2 房 2 构件）", p and len(p["rooms"]) == 2 and len(p["fixtures"]) == 2,
             p and (len(p["rooms"]), len(p["fixtures"])))

        # ---------- 描图：上传→四角→拉正 ----------
        click_at('#hpe-seg [data-mode="trace"]')
        time.sleep(0.6)
        # headless 无文件选择器：以 DataTransfer 把真实 PNG 字节塞进 input 并派发 change，
        # 其后压缩/入库/四角舞台全走应用真实代码路径。
        b64 = base64.b64encode(open(plan_png, "rb").read()).decode()
        ev("""(() => { const bin = atob(%s); const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const f = new File([arr], 'plan.png', {type: 'image/png'});
          const dt = new DataTransfer(); dt.items.add(f);
          const inp = document.getElementById('hpe-file');
          inp.files = dt.files;
          inp.dispatchEvent(new Event('change', {bubbles: true})); })()""" % json.dumps(b64))
        time.sleep(1.5)
        note("上传后进入四角舞台", visible("#hpe-warp"))
        # 拖动左上角点向内收
        tl = ev("""(() => { const svg = document.getElementById('hpe-svg');
          const pt = svg.createSVGPoint(); pt.x = 60; pt.y = 76.8;
          const p = pt.matrixTransform(svg.getScreenCTM()); return {x: p.x, y: p.y}; })()""")
        br = ev("""(() => { const svg = document.getElementById('hpe-svg');
          const pt = svg.createSVGPoint(); pt.x = 110; pt.y = 128;
          const p = pt.matrixTransform(svg.getScreenCTM()); return {x: p.x, y: p.y}; })()""")
        mouse(tl["x"], tl["y"], "mousePressed")
        mouse(br["x"], br["y"], "mouseMoved")
        mouse(br["x"], br["y"], "mouseReleased")
        time.sleep(0.4)
        click_at("#hpe-warp")
        time.sleep(0.8)
        p = dbplan()
        note("拉正落盘（trace+corners+rect）",
             p and p.get("trace") and len(p["trace"]["corners"]) == 4 and p["trace"]["rect"]["w"] > 0,
             p and p.get("trace") and p["trace"]["rect"])
        note("拉正底图已渲染", ev("!!document.querySelector('#hpe-svg image')") is True)
        shot("editor-trace-day.png")

        # ---------- 比例尺校准 ----------
        tr = p["trace"]["rect"]
        click_at("#hpe-calib-start")
        for (qx, qy) in [(tr["x"] + 1, tr["y"] + 1), (tr["x"] + 4, tr["y"] + 1)]:
            pt = plan_pt(qx, qy)
            mouse(pt["x"], pt["y"], "mousePressed"); mouse(pt["x"], pt["y"], "mouseReleased")
            time.sleep(0.3)
        ev("""(() => { const i = document.getElementById('hpe-calib-val'); i.value = '0.9'; })()""")
        click_at("#hpe-calib-ok")
        p = dbplan()
        note("校准 mPerUnit=0.3", p and abs(p["mPerUnit"] - 0.3) < 0.01, p and p["mPerUnit"])
        note("校准标注留痕", p and p.get("calibNote") == "0.9 m", p and p.get("calibNote"))

        # ---------- 描图拖框成间 ----------
        drag_plan(tr["x"] + 0.5, tr["y"] + 0.5, tr["x"] + 3.5, tr["y"] + 2.5)
        p = dbplan()
        note("描图成间（第 3 间）", p and len(p["rooms"]) == 3, p and len(p.get("rooms", [])))

        # ---------- 图层：飞星叠盘＋拖立极＋八宅扇 ----------
        click_at('#hpe-seg [data-mode="layers"]')
        time.sleep(0.5)
        svg_txt = ev("document.getElementById('hpe-svg').textContent")
        note("飞星叠盘星数上图", ("山" in svg_txt and "向" in svg_txt), svg_txt[:60])
        note("度量汇总有本层合计", "本层合计" in ev("document.getElementById('hpe-layerbox').textContent"))
        p = dbplan(); lj = p["liji"]
        drag_plan(lj["x"], lj["y"], lj["x"] + 0.8, lj["y"])
        p2 = dbplan()
        note("立极可拖并落盘", p2 and abs(p2["liji"]["x"] - lj["x"] - 0.8) < 0.25,
             p2 and (lj["x"], p2["liji"]["x"]))
        click_at('[data-ov="bz"]')
        time.sleep(0.4)
        svg_txt2 = ev("document.getElementById('hpe-svg').textContent")
        note("八宅扇游年上图", ("气" in svg_txt2 or "氣" in svg_txt2 or "伏位" in svg_txt2), svg_txt2[:80])
        shot("editor-layers-day.png")

        # ---------- 三态 ----------
        ev("document.documentElement.setAttribute('data-theme','night')")
        time.sleep(0.4)
        shot("editor-layers-night.png")
        ev("document.body.classList.add('sky-red')")
        time.sleep(0.4)
        shot("editor-layers-red.png")
        chip_color = ev("getComputedStyle(document.querySelector('.hpe-ovchip.on')).color")
        note("红光下选中签色走红谱", chip_color == "rgb(242, 193, 178)", chip_color)
        ev("document.body.classList.remove('sky-red'); document.documentElement.setAttribute('data-theme','day')")

        # ---------- 390 宽 ----------
        c.call("Emulation.setDeviceMetricsOverride",
               {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        time.sleep(0.5)
        shot("editor-390.png")
        wide = ev("document.getElementById('view-plan').scrollWidth")
        note("390 宽无横向溢出", wide <= 392, wide)

        errs = ev("window.__errs || []")
        note("全程零 JS 异常", len(errs) == 0, errs[:3])
    finally:
        proc.terminate()
        try:
            os.unlink(plan_png)
        except OSError:
            pass

    fails = [r for r in RESULTS if not r[1]]
    print("\n==== %d/%d PASS ====" % (len(RESULTS) - len(fails), len(RESULTS)))
    with open(os.path.join(SHOTS, "smoke-editor-results.txt"), "w") as f:
        for n, ok, x in RESULTS:
            f.write(("PASS " if ok else "FAIL ") + n + ((" | " + str(x)) if x else "") + "\n")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()

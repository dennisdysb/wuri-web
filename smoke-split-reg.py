#!/usr/bin/env python3
"""户型编辑器「分切式」建房 · 冒烟（headless Chrome + 纯 stdlib CDP，file:// 直读）。
路径：新层→起始面（三项）→分切式定外框 10×8→竖切拖线到 3/7→点名客厅→横切→点名卫浴
→合并回两间→再切→标户外成 L 形→指标面积排除校验→「去摆家具」切自由模式拖放门一件
→存档重进全还原→旧存档（自由模式建的）打开不受影响。三态截图。零 JS 异常。"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request

CHROME = "/opt/meta-chromium/chrome"
WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
OUT = "/tmp/split-shots"
os.makedirs(OUT, exist_ok=True)

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]; s.close(); return p

CDP_PORT = free_port()

class WS:
    def __init__(self, url):
        assert url.startswith("ws://")
        host, path = url[5:].split("/", 1)
        hp = host.split(":"); port = int(hp[1]) if len(hp) > 1 else 80
        self.s = socket.create_connection((hp[0], port), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(("GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (path, host, key)).encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.s.recv(4096)
            if not chunk: raise RuntimeError("ws handshake failed")
            resp += chunk
        head, _, rest = resp.partition(b"\r\n\r\n")
        if b"101" not in head.split(b"\r\n")[0]: raise RuntimeError("ws handshake not 101")
        self.buf = rest
    def _fill(self, n, timeout):
        end = time.time() + timeout
        while len(self.buf) < n:
            self.s.settimeout(max(0.1, end - time.time()))
            try: chunk = self.s.recv(65536)
            except socket.timeout: raise TimeoutError("ws recv timeout")
            if not chunk: raise RuntimeError("ws closed")
            self.buf += chunk
    def recv_msg(self, timeout=20):
        self._fill(2, timeout)
        h = self.buf[:2]; self.buf = self.buf[2:]
        ln = h[1] & 0x7F
        if ln == 126:
            self._fill(2, timeout); ln = struct.unpack(">H", self.buf[:2])[0]; self.buf = self.buf[2:]
        elif ln == 127:
            self._fill(8, timeout); ln = struct.unpack(">Q", self.buf[:8])[0]; self.buf = self.buf[8:]
        if h[1] & 0x80:
            self._fill(4, timeout); self.buf = self.buf[4:]
        self._fill(ln, timeout)
        payload = self.buf[:ln]; self.buf = self.buf[ln:]
        if (h[0] & 0x0F) == 0x8: raise RuntimeError("ws close frame")
        return json.loads(payload.decode("utf-8", "replace"))
    def send(self, obj):
        data = json.dumps(obj).encode()
        mask = os.urandom(4)
        if len(data) < 126:
            hdr = bytes([0x81, 0x80 | len(data)])
        else:
            hdr = bytes([0x81, 0xFE]) + struct.pack(">H", len(data))
        self.s.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

class CDP:
    def __init__(self, sock):
        self.s = sock; self.i = 0; self.events = []
    def call(self, method, params=None, timeout=25):
        self.i += 1
        self.s.send({"id": self.i, "method": method, "params": params or {}})
        end = time.time() + timeout
        while time.time() < end:
            try: m = self.s.recv_msg(timeout=max(1, end - time.time()))
            except TimeoutError: break
            if m.get("id") == self.i:
                if "error" in m: raise RuntimeError(method + " error: " + json.dumps(m["error"])[:300])
                return m.get("result", {})
            self.events.append(m)
        raise RuntimeError("no response for " + method)
    def evaluate(self, expr, await_promise=True):
        r = self.call("Runtime.evaluate", {"expression": expr, "awaitPromise": await_promise,
                                           "returnByValue": True}, timeout=30)
        if r.get("exceptionDetails"):
            raise RuntimeError("page exception: " + json.dumps(r["exceptionDetails"])[:600])
        return r["result"].get("value")
    def errors(self):
        out = []
        for m in self.events:
            if m.get("method") == "Runtime.exceptionThrown":
                out.append("exception: " + json.dumps(m["params"])[:220])
            if m.get("method") == "Runtime.consoleAPICalled" and m["params"].get("type") == "error":
                out.append("console.error: " + json.dumps(m["params"].get("args"))[:220])
        return out

RESULTS = []
def check(name, cond, extra=""):
    RESULTS.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(extra) if extra and not cond else ""))

def main():
    prof = "/tmp/split-profile"
    subprocess.run(["rm", "-rf", prof])
    chrome = subprocess.Popen([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
                               "--allow-file-access-from-files", "--user-data-dir=" + prof,
                               "--remote-debugging-port=%d" % CDP_PORT, "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(40):
            try:
                targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % CDP_PORT, timeout=3))
                pages = [t for t in targets if t.get("type") == "page"]
                if pages: ws_url = pages[0]["webSocketDebuggerUrl"]; break
            except Exception: pass
            time.sleep(0.5)
        assert ws_url, "CDP 未就绪"
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
        cdp.call("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})

        def wait(expr, tries=60):
            for _ in range(tries):
                try:
                    if cdp.evaluate("!!(" + expr + ")"): return True
                except Exception: pass
                time.sleep(0.4)
            return False
        assert wait("window.__wuriHouse && window.__wuriPlan && __wuriHouse.db"), "app 未就绪"

        def touch(points, kind):
            cdp.call("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})
        def click(x, y):
            touch([{"x": x, "y": y, "id": 1}], "touchStart"); time.sleep(0.14)
            touch([], "touchEnd"); time.sleep(0.3)
        def drag(x1, y1, x2, y2, steps=10):
            touch([{"x": x1, "y": y1, "id": 1}], "touchStart"); time.sleep(0.14)
            for i in range(1, steps + 1):
                touch([{"x": x1 + (x2 - x1) * i / steps, "y": y1 + (y2 - y1) * i / steps, "id": 1}], "touchMove")
                time.sleep(0.05)
            touch([], "touchEnd"); time.sleep(0.35)
        def rect_center(sel):
            if "data-tile" in sel:
                cdp.evaluate("(() => { const e = document.querySelector(%s); if (e) e.scrollIntoView({inline:'center', block:'nearest'}); })()" % json.dumps(sel))
                time.sleep(0.3)
            return cdp.evaluate("(() => { const e = document.querySelector(%s); if (!e) return null;"
                                " const r = e.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()" % json.dumps(sel))
        def tap(sel):
            c = rect_center(sel); assert c, "找不到元素 " + sel; click(*c)
        def expand():
            # A批薄条：有「编辑」钮才点（落刀/外框生成的新块已预展开完整条）
            cdp.evaluate("(() => { const e = document.getElementById('hpe-a-edit'); if (e) e.click(); return true; })()")
            time.sleep(0.3)
        def ctap(sel):
            ok = cdp.evaluate("(() => { const e = document.querySelector(%s); if (!e) return false; e.scrollIntoView({block:'nearest'}); e.click(); return true; })()" % json.dumps(sel))
            assert ok, "ctap 找不到 " + sel
            time.sleep(0.25)
        def plan2client(x, y):
            return cdp.evaluate("(() => { const svg = document.getElementById('hpe-svg'); const pt = svg.createSVGPoint();"
                                " pt.x = %r; pt.y = %r; const p = pt.matrixTransform(svg.getScreenCTM()); return [p.x, p.y]; })()" % (x, y))
        def get_plan(fid):
            return cdp.evaluate("__wuriHouse.db.plans.get(%d)" % fid)
        def wait_plan(fid, tries=25):
            for _ in range(tries):
                p = get_plan(fid)
                if p: return p
                time.sleep(0.4)
            return None
        def shot(name):
            r = cdp.call("Page.captureScreenshot", {"format": "png"})
            open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

        # ---------- 种子：空宅 + 旧档宅 ----------
        ids = cdp.evaluate("""(async () => {
          const db = window.__wuriHouse.db;
          const hid = await db.houses.add({name:'分切测试宅', address:'', client:'', phone:'', visitDate:'', note:'', created: Date.now()});
          const fid = await db.floors.add({houseId: hid, name:'一层', sort: 0});
          await db.measurements.add({houseId: hid, ts: Date.now(), facingDeg: 180, facing:'午', sitting:'子', point:'宅心', decl:null, gps:null, gpsAcc:null, accDeg:null, fixed:true});
          const h2 = await db.houses.add({name:'旧档宅', address:'', client:'', phone:'', visitDate:'', note:'', created: Date.now()});
          const f2 = await db.floors.add({houseId: h2, name:'一层', sort: 0});
          await db.measurements.add({houseId: h2, ts: Date.now(), facingDeg: 180, facing:'午', sitting:'子', point:'宅心', decl:null, gps:null, gpsAcc:null, accDeg:null, fixed:true});
          await db.plans.put({floorId: f2, houseId: h2, updated: Date.now(), mPerUnit: 0.05,
            rooms: [ {id:'old1', x:-100, y:-80, w:200, h:160, name:'旧客厅', type:'living'} ],
            fixtures: [], trace: null, liji: {x:0, y:0}, calibNote:'',
            layers: {rooms:true, fixtures:true, dims:true, overlay:'none', palNames:true, roomNames:true, traceBg:true, ovOpacity:0.92}});
          return [hid, fid, h2, f2];
        })()""")
        H1, F1, H2, F2 = ids
        print("seed ids:", ids)

        # ---------- 1. 空层 → 起始选择面 ----------
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (H1, F1))
        check("空层自动弹起始面", wait("document.querySelectorAll('.hpe-start').length === 4 && !document.getElementById('hpe-sheet').hidden"))
        check("起始面标题说人话", cdp.evaluate("document.getElementById('hpe-sheet-title').textContent").strip() == "开始画这一层")
        check("分切式是推荐卡（第一张+rec）", cdp.evaluate("!!document.querySelector('.hpe-start.rec[data-start=split]')"))
        check("描图直达卡在列", cdp.evaluate("!!document.querySelector('.hpe-start[data-start=trace]')"))
        shot("01-start-day.png")

        # ---------- 2. 定外框 10×8 ----------
        ctap(".hpe-start[data-start=split]")
        check("外框表单出现", wait("document.getElementById('hpe-fr-go')"))
        cdp.evaluate("document.getElementById('hpe-fr-len').value = '10'; document.getElementById('hpe-fr-wid').value = '8'; true")
        ctap("#hpe-fr-go")
        p = wait_plan(F1)
        check("外框落盘单块", p and len(p["rooms"]) == 1, p and len(p["rooms"]))
        r0 = p["rooms"][0]
        check("外框 10m×8m（mPerUnit=1，单位即米）", abs(r0["w"] - 10) < 0.01 and abs(r0["h"] - 8) < 0.01, (r0["w"], r0["h"]))
        check("太极点=外框对角线交点", p.get("liji") and abs(p["liji"]["x"]) < 0.01 and abs(p["liji"]["y"]) < 0.01, p.get("liji"))
        check("外框块自动选中（属性条有竖切）", wait("document.getElementById('hpe-a-cutv')"))

        # ---------- 3. 竖切：拖线到左 3m ----------
        ctap("#hpe-a-cutv")
        check("切条出现（确定/取消）", wait("document.getElementById('hpe-cut-ok') && document.getElementById('hpe-cut-cancel')"))
        check("虚线切线渲染", cdp.evaluate("!!document.querySelector('.hpe-cutline')"))
        c1 = plan2client(0, -3); c2 = plan2client(-2, -3)  # 起点避开太极点(0,0)
        drag(c1[0], c1[1], c2[0], c2[1], steps=8)
        lab = cdp.evaluate("document.querySelector('.hpe-cut-a').textContent")
        check("拖动实时尺寸 左=3 m", "3" in lab, lab)
        shot("02-cutting.png")
        ctap("#hpe-cut-ok")
        time.sleep(0.9)
        p = get_plan(F1)
        check("落刀后两间", p and len(p["rooms"]) == 2, p and len(p["rooms"]))
        ws = sorted(r["w"] for r in p["rooms"])
        check("两块 3m/7m", abs(ws[0] - 3) < 0.01 and abs(ws[1] - 7) < 0.01, ws)
        tot = sum(r["w"] * r["h"] for r in p["rooms"])
        check("无缝无重叠：总面积守恒 80㎡", abs(tot - 80) < 0.01, tot)

        # ---------- 4. 点名：新块点「客厅」 ----------
        check("点名胶囊在（11 个常用名）", cdp.evaluate("document.querySelectorAll('[data-ncap]').length") == 11,
              cdp.evaluate("document.querySelectorAll('[data-ncap]').length"))
        ctap("[data-ncap=living]")
        time.sleep(0.8)
        p = get_plan(F1)
        check("客厅点名+类型色落盘", any(r.get("type") == "living" and r["name"] == "客厅" for r in p["rooms"]),
              [r["name"] for r in p["rooms"]])

        # ---------- 5. 横切左块 → 点名卫浴 ----------
        left = [r for r in p["rooms"] if r.get("type") != "living"][0]
        cx, cy = plan2client(left["x"] + left["w"] / 2, left["y"] + left["h"] / 2)
        click(cx, cy)
        expand()  # A批薄条：点「编辑」展开完整条
        check("点选左块出横切钮", wait("document.getElementById('hpe-a-cuth')"))
        ctap("#hpe-a-cuth")
        check("横切切条", wait("document.getElementById('hpe-cut-ok')"))
        ctap("#hpe-cut-ok")
        time.sleep(0.8)
        p = get_plan(F1)
        check("横切后三间", p and len(p["rooms"]) == 3, p and len(p["rooms"]))
        ctap("[data-ncap=bath]")
        time.sleep(0.8)
        p = get_plan(F1)
        check("卫浴点名落盘", any(r.get("type") == "bath" and r["name"] == "卫浴" for r in p["rooms"]),
              [r["name"] for r in p["rooms"]])

        # ---------- 6. 合并：卫浴与上边那间合并 ----------
        bath = [r for r in p["rooms"] if r.get("type") == "bath"][0]
        cx, cy = plan2client(bath["x"] + bath["w"] / 2, bath["y"] + bath["h"] / 2)
        click(cx, cy)
        expand()
        check("合并钮按方向出现（上边那间）", wait("document.querySelector('[data-mg=u]')"),
              cdp.evaluate("document.getElementById('hpe-attr').textContent.slice(0,140)"))
        ctap("[data-mg=u]")
        time.sleep(0.8)
        p = get_plan(F1)
        check("合并后回两间", p and len(p["rooms"]) == 2, p and len(p["rooms"]))
        col = [r for r in p["rooms"] if r.get("type") != "living"][0]
        check("合并几何复原 3×8", abs(col["w"] - 3) < 0.01 and abs(col["h"] - 8) < 0.01, (col["w"], col["h"]))

        # ---------- 7. 再切 + 标户外成 L 形 ----------
        cx, cy = plan2client(col["x"] + col["w"] / 2, col["y"] + col["h"] / 2)
        click(cx, cy)
        expand()
        ctap("#hpe-a-cuth"); ctap("#hpe-cut-ok")
        time.sleep(0.8)
        p = get_plan(F1)
        check("再切后三间", p and len(p["rooms"]) == 3, p and len(p["rooms"]))
        top = sorted([r for r in p["rooms"] if r.get("type") != "living"], key=lambda r: r["y"])[0]
        cx, cy = plan2client(top["x"] + top["w"] / 2, top["y"] + top["h"] / 2)
        click(cx, cy)
        expand()
        check("标户外钮在", wait("document.getElementById('hpe-a-out')"))
        ctap("#hpe-a-out")
        time.sleep(0.8)
        p = get_plan(F1)
        exs = [r for r in p["rooms"] if r.get("ex")]
        check("户外块落盘（ex=1 一块）", len(exs) == 1, [bool(r.get("ex")) for r in p["rooms"]])
        check("户外斜纹渲染", cdp.evaluate("!!document.querySelector('.hpe-hatchrect')"))
        shot("03-lshape-day.png")

        # 指标：总面积 80 − 户外 3m×4m=12 → 68㎡（指标在图层面板内）
        ctap("#hpe-layerbtn")
        check("图层面板出指标", wait("document.getElementById('hpe-metrics')"))
        mt = cdp.evaluate("document.getElementById('hpe-metrics').textContent")
        check("指标有户外·不计面积行", "不计面积" in mt, mt[:160])
        check("本层总计排除户外=68㎡", "68" in mt, mt[:220])
        ctap("#hpe-layerbtn")  # 收起

        # 三态
        cdp.evaluate("document.documentElement.setAttribute('data-theme','night')"); time.sleep(0.4)
        shot("04-lshape-night.png")
        cdp.evaluate("document.body.classList.add('sky-red')"); time.sleep(0.4)
        shot("05-lshape-red.png")
        cdp.evaluate("document.body.classList.remove('sky-red'); document.documentElement.setAttribute('data-theme','day')")

        # ---------- 8. 切自由模式放门 ----------
        tap('#hpe-modebtn')  # 旧「去摆家具」托盘 tile 已移成模式固定钮（本批项3）
        check("切自由模式（模式钮回「分切起步」）", wait("document.getElementById('hpe-modebtn').textContent.includes('分切起步')"))
        tap('#hpe-libbtn')  # 构件 tile 收进构件库（本批项8）
        tc = rect_center('[data-tile="fix"][data-key="door"]')
        check("门 tile 在构件库", tc is not None)
        tx, ty = plan2client(-1, 3.8)
        drag(tc[0], tc[1], tx, ty, steps=11)
        p = get_plan(F1)
        check("自由模式拖放门落盘", p and len(p.get("fixtures") or []) == 1, p and len(p.get("fixtures") or []))

        # ---------- 9. 存档重进全还原 ----------
        time.sleep(1.2)
        cdp.evaluate("document.getElementById('hpe-back').click()")
        time.sleep(0.5)
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (H1, F1))
        check("重进编辑器", wait("!document.getElementById('view-plan').hidden"))
        time.sleep(0.8)
        p2 = get_plan(F1)
        names = [r["name"] for r in p2["rooms"]]
        check("重进全还原：3 块/1 户外/1 门/客厅在", len(p2["rooms"]) == 3 and len([r for r in p2["rooms"] if r.get("ex")]) == 1
              and len(p2.get("fixtures") or []) == 1 and "客厅" in names, names)
        check("重进不弹起始面", cdp.evaluate("document.querySelectorAll('.hpe-start').length") == 0)

        # ---------- 10. 旧存档打开不受影响 ----------
        cdp.evaluate("document.getElementById('hpe-back').click()")
        time.sleep(0.5)
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (H2, F2))
        time.sleep(1.0)
        check("旧存档无起始面", cdp.evaluate("document.querySelectorAll('.hpe-start').length") == 0)
        check("旧存档房间渲染", cdp.evaluate("!!document.querySelector('[data-act=room][data-id=old1]')"))
        cx, cy = plan2client(-50, -40); click(cx, cy)
        expand()
        check("旧存档也能再切一刀（切钮在）", wait("document.getElementById('hpe-a-cutv')"))

        errs = [e for e in cdp.errors() if "favicon" not in e]
        check("零 JS 异常", not errs, errs[:3])
        failed = [n for n, ok in RESULTS if not ok]
        print("SMOKE_SPLIT %s: %d/%d" % ("OK" if not failed else "FAILED " + str(failed), len(RESULTS) - len(failed), len(RESULTS)))
    finally:
        chrome.terminate()

if __name__ == "__main__":
    main()

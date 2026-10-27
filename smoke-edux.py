#!/usr/bin/env python3
"""户型编辑器易用性批 · 冒烟（headless Chrome + 纯 stdlib CDP，file:// 直读）。
路径：放房不弹面板（薄条）→空白拖平移→捏合缩放→全图找回→编辑展开全貌入镜→双击展开→远房旧档自动适应。"""
import base64, hashlib, json, os, socket, struct, subprocess, sys, time, urllib.request

CHROME = "/opt/meta-chromium/chrome"
WWW = os.path.expanduser("~/workspace/wuri-web-edux/www")
OUT = "/tmp/edux-shots"
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
    RESULTS.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(extra) if extra else ""))

def main():
    prof = "/tmp/edux-profile"
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
        def fast_tap(x, y):
            touch([{"x": x, "y": y, "id": 1}], "touchStart"); time.sleep(0.05)
            touch([], "touchEnd"); time.sleep(0.06)
        def drag(x1, y1, x2, y2, steps=10):
            touch([{"x": x1, "y": y1, "id": 1}], "touchStart"); time.sleep(0.14)
            for i in range(1, steps + 1):
                touch([{"x": x1 + (x2 - x1) * i / steps, "y": y1 + (y2 - y1) * i / steps, "id": 1}], "touchMove")
                time.sleep(0.05)
            touch([], "touchEnd"); time.sleep(0.35)
        def pinch(cx, cy, d0, d1, steps=8):
            def pts(d):
                return [{"x": cx - d / 2, "y": cy, "id": 1}, {"x": cx + d / 2, "y": cy, "id": 2}]
            touch(pts(d0), "touchStart"); time.sleep(0.16)
            for i in range(1, steps + 1):
                touch(pts(d0 + (d1 - d0) * i / steps), "touchMove"); time.sleep(0.05)
            touch([], "touchEnd"); time.sleep(0.35)
        def rect_center(sel):
            if "data-tile" in sel:
                cdp.evaluate("(() => { const e = document.querySelector(%s); if (e) e.scrollIntoView({inline:'center', block:'nearest'}); })()" % json.dumps(sel))
                time.sleep(0.3)
            return cdp.evaluate("(() => { const e = document.querySelector(%s); if (!e) return null;"
                                " const r = e.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()" % json.dumps(sel))
        def plan2client(x, y):
            return cdp.evaluate("(() => { const svg = document.getElementById('hpe-svg'); const pt = svg.createSVGPoint();"
                                " pt.x = %r; pt.y = %r; const p = pt.matrixTransform(svg.getScreenCTM()); return [p.x, p.y]; })()" % (x, y))
        def get_plan(fid):
            return cdp.evaluate("__wuriHouse.db.plans.get(%d)" % fid)
        def vb():
            return cdp.evaluate("(() => document.getElementById('hpe-svg').getAttribute('viewBox').split(' ').map(Number))()")
        def svg_rect():
            return cdp.evaluate("(() => { const r = document.getElementById('hpe-svg').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
        def room_client_rect(r):
            x0, y0 = plan2client(r["x"], r["y"]); x1, y1 = plan2client(r["x"] + r["w"], r["y"] + r["h"])
            return [x0, y0, x1, y1]
        def inside(inner, outer, tol=2):
            return inner[0] >= outer[0] - tol and inner[1] >= outer[1] - tol and inner[2] <= outer[2] + tol and inner[3] <= outer[3] + tol
        def shot(name):
            r = cdp.call("Page.captureScreenshot", {"format": "png"})
            open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

        # ---------- 种子：A 空层新宅；B 远房旧档（两间相距 26 m、无 view 概念） ----------
        ids = cdp.evaluate("""(async () => {
          const db = window.__wuriHouse.db;
          const mk = async (name) => {
            const hid = await db.houses.add({name, address:'', client:'', phone:'', visitDate:'', note:'', created: Date.now()});
            const fid = await db.floors.add({houseId: hid, name:'一层', sort: 0});
            await db.measurements.add({houseId: hid, ts: Date.now(), facingDeg: 180, facing:'午', sitting:'子', point:'宅心', decl:null, gps:null, gpsAcc:null, accDeg:null, fixed:true});
            return [hid, fid];
          };
          const a = await mk('易用宅');
          const b = await mk('远房宅');
          await db.plans.put({floorId: b[1], houseId: b[0], updated: Date.now(), mPerUnit: 1,
            rooms: [ {id:'ra', x:0, y:0, w:4, h:3, name:'客厅', type:'living'},
                     {id:'rb', x:26, y:20, w:5, h:4, name:'主卧', type:'master'} ],
            fixtures: [], trace: null, liji: null, calibNote:'',
            layers: {rooms:true, fixtures:true, dims:true, overlay:'none', palNames:true, roomNames:true, traceBg:true, ovOpacity:0.92}});
          return [a[0], a[1], b[0], b[1]];
        })()""")
        H1, F1, H2, F2 = ids
        print("seed ids:", ids)

        # ---------- 1. A：套一室模板后托盘拖放新房 → 薄条、无全屏面板、房间全貌可见 ----------
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (H1, F1))
        check("空层自动弹模板", wait("document.querySelector('[data-tpl=\"t1\"]') && !document.getElementById('hpe-sheet').hidden"))
        c = rect_center('[data-tpl="t1"]'); click(*c); time.sleep(0.6)
        vb0 = vb()
        tc = rect_center('[data-tile="room"][data-key="bedroom"]')
        tx, ty = plan2client(0.5, 0.8)
        drag(tc[0], tc[1], tx, ty, steps=11)
        p = get_plan(F1)
        newr = [r for r in p["rooms"] if r["type"] == "bedroom"]
        check("拖放落间（模板 6＋新 1）", p and len(p["rooms"]) == 7 and len(newr) == 1, p and len(p["rooms"]))
        check("放房后只有薄条（无完整面板姓名框）",
              cdp.evaluate("!!document.getElementById('hpe-a-thin') && !document.getElementById('hpe-a-name')"))
        check("薄条含房名＋复制＋删除",
              cdp.evaluate("(() => { const t = document.getElementById('hpe-a-thin'); return t && t.textContent.includes('次卧') && !!document.getElementById('hpe-a-copy') && !!document.getElementById('hpe-a-del'); })()"))
        check("放房后视图未跳（viewBox 不变）", vb() == vb0, (vb0, vb()))
        nr = newr[0]
        check("新房全貌在画布内", inside(room_client_rect(nr), svg_rect()), room_client_rect(nr))
        shot("01-thin-day.png")

        # ---------- 2. 空白处单指拖动＝平移画布，房间坐标不变 ----------
        rooms_before = [(r["id"], r["x"], r["y"]) for r in p["rooms"]]
        sr = svg_rect()
        drag(sr[0] + 24, sr[1] + 24, sr[0] + 84, sr[1] + 64)
        vb1 = vb()
        check("空白拖后 viewBox 平移（x/y 均变小=图随手走）",
              vb1[0] < vb0[0] - 0.3 and vb1[1] < vb0[1] - 0.3, (vb0, vb1))
        p = get_plan(F1)
        rooms_after = [(r["id"], r["x"], r["y"]) for r in p["rooms"]]
        check("平移不改房间坐标", rooms_before == rooms_after)

        # ---------- 3. 点新房→仍薄条；点「编辑」→完整面板＋房间在面板之上全貌可见 ----------
        cx, cy = plan2client(nr["x"] + nr["w"] / 2, nr["y"] + nr["h"] / 2)
        click(cx, cy)
        check("点已放房间仍只出薄条", cdp.evaluate("!!document.getElementById('hpe-a-thin') && !document.getElementById('hpe-a-name')"))
        ec = rect_center('#hpe-a-edit'); click(*ec); time.sleep(0.5)
        check("点编辑展开完整面板", cdp.evaluate("!!document.getElementById('hpe-a-name') && !!document.getElementById('hpe-a-len')"))
        attr_top = cdp.evaluate("(() => document.getElementById('hpe-attr').getBoundingClientRect().top)()")
        rr = room_client_rect(nr)
        check("面板打开后房间全貌在面板上沿之上可见", rr[3] <= attr_top + 6 and rr[0] >= svg_rect()[0] - 2 and rr[2] <= svg_rect()[2] + 2,
              (rr, attr_top))
        shot("02-full-night-prep.png")
        # 点空白收起面板（并取消选中）
        sr = svg_rect(); click(sr[0] + 24, sr[1] + 24)
        check("点空白收起面板", cdp.evaluate("!document.getElementById('hpe-a-name') && !document.getElementById('hpe-a-thin')"))

        # ---------- 4. 双击房间→直接展开完整面板 ----------
        cx, cy = plan2client(nr["x"] + nr["w"] / 2, nr["y"] + nr["h"] / 2)
        fast_tap(cx, cy); fast_tap(cx, cy); time.sleep(0.5)
        check("双击房间展开完整面板", cdp.evaluate("!!document.getElementById('hpe-a-name')"))
        sr = svg_rect(); click(sr[0] + 24, sr[1] + 24)

        # ---------- 5. 双指捏合缩放（第一指压在房间上：手势接管且不误移房） ----------
        p = get_plan(F1)
        liv = [r for r in p["rooms"] if r["type"] == "living"][0]
        cx, cy = plan2client(liv["x"] + liv["w"] / 2, liv["y"] + liv["h"] / 2)
        vb_before = vb()
        pinch(cx, cy, 60, 170)
        vb2 = vb()
        check("捏合张开→视图放大（viewBox 变窄 ≥25%）", vb2[2] < vb_before[2] * 0.75, (vb_before[2], vb2[2]))
        p = get_plan(F1)
        liv2 = [r for r in p["rooms"] if r["type"] == "living"][0]
        check("捏合未误移被压房间", abs(liv2["x"] - liv["x"]) < 0.01 and abs(liv2["y"] - liv["y"]) < 0.01,
              (liv["x"], liv2["x"]))
        # 捏合收拢→缩小
        pinch(cx, cy, 170, 60)
        vb3 = vb()
        check("捏合收拢→视图缩小（viewBox 变宽）", vb3[2] > vb2[2] * 1.3, (vb2[2], vb3[2]))

        # ---------- 6. 拖远一间房→点「全图」全部找回 ----------
        p = get_plan(F1)
        liv = [r for r in p["rooms"] if r["type"] == "living"][0]
        cx, cy = plan2client(liv["x"] + liv["w"] / 2, liv["y"] + liv["h"] / 2)
        sr = svg_rect()
        drag(cx, cy, sr[2] - 6, cy + 120, steps=14)
        p = get_plan(F1)
        check("长拖后房间已远离原位", any(abs(r["x"] - liv["x"]) > 3 for r in p["rooms"] if r["id"] == liv["id"]),
              [r["x"] for r in p["rooms"] if r["id"] == liv["id"]])
        fc = rect_center('#hpe-fitbtn'); click(*fc); time.sleep(0.5)
        srr = svg_rect()
        allin = all(inside(room_client_rect(r), srr) for r in p["rooms"])
        check("点全图后全部房间入屏", allin)
        shot("03-fitall.png")

        # ---------- 7. B 旧档：打开默认自动适应（远房全入屏） ----------
        cdp.evaluate("__wuriPlan.close()"); time.sleep(0.8)
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (H2, F2))
        check("旧档打开渲染 2 间", wait("document.querySelectorAll('#hpe-svg [data-act=\"room\"]').length === 2"))
        p2 = get_plan(F2)
        srr = svg_rect()
        check("旧档打开自动适应：两间远房全入屏", all(inside(room_client_rect(r), srr) for r in p2["rooms"]),
              [room_client_rect(r) for r in p2["rooms"]])
        # 放大钻进客厅一角 → 全图找回
        ra = p2["rooms"][0]
        cx, cy = plan2client(ra["x"] + ra["w"] / 2, ra["y"] + ra["h"] / 2)
        vbB0 = vb()
        pinch(cx, cy, 50, 190)
        check("旧档捏合放大生效", vb()[2] < vbB0[2] * 0.6, (vbB0[2], vb()[2]))
        fc = rect_center('#hpe-fitbtn'); click(*fc); time.sleep(0.5)
        check("旧档全图找回两间", all(inside(room_client_rect(r), svg_rect()) for r in p2["rooms"]))
        check("旧档数据未被手势改动", get_plan(F2)["rooms"] == p2["rooms"])

        # ---------- 8. 三态截图 ----------
        cdp.evaluate("document.documentElement.setAttribute('data-theme','night')"); time.sleep(0.4)
        shot("04-night.png")
        cdp.evaluate("document.body.classList.add('sky-red')"); time.sleep(0.4)
        shot("05-red.png")
        cdp.evaluate("document.body.classList.remove('sky-red'); document.documentElement.setAttribute('data-theme','day')")

        errs = cdp.errors()
        check("零 JS 异常/控制台错误", len(errs) == 0, errs[:3])
    finally:
        chrome.terminate()

    fails = [r for r in RESULTS if not r[1]]
    print("\n==== %d/%d PASS ====" % (len(RESULTS) - len(fails), len(RESULTS)))
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()

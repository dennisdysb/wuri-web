#!/usr/bin/env python3
"""户型编辑器·落件压立极点命中优先级冒烟（v209 附记遗留 bug）。
真 CDP 鼠标：全压盖（灶台居中压立极）拖件 / 立极单独拖＋金锁判定条刷新 /
部分压盖（灶台偏压、圆环左弧外露）两向拖。
用法：smoke-liji-fix.py repro  → 断言 bug 签名（立极被拖走、构件不动）
      smoke-liji-fix.py verify → 断言修复行为（三项全过）
脚手架同 smoke-planlive.py 口径（headless Chrome + 纯 stdlib CDP）。"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request

MODE = sys.argv[1] if len(sys.argv) > 1 else "verify"
CHROME = "/opt/meta-chromium/chrome"
WWW = os.path.expanduser("~/workspace/.wt/liji-fix/www")


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
                                           "returnByValue": True}, timeout=40)
        if r.get("exceptionDetails"):
            raise RuntimeError("page exception: " + json.dumps(r["exceptionDetails"])[:400] + " || expr: " + expr[:160])
        return r["result"].get("value")

    def mouse(self, typ, x, y):
        self.call("Input.dispatchMouseEvent", {"type": typ, "x": x, "y": y, "button": "left", "clickCount": 1})

    def drag(self, x1, y1, x2, y2):
        self.mouse("mousePressed", x1, y1); time.sleep(0.09)
        for t in (0.2, 0.4, 0.6, 0.8, 1.0):
            self.mouse("mouseMoved", x1 + (x2 - x1) * t, y1 + (y2 - y1) * t); time.sleep(0.09)
        self.mouse("mouseReleased", x2, y2); time.sleep(0.4)


RESULTS = []


def run(name, fn):
    try:
        v = fn()
        ok = bool(v and v.get("ok"))
        RESULTS.append(ok)
        print(("PASS " if ok else "FAIL ") + name + ("" if ok else " -> " + json.dumps(v, ensure_ascii=False)[:500]))
    except Exception as e:
        RESULTS.append(False)
        print("FAIL " + name + " -> EXC " + str(e)[:300])


JS_PALS = ['kan', 'kun', 'zhen', 'xun', 'qian', 'dui', 'gen', 'li']

ROOMS = [
    {"id": "rNW", "name": "客厅", "type": "living", "x": 0, "y": 0, "w": 60, "h": 60},
    {"id": "rNE", "name": "卧室", "type": "bedroom", "x": 60, "y": 0, "w": 60, "h": 60},
    {"id": "rSW", "name": "厨房", "type": "kitchen", "x": 0, "y": 60, "w": 60, "h": 60},
    {"id": "rSE", "name": "卫浴", "type": "bath", "x": 60, "y": 60, "w": 60, "h": 60}]


def main():
    chrome = subprocess.Popen([CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                               "--allow-file-access-from-files", "--window-size=430,900",
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
        assert ws_url, "chrome CDP 未就绪"
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        for _ in range(60):
            try:
                if cdp.evaluate("!!(window.__wuriPlan && window.__wuriHouse && window.__wuriJinsuo)"): break
            except Exception: pass
            time.sleep(0.5)
        time.sleep(1.0)

        def ev(expr): return cdp.evaluate(expr)

        def plan2client(x, y):
            return ev("""(() => { const svg = document.querySelector('#hpe-svg');
              const pt = svg.createSVGPoint(); pt.x = %f; pt.y = %f;
              const p = pt.matrixTransform(svg.getScreenCTM()); return {x: p.x, y: p.y}; })()""" % (x, y))

        def drag_plan(x1, y1, x2, y2):
            a = plan2client(x1, y1); b = plan2client(x2, y2)
            cdp.drag(a["x"], a["y"], b["x"], b["y"])

        def get_plan():
            return ev("""(async () => { const p = await window.__wuriHouse.db.plans.get(9001);
              return {liji: p.liji, lijiLock: p.lijiLock,
                      fixtures: p.fixtures.map(f => ({id: f.id, type: f.type, x: f.x, y: f.y}))}; })()""")

        def get_u():
            return ev("""(() => { const svg = document.querySelector('#hpe-svg');
              return svg.viewBox.baseVal.width / 100; })()""")

        def seed(stove_x, stove_y):
            return ev("""(async () => {
              localStorage.setItem('wuri_pro_redeem', '1');
              const db = window.__wuriHouse.db;
              await db.houses.put({id: 9001, name: '冒烟宅', address: '', client: '', phone: '', surveyDate: '', note: '', created: Date.now(), updated: Date.now()});
              await db.floors.put({id: 9001, houseId: 9001, name: '一层', sort: 0, created: Date.now(), updated: Date.now()});
              await db.plans.put({floorId: 9001, houseId: 9001, mPerUnit: 0.05,
                rooms: %s,
                fixtures: [{id: 'fS', type: 'stove', x: %f, y: %f, rot: 0, flip: false}],
                walls: [], trace: null, liji: {x: 60, y: 60}, lijiLock: true,
                layers: {rooms: true, fixtures: true, dims: true, overlay: 'none', palNames: true, roomNames: true, traceBg: true, ovOpacity: 0.55, compRadius: 0},
                updated: Date.now()});
              await db.measurements.put({id: 9001, houseId: 9001, ts: Date.now(), sitting: '子山', facing: '午向', facingDeg: 180, fixed: true, decl: 0, point: 'door', gps: null, accDeg: 1});
              return {ok: true};
            })()""" % (json.dumps(ROOMS), stove_x, stove_y))

        def open_editor():
            for _ in range(40):
                if ev("!!(window.__wuriPlan && window.__wuriHouse && document.readyState === 'complete')"): break
                time.sleep(0.5)
            ev("window.__wuriPlan.open(9001, 9001)")
            for _ in range(30):
                if ev("!!document.querySelector('#hpe-svg .hpe-roomrect')"): return True
                time.sleep(0.4)
            return False

        def strip_state():
            return ev("""(() => { const bar = document.querySelector('#hpe-jsbar');
              if (!bar) return {mode: 'absent'};
              const chips = [...bar.querySelectorAll('.hpejs-chip')].map(c => c.className);
              return {mode: bar.getAttribute('data-mode'), hidden: bar.hidden, chips: chips}; })()""")

        def compute_now():
            return ev("""(async () => {
              const p = await window.__wuriHouse.db.plans.get(9001);
              const J = window.__wuriJinsuo.compute({facingDeg: 180}, p);
              const out = {};
              for (const pid in J.palaces) out[pid] = J.palaces[pid].status;
              out._center = J.center; return out; })()""")

        def stove_of(plan):
            for f in plan["fixtures"]:
                if f["id"] == "fS": return f
            return None

        # ---------- 阶段 A：灶台全压盖（中心与立极点重合） ----------
        run("种子A（灶台居中压立极点）", lambda: seed(60, 60))
        assert open_editor(), "编辑器未打开（A）"
        time.sleep(0.8)

        def t1():
            drag_plan(60, 60, 95, 88)
            p = get_plan(); st = stove_of(p)
            if MODE == "repro":
                # bug 签名：立极被拖到落点附近、灶台原地不动
                return {"ok": abs(p["liji"]["x"] - 95) < 4 and abs(p["liji"]["y"] - 88) < 4
                        and abs(st["x"] - 60) < 1 and abs(st["y"] - 60) < 1,
                        "liji": p["liji"], "stove": st}
            return {"ok": st["x"] > 85 and abs(st["y"] - 88) < 5
                    and abs(p["liji"]["x"] - 60) < 0.6 and abs(p["liji"]["y"] - 60) < 0.6,
                    "liji": p["liji"], "stove": st}
        run("T1 全压盖：从正中拖——" + ("复现 bug（立极被拖走）" if MODE == "repro" else "拖走的是灶台、立极不动"), t1)

        if MODE == "verify":
            def t2():
                before = strip_state()
                drag_plan(60, 60, 84, 36)
                p = get_plan(); st = stove_of(p)
                moved = abs(p["liji"]["x"] - 84) < 3 and abs(p["liji"]["y"] - 36) < 3
                stove_still = st["x"] > 85 and abs(st["y"] - 88) < 5
                time.sleep(0.6)
                after = strip_state(); J = compute_now()
                dotmap = {'ji': 'st-ok', 'xiong': 'st-bad', 'missing': 'st-miss', 'none': 'st-mut', 'noplan': 'st-mut'}
                chips_ok = after.get("mode") == "judge" and len(after.get("chips", [])) == 8 and all(
                    dotmap[J[pid]] in after["chips"][i] for i, pid in enumerate(JS_PALS))
                return {"ok": moved and stove_still and chips_ok,
                        "liji": p["liji"], "stove": st,
                        "barBefore": before.get("chips"), "barAfter": after.get("chips"),
                        "compute": {k: J[k] for k in JS_PALS}}
            run("T2 立极单独拖：立极跟手＋判定条 8 芯片随新立极点与 compute 同源刷新", t2)

            # ---------- 阶段 B：部分压盖（灶台偏压，圆环左弧外露） ----------
            run("种子B（灶台偏压 x=65，圆环左弧外露）", lambda: seed(65, 60))
            assert open_editor(), "编辑器未打开（B）"
            time.sleep(0.8)

            def t3a():
                drag_plan(65, 60, 65, 92)
                p = get_plan(); st = stove_of(p)
                return {"ok": st["y"] > 85 and abs(st["x"] - 65) < 5
                        and abs(p["liji"]["x"] - 60) < 0.6 and abs(p["liji"]["y"] - 60) < 0.6,
                        "liji": p["liji"], "stove": st}
            run("T3a 部分压盖：拖灶台中心——灶台走、立极不动", t3a)

            run("种子B2（复位偏压）", lambda: seed(65, 60))
            assert open_editor(), "编辑器未打开（B2）"
            time.sleep(0.8)

            def t3b():
                u = get_u()
                gx = 60 - 2.6 * u * 0.8  # 圆盘内、圆环左弧一带，灶台盖不到
                drag_plan(gx, 60, gx, 78)
                p = get_plan(); st = stove_of(p)
                return {"ok": abs(p["liji"]["x"] - gx) < 3 and abs(p["liji"]["y"] - 78) < 3
                        and abs(st["x"] - 65) < 0.6 and abs(st["y"] - 60) < 0.6,
                        "u": u, "grabX": gx, "liji": p["liji"], "stove": st}
            run("T3b 圆环外露区：拖立极——立极走、灶台不动", t3b)
        else:
            # repro 追加：T3a 在旧代码下同样被立极吃掉（灶台中心压十字臂）
            run("种子B（灶台偏压 x=65）", lambda: seed(65, 60))
            assert open_editor(), "编辑器未打开（B）"
            time.sleep(0.8)

            def t3a_repro():
                drag_plan(65, 60, 65, 92)
                p = get_plan(); st = stove_of(p)
                return {"ok": abs(p["liji"]["y"] - 92) < 4 and abs(st["y"] - 60) < 1,
                        "liji": p["liji"], "stove": st}
            run("T3a-repro 偏压中心点同样被立极吃掉", t3a_repro)

        print("MODE=%s TOTAL %d/%d" % (MODE, sum(RESULTS), len(RESULTS)))
    finally:
        chrome.terminate()


if __name__ == "__main__":
    main()

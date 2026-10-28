#!/usr/bin/env python3
"""户型编辑器×金锁判定实时联动冒烟：判定条同源/拖灶台翻转/移房占比同步/
锁定不误触/未定稿提示/非Pro锁定行/三态。
headless Chrome + 纯 stdlib CDP（脚手架同 smoke-planquick.py 口径）。"""
import base64, json, os, re, socket, struct, subprocess, sys, time, urllib.request

CHROME = "/opt/meta-chromium/chrome"
WWW = os.path.expanduser("~/workspace/.wt/planlive/www")

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
    def click(self, x, y):
        self.mouse("mousePressed", x, y); time.sleep(0.08); self.mouse("mouseReleased", x, y); time.sleep(0.25)
    def drag(self, x1, y1, x2, y2):
        self.mouse("mousePressed", x1, y1); time.sleep(0.09)
        for t in (0.2, 0.4, 0.6, 0.8, 1.0):
            self.mouse("mouseMoved", x1 + (x2 - x1) * t, y1 + (y2 - y1) * t); time.sleep(0.09)
        self.mouse("mouseReleased", x2, y2); time.sleep(0.35)
    def shot(self, path):
        r = self.call("Page.captureScreenshot", {"format": "png"})
        with open(path, "wb") as f: f.write(base64.b64decode(r["data"]))

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
ST_TXT = {'ji': '得位', 'xiong': '失位', 'missing': '缺角', 'none': '未见砂水', 'noplan': '未见砂水'}

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
        for _ in range(40):
            if cdp.evaluate("document.readyState") == "complete": break
            time.sleep(0.5)
        time.sleep(2.0)

        def ev(expr): return cdp.evaluate(expr)
        def center(sel):
            return ev("""(() => { const el = document.querySelector(%s); if (!el) return null;
              const r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()""" % json.dumps(sel))
        def click_sel(sel):
            c = center(sel); assert c, "no element " + sel
            cdp.click(c["x"], c["y"])
        def plan2client(x, y):
            return ev("""(() => { const svg = document.querySelector('#hpe-svg');
              const pt = svg.createSVGPoint(); pt.x = %f; pt.y = %f;
              const p = pt.matrixTransform(svg.getScreenCTM()); return {x: p.x, y: p.y}; })()""" % (x, y))
        def strip_state():
            return ev("""(() => { const bar = document.querySelector('#hpe-jsbar');
              if (!bar) return {mode: 'absent'};
              const chips = [...bar.querySelectorAll('.hpejs-chip')].map(c => c.className);
              const rows = [...bar.querySelectorAll('.hpejs-prow')].map(r => ({
                head: r.querySelector('b') ? r.querySelector('b').textContent : '',
                chip: r.querySelector('.js-chip') ? r.querySelector('.js-chip').textContent : '',
                cls: r.querySelector('.js-chip') ? r.querySelector('.js-chip').className : '',
                text: r.textContent }));
              return {mode: bar.getAttribute('data-mode'), hidden: bar.hidden,
                      chips: chips, rows: rows, text: bar.textContent}; })()""")
        def compute_now():
            return ev("""(async () => {
              const p = await window.__wuriHouse.db.plans.get(9001);
              const J = window.__wuriJinsuo.compute({facingDeg: 180}, p);
              const out = {};
              for (const pid in J.palaces) { const R = J.palaces[pid];
                out[pid] = {status: R.status, share: R.areaShare, cover: R.areaCover,
                            sha: R.shaItems, shui: R.shuiItems}; }
              out._center = J.center;
              return out; })()""")

        probe = {}
        def seed():
            r = ev("""(async () => {
              localStorage.setItem('wuri_pro_redeem', '1');
              const db = window.__wuriHouse.db;
              const rooms = [
                {id: 'rNW', name: '客厅', type: 'living', x: 0, y: 0, w: 60, h: 60},
                {id: 'rNE', name: '卧室', type: 'bedroom', x: 60, y: 0, w: 60, h: 60},
                {id: 'rSW', name: '厨房', type: 'kitchen', x: 0, y: 60, w: 60, h: 60},
                {id: 'rSE', name: '卫浴', type: 'bath', x: 60, y: 60, w: 60, h: 60}];
              const base = {mPerUnit: 0.05, rooms: rooms, fixtures: [], walls: [], liji: {x: 60, y: 60}};
              const dirs = {N: [60, 24], NE: [85, 35], E: [96, 60], SE: [85, 85],
                            S: [60, 96], SW: [35, 85], W: [24, 60], NW: [35, 35]};
              const meta = {}; window.JINSUO_DATA.duanyu.palaces.forEach(p => meta[p.id] = p);
              const probe = {};
              for (const dn in dirs) {
                const pl = JSON.parse(JSON.stringify(base));
                pl.fixtures = [{id: 'fx', type: 'stove', x: dirs[dn][0], y: dirs[dn][1]}];
                const J = window.__wuriJinsuo.compute({facingDeg: 180}, pl);
                for (const pid in J.palaces) if (J.palaces[pid].shaItems.length) {
                  probe[dn] = {pt: dirs[dn], pid: pid, yingxu: meta[pid].yingxu}; break;
                }
              }
              const pids = [...new Set(Object.values(probe).map(o => o.pid))];
              if (pids.length !== 8) return {ok: false, why: 'probe not bijective', probe: probe};
              let src = null, dst = null, tlt = null;
              for (const dn in probe) if (probe[dn].yingxu === '水' && !src) src = {dn: dn, ...probe[dn]};
              for (const dn in probe) if (probe[dn].yingxu === '砂' && !dst) dst = {dn: dn, ...probe[dn]};
              for (const dn in probe) if (probe[dn].pid !== src.pid && probe[dn].pid !== dst.pid && !tlt) tlt = {dn: dn, ...probe[dn]};
              if (!src || !dst || !tlt) return {ok: false, why: 'pick failed', probe: probe};
              await db.houses.put({id: 9001, name: '冒烟宅', address: '', client: '', phone: '', surveyDate: '', note: '', created: Date.now(), updated: Date.now()});
              await db.floors.put({id: 9001, houseId: 9001, name: '一层', sort: 0, created: Date.now(), updated: Date.now()});
              await db.plans.put({floorId: 9001, houseId: 9001, mPerUnit: 0.05, rooms: rooms,
                fixtures: [{id: 'fS', type: 'stove', x: src.pt[0], y: src.pt[1], rot: 0},
                           {id: 'fT', type: 'toilet', x: tlt.pt[0], y: tlt.pt[1], rot: 0}],
                walls: [], trace: null, liji: {x: 60, y: 60}, lijiLock: true,
                layers: {rooms: true, fixtures: true, dims: true, overlay: 'none', palNames: true, roomNames: true, traceBg: true, ovOpacity: 0.55, compRadius: 0},
                updated: Date.now()});
              await db.measurements.put({id: 9001, houseId: 9001, ts: Date.now(), sitting: '子山', facing: '午向', facingDeg: 180, fixed: true, decl: 0, point: 'door', gps: null, accDeg: 1});
              /* 无定稿宅（提示行用） */
              await db.houses.put({id: 9002, name: '未定稿宅', address: '', client: '', phone: '', surveyDate: '', note: '', created: Date.now(), updated: Date.now()});
              await db.floors.put({id: 9002, houseId: 9002, name: '一层', sort: 0, created: Date.now(), updated: Date.now()});
              await db.plans.put({floorId: 9002, houseId: 9002, mPerUnit: 0.05,
                rooms: [{id: 'rA', name: '客厅', type: 'living', x: 0, y: 0, w: 60, h: 60}],
                fixtures: [], walls: [], trace: null, liji: {x: 30, y: 30}, lijiLock: true,
                layers: {rooms: true, fixtures: true, dims: true, overlay: 'none', palNames: true, roomNames: true, traceBg: true, ovOpacity: 0.55, compRadius: 0},
                updated: Date.now()});
              return {ok: true, src: src, dst: dst, tlt: tlt};
            })()""")
            probe.update(r or {})
            return r
        run("种子＋八方探针自校准（灶台源=应水宫/目标=应砂宫）", seed)

        def open_editor(hid=9001, fid=9001):
            ev("window.__wuriPlan.open(%d, %d)" % (hid, fid))
            for _ in range(30):
                if ev("!!document.querySelector('#hpe-svg .hpe-roomrect')"): return True
                time.sleep(0.4)
            return False

        def t_bar_matches_compute():
            if not open_editor(): return {"ok": False, "why": "editor not rendered"}
            time.sleep(0.8)
            st = strip_state(); J = compute_now()
            if st["mode"] != "judge" or st["hidden"]: return {"ok": False, "why": "bar not judge", "st": st}
            if len(st["chips"]) != 8: return {"ok": False, "why": "chips != 8", "st": st}
            dotmap = {'ji': 'st-ok', 'xiong': 'st-bad', 'missing': 'st-miss', 'none': 'st-mut', 'noplan': 'st-mut'}
            for i, pid in enumerate(JS_PALS):
                want = dotmap[J[pid]["status"]]
                if want not in st["chips"][i]:
                    return {"ok": False, "why": "chip mismatch", "pid": pid, "want": want, "got": st["chips"][i], "J": J[pid]}
            srcst = J[probe["src"]["pid"]]["status"]
            return {"ok": srcst == "xiong", "srcStatus": srcst, "srcPid": probe["src"]["pid"]}
        run("判定条在位：8 芯片与 compute 同源一致＋源宫失位", t_bar_matches_compute)

        def t_expand_rows():
            click_sel("#hpe-jsbar .hpejs-row1")
            time.sleep(0.6)
            st = strip_state(); J = compute_now()
            if len(st["rows"]) != 8: return {"ok": False, "why": "rows != 8", "n": len(st["rows"])}
            for i, pid in enumerate(JS_PALS):
                row = st["rows"][i]
                if row["chip"] != ST_TXT[J[pid]["status"]]:
                    return {"ok": False, "why": "row status", "pid": pid, "row": row["chip"], "J": J[pid]["status"]}
                m = re.search(r"占全宅 ([\d.]+)% · 本宫覆盖 ([\d.]+)%", row["text"])
                if not m: return {"ok": False, "why": "no area in row", "pid": pid, "text": row["text"][:120]}
                sh, cv = float(m.group(1)), float(m.group(2))
                if abs(sh - round(J[pid]["share"] * 1000) / 10) > 0.11 or abs(cv - round(J[pid]["cover"] * 1000) / 10) > 0.11:
                    return {"ok": False, "why": "area mismatch", "pid": pid, "row": [sh, cv], "J": [J[pid]["share"], J[pid]["cover"]]}
            srcrow = st["rows"][JS_PALS.index(probe["src"]["pid"])]
            return {"ok": "灶" in srcrow["text"] or "爐" in srcrow["text"] or "灶台" in srcrow["text"], "srcrow": srcrow["text"][:160]}
        run("展开逐宫行：状态词/占比与 compute 逐项同数＋源宫见灶台", t_expand_rows)

        def t_drag_stove_flip():
            click_sel("#hpe-jsbar .hpejs-row1")  # 收起，给画布让位
            time.sleep(0.4)
            a = center("#hpe-svg [data-act='fixture'][data-id='fS']")
            b = plan2client(probe["dst"]["pt"][0], probe["dst"]["pt"][1])
            if not a or not b: return {"ok": False, "why": "coords", "a": a, "b": b}
            cdp.drag(a["x"], a["y"], b["x"], b["y"])
            time.sleep(0.9)
            pos = ev("""(async () => { const p = await window.__wuriHouse.db.plans.get(9001);
              const f = p.fixtures.filter(x => x.id === 'fS')[0]; return {x: f.x, y: f.y}; })()""")
            J = compute_now(); st = strip_state()
            dstJ, srcJ = J[probe["dst"]["pid"]], J[probe["src"]["pid"]]
            dotmap = {'ji': 'st-ok', 'xiong': 'st-bad', 'missing': 'st-miss', 'none': 'st-mut', 'noplan': 'st-mut'}
            chip_ok = (dotmap[dstJ["status"]] in st["chips"][JS_PALS.index(probe["dst"]["pid"])] and
                       dotmap[srcJ["status"]] in st["chips"][JS_PALS.index(probe["src"]["pid"])])
            return {"ok": dstJ["status"] == "ji" and srcJ["status"] == "none" and chip_ok,
                    "pos": pos, "dst": dstJ["status"], "src": srcJ["status"], "chipOk": chip_ok}
        run("拖灶台 应水宫→应砂宫：判定翻转 失位→得位、源宫转未见砂水、芯片同步", t_drag_stove_flip)

        def t_move_room_area():
            before = strip_state()
            click_sel("#hpe-jsbar .hpejs-row1")  # 展开读行
            time.sleep(0.5)
            rows_before = strip_state()["rows"]
            click_sel("#hpe-jsbar .hpejs-row1")  # 收起再拖房
            time.sleep(0.4)
            a = plan2client(100, 100); b = plan2client(100, 120)
            cdp.drag(a["x"], a["y"], b["x"], b["y"])
            time.sleep(0.9)
            click_sel("#hpe-jsbar .hpejs-row1")
            time.sleep(0.5)
            st = strip_state(); J = compute_now()
            if len(st["rows"]) != 8: return {"ok": False, "why": "rows gone", "st": st}
            changed = 0
            for i, pid in enumerate(JS_PALS):
                m = re.search(r"占全宅 ([\d.]+)%", st["rows"][i]["text"])
                m0 = re.search(r"占全宅 ([\d.]+)%", rows_before[i]["text"])
                if not m: return {"ok": False, "why": "no area", "pid": pid}
                if abs(float(m.group(1)) - round(J[pid]["share"] * 1000) / 10) > 0.11:
                    return {"ok": False, "why": "share mismatch after move", "pid": pid,
                            "row": m.group(1), "J": J[pid]["share"]}
                if m0 and abs(float(m.group(1)) - float(m0.group(1))) > 0.05: changed += 1
            return {"ok": changed >= 1, "changedPalaces": changed}
        run("移房（卫浴南移）：各宫占比与 compute 同步、至少一宫占比真变", t_move_room_area)

        def t_lock_fixture():
            click_sel("#hpe-jsbar .hpejs-row1")  # 收起
            time.sleep(0.3)
            click_sel("#hpe-svg [data-act='fixture'][data-id='fS']")
            time.sleep(0.5)
            if not ev("!!document.querySelector('#hpe-a-lock')"):
                return {"ok": False, "why": "no lock btn in attr"}
            click_sel("#hpe-a-lock")
            time.sleep(0.7)
            before = ev("""(async () => { const p = await window.__wuriHouse.db.plans.get(9001);
              const f = p.fixtures.filter(x => x.id === 'fS')[0]; return {x: f.x, y: f.y, lock: f.lock}; })()""")
            if not before["lock"]: return {"ok": False, "why": "lock not set", "b": before}
            a = center("#hpe-svg [data-act='fixture'][data-id='fS']")
            c = plan2client(probe["src"]["pt"][0], probe["src"]["pt"][1])
            cdp.drag(a["x"], a["y"], c["x"], c["y"])
            time.sleep(0.8)
            after = ev("""(async () => { const p = await window.__wuriHouse.db.plans.get(9001);
              const f = p.fixtures.filter(x => x.id === 'fS')[0]; return {x: f.x, y: f.y}; })()""")
            unlock = ev("!!document.querySelector('#hpe-a-lock')")
            if unlock: click_sel("#hpe-a-lock"); time.sleep(0.5)
            return {"ok": abs(after["x"] - before["x"]) < 0.01 and abs(after["y"] - before["y"]) < 0.01,
                    "before": before, "after": after}
        run("锁定灶台后拖不动（位置分毫未动）", t_lock_fixture)

        def t_hint_house():
            if not open_editor(9002, 9002): return {"ok": False, "why": "editor2 not rendered"}
            time.sleep(0.8)
            st = strip_state()
            return {"ok": st["mode"] == "hint" and "定稿" in st["text"], "st": st}
        run("未定稿宅：判定条出提示行（先定稿）", t_hint_house)

        def t_three_states():
            if not open_editor(9001, 9001): return {"ok": False, "why": "reopen fail"}
            time.sleep(0.8)
            click_sel("#hpe-jsbar .hpejs-row1")
            time.sleep(0.5)
            cdp.shot("/tmp/pl-day.png")
            day = ev("""(() => { const c = document.querySelector('#hpe-jsbar .hpejs-chip.st-ok, #hpe-jsbar .hpejs-chip.st-bad');
              return c ? getComputedStyle(c).color : ''; })()""")
            ev("document.documentElement.setAttribute('data-theme', 'night')")
            time.sleep(0.4); cdp.shot("/tmp/pl-night.png")
            ev("document.body.classList.add('sky-red')")
            time.sleep(0.4); cdp.shot("/tmp/pl-red.png")
            red = ev("""(() => { const c = document.querySelector('#hpe-jsbar .hpejs-chip.st-ok, #hpe-jsbar .hpejs-chip.st-bad');
              if (!c) return {ok: false}; const col = getComputedStyle(c).color;
              const m = col.match(/\\d+/g).map(Number); const r = c.getBoundingClientRect();
              return {ok: r.width > 0, col: col, rgb: m, dayVsRed: col}; })()""")
            rgb = red.get("rgb") or [0, 0, 0]
            redish = rgb[0] > rgb[1] and rgb[0] > rgb[2] and red.get("col") != day
            return {"ok": bool(red.get("ok")) and redish, "red": red, "day": day}
        run("三态：日/夜/红光截图＋红光下芯片计算色为红谱且异于日间", t_three_states)

        def t_nonpro_locked():
            ev("localStorage.removeItem('wuri_pro_redeem')")
            cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
            for _ in range(40):
                if cdp.evaluate("document.readyState") == "complete": break
                time.sleep(0.5)
            time.sleep(2.0)
            if not open_editor(9001, 9001): return {"ok": False, "why": "reopen fail"}
            time.sleep(0.8)
            st = strip_state()
            return {"ok": st["mode"] == "locked", "st": st}
        run("非 Pro：判定条出锁定行（不漏判定）", t_nonpro_locked)

        print("==== %d/%d PASS ====" % (sum(RESULTS), len(RESULTS)))
    finally:
        chrome.terminate()

if __name__ == "__main__":
    main()

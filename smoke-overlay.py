#!/usr/bin/env python3
"""户型编辑器九项同批修复 · 冒烟（headless Chrome + 纯 stdlib CDP，file:// 直读）。
断言：叠盘半透明（填充/线字分层＋滑杆持久化）/房名后置重绘/模式固定钮真点击切换/
顶栏 412+390 全钮入屏可点/清空本层＋删层/分切入口真进态（叠盘不吞点）/入口四选起始面/
构件库收口＋扩充 25 件（点放＋拖放）/模板说明去重；回归 v200 分切、v198 薄条＋平移。
三态截图。零 JS 异常。"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request

CHROME = "/opt/meta-chromium/chrome"
WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "overlay-shots")
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
    prof = "/tmp/overlay-profile"
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
            if "data-tile" in sel or "data-key" in sel:
                cdp.evaluate("(() => { const e = document.querySelector(%s); if (e) e.scrollIntoView({inline:'center', block:'nearest'}); })()" % json.dumps(sel))
                time.sleep(0.3)
            return cdp.evaluate("(() => { const e = document.querySelector(%s); if (!e) return null;"
                                " const r = e.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()" % json.dumps(sel))
        def tap(sel):
            c = rect_center(sel); assert c, "找不到元素 " + sel; click(*c)
        def ctap(sel):
            okk = cdp.evaluate("(() => { const e = document.querySelector(%s); if (!e) return false; e.scrollIntoView({block:'nearest'}); e.click(); return true; })()" % json.dumps(sel))
            assert okk, "ctap 找不到 " + sel
            time.sleep(0.25)
        def plan2client(x, y):
            return cdp.evaluate("(() => { const svg = document.getElementById('hpe-svg'); const pt = svg.createSVGPoint();"
                                " pt.x = %r; pt.y = %r; const p = pt.matrixTransform(svg.getScreenCTM()); return [p.x, p.y]; })()" % (x, y))
        def get_plan(fid):
            return cdp.evaluate("__wuriHouse.db.plans.get(%d)" % fid)
        def shot(name):
            r = cdp.call("Page.captureScreenshot", {"format": "png"})
            open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

        # ---------- 种子：宅甲两层（一层满房+罗盘开 ovOpacity 存量0.92、二层一房+照片）；宅乙单层 ----------
        ids = cdp.evaluate("""(async () => {
          const db = window.__wuriHouse.db;
          const R = (id, type, name, x, y, w, h) => ({id: id, type: type, name: name, x: x, y: y, w: w, h: h, rot: 0});
          const hid = await db.houses.add({name:'叠盘测试宅', address:'', client:'', phone:'', visitDate:'', note:'', created: Date.now()});
          const f1 = await db.floors.add({houseId: hid, name:'一楼', sort: 0});
          const f2 = await db.floors.add({houseId: hid, name:'二楼', sort: 1});
          await db.measurements.add({houseId: hid, ts: Date.now(), facingDeg: 270, facing:'酉', sitting:'卯', point:'宅心', decl:null, gps:null, gpsAcc:null, accDeg:null, fixed:true});
          await db.plans.put({floorId: f1, houseId: hid, updated: Date.now(), mPerUnit: 1, calibNote:'', liji: {x:0, y:0},
            rooms: [R('k1','kitchen','厨房',-5,-3.5,2.5,2), R('d1','dining','餐厅',-2.5,-3.5,2.5,2),
                    R('b1','bath','卫浴',0,-3.5,2.5,2), R('b2','bath','卫浴',2.5,-3.5,2.5,2),
                    R('lv','living','客厅',-5,-1.5,5,5), R('ms','master','主卧',0,-1.5,2.5,5), R('bd','bed','次卧',2.5,-1.5,2.5,5)],
            fixtures: [{id:'fx1', type:'door', x:-4.9, y:-1.6, rot:0}, {id:'fx2', type:'tv', x:1, y:-1.35, rot:0},
                       {id:'fx3', type:'washer', x:0.3, y:-3.2, rot:0}],
            trace: null,
            layers: {grid:false, liji:true, overlay:'compass', scale:1, ovOpacity:0.92}});
          await db.plans.put({floorId: f2, houseId: hid, updated: Date.now(), mPerUnit: 1, calibNote:'', liji: null,
            rooms: [R('only','bed','卧室',-2,-1.5,4,3)], fixtures: [], trace: null,
            layers: {grid:false, liji:false, overlay:'none', scale:1, ovOpacity:0.55}});
          await db.photos.add({houseId: hid, floorId: f2, cat:'plan', ts: Date.now(), note:'',
            blob: new Blob([new Uint8Array([1,2,3])], {type:'image/jpeg'})});
          const hidB = await db.houses.add({name:'单层宅', address:'', client:'', phone:'', visitDate:'', note:'', created: Date.now()});
          const fb = await db.floors.add({houseId: hidB, name:'全层', sort: 0});
          await db.plans.put({floorId: fb, houseId: hidB, updated: Date.now(), mPerUnit: 1, calibNote:'', liji: null,
            rooms: [R('rb','living','客厅',-2,-1.5,4,3)], fixtures: [], trace: null,
            layers: {grid:false, liji:false, overlay:'none', scale:1, ovOpacity:0.55}});
          return [hid, f1, f2, hidB, fb];
        })()""")
        HID, F1, F2, HIDB, FB = ids
        print("seed ids:", ids)

        # ---------- 阶段一：叠盘呈现（项1/2）＋顶栏（项4）＋模式钮（项3/6） ----------
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (HID, F1))
        check("编辑器打开且罗盘叠盘渲染", wait("document.querySelector('.hpe-ov')"))
        d = cdp.evaluate("""(() => {
          const ov = document.querySelector('.hpe-ov');
          const gs = ov ? [...ov.querySelectorAll(':scope > g')] : [];
          const labs = document.querySelector('.hpe-roomlabels');
          return { pe: ov && ov.getAttribute('pointer-events'),
            gops: gs.map(g => g.getAttribute('opacity')),
            labsAfter: !!(labs && ov) && (labs.compareDocumentPosition(ov) & 2) !== 0,
            labNames: labs ? labs.textContent : '',
            roomInnerText: !!document.querySelector('.hpe-room [data-act="room"] text') };
        })()""")
        check("叠盘整组 pointer-events=none（不吞点击·项6根因二）", d["pe"] == "none", d["pe"])
        check("填充组 0.55（存量 0.92 迁移）/线字组 1 全清（项1）", d["gops"] == ["0.55", "1"], d["gops"])
        check("房名标签层绘在叠盘之后（项2）", d["labsAfter"])
        check("标签层含客厅/主卧名", "客厅" in d["labNames"] and "主卧" in d["labNames"], d["labNames"][:40])
        check("房间组内不再自带文字", not d["roomInnerText"])

        def topbar(tag):
            tb = cdp.evaluate("""(() => {
              const ids = ['hpe-back','hpe-floorname','hpe-undo','hpe-redo','hpe-infobtn','hpe-layerbtn','hpe-fitbtn'];
              const vw = innerWidth;
              return ids.map(id => {
                const el = document.getElementById(id);
                if (!el) return {id: id, missing: true};
                const r = el.getBoundingClientRect();
                const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
                return {id: id, inside: r.left >= -0.5 && r.right <= vw + 0.5 && r.width > 10,
                        hit: !!(hit && (hit === el || el.contains(hit)))};
              });
            })()""")
            bad = [b for b in tb if b.get("missing") or not b["inside"] or not b["hit"]]
            check(f"顶栏全钮入屏且可命中（{tag}·项4）", not bad, bad)
        topbar("412")
        shot("01-topbar-412.png")
        vb0 = cdp.evaluate("document.querySelector('#hpe-svg').getAttribute('viewBox')")
        drag(206, 120, 276, 120, steps=6)
        vb1 = cdp.evaluate("document.querySelector('#hpe-svg').getAttribute('viewBox')")
        check("空白拖动＝平移（v198 回归）", vb1 != vb0)
        tap("#hpe-fitbtn")
        vb2 = cdp.evaluate("document.querySelector('#hpe-svg').getAttribute('viewBox')")
        check("最右钮「全图」真点击回全图（项4）", vb2 == vb0, (vb0, vb2))
        shot("02-compass-day.png")

        mb = cdp.evaluate("""(() => { const b = document.getElementById('hpe-modebtn');
          const r = b.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
          return {hit: !!(el && (el === b || b.contains(el))), txt: b.textContent,
                  inside: r.left >= 0 && r.right <= innerWidth}; })()""")
        check("模式固定钮完整入屏且 elementFromPoint 命中（项3）", mb["hit"] and mb["inside"], mb)
        check("自由态模式钮文案＝分切起步", "分切起步" in mb["txt"], mb["txt"])
        tap("#hpe-modebtn")
        check("点模式钮进分切态：钮翻「去摆家具」高亮（项6）",
              wait("document.getElementById('hpe-modebtn').classList.contains('on') && document.getElementById('hpe-modebtn').textContent.includes('去摆家具')"))
        check("分切态常驻指引条出现（非 toast 一闪）",
              cdp.evaluate("(document.getElementById('hpe-attr').textContent || '').includes('点任意一间房')"))
        shot("03-split-pickbar.png")
        pc = plan2client(1.25, 1.0)
        through = cdp.evaluate("(() => { const el = document.elementFromPoint(%r, %r);"
                               " return !!(el && el.closest && el.closest('[data-act=\"room\"]')); })()" % (pc[0], pc[1]))
        check("罗盘覆盖处 elementFromPoint 直达房间", through)
        click(*plan2client(1.25, 1.0))
        check("叠盘下点房→选中并展开横/竖切钮", wait("document.getElementById('hpe-a-cutv')"))
        ctap("#hpe-a-cuth")
        check("横切进入切条", wait("document.getElementById('hpe-cut-ok')"))
        ctap("#hpe-cut-ok")
        time.sleep(0.8)
        check("横切确定→房间 7→8", len(get_plan(F1)["rooms"]) == 8, len(get_plan(F1)["rooms"]))
        tap("#hpe-modebtn")
        check("再点模式钮回自由态（项3 闭环）",
              wait("document.getElementById('hpe-modebtn').textContent.includes('分切起步')"))

        # ---------- 阶段二：托盘三 tile（项6 附带）＋模板去重（项9）＋滑杆（项1） ----------
        tap('[data-tile="tpl"]')
        check("模板层打开", wait("document.getElementById('hpe-tplbox')"))
        cnt = cdp.evaluate("(document.getElementById('hpe-panel').textContent.match(/模板尺寸为近似值/g) || []).length")
        check("模板说明只渲染一份（项9）", cnt == 1, cnt)
        shot("04-tpl-note-once.png")
        cdp.evaluate("document.getElementById('hpe-sheet-x').click(); true")
        time.sleep(0.3)
        tap('[data-tile="trace"]')
        check("描图 tile 真点开描图层", wait("document.getElementById('hpe-tracebox')"))
        cdp.evaluate("document.getElementById('hpe-sheet-x').click(); true")
        time.sleep(0.3)
        tap('[data-tile="ovcycle"]')
        time.sleep(1.0)
        check("叠盘 tile 真点循环 罗盘→八宅", get_plan(F1)["layers"]["overlay"] == "bz", get_plan(F1)["layers"]["overlay"])
        tap("#hpe-layerbtn")
        check("图层面板打开", wait("document.querySelector('[data-ov=\"compass\"]')"))
        cdp.evaluate("document.querySelector('[data-ov=\"compass\"]').click(); true")
        time.sleep(0.4)
        check("透明度滑杆在位（项1）", cdp.evaluate("!!document.getElementById('hpe-ovopacity')"))
        cdp.evaluate("(() => { const r = document.getElementById('hpe-ovopacity'); r.value = 30; r.dispatchEvent(new Event('input', {bubbles: true})); })()")
        time.sleep(1.0)
        pl = get_plan(F1)
        gs = cdp.evaluate("[...document.querySelectorAll('.hpe-ov > g')].map(g=>g.getAttribute('opacity'))")
        check("滑杆→ovOpacity 0.3 持久化", abs(pl["layers"]["ovOpacity"] - 0.3) < 0.001, pl["layers"]["ovOpacity"])
        check("填充 0.3／线字 0.75（滑杆只压填充）", gs == ["0.3", "0.75"], gs)
        cdp.evaluate("(() => { const r = document.getElementById('hpe-ovopacity'); r.value = 55; r.dispatchEvent(new Event('input', {bubbles: true})); })()")
        time.sleep(0.7)
        shot("05-layers-opacity55.png")

        # ---------- 阶段三：构件库（项8） ----------
        tap("#hpe-libbtn")
        check("构件库面板打开", wait("document.querySelector('#hpe-panel [data-key=\"tv\"]')"))
        lib = cdp.evaluate("""(() => ({
          rooms: document.querySelectorAll('#hpe-panel [data-tile="room"]').length,
          fix: document.querySelectorAll('#hpe-panel [data-tile="fix"]').length,
          keys: [...document.querySelectorAll('#hpe-panel [data-tile="fix"]')].map(e => e.getAttribute('data-key')) }))()""")
        check("库内房间预设 12", lib["rooms"] == 12, lib["rooms"])
        check("库内构件 25 件（原 14＋新 11）", lib["fix"] == 25, lib["fix"])
        for k in ["dtable", "ctable", "tvstand", "bookcase", "shoecab", "nightstand", "basin", "shower", "washer", "ac", "tv"]:
            check("新件在库：" + k, k in lib["keys"])
        shot("06-lib-panel.png")
        tap('[data-key="tv"]')
        check("点选电视→待放条出现", wait("!document.getElementById('hpe-armed').hidden && document.getElementById('hpe-armed').textContent.includes('电视')"))
        check("点选待放后库面板自动收起", cdp.evaluate("document.getElementById('hpe-sheet').hidden"))
        click(*plan2client(-3.5, 2.5))
        time.sleep(0.8)
        check("点放：电视入 fixtures", any(f["type"] == "tv" for f in get_plan(F1)["fixtures"]))
        tap("#hpe-libbtn")
        check("库再开", wait("document.querySelector('#hpe-panel [data-key=\"bed\"]')"))
        bc = rect_center('[data-key="bed"]')
        tg = plan2client(3.5, 2.5)
        drag(bc[0], bc[1], tg[0], tg[1], steps=14)
        time.sleep(0.8)
        check("拖放：床入 fixtures（库内拖放）", any(f["type"] == "bed" for f in get_plan(F1)["fixtures"]))
        tap("#hpe-libbtn")
        check("库三开", wait("document.querySelector('#hpe-panel [data-key=\"study\"]')"))
        tap('[data-key="study"]')
        time.sleep(0.3)
        click(*plan2client(-3.5, -2.6))
        time.sleep(0.8)
        check("点放房间只出薄条（v198 回归）",
              cdp.evaluate("!!document.getElementById('hpe-a-thin') && !document.getElementById('hpe-a-name')"))

        # ---------- 阶段四：清空本层（项5-①）＋四选起始面（项7）＋v200 分切回归 ----------
        tap("#hpe-layerbtn")
        check("图层面板含「清空本层户型」", wait("document.getElementById('hpe-clearfloor')"))
        ctap("#hpe-clearfloor")
        check("清空走自家确认弹层", wait("document.querySelector('.hd-dlg-mask')"))
        ctap("#hd-dlg-cancel")
        time.sleep(0.3)
        check("取消→房间不动", len(get_plan(F1)["rooms"]) > 0)
        ctap("#hpe-clearfloor")
        check("确认弹层再现", wait("document.querySelector('.hd-dlg-mask')"))
        ctap("#hd-dlg-ok")
        time.sleep(0.9)
        pl = get_plan(F1)
        check("确认清空→房间/构件/描图全清、楼层保留",
              len(pl["rooms"]) == 0 and len(pl["fixtures"]) == 0 and not pl["trace"])
        starts = cdp.evaluate("[...document.querySelectorAll('.hpe-start')].map(e=>e.getAttribute('data-start'))")
        check("清空后回四选起始面（项7）", starts == ["split", "tpl", "trace", "free"], starts)
        shot("07-start-4cards.png")
        ctap('.hpe-start[data-start="free"]')
        check("点「空白自由」关面落画布", wait("document.getElementById('hpe-sheet').hidden"))
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (HID, F1))
        check("重进空层→第一屏仍四选（存档确为空）", wait("!document.getElementById('hpe-sheet').hidden && document.querySelectorAll('.hpe-start').length === 4"))
        ctap('.hpe-start[data-start="split"]')
        check("外框表单出现", wait("document.getElementById('hpe-fr-go')"))
        cdp.evaluate("document.getElementById('hpe-fr-len').value = '10'; document.getElementById('hpe-fr-wid').value = '8'; true")
        ctap("#hpe-fr-go")
        time.sleep(0.8)
        check("分切回归：外框成一间", len(get_plan(F1)["rooms"]) == 1)
        check("定外框后自动分切态（模式钮翻面）",
              cdp.evaluate("document.getElementById('hpe-modebtn').textContent.includes('去摆家具')"))
        ctap("#hpe-a-cutv")
        check("切条出现", wait("document.getElementById('hpe-cut-ok')"))
        ctap("#hpe-cut-ok")
        time.sleep(0.8)
        check("分切回归：竖切→两间", len(get_plan(F1)["rooms"]) == 2, len(get_plan(F1)["rooms"]))

        # ---------- 阶段五：删层（项5-②） ----------
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (HID, F2))
        check("切到二层", wait("document.getElementById('hpe-floorname').textContent.includes('二楼')"))
        tap("#hpe-floorname")
        check("楼层切换层含「删除楼层」（多层时）", wait("document.getElementById('hpe-fl-del')"))
        ctap("#hpe-fl-del")
        check("删层走确认弹层", wait("document.querySelector('.hd-dlg-mask')"))
        ctap("#hd-dlg-ok")
        time.sleep(1.2)
        after = cdp.evaluate("""(async () => { const db = window.__wuriHouse.db;
          const fl = await db.floors.where('houseId').equals(%d).toArray();
          const ph = await db.photos.where('houseId').equals(%d).toArray();
          const p1 = await db.plans.get(%d);
          return {nf: fl.length, photoFloor: ph.length ? ph[0].floorId : 'none',
                  p1rooms: p1 ? p1.rooms.length : -1,
                  fname: (document.getElementById('hpe-floorname') || {}).textContent || ''}; })()""" % (HID, HID, F1))
        check("删层后剩一层", after["nf"] == 1, after)
        check("该层照片改不分层（照片不删）", after["photoFloor"] is None, after)
        check("另一层户型完好（2 间）", after["p1rooms"] == 2, after)
        check("删后自动切剩余第一层", "一楼" in after["fname"], after)

        # ---------- 阶段六：单层口径（项5）宅乙 ----------
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (HIDB, FB))
        time.sleep(1.0)
        tap("#hpe-floorname")
        time.sleep(0.5)
        single = cdp.evaluate("({del: !!document.getElementById('hpe-fl-del'),"
                              " note: (document.getElementById('hpe-panel').textContent || '').includes('只剩这一层')})")
        check("仅剩一层：无删层钮、改注文指路清空", not single["del"] and single["note"], single)
        tap("#hpe-back")
        check("回详情卡", wait("document.getElementById('hd-fl-clear')"))
        check("详情卡单层显「清空本层户型」链、无删层钮",
              cdp.evaluate("!!document.getElementById('hd-fl-clear') && !document.getElementById('hd-fl-del')"))
        ctap("#hd-fl-clear")
        check("详情卡清空走确认弹层", wait("document.querySelector('.hd-dlg-mask')"))
        ctap("#hd-dlg-ok")
        time.sleep(0.9)
        check("详情卡清空→plan 行删除", cdp.evaluate("__wuriHouse.db.plans.get(%d).then(p => !p)" % FB))

        # ---------- 阶段七：390 顶栏复验＋三态截图 ----------
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        cdp.evaluate("__wuriPlan.open(%d, %d)" % (HID, F1))
        check("390 下编辑器打开", wait("document.querySelector('.hpe-ov')"))
        topbar("390")
        shot("08-topbar-390.png")
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
        time.sleep(0.4)
        shot("09-state-day.png")
        cdp.evaluate("document.documentElement.setAttribute('data-theme','night'); true")
        time.sleep(0.4)
        shot("10-state-night.png")
        cdp.evaluate("document.documentElement.setAttribute('data-theme','day'); document.body.classList.add('sky-red'); true")
        time.sleep(0.4)
        shot("11-state-red.png")

        errs = cdp.errors()
        check("零 JS 异常", not errs, errs[:2])
    finally:
        chrome.terminate()
    npass = sum(1 for _, c in RESULTS if c)
    print(f"\n===== {npass}/{len(RESULTS)} PASS =====")
    for n, c in RESULTS:
        if not c: print("FAIL:", n)
    return 0 if npass == len(RESULTS) else 1

if __name__ == "__main__":
    sys.exit(main())

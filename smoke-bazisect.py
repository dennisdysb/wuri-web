#!/usr/bin/env python3
"""八字晚子时流派单选排版 · 冒烟（headless Chrome + 纯 stdlib CDP，file:// 直读）。
断言：晚子时标签独行／两选项分行堆叠／圆钮同 x 左对齐／行高≥44／默认流派二仍选中／
点选流派一可切换（逻辑未动）；同页性别·历法行在 412/390 仍单行对齐；零 JS 异常。
截图：412/390 × 日/夜/红光（ sect 区块特写）。"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request

CHROME = "/opt/meta-chromium/chrome"
ROOT = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(ROOT, "www")
OUT = os.path.join(ROOT, "bazisect-shots")
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
        raise RuntimeError(method + " timeout")
    def evaluate(self, expr, await_promise=True):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": await_promise})
        res = r.get("result", {})
        if r.get("exceptionDetails"): raise RuntimeError("eval exc: " + json.dumps(r["exceptionDetails"])[:300])
        return res.get("value")
    def errors(self):
        out = []
        for m in self.events:
            if m.get("method") == "Runtime.exceptionThrown":
                d = m["params"].get("exceptionDetails", {})
                out.append((d.get("exception", {}) or {}).get("description", "")[:160])
            if m.get("method") == "Log.entryAdded" and m["params"]["entry"].get("level") == "error":
                txt = m["params"]["entry"].get("text", "")
                if "Failed to load resource" not in txt:  # file:// 沙箱环境噪音，不计
                    out.append(txt[:160])
        return out

FAILS = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(extra) if extra else ""))
    if not cond: FAILS.append(name)

GEOM_JS = """(() => {
  const inp = document.querySelector('input[name="bz-sect"]');
  const row = inp.closest('.form-row');
  const lab = row.querySelector(':scope > label');
  const radios = [...row.querySelectorAll('label.radio')];
  const R = el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2}; };
  return {
    row: R(row), lab: R(lab),
    opts: radios.map(l => ({box: R(l), dot: R(l.querySelector('input')), txt: l.textContent.trim()})),
    checked: document.querySelector('input[name="bz-sect"]:checked').value
  };
})()"""

ROWGEOM_JS = """((name) => {
  const inp = document.querySelector('input[name="' + name + '"]');
  const row = inp.closest('.form-row');
  const lab = row.querySelector(':scope > label');
  const radios = [...row.querySelectorAll('label.radio')];
  const R = el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; };
  return { lab: R(lab), opts: radios.map(l => ({box: R(l), dot: R(l.querySelector('input'))})) };
})"""

def main():
    prof = "/tmp/bazisect-profile"
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
        cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")

        def setup(width):
            cdp.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": 915, "deviceScaleFactor": 2, "mobile": True})
            cdp.call("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
            cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
            for _ in range(60):
                try:
                    if cdp.evaluate("document.readyState === 'complete' && !!window.t"): break
                except Exception: pass
                time.sleep(0.4)
            # 视图都在 #app 里：只藏 #app 的其他子节点与 tabbar，循环保活到稳定可见
            for _ in range(12):
                cdp.evaluate("""(() => {
                  document.querySelectorAll('#app > *').forEach(el => {
                    if (el.id !== 'bazi-view') el.style.display = 'none';
                  });
                  const tb = document.getElementById('tabbar'); if (tb) tb.style.display = 'none';
                  const v = document.getElementById('bazi-view'); v.hidden = false; v.style.display = 'block';
                  const inp = document.querySelector('input[name="bz-sect"]');
                  inp.closest('.form-row').scrollIntoView({block: 'center'});
                  return true;
                })()""")
                time.sleep(0.35)
                try:
                    if cdp.evaluate("(() => { const r = document.querySelector('input[name=\"bz-sect\"]').getBoundingClientRect(); return r.width > 0; })()"):
                        break
                except Exception: pass

        def shot(name):
            r = cdp.evaluate("""(() => {
              const inp = document.querySelector('input[name="bz-sect"]');
              const row = inp.closest('.form-row');
              const prev = row.previousElementSibling, next = row.nextElementSibling;
              const a = prev.getBoundingClientRect(), b = next.getBoundingClientRect();
              return {x: Math.max(0, a.x - 6), y: Math.max(0, a.y - 10), w: a.width + 12, h: (b.bottom - a.y) + 20};
            })()""")
            res = cdp.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True,
                           "clip": {"x": r["x"], "y": r["y"], "width": r["w"], "height": r["h"], "scale": 1}})
            open(os.path.join(OUT, name), "wb").write(base64.b64decode(res["data"]))

        for width in (412, 390):
            setup(width)
            g = cdp.evaluate(GEOM_JS)
            print("GEOM %d: %s" % (width, json.dumps(g, ensure_ascii=False)))
            o1, o2 = g["opts"][0], g["opts"][1]
            check("w%d 标签独行（标签底≤选项1顶+2）" % width, g["lab"]["y"] + g["lab"]["h"] <= o1["box"]["y"] + 2,
                  "labBottom=%.1f opt1Top=%.1f" % (g["lab"]["y"] + g["lab"]["h"], o1["box"]["y"]))
            check("w%d 两选项分行（选项2顶≥选项1底-2）" % width, o2["box"]["y"] >= o1["box"]["y"] + o1["box"]["h"] - 2,
                  "o1=%.1f+%.1f o2top=%.1f" % (o1["box"]["y"], o1["box"]["h"], o2["box"]["y"]))
            check("w%d 圆钮同x对齐（差≤1.5）" % width, abs(o1["dot"]["x"] - o2["dot"]["x"]) <= 1.5,
                  "x1=%.1f x2=%.1f" % (o1["dot"]["x"], o2["dot"]["x"]))
            check("w%d 选项行高≥44" % width, o1["box"]["h"] >= 44 and o2["box"]["h"] >= 44,
                  "h1=%.1f h2=%.1f" % (o1["box"]["h"], o2["box"]["h"]))
            check("w%d 默认流派二选中" % width, g["checked"] == "2", g["checked"])
            # 同页其他单选行：性别/历法应保持单行且圆钮同高对齐
            for nm in ("bz-gender", "bz-cal"):
                gg = cdp.evaluate(ROWGEOM_JS + "('%s')" % nm)
                a, b = gg["opts"][0], gg["opts"][1]
                check("w%d %s 两项同行同高" % (width, nm),
                      abs(a["box"]["y"] - b["box"]["y"]) <= 2 and abs(a["dot"]["y"] - b["dot"]["y"]) <= 2,
                      "y=%.1f/%.1f" % (a["box"]["y"], b["box"]["y"]))
            # 点选切换（逻辑未动）
            cdp.evaluate("document.querySelector('input[name=\"bz-sect\"][value=\"1\"]').closest('label').click(); true")
            time.sleep(0.3)
            check("w%d 点选可切流派一" % width, cdp.evaluate("document.querySelector('input[name=\"bz-sect\"]:checked').value") == "1")
            cdp.evaluate("document.querySelector('input[name=\"bz-sect\"][value=\"2\"]').closest('label').click(); true")
            if width == 412:
                cdp.evaluate("document.documentElement.setAttribute('data-theme','day'); document.body.classList.remove('sky-red'); true")
                shot("01-sect-day-412.png")
                cdp.evaluate("document.documentElement.setAttribute('data-theme','night'); true")
                shot("02-sect-night-412.png")
                cdp.evaluate("document.documentElement.setAttribute('data-theme','day'); document.body.classList.add('sky-red'); true")
                shot("03-sect-red-412.png")
                cdp.evaluate("document.body.classList.remove('sky-red'); true")
            else:
                shot("04-sect-day-390.png")
        errs = cdp.errors()
        check("零 JS 异常", not errs, errs[:2])
    finally:
        chrome.terminate()
    print("RESULT: %s (%d fails)" % ("ALL PASS" if not FAILS else "FAIL", len(FAILS)))
    sys.exit(1 if FAILS else 0)

if __name__ == "__main__":
    main()

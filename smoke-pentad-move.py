#!/usr/bin/env python3
"""七十二候块下移冒烟：360 档 × 日/夜/红光三态。
断言：pentad-card 紧贴 poem-card 正上方、不再位于页面上部、内容与三候选中态在、零 JS 错误。"""
import base64, hashlib, json, os, socket, struct, subprocess, sys, time, urllib.request

CHROME = "/opt/meta-chromium/chrome"
ROOT = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(ROOT, "www")
SHOTS = os.path.join(ROOT, "pentad-move-shots")
os.makedirs(SHOTS, exist_ok=True)

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]; s.close(); return p

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
            raise RuntimeError("page exception: " + json.dumps(r["exceptionDetails"])[:500])
        return r["result"].get("value")

ASSERT_JS = r"""(() => {
  const pent = document.querySelector('#pentad-card');
  const poem = document.querySelector('#poem-card');
  const sunRow = document.querySelector('#detail-sun') && document.querySelector('#detail-sun').closest('.detail-row');
  const yijis = document.querySelectorAll('#day-detail .yiji');
  const ji = yijis[yijis.length - 1];
  if (!pent || !poem) return {ok:false, why:'card missing'};
  const pr = pent.getBoundingClientRect(), mr = poem.getBoundingClientRect();
  const orderOK = (pent.compareDocumentPosition(poem) & 4) !== 0;            // poem 在 pentad 之后
  const afterSun = sunRow ? ((sunRow.compareDocumentPosition(pent) & 4) !== 0) : false; // pentad 在日躔行之后
  const afterJi  = ji ? ((ji.compareDocumentPosition(pent) & 4) !== 0) : false;          // pentad 在忌块之后
  const chips = document.querySelectorAll('#pentad-phases .pentad-chip');
  const onChips = document.querySelectorAll('#pentad-phases .pentad-chip.on');
  const gap = mr.top - pr.bottom;
  const errs = (window.__errs || []);
  return {
    ok: orderOK && afterSun && afterJi && !pent.hidden && !poem.hidden &&
        gap >= -2 && gap <= 40 && chips.length === 3 && onChips.length === 1 &&
        document.querySelector('#pentad-title').textContent.trim().length > 0 &&
        document.querySelector('#poem-card-title').textContent.trim().length > 0 &&
        errs.length === 0,
    orderOK, afterSun, afterJi, gap: Math.round(gap*10)/10,
    pentHidden: pent.hidden, poemHidden: poem.hidden,
    chips: chips.length, onChips: onChips.length,
    pentTitle: document.querySelector('#pentad-title').textContent.trim(),
    poemTitle: document.querySelector('#poem-card-title').textContent.trim(),
    theme: document.documentElement.getAttribute('data-theme'),
    red: document.body.classList.contains('sky-red'),
    errs: errs.slice(0, 3)
  };
})()"""

def run_state(name, cfg_theme, red):
    port = free_port()
    profile = "/tmp/pentad-profile-" + name
    subprocess.run(["rm", "-rf", profile])
    policy = "/tmp/hatch-webgl-policy.txt"
    with open(policy, "w") as f: f.write("hatch-webgl-all-origins-v1\n")
    sha = hashlib.sha256(open(policy, "rb").read()).hexdigest()
    chrome = subprocess.Popen([CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                               "--allow-file-access-from-files",
                               "--hatch-webgl-allowed-domains-file=" + policy,
                               "--hatch-webgl-allowed-domains-sha256=" + sha,
                               "--user-data-dir=" + profile,
                               "--remote-debugging-port=%d" % port, "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(40):
            try:
                targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
                pages = [t for t in targets if t.get("type") == "page"]
                if pages: ws_url = pages[0]["webSocketDebuggerUrl"]; break
            except Exception: pass
            time.sleep(0.5)
        assert ws_url, "chrome CDP 未就绪"
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 360, "height": 800, "deviceScaleFactor": 2, "mobile": True})
        boot = ("try{localStorage.setItem('wuri_cfg_v1', JSON.stringify({theme:'%s'}));"
                "localStorage.setItem('wuri_sky_redlight_v1', '%s');}catch(e){}"
                "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e.error||'err'))});"
                "var _ce=console.error;console.error=function(){window.__errs.push('console.error:'+Array.prototype.join.call(arguments,' '));return _ce.apply(console,arguments)};"
                % (cfg_theme, "1" if red else "0"))
        cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": boot})
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        for _ in range(40):
            if cdp.evaluate("document.readyState") == "complete": break
            time.sleep(0.5)
        time.sleep(2.0)
        cdp.evaluate("document.querySelector('[data-tab=\"tab-cal\"]').click(); true")
        time.sleep(1.2)
        res = cdp.evaluate(ASSERT_JS)
        cdp.evaluate("document.querySelector('#pentad-card').scrollIntoView({block:'center'}); true")
        time.sleep(0.6)
        shot = cdp.call("Page.captureScreenshot", {"format": "png"})
        path = os.path.join(SHOTS, "pentad-%s-360.png" % name)
        with open(path, "wb") as f: f.write(base64.b64decode(shot["data"]))
        print(("PASS " if res and res.get("ok") else "FAIL ") + name + " " + json.dumps(res, ensure_ascii=False)[:400])
        print("SHOT " + path)
        return bool(res and res.get("ok"))
    finally:
        chrome.terminate()

ok = True
ok &= run_state("day", "day", False)
ok &= run_state("night", "night", False)
ok &= run_state("red", "day", True)
print("ALL PASS" if ok else "SOME FAIL")
sys.exit(0 if ok else 1)

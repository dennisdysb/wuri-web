#!/usr/bin/env python3
"""v1.3.9 (34) 一键离线下载 · 双线线上验证（GitHub 全量 + CF 抽查）。

网络桥说明：本沙箱的 headless Chrome 无可用出口（直连/代理隧道均被沙箱拦），
故用 CDP Fetch 域拦截页面与 Service Worker 的全部请求，由 Python（有正常出口）
代取真实线上字节再 fulfill 回浏览器。浏览器执行的仍是线上原版代码、原版 SW、
真实 Cache Storage 与媒体管线；桥只替代传输层。Range 由桥按真实服务器语义切片。
"""
import base64, concurrent.futures, importlib.util, json, os, re, shutil, struct, subprocess
import sys, threading, time, urllib.request, urllib.error

def ws_send_big(sock, obj):
    """冒烟库 WS.send 只支持 16 位帧长，fulfill 大响应必炸；这里用 64 位帧长+掩码重写。"""
    data = json.dumps(obj).encode()
    ln = len(data)
    mask = os.urandom(4)
    if ln < 126:
        hdr = bytes([0x81, 0x80 | ln])
    elif ln < 65536:
        hdr = bytes([0x81, 0xFE]) + struct.pack(">H", ln)
    else:
        hdr = bytes([0x81, 0xFF]) + struct.pack(">Q", ln)
    if ln:
        rep = (mask * (ln // 4 + 1))[:ln]
        masked = (int.from_bytes(data, "big") ^ int.from_bytes(rep, "big")).to_bytes(ln, "big")
    else:
        masked = b""
    sock.sendall(hdr + mask + masked)

spec = importlib.util.spec_from_file_location("smoke_lib", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
lib = importlib.util.module_from_spec(spec); sys.modules["smoke_lib"] = lib; spec.loader.exec_module(lib)

GH = "https://dennisdysb.github.io/wuri-web/www/"
CF = "https://wuri.shengboyu.ca/"
SHOTS = os.path.expanduser("~/workspace/wuri-web/offline34-shots")
PROFILE = os.path.expanduser("~/workspace/wuri-web/.chrome-offline34")
os.makedirs(SHOTS, exist_ok=True)
BOOKS = ['s01','s02','s03','s04','s05','s07','s09','s15','s10','s12','s13','s14',
         's16','s17','s26','s27','s28','s29','s30','s31','s32','s33','s35']

RESULTS = []
def report(name, ok, extra=""):
    RESULTS.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:500]) if not ok else ""), flush=True)

def head_sums(base):
    import subprocess
    out = {}
    for v in ('female', 'male'):
        tot = 0
        for b in BOOKS:
            url = base + "audio/jing/%s_%s.mp3" % (b, v)
            n = None
            for _try in range(3):
                r = subprocess.run(["curl", "-sI", "--max-time", "30",
                                    "-A", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
                                    url], capture_output=True, text=True)
                m = re.search(r"[Cc]ontent-[Ll]ength:\s*(\d+)", r.stdout)
                if m:
                    n = int(m.group(1)); break
                time.sleep(1.5)
            assert n, "HEAD failed: " + url
            tot += n
        out[v] = tot
    out['both'] = out['female'] + out['male']
    return out

# ---------------- 线程化 CDP（支持多 session + 事件分发） ----------------
class TCDP:
    def __init__(self, ws):
        self.ws = ws
        self.i = 0
        self.lock = threading.Lock()
        self.pending = {}          # id -> (event, box)
        self.handlers = {}         # (sessionId, method) -> fn(sessionId, params)
        self.sessions = {}         # sessionId -> targetInfo
        self.page_session = None
        self.alive = True
        self.handler_pool = concurrent.futures.ThreadPoolExecutor(max_workers=6)
        self.thread = threading.Thread(target=self._reader, daemon=True)
        self.thread.start()
    def _reader(self):
        while self.alive:
            try:
                m = self.ws.recv_msg(timeout=30)
            except Exception:
                continue
            if "id" in m:
                with self.lock:
                    ent = self.pending.pop(m["id"], None)
                if ent:
                    ent[1]["msg"] = m
                    ent[0].set()
            else:
                fn = self.handlers.get((m.get("sessionId"), m.get("method")))
                if fn:
                    # 处理器里会再发 CDP 调用（如 attach 后 Fetch.enable），绝不能在读线程里同步执行
                    self.handler_pool.submit(self._run_handler, fn, m.get("sessionId"), m.get("params", {}))
    def _run_handler(self, fn, session, params):
        try: fn(session, params)
        except Exception as e: print("handler err", e, flush=True)
    def call(self, method, params=None, session=None, timeout=60):
        with self.lock:
            self.i += 1
            mid = self.i
            ev = threading.Event(); box = {}
            self.pending[mid] = (ev, box)
            msg = {"id": mid, "method": method, "params": params or {}}
            if session: msg["sessionId"] = session
            ws_send_big(self.ws.s, msg)
        if not ev.wait(timeout):
            raise RuntimeError("timeout " + method)
        m = box["msg"]
        if "error" in m:
            raise RuntimeError(method + " error: " + json.dumps(m["error"])[:300])
        return m.get("result", {})
    def on(self, method, fn, session=None):
        self.handlers[(session, method)] = fn
    def evaluate(self, expr, session=None, timeout=60):
        r = self.call("Runtime.evaluate", {"expression": expr, "awaitPromise": True,
                                           "returnByValue": True}, session=session, timeout=timeout)
        if r.get("exceptionDetails"):
            raise RuntimeError("page exception: " + json.dumps(r["exceptionDetails"])[:400])
        return r["result"].get("value")

# ---------------- Fetch 桥：Python 代取真实字节 ----------------
class Bridge:
    HOP = {"transfer-encoding", "connection", "keep-alive", "proxy-connection",
           "content-encoding", "trailer", "upgrade"}
    def __init__(self, cdp):
        self.cdp = cdp
        self.pool = concurrent.futures.ThreadPoolExecutor(max_workers=10)
        self.count = 0
    def attach(self, session):
        self.cdp.call("Fetch.enable", {"patterns": [{"urlPattern": "*"}], "handleAuthRequests": True},
                      session=session)
        self.cdp.on("Fetch.requestPaused", self._paused, session=session)
        self.cdp.on("Fetch.authRequired", lambda s, p: self.cdp.call(
            "Fetch.continueWithAuth",
            {"requestId": p["requestId"], "authChallengeResponse": {"response": "Default"}},
            session=s), session=session)
    def _curl_fetch(self, url, method, headers, data):
        import subprocess, tempfile
        last_exc = None
        for attempt in range(4):
            bodyf = hdrf = None
            try:
                fd, bodyf = tempfile.mkstemp(prefix="brg-b-"); os.close(fd)
                fd, hdrf = tempfile.mkstemp(prefix="brg-h-"); os.close(fd)
                args = ["curl", "-sS", "--max-time", "110", "-o", bodyf, "-D", hdrf]
                if method == "HEAD":
                    args.append("--head")
                elif method != "GET":
                    args += ["-X", method]
                for k, v in headers.items():
                    args += ["-H", "%s: %s" % (k, v)]
                if data:
                    args += ["--data-binary", "@-"]
                args.append(url)
                cp = subprocess.run(args, input=data, capture_output=True, timeout=130)
                if cp.returncode != 0:
                    raise RuntimeError("curl rc=%d %s" % (cp.returncode, cp.stderr[:150]))
                with open(hdrf, "rb") as f:
                    raw = f.read().decode("iso-8859-1")
                blocks = [b for b in raw.split("\r\n\r\n") if b.strip()]
                lines = blocks[-1].split("\r\n")
                status = int(lines[0].split()[1])
                rheaders = []
                for ln in lines[1:]:
                    if ": " in ln:
                        k, v = ln.split(": ", 1)
                        if k.lower() not in self.HOP:
                            rheaders.append((k, v))
                with open(bodyf, "rb") as f:
                    body = f.read()
                return status, rheaders, (b"" if method == "HEAD" else body)
            except Exception as e:
                last_exc = e
                time.sleep(0.8 + attempt)
            finally:
                for p in (bodyf, hdrf):
                    if p:
                        try: os.unlink(p)
                        except Exception: pass
        raise last_exc

    def _paused(self, session, params):
        self.pool.submit(self._serve, session, params)
    def _serve(self, session, params):
        rid = params["requestId"]
        req = params["request"]
        url = req["url"]
        method = req.get("method", "GET")
        try:
            headers = {k: v for k, v in (req.get("headers") or {}).items()
                       if k.lower() not in ("accept-encoding", "host", "content-length", "range")}
            data = None
            if method not in ("GET", "HEAD") and req.get("postData"):
                data = req["postData"].encode()
            # 传输层用 curl：urllib 经沙箱出口取 CF 的 chunked 响应会被 ~50KB 截断
            # （IncompleteRead），curl 走 HTTP/2 一直可靠；GH 线也统一走 curl。
            status, rheaders, body = self._curl_fetch(url, method, headers, data)
            # Range 语义（真实服务器均支持）：桥内切片回 206
            rng = (req.get("headers") or {}).get("Range") or (req.get("headers") or {}).get("range")
            if rng and method == "GET" and body:
                m = re.match(r"bytes=(\d*)-(\d*)", rng)
                if m:
                    total = len(body)
                    if m.group(1) == "":
                        n = int(m.group(2) or 0); start, end = max(0, total - n), total - 1
                    else:
                        start = int(m.group(1)); end = int(m.group(2)) if m.group(2) else total - 1
                        end = min(end, total - 1)
                    if start <= end and start < total:
                        part = body[start:end + 1]
                        rheaders = [(k, v) for k, v in rheaders if k.lower() != "content-length"]
                        rheaders += [("Content-Length", str(len(part))),
                                     ("Content-Range", "bytes %d-%d/%d" % (start, end, total)),
                                     ("Accept-Ranges", "bytes")]
                        self._fulfill(session, rid, 206, rheaders, part)
                        return
            self._fulfill(session, rid, status, rheaders, body)
        except urllib.error.HTTPError as e:
            try:
                body = e.read() if method != "HEAD" else b""
                hdrs = [(k, v) for k, v in e.headers.items() if k.lower() not in self.HOP]
                self._fulfill(session, rid, e.code, hdrs, body)
            except Exception:
                self._fail(session, rid)
        except Exception:
            self._fail(session, rid)
    def _fulfill(self, session, rid, status, headers, body):
        self.count += 1
        self.cdp.call("Fetch.fulfillRequest", {
            "requestId": rid, "responseCode": status,
            "responseHeaders": [{"name": k, "value": v} for k, v in headers],
            "body": base64.b64encode(body).decode()}, session=session, timeout=120)
    def _fail(self, session, rid):
        try:
            self.cdp.call("Fetch.failRequest", {"requestId": rid, "errorReason": "Failed"},
                          session=session, timeout=30)
        except Exception:
            pass

class Browser:
    def __init__(self):
        if os.path.exists(PROFILE):
            shutil.rmtree(PROFILE)
        self.port = lib.free_port()
        args = [lib.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                "--autoplay-policy=no-user-gesture-required",
                "--user-data-dir=" + PROFILE,
                "--remote-debugging-port=%d" % self.port, "about:blank"]
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ws_url = None
        for _ in range(60):
            try:
                targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % self.port, timeout=3))
                pages = [t for t in targets if t.get("type") == "page"]
                if pages:
                    ws_url = pages[0]["webSocketDebuggerUrl"]; break
            except Exception:
                pass
            time.sleep(0.5)
        assert ws_url, "chrome CDP 未就绪"
        self.cdp = TCDP(lib.ws_connect(ws_url))
        self.bridge = Bridge(self.cdp)
        # 主页面 session 即当前连接的默认 session（session=None）
        self.cdp.call("Page.enable"); self.cdp.call("Runtime.enable"); self.cdp.call("Network.enable")
        self.bridge.attach(None)
        self.cdp.on("Target.attachedToTarget", self._attached)
        self.cdp.call("Target.setAutoAttach", {"autoAttach": True, "waitForDebuggerOnStart": True, "flatten": True})
        self.cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": """
          window.__mediaEvents = []; window.__alerts = [];
          window.alert = function (m) { window.__alerts.push(String(m)); };
          (function () {
            var OA = window.Audio;
            window.Audio = function (src) {
              var a = src ? new OA(src) : new OA();
              a.addEventListener('playing', function () { window.__mediaEvents.push(['playing', a.currentSrc || a.src]); });
              a.addEventListener('error', function () { window.__mediaEvents.push(['error', a.currentSrc || a.src]); }, true);
              return a;
            };
          })();
        """})
    def _attached(self, _s, params):
        sid = params.get("sessionId")
        info = params.get("targetInfo", {})
        self.cdp.sessions[sid] = info
        try:
            if info.get("type") in ("service_worker", "worker", "page"):
                self.bridge.attach(sid)
        except Exception:
            pass
        try:
            self.cdp.call("Runtime.runIfWaitingForDebugger", {}, session=sid, timeout=10)
        except Exception:
            pass
    def ev(self, js, timeout=60):
        return self.cdp.evaluate(js, timeout=timeout)
    def nav(self, url):
        self.cdp.call("Page.navigate", {"url": url})
        for _ in range(60):
            try:
                if self.ev("document.readyState", timeout=10) == "complete":
                    break
            except Exception:
                pass
            time.sleep(0.5)
        time.sleep(1.0)
    def shot(self, name):
        r = self.cdp.call("Page.captureScreenshot", {"format": "png"})
        with open(os.path.join(SHOTS, name), "wb") as f:
            f.write(base64.b64decode(r["data"]))
    def wait(self, js, timeout=30, interval=0.7):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.ev(js, timeout=20):
                    return True
            except Exception:
                pass
            time.sleep(interval)
        return False
    def offline(self, on):
        self.cdp.call("Network.emulateNetworkConditions",
                      {"offline": on, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1})
    def close(self):
        self.cdp.alive = False
        try: self.proc.terminate()
        except Exception: pass

def wait_sw_active(b, timeout=60):
    return b.wait("""(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; })()""", timeout)

def open_me_tab(b):
    b.ev("document.querySelector('[data-tab=\"tab-me\"]').click(); true")
    time.sleep(0.6)

def open_reader(b, sid):
    b.ev("document.querySelector('[data-tab=\"tab-jing\"]').click(); true")
    time.sleep(0.8)
    if not b.wait("""!!document.querySelector('.jing-item[data-jing="%s"]')""" % sid, 20):
        return False
    b.ev("""document.querySelector('.jing-item[data-jing="%s"]').click(); true""" % sid)
    return b.wait("""!!document.querySelector('#jing-reader') && !document.querySelector('#jing-reader').hidden""", 20)

def gh_full(br):
    exp = head_sums(GH)
    print("独立 HEAD 汇总(GH): female=%d male=%d both=%d" % (exp['female'], exp['male'], exp['both']), flush=True)
    br.nav(GH)
    report("GH SW 激活", wait_sw_active(br))
    ver = br.ev("document.querySelector('[data-i18n=\"me_ver\"]').textContent")
    report("GH 关于页版本 (34)", "（34）" in ver, ver)
    # A 未激活 → 付费墙
    open_me_tab(br)
    br.ev("document.getElementById('offline-dl-btn').click(); true")
    time.sleep(0.8)
    pw = br.ev("document.getElementById('paywall').classList.contains('show')")
    report("A 未激活点按钮弹付费墙", pw)
    br.shot("01-paywall.png")
    br.ev("document.querySelector('#paywall [data-pro-act=\"close\"]').click(); true")
    time.sleep(0.4)
    # B 激活 → 弹窗三档大小
    br.ev("localStorage.setItem('wuri_pro_redeem','1'); true")
    br.nav(GH); wait_sw_active(br); open_me_tab(br)
    br.ev("document.getElementById('offline-dl-btn').click(); true")
    got = br.wait("""[...document.querySelectorAll('[data-tier-size]')].every(e => e.textContent.includes('MB'))""", 90)
    report("B 弹窗三档大小算出", got)
    sizes = br.ev("""(() => { const o = {}; document.querySelectorAll('[data-tier-size]').forEach(e => { o[e.getAttribute('data-tier-size')] = e.textContent; }); return o; })()""")
    for tier in ('female', 'male', 'both'):
        txt = sizes.get(tier, "")
        try:
            mb = float(txt.split('约')[1].split('MB')[0].strip())
            cnt = int(txt.split('·')[1].split('个')[0].strip())
        except Exception:
            mb, cnt = -1, -1
        want = exp[tier] / 1048576
        report("B %s 大小与 HEAD 一致" % tier, abs(mb - want) < 0.15 and cnt == (46 if tier == 'both' else 23),
               "%s vs %.1f MB, cnt=%s" % (txt, want, cnt))
    br.shot("02-modal.png")
    br.ev("document.getElementById('offline-close').click(); true")
    time.sleep(0.4)
    # C 小批机制
    t0 = time.time()
    okk = br.ev("WuriOffline.startKeys(['s33_female','s35_male'])", timeout=300)
    keys = br.ev("""(async () => { const c = await caches.open('wuri-offline-v1'); return (await c.keys()).map(r => r.url.split('/').pop()); })()""")
    report("C 小批机制（2 文件真下入缓存）", okk and 's33_female.mp3' in keys and 's35_male.mp3' in keys, keys)
    print("  小批耗时 %.1fs；keys=%s" % (time.time() - t0, keys), flush=True)
    br.ev("WuriOffline.deleteAll()", timeout=120)
    time.sleep(0.5)
    n = br.ev("""(async () => { const c = await caches.open('wuri-offline-v1'); return (await c.keys()).length; })()""")
    report("C 删除后缓存清空", n == 0, n)
    # D 全量女声（真实 UI）
    br.ev("document.getElementById('offline-dl-btn').click(); true")
    br.wait("""[...document.querySelectorAll('[data-tier-size]')].every(e => e.textContent.includes('MB'))""", 90)
    br.ev("""document.querySelector('input[name="offline-tier"][value="female"]').checked = true;
             document.getElementById('offline-start').click(); true""")
    time.sleep(2.0)
    fl = br.ev("""(() => { const f = document.getElementById('offline-float'); if (!f) return null;
                    const cs = getComputedStyle(f);
                    return { hidden: f.hidden, bg: cs.backgroundColor, txt: f.textContent }; })()""")
    report("D 悬浮窗出现且半透明", fl and not fl['hidden'] and 'rgba' in fl['bg'] and '0.85' in fl['bg'], fl)
    br.ev("document.querySelector('[data-tab=\"tab-home\"]').click(); true")
    time.sleep(1.2)
    br.shot("03-float-on-home.png")
    fl2 = br.ev("""(() => { const f = document.getElementById('offline-float'); return f && !f.hidden; })()""")
    report("D 切到首页悬浮窗仍可见", fl2)
    t0 = time.time()
    done = br.wait("""(() => { const s = JSON.parse(localStorage.getItem('wuri_offline_dl_v1') || 'null');
                        return s && s.status !== 'running'; })()""", 600, 2.0)
    state = br.ev("JSON.parse(localStorage.getItem('wuri_offline_dl_v1') || 'null')")
    stats = br.ev("WuriOffline.stats()", timeout=180)
    print("  女声全量耗时 %.1fs；state=%s；stats=%s" % (time.time() - t0, state, stats), flush=True)
    report("D 女声全量完成无失败", done and state and state.get('status') == 'done' and stats and stats['audioCount'] == 23,
           {"state": state, "stats": stats})
    open_me_tab(br)
    br.shot("04-downloaded-card.png")
    # E 断网
    br.offline(True)
    time.sleep(0.5)
    ok = open_reader(br, 's33')
    report("E 断网打开 s33 阅读器", ok)
    if ok:
        br.ev("""window.__mediaEvents.length = 0; window.__alerts.length = 0;
                 document.getElementById('jing-voice').value = 'female';
                 document.getElementById('jing-voice').dispatchEvent(new Event('change')); true""")
        time.sleep(0.3)
        br.ev("document.getElementById('jing-follow').click(); true")
        time.sleep(1.5)
        alerts = br.ev("window.__alerts")
        report("E 断网跟读时间码加载成功（无不可用提示）", not any('暂无分段' in a for a in alerts), alerts)
        br.ev("document.getElementById('jing-speak').click(); true")
        got_play = br.wait("""window.__mediaEvents.some(e => e[0] === 'playing' && e[1].includes('s33_female'))""", 25)
        evs = br.ev("window.__mediaEvents")
        report("E 断网播放已下女声（playing 事件）", got_play, evs)
        br.shot("05-offline-playing.png")
        br.ev("""(() => { const p = document.querySelector('#jing-content .jing-para');
                 if (p) p.click(); return !!p; })()""")
        time.sleep(1.2)
        fc = br.ev("!!document.querySelector('#jing-content .follow-cur')")
        report("E 断网跟读点段高亮", fc)
        br.ev("""window.__alerts.length = 0; const v = document.getElementById('jing-voice');
                 v.value = 'male'; v.dispatchEvent(new Event('change')); true""")
        time.sleep(0.3)
        br.ev("document.getElementById('jing-stop').click(); true")
        time.sleep(0.5)
        br.ev("document.getElementById('jing-speak').click(); true")
        time.sleep(4.0)
        alerts = br.ev("window.__alerts")
        report("E 断网未下男声给「无网络」提示", any('无网络' in a for a in alerts), alerts)
    ok36 = open_reader(br, 's36')
    tlen = br.ev("""(() => { const c = document.querySelector('#jing-content'); return c ? c.textContent.length : 0; })()""") if ok36 else 0
    report("E 断网经文正文 s36 可读（feed 文本已缓存）", ok36 and tlen > 3000, tlen)
    br.ev("document.querySelector('[data-tab=\"tab-home\"]').click(); true")
    time.sleep(0.8)
    br.ev("document.getElementById('deities-enter').click(); true")
    got_thumbs = br.wait("""[...document.querySelectorAll('#view-deities img')].filter(i => i.naturalWidth > 0).length >= 10""", 25)
    report("E 断网图鉴列表图片可见", got_thumbs)
    br.shot("06-offline-deities.png")
    br.ev("""(() => { const cell = document.querySelector('#view-deities [data-deity]');
               if (cell) cell.click(); return !!cell; })()""")
    got_full = br.wait("""[...document.querySelectorAll('#view-deity-detail img')].some(i => i.naturalWidth > 0)""", 20)
    report("E 断网图鉴详情大图可见", got_full)
    br.offline(False)
    time.sleep(0.5)
    # F 续传
    br.nav(GH); wait_sw_active(br); open_me_tab(br)
    br.ev("document.getElementById('offline-dl-btn').click(); true")
    br.wait("""[...document.querySelectorAll('[data-tier-size]')].every(e => e.textContent.includes('MB'))""", 90)
    br.ev("""document.querySelector('input[name="offline-tier"][value="male"]').checked = true;
             document.getElementById('offline-start').click(); true""")
    got3 = br.wait("""(async () => { const s = await WuriOffline.stats(); return s && s.audioCount >= 26; })()""", 300, 1.5)
    cnt_before = br.ev("WuriOffline.stats().then(s => s.audioCount)", timeout=120)
    report("F 男声已下 ≥3 个（重载前）", got3, cnt_before)
    br.cdp.call("Page.reload", {})
    time.sleep(5.0)
    resumed = br.wait("WuriOffline.isRunning()", 40)
    report("F 重载后自动续传启动", resumed)
    t0 = time.time()
    done = br.wait("""(() => { const s = JSON.parse(localStorage.getItem('wuri_offline_dl_v1') || 'null');
                        return s && s.status === 'done'; })()""", 600, 2.0)
    stats = br.ev("WuriOffline.stats()", timeout=180)
    print("  续传至完成耗时 %.1fs；stats=%s" % (time.time() - t0, stats), flush=True)
    report("F 续传完成（46 个音频齐全）", done and stats and stats['audioCount'] == 46, stats)
    # G 删除
    open_me_tab(br)
    br.shot("07-both-done-card.png")
    br.ev("document.getElementById('offline-del-btn').click(); true")
    time.sleep(1.5)
    stats = br.ev("WuriOffline.stats()", timeout=180)
    stxt = br.ev("document.getElementById('offline-status').textContent")
    report("G 删除后占用归零", stats and stats['audioCount'] == 0 and stats['otherCount'] == 0 and '尚未下载' in stxt,
           {"stats": stats, "txt": stxt})
    br.offline(True)
    ok = open_reader(br, 's33')
    if ok:
        br.ev("""window.__alerts.length = 0; const v = document.getElementById('jing-voice');
                 v.value = 'female'; v.dispatchEvent(new Event('change'));
                 document.getElementById('jing-speak').click(); true""")
        time.sleep(4.0)
        alerts = br.ev("window.__alerts")
        report("G 删除后断网不可播（无网络提示）", any('无网络' in a for a in alerts), alerts)
    br.offline(False)
    time.sleep(0.5)
    br.nav(GH); wait_sw_active(br)
    ok = open_reader(br, 's33')
    if ok:
        br.ev("""window.__mediaEvents.length = 0; const v = document.getElementById('jing-voice');
                 v.value = 'female'; v.dispatchEvent(new Event('change'));
                 document.getElementById('jing-speak').click(); true""")
        got_play = br.wait("""window.__mediaEvents.some(e => e[0] === 'playing' && e[1].includes('s33_female'))""", 30)
        report("G 删除后在线恢复流播", got_play)

def cf_spot(br):
    exp = head_sums(CF)
    print("独立 HEAD 汇总(CF): female=%d male=%d both=%d" % (exp['female'], exp['male'], exp['both']), flush=True)
    br.nav(CF)
    report("CF SW 激活", wait_sw_active(br))
    ver = br.ev("document.querySelector('[data-i18n=\"me_ver\"]').textContent")
    report("CF 关于页版本 (34)", "（34）" in ver, ver)
    br.ev("localStorage.setItem('wuri_pro_redeem','1'); true")
    br.nav(CF); wait_sw_active(br); open_me_tab(br)
    br.ev("document.getElementById('offline-dl-btn').click(); true")
    got = br.wait("""[...document.querySelectorAll('[data-tier-size]')].every(e => e.textContent.includes('MB'))""", 90)
    sizes = br.ev("""(() => { const o = {}; document.querySelectorAll('[data-tier-size]').forEach(e => { o[e.getAttribute('data-tier-size')] = e.textContent; }); return o; })()""")
    okk = bool(got)
    for tier in ('female', 'male', 'both'):
        txt = sizes.get(tier, "")
        try:
            mb = float(txt.split('约')[1].split('MB')[0].strip())
        except Exception:
            mb = -1; okk = False
        if abs(mb - exp[tier] / 1048576) >= 0.15:
            okk = False
    report("CF 弹窗三档大小与该线 HEAD 一致（转码文件更小）", okk, sizes)
    br.shot("08-cf-modal.png")
    br.ev("""document.querySelector('input[name="offline-tier"][value="female"]').checked = true;
             document.getElementById('offline-start').click(); true""")
    got4 = br.wait("""(async () => { const c = await caches.open('wuri-offline-v1');
                      const ks = (await c.keys()).map(r => r.url);
                      return ks.some(u => u.includes('wuri.shengboyu.ca') && u.includes('s01_female.mp3')); })()""", 300, 2.0)
    report("CF 女声开下且 s01（转码文件）入本线缓存", got4)
    br.shot("09-cf-float.png")
    br.ev("WuriOffline.deleteAll()", timeout=120)
    time.sleep(1.0)
    n = br.ev("""(async () => { const c = await caches.open('wuri-offline-v1'); return (await c.keys()).length; })()""")
    report("CF 抽查后清理缓存", n == 0, n)

def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    br = Browser()
    try:
        if which in ("gh", "all"):
            gh_full(br)
        if which in ("cf", "all"):
            cf_spot(br)
    finally:
        br.close()
    print("\n==== %d/%d PASS ====" % (sum(RESULTS), len(RESULTS)), flush=True)
    sys.exit(0 if all(RESULTS) else 1)

if __name__ == "__main__":
    main()

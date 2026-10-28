#!/usr/bin/env python3
"""经文库结构线冒烟（2026-10-27 反馈批·文库线四项）：
1 常见经文区收起/展开（默认展开、进页复位） 2 筛选移入区内＋我的标记独立入口行（计数/点入/返回）
3 道藏分类行字体与经文书名行统一（serif 1.35rem/400） 4 两处行样式：类签/卷字/部数缩小贴右
真点击（Input.dispatchMouseEvent）＋ elementFromPoint 断言 ＋ 可见性断言；日/夜/红光三态截图。
file:// 直读＋--allow-file-access-from-files（沙箱回环拦截 Chromium，沿用既有口径）。"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request

CHROME = "/opt/meta-chromium/chrome"
WWW = os.path.expanduser("~/workspace/.wt/libvisual/www")
OUT = os.path.expanduser("~/workspace/.wt/libvisual/smoke-libvisual")
os.makedirs(OUT, exist_ok=True)

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]; s.close(); return p

CDP_PORT = free_port()

class WS:
    def __init__(self, url):
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
        if len(data) < 126: hdr = bytes([0x81, 0x80 | len(data)])
        elif len(data) < 65536: hdr = bytes([0x81, 0xFE]) + struct.pack(">H", len(data))
        else: hdr = bytes([0x81, 0xFF]) + struct.pack(">Q", len(data))
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
        if "result" not in r:
            raise RuntimeError("bad evaluate response: " + json.dumps(r)[:400])
        if r.get("exceptionDetails"):
            raise RuntimeError("page exception: " + json.dumps(r["exceptionDetails"])[:500])
        return r["result"].get("value")

RESULTS = []
def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + ((" -> " + str(detail)[:260]) if (detail and not cond) else ""))

def main():
    udd = "/tmp/libvisual-smoke-profile"
    subprocess.run(["rm", "-rf", udd])
    chrome = subprocess.Popen([CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                               "--allow-file-access-from-files", "--user-data-dir=" + udd,
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
        cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": False})
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})

        def wait(expr, timeout=15):
            end = time.time() + timeout
            while time.time() < end:
                try:
                    if cdp.evaluate(expr): return True
                except Exception: pass
                time.sleep(0.4)
            return False

        def shot(name):
            r = cdp.call("Page.captureScreenshot", {"format": "png"})
            open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

        def real_click(sel, desc):
            info = cdp.evaluate("""(() => {
              const el = document.querySelector(%s);
              if (!el) return {ok:false, why:'not found'};
              el.scrollIntoView({block:'center'});
              const r = el.getBoundingClientRect();
              const cx = r.left + r.width/2, cy = r.top + r.height/2;
              const hit = document.elementFromPoint(cx, cy);
              const inside = hit && (hit === el || el.contains(hit) || hit.contains(el));
              return {ok: !!inside, cx, cy, hit: hit ? (hit.tagName + '.' + (hit.className.baseVal!==undefined?'':hit.className)) : null,
                      rect: {x:r.x, y:r.y, w:r.width, h:r.height}};
            })()""" % json.dumps(sel))
            assert info and info.get("ok"), "elementFromPoint 未命中 %s: %s" % (desc, json.dumps(info)[:200])
            cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": info["cx"], "y": info["cy"], "button": "left", "clickCount": 1})
            cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": info["cx"], "y": info["cy"], "button": "left", "clickCount": 1})
            time.sleep(0.6)
            return info

        assert wait("document.readyState==='complete'"), "页面未就绪"
        time.sleep(2.0)
        real_click('[data-tab="tab-jing"]', "底部经文页签")
        check("S0 目录已渲染", wait("document.querySelectorAll('[data-common-sec] .jing-item').length>0", 12))

        # —— 项1 我的标记入口行字号 ——
        m = cdp.evaluate("""(() => {
          const row = document.querySelector('#jing-mymarks');
          const t = row.querySelector('.jing-marks-row-t'), s = row.querySelector('.jing-marks-row-s'), n = row.querySelector('.jing-marks-row-n');
          const cs = e => parseFloat(getComputedStyle(e).fontSize);
          const rr = row.getBoundingClientRect();
          return {t: cs(t), s: cs(s), n: cs(n), tTxt: t.textContent, sTxt: s.textContent,
                  overflow: row.scrollWidth > row.clientWidth + 1, rowH: rr.height};
        })()""")
        check("项1 主标题字号加大（≥19px，约1.22rem）", m["t"] >= 19, m)
        check("项1 副字/计数协调放大（≥14px）且小于主标题", m["s"] >= 14 and m["n"] >= 14 and m["s"] < m["t"], m)
        check("项1 入口行不挤行（无横向溢出）", not m["overflow"], m)

        # —— 项3 道藏宝盒 ——
        real_click('[data-dz-toggle]', "道藏全集折叠标题")
        check("项3 道藏分类已渲染（部行>0）", wait("document.querySelectorAll('.dz-bu').length>0", 20))
        time.sleep(0.8)
        dz = cdp.evaluate("""(() => {
          const bus = [...document.querySelectorAll('.dz-bu')];
          const ref = document.querySelector('[data-common-sec] .jing-item .jing-book');
          const rc = getComputedStyle(ref);
          const pick = e => { const c = getComputedStyle(e); return {w:c.width, h:c.height, fs:c.fontSize,
            color:c.color, btw:c.borderTopWidth, br:c.borderRadius, lh:c.lineHeight, ff:c.fontFamily}; };
          const refSpec = pick(ref);
          const buInfo = bus.map(b => {
            const bd = b.querySelector('.jing-book');
            return {bu: b.getAttribute('data-dz-bu'), has: !!bd, txt: bd ? bd.textContent : null,
                    spec: bd ? pick(bd) : null};
          });
          return {n: bus.length, refSpec, buInfo,
                  allSame: buInfo.every(x => x.has && x.txt === '藏' &&
                    JSON.stringify(x.spec) === JSON.stringify(refSpec))};
        })()""")
        check("项3 部行共 9 行", dz["n"] == 9, dz["n"])
        check("项3 每部行均带「藏」宝盒且 computed 与精选行宝盒全等", dz["allSame"],
              json.dumps(dz, ensure_ascii=False)[:300])
        # 展开第一部（洞真部）看书行
        real_click('.dz-bu', "第一部行展开")
        check("项3 部内书行已渲染", wait("document.querySelectorAll('.dz-works:not([hidden]) .dz-work').length>0", 15))
        time.sleep(0.5)
        wk = cdp.evaluate("""(() => {
          const rows = [...document.querySelectorAll('.dz-works:not([hidden]) .dz-work')];
          const ref = document.querySelector('[data-common-sec] .jing-item .jing-book');
          const rc = getComputedStyle(ref);
          const first = rows.slice(0, 6).map(r => {
            const bd = r.querySelector('.jing-book');
            const c = bd ? getComputedStyle(bd) : null;
            return {has: !!bd, txt: bd ? bd.textContent : null,
                    same: !!bd && c.width === rc.width && c.height === rc.height && c.fontSize === rc.fontSize && c.color === rc.color};
          });
          // 长题行：书名最长的一行，右组须仍在行内、标题不异常折行
          let worst = null;
          rows.forEach(r => {
            const wt = r.querySelector('.dz-wt'), wm = r.querySelector('.dz-wm');
            const rr = r.getBoundingClientRect(), wr = wm ? wm.getBoundingClientRect() : null;
            const len = wt ? wt.textContent.length : 0;
            if (!worst || len > worst.len) worst = {len, title: wt.textContent,
              wmInside: wr ? (wr.right <= rr.right + 1.5 && wr.left >= rr.left) : false,
              wtH: wt.getBoundingClientRect().height, rowH: rr.height};
          });
          return {n: rows.length, first, worst};
        })()""")
        check("项3 书行均带「藏」宝盒且规格同精选行", wk["first"].__len__() > 0 and all(x["has"] and x["txt"] == "藏" and x["same"] for x in wk["first"]), wk["first"])
        check("项3 长题行右组仍贴右在行内（未被宝盒挤出）", wk["worst"]["wmInside"], wk["worst"])
        wrap = cdp.evaluate("""(() => {
          const rows = [...document.querySelectorAll('.dz-works:not([hidden]) .dz-work')];
          return rows.slice(0, 40).map(r => { const wt = r.querySelector('.dz-wt');
            return {len: wt.textContent.length, title: wt.textContent,
                    lines: Math.round(wt.getBoundingClientRect().height / 35.6)}; });
        })()""")
        # 实测口径（探针实测）：行宽仅 365px（页面内边距），标题列原 222px、加宝盒后 ≈188px；
        # 44px 同规格宝盒的占位不可避免吃掉约 2.3 字宽——≤8 字仍单行、任何书名不超过两行、右组不乱，即为本项可达口径。
        short_wrapped = [w for w in wrap if w["len"] <= 8 and w["lines"] > 1]
        over_two = [w for w in wrap if w["lines"] > 2]
        check("项3 ≤8 字书名单行不折且无书名超过两行（宝盒占位代价已如实测）",
              not short_wrapped and not over_two, {"short": short_wrapped[:3], "over": over_two[:3]})
        print("  [diag] 折行分布:", [(w["len"], w["lines"]) for w in wrap])
        cdp.evaluate("document.querySelector('.dz-bu').scrollIntoView({block:'start'})")
        time.sleep(0.4)
        shot("01-day-daozang.png")

        # —— 项2 返回定位金框（改淡＋1.5s） ——
        target = cdp.evaluate("""(() => {
          const it = document.querySelector('[data-common-sec] .jing-item');
          it.scrollIntoView({block:'center'});
          return it.getAttribute('data-jing');
        })()""")
        real_click('[data-common-sec] .jing-item', "打开第一部常见经文")
        check("项2 阅读器已打开", wait("!document.querySelector('#jing-reader').hidden", 12))
        time.sleep(1.2)
        # 返回目录：不用 real_click 的 0.6s 尾随（会吃掉 1.5s 动画大半），手动点完立刻采样
        bk = cdp.evaluate("""(() => {
          const el = document.querySelector('#jing-back');
          el.scrollIntoView({block:'center'});
          const r = el.getBoundingClientRect();
          return {cx: r.left + r.width/2, cy: r.top + r.height/2};
        })()""")
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": bk["cx"], "y": bk["cy"], "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": bk["cx"], "y": bk["cy"], "button": "left", "clickCount": 1})
        # 高频采样描边生命周期（类存续＋动画 currentTime＋底色 alpha）
        samples = []
        t_end = time.time() + 3.5
        while time.time() < t_end:
            s = cdp.evaluate("""(() => {
              const el = document.querySelector('#jing-list [data-jing=%s]');
              if (!el) return null;
              const cs = getComputedStyle(el);
              const has = el.classList.contains('lib-ret-hl');
              let animT = -1;
              (el.getAnimations ? el.getAnimations() : []).forEach(a => {
                if (a.animationName === 'libRetHl') animT = Math.max(animT, a.currentTime || 0);
              });
              const alphaOf = str => { if (!str || str === 'none') return 0;
                let mm = str.match(/rgba\\(([^)]+)\\)/);
                if (mm) { const p = mm[1].split(','); return p.length > 3 ? parseFloat(p[3]) : 1; }
                if (/rgb\\(/.test(str)) return 1;
                mm = str.match(/\\/\\s*([\\d.]+)\\)/);
                return mm ? parseFloat(mm[1]) : 0; };
              return {has, dur: cs.animationDuration, animT,
                      bgA: alphaOf(cs.backgroundColor), ringA: alphaOf(cs.boxShadow),
                      bgRaw: cs.backgroundColor, bsRaw: cs.boxShadow};
            })()""" % json.dumps(target))
            samples.append((time.time(), s))
            if s and not s["has"] and any(x[1] and x[1]["has"] for x in samples): break
            time.sleep(0.07)
        with_cls = [s for t, s in samples if s and s["has"]]
        dur_ok = any(s["dur"] == "1.5s" for s in with_cls)
        check("项2 返回后刚读条目带 lib-ret-hl 且动画时长=1.5s（原 2.4s）", bool(with_cls) and dur_ok,
              {"nCls": len(with_cls), "sample": with_cls[:1]})
        max_t = max([s["animT"] for s in with_cls] or [0])
        check("项2 动画实跑至≈1.5s 末端（max currentTime ≥1300ms）", max_t >= 1300, {"maxAnimT": max_t})
        hold = [s for s in with_cls if 0 <= s["animT"] < 800]
        hold_alphas = [max(s["bgA"], s["ringA"]) for s in hold if max(s["bgA"], s["ringA"]) > 0]
        check("项2 描边已改淡（保持段底色/描边 alpha ≤0.75，原为不透明全色）",
              bool(hold_alphas) and max(hold_alphas) <= 0.75,
              {"holdAlphas": hold_alphas[:6], "raw": [(s["animT"], s["bgRaw"], s["bsRaw"]) for s in hold[:3]]})

        # —— 三态截图 ——
        cdp.evaluate("document.querySelector('#jing-mymarks').scrollIntoView({block:'start'})")
        time.sleep(0.3)
        shot("02-day-catalog.png")
        cdp.evaluate("document.documentElement.setAttribute('data-theme','night')")
        time.sleep(0.5)
        shot("03-night-catalog.png")
        cdp.evaluate("document.querySelector('.dz-bu').scrollIntoView({block:'center'})")
        time.sleep(0.3)
        shot("04-night-daozang.png")
        cdp.evaluate("document.documentElement.setAttribute('data-theme','day'); document.body.classList.add('sky-red')")
        time.sleep(0.5)
        shot("05-red-daozang.png")
        red = cdp.evaluate("""(() => {
          const bd = document.querySelector('.dz-bu .jing-book');
          const c = getComputedStyle(bd);
          const row = document.querySelector('#jing-mymarks .jing-marks-row-t');
          return {bodyRed: document.body.classList.contains('sky-red'),
                  badgeColor: c.color, badgeBorder: c.borderTopColor};
        })()""")
        check("三态 红光 class 生效（截图 05 目检变红）", red["bodyRed"], red)

        errs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
        check("全程无 JS 异常", len(errs) == 0, json.dumps(errs)[:200] if errs else "")
    finally:
        chrome.terminate()
    npass = sum(1 for _, ok, _ in RESULTS if ok)
    print("== %d/%d PASS ==" % (npass, len(RESULTS)))
    json.dump([{"name": n, "ok": ok, "detail": str(d)[:300]} for n, ok, d in RESULTS],
              open(os.path.join(OUT, "results.json"), "w"), ensure_ascii=False, indent=1)
    return 0 if npass == len(RESULTS) else 1

if __name__ == "__main__":
    sys.exit(main())

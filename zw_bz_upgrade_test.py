#!/usr/bin/env python3
"""紫微＋八字双升级 CDP 冒烟（file:// 直读，不起 http.server；沙箱 Chromium 回环限制见 AGENTS.md）。

覆盖：
- 八字基线：1986-11-07 08:00 四柱与 lunar 引擎直算一致（默认流派2＝升级前现状）
- 八字新功能：命宫/身宫/胎元行、五行力量条（百分比与引擎复算一致且可见）、
  称骨（分项/总重/歌诀与引擎＋称骨表复算一致）、晚子时流派切换（23:30 日柱 丙寅→丁卯 即时重排）、
  流月 12 段（节气精确分段）＋流日（点段展开、含今日标记、立春段 29 天）
- 紫微回归：命宫格＝乙未·命宫、运限流年层（流年命宫高亮 1、运限宫名 12、流耀、运限四化信息行）、
  点命宫三方四正（sel 1 / 三方 3）、飞化信息行
- 全站回归：六爻视图可开、图鉴视图可开、日历日格渲染；全程 JS 异常收集
- 390×844 截图留档 zwbz-shots/
期望值由 lunar 引擎直算＋从 bazi.js 抽称骨表复算（同源脚本 /tmp/bz-expect.js），内嵌于 EXP。
用法：python3 zw_bz_upgrade_test.py
"""
import base64, json, os, shutil, socket, struct, subprocess, sys, time, urllib.request

CHROME = "/opt/meta-chromium/chrome"
ROOT = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.join(ROOT, "www", "index.html")
SHOTS = os.path.join(ROOT, "zwbz-shots")

EXP = {
    "A_pillars": ["丙寅", "戊戌", "乙卯", "庚辰"],
    "A_ming": "辛卯", "A_shen": "辛卯", "A_taiyuan": "己丑",
    "A_wx": [34, 17, 32, 14, 3],
    "A_cg_parts": ["6钱", "8钱", "1两5钱", "9钱"],
    "A_cg_total": "3两8钱",
    "A_cg_song": "一身骨肉最清高，早入簧门姓氏标；待到年将三十六，蓝衫脱去换红袍。",
    "B_day_sect2": "丙寅", "B_day_sect1": "丁卯",
    "SEG_lichun_days": 29, "SEG_hanlu_days": 30,
}

FAILS = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not cond:
        FAILS.append(name)

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

class WS:
    def __init__(self, url):
        rest = url[5:]
        hostport, path = rest.split("/", 1)
        host, port = hostport.split(":")
        self.sock = socket.create_connection((host, int(port)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        req = ("GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n") % (path, hostport, key)
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk: raise RuntimeError("ws handshake failed")
            buf += chunk
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
    def _fill(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk: raise RuntimeError("ws closed")
            self.buf += chunk
    def recv_msg(self):
        payload = b""
        while True:
            self._fill(2)
            b0, b1 = self.buf[0], self.buf[1]; self.buf = self.buf[2:]
            fin = b0 & 0x80; ln = b1 & 0x7F
            if ln == 126:
                self._fill(2); ln = struct.unpack(">H", self.buf[:2])[0]; self.buf = self.buf[2:]
            elif ln == 127:
                self._fill(8); ln = struct.unpack(">Q", self.buf[:8])[0]; self.buf = self.buf[8:]
            self._fill(ln); data = self.buf[:ln]; self.buf = self.buf[ln:]
            payload += data
            if fin: return payload.decode("utf-8", "replace")
    def send(self, obj):
        data = json.dumps(obj).encode()
        mask = os.urandom(4)
        ln = len(data)
        if ln < 126: hdr = bytes([0x81, 0x80 | ln])
        elif ln < 65536: hdr = bytes([0x81, 0xFE]) + struct.pack(">H", ln)
        else: hdr = bytes([0x81, 0xFF]) + struct.pack(">Q", ln)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(hdr + mask + masked)

class CDP:
    def __init__(self, ws):
        self.ws = ws; self.i = 0
    def call(self, method, params=None, timeout=30):
        self.i += 1; mid = self.i
        self.ws.send({"id": mid, "method": method, "params": params or {}})
        t0 = time.time()
        while time.time() - t0 < timeout:
            msg = json.loads(self.ws.recv_msg())
            if msg.get("id") == mid: return msg
        raise TimeoutError(method)
    def ev(self, expr):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        res = r.get("result", {}).get("result", {})
        if "exceptionDetails" in r.get("result", {}):
            return {"__exc__": str(r["result"]["exceptionDetails"])[:400]}
        return res.get("value")

def boot(cdp):
    before = cdp.ev("window.__bootMark || 0")
    cdp.call("Page.navigate", {"url": PAGE})
    # 等新文档就绪：__bootMark 由 addScriptToEvaluateOnNewDocument 在每个新文档注入新随机值，
    # 避免把导航前的旧页面误判为已就绪（沙箱加载慢，固定睡眠不可靠）
    for _ in range(100):
        ok = cdp.ev("window.__bootMark && window.__bootMark !== %r"
                    " && document.readyState === 'complete' && typeof window.WuriPro !== 'undefined'"
                    " && typeof window.Bazi !== 'undefined' && typeof window.iztro !== 'undefined'" % (before,))
        if ok is True:
            return
        time.sleep(0.5)
    raise RuntimeError("页面就绪超时")

def main():
    os.makedirs(SHOTS, exist_ok=True)
    port = free_port()
    prof = "/tmp/zwbz-profile"
    shutil.rmtree(prof, ignore_errors=True)
    chrome = subprocess.Popen([CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                               "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
                               "--window-size=500,1100", "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(60):
            try:
                with urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=2) as f:
                    pages = json.load(f)
                for p in pages:
                    if p.get("type") == "page":
                        ws_url = p["webSocketDebuggerUrl"]; break
                if ws_url: break
            except Exception:
                time.sleep(0.5)
        assert ws_url, "CDP 未就绪"
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source":
            "window.__bootMark = Math.random();"
            "window.__errs=[]; window.addEventListener('error', function(e){ window.__errs.push(String(e.message||e.type)); });"})
        boot(cdp)
        cdp.ev("localStorage.setItem('wuri_pro_redeem','1'); 'ok'")
        boot(cdp)

        # ---------- 八字 A 盘 ----------
        cdp.ev("document.getElementById('bazi-enter').click(); 'x'"); time.sleep(0.6)
        check("八字视图打开", cdp.ev("!document.getElementById('bazi-view').hidden"))
        check("晚子时默认流派2（现状）", cdp.ev(
            "document.querySelector('input[name=\"bz-sect\"][value=\"2\"]').checked"))
        cdp.ev("""(() => {
          document.getElementById('bz-date').value = '1986-11-07';
          document.getElementById('bz-time').value = '08:00';
          document.querySelector('input[name="bz-gender"][value="1"]').checked = true;
          document.getElementById('bz-true').checked = false;
          document.getElementById('bz-save').checked = false;
          document.getElementById('bz-go').click(); return 'go'; })()""")
        time.sleep(1.0)
        check("八字结果页可见", cdp.ev("!document.getElementById('bz-tab-result').hidden"))
        pillars = cdp.ev("""(() => { const trs = document.querySelectorAll('.bz-table tr');
          const g = trs[2].querySelectorAll('td'), z = trs[3].querySelectorAll('td');
          return [3,4,5,6].map(i => g[i].textContent + z[i].textContent); })()""")
        check("A 四柱基线不变", pillars == EXP["A_pillars"], pillars)
        yuninfo = cdp.ev("Array.from(document.querySelectorAll('.bz-yun-info')).map(e => e.textContent).join(' | ')")
        check("命宫/身宫/胎元行", ("命宫 " + EXP["A_ming"]) in str(yuninfo)
              and ("身宫 " + EXP["A_shen"]) in str(yuninfo) and ("胎元 " + EXP["A_taiyuan"]) in str(yuninfo), yuninfo)
        wxrows = cdp.ev("""(() => Array.from(document.querySelectorAll('.bz-wxp-row')).map(r => ({
          pct: parseInt(r.querySelector('.bz-wxp-pct').textContent, 10),
          barW: r.querySelector('.bz-wxp-bar i').getBoundingClientRect().width,
          barBoxW: r.querySelector('.bz-wxp-bar').getBoundingClientRect().width })))()""")
        check("五行力量 5 行", isinstance(wxrows, list) and len(wxrows) == 5, wxrows)
        if isinstance(wxrows, list) and len(wxrows) == 5:
            check("五行百分比＝引擎复算", [r["pct"] for r in wxrows] == EXP["A_wx"], [r["pct"] for r in wxrows])
            check("五行条可见（宽度>0）", all(r["barBoxW"] > 50 and r["barW"] >= 0 for r in wxrows))
        cgparts = cdp.ev("Array.from(document.querySelectorAll('.bz-cg-part')).map(e => e.textContent)")
        check("称骨分项", isinstance(cgparts, list) and len(cgparts) == 4
              and all(EXP["A_cg_parts"][i] in cgparts[i] for i in range(4)), cgparts)
        check("称骨总重", EXP["A_cg_total"] in str(cdp.ev("document.querySelector('.bz-cg-total').textContent")))
        check("称骨歌诀", cdp.ev("document.querySelector('.bz-cg-song').textContent") == EXP["A_cg_song"])

        # ---------- 流月 / 流日 ----------
        found = cdp.ev("""(() => { const dys = document.querySelectorAll('.bz-dy-cell');
          for (let i = 0; i < dys.length; i++) { dys[i].click();
            const c = document.querySelector('.bz-ly-cell[data-y="2026"]');
            if (c) { c.click(); return true; } } return false; })()""")
        time.sleep(0.5)
        check("流年 2026 可选", found is True)
        check("流月 12 段", cdp.ev("document.querySelectorAll('.bz-lym-cell').length") == 12)
        check("流月默认选中 1 段", cdp.ev("document.querySelectorAll('.bz-lym-cell.sel').length") == 1)
        lr = cdp.ev("document.querySelectorAll('#bz-liuri-row td').length")
        check("流日展开（寒露段 30 天）", lr == EXP["SEG_hanlu_days"], lr)
        import datetime
        today_md = datetime.date.today().strftime("%-m/%-d")
        check("流日含今日标记", cdp.ev(
            "Array.from(document.querySelectorAll('#bz-liuri-row td')).some(td => td.textContent.indexOf('%s') >= 0 && td.textContent.indexOf('今') >= 0)" % today_md) is True)
        cdp.ev("document.querySelector('.bz-lym-cell[data-mi=\"0\"]').click(); 'x'"); time.sleep(0.4)
        lr2 = cdp.ev("document.querySelectorAll('#bz-liuri-row td').length")
        check("流日切换到立春段（29 天）", lr2 == EXP["SEG_lichun_days"], lr2)
        check("流日标题更新", "立春月" in str(cdp.ev("document.getElementById('bz-liuri-title').textContent")))

        # ---------- 晚子时流派切换 ----------
        def day_pillar():
            return cdp.ev("""(() => { const trs = document.querySelectorAll('.bz-table tr');
              return trs[2].querySelectorAll('td')[5].textContent + trs[3].querySelectorAll('td')[5].textContent; })()""")
        cdp.ev("document.querySelector('[data-bztab=\"input\"]').click(); 'x'"); time.sleep(0.4)
        cdp.ev("""(() => {
          document.getElementById('bz-date').value = '1990-01-01';
          document.getElementById('bz-time').value = '23:30';
          document.querySelector('input[name="bz-sect"][value="2"]').click();
          document.getElementById('bz-go').click(); return 'go'; })()""")
        time.sleep(0.8)
        check("流派2 晚子时日柱（现状）", day_pillar() == EXP["B_day_sect2"], day_pillar())
        cdp.ev("document.querySelector('[data-bztab=\"input\"]').click(); 'x'"); time.sleep(0.4)
        cdp.ev("""(() => {
          document.querySelector('input[name="bz-sect"][value="1"]').click();
          document.getElementById('bz-go').click(); return 'go'; })()""")
        time.sleep(0.8)
        check("流派1 晚子时日柱（归次日）", day_pillar() == EXP["B_day_sect1"], day_pillar())
        cdp.ev("document.querySelector('[data-bztab=\"input\"]').click(); 'x'"); time.sleep(0.4)
        check("流派选择被记住", cdp.ev("document.querySelector('input[name=\"bz-sect\"][value=\"1\"]').checked") is True)
        cdp.ev("document.getElementById('bazi-back').click(); 'x'"); time.sleep(0.4)

        # ---------- 紫微回归 ----------
        boot(cdp)
        cdp.ev("document.getElementById('ziwei-enter').click(); 'x'"); time.sleep(0.6)
        cdp.ev("document.getElementById('zw-date').value='1986-11-07'; document.getElementById('zw-time').value='08:00'; 'set'")
        cdp.ev("document.getElementById('zw-go').click(); 'go'"); time.sleep(1.2)
        ming = cdp.ev("""(() => { const cells = Array.from(document.querySelectorAll('#zw-chart .zw-cell'));
          const m = cells.find(c => (c.querySelector('.zw-pname-pro')||{}).textContent === '命宫');
          return m ? m.querySelector('.zw-gz-pro').textContent : null; })()""")
        check("紫微命宫格＝乙未", ming == "乙未", ming)
        check("紫微运限控件可见", cdp.ev("!document.getElementById('zw-horo').hidden"))
        cdp.ev("document.querySelector('[data-zw-layer=\"yearly\"]').click(); 'y'"); time.sleep(0.6)
        check("流年命宫高亮 1", cdp.ev("document.querySelectorAll('#zw-chart .zw-layer-ming').length") == 1)
        check("运限宫名 chip 12", cdp.ev("document.querySelectorAll('#zw-chart .zw-scope-name').length") == 12)
        check("流耀叠加 >0", (cdp.ev("document.querySelectorAll('#zw-chart .zw-liuyao').length") or 0) > 0)
        hi = str(cdp.ev("document.getElementById('zw-horo-info').textContent"))
        check("流年信息行（命宫落点+四化）", "流年命宫落本命" in hi and "流年四化" in hi, hi)
        cdp.ev("""(() => { const cells = Array.from(document.querySelectorAll('#zw-chart .zw-cell'));
          cells.find(c => c.querySelector('.zw-pname-pro').textContent === '命宫').click(); return 1; })()""")
        time.sleep(0.5)
        check("点宫三方四正 sel=1/三方=3", cdp.ev(
            "({sel: document.querySelectorAll('#zw-chart .zw-sel').length, sf: document.querySelectorAll('#zw-chart .zw-sanfang').length})") == {"sel": 1, "sf": 3})
        check("宫位飞化信息行", "飞化" in str(cdp.ev("document.getElementById('zw-pal-info').textContent")))
        cdp.ev("document.getElementById('ziwei-back').click(); 'x'"); time.sleep(0.4)

        # ---------- 全站回归 ----------
        boot(cdp)
        check("日历日格渲染", (cdp.ev("document.querySelectorAll('.day').length") or 0) > 20)
        cdp.ev("document.getElementById('liuyao-enter').click(); 'x'"); time.sleep(0.8)
        check("六爻视图可开", cdp.ev("!document.getElementById('view-liuyao').hidden"))
        boot(cdp)
        cdp.ev("document.getElementById('deities-enter').click(); 'x'"); time.sleep(1.2)
        check("图鉴视图可开且有内容", cdp.ev(
            "!document.getElementById('view-deities').hidden && document.getElementById('view-deities').innerText.length > 500"))
        errs = cdp.ev("window.__errs || []")
        check("全程无 JS 异常", errs == [], errs)

        # ---------- 390×844 截图 ----------
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        boot(cdp)
        cdp.ev("document.getElementById('bazi-enter').click(); 'x'"); time.sleep(0.5)
        cdp.ev("""(() => {
          document.getElementById('bz-date').value = '1986-11-07';
          document.getElementById('bz-time').value = '08:00';
          document.querySelector('input[name="bz-sect"][value="2"]').checked = true;
          document.getElementById('bz-true').checked = false;
          document.getElementById('bz-go').click(); return 'go'; })()""")
        time.sleep(1.0)
        check("截图前八字视图已开且无付费墙", cdp.ev(
            "!document.getElementById('bazi-view').hidden && !document.getElementById('paywall').classList.contains('show')"))
        shot = cdp.call("Page.captureScreenshot", {"format": "png"})
        with open(os.path.join(SHOTS, "bazi-390x844.png"), "wb") as f:
            f.write(base64.b64decode(shot["result"]["data"]))
        cdp.ev("document.getElementById('bazi-back').click(); 'x'"); time.sleep(0.4)
        cdp.ev("document.getElementById('ziwei-enter').click(); 'x'"); time.sleep(0.5)
        cdp.ev("document.getElementById('zw-date').value='1986-11-07'; document.getElementById('zw-time').value='08:00'; 'set'")
        cdp.ev("document.getElementById('zw-go').click(); 'go'"); time.sleep(1.2)
        check("截图前紫微盘已渲染且无付费墙", cdp.ev(
            "document.querySelectorAll('#zw-chart .zw-cell').length === 12 && !document.getElementById('paywall').classList.contains('show')"))
        shot = cdp.call("Page.captureScreenshot", {"format": "png"})
        with open(os.path.join(SHOTS, "ziwei-390x844.png"), "wb") as f:
            f.write(base64.b64decode(shot["result"]["data"]))
        check("截图已留档", os.path.getsize(os.path.join(SHOTS, "bazi-390x844.png")) > 10000
              and os.path.getsize(os.path.join(SHOTS, "ziwei-390x844.png")) > 10000)
    finally:
        chrome.terminate()
    print("\n==== %s ====" % ("ALL PASS" if not FAILS else "FAILURES: " + ", ".join(FAILS)))
    sys.exit(1 if FAILS else 0)

if __name__ == "__main__":
    main()

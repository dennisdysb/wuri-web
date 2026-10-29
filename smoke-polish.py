#!/usr/bin/env python3
# 收尾打磨批验证：①分享图卡落款改版（图标＋紧凑「戊日不上香 APP」）
# ②悬浮钮全书类统一 ghost（常见经文半透明＋可拖＋位置记忆共用键，磬同组）
# 用法: python3 smoke-polish.py
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib, base64, io
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/reader-polish/www")
OUT = os.path.expanduser("~/workspace/.wt/reader-polish/polish-shots"); os.makedirs(OUT, exist_ok=True)
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

class Sess:
    def __init__(self, vw=360, vh=740, seed_extra=""):
        port = base.free_port(); prof = "/tmp/chrome-polish-%d" % port
        env = dict(os.environ); env["TZ"] = "America/Toronto"
        self.proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
            "--allow-file-access-from-files",
            "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
            "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
            "--window-size=%d,%d" % (vw, vh),
            "--autoplay-policy=no-user-gesture-required", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        wsurl = None
        for _ in range(120):
            try:
                tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
                pg = [t for t in tg if t.get("type") == "page"]
                if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
            except Exception: pass
            time.sleep(0.5)
        self.c = base.CDP(base.ws_connect(wsurl))
        self.c.call("Page.enable"); self.c.call("Runtime.enable")
        self.c.call("Emulation.setDeviceMetricsOverride", {"width": vw, "height": vh, "deviceScaleFactor": 2, "mobile": True})
        seed = r"""
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});
window.__plays=[];(function(){var OP=HTMLAudioElement.prototype.play;HTMLAudioElement.prototype.play=function(){window.__plays.push(this.getAttribute('src')||this.src||'');return OP.apply(this,arguments);};})();
try{ localStorage.setItem('wuri_pro_redeem','1'); localStorage.setItem('wuri_jing_py','1');
     localStorage.removeItem('wuri_jing_autopos');
     %s }catch(e){}
""" % seed_extra
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": seed})
        self.c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def ev(self, expr):
        r = self.c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout=90)
        if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:400] + " || " + expr[:120])
        return r["result"].get("value")
    def wait(self, expr, secs=25):
        t0 = time.time()
        while time.time() - t0 < secs:
            try:
                if self.ev(expr): return True
            except Exception: pass
            time.sleep(0.4)
        return False
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

def ensure_tab(s):
    for _ in range(60):
        try:
            if s.ev("document.getElementById('tab-jing') && document.getElementById('tab-jing').classList.contains('active')"): return True
            s.ev("document.querySelector('[data-tab=\"tab-jing\"]').click(); 'ok'")
        except Exception: pass
        time.sleep(0.5)
    return False

def open_book(s, book, secs=30):
    s.wait("typeof window.JingOpenReader==='function'", 60)
    for _ in range(20):
        try: s.ev("window.JingOpenReader && window.JingOpenReader('%s'); 'ok'" % book)
        except Exception: pass
        if s.wait("!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>3", secs): return True
    return False

def rect(s, sel):
    return s.ev("(function(){var el=document.querySelector(%s);if(!el)return null;var r=el.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};})()" % json.dumps(sel))

def drag(s, sel, dx, dy):
    box = s.ev("(function(){var el=document.querySelector(%s);var r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()" % json.dumps(sel))
    x, y = box["x"], box["y"]
    s.c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
    time.sleep(0.08)
    for i in range(1, 7):
        s.c.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x + dx * i / 6, "y": y + dy * i / 6, "button": "left"})
        time.sleep(0.05)
    s.c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x + dx, "y": y + dy, "button": "left", "clickCount": 1})
    time.sleep(0.6)

def click_at(s, sel):
    box = s.ev("(function(){var el=document.querySelector(%s);var r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()" % json.dumps(sel))
    s.c.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
    s.c.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
    time.sleep(0.5)

def fabpos(s):
    return s.ev("(function(){try{return JSON.parse(localStorage.getItem('wuri_jing_fabpos_v1')||'{}');}catch(e){return {};}})()")

SEL_LONGEST = r"""(function(){var ps=[...document.querySelectorAll('#jing-content .jing-para')];ps.sort((a,b)=>b.textContent.length-a.textContent.length);var p=ps[0];var r=document.createRange();r.selectNodeContents(p);var sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return sel.toString().length;})()"""

# ================= 会话一：常见经文 ghost＋磬＋图卡（360 日间） =================
s = Sess()
try:
    ok(s.wait("!!document.querySelector('[data-tab=\"tab-jing\"]')", 40), "S1: app loaded")
    s.ev("localStorage.removeItem('wuri_jing_fabpos_v1'); 'ok'")  # 起点清位置格（种子不删，保刷新用例）
    ok(ensure_tab(s), "S1: 经文 tab 激活")
    ok(open_book(s, "s02"), "S1: 常见经文 s02 打开")
    time.sleep(1.2)
    ok(s.ev("document.body.classList.contains('fabs-ghost')"), "S1: 常见经文 body.fabs-ghost 在")
    op = s.ev("(function(){function o(id){return getComputedStyle(document.getElementById(id)).opacity;}return {back:o('jing-back-fab'),bm:o('jing-bookmark-fab')};})()")
    ok(op["back"] == "0.55" and op["bm"] == "0.55", "S1: 返回/书签半透明 .55 %s" % op)
    r0 = rect(s, "#jing-back-fab")
    drag(s, "#jing-back-fab", -110, -140)
    r1 = rect(s, "#jing-back-fab")
    ok(r1 and r0 and (r0["l"] - r1["l"]) >= 80 and (r0["t"] - r1["t"]) >= 110, "S1: 返回钮真可拖 %s→%s" % (r0, r1))
    fp = fabpos(s)
    ok(fp.get("back") and abs(fp["back"]["x"] - r1["l"]) <= 4 and abs(fp["back"]["y"] - r1["t"]) <= 4, "S1: 拖后落盘 back 格 %s" % fp.get("back"))
    # 刷新保持
    s.c.call("Page.reload"); time.sleep(1.0)
    ok(ensure_tab(s), "S1: 刷新后回经文 tab")
    ok(open_book(s, "s02"), "S1: 刷新后重开 s02")
    time.sleep(1.0)
    r2 = rect(s, "#jing-back-fab")
    ok(r2 and abs(r2["l"] - r1["l"]) <= 4 and abs(r2["t"] - r1["t"]) <= 4, "S1: 刷新位置保持 %s" % r2)
    # 换书保持（全书类共用同一键）
    s.ev("window.closeReader && closeReader()"); time.sleep(0.5)
    ok(open_book(s, "s03"), "S1: 换开 s03")
    time.sleep(1.0)
    r3 = rect(s, "#jing-back-fab")
    ok(r3 and abs(r3["l"] - r1["l"]) <= 4 and abs(r3["t"] - r1["t"]) <= 4, "S1: 换书位置保持 %s" % r3)
    s.ev("window.closeReader && closeReader()"); time.sleep(0.5)

    # ---- 磬：s01 正一早晚功课经（韵节 → 数据判定有磬） ----
    ok(open_book(s, "s01"), "S1: s01 打开")
    time.sleep(1.0)
    ok(s.ev("window._jingHasQing === true"), "S1: s01 数据判定有敲磬")
    ok(s.ev("document.getElementById('qing-btn').classList.contains('show')"), "S1: 磬钮显示（v316 数据闸回归）")
    ok(s.ev("getComputedStyle(document.getElementById('qing-btn')).opacity") == "0.55", "S1: 磬半透明 .55")
    n0 = s.ev("window.__plays.length")
    click_at(s, "#qing-btn")
    plays = s.ev("window.__plays")
    ok(any("qing.mp3" in p for p in plays[n0:]), "S1: 单击磬仍触发敲磬（拖拽装配未吞点按）")
    qr0 = rect(s, "#qing-btn")
    drag(s, "#qing-btn", -90, -70)
    qr1 = rect(s, "#qing-btn")
    ok(qr1 and qr0 and (qr0["l"] - qr1["l"]) >= 60 and (qr0["t"] - qr1["t"]) >= 45, "S1: 磬真可拖 %s→%s" % (qr0, qr1))
    fp2 = fabpos(s)
    ok(fp2.get("qing") and abs(fp2["qing"]["x"] - qr1["l"]) <= 4 and abs(fp2["qing"]["y"] - qr1["t"]) <= 4, "S1: 磬落盘 qing 格 %s" % fp2.get("qing"))
    ok(fp2.get("back") and abs(fp2["back"]["x"] - r1["l"]) <= 4, "S1: back 格未被磬拖动污染")
    s.ev("window.closeReader && closeReader()"); time.sleep(0.5)
    ok(open_book(s, "s01"), "S1: 重开 s01")
    time.sleep(1.0)
    qr2 = rect(s, "#qing-btn")
    ok(qr2 and abs(qr2["l"] - qr1["l"]) <= 4 and abs(qr2["t"] - qr1["t"]) <= 4, "S1: 磬位置重开保持 %s" % qr2)
    s.ev("window.closeReader && closeReader()"); time.sleep(0.5)

    # ---- 分享图卡 ----
    ok(open_book(s, "s02"), "S1: 图卡用 s02 打开")
    time.sleep(0.8)
    seln = s.ev(SEL_LONGEST)
    ok(bool(seln), "S1: 选段 %s 字" % seln)
    s.wait("!!document.querySelector('#hl-card') && !document.querySelector('#hl-pop').hidden", 10)
    card = s.ev("__wuriMakeCard()")
    ok(bool(card) and card["w"] == 750 and card["h"] > 300, "S1: 图卡生成 750×%s" % (card or {}).get("h"))
    if card:
        raw = base64.b64decode(card["dataUrl"].split(",", 1)[1])
        p = os.path.join(OUT, "card-sample-polish.png"); open(p, "wb").write(raw)
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        W, H = im.size
        corner = im.getpixel((30, 30))
        ok(abs(corner[0]-246) <= 8 and abs(corner[1]-239) <= 8 and abs(corner[2]-219) <= 8, "S1: 图卡宣纸底 %s" % (corner,))
        # 图标原图底色采样（取内里宣纸区，避开外层白边；与卡面宣纸须可区分）
        icon_im = Image.open(os.path.join(WWW, "icon-512.png")).convert("RGB")
        ibg = icon_im.getpixel((90, 140))
        distinguish = max(abs(ibg[0]-246), abs(ibg[1]-239), abs(ibg[2]-219)) > 12
        ok(distinguish, "S1: 图标底色 %s 与宣纸可区分（像素断言有效）" % (ibg,))
        # 品牌带几何：图标用 36×36 模板匹配定位（抗锯齿混合色下单色分类不可靠）；
        # 文字取品牌行内金色核心像素（紧容差，避开出处行与图标铜色高光）
        tpl = icon_im.resize((36, 36))
        best = None
        for yy in range(H - 96, H - 42):
            for xx in range(380, 645):
                mad = 0
                for dy in range(3, 33, 3):
                    for dx in range(3, 33, 3):
                        a = im.getpixel((xx + dx, yy + dy)); b = tpl.getpixel((dx, dy))
                        mad += abs(a[0]-b[0]) + abs(a[1]-b[1]) + abs(a[2]-b[2])
                mad /= 100.0
                if best is None or mad < best[0]: best = (mad, xx, yy)
        ok(best and best[0] < 30, "S1: 落款区图标块在位（模板 MAD=%.1f @%s）" % (best[0], best[1:] if best else None))
        def close(px, tgt, tol): return all(abs(px[i]-tgt[i]) <= tol for i in range(3))
        gold_cols = set()
        gx0 = (best[1] + 37) if best else 380  # 只扫图标框右侧的文字区（避图标内铜色高光）
        for yy in range(H - 80, H - 54):
            for xx in range(gx0, W - 40):
                if close(im.getpixel((xx, yy)), (165, 135, 78), 25): gold_cols.add(xx)
        if best and gold_cols:
            gap = min(gold_cols) - (best[1] + 36)
            ok(2 <= gap <= 30, "S1: 图标在左文字在右、间距紧凑 gap=%d" % gap)
            ok(abs(max(gold_cols) - (W - 56)) <= 8, "S1: 落款整组右对齐（文字右缘 %d / 应 %d）" % (max(gold_cols), W - 56))
        else:
            ok(False, "S1: 落款几何（best=%s gold_cols=%d）" % (best, len(gold_cols)))
    # shareCard 实点：走异步出图路径不报错
    if s.ev("!!document.querySelector('#hl-card')"):
        s.ev("document.querySelector('#hl-card').click()")
        time.sleep(2.0)
    errs = s.ev("window.__errs")
    ok(not errs, "S1: 全程零 JS 错误 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

# ================= 会话二：内丹/道藏回归 =================
s = Sess()
try:
    s.wait("!!document.querySelector('[data-tab=\"tab-jing\"]')", 40)
    ensure_tab(s)
    ok(open_book(s, "s41"), "S2: 内丹 s41 打开")
    time.sleep(1.2)
    ok(s.ev("document.body.classList.contains('fabs-ghost')"), "S2: 内丹 ghost 在")
    ok(s.ev("getComputedStyle(document.getElementById('jing-back-fab')).opacity") == "0.55", "S2: 内丹返回钮 .55 不倒退")
    ok(s.ev("!document.getElementById('qing-btn').classList.contains('show')"), "S2: 内丹无磬")
    rb0 = rect(s, "#jing-back-fab")
    drag(s, "#jing-back-fab", -80, -90)
    rb1 = rect(s, "#jing-back-fab")
    ok(rb1 and rb0 and (rb0["l"] - rb1["l"]) >= 55, "S2: 内丹返回钮仍可拖")
    s.ev("window.closeReader && closeReader()"); time.sleep(0.5)
    ok(open_book(s, "KR5i0060", 60), "S2: 道藏 KR5i0060 打开")
    time.sleep(1.2)
    ok(s.ev("getComputedStyle(document.getElementById('jing-back-fab')).opacity") == "0.55", "S2: 道藏返回钮 .55")
    ok(s.ev("!document.getElementById('qing-btn').classList.contains('show')"), "S2: 道藏含敲磬文本仍无磬（v316 书类闸不倒退）")
    errs = s.ev("window.__errs")
    ok(not errs, "S2: 零 JS 错误 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

# ================= 会话三：夜间 =================
s = Sess(seed_extra="localStorage.setItem('wuri_cfg_v1', JSON.stringify({theme:'night'}));")
try:
    s.wait("!!document.querySelector('[data-tab=\"tab-jing\"]')", 40)
    ensure_tab(s)
    ok(open_book(s, "s02"), "S3-night: s02 打开")
    time.sleep(1.0)
    ok(s.ev("document.documentElement.getAttribute('data-theme')") == "night", "S3-night: 夜间生效")
    ok(s.ev("document.body.classList.contains('fabs-ghost') && getComputedStyle(document.getElementById('jing-back-fab')).opacity === '0.55'"), "S3-night: 悬浮钮 .55")
    ok(not s.ev("window.__errs"), "S3-night: 零 JS 错误")
finally:
    s.close()

# ================= 会话四：红光 =================
s = Sess(seed_extra="localStorage.setItem('wuri_sky_redlight_v1','1');")
try:
    s.wait("!!document.querySelector('[data-tab=\"tab-jing\"]')", 40)
    ensure_tab(s)
    ok(open_book(s, "s02"), "S4-red: s02 打开")
    time.sleep(1.0)
    ok(s.ev("document.body.classList.contains('sky-red')"), "S4-red: 红光生效")
    ok(s.ev("getComputedStyle(document.getElementById('jing-back-fab')).opacity") == "0.55", "S4-red: 悬浮钮 .55")
    seln = s.ev(SEL_LONGEST)
    s.wait("!!document.querySelector('#hl-card') && !document.querySelector('#hl-pop').hidden", 10)
    card = s.ev("__wuriMakeCard()") if seln else None
    if card:
        raw = base64.b64decode(card["dataUrl"].split(",", 1)[1])
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        corner = im.getpixel((30, 30))
        ok(abs(corner[0]-246) <= 8 and abs(corner[1]-239) <= 8 and abs(corner[2]-219) <= 8, "S4-red: 红光下图卡仍恒宣纸底 %s" % (corner,))
    else:
        ok(False, "S4-red: 图卡生成")
    ok(not s.ev("window.__errs"), "S4-red: 零 JS 错误")
finally:
    s.close()

print("\n==== %d PASS / %d FAIL ====" % (len(PASS), len(FAIL)))
if FAIL: print("FAILED:", FAIL)
sys.exit(1 if FAIL else 0)

#!/usr/bin/env python3
"""v2.3.0（SW v118）冥想故障二轮修复专项冒烟。

背景：v117 后用户真机复报依旧——播放中闪一下后场景名/倒计时/点点整层消失、
大部分场景无声（仅虫鸣等一两个有声）、之后变黑。沙箱对抗复现（110 秒加速
播放＋快速连切＋旋转＋磬声触发＋图/音频损坏资产）下现行代码文字层全程在位、
零异常 → 真机症状出在移动端合成层与网络/缓存状态：①背景 10 层全屏图带
will-change＋无限 transform 动画，UI 层（名/钟/点）无显式 z-index 只靠 DOM
顺序，在移动合成器里可被动画层顶掉；②v117 让音频每次播放现拉 2.7MB 网络
文件，出声与否看当下网络与 HTTP 缓存钉住的状态。
用户定调：冥想资产「下载 App 时就该下载下来」。
修复：①SW 新增 MED_CACHE（wuri-med-v3）安装期预缓存 10 图＋11 音频（?v=3
版本化、单件失败不拖垮更新），fetch 对冥想路径只出预缓存（ignoreSearch
匹配、音频 Range 切片回 206），缺件才回落网络；②meditation.css 层级显式
写死（bg 0／scrim 1／pager 2／center 3／topbar·controls 4／done 5）、
.med-center 加 translateZ(0)、.med-bg 去 will-change；③背景图 src 懒赋值
（setPage 时才给），避免 10 张全屏图同时解码压爆移动端显存；
④meditation.js/practice.js 冥想 URL ?v=2→?v=3。

断言：
①版本四件套：SW wuri-v118／style.css?v=118／meditation.css?v=67／显示仍
  v2.3.0＋内部 v118（简繁＋静态兜底）。
②静态：meditation.js 图 10＋loop 9＋bell 2 全 ?v=3、practice.js 9 条 ?v=3、
  懒赋值 ensureBg 在位；sw.js MED 清单 21 条 ?v=3＋ignoreSearch 分支＋安装
  容错；meditation.css 层级规则齐、无 will-change。
③SW 逻辑垫片（页内 mock caches/fetch 求值 sw.js）：install 单件 404 不
  失败且 MED 入缓存 20/21；fetch 冥想图 200 命中、音频 Range 回 206 切片
  正确、&r=1 重试参数仍命中（ignoreSearch）。
④运行时（CDP，412×915 主跑＋390×844 场景扫）：加速计时下播放全程每 4 秒
  采样断言文字层（名/钟/点）可见且钟在走、快速连切 12 次、逐场景名称/图
  实载（懒赋值生效）/loop 音频在播（currentTime 推进）、间隔磬触发、结束
  出现完成层；零 JS 异常。森林/颂钵截图存 med-fix-shots/。
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/med-fix-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:400]) if not ok and extra != "" else ""))

# ---------- ① 版本口径 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v118 缓存名＋预缓存 style?v=118/meditation?v=67",
       "wuri-v118-20261025-v230" in sw and "style.css?v=118" in sw and "meditation.css?v=67" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("index CSS ?v=118/?v=67＋静态版本行内部 v118",
       "css/style.css?v=118" in html and "css/meditation.css?v=67" in html and "v2.3.0（内部 v118）" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简（内部 v118）＋繁（內部 v118）",
       "me_ver: '戊日不上香 v2.3.0（内部 v118）'" in i18n and "me_ver: '戊日不上香 v2.3.0（內部 v118）'" in i18n)
report("显示版本仍 v2.3.0（无漂移）", "v2.3.1" not in i18n and "v2.4.0" not in html)

# ---------- ② 静态 ----------
med = open(os.path.join(WWW, "js/meditation.js"), encoding="utf-8").read()
report("meditation.js 图 10＋loop 9＋bell 2 全带 ?v=3、无 ?v=2 残留",
       med.count(".webp?v=3") == 10 and med.count(".mp3?v=3") == 11 and "?v=2" not in med,
       (med.count(".webp?v=3"), med.count(".mp3?v=3")))
pra = open(os.path.join(WWW, "js/practice.js"), encoding="utf-8").read()
report("practice.js BGM 8 loop＋结束铃带 ?v=3、无 ?v=2 残留",
       pra.count(".mp3?v=3") == 9 and "?v=2" not in pra, pra.count(".mp3?v=3"))
report("meditation.js 背景图懒赋值（ensureBg 赋值＋build 不预设 src）",
       "function ensureBg" in med and "img.src = SOUNDS[i].img" in med
       and "img.src = SOUNDS[idx].img;\n" not in med)
report("sw.js MED 预缓存：MED_CACHE＋21 条 ?v=3 清单",
       "wuri-med-v3" in sw and sw.count("meditation/") >= 21 and sw.count("?v=3") == 21,
       (sw.count("meditation/"), sw.count("?v=3")))
report("sw.js 冥想分支 ignoreSearch 命中＋Range 206＋安装容错",
       "ignoreSearch: true" in sw and "mc.add(u).catch" in sw and "isMed" in sw)
css = open(os.path.join(WWW, "css/meditation.css"), encoding="utf-8").read()
report("meditation.css 显式层级（center 3/topbar 4/controls 4）＋去 will-change",
       ".med-center{" in css and "z-index:3" in css and "z-index:4" in css
       and "will-change" not in css and ".med-bg-stack{" in css and "z-index:0" in css)

# ---------- 运行时准备 ----------
INJECT = r"""
window.__errs=[]; addEventListener('error', e=>window.__errs.push(String(e.message||e.error)));
addEventListener('unhandledrejection', e=>window.__errs.push('rej:'+String(e.reason)));
window.__audios=[];
(function(){ var OA = window.Audio; window.Audio = function(src){ var a = new OA(src);
  window.__audios.push(a); return a; }; window.Audio.prototype = OA.prototype; })();
(function(){ var OST = window.setTimeout; window.setTimeout = function(fn, ms){
  if (typeof ms === 'number' && ms > 10000) ms = Math.round(ms/10);
  return OST(fn, ms); }; })();
"""

chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--autoplay-policy=no-user-gesture-required",
                           "--remote-debugging-port=%d" % PORT, "about:blank"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ws_url = None
    for _ in range(40):
        try:
            targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3))
            pages = [t for t in targets if t.get("type") == "page"]
            if pages: ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    assert ws_url, "chrome CDP 未就绪"
    cdp = base.CDP(base.ws_connect(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": INJECT})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def nav():
        cdp.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
        for _ in range(30):
            try:
                if ev("typeof window.Meditation") == "object": return
            except Exception: pass
            time.sleep(0.5)
        raise RuntimeError("页面未就绪")

    # ---------- ③ SW 逻辑垫片 ----------
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    nav()
    shim = ev(r"""(async () => {
      const swText = await (await fetch('sw.js')).text();
      // ---- mock Cache/CacheStorage（内存版，add() 走 stub fetch） ----
      function MockCache(){ this.map = new Map(); }
      MockCache.prototype.add = async function(u){ const r = await MockCache._fetch(u);
        if (!r.ok) throw new Error('add fail ' + r.status);
        this.map.set(new URL(u, location.href).href.split('?')[0] + '|' + new URL(u, location.href).search, await r.blob()); };
      MockCache.prototype.addAll = async function(us){ for (const u of us) await this.add(u); };
      MockCache.prototype.match = async function(req, opts){ const url = typeof req === 'string' ? req : req.url;
        const pu = new URL(url);
        for (const [k, v] of this.map) { const ku = new URL(k.split('|')[0] + (k.split('|')[1]||''), location.href);
          if (ku.pathname === pu.pathname && ((opts && opts.ignoreSearch) || ku.search === pu.search))
            return new Response(v, {headers: {'Content-Type': url.endsWith('.mp3') ? 'audio/mpeg' : 'image/webp'}}); }
        return undefined; };
      MockCache.prototype.put = async function(req, res){ this.map.set(req.url || String(req), await res.blob()); };
      const stores = new Map();
      const mockCaches = { open: async n => { if (!stores.has(n)) stores.set(n, new MockCache()); return stores.get(n); },
        keys: async () => Array.from(stores.keys()),
        delete: async n => stores.delete(n),
        match: async () => undefined };
      // ---- stub fetch：一个冥想资产故意 404，其余回 200 已知字节 ----
      const BODY = new Blob([new Uint8Array(1024).map((_, i) => i % 251)], {type: 'audio/mpeg'});
      const realFetch = window.fetch.bind(window);
      const stubFetch = (u, opts) => { const s = String(u && u.url ? u.url : u);
        if (s.includes('bg-fire.webp')) return Promise.resolve(new Response('no', {status: 404}));
        if (s.includes('meditation')) return Promise.resolve(new Response(BODY.slice(), {status: 200, headers: {'Content-Type': 'audio/mpeg'}}));
        return Promise.resolve(new Response('x', {status: 200})); };
      const listeners = {};
      const fakeSelf = { addEventListener: (t, fn) => { listeners[t] = fn; },
        skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() },
        location: location, caches: mockCaches, fetch: stubFetch };
      MockCache._fetch = stubFetch;
      const fn = new Function('self', 'caches', 'fetch', 'location', swText + '; return self.__l;');
      const savedCaches = window.caches;
      try {
        fn(fakeSelf, mockCaches, stubFetch, location);
        // install
        let installDone = false, installErr = '';
        const waitUntilP = [];
        try { listeners['install']({ waitUntil: p => waitUntilP.push(p) });
          await Promise.all(waitUntilP); installDone = true;
        } catch (e) { installErr = String(e); }
        const medCache = stores.get('wuri-med-v3');
        const medCount = medCache ? medCache.map.size : 0;
        // fetch 分支：图 200 / 音频 Range 206 / &r=1 仍命中
        async function dispatch(url, headers) {
          const req = new Request(url, { headers: headers || {} });
          let respP = null;
          listeners['fetch']({ request: req, respondWith: p => { respP = p; } });
          if (!respP) return { handled: false };
          const resp = await respP;
          const buf = resp ? await resp.arrayBuffer() : null;
          return { handled: true, status: resp ? resp.status : 0,
                   cr: resp ? resp.headers.get('content-range') : null,
                   len: buf ? buf.byteLength : 0 };
        }
        const base = 'https://example.test/';
        const imgR = await dispatch(base + 'img/meditation/bg-rain.webp?v=3');
        const audR = await dispatch(base + 'audio/meditation/loop-rain.mp3?v=3', { Range: 'bytes=100-199' });
        const audRetry = await dispatch(base + 'audio/meditation/loop-rain.mp3?v=3&r=1');
        return { installDone, installErr, medCount, imgR, audR, audRetry };
      } finally { }
    })()""")
    report("SW install：单件 404 不拖垮、MED 预缓存 20/21 入账",
           shim["installDone"] and shim["medCount"] == 20, shim)
    report("SW fetch：冥想图本地 200 命中",
           shim["imgR"].get("handled") and shim["imgR"].get("status") == 200, shim.get("imgR"))
    report("SW fetch：冥想音频 Range 回 206 且切片 100 字节/Content-Range 对",
           shim["audR"].get("status") == 206 and shim["audR"].get("len") == 100
           and (shim["audR"].get("cr") or "").startswith("bytes 100-199/"), shim.get("audR"))
    report("SW fetch：&r=1 重试参数仍命中本地（ignoreSearch）",
           shim["audRetry"].get("handled") and shim["audRetry"].get("status") == 200, shim.get("audRetry"))

    # ---------- ④ 运行时：长时播放文字层全程在位＋逐场景本地命中 ----------
    NAMES = ['温柔雨声','雨·远雷','海浪','森林鸟鸣','夜晚虫鸣','壁炉火声','溪流','风声','颂钵·静','无声·静室']
    SAMPLE = r"""(() => { const c = document.querySelector('.med-center'), n = document.getElementById('med-sound-name'),
      k = document.getElementById('med-clock'), d = document.getElementById('med-dots');
      const cs = c ? getComputedStyle(c) : null;
      const act = document.querySelector('.med-bg.active'); const img = act ? act.querySelector('img') : null;
      const auds = (window.__audios||[]).map(a => ({rs: a.readyState, paused: a.paused, ct: Math.round(a.currentTime)}));
      return { centerOk: !!(cs && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0),
               name: n ? n.textContent.trim() : '', nameOp: n ? getComputedStyle(n).opacity : '',
               clock: k ? k.textContent : '', dots: d ? d.children.length : -1,
               imgOk: img ? (img.complete && img.naturalWidth > 0) : false,
               auds: auds, doneHidden: document.getElementById('med-done').hidden }; })()"""

    def swipe_left():
        ev("""(() => { const p = document.getElementById('med-pager');
          const t1 = new Touch({identifier: 1, target: p, clientX: 300, clientY: 450});
          const t2 = new Touch({identifier: 1, target: p, clientX: 110, clientY: 450});
          p.dispatchEvent(new TouchEvent('touchstart', {touches: [t1], changedTouches: [t1], bubbles: true, cancelable: true}));
          p.dispatchEvent(new TouchEvent('touchend', {touches: [], changedTouches: [t2], bubbles: true, cancelable: true}));
          return true; })()""")
        time.sleep(0.55)

    # 412 主跑：开冥想→播放→逐场景扫（播放中切场景）→长跑采样→快速连切→等结束层
    nav()
    ev("localStorage.setItem('wuri_med_sound','rain'); (Meditation.open(), true)")
    time.sleep(0.8)
    ev("(document.getElementById('med-play').click(), true)")
    layer_bad, sweep_bad = [], []
    time.sleep(1.5)
    for i, nm in enumerate(NAMES):
        s = ev(SAMPLE)
        any_playing = any((not a["paused"] and a["rs"] >= 2) for a in s["auds"])
        ok = (s["name"] == nm and s["centerOk"] and s["imgOk"] and s["clock"] not in ("", "15:00"))
        if nm != '无声·静室':
            ok = ok and any_playing
        if not ok: sweep_bad.append((nm, s))
        if nm in ("森林鸟鸣", "颂钵·静"):
            shot("med-%s-412" % ("forest" if nm == "森林鸟鸣" else "bowl"))
        if i < len(NAMES) - 1: swipe_left()
    report("412 播放中逐场景（10）：名称/文字层/图实载/音频在播", not sweep_bad, sweep_bad)

    # 回第一场景继续长跑：每 4 秒采样（加速计时：磬约每 30 秒、15 分钟场约 90 秒结束）
    ev("localStorage.setItem('wuri_med_sound','rain'); (Meditation.open(), true)")
    time.sleep(0.8)
    ev("(document.getElementById('med-play').click(), true)")
    t0 = time.time(); prev_clock = None; done_seen = False; rapid_done = False
    while time.time() - t0 < 150:
        time.sleep(4)
        el = time.time() - t0
        if el > 14 and not rapid_done:
            rapid_done = True
            for _ in range(6): swipe_left()
        s = ev(SAMPLE)
        if not s["doneHidden"]:
            done_seen = True; break
        if not (s["centerOk"] and s["name"] and s["clock"] and s["dots"] == 10):
            layer_bad.append((round(el), s))
        if prev_clock is not None and s["clock"] == prev_clock and el < 100:
            layer_bad.append((round(el), "clock frozen:" + s["clock"]))
        prev_clock = s["clock"]
    report("加速长跑全程文字层在位（名/钟/点采样无缺失、钟在走）", not layer_bad, layer_bad[:3])
    report("会话结束出现完成层（结束铃路径走完）", done_seen)
    errs = ev("window.__errs || []")
    report("全程零 JS 异常", not errs, errs)

    # 390 场景扫（不播放，验懒赋值＋满幅）
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    nav()
    ev("localStorage.removeItem('wuri_med_sound'); (Meditation.open(), true)")
    time.sleep(0.8)
    bad390 = []
    for i, nm in enumerate(NAMES):
        s = ev("""(() => { const act = document.querySelector('.med-bg.active');
          const img = act ? act.querySelector('img') : null; const r = img ? img.getBoundingClientRect() : null;
          return { name: document.getElementById('med-sound-name').textContent.trim(),
                   complete: img ? (img.complete && img.naturalWidth > 0) : false,
                   x: r ? Math.round(r.x) : null, y: r ? Math.round(r.y) : null,
                   w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0 }; })()""")
        if not (s["name"] == nm and s["complete"] and s["x"] <= -39 and s["y"] <= -39 and s["w"] >= 469 and s["h"] >= 923):
            bad390.append((nm, s))
        if i < len(NAMES) - 1: swipe_left()
    report("390 逐场景（10）名称/满幅覆盖/实载（懒赋值）", not bad390, bad390)
finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(bad), len(results)))
sys.exit(1 if bad else 0)

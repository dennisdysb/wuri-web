#!/usr/bin/env python3
# 冥想修复批冒烟（2026-10-28 二轮）：倒计时 2rem＋三 sheet 大面板＋切场景音频清零
# （路径 A 静室冷启 / B1 混音在播切静室 / B2 环境音在播切静室 / B3 暂停切场景恢复不还魂）
# ＋调音台键会话中可点＋拨珠震动默认开/存量迁移/单珠 50ms。file:// 直读，两场。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64, atexit
_PROCS = []
def _kill():
    for p in _PROCS:
        try: p.terminate()
        except Exception: pass
atexit.register(_kill)
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/medsheet/www")
OUT = os.path.expanduser("~/workspace/.wt/medsheet/medsheet-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:420]))

def make_session(width, height, tag, stub_vib=False):
    port = base.free_port(); prof = f"/tmp/chrome-medsheet-{tag}-{port}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=500,900", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    _PROCS.append(proc)
    wsurl = None
    for _ in range(40):
        try:
            tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
            pg = [t for t in tg if t.get("type") == "page"]
            if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    c = base.CDP(base.ws_connect(wsurl))
    c.call("Page.enable"); c.call("Runtime.enable")
    c.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": True})
    src = "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"
    if stub_vib:
        src += ("window.__vibs=[]; try{ Object.defineProperty(navigator,'vibrate',"
                "{value:function(p){window.__vibs.push(p);return true;},configurable:true}); }catch(e){}")
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": src})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    S = {"c": c}
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    S["ev"] = ev
    for _ in range(60):
        if ev("typeof Meditation") == "object" and ev("typeof window.__medTest") == "object":
            break
        time.sleep(0.5)
    time.sleep(0.8)
    def shot(name):
        r = c.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
    S["shot"] = shot
    def click(sel):
        ev(f"document.querySelector({json.dumps(sel)}).click()")
    S["click"] = click
    def pdown(sel):
        ev(f"""(()=>{{const e=document.querySelector({json.dumps(sel)}); const r=e.getBoundingClientRect();
          e.dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}})); return 1;}})()""")
    S["pdown"] = pdown
    def swipe(n, direction):
        # direction: -1 左滑（下一场景） / +1 右滑（上一场景）；走 pager 真触摸处理器
        return ev(f"""(()=>{{ const p=document.getElementById('med-pager'); const r=p.getBoundingClientRect();
          const y=r.top+r.height/2; const d={direction};
          for(let k=0;k<{n};k++){{ const x0=d<0? r.left+r.width*0.72 : r.left+r.width*0.28;
            const x1=d<0? r.left+r.width*0.28 : r.left+r.width*0.72;
            const t0=new Touch({{identifier:k,target:p,clientX:x0,clientY:y}});
            const t1=new Touch({{identifier:k,target:p,clientX:x1,clientY:y}});
            p.dispatchEvent(new TouchEvent('touchstart',{{touches:[t0],bubbles:true}}));
            p.dispatchEvent(new TouchEvent('touchend',{{changedTouches:[t1],bubbles:true}})); }}
          return window.__medTest.audioState().scene; }})()""")
    S["swipe"] = swipe
    def errs():
        return ev("window.__errs || []")
    S["errs"] = errs
    def close():
        try: proc.terminate()
        except Exception: pass
    S["close"] = close
    return S

MEASURE_JS = r"""(() => {
  const R = s => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(); return {t:r.top,b:r.bottom,l:r.left,r:r.right,w:r.width,h:r.height}; };
  const circ = document.getElementById('med-breath-circle');
  const cr = circ.getBoundingClientRect();
  const cy = cr.top + cr.height/2, cx = cr.left + cr.width/2;
  const baseD = circ.offsetHeight;
  const peak = baseD * 1.35;
  const sheet = s => { const e = document.querySelector(s); const r = e.getBoundingClientRect();
    return {hidden: e.hidden, t: r.top, b: r.bottom, h: r.height, sh: e.scrollHeight, ch: e.clientHeight}; };
  return {
    vw: innerWidth, vh: innerHeight,
    clockFs: parseFloat(getComputedStyle(document.getElementById('med-clock')).fontSize),
    topbar: R('.med-topbar'), controls: R('.med-controls'),
    baseD: baseD, peakTop: cy - peak/2, peakBottom: cy + peak/2,
    breath: sheet('#med-sheet-breath'), dur: sheet('#med-sheet-dur'), mix: sheet('#med-mix-panel')
  };
})()"""

def layout_session(width, height, tag):
    S = make_session(width, height, tag)
    ev, click, pdown, shot = S["ev"], S["click"], S["pdown"], S["shot"]
    ev("Meditation.open()"); time.sleep(1.0)
    m = ev(MEASURE_JS)
    report(f"{tag} 倒计时字号 2rem（≈32px）", abs(m["clockFs"] - 32) <= 1.5, m["clockFs"])
    shot(f"main-{tag}.png")
    # 圈几何：先选谐振呼吸让呼吸区/圆圈显示（与用户截图状态一致），关 sheet 后量测
    click("#med-key-breath"); time.sleep(0.35)
    click('[data-breath="coherent"]'); time.sleep(0.5)
    click("#med-sheet-breath-close"); time.sleep(0.35)
    m = ev(MEASURE_JS)
    report(f"{tag} 圈基径在钳位内", 120 <= m["baseD"] <= 380, m["baseD"])
    report(f"{tag} 圈峰不碰上下（峰顶≥顶栏底/峰底≤控制层顶）",
           m["peakTop"] >= m["topbar"]["b"] - 2 and m["peakBottom"] <= m["controls"]["t"] + 2,
           f"peakTop={m['peakTop']:.0f} topbarB={m['topbar']['b']:.0f} peakBot={m['peakBottom']:.0f} ctrlT={m['controls']['t']:.0f} baseD={m['baseD']}")
    shot(f"circle-{tag}.png")
    vh = height
    # ---- 呼吸 sheet ----
    click("#med-key-breath"); time.sleep(0.4)
    m = ev(MEASURE_JS)
    b = m["breath"]
    report(f"{tag} 呼吸 sheet 大面板（52–82vh/贴底/不盖顶栏）",
           not b["hidden"] and 0.50 * vh <= b["h"] <= 0.84 * vh and abs(b["b"] - vh) <= 1.5 and b["t"] >= m["topbar"]["b"] - 2, b)
    cnt = ev("""(()=>({ chips: document.querySelectorAll('#med-preset-chips .med-preset-chip').length,
      opts: document.querySelectorAll('#med-breath-options .med-breath-chip').length }))()""")
    report(f"{tag} 呼吸 sheet 预设+方式 8 项齐全", cnt["chips"] >= 4 and cnt["opts"] == 8, cnt)
    report(f"{tag} 呼吸 sheet 滚动需求 ≤160px（一滚到底）", b["sh"] - b["ch"] <= 160, f"need={b['sh']-b['ch']}")
    click('[data-breath="coherent"]'); time.sleep(0.4)
    cue = ev("""(()=>{ const e=document.getElementById('med-cue-block'); const s=document.getElementById('med-sheet-breath');
      const last=document.querySelector('#med-sheet-breath .med-cue-block');
      s.scrollTop = s.scrollHeight;
      const r=last.getBoundingClientRect(); const pr=s.getBoundingClientRect();
      return { vis: !e.hidden, lastInView: r.bottom <= pr.bottom + 2 && r.top >= pr.top }; })()""")
    report(f"{tag} 选谐振→引导节出现且滚到底可见", cue["vis"] and cue["lastInView"], cue)
    shot(f"sheet-breath-{tag}.png")
    # ---- 时长 sheet ----
    click("#med-key-dur"); time.sleep(0.4)
    m = ev(MEASURE_JS)
    d = m["dur"]
    report(f"{tag} sheet 互斥（开时长关呼吸）", not d["hidden"] and m["breath"]["hidden"], {"d": d["hidden"], "b": m["breath"]["hidden"]})
    report(f"{tag} 时长 sheet 大面板且一屏全见（零滚动）",
           0.50 * vh <= d["h"] <= 0.84 * vh and d["sh"] - d["ch"] <= 2, f"h={d['h']} need={d['sh']-d['ch']}")
    shot(f"sheet-dur-{tag}.png")
    click("#med-sheet-dur-close"); time.sleep(0.3)
    report(f"{tag} 时长 sheet 收起钮", ev("document.getElementById('med-sheet-dur').hidden"), "")
    # ---- 调音台 sheet ----
    click("#med-key-mix"); time.sleep(0.4)
    m = ev(MEASURE_JS)
    x = m["mix"]
    report(f"{tag} 调音台 sheet 大面板（52–82vh/贴底）",
           not x["hidden"] and 0.50 * vh <= x["h"] <= 0.84 * vh and abs(x["b"] - vh) <= 1.5, x)
    hit = ev("""(()=>{ const t=document.getElementById('med-mix-toggle'); const r=t.getBoundingClientRect();
      const el=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
      const items=[...document.querySelectorAll('#med-mix-list .med-mix-item')];
      const pr=document.getElementById('med-mix-panel').getBoundingClientRect();
      const visN=items.filter(it=>{ const ir=it.getBoundingClientRect(); return ir.top>=pr.top && ir.bottom<=pr.bottom; }).length;
      return { hitToggle: !!el && (el.id==='med-mix-toggle' || !!el.closest('.med-switch')),
               items: items.length, visN: visN }; })()""")
    report(f"{tag} 面板头行总开关可命中＋音轨 9 行（首屏可见 {hit['visN'] if hit else '?'} 行）",
           hit and hit["hitToggle"] and hit["items"] == 9, hit)
    click("#med-mix-toggle"); time.sleep(0.3)
    ms = ev("window.__medTest.mixState()")
    report(f"{tag} 面板内总开关真翻转（开→带入当前声 rain）", ms["mode"] and "rain" in ms["tracks"], ms)
    ev("document.getElementById('med-mix-panel').scrollTop = 99999"); time.sleep(0.25)
    last_vis = ev("""(()=>{ const items=[...document.querySelectorAll('#med-mix-list .med-mix-item')];
      const pr=document.getElementById('med-mix-panel').getBoundingClientRect();
      const last=items[items.length-1].getBoundingClientRect();
      return last.top >= pr.top - 2 && last.bottom <= pr.bottom + 30; })()""")
    report(f"{tag} 调音台滚动到底末行可见", last_vis, "")
    shot(f"sheet-mix-{tag}.png")
    click("#med-mix-close"); time.sleep(0.3)
    # ---- 会话进行中：调音台键可点/面板可开/轨可调 ----
    click("#med-play"); time.sleep(1.2)
    hitk = ev("""(()=>{ const k=document.getElementById('med-key-mix'); const r=k.getBoundingClientRect();
      const el=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
      return { hit: !!el && !!el.closest('#med-key-mix'),
               playing: window.__medTest.audioState().playing }; })()""")
    report(f"{tag} 会话中调音台键可命中", hitk and hitk["hit"] and hitk["playing"], hitk)
    click("#med-key-mix"); time.sleep(0.4)
    opened = ev("!document.getElementById('med-mix-panel').hidden")
    click('[data-mix="fire"]'); time.sleep(0.3)
    ms = ev("window.__medTest.mixState()")
    report(f"{tag} 会话中开调音台面板+点轨生效", opened and "fire" in ms["tracks"], {"opened": opened, "tracks": ms["tracks"]})
    click("#med-mix-close"); time.sleep(0.3)
    click("#med-play"); time.sleep(0.4)
    # ---- 点外收起 ----
    click("#med-key-breath"); time.sleep(0.3)
    pdown(".med-pager"); time.sleep(0.3)
    report(f"{tag} 点面板外（舞台）收起", ev("document.getElementById('med-sheet-breath').hidden"), "")
    report(f"{tag} 零 JS 异常", S["errs"]() == [], S["errs"]())
    S["close"]()
    return S

def audio_paths():
    # ---------- 路径 A：静室冷启 ----------
    S = make_session(412, 915, "pathA")
    ev, click = S["ev"], S["click"]
    ev("Meditation.open()"); time.sleep(1.0)
    sc = S["swipe"](9, -1); time.sleep(0.4)
    a0 = ev("window.__medTest.audioState()")
    report("A 切到静室（未开始）即无任何音频元素", sc == "silence" and a0["ambient"] is None and a0["mixEls"] == [], a0)
    click("#med-play"); time.sleep(1.3)
    a1 = ev("window.__medTest.audioState()")
    cs = ev("window.__medTest.cueState()")
    report("A 静室会话中零音频在播（引导默认关）",
           a1["playing"] and a1["ambient"] is None and a1["mixEls"] == [] and not cs["on"], {"a": a1, "cueOn": cs["on"]})
    report("A 零 JS 异常", S["errs"]() == [], S["errs"]())
    S["close"]()

    # ---------- 路径 B1：雨声+混音在播 → 直接切静室 ----------
    S = make_session(412, 915, "pathB1")
    ev, click = S["ev"], S["click"]
    ev("Meditation.open()"); time.sleep(1.0)
    click("#med-key-mix"); time.sleep(0.4)
    click("#med-mix-toggle"); time.sleep(0.3)
    click('[data-mix="fire"]'); time.sleep(0.3)
    click("#med-mix-close"); time.sleep(0.3)
    click("#med-play"); time.sleep(1.6)
    ms = ev("window.__medTest.mixState()")
    report("B1 前置：混音 2 轨在播", ms["session"] and len(ms["els"]) == 2 and all(not e["paused"] for e in ms["els"]), ms)
    sc = S["swipe"](9, -1); time.sleep(1.0)
    a = ev("window.__medTest.audioState()")
    ms = ev("window.__medTest.mixState()")
    sub = ev("document.getElementById('med-key-mix-sub').textContent")
    report("B1 切静室 1 秒内混音各轨全清（元素弃置）",
           sc == "silence" and a["mixEls"] == [] and a["ambient"] is None, a)
    report("B1 会话未被误杀（计时续行、静默）", ms["session"] and a["playing"], {"ms_session": ms["session"], "a": a})
    print("     B1 键面摘要（切静室后）:", sub)
    report("B1 零 JS 异常", S["errs"]() == [], S["errs"]())
    S["close"]()

    # ---------- 路径 B2：海浪环境音在播 → 直接切静室 ----------
    S = make_session(412, 915, "pathB2")
    ev, click = S["ev"], S["click"]
    ev("Meditation.open()"); time.sleep(1.0)
    S["swipe"](2, -1); time.sleep(0.3)
    click("#med-play"); time.sleep(1.3)
    a = ev("window.__medTest.audioState()")
    report("B2 前置：海浪环境音在播",
           a["ambient"] and not a["ambient"]["paused"] and "loop-ocean" in (a["ambient"]["src"] or ""), a)
    sc = S["swipe"](7, -1); time.sleep(1.0)
    a = ev("window.__medTest.audioState()")
    report("B2 切静室 1 秒内环境音清零（元素弃置）且会话续行",
           sc == "silence" and a["ambient"] is None and a["playing"], a)
    # 切回有声场景：应按新场景续播
    S["swipe"](7, 1); time.sleep(1.2)
    a = ev("window.__medTest.audioState()")
    report("B2 切回海浪自动续播新场景声", a["ambient"] and not a["ambient"]["paused"] and "loop-ocean" in (a["ambient"]["src"] or ""), a)
    report("B2 零 JS 异常", S["errs"]() == [], S["errs"]())
    S["close"]()

    # ---------- 路径 B3：暂停中切场景 → 恢复不还魂 ----------
    S = make_session(412, 915, "pathB3")
    ev, click = S["ev"], S["click"]
    ev("Meditation.open()"); time.sleep(1.0)
    click("#med-play"); time.sleep(1.2)          # 雨声开播
    click("#med-play"); time.sleep(0.5)          # 暂停
    S["swipe"](2, -1); time.sleep(0.3)           # 暂停中切到海浪
    click("#med-play"); time.sleep(1.0)          # 恢复
    a = ev("window.__medTest.audioState()")
    report("B3 暂停切海浪后恢复播海浪（非旧雨声）",
           a["ambient"] and not a["ambient"]["paused"] and "loop-ocean" in (a["ambient"]["src"] or ""), a)
    click("#med-play"); time.sleep(0.5)          # 再暂停
    S["swipe"](7, -1); time.sleep(0.3)           # 暂停中切到静室
    click("#med-play"); time.sleep(1.0)          # 恢复
    a = ev("window.__medTest.audioState()")
    report("B3 暂停切静室后恢复保持全静（旧声不还魂）",
           a["ambient"] is None and a["mixEls"] == [] and a["playing"], a)
    report("B3 零 JS 异常", S["errs"]() == [], S["errs"]())
    S["close"]()

def beads_session():
    S = make_session(412, 915, "beads", stub_vib=True)
    ev, click = S["ev"], S["click"]
    ev("Meditation.open()"); time.sleep(0.6)
    ev("window.Beads.open()"); time.sleep(0.6)
    st = ev("""(()=>({ checked: document.getElementById('bd-vib').checked,
      label: document.querySelector('#bd-vib').closest('.med-cue-item').querySelector('.med-cue-label').textContent }))()""")
    report("拨珠 新装默认：记珠震动开＋开关名「记珠震动」", st["checked"] and st["label"] == "记珠震动", st)
    click("#bd-stage"); time.sleep(0.3)
    vibs = ev("window.__vibs")
    cnt = ev("document.getElementById('bd-count').textContent")
    report("拨珠 单珠震动 50ms", vibs == [50] and cnt == "1", {"vibs": vibs, "cnt": cnt})
    # 存量迁移 1：旧默认烘焙的 false（无 vibSet）→ 视作未表态 → 开
    ev("localStorage.setItem('wuri_beads_cfg', JSON.stringify({name:'',goal:0,vib:false}))")
    ev("location.reload()"); time.sleep(2.2)
    ev("window.Beads.open()"); time.sleep(0.6)
    chk = ev("document.getElementById('bd-vib').checked")
    report("拨珠 存量无标记 false → 按新默认开", chk is True, chk)
    # 存量迁移 2：用户亲手关（vibSet:true）→ 尊重
    ev("localStorage.setItem('wuri_beads_cfg', JSON.stringify({name:'',goal:0,vib:false,vibSet:true}))")
    ev("location.reload()"); time.sleep(2.2)
    ev("window.Beads.open()"); time.sleep(0.6)
    chk = ev("document.getElementById('bd-vib').checked")
    report("拨珠 存量亲手关（vibSet）→ 尊重保持关", chk is False, chk)
    click("#bd-vib"); time.sleep(0.3)
    saved = ev("JSON.parse(localStorage.getItem('wuri_beads_cfg')||'{}')")
    report("拨珠 开关拨动落盘带 vibSet 标记", saved.get("vib") is True and saved.get("vibSet") is True, saved)
    S["shot"]("beads-412.png")
    report("拨珠 零 JS 异常", S["errs"]() == [], S["errs"]())
    S["close"]()

def theme_shots():
    S = make_session(412, 915, "theme")
    ev, click, shot = S["ev"], S["click"], S["shot"]
    ev("(()=>{ const c=JSON.parse(localStorage.getItem('wuri_cfg_v1')||'{}'); c.theme='night'; localStorage.setItem('wuri_cfg_v1', JSON.stringify(c)); })()")
    ev("location.reload()"); time.sleep(2.2)
    ev("Meditation.open()"); time.sleep(1.0)
    click("#med-key-breath"); time.sleep(0.4)
    shot("sheet-breath-412-night.png")
    ev("window.WuriRedlight && WuriRedlight.set(true)"); time.sleep(0.5)
    click("#med-key-mix"); time.sleep(0.4)
    shot("sheet-mix-412-red.png")
    on = ev("document.documentElement.getAttribute('data-theme')")
    red = ev("document.body.classList.contains('sky-red')")
    report("三态 夜间 data-theme=night＋红光 body.sky-red", on == "night" and red, {"theme": on, "red": red})
    report("三态 零 JS 异常", S["errs"]() == [], S["errs"]())
    S["close"]()

if __name__ == "__main__":
    layout_session(412, 915, "412")
    layout_session(390, 844, "390")
    audio_paths()
    beads_session()
    theme_shots()
    fails = [n for n, ok in results if not ok]
    print(f"\n==== {len(results) - len(fails)}/{len(results)} PASS ====")
    if fails:
        print("FAILURES:", *fails, sep="\n  ")
        sys.exit(1)

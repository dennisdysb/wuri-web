#!/usr/bin/env python3
# 冥想页主界面改版冒烟（2026-10-28）：三键三 sheet＋圈径舞台化＋功能映射逐项点验。
# 两场 412x915 / 390x844；file:// 直读（沙箱 Chromium 回环拦截口径，沿既有 harness）。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64, atexit
_PROCS = []
def _kill():
    for p in _PROCS:
        try: p.terminate()
        except Exception: pass
atexit.register(_kill)
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/medlayout/www")
OUT = os.path.expanduser("~/workspace/.wt/medlayout/medlayout-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:420]))

MEASURE_JS = r"""(() => {
  const R = s => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(); return {t:r.top,b:r.bottom,l:r.left,r:r.right,w:r.width,h:r.height}; };
  const circ = document.getElementById('med-breath-circle');
  const cr = circ.getBoundingClientRect();
  const cy = cr.top + cr.height/2, cx = cr.left + cr.width/2;
  const baseD = circ.offsetHeight;
  const peak = baseD * 1.35;
  const m = {
    vw: innerWidth, vh: innerHeight,
    clockFs: parseFloat(getComputedStyle(document.getElementById('med-clock')).fontSize),
    keys: ['#med-key-breath','#med-key-dur','#med-key-mix'].map(R),
    keyNames: [...document.querySelectorAll('.med-key-name')].map(e => ({sw: e.scrollWidth, cw: e.clientWidth, txt: e.textContent})),
    subs: { breath: document.getElementById('med-key-breath-sub').textContent,
            dur: document.getElementById('med-key-dur-sub').textContent,
            mix: document.getElementById('med-key-mix-sub').textContent },
    controls: R('.med-controls'), play: R('#med-play'), topbar: R('.med-topbar'),
    circle: R('#med-breath-circle'), note: R('#med-breath-note'),
    peakTop: cy - peak/2, peakBottom: cy + peak/2, peakLeft: cx - peak/2, peakRight: cx + peak/2,
    baseD: baseD, valley: baseD * 0.6,
    sheets: { breath: R('#med-sheet-breath'), dur: R('#med-sheet-dur'), mix: R('#med-mix-panel') },
    sheetHidden: { breath: document.getElementById('med-sheet-breath').hidden,
                   dur: document.getElementById('med-sheet-dur').hidden,
                   mix: document.getElementById('med-mix-panel').hidden },
  };
  return m;
})()"""

def session(width, height, tag):
    port = base.free_port(); prof = f"/tmp/chrome-medlayout-{tag}-{port}"
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
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    for _ in range(60):
        if ev("typeof Meditation") == "object" and ev("typeof window.__medTest") == "object":
            break
        time.sleep(0.5)
    time.sleep(0.8)
    def shot(name):
        r = c.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
    def click(sel):
        ev(f"document.querySelector({json.dumps(sel)}).click()")
    def pdown(sel):
        ev(f"""(()=>{{const e=document.querySelector({json.dumps(sel)}); const r=e.getBoundingClientRect();
          e.dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}})); return 1;}})()""")

    ev("Meditation.open()"); time.sleep(1.0)

    # ---------- 主界面：三键齐全/同排/不截断、旧行已撤、倒计时小字 ----------
    m = ev(MEASURE_JS)
    ks = m["keys"]
    report(f"{tag} 三键齐全同排不越界", all(k and k["w"] > 60 and k["l"] >= 0 and k["r"] <= width + 0.5 for k in ks)
           and abs(ks[0]["t"] - ks[1]["t"]) < 1.5 and abs(ks[1]["t"] - ks[2]["t"]) < 1.5, ks)
    report(f"{tag} 键名不截断", all(n["sw"] <= n["cw"] + 1 for n in m["keyNames"]), m["keyNames"])
    report(f"{tag} 初始键面摘要", m["subs"]["breath"] == "关闭" and m["subs"]["dur"] == "15分钟" and m["subs"]["mix"] == "未开启", m["subs"])
    report(f"{tag} 倒计时改小字（≤22px）", m["clockFs"] <= 22, m["clockFs"])
    old = ev("""(()=>({ durInControls: !!document.querySelector('.med-controls #med-dur-row'),
      cueInControls: !!document.querySelector('.med-controls #med-cue-block'),
      mixOpen: !!document.getElementById('med-mix-open'),
      controlsKids: [...document.querySelector('.med-controls').children].map(e=>e.id||e.className) }))()""")
    report(f"{tag} 控制层只剩三键+播放+音量", (not old["durInControls"]) and (not old["cueInControls"]) and (not old["mixOpen"])
           and len(old["controlsKids"]) == 3, old)
    # 沉浸口径：冥想打开期间底部导航隐藏（body.med-open 外壳机制，与阅读器同路）
    tab = ev("""(()=>{ const tb=document.getElementById('tabbar');
      const el=document.elementFromPoint(innerWidth/2, innerHeight-6);
      return { cls: document.body.classList.contains('med-open'),
        disp: getComputedStyle(tb).display,
        hit: el ? (el.closest('#meditation-view') ? 'med' : (el.closest('#tabbar') ? 'tab' : 'other')) : 'none' }; })()""")
    report(f"{tag} 冥想打开底栏隐藏", tab["cls"] and tab["disp"] == "none" and tab["hit"] == "med", tab)
    shot(f"main-{tag}.png")

    # ---------- 混音 sheet（v276 机制在新入口下回归） ----------
    click("#med-key-mix"); time.sleep(0.35)
    report(f"{tag} 调音台键开混音 sheet", not ev("document.getElementById('med-mix-panel').hidden"), "")
    click("#med-mix-toggle"); time.sleep(0.35)   # 总开关入面板头行：开 → 带入当前声 rain
    ms = ev("window.__medTest.mixState()")
    report(f"{tag} 面板内总开关开混音（带入当前声）", ms["mode"] and ms["count"] == 1 and "rain" in ms["tracks"], ms)
    for tid in ["fire", "night"]:
        click(f'[data-mix="{tid}"]'); time.sleep(0.15)
    click("#med-play"); time.sleep(1.6)          # 开播（.click 不发 pointerdown，另在下方专验不误收）
    ms = ev("window.__medTest.mixState()")
    report(f"{tag} 混音 3 轨开播", ms["session"] and ms["count"] == 3 and all(not e["paused"] for e in ms["els"]), ms)
    m = ev(MEASURE_JS)
    gap_pp = m["play"]["t"] - m["sheets"]["mix"]["b"]
    report(f"{tag} 混音 sheet 不压播放键", gap_pp >= 4, f"gap={gap_pp}")
    report(f"{tag} 纯计时态混音 sheet 高度可用（≥200）", m["sheets"]["mix"]["h"] >= 200, f"h={m['sheets']['mix']['h']}")
    vis_rows = ev("document.querySelectorAll('#med-mix-list .med-mix-item').length")
    report(f"{tag} 混音轨单行数齐全", vis_rows == 9, vis_rows)
    shot(f"sheet-mix-{tag}.png")
    # 点播放键不误收（真 pointerdown）
    pdown("#med-play"); time.sleep(0.25)
    report(f"{tag} 点播放键不误收混音 sheet", not ev("document.getElementById('med-mix-panel').hidden"), "")
    # 收起钮收面板 + 续播 + 轨数仍显示于键面
    click("#med-mix-close"); time.sleep(0.3)
    still = ev("(()=>{const s=window.__medTest.mixState(); return s.playing && s.els.every(e=>!e.paused);})()")
    sub = ev("document.getElementById('med-key-mix-sub').textContent")
    report(f"{tag} 收起钮收起+续播+键面轨数", ev("document.getElementById('med-mix-panel').hidden") and still and "3" in (sub or ""), f"still={still} sub={sub}")
    # 键开合切换
    click("#med-key-mix"); time.sleep(0.3)
    vis = not ev("document.getElementById('med-mix-panel').hidden")
    click("#med-key-mix"); time.sleep(0.3)
    report(f"{tag} 调音台键开/合切换", vis and ev("document.getElementById('med-mix-panel').hidden"), f"vis={vis}")
    # 点外收起（舞台区 pointerdown）
    click("#med-key-mix"); time.sleep(0.3)
    pdown(".med-pager"); time.sleep(0.3)
    report(f"{tag} 点 sheet 外收起", ev("document.getElementById('med-mix-panel').hidden"), "")
    click("#med-play"); time.sleep(0.4)          # 暂停收尾
    # 总开关关：清轨（面板内操作）
    click("#med-key-mix"); time.sleep(0.3)
    click("#med-mix-toggle"); time.sleep(0.3)
    ms = ev("window.__medTest.mixState()")
    report(f"{tag} 面板内总开关关清轨+面板自收", (not ms["mode"]) and ev("document.getElementById('med-mix-panel').hidden"), ms)
    sub = ev("document.getElementById('med-key-mix-sub').textContent")
    report(f"{tag} 键面摘要回未开启", sub == "未开启", sub)

    # ---------- 呼吸 sheet：四节齐全 + 功能逐项 ----------
    click("#med-key-breath"); time.sleep(0.35)
    secs = ev("""(()=>({ chips: document.querySelectorAll('#med-preset-chips .med-preset-chip').length,
      opts: document.querySelectorAll('#med-breath-options .med-breath-chip').length,
      cueHidden: document.getElementById('med-cue-block').hidden,
      sheetHidden: document.getElementById('med-sheet-breath').hidden }))()""")
    report(f"{tag} 呼吸 sheet 打开（预设/方式节齐全）", (not secs["sheetHidden"]) and secs["chips"] >= 4 and secs["opts"] == 8, secs)
    report(f"{tag} 无呼吸方式时引导节不占位", secs["cueHidden"], secs)
    click('[data-breath="coherent"]'); time.sleep(0.4)
    cue_vis = ev("!document.getElementById('med-cue-block').hidden")
    sub = ev("document.getElementById('med-key-breath-sub').textContent")
    report(f"{tag} 选谐振呼吸→引导节出现+键面摘要", cue_vis and sub == "谐振呼吸", f"cue={cue_vis} sub={sub}")
    click("#med-cue-toggle"); time.sleep(0.25)
    cs = ev("window.__medTest.cueState()")
    report(f"{tag} 声音引导开关生效", cs["on"] and ev("localStorage.getItem('wuri_med_cue')") == "1", cs)
    click("#med-cue-vib"); time.sleep(0.25)
    cs = ev("window.__medTest.cueState()")
    report(f"{tag} 振动开关生效", cs["vib"] and ev("localStorage.getItem('wuri_med_cuevib')") == "1", cs)
    ev("""(()=>{ const v=document.getElementById('med-cue-vol'); v.value=80;
      v.dispatchEvent(new Event('input',{bubbles:true})); })()""")
    report(f"{tag} 引导音量滑杆生效", ev("localStorage.getItem('wuri_med_cuevol')") == "80", "")
    shot(f"sheet-breath-{tag}.png")
    # 预设切换：晨练（awake/森林/开播）——在 sheet 内点
    ev("""(()=>{ const chips=[...document.querySelectorAll('#med-preset-chips .med-preset-chip')];
      const t=chips.find(x=>x.textContent.indexOf('晨练')===0); if(t) t.click(); })()""")
    time.sleep(1.0)
    pchk = ev("""(()=>({ breath: localStorage.getItem('wuri_med_breath'), sound: localStorage.getItem('wuri_med_sound'),
      sub: document.getElementById('med-key-breath-sub').textContent,
      playing: document.getElementById('med-play').innerHTML.indexOf('M6 5h4v14H6z')>=0 }))()""")
    report(f"{tag} 预设晨练整组生效+开播", pchk["breath"] == "awake" and pchk["sound"] == "forest" and pchk["playing"] and pchk["sub"] == "清醒提神", pchk)
    # 存当前
    ev("window.prompt=()=>'晨间定课'")
    ev("""(()=>{ const chips=[...document.querySelectorAll('#med-preset-chips .med-preset-chip')];
      const t=chips.find(x=>x.textContent.indexOf('存当前')>=0); if(t) t.click(); })()""")
    time.sleep(0.3)
    ups = ev("JSON.parse(localStorage.getItem('wuri_med_presets')||'[]')")
    report(f"{tag} 存当前预设落盘", len(ups) == 1 and ups[0]["name"] == "晨间定课" and ups[0]["breath"] == "awake", ups)
    click("#med-play"); time.sleep(0.4)          # 暂停
    # 收起钮 + 点外收 两路
    click("#med-sheet-breath-close"); time.sleep(0.3)
    report(f"{tag} 呼吸 sheet 收起钮", ev("document.getElementById('med-sheet-breath').hidden"), "")
    click("#med-key-breath"); time.sleep(0.3)
    pdown(".med-pager"); time.sleep(0.3)
    report(f"{tag} 呼吸 sheet 点外收", ev("document.getElementById('med-sheet-breath').hidden"), "")

    # ---------- 互斥：开新关旧 ----------
    click("#med-key-breath"); time.sleep(0.3)
    click("#med-key-dur"); time.sleep(0.3)
    mx = ev("""(()=>({ b: document.getElementById('med-sheet-breath').hidden,
      d: document.getElementById('med-sheet-dur').hidden }))()""")
    report(f"{tag} sheet 互斥（开时长关呼吸）", mx["b"] and not mx["d"], mx)
    shot(f"sheet-dur-{tag}.png")

    # ---------- 时长 sheet：三档/自选/间隔磬 ----------
    # 先把预设开播的会话收掉重进页面，回到干净未播态再验时长
    # （暂停态下时钟持续显示暂停会话剩余，属现行口径、不在本批改动范围）
    ev("window.__medTest.finishSession(1)"); time.sleep(0.5)
    click("#med-done-back"); time.sleep(0.4)
    ev("Meditation.open()"); time.sleep(0.8)
    click("#med-key-dur"); time.sleep(0.3)
    click('#med-dur-row .med-seg[data-dur="30"]'); time.sleep(0.3)
    d30 = ev("""(()=>({ ls: localStorage.getItem('wuri_med_dur'), clock: document.getElementById('med-clock').textContent,
      sub: document.getElementById('med-key-dur-sub').textContent }))()""")
    report(f"{tag} 时长 30 分生效", d30["ls"] == "30" and d30["clock"] == "30:00" and d30["sub"] == "30分钟", d30)
    bell0 = ev("localStorage.getItem('wuri_med_bell')")
    click("#med-bell-toggle"); time.sleep(0.25)
    bell1 = ev("localStorage.getItem('wuri_med_bell')")
    report(f"{tag} 间隔磬开关生效", bell0 != bell1 and bell1 in ("0", "1"), f"{bell0}->{bell1}")
    click('#med-dur-row .med-seg[data-dur="custom"]'); time.sleep(0.3)
    cust = ev("""(()=>({ inp: !document.getElementById('med-custom-min').hidden,
      go: !document.getElementById('med-custom-go').hidden }))()""")
    report(f"{tag} 自选展开输入+开始键", cust["inp"] and cust["go"], cust)
    ev("""(()=>{ const v=document.getElementById('med-custom-min'); v.value='25';
      v.dispatchEvent(new Event('input',{bubbles:true})); })()""")
    time.sleep(0.2)
    sub = ev("document.getElementById('med-key-dur-sub').textContent")
    clock = ev("document.getElementById('med-clock').textContent")
    report(f"{tag} 自选 25 分摘要+时钟", sub == "自选 25分钟" and clock == "25:00", f"sub={sub} clock={clock}")
    click("#med-custom-go"); time.sleep(1.2)
    playing = ev("document.getElementById('med-play').innerHTML.indexOf('M6 5h4v14H6z')>=0")
    report(f"{tag} 自选开始键开播", playing, "")
    click("#med-sheet-dur-close"); time.sleep(0.3)
    report(f"{tag} 时长 sheet 收起钮（播放不中断）", ev("document.getElementById('med-sheet-dur').hidden")
           and ev("document.getElementById('med-play').innerHTML.indexOf('M6 5h4v14H6z')>=0"), "")

    # ---------- 呼吸圈峰值/谷值几何（播放中，谐振呼吸） ----------
    # 回到谐振呼吸（预设把方式切成了 awake，这里切回 coherent 并保持播放）
    click("#med-key-breath"); time.sleep(0.3)
    click('[data-breath="coherent"]'); time.sleep(0.4)
    click("#med-sheet-breath-close"); time.sleep(0.3)
    time.sleep(1.2)
    m = ev(MEASURE_JS)
    print(f"--- {tag} 圈几何：基径 {m['baseD']:.0f} 谷值 {m['valley']:.0f} 峰值上 {m['peakTop']:.0f} 下 {m['peakBottom']:.0f} 左 {m['peakLeft']:.0f} 右 {m['peakRight']:.0f} | 顶栏底 {m['topbar']['b']:.0f} 控制顶 {m['controls']['t']:.0f} 说明顶 {m['note']['t'] if m['note'] else '-'}")
    report(f"{tag} 峰值不碰顶栏/控制区/左右界", m["peakTop"] >= m["topbar"]["b"] - 1 and m["peakBottom"] <= m["controls"]["t"] + 1
           and m["peakLeft"] >= -1 and m["peakRight"] <= width + 1, m)
    report(f"{tag} 峰值底→说明行 gap≥0", (m["note"]["t"] - m["peakBottom"]) >= 0 if m["note"] else False,
           f"gap={(m['note']['t'] - m['peakBottom']) if m['note'] else None}")
    report(f"{tag} 谷值有存在感（≥100px）", m["valley"] >= 100, m["valley"])
    report(f"{tag} 播放中呼吸圈可见", not ev("document.getElementById('med-breath').hidden"), "")
    shot(f"stage-{tag}.png")
    # sheet 展开 vs 圈峰值不重叠（呼吸 sheet 最长）
    circvar0 = ev("document.getElementById('med-breath').style.getPropertyValue('--med-circ')")
    click("#med-key-breath"); time.sleep(0.35)
    m = ev(MEASURE_JS)
    gap_sb = m["sheets"]["breath"]["t"] - m["peakBottom"]
    gap_sp = m["play"]["t"] - m["sheets"]["breath"]["b"]
    report(f"{tag} 呼吸 sheet 展开不压圈峰值/播放键", gap_sb >= 0 and gap_sp >= 4, f"gapSheetVsPeak={gap_sb} gapSheetVsPlay={gap_sp}")
    click("#med-sheet-breath-close"); time.sleep(0.3)
    circvar1 = ev("document.getElementById('med-breath').style.getPropertyValue('--med-circ')")
    report(f"{tag} sheet 开合不重算圈径（无跳动）", circvar0 and circvar0 == circvar1, f"{circvar0} -> {circvar1}")
    click("#med-play"); time.sleep(0.4)          # 暂停收尾

    # ---------- 三态截图（主界面＋任一 sheet） ----------
    ev("document.documentElement.setAttribute('data-theme','day')"); time.sleep(0.3)
    shot(f"tri-day-{tag}.png")
    ev("document.documentElement.setAttribute('data-theme','night')"); time.sleep(0.3)
    shot(f"tri-night-{tag}.png")
    ev("document.body.classList.add('sky-red')"); time.sleep(0.3)
    shot(f"tri-red-{tag}.png")
    click("#med-key-breath"); time.sleep(0.35)
    shot(f"tri-red-sheet-{tag}.png")
    click("#med-sheet-breath-close"); time.sleep(0.2)
    ev("document.body.classList.remove('sky-red')")

    # 退出冥想：底栏恢复
    click("#med-back"); time.sleep(0.5)
    tab2 = ev("""(()=>({ cls: document.body.classList.contains('med-open'),
      disp: getComputedStyle(document.getElementById('tabbar')).display,
      viewHidden: document.getElementById('meditation-view').hidden }))()""")
    report(f"{tag} 退出冥想底栏恢复", (not tab2["cls"]) and tab2["disp"] != "none" and tab2["viewHidden"], tab2)

    errs = ev("window.__errs||[]")
    report(f"{tag} 零 JS 异常", len(errs) == 0, errs)
    proc.terminate()

session(412, 915, "412")
session(390, 844, "390")

fails = [n for n, ok in results if not ok]
print(f"\n==== {len(results) - len(fails)}/{len(results)} PASS" + (f" FAIL: {fails}" if fails else ""))
sys.exit(1 if fails else 0)

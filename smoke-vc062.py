#!/usr/bin/env python3
# 专项冒烟（内部 v401）：冥想呼吸口令 0.62 档双字版装机＋四项联动修复。
# 验：新素材接入/默认音量 70/手势解锁 primed/被拒可见提示/ducking 压 35% 后恢复/
# 预设不写回口令开关/磬让行 skips/三态无异常。基线树＝本 worktree www。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64, hashlib
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()

WWW = os.path.expanduser("~/workspace/.wt/voicecue062/www")
OUT = os.path.expanduser("~/workspace/.wt/voicecue062/smoke-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
sw, idx, medjs = rd("sw.js"), rd("index.html"), rd("js/meditation.js")
report("S1 新素材三件在位且旧单字下线", all(os.path.exists(os.path.join(WWW, "audio/meditation", f))
       for f in ["cue-xiqi.mp3", "cue-huqi.mp3", "cue-pingzhu.mp3"])
       and not os.path.exists(os.path.join(WWW, "audio/meditation/cue-xi.mp3")))
report("S2 代码接入点齐", "cue-xiqi.mp3?v=1" in medjs and "cue-pingzhu.mp3?v=1" in medjs
       and "'吸气'" in medjs and "'屏住'" in medjs and "DUCK_GAIN = 0.35" in medjs
       and "primeAudio" in medjs and "med-cue-hint" in medjs and "med-cue-hint" in idx)
report("S3 SW 预缓存换新＋MED_CACHE v6", "wuri-med-v6" in sw and "cue-xiqi.mp3?v=1" in sw
       and "cue-xi.mp3" not in sw)
report("S4 默认音量 70 三处一致", 'id="med-cue-vol"' in idx and 'value="70"' in idx
       and "lsGet(LS_CUE_VOL, '70')" in medjs)
report("S5 预设暗坑已堵（applyPreset 无 cue 写回）",
       "lsSet(LS_CUE, p.cue" not in medjs and "ct.checked = !!p.cue" not in medjs)

def boot(width, height, tag):
    port = base.free_port(); prof = f"/tmp/chrome-vc062-{tag}-{port}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                             "--allow-file-access-from-files",
                             "--hatch-webgl-allowed-domains-file=" + _WG,
                             "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
                             "--autoplay-policy=no-user-gesture-required",
                             "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=500,900", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
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
    time.sleep(3)
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    def shot(name):
        r = c.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
    return proc, ev, shot

def waitfor(ev, expr, timeout=12, step=0.25):
    end = time.time() + timeout
    v = None
    while time.time() < end:
        v = ev(expr)
        if v: return v
        time.sleep(step)
    return v

# ============ 主会话 360x740 ============
proc, ev, shot = boot(360, 740, "360")
try:
    ev("window.Meditation.open()"); time.sleep(1.2)
    report("A0 冥想视图真打开", ev("document.getElementById('meditation-view').hidden") is False)
    report("A1 手势前未解锁 primed=false", ev("window.__medTest.cueState().primed") is False)
    report("A2 口令默认关＋默认音量 0.70", ev("window.__medTest.cueState().on") is False
           and abs(ev("window.__medTest.cueState().vol") - 0.7) < 0.001
           and ev("document.getElementById('med-cue-vol').value") == "70")
    report("A3 手势前无口令播放 plays=0", ev("window.__medTest.cueState().plays") == 0)
    # 选盒式呼吸（4,4,4,4 四相位全）＋开声音引导
    ev("document.querySelector('[data-breath=\"square\"]').click()"); time.sleep(0.4)
    ev("document.getElementById('med-cue-toggle').click()"); time.sleep(0.3)
    # 模拟真实手势（pointerdown 捕获监听）
    ev("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); time.sleep(0.6)
    st = ev("window.__medTest.cueState()")
    report("A4 开引导＋手势后 primed=true", st["primed"] is True and st["on"] is True, st)
    report("A5 口令块与音量行可见", ev("!document.getElementById('med-cue-block').hidden") is True)
    # 开始练习：第一相位吸气口令
    ev("document.getElementById('med-play').click()")
    got = waitfor(ev, "window.__medTest.cueState().last", 6)
    st = ev("window.__medTest.cueState()")
    report("A6 首声口令＝吸气且已播", got == "吸气" and st["plays"] >= 1, st)
    # ducking：口令窗口内环境音被压（默认环境音量 70 → 鸭后≈25）
    ducked = None
    end = time.time() + 6
    while time.time() < end:
        a = ev("window.__medTest.audioState()")
        cs = ev("window.__medTest.cueState()")
        if cs["nowPlaying"] and a["ambient"]:
            ducked = (a["ambient"]["vol"], cs["duck"]); break
        time.sleep(0.1)
    report("A7 口令中 ducking 生效（环境音≈25/duck=true）",
           ducked is not None and ducked[0] <= 30 and ducked[1] is True, ducked)
    # 口令结束恢复
    ok = waitfor(ev, "(()=>{const a=window.__medTest.audioState();const c=window.__medTest.cueState();"
                     "return (a.ambient && a.ambient.vol>=65 && !c.duck && !c.nowPlaying) ? 1 : 0;})()", 8)
    report("A8 口令毕 ducking 恢复（环境音回 70）", ok == 1, ev("window.__medTest.audioState()"))
    # 第二相位（4s）＝屏住（吸后屏息）
    got2 = waitfor(ev, "window.__medTest.cueState().last==='屏住' ? '屏住' : ''", 8)
    report("A9 屏息相位口令＝屏住", got2 == "屏住", ev("window.__medTest.cueState()"))
    # 第三相位（8s）＝呼气
    got3 = waitfor(ev, "window.__medTest.cueState().last==='呼气' ? '呼气' : ''", 9)
    report("A10 呼气相位口令＝呼气", got3 == "呼气", ev("window.__medTest.cueState()"))
    shot("vc-360-playing.png")
    # ---- 预设暗坑：口令开时点 cue:false 的内置预设「睡前」，口令须保持开 ----
    ev("document.querySelectorAll('#med-preset-chips .med-preset-chip')[2].click()"); time.sleep(0.8)
    st = ev("window.__medTest.cueState()")
    report("A11 切预设后口令保持开（暗坑已堵）", st["on"] is True
           and ev("localStorage.getItem('wuri_med_cue')") == "1", st)
    # 反向：关口令后切「晨练」预设，须保持关
    ev("document.getElementById('med-play').click()"); time.sleep(0.3)   # 先停
    ev("document.getElementById('med-cue-toggle').click()"); time.sleep(0.3)
    ev("document.querySelectorAll('#med-preset-chips .med-preset-chip')[0].click()"); time.sleep(0.8)
    st = ev("window.__medTest.cueState()")
    report("A12 口令关时切预设保持关", st["on"] is False
           and ev("localStorage.getItem('wuri_med_cue')") == "0", st)
    ev("document.getElementById('med-play').click()"); time.sleep(0.3)   # 停掉预设自动开播
    # ---- 磬让行：间隔磬 5s、口令开，盒式 4s 相位在 4s 处口令应被让行跳过 ----
    ev("window.__medTest.setBellIntervalSec(5)")
    ev("document.getElementById('med-bell-toggle').click()"); time.sleep(0.2)  # 确保磬开（默认开则此击反关，下行校正）
    if ev("document.getElementById('med-bell-toggle').checked") is not True:
        ev("document.getElementById('med-bell-toggle').click()"); time.sleep(0.2)
    ev("document.getElementById('med-cue-toggle').click()"); time.sleep(0.2)  # 口令重新开
    ev("document.querySelector('[data-breath=\"square\"]').click()"); time.sleep(0.2)
    plays0 = ev("window.__medTest.cueState().plays")
    ev("document.getElementById('med-play').click()")
    ok = waitfor(ev, "window.__medTest.cueState().skips>=1 ? 1 : 0", 10)
    st = ev("window.__medTest.cueState()")
    report("A13 磬临近时口令让行（skips>=1）", ok == 1, st)
    ev("document.getElementById('med-play').click()"); time.sleep(0.3)
    ev("window.__medTest.setBellIntervalSec(300)")
    # ---- 被拒可见化：stub play() 全拒 → 下一声口令应点亮提示 ----
    ev("window.__origPlay = HTMLAudioElement.prototype.play;"
       "HTMLAudioElement.prototype.play = function(){ return Promise.reject(new DOMException('stub','NotAllowedError')); };")
    ev("document.getElementById('med-play').click()")
    ok = waitfor(ev, "window.__medTest.cueState().blocked ? 1 : 0", 8)
    hint_vis = ev("!document.getElementById('med-cue-hint').hidden")
    report("A14 play 被拒→blocked＋提示行可见（不静默）", ok == 1 and hint_vis is True,
           ev("window.__medTest.cueState()"))
    shot("vc-360-blocked-hint.png")
    # 恢复 play＋手势重试 → 下一声成功后提示熄灭
    ev("HTMLAudioElement.prototype.play = window.__origPlay;")
    ev("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); time.sleep(0.5)
    ok = waitfor(ev, "window.__medTest.cueState().blocked ? 0 : 1", 12)
    report("A15 恢复后口令再响、提示熄灭", ok == 1
           and ev("document.getElementById('med-cue-hint').hidden") is True,
           ev("window.__medTest.cueState()"))
    ev("document.getElementById('med-play').click()"); time.sleep(0.3)
    # ---- 回归：混音一轨可播、无 JS 异常 ----
    ev("document.getElementById('med-mix-toggle').click()"); time.sleep(0.4)
    ev("document.querySelector('[data-mix=\"rain\"]').click()"); time.sleep(0.8)
    ms = ev("window.__medTest.mixState()")
    report("A16 混音轨回归（rain 在轨）", "rain" in (ms.get("tracks") or {}), ms)
    errs = ev("window.__errs")
    report("A17 全程无 JS 异常", not errs, errs)
finally:
    try: proc.terminate()
    except Exception: pass

# ============ 三态截图会话 390x844 ============
proc, ev, shot = boot(390, 844, "390")
try:
    ev("window.Meditation.open()"); time.sleep(1.0)
    ev("document.querySelector('[data-breath=\"square\"]').click()"); time.sleep(0.3)
    shot("vc-390-day.png")
    ev("document.documentElement.setAttribute('data-theme','night')"); time.sleep(0.4)
    shot("vc-390-night.png")
    ev("document.body.classList.add('sky-red')"); time.sleep(0.4)
    shot("vc-390-red.png")
    vis = ev("!document.getElementById('med-cue-block').hidden")
    errs = ev("window.__errs")
    report("B1 三态下口令区可见且无异常", vis is True and not errs, errs)
finally:
    try: proc.terminate()
    except Exception: pass

fails = [n for n, ok in results if not ok]
print(f"\n==== {len(results) - len(fails)}/{len(results)} PASS" + (f" FAILS={fails}" if fails else ""))
with open(os.path.join(OUT, "smoke-vc062-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write(f"==== {len(results) - len(fails)}/{len(results)} PASS\n")
sys.exit(1 if fails else 0)

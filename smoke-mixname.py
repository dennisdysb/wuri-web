#!/usr/bin/env python3
# 混音配方命名面板批冒烟（2026-10-28）：prompt→App 内命名面板 + 拨珠震动链路对齐/回写。
# file:// 直读（沙箱 Chromium 回环拦截口径）， harness 沿 smoke-medbatch-regress。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/mixname/www")
OUT = os.path.expanduser("~/workspace/.wt/mixname/mixname-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
medjs, idx = rd("js/meditation.js"), rd("index.html")
import re
prompts = re.findall(r"window\.prompt\('([^']*)'", medjs)
report("S1 静态：meditation.js 仅剩预设 prompt 一处、无 confirm/alert",
       prompts == ['预设名（如：晚课前）'] and "window.confirm" not in medjs and "window.alert" not in medjs
       and "alert(" not in medjs, prompts)
report("S2 静态：命名面板接线齐", all(x in idx for x in ['id="med-name-sheet"', 'id="med-name-input"', 'id="med-name-ok"', 'id="med-name-cancel"', 'id="med-name-dup"'])
       and all(x in medjs for x in ["openNameSheet", "saveNamedRecipe", "LS_MIX_LASTNAME", "nameSheetOpen"]))

PRELOAD = r"""
window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});
window.__vibCalls=[];
try{ Object.defineProperty(navigator,'vibrate',{configurable:true,value:function(p){window.__vibCalls.push(JSON.parse(JSON.stringify(p))); return true;}}); }catch(e){}
window.__nativeCalls={prompt:0,confirm:0,alert:0};
window.prompt=function(){window.__nativeCalls.prompt++; return '';};
window.confirm=function(){window.__nativeCalls.confirm++; return true;};
window.alert=function(){window.__nativeCalls.alert++;};
try{
  localStorage.setItem('wuri_beads_cfg', JSON.stringify({name:'',goal:0,vib:false,hintDim:true}));
  localStorage.setItem('wuri_med_mix_recipes', JSON.stringify([{name:'雨夜读经',tracks:{rain:70}}]));
  localStorage.setItem('wuri_med_mix', JSON.stringify({tracks:{rain:80}}));
}catch(e){}
"""

def session(width, height, tag, preload=None):
    port = base.free_port(); prof = f"/tmp/chrome-mixname-{tag}-{port}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
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
    if preload: c.call("Page.addScriptToEvaluateOnNewDocument", {"source": preload})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    for _ in range(60):
        if ev("typeof Meditation") == "object" and ev("typeof window.__beadsTest") == "object":
            break
        time.sleep(0.5)
    time.sleep(0.8)
    def shot(name):
        r = c.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
    def click(sel): ev(f"document.querySelector({json.dumps(sel)}).click()")
    return proc, c, ev, shot, click

# ================= 功能窗 =================
proc, c, ev, shot, click = session(412, 915, "fn", PRELOAD)
try:
    # ---- 拨珠：存量迁移回写 + 开关读键＝门控读键 ----
    stored = ev("JSON.parse(localStorage.getItem('wuri_beads_cfg')||'null')")
    report("B1 存量 vib:false 无标记 → 回写落盘 vib:true", stored and stored.get("vib") is True, stored)
    ev("window.Beads.open()"); time.sleep(0.5)
    report("B2 拨珠页开关呈开", ev("document.getElementById('bd-vib').checked") is True)
    click("#bd-stage"); time.sleep(0.2)
    calls = ev("window.__vibCalls")
    report("B3 开关开→点盘记珠 vibrate(50) 调用", calls == [50], calls)
    click("#bd-vib"); time.sleep(0.2)   # 亲手关：写 vibSet
    stored2 = ev("JSON.parse(localStorage.getItem('wuri_beads_cfg')||'null')")
    report("B4 亲手关落盘 vib:false+vibSet:true（读键同为 wuri_beads_cfg）",
           stored2 and stored2.get("vib") is False and stored2.get("vibSet") is True, stored2)
    click("#bd-stage"); time.sleep(0.2)
    report("B5 关后点盘不再 vibrate（门控读同一键）", ev("window.__vibCalls") == [50], ev("window.__vibCalls"))
    click("#bd-vib"); time.sleep(0.2)   # 重新打开
    ev("(()=>{ for(let i=0;i<106;i++) window.__beadsTest.tap(); return 1; })()"); time.sleep(0.3)
    calls = ev("window.__vibCalls")
    report("B6 第108珠整轮模式 [50,40,90]", len(calls) >= 2 and calls[-1] == [50, 40, 90], calls[-3:] if calls else calls)
    report("B7 计数推进 108", ev("window.__beadsTest.state().session") == 108, ev("window.__beadsTest.state()"))
    ev("window.Beads.back()"); time.sleep(0.3)

    # ---- 混音命名面板 ----
    ev("Meditation.open()"); time.sleep(0.6)
    click("#med-key-mix"); time.sleep(0.5)
    report("M1 混音面板打开且已选轨", ev("!document.getElementById('med-mix-panel').hidden") is True
           and ev("window.__medTest.mixState().mode") is True, ev("window.__medTest.mixState()"))
    click("#med-mix-save"); time.sleep(0.5)
    vis = ev("!document.getElementById('med-name-sheet').hidden")
    pre = ev("(()=>{const i=document.getElementById('med-name-input'); return {v:i.value, a:document.activeElement===i, s0:i.selectionStart, s1:i.selectionEnd};})()")
    report("M2 命名面板弹出（非原生 prompt）", vis is True and ev("window.__nativeCalls.prompt") == 0, f"vis={vis}")
    report("M3 预填默认名＋聚焦全选", pre and pre["v"] and pre["a"] and pre["s0"] == 0 and pre["s1"] == len(pre["v"]), pre)
    ev("(()=>{const i=document.getElementById('med-name-input'); i.value='雨夜读经'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()"); time.sleep(0.2)
    report("M4 重名→面板内提示行显示", ev("document.getElementById('med-name-dup').hidden") is False)
    shot("mixname-fn-dup.png")
    ev("(()=>{const i=document.getElementById('med-name-input'); i.value='晨雨'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()"); time.sleep(0.2)
    report("M5 改名后提示行收起", ev("document.getElementById('med-name-dup').hidden") is True)
    click("#med-name-ok"); time.sleep(0.4)
    lst = ev("JSON.parse(localStorage.getItem('wuri_med_mix_recipes')||'[]')")
    names = [x["name"] for x in lst]
    report("M6 保存落盘＋面板关闭", "晨雨" in names and ev("document.getElementById('med-name-sheet').hidden") is True, lst)
    report("M7 配方出现在配方行", "晨雨" in (ev("document.getElementById('med-mix-recipe-chips').textContent") or ""))
    report("M8 上次名已记", ev("localStorage.getItem('wuri_med_mix_lastname')") == "晨雨")
    # 载入：先改当前混音（点 forest 轨），再点「晨雨」chip
    click("#med-mix-list .med-mix-chip[data-mix='forest']"); time.sleep(0.3)
    ev("(()=>{const chips=[...document.querySelectorAll('#med-mix-recipe-chips .med-mix-recipe')]; const t=chips.find(x=>x.textContent.includes('晨雨')); if(t) t.click(); return !!t;})()"); time.sleep(0.3)
    st = ev("window.__medTest.mixState()")
    report("M9 点配方载入生效（tracks 回到 rain:80）", st and st["tracks"] == {"rain": 80}, st)
    # 覆盖同名：再存一次，预填应为上次名且重名提示即时在场，条数不增
    click("#med-mix-save"); time.sleep(0.4)
    pre2 = ev("document.getElementById('med-name-input').value")
    dup2 = ev("document.getElementById('med-name-dup').hidden")
    click("#med-name-ok"); time.sleep(0.3)
    lst2 = ev("JSON.parse(localStorage.getItem('wuri_med_mix_recipes')||'[]')")
    report("M10 重开预填上次名＋提示在场＋覆盖不增条", pre2 == "晨雨" and dup2 is False and [x["name"] for x in lst2].count("晨雨") == 1, (pre2, dup2, lst2))
    # 取消路径
    click("#med-mix-save"); time.sleep(0.4)
    click("#med-name-cancel"); time.sleep(0.3)
    lst3 = ev("JSON.parse(localStorage.getItem('wuri_med_mix_recipes')||'[]')")
    report("M11 取消不落盘", [x["name"] for x in lst3] == [x["name"] for x in lst2])
    # 空名路径（与旧 prompt 空回车同口径：关面板、不存）
    click("#med-mix-save"); time.sleep(0.4)
    ev("(()=>{const i=document.getElementById('med-name-input'); i.value='  '; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()")
    click("#med-name-ok"); time.sleep(0.3)
    lst4 = ev("JSON.parse(localStorage.getItem('wuri_med_mix_recipes')||'[]')")
    report("M12 空名关面板不落盘", ev("document.getElementById('med-name-sheet').hidden") is True and len(lst4) == len(lst3), lst4)
    # 删除（✕ 直删、无原生框）
    ev("(()=>{const chips=[...document.querySelectorAll('#med-mix-recipe-chips .med-mix-recipe')]; const t=chips.find(x=>x.textContent.includes('晨雨')); const d=t&&t.querySelector('.med-mix-recipe-del'); if(d) d.click(); return !!d;})()"); time.sleep(0.3)
    lst5 = ev("JSON.parse(localStorage.getItem('wuri_med_mix_recipes')||'[]')")
    report("M13 ✕ 删除生效", [x["name"] for x in lst5] == ["雨夜读经"], lst5)
    nc = ev("window.__nativeCalls")
    report("M14 全程原生 prompt/confirm/alert 零调用", nc == {"prompt": 0, "confirm": 0, "alert": 0}, nc)
    report("M15 零 JS 错误", ev("window.__errs") == [], ev("window.__errs"))
finally:
    proc.terminate()

# ================= 三态截图窗 =================
def state_shot(tag, theme, red):
    pre = PRELOAD + f"""
try{{ const k='wuri_cfg_v1'; const o=JSON.parse(localStorage.getItem(k)||'{{}}'); o.theme={json.dumps(theme)}; localStorage.setItem(k, JSON.stringify(o)); }}catch(e){{}}
"""
    proc, c, ev, shot, click = session(412, 915, tag, pre)
    try:
        ev("Meditation.open()"); time.sleep(0.6)
        click("#med-key-mix"); time.sleep(0.5)
        click("#med-mix-save"); time.sleep(0.5)
        ev("(()=>{const i=document.getElementById('med-name-input'); i.value='雨夜读经'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()"); time.sleep(0.2)
        if red: ev("document.body.classList.add('sky-red')"); time.sleep(0.2)
        th = ev("document.documentElement.getAttribute('data-theme')")
        rd_ = ev("document.body.classList.contains('sky-red')")
        vis = ev("!document.getElementById('med-name-sheet').hidden")
        report(f"T-{tag} 状态就位（theme={th} red={rd_} 面板可见={vis}）", vis is True and ev("window.__errs") == [],
               (th, rd_, ev("window.__errs")))
        shot(f"mixname-{tag}.png")
    finally:
        proc.terminate()

state_shot("day", "day", False)
state_shot("night", "night", False)
state_shot("red", "night", True)

fails = [n for n, ok in results if not ok]
print(f"\n==== {len(results) - len(fails)}/{len(results)} PASS" + (f" FAIL: {fails}" if fails else ""))
sys.exit(1 if fails else 0)

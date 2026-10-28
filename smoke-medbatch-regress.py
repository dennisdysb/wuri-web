#!/usr/bin/env python3
# 冥想批冒烟（2026-10-28）：统计+结束页/里程碑/寄语、混音多轨、场景预设、拨珠计数。
# 基线 worktree = origin/main v252。file:// 直读（沙箱 Chromium 回环拦截口径）。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/medlayout/www")
OUT = os.path.expanduser("~/workspace/.wt/medlayout/medbatch-regress-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
idx, medjs, acct = rd("index.html"), rd("js/meditation.js"), rd("js/account.js")
report("S1 静态接线", all(x in idx for x in ['id="med-stats"', 'id="med-preset-chips"', 'id="med-mix-panel"',
       'id="med-done-stats"', 'id="med-done-mile"', 'id="med-done-quote"', 'id="beads-view"', 'id="bd-stage"', 'id="beads-open-2"'])
       and all(x in medjs for x in ["wuri_med_mix", "BUILTIN_PRESETS", "var Beads", "crossedMilestones", "pickDoneQuote"])
       and all(x in acct for x in ["'wuri_med_mix'", "'wuri_med_presets'", "'wuri_beads_records'", "'wuri_beads_cfg'"]))

def session(width, height, tag):
    port = base.free_port(); prof = f"/tmp/chrome-medbatch-{tag}-{port}"
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
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    # 等脚本全量加载完成（页面脚本链长，固定 sleep 会与 Meditation 定义竞态）
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

    # ---- 种打卡记录：打坐连续 3 天、累计 9h50m（35400s），另掺他项防混算 ----
    ev("""(()=>{ const d=new Date(); const ds=o=>{const x=new Date(d); x.setDate(x.getDate()-o);
      return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
      const recs=[ {hid:'dazuo',date:ds(0),secs:12000,ts:1},{hid:'dazuo',date:ds(1),secs:12000,ts:2},
        {hid:'dazuo',date:ds(2),secs:11400,ts:3},{hid:'zaoke',date:ds(0),secs:0,ts:4},{hid:'neilian',date:ds(0),secs:99999,ts:5} ];
      localStorage.setItem('wuri_daka_records', JSON.stringify(recs)); return ds(0); })()""")
    ev("Meditation.open()"); time.sleep(1.0)
    st = ev("window.__medTest.medStats()")
    report(f"{tag} 统计口径（只算打坐）", st["sessions"] == 3 and st["totalSecs"] == 35400 and st["streak"] == 3, st)
    txt = ev("document.getElementById('med-stats').textContent")
    report(f"{tag} 顶部统计条", "连续 3 天" in (txt or "") and "9 小时" in (txt or ""), txt)
    shot(f"med-{tag}-stats.png")

    # ---- 完整走一轮：开始 → finishSession 跨越 10 小时里程碑 → 结束页 ----
    click("#med-play"); time.sleep(0.8)
    ev("window.__medTest.finishSession(601)"); time.sleep(0.6)
    done_vis = ev("!document.getElementById('med-done').hidden")
    dstats = ev("document.getElementById('med-done-stats').textContent")
    dmile = ev("(()=>{const e=document.getElementById('med-done-mile'); return {hidden:e.hidden, text:e.textContent};})()")
    dquote = ev("(()=>{const e=document.getElementById('med-done-quote'); return {hidden:e.hidden, text:e.textContent};})()")
    recs = ev("JSON.parse(localStorage.getItem('wuri_daka_records')||'[]').filter(r=>r.hid==='dazuo').length")
    report(f"{tag} 结束页可见+记录落盘", done_vis and recs == 4, f"done={done_vis} recs={recs}")
    report(f"{tag} 结束页统计行", "累计 10 小时" in (dstats or "") and "连续 3 天" in (dstats or ""), dstats)
    report(f"{tag} 里程碑提示", (not dmile["hidden"]) and "累计打坐满 10 小时" in dmile["text"], dmile)
    report(f"{tag} 结束页寄语（诗池）", (not dquote["hidden"]) and len(dquote["text"]) > 6 and "《" in dquote["text"], dquote)
    shot(f"med-{tag}-done.png")
    click("#med-done-back"); time.sleep(0.5)
    ev("Meditation.open()"); time.sleep(0.8)

    # ---- 混音：开混音→4 轨→第 5 轨被拦→改音量→开播多轨→存配方→暂停 ----
    click("#med-mix-toggle"); time.sleep(0.3)
    time.sleep(0.3)
    for tid in ["forest", "creek", "night"]:
        click(f'[data-mix="{tid}"]'); time.sleep(0.15)
    ms = ev("window.__medTest.mixState()")
    report(f"{tag} 混音 4 轨构成", ms["mode"] and ms["count"] == 4, ms)
    click('[data-mix="fire"]'); time.sleep(0.3)
    ms2 = ev("window.__medTest.mixState()")
    hint = ev("document.getElementById('med-mix-hint').textContent")
    report(f"{tag} 第 5 轨被拦", ms2["count"] == 4 and "最多" in (hint or ""), f"count={ms2['count']} hint={hint}")
    ev("""(()=>{ const v=document.querySelector('[data-mixvol="rain"]'); v.value=30;
      v.dispatchEvent(new Event('input',{bubbles:true})); })()""")
    click("#med-play"); time.sleep(2.2)
    ms3 = ev("window.__medTest.mixState()")
    playing_els = [e for e in ms3["els"] if not e["paused"]]
    rain_el = [e for e in ms3["els"] if e["id"] == "rain"]
    report(f"{tag} 混音会话开播多轨", ms3["session"] and len(playing_els) >= 3, ms3)
    report(f"{tag} 轨音量独立（雨 30%×主音量）", rain_el and abs(rain_el[0]["vol"] - 21) <= 4, rain_el)
    shot(f"med-{tag}-mix.png")
    ev("window.prompt=()=>'雨夜读经'")
    click("#med-mix-save"); time.sleep(0.3)
    recipes = ev("JSON.parse(localStorage.getItem('wuri_med_mix_recipes')||'[]')")
    report(f"{tag} 配方保存", len(recipes) == 1 and recipes[0]["name"] == "雨夜读经" and len(recipes[0]["tracks"]) == 4, recipes)
    click("#med-play"); time.sleep(0.6)
    ms4 = ev("window.__medTest.mixState()")
    report(f"{tag} 混音暂停全轨停", all(e["paused"] for e in ms4["els"]) and len(ms4["els"]) >= 4, ms4)

    # ---- 预设：睡前一键（呼吸 deep-calm/自选 20 分/夜声/混音清空/开播）+ 存当前 ----
    ev("""(()=>{ const chips=[...document.querySelectorAll('#med-preset-chips .med-preset-chip')];
      const t=chips.find(x=>x.textContent.indexOf('睡前')===0); if(t) t.click(); })()""")
    time.sleep(1.0)
    pchk = ev("""(()=>({ breath: localStorage.getItem('wuri_med_breath'),
      seg: (document.querySelector('#med-dur-row .med-seg.on')||{}).dataset?.dur,
      min: document.getElementById('med-custom-min').value,
      sound: localStorage.getItem('wuri_med_sound'),
      playing: document.getElementById('med-play').innerHTML.indexOf('M6 5h4v14H6z')>=0 }))()""")
    ms5 = ev("window.__medTest.mixState()")
    report(f"{tag} 睡前预设整组生效", pchk["breath"] == "deep-calm" and pchk["seg"] == "custom"
           and pchk["min"] == "20" and pchk["sound"] == "night" and pchk["playing"] and not ms5["mode"], pchk)
    ev("window.prompt=()=>'我的睡前'")
    ev("""(()=>{ const chips=[...document.querySelectorAll('#med-preset-chips .med-preset-chip')];
      const t=chips.find(x=>x.textContent.indexOf('存当前')>=0); if(t) t.click(); })()""")
    time.sleep(0.3)
    ups = ev("JSON.parse(localStorage.getItem('wuri_med_presets')||'[]')")
    report(f"{tag} 用户预设存取", len(ups) == 1 and ups[0]["name"] == "我的睡前" and ups[0]["breath"] == "deep-calm", ups)

    # ---- 拨珠：开页→点 109 下→满轮进位→保存→统计单列 ----
    click("#med-beads-open"); time.sleep(0.8)
    bvis = ev("!document.getElementById('beads-view').hidden")
    ev("for(let i=0;i<108;i++) window.__beadsTest.tap()")
    b1 = ev("window.__beadsTest.state()")
    rd1 = ev("document.getElementById('bd-round').textContent")
    report(f"{tag} 拨珠满 108", bvis and b1["session"] == 108 and "108 / 108" in (rd1 or ""), f"{b1} {rd1}")
    ev("window.__beadsTest.tap()")
    rd2 = ev("document.getElementById('bd-round').textContent")
    report(f"{tag} 进位第二遍", "第 2 遍" in (rd2 or "") and "1 / 108" in (rd2 or ""), rd2)
    shot(f"beads-{tag}.png")
    click("#bd-finish"); time.sleep(0.4)
    b2 = ev("window.__beadsTest.state()")
    bstats = ev("document.getElementById('bd-stats').textContent")
    report(f"{tag} 拨珠落盘+统计单列", b2["records"] == 1 and b2["total"] == 109 and "累计 109" in (bstats or ""), f"{b2} {bstats}")
    # 念诵不得混入打坐统计
    st2 = ev("window.__medTest.medStats()")
    report(f"{tag} 念诵不入冥想统计", st2["sessions"] == 4, st2)
    click("#bd-back"); time.sleep(0.3)

    # ---- 红光态截图 + 回归（呼吸圈/纯计时）+ 零 JS 异常 ----
    ev("document.body.classList.add('sky-red')")
    shot(f"med-{tag}-red.png")
    ev("document.body.classList.remove('sky-red')")
    click('[data-breath="square"]'); time.sleep(0.5)
    reg = ev("""(()=>({ cls: document.getElementById('meditation-view').className,
      breathHidden: document.getElementById('med-breath').hidden, errs: window.__errs||[] }))()""")
    report(f"{tag} 回归：呼吸态+零JS异常", "med-breathing" in reg["cls"] and not reg["breathHidden"] and len(reg["errs"]) == 0, reg)
    proc.terminate()

session(412, 915, "412")
session(390, 844, "390")

fails = [n for n, ok in results if not ok]
print(f"\n==== {len(results) - len(fails)}/{len(results)} PASS" + (f" FAIL: {fails}" if fails else ""))
sys.exit(1 if fails else 0)

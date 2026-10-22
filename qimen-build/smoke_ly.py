#!/usr/bin/env python3
"""六爻验证（2026-10-22 三轮）：
- 第5项回归断言：排盘表 .lyx 在 390px 双主题下不溢出结果卡片（scrollWidth/右缘实测）
- 第6项新功能：手动录入起卦——逐爻录入/重选/退回/生成、所填时间装卦、历史来源标注、
  与摇卦路径同口径对照（同爻象同时间 → AI 文本与盘面一致）、抽查卦（乾→坤、既济静卦、讼→涣）
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
WWW = os.path.expanduser("~/workspace/wuri-web/www")
URL = "file://" + WWW + "/index.html"
OUT = os.path.expanduser("~/workspace/wuri-web/qimen-build/shots-ly")
os.makedirs(OUT, exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not ok: fails.append(name)

def main():
    port = free_port()
    chrome = subprocess.Popen(["/opt/meta-chromium/chrome", "--headless=old", "--no-sandbox", "--disable-gpu",
        "--allow-file-access-from-files", f"--remote-debugging-port={port}",
        "--remote-debugging-address=127.0.0.1", "--window-size=390,844", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2) as r:
                    pages = json.loads(r.read())
                ws_url = pages[0]["webSocketDebuggerUrl"]; break
            except Exception:
                time.sleep(0.4)
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        cdp.call("Page.addScriptToEvaluateOnNewDocument",
                 {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); localStorage.removeItem('ly_history'); } catch(e) {}"})
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.5)
        ev = lambda expr: cdp.evaluate(expr)

        def shot(name, scroll_expr=None):
            if scroll_expr:
                try: ev(scroll_expr + "; 'ok'")
                except Exception: pass
                time.sleep(0.45)
            r = cdp.call("Page.captureScreenshot", {"format": "png"})
            import base64
            open(os.path.join(OUT, name + ".png"), "wb").write(base64.b64decode(r["data"]))

        def overflow_measure():
            return ev("""(() => { const t = document.querySelector('.lyx');
              const card = document.getElementById('ly-result-card');
              if (!t || !card) return null;
              const cs = getComputedStyle(card);
              const contentRight = card.getBoundingClientRect().right
                - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
              const cells = [...t.querySelectorAll('tr td:nth-child(3)')];
              return { tableRight: +t.getBoundingClientRect().right.toFixed(1),
                contentRight: +contentRight.toFixed(1),
                maxCellRight: +Math.max(...cells.map(td => td.getBoundingClientRect().right)).toFixed(1),
                tableSW: t.scrollWidth,
                detailCW: document.getElementById('ly-yao-detail').clientWidth,
                viewSW: document.getElementById('view-liuyao').scrollWidth }; })()""")

        def check_overflow(theme):
            m = overflow_measure()
            check(f"[{theme}] 排盘表不溢出卡片", m and m["tableRight"] <= m["contentRight"] + 1
                  and m["maxCellRight"] <= m["contentRight"] + 1 and m["tableSW"] <= m["detailCW"] + 1
                  and m["viewSW"] <= 390, m)

        ev("document.getElementById('liuyao-enter').click(); 'ok'"); time.sleep(1.2)

        # ---------- Phase A：手动录入交互 ----------
        ev("document.getElementById('ly-mode-manual').click(); 'ok'"); time.sleep(0.4)
        ev("""(() => { const d = document.getElementById('ly-dt');
          d.value = '2024-12-25T14:00'; d.dispatchEvent(new Event('change', {bubbles:true})); return d.value; })()""")
        # 讼（自下而上 0,1,0,1,1,1），四爻老阳动 → 变涣（与用户截图同卦）
        PICKS = ["1,0,0", "1,1,0", "1,0,0", "1,1,1", "1,1,0", "1,1,0"]
        for i, c in enumerate(PICKS):
            ev(f"document.querySelector('.ly-m-btn[data-coins=\"{c}\"]').click(); 'ok'")
            time.sleep(0.15)
            if i == 0:
                t1 = ev("document.getElementById('ly-m-title').textContent")
                check("录1爻后标题=第2爻·二爻", "第 2 爻" in t1 and "二爻" in t1, t1)
        title = ev("document.getElementById('ly-m-title').textContent")
        check("录满6爻标题", "录满" in title, title)
        filled = ev("document.querySelectorAll('#ly-lines .ly-line:not(.empty)').length")
        check("预览已录6爻成型", filled == 6, filled)
        shot("day-01-manual", "document.getElementById('view-liuyao').scrollTop = 0")
        # 点已录的初爻（DOM 中最后一个已录元素）→ 重选
        ev("""(() => { const f = document.querySelectorAll('#ly-lines .ly-line:not(.empty)');
          f[f.length - 1].click(); return 'ok'; })()"""); time.sleep(0.2)
        t2 = ev("document.getElementById('ly-m-title').textContent")
        check("点初爻进入重选", "重选第 1 爻" in t2 and "初爻" in t2, t2)
        ev("document.querySelector('.ly-m-btn[data-coins=\"1,0,0\"]').click(); 'ok'"); time.sleep(0.2)
        t3 = ev("document.getElementById('ly-m-title').textContent")
        check("重选后回到录满态", "录满" in t3, t3)
        # 退回上一爻 → 第6爻待录、生成禁用
        ev("document.getElementById('ly-m-back').click(); 'ok'"); time.sleep(0.2)
        t4 = ev("document.getElementById('ly-m-title').textContent")
        cast_dis = ev("document.getElementById('ly-m-cast').disabled")
        check("退回后待录第6爻·上爻且生成禁用", "第 6 爻" in t4 and "上爻" in t4 and cast_dis is True, (t4, cast_dis))
        ev("document.querySelector('.ly-m-btn[data-coins=\"1,1,0\"]').click(); 'ok'"); time.sleep(0.2)

        # ---------- Phase B：生成卦象 + 溢出 + 历史 + AI 对照 ----------
        ev("document.getElementById('ly-m-cast').click(); 'ok'"); time.sleep(1.0)
        names = ev("document.querySelector('.ly-gua-names').textContent")
        check("本卦讼/变卦涣", "讼" in names and "涣" in names, names)
        detail = ev("document.getElementById('ly-yao-detail').textContent")
        head = ev("document.getElementById('ly-head-pro-inserted').textContent")
        check("按所填时间装卦（2024-12-25 14时）", "2024年12月25日" in head and "14时" in head, head[:80])
        check("四柱锚点（甲辰丙子癸亥己未）", all(s in detail for s in ("甲辰", "丙子", "癸亥", "己未")), detail[:60])
        check("世应标记在位", ("世" in detail and "应" in detail), "")
        for theme in ("day", "night"):
            ev(f"document.documentElement.setAttribute('data-theme','{theme}'); 'ok'"); time.sleep(0.5)
            check_overflow(theme)
            shot(f"{theme}-02-result", "document.getElementById('ly-result-card').scrollIntoView({block:'start'})")
        ev("document.documentElement.setAttribute('data-theme','day'); 'ok'"); time.sleep(0.4)
        hist = ev("""(() => { const h = JSON.parse(localStorage.getItem('ly_history') || '[]');
          const r = h[0] || {};
          return { n: h.length, src: r.src, gua: r.gua, bian: r.bian,
            timeEq: r.time ? (new Date(r.time).getTime() === new Date('2024-12-25T14:00').getTime()) : false }; })()""")
        check("历史标注来源=手动录入", hist["src"] == "manual", hist)
        check("历史存所填时间", hist["timeEq"] is True, hist)
        check("历史卦名讼→涣", hist["gua"] == "讼" and hist["bian"] == "涣", hist)
        item0 = ev("document.querySelector('#ly-history-list .ly-history-item').textContent")
        check("历史列表显示「手动录入」徽标", "手动录入" in item0, item0[:40])
        # AI 文本与盘面同口径对照（同爻象同时间，走 buildChartText）
        ev("window.LiuYao.buildChartText(); 'ok'")
        aitxt = ev("(window.__wuriChartText || {}).liuyao || ''")
        check("AI文本本卦/变卦一致", ("本卦：讼" in aitxt and "变卦：涣" in aitxt), aitxt[:60])
        check("AI文本四柱/时间一致", ("癸亥" in aitxt and "2024年12月25日 14时" in aitxt), aitxt[:120])

        # ---------- Phase C：抽查卦 ----------
        ev("document.getElementById('ly-m-clear').click(); 'ok'"); time.sleep(0.3)
        for _ in range(6):
            ev("document.querySelector('.ly-m-btn[data-coins=\"1,1,1\"]').click(); 'ok'"); time.sleep(0.12)
        ev("document.getElementById('ly-m-cast').click(); 'ok'"); time.sleep(0.9)
        names2 = ev("document.querySelector('.ly-gua-names').textContent")
        check("全老阳 → 乾变坤", "乾" in names2 and "坤" in names2, names2)
        check_overflow("day")
        ev("document.getElementById('ly-m-clear').click(); 'ok'"); time.sleep(0.3)
        for c in ["1,1,0", "1,0,0", "1,1,0", "1,0,0", "1,1,0", "1,0,0"]:  # 既济 101010，全静
            ev(f"document.querySelector('.ly-m-btn[data-coins=\"{c}\"]').click(); 'ok'"); time.sleep(0.12)
        ev("document.getElementById('ly-m-cast').click(); 'ok'"); time.sleep(0.9)
        names3 = ev("document.querySelector('.ly-gua-names').textContent")
        mv = ev("document.querySelectorAll('.lyx tr.lyx-mv').length")
        check("既济静卦（本变同名、无动爻行）", "既济" in names3 and names3.count("既济") >= 2 and mv == 0, (names3, mv))

        # ---------- Phase D：摇卦路径回归 + 共用时间字段 ----------
        ev("document.getElementById('ly-mode-shake').click(); 'ok'"); time.sleep(0.3)
        ev("document.getElementById('ly-shake-all').click(); 'ok'"); time.sleep(2.2)
        vis = ev("!document.getElementById('ly-result-card').hidden && !!document.querySelector('.lyx')")
        check("摇卦一键出六爻仍可排盘", vis is True, vis)
        head2 = ev("document.getElementById('ly-head-pro-inserted').textContent")
        check("摇卦共用所填时间", "2024年12月25日" in head2, head2[:80])
        check_overflow("day")

        errs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
        check("零 JS 异常", len(errs) == 0, len(errs))
        for e in errs[:3]: print("  EXC:", str(e)[:240])
    finally:
        chrome.terminate()
    print("\n结果：", "全过" if not fails else f"失败 {len(fails)} 项：{fails}")

if __name__ == "__main__":
    main()

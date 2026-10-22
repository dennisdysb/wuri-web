#!/usr/bin/env python3
"""二轮+三轮真机反馈修复验证：390x844 双主题。
三轮预期：四柱一行（非 2+2）、白天星点=0、时辰三钮同行等宽。
v1.4.0 列车新预期（2026-10-22）：动效整体下线（光晕/轻摆/入场全静态、动效开关已删）、
底部页签五项真等距（grid 等分列＋标签等宽，360/390/412/432 四档量框宽/文字间隙/中心步距）。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
WWW = os.path.expanduser("~/workspace/wuri-web/www")
URL = "file://" + WWW + "/index.html"
OUT = os.path.expanduser("~/workspace/wuri-web/qimen-build/shots-r2")
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
                 {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); localStorage.removeItem('qm_lite'); } catch(e) {}"})
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.5)
        ev = lambda expr: cdp.evaluate(expr)
        for _ in range(20):
            n = ev("document.querySelectorAll('#qm-wenGrid .wen-item').length")
            if n and n > 0: break
            time.sleep(0.5)

        def shot(name, scroll_expr=None):
            if scroll_expr:
                try: ev(scroll_expr + "; 'ok'")
                except Exception: pass
                time.sleep(0.45)
            r = cdp.call("Page.captureScreenshot", {"format": "png"})
            import base64
            open(os.path.join(OUT, name + ".png"), "wb").write(base64.b64decode(r["data"]))

        ev("document.getElementById('qimen-enter').click(); 'ok'"); time.sleep(1.0)

        for theme in ("day", "night"):
            ev(f"document.documentElement.setAttribute('data-theme','{theme}'); 'ok'"); time.sleep(0.6)
            # --- 问事页：第7项居中 ---
            ev("document.querySelector('#qm-root .tabbtn[data-t=\"wen\"]').click(); 'ok'"); time.sleep(0.5)
            cen = ev("""(() => { const it = document.querySelector('#qm-wenGrid .wen-item');
              const b = it.querySelector('b'); const ir = it.getBoundingClientRect(), br = b.getBoundingClientRect();
              return { ta: getComputedStyle(it).textAlign,
                       off: Math.abs((br.left + br.width/2) - (ir.left + ir.width/2)) }; })()""")
            check(f"[{theme}] 问事卡文字居中", cen["ta"] == "center" and cen["off"] < 4, cen)
            shot(f"{theme}-01-wen", "document.getElementById('view-qimen').scrollTop = 0")
            # --- 起盘（锚点） ---
            ev("document.querySelector('#qm-root .tabbtn[data-t=\"pan\"]').click(); 'ok'"); time.sleep(0.4)
            ev("document.getElementById('qm-dt').value='2024-12-25T14:00'; document.getElementById('qm-btnCast').click(); 'ok'")
            time.sleep(1.4)
            anchor = ev("document.getElementById('qm-sizhu').textContent + '|' + (document.getElementById('qm-metaPlain')||{}).textContent")
            check(f"[{theme}] 锚点四柱", all(s in anchor for s in ("甲辰年", "丙子月", "癸亥日", "己未时")), anchor[:40])
            check(f"[{theme}] 锚点值符值使", ("天英" in anchor and "景门" in anchor), anchor[40:120])
            # --- 第3项几何 ---
            geo = ev("""(() => { const out = [];
              document.querySelectorAll('#qm-grid .cell').forEach(c => {
                const f = c.querySelector('.cell-face'); if (!f) return;
                const door = f.querySelector('.door'), god = f.querySelector('.god'), b0 = f.querySelector('.badge.b0');
                const fr = f.getBoundingClientRect(), dr = door.getBoundingClientRect();
                const range = document.createRange(); range.selectNodeContents(door);
                const gr = god.getBoundingClientRect(), br = b0.getBoundingClientRect();
                const overlap = Math.max(0, Math.min(br.right, gr.right) - Math.max(br.left, gr.left)) *
                                Math.max(0, Math.min(br.bottom, gr.bottom) - Math.max(br.top, gr.top));
                out.push({ p: c.dataset.p, door: door.textContent, rects: range.getClientRects().length,
                  doorBottomGap: +(fr.bottom - dr.bottom).toFixed(1), badgeW: +br.width.toFixed(1),
                  badgeH: +br.height.toFixed(1), overlap: +overlap.toFixed(1) }); });
              return out; })()""")
            bad = [g for g in geo if g["p"] != "5" and (g["rects"] != 1 or g["doorBottomGap"] < 0 or g["badgeW"] > 27 or g["badgeH"] > 23 or g["overlap"] > 0)]
            check(f"[{theme}] 九宫文字不溢出/徽章不压字", not bad, json.dumps(bad, ensure_ascii=False))
            # --- 三轮第2项：四柱改回一行（用户否决 2+2） ---
            rows = ev("""(() => { const ps = [...document.querySelectorAll('#qm-sizhu .sz-p')];
              const ys = {}; ps.forEach(p => { const y = Math.round(p.getBoundingClientRect().top); ys[y] = (ys[y]||0)+1; });
              const sz = document.getElementById('qm-sizhu');
              return { rows: Object.values(ys), fs: parseFloat(getComputedStyle(sz).fontSize),
                       sw: sz.scrollWidth, cw: sz.clientWidth }; })()""")
            check(f"[{theme}] 四柱一行四段", rows["rows"] == [4], rows)
            check(f"[{theme}] 四柱字号≥16且不溢出", rows["fs"] >= 16 and rows["sw"] <= rows["cw"] + 1, rows)
            # --- 三轮第1项：时辰三钮同行等宽 ---
            btns = ev("""(() => { const ids = ['qm-btnNow','qm-btnPrev','qm-btnNext'];
              return ids.map(id => { const r = document.getElementById(id).getBoundingClientRect();
                return { top: Math.round(r.top), w: +r.width.toFixed(1) }; }); })()""")
            check(f"[{theme}] 时辰三钮同行", len({b["top"] for b in btns}) == 1, btns)
            check(f"[{theme}] 时辰三钮等宽", max(b["w"] for b in btns) - min(b["w"] for b in btns) <= 2, btns)
            # --- 底部页签五项等距（框宽一致、文字间隙一致） ---
            navm = ev("""(() => { const items = [...document.querySelectorAll('#qm-root nav .tabbtn')];
              const rs = items.map(el => el.getBoundingClientRect());
              const ts = items.map(el => el.querySelector('.qm-tl').getBoundingClientRect());
              const gaps = []; for (let i = 1; i < rs.length; i++) gaps.push(+(rs[i].left - rs[i-1].right).toFixed(1));
              const tgaps = []; for (let i = 1; i < ts.length; i++) tgaps.push(+(ts[i].left - ts[i-1].right).toFixed(1));
              return { ws: rs.map(r => +r.width.toFixed(1)), gaps, tws: ts.map(r => +r.width.toFixed(1)), tgaps }; })()""")
            check(f"[{theme}] 页签五项等宽", len(navm["ws"]) == 5 and max(navm["ws"]) - min(navm["ws"]) <= 1, navm)
            # 终版批：标签按字数分档（两字收窄、四字略收）——文字间隙不再求全等，
            # 改验悬殊比值 ≤1.6（旧全等宽时 2.4 倍即用户所报「问事后空档偏大」）
            check(f"[{theme}] 页签文字间隙悬殊≤1.6倍", max(navm["tgaps"]) / min(navm["tgaps"]) <= 1.6, navm)
            check(f"[{theme}] 标签分档定宽（两字窄于四字）",
                  abs(navm["tws"][0] - navm["tws"][1]) <= 1 and navm["tws"][0] < navm["tws"][2]
                  and max(navm["tws"][2:]) - min(navm["tws"][2:]) <= 1, navm)
            # --- 第1/6项间距 ---
            gap = ev("""(() => { const brief = document.getElementById('qm-brief');
              const view = document.getElementById('view-qimen');
              const disc = view.querySelector('details.disc-foot').closest('section');
              return +(disc.getBoundingClientRect().top - brief.lastElementChild.getBoundingClientRect().bottom).toFixed(1); })()""")
            check(f"[{theme}] 简报→免责卡间距 ≤30px", gap <= 30, gap)
            shot(f"{theme}-02-pan-top", "document.getElementById('view-qimen').scrollTop = 0")
            shot(f"{theme}-03-grid", "document.querySelector('#qm-root .plate').scrollIntoView({block:'start'})")
            shot(f"{theme}-04-brief", "document.getElementById('qm-brief').scrollIntoView({block:'start'})")
            # --- 动效下线证据：光晕无漂移、盘面无轻摆（静态） ---
            wname = ev("getComputedStyle(document.querySelector('#qm-root .sky-wash')).animationName")
            w1 = ev("getComputedStyle(document.querySelector('#qm-root .sky-wash')).transform")
            time.sleep(2.4)
            w2 = ev("getComputedStyle(document.querySelector('#qm-root .sky-wash')).transform")
            check(f"[{theme}] 光晕静态（无漂移）", wname == "none" and w1 == w2, f"anim={wname} {w1[:30]} -> {w2[:30]}")
            rys = []
            for _ in range(3):
                rys.append(ev("document.querySelector('#qm-root .plate').style.getPropertyValue('--ry')"))
                time.sleep(1.1)
            check(f"[{theme}] 盘面静态（无闲置轻摆）", len(set(rys)) == 1, rys)
            # 星层像素：双主题各自星色像素存在
            starpx = ev("""(() => { const cv = document.getElementById('qm-sky');
              const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
              let nz = 0, warm = 0, cream = 0;
              for (let i = 0; i < d.length; i += 4 * 7) {
                const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
                if (a > 0) { nz++; if (Math.abs(r-146)<26 && Math.abs(g-120)<26 && Math.abs(b-70)<26) warm++;
                             if (Math.abs(r-232)<14 && Math.abs(g-226)<14 && Math.abs(b-208)<14) cream++; } }
              return { nz, warm, cream }; })()""")
            if theme == "day":
                # 三轮第3项新预期：白天不绘制星点（像屏幕落灰）——画布全透明
                check(f"[{theme}] 白天星点=0（不绘制）", starpx["nz"] == 0 and starpx["warm"] == 0 and starpx["cream"] == 0, starpx)
            else:
                check(f"[{theme}] 夜间星点可见（奶油色）", starpx["cream"] > 20 and starpx["warm"] == 0, starpx)
            # 入场动画已下线：重排后末格 opacity 恒 1、无动画名
            ev("""window.__ops = []; clearInterval(window.__iv);
              window.__iv = setInterval(() => { const c = document.querySelector('#qm-grid .cell[data-p="6"]');
                if (c) window.__ops.push(+getComputedStyle(c).opacity);
                if (window.__ops.length > 40) clearInterval(window.__iv); }, 50); 'ok'""")
            ev("document.getElementById('qm-dt').value='2024-12-26T09:30'; document.getElementById('qm-btnCast').click(); 'ok'")
            time.sleep(2.2)
            ops = ev("window.__ops")
            aname = ev("getComputedStyle(document.querySelector('#qm-grid .cell[data-p=\"6\"]')).animationName")
            check(f"[{theme}] 无宫格入场动画（静态）",
                  aname == "none" and bool(ops) and all(o == 1 for o in ops),
                  f"anim={aname} ops={[round(o,2) for o in ops[:14]]}")
            shot(f"{theme}-05-vs", "document.querySelector('#qm-root .tabbtn[data-t=\"vs\"]').click()")
            time.sleep(0.4)
            ev("document.querySelector('#qm-root .tabbtn[data-t=\"pan\"]').click(); 'ok'"); time.sleep(0.6)

        # --- 动效开关已移除 + 页签五项多宽度等距（360/390/412/432） ---
        ev("document.documentElement.setAttribute('data-theme','day'); 'ok'"); time.sleep(0.5)
        gone = ev("document.getElementById('qm-btnLite') === null && document.querySelectorAll('#qm-root nav .tabbtn').length === 5")
        check("动效开关已移除、页签剩五项", gone is True, gone)
        NAVM = """(() => { const items = [...document.querySelectorAll('#qm-root nav .tabbtn')];
          const rs = items.map(el => el.getBoundingClientRect());
          const ts = items.map(el => el.querySelector('.qm-tl').getBoundingClientRect());
          const tgaps = []; for (let i = 1; i < ts.length; i++) tgaps.push(+(ts[i].left - ts[i-1].right).toFixed(1));
          const centers = rs.map(r => +(r.left + r.width / 2).toFixed(1));
          const csteps = []; for (let i = 1; i < centers.length; i++) csteps.push(+(centers[i] - centers[i-1]).toFixed(1));
          return { ws: rs.map(r => +r.width.toFixed(1)), tws: ts.map(r => +r.width.toFixed(1)), tgaps, csteps }; })()"""
        for wdt in (360, 390, 412, 432):
            cdp.call("Emulation.setDeviceMetricsOverride",
                     {"width": wdt, "height": 844, "deviceScaleFactor": 2, "mobile": True})
            time.sleep(0.5)
            nm = ev(NAVM)
            check(f"[{wdt}] 页签框等宽", max(nm["ws"]) - min(nm["ws"]) <= 1, nm["ws"])
            check(f"[{wdt}] 标签分档定宽", abs(nm["tws"][0] - nm["tws"][1]) <= 1 and nm["tws"][0] < nm["tws"][2]
                  and max(nm["tws"][2:]) - min(nm["tws"][2:]) <= 1, nm["tws"])
            check(f"[{wdt}] 文字间隙悬殊≤1.6倍", max(nm["tgaps"]) / min(nm["tgaps"]) <= 1.6, nm["tgaps"])
            check(f"[{wdt}] 中心步距均匀", max(nm["csteps"]) - min(nm["csteps"]) <= 1.5, nm["csteps"])
            if wdt in (360, 412):
                shot(f"day-nav-{wdt}", "document.getElementById('view-qimen').scrollTop = 0")
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        time.sleep(0.4)

        # --- 第6项：其他三视图页脚间距基线（强制显示测流式间距，与滚动无关） ---
        for vid in ("bazi-view", "view-ziwei", "view-liuyao"):
            g = ev(f"""(() => {{ const v = document.getElementById('{vid}'); if (!v) return 'no-view';
              const old = v.style.display; v.style.display = 'block';
              const disc = v.querySelector('details.disc-foot'); if (!disc) {{ v.style.display = old; return 'no-disc'; }}
              const card = disc.closest('section');
              let prev = card.previousElementSibling;
              while (prev && (prev.getBoundingClientRect().height === 0 || getComputedStyle(prev).display === 'none'))
                prev = prev.previousElementSibling;
              const gap = prev ? +(card.getBoundingClientRect().top - prev.getBoundingClientRect().bottom).toFixed(1) : null;
              v.style.display = old; return gap; }})()""")
            print(f"disc gap [{vid}]:", g)

        # --- 全站快速回归：重载后奇门入口与文格可建、零异常 ---
        cdp.call("Page.navigate", {"url": URL}); time.sleep(3.2)
        for _ in range(20):
            n = ev("document.querySelectorAll('#qm-wenGrid .wen-item').length")
            if n and n > 0: break
            time.sleep(0.5)
        check("重载后问事格可建", bool(n), n)
        errs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
        check("零 JS 异常", len(errs) == 0, len(errs))
        for e in errs[:3]: print("  EXC:", str(e)[:240])
    finally:
        chrome.terminate()
    print("\n结果：", "全过" if not fails else f"失败 {len(fails)} 项：{fails}")

if __name__ == "__main__":
    main()

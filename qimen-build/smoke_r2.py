#!/usr/bin/env python3
"""二轮真机反馈修复验证：六项 + 第7项，390x844 双主题，动画客观证据。"""
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
            # --- 第5项四柱 2+2 ---
            rows = ev("""(() => { const ps = [...document.querySelectorAll('#qm-sizhu .sz-p')];
              const ys = {}; ps.forEach(p => { const y = Math.round(p.getBoundingClientRect().top); ys[y] = (ys[y]||0)+1; });
              return Object.values(ys); })()""")
            check(f"[{theme}] 四柱 2+2 两行", rows == [2, 2], rows)
            # --- 第1/6项间距 ---
            gap = ev("""(() => { const brief = document.getElementById('qm-brief');
              const view = document.getElementById('view-qimen');
              const disc = view.querySelector('details.disc-foot').closest('section');
              return +(disc.getBoundingClientRect().top - brief.lastElementChild.getBoundingClientRect().bottom).toFixed(1); })()""")
            check(f"[{theme}] 简报→免责卡间距 ≤30px", gap <= 30, gap)
            shot(f"{theme}-02-pan-top", "document.getElementById('view-qimen').scrollTop = 0")
            shot(f"{theme}-03-grid", "document.querySelector('#qm-root .plate').scrollIntoView({block:'start'})")
            shot(f"{theme}-04-brief", "document.getElementById('qm-brief').scrollIntoView({block:'start'})")
            # --- 第4项动画证据 ---
            w1 = ev("getComputedStyle(document.querySelector('#qm-root .sky-wash')).transform")
            time.sleep(2.4)
            w2 = ev("getComputedStyle(document.querySelector('#qm-root .sky-wash')).transform")
            check(f"[{theme}] 光晕漂移在动", w1 != w2, f"{w1[:38]} -> {w2[:38]}")
            # 闲置轻摆：采样 --ry（需闲置 >2.6s，前面已等待足够）
            rys = []
            for _ in range(3):
                rys.append(ev("document.querySelector('#qm-root .plate').style.getPropertyValue('--ry')"))
                time.sleep(1.1)
            check(f"[{theme}] 盘面闲置轻摆在动", len(set(rys)) >= 2, rys)
            # 星层像素：双主题各自星色像素存在
            starpx = ev("""(() => { const cv = document.getElementById('qm-sky');
              const d = cv.getContext('2d').getImageData(0, 0, cv.width, Math.min(cv.height, 300)).data;
              let nz = 0, warm = 0, cream = 0;
              for (let i = 0; i < d.length; i += 4 * 7) {
                const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
                if (a > 0) { nz++; if (Math.abs(r-146)<26 && Math.abs(g-120)<26 && Math.abs(b-70)<26) warm++;
                             if (Math.abs(r-232)<14 && Math.abs(g-226)<14 && Math.abs(b-208)<14) cream++; } }
              return { nz, warm, cream }; })()""")
            if theme == "day":
                check(f"[{theme}] 亮主题星点可见（暖灰金）", starpx["warm"] > 20 and starpx["cream"] == 0, starpx)
            else:
                check(f"[{theme}] 夜间星点可见（奶油色）", starpx["cream"] > 20 and starpx["warm"] == 0, starpx)
            # 入场动画：页内 50ms 采样末格 opacity（避开 CDP 往返延迟）
            ev("""window.__ops = []; clearInterval(window.__iv);
              window.__iv = setInterval(() => { const c = document.querySelector('#qm-grid .cell[data-p="6"]');
                if (c) window.__ops.push(+getComputedStyle(c).opacity);
                if (window.__ops.length > 40) clearInterval(window.__iv); }, 50); 'ok'""")
            ev("document.getElementById('qm-dt').value='2024-12-26T09:30'; document.getElementById('qm-btnCast').click(); 'ok'")
            time.sleep(2.2)
            ops = ev("window.__ops")
            aname = ev("getComputedStyle(document.querySelector('#qm-grid .cell[data-p=\"6\"]')).animationName")
            check(f"[{theme}] 宫格入场动画（opacity 渐入）",
                  aname == "qmCellIn" and any(o < 0.98 for o in ops[:16]) and ops[-1] == 1,
                  f"anim={aname} ops={[round(o,2) for o in ops[:14]]}")
            shot(f"{theme}-05-vs", "document.querySelector('#qm-root .tabbtn[data-t=\"vs\"]').click()")
            time.sleep(0.4)
            ev("document.querySelector('#qm-root .tabbtn[data-t=\"pan\"]').click(); 'ok'"); time.sleep(0.6)

        # --- 动效关：确实静止 ---
        ev("document.documentElement.setAttribute('data-theme','night'); 'ok'"); time.sleep(0.5)
        ev("document.getElementById('qm-btnLite').click(); 'ok'"); time.sleep(0.3)
        off = ev("""(() => ({ motion: document.getElementById('qm-root').getAttribute('data-motion'),
          wash: getComputedStyle(document.querySelector('#qm-root .sky-wash')).animationName,
          ry: document.querySelector('#qm-root .plate').style.getPropertyValue('--ry') }))()""")
        time.sleep(1.6)
        off2 = ev("document.querySelector('#qm-root .plate').style.getPropertyValue('--ry')")
        check("[关] 动效关状态", off["motion"] == "off" and off["wash"] == "none", off)
        check("[关] 轻摆停止", off["ry"] == off2, (off["ry"], off2))
        ev("document.getElementById('qm-btnLite').click(); 'ok'"); time.sleep(0.3)

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

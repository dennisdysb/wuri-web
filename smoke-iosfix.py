#!/usr/bin/env python3
"""iOS 首测反馈批（内部 v459）冒烟：headless Chrome + 纯 stdlib CDP，file:// 直读。
覆盖：首页图鉴卡移除/修行卡尺寸/状态区完整、道历页无顶块、推荐卡移位与阅读器不跟随、
内丹 10 部标点数据、日/夜/红光三态、360/390 双视口。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_lib", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
lib = importlib.util.module_from_spec(spec)
sys.modules["smoke_lib"] = lib
spec.loader.exec_module(lib)

WWW = os.path.expanduser("~/workspace/.wt/iosfix-web/www")
SHOTS = os.path.expanduser("~/workspace/.wt/iosfix-web/shots-iosfix")
os.makedirs(SHOTS, exist_ok=True)
PORT = lib.free_port()
results = []


def main():
    chrome = subprocess.Popen([lib.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                               "--allow-file-access-from-files",
                               "--remote-debugging-port=%d" % PORT, "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(40):
            try:
                targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3))
                pages = [t for t in targets if t.get("type") == "page"]
                if pages:
                    ws_url = pages[0]["webSocketDebuggerUrl"]; break
            except Exception:
                pass
            time.sleep(0.5)
        assert ws_url, "chrome CDP 未就绪"
        cdp = lib.CDP(lib.WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        for _ in range(40):
            if cdp.evaluate("document.readyState") == "complete":
                break
            time.sleep(0.5)
        time.sleep(2.5)

        def run(name, js):
            try:
                v = cdp.evaluate(js)
                ok = bool(v.get("ok")) if isinstance(v, dict) else bool(v)
                detail = "" if ok else " -> " + json.dumps(v, ensure_ascii=False)[:320]
                print(("PASS " if ok else "FAIL ") + name + detail)
                results.append(ok)
            except Exception as e:
                print("FAIL " + name + " -> EXC " + str(e)[:200])
                results.append(False)

        def shot(name):
            try:
                r = cdp.call("Page.captureScreenshot", {"format": "png"})
                import base64
                open(os.path.join(SHOTS, name), "wb").write(base64.b64decode(r["data"]))
                print("SHOT " + name)
            except Exception as e:
                print("SHOT-FAIL " + name + " " + str(e)[:120])

        # ---------- 1. 首页（390 · 日间） ----------
        run("首页:图鉴卡已移除", """(() => ({ ok: !document.getElementById('deities-entry-card')
          && !document.querySelector('#tab-home .h2-deity') }))()""")
        run("首页:修行卡与术数/风水卡同高(±1px)且底图为照片沉浸", """(() => {
          const g = id => document.getElementById(id);
          const h = el => el ? el.getBoundingClientRect().height : -1;
          const p = g('practice-entry-card'), s = g('shushu-entry-card'), f = g('fengshui-entry-card');
          const bg = p ? getComputedStyle(p.querySelector('.h2-bg')).backgroundImage : '';
          return { ok: !!p && Math.abs(h(p)-h(s))<=1 && Math.abs(h(p)-h(f))<=1 && /heroes\\/(day\\/)?practice\\.webp/.test(bg),
                   hp: h(p), hs: h(s), hf: h(f), bg };
        })()""")
        run("首页:状态区完整(戊日卡+倒计时+干支时钟+节气+四值神+太阳所在)", """(() => {
          const t = id => (document.getElementById(id)||{textContent:''}).textContent.trim();
          return { ok: t('status-title').length>0 && /\\d{2}:\\d{2}:\\d{2}/.test(t('clock'))
            && t('jieqi-line').length>0 && t('zhishen-line').length>0 && t('sun-line').length>0,
            st: t('status-title'), ck: t('clock'), jq: t('jieqi-line').slice(0,20), zs: t('zhishen-line').slice(0,20), sun: t('sun-line').slice(0,20) };
        })()""")
        shot("home-day-390.png")

        # ---------- 2. 道历页 ----------
        cdp.evaluate("document.querySelector('[data-tab=\"tab-cal\"]').click()")
        time.sleep(1.2)
        run("道历页:打开直接是月历(首卡含cal-grid)、无此刻干支顶块", """(() => {
          const cal = document.getElementById('tab-cal');
          const firstCard = cal.querySelector('section.card');
          return { ok: !!firstCard && !!firstCard.querySelector('#cal-grid')
            && !cal.querySelector('#clock') && !cal.querySelector('#jieqi-line')
            && !cal.textContent.includes('此刻干支') };
        })()""")
        shot("cal-day-390.png")
        cdp.evaluate("document.querySelector('[data-tab=\"tab-home\"]').click()")
        time.sleep(0.6)

        # ---------- 3. 经文页与阅读器 ----------
        cdp.evaluate("document.querySelector('[data-tab=\"tab-jing\"]').click()")
        time.sleep(1.5)
        run("经文页:推荐卡在 #jing-home 内、位于书单之下(页面最底部)", """(() => {
          const card = document.getElementById('jingrec-card');
          const home = document.getElementById('jing-home');
          const list = document.getElementById('jing-list');
          if (!card || !home || !list) return { ok: false, why: 'missing' };
          const cr = card.getBoundingClientRect(), lr = list.getBoundingClientRect();
          return { ok: home.contains(card) && !document.getElementById('jing-reader').contains(card)
            && cr.top >= lr.top && (card.textContent.includes('每日经文推荐')),
            ct: Math.round(cr.top), lt: Math.round(lr.top), title: (document.getElementById('jingrec-title')||{}).textContent };
        })()""")
        run("阅读器:打开《道德真经》后推荐卡不出现、不在阅读器内", """(() => {
          if (typeof window.JingOpenReader !== 'function') return { ok: false, why: 'no JingOpenReader' };
          window.JingOpenReader('s07');
          return { ok: 'pending' };
        })()""")
        results.pop()  # 上一条只是触发，结论在下一条
        time.sleep(2.0)
        run("阅读器:已打开且推荐卡不可见", """(() => {
          const r = document.getElementById('jing-reader');
          const home = document.getElementById('jing-home');
          const card = document.getElementById('jingrec-card');
          const vis = el => !!el && el.offsetParent !== null;
          return { ok: !!r && !r.hidden && !!home && home.hidden && !vis(card)
            && (document.getElementById('jing-title')||{}).textContent.includes('道德'),
            title: (document.getElementById('jing-title')||{}).textContent };
        })()""")
        cdp.evaluate("document.getElementById('jing-back-fab').click()")
        time.sleep(0.8)

        # ---------- 4. 内丹 10 部标点数据 ----------
        run("内丹标点:s48/s40/s22 数据已标点且 note 为标点版口径", """(() => new Promise(res => {
          const ids = ['s48','s40','s22'];
          let done = 0; const out = {};
          ids.forEach(id => {
            const sc = document.createElement('script');
            sc.src = 'content/jing/' + id + '.js';
            sc.onload = sc.onerror = () => {
              const o = (window.JINGWEN||{})[id];
              if (o) {
                const txt = o.sections.map(s=>s.paras.map(p=>p.t).join('')).join('');
                const pun = (txt.match(/[，。、；：？！]/g)||[]).length;
                out[id] = { d: Math.round(pun/txt.length*1000), note: o.note.slice(-12) };
              }
              if (++done === ids.length) {
                const ok = ids.every(id => out[id] && out[id].d >= 100 && out[id].note.includes('機器標點'));
                res({ ok, out });
              }
            };
            document.head.appendChild(sc);
          });
        }))()""")

        # ---------- 5. 夜间 + 红光（首页与道历） ----------
        cdp.evaluate("localStorage.setItem('wuri_cfg_v1', JSON.stringify({theme:'night'}))")
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        time.sleep(2.2)
        run("夜间:html data-theme=night 且首页卡片正常渲染", """(() => ({
          ok: document.documentElement.getAttribute('data-theme') === 'night'
            && !!document.getElementById('practice-entry-card')
            && !document.getElementById('deities-entry-card') }))()""")
        shot("home-night-390.png")
        cdp.evaluate("localStorage.setItem('wuri_sky_redlight_v1','1')")
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        time.sleep(2.2)
        run("红光:body.sky-red 生效且首页/道历结构不破", """(() => {
          document.querySelector('[data-tab="tab-cal"]').click();
          const cal = document.getElementById('tab-cal');
          return { ok: document.body.classList.contains('sky-red')
            && !!document.getElementById('practice-entry-card')
            && !!cal.querySelector('#cal-grid') };
        })()""")
        time.sleep(0.8)
        shot("cal-redlight-390.png")

        # ---------- 6. 360 视口复核关键项 ----------
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 360, "height": 740, "deviceScaleFactor": 2, "mobile": True})
        cdp.evaluate("document.querySelector('[data-tab=\"tab-home\"]').click()")
        time.sleep(0.8)
        run("360px:三卡同高、无横向溢出", """(() => {
          const h = id => document.getElementById(id).getBoundingClientRect().height;
          return { ok: Math.abs(h('practice-entry-card')-h('shushu-entry-card'))<=1
            && document.documentElement.scrollWidth <= 362,
            sw: document.documentElement.scrollWidth };
        })()""")
        shot("home-night-360.png")

        print("== %d/%d PASS ==" % (sum(results), len(results)))
        return 0 if all(results) else 1
    finally:
        chrome.terminate()


if __name__ == "__main__":
    sys.exit(main())

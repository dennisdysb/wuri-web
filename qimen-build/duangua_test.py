#!/usr/bin/env python3
"""六爻断卦层回归（2026-10-22）：
- 引擎级黄金例（经手工复核纳甲与规则）：化进/化退/回头生/回头克/反吟/伏吟/
  用神月破/用神旬空/用神不上卦（伏神）各一例 + 讼→涣锚点 + 婚恋性别取用
- UI 全流程：起卦区选事类→手动录入→判读卡五段/卡尾红线小字/双主题不溢出、
  结果头分类与起卦区联动重算、AI 文本含【结构判读】且与卡口径一致、零 JS 异常
黄金例来源：duangua_search.py 遍历定位后逐例手工验算（见脚本内注释）。"""
import importlib.util, json, os, subprocess, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
WWW = os.path.expanduser("~/workspace/wuri-web-duangua/www")
URL = "file://" + WWW + "/index.html"
OUT = os.path.expanduser("~/workspace/wuri-web-duangua/qimen-build/shots-dg")
os.makedirs(OUT, exist_ok=True)
fails = []

def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not ok: fails.append(name)

ENGINE_JS = r"""
(() => {
  const mk = (bits, mask) => bits.map((b, i) => ({ yao: b, dong: !!((mask >> i) & 1) }));
  const D = s => new Date(s);
  const rows = (la, date, topic, gender) => {
    const dg = window.LiuYao.duan(la, date, topic, gender || 'm');
    const o = {};
    dg.rows.forEach(r => { o[r.label] = r.items.join(' '); });
    return o;
  };
  const out = {};
  // 化进神：复(100000)二爻动，庚寅木→丁卯木，寅→卯顺进
  out.jin = rows(mk([1,0,0,0,0,0], 2), D('2024-12-25T14:00:00'), '');
  // 化退神：师(010000)初二三爻动，三爻戊辰土→己丑土，辰→丑逆退
  out.tui = rows(mk([0,1,0,0,0,0], 7), D('2024-12-25T14:00:00'), '');
  // 回头生：坤(000000)初二爻动，初爻乙未土←变爻丁巳火生
  out.huisheng = rows(mk([0,0,0,0,0,0], 3), D('2024-12-25T14:00:00'), '');
  // 回头克：坤(000000)三爻动，乙卯木←变爻丙申金克
  out.huike = rows(mk([0,0,0,0,0,0], 4), D('2024-12-25T14:00:00'), '');
  // 反吟：坤(000000)二三爻动，二爻乙巳火→变支亥水冲
  out.fanyin = rows(mk([0,0,0,0,0,0], 6), D('2024-12-25T14:00:00'), '');
  // 伏吟：复(100000)二三爻动，二爻庚寅→甲寅同支
  out.fuyin = rows(mk([1,0,0,0,0,0], 6), D('2024-12-25T14:00:00'), '');
  // 用神不上卦：谦(001000)静卦求财，无妻财，伏神妻财丁卯伏于二爻之下
  out.bushang = rows(mk([0,0,1,0,0,0], 0), D('2024-12-25T14:00:00'), 'cai');
  // 用神旬空：坤(000000)静卦求财，用神五爻妻财癸亥，2025-01-01 亥逢旬空
  out.xunkong = rows(mk([0,0,0,0,0,0], 0), D('2025-01-01T12:00:00'), 'cai');
  // 用神月破：师(010000)静卦求财，用神三爻妻财戊午火，2025-01-01 子月冲午
  out.yuepo = rows(mk([0,1,0,0,0,0], 0), D('2025-01-01T12:00:00'), 'cai');
  // 锚点：讼(010111)四爻动→涣，2024-12-25，应生世、四爻世自发动化泄
  out.anchor = rows(mk([0,1,0,1,1,1], 8), D('2024-12-25T14:00:00'), '');
  // 婚恋取用：讼卦女问官鬼（不上卦走伏神）/男问妻财壬申
  out.hunF = rows(mk([0,1,0,1,1,1], 8), D('2024-12-25T14:00:00'), 'hun', 'f');
  out.hunM = rows(mk([0,1,0,1,1,1], 8), D('2024-12-25T14:00:00'), 'hun', 'm');
  return out;
})()
"""

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
                 {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); localStorage.removeItem('ly_history'); localStorage.removeItem('wuri_ly_topic'); localStorage.removeItem('wuri_ly_cat'); } catch(e) {}"})
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

        # ---------- Part 1：引擎黄金例 ----------
        R = ev(ENGINE_JS)
        check("黄金·化进神（复二爻 寅→卯）", "化进神（寅→卯" in R["jin"]["动爻"], R["jin"]["动爻"][:80])
        check("黄金·化退神（师三爻 辰→丑）", "化退神（辰→丑" in R["tui"]["动爻"], R["tui"]["动爻"][:120])
        check("黄金·回头生（坤初爻 巳火生未土）", "回头生（变爻巳火生本爻）" in R["huisheng"]["动爻"], R["huisheng"]["动爻"][:120])
        check("黄金·回头克（坤三爻 申金克卯木）", "回头克（变爻申金克本爻）" in R["huike"]["动爻"], R["huike"]["动爻"][:120])
        check("黄金·反吟（坤二爻 巳→亥冲）", "反吟：变支亥冲本支巳" in R["fanyin"]["格局"], R["fanyin"]["格局"][:120])
        check("黄金·伏吟（复二爻 寅→寅）", "伏吟：动而变支与本支相同（同为寅" in R["fuyin"]["格局"], R["fuyin"]["格局"][:120])
        check("黄金·用神不上卦（谦求财·伏神妻财丁卯伏二爻）",
              "不上卦" in R["bushang"]["用神"] and "伏神为 妻财丁卯" in R["bushang"]["用神"] and "伏于二爻" in R["bushang"]["用神"],
              R["bushang"]["用神"][:160])
        check("黄金·用神旬空（坤求财·妻财癸亥逢空）",
              "妻财癸亥" in R["xunkong"]["用神"] and "逢旬空" in R["xunkong"]["旺衰"],
              (R["xunkong"]["用神"][:60], R["xunkong"]["旺衰"][:80]))
        check("黄金·用神月破（师求财·妻财戊午逢子月冲）",
              "妻财戊午" in R["yuepo"]["用神"] and "月破（逢月建冲破）" in R["yuepo"]["旺衰"],
              (R["yuepo"]["用神"][:60], R["yuepo"]["旺衰"][:80]))
        check("锚点·讼涣世应=应生世", "应生世" in R["anchor"]["世应"], R["anchor"]["世应"][:100])
        check("锚点·讼四爻世自发动+化泄", "自身发动" in R["anchor"]["动爻"] and "泄气化出" in R["anchor"]["动爻"], R["anchor"]["动爻"][:120])
        check("婚恋女问取官鬼（讼卦官鬼走伏神）", "女问" in R["hunF"]["用神"] and "官鬼" in R["hunF"]["用神"], R["hunF"]["用神"][:100])
        check("婚恋男问取妻财壬申", "男问" in R["hunM"]["用神"] and "妻财壬申" in R["hunM"]["用神"], R["hunM"]["用神"][:100])

        # ---------- Part 2：UI 全流程 ----------
        ev("document.getElementById('liuyao-enter').click(); 'ok'"); time.sleep(1.2)
        ev("""(() => { const s = document.getElementById('ly-topic-sel');
          s.value = 'cai'; s.dispatchEvent(new Event('change', {bubbles:true})); return s.value; })()""")
        time.sleep(0.3)
        gw = ev("document.getElementById('ly-gender-wrap').hidden")
        check("选求财后性别行隐藏", gw is True, gw)
        ev("""(() => { const s = document.getElementById('ly-topic-sel');
          s.value = 'hun'; s.dispatchEvent(new Event('change', {bubbles:true})); return s.value; })()""")
        time.sleep(0.3)
        gw2 = ev("document.getElementById('ly-gender-wrap').hidden")
        check("选婚恋后性别行出现", gw2 is False, gw2)
        ev("""(() => { const s = document.getElementById('ly-topic-sel');
          s.value = 'cai'; s.dispatchEvent(new Event('change', {bubbles:true})); return s.value; })()""")
        time.sleep(0.3)
        ev("document.getElementById('ly-mode-manual').click(); 'ok'"); time.sleep(0.4)
        ev("""(() => { const d = document.getElementById('ly-dt');
          d.value = '2024-12-25T14:00'; d.dispatchEvent(new Event('change', {bubbles:true})); return d.value; })()""")
        for c in ["1,0,0", "1,1,0", "1,0,0", "1,1,1", "1,1,0", "1,1,0"]:
            ev(f"document.querySelector('.ly-m-btn[data-coins=\"{c}\"]').click(); 'ok'"); time.sleep(0.12)
        ev("document.getElementById('ly-m-cast').click(); 'ok'"); time.sleep(1.0)
        card = ev("document.getElementById('ly-duan') ? document.getElementById('ly-duan').textContent : ''")
        check("判读卡出现", "卦象判读" in card, card[:40])
        for lab in ("用神", "旺衰", "世应", "动爻", "格局"):
            check(f"判读卡含「{lab}」段", lab in card)
        check("判读卡·求财用神=妻财壬申", "妻财壬申" in card, card[:200])
        check("判读卡·卡尾红线小字（固定文案）", "以上为卦象结构判读，供文化研究参考，不作吉凶断语。" in card)
        bad = [w for w in ("大吉", "大凶", "必然", "一定能", "必成") if w in card]
        check("判读卡红线扫描（无断语词）", not bad, bad)
        hv = ev("document.getElementById('ly-cat-sel').value")
        check("结果头分类同步=cai", hv == "cai", hv)
        ev("""(() => { const s = document.getElementById('ly-cat-sel');
          s.value = 'xing'; s.dispatchEvent(new Event('change', {bubbles:true})); return s.value; })()""")
        time.sleep(0.8)
        card2 = ev("document.getElementById('ly-duan').textContent")
        check("结果头改事类→判读重算（出行取世爻）", "用神（世爻自身）" in card2, card2[:200])
        tv = ev("document.getElementById('ly-topic-sel').value")
        check("起卦区事类被反向同步=xing", tv == "xing", tv)

        def card_overflow():
            return ev("""(() => { const c = document.getElementById('ly-duan');
              const card = document.getElementById('ly-result-card');
              if (!c || !card) return null;
              const cs = getComputedStyle(card);
              const contentRight = card.getBoundingClientRect().right
                - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
              return { cardRight: +c.getBoundingClientRect().right.toFixed(1),
                       contentRight: +contentRight.toFixed(1), sw: c.scrollWidth, cw: c.clientWidth }; })()""")
        for theme in ("day", "night"):
            ev(f"document.documentElement.setAttribute('data-theme','{theme}'); 'ok'"); time.sleep(0.5)
            m = card_overflow()
            check(f"[{theme}] 判读卡不溢出", m and m["cardRight"] <= m["contentRight"] + 1 and m["sw"] <= m["cw"] + 1, m)
            shot(f"dg-{theme}", "document.getElementById('ly-duan').scrollIntoView({block:'center'})")
        ev("document.documentElement.setAttribute('data-theme','day'); 'ok'"); time.sleep(0.4)
        ev("window.LiuYao.buildChartText(); 'ok'")
        aitxt = ev("(window.__wuriChartText || {}).liuyao || ''")
        check("AI文本含【结构判读】段", "【结构判读】" in aitxt, aitxt[-200:])
        check("AI文本判读与卡一致（世爻壬午）", "世爻＝问卦人自身：四爻 兄弟壬午" in aitxt, aitxt[-300:])
        check("AI文本事类=出行", "占问分类：出行" in aitxt, aitxt[:80])

        errs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
        check("零 JS 异常", len(errs) == 0, len(errs))
        for e in errs[:3]: print("  EXC:", str(e)[:240])
    finally:
        chrome.terminate()
    print("\n结果：", "全过" if not fails else f"失败 {len(fails)} 项：{fails}")

if __name__ == "__main__":
    main()

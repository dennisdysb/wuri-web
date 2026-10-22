#!/usr/bin/env python3
"""「排盘工具说人话」批 CDP 冒烟＋样本生成（file:// 直读，管线复用 zw_bz_upgrade_test）。

覆盖：
- 三个 AI 按钮（八字 bz/紫微 zw/六爻 ly）正下方说明小字：存在、文案精确、紧随按钮行
- 八字按钮说明显隐与按钮本体同步（input 页签隐藏 / result 页签显示）
- 三套提示词实际拼装样本（固定输入）落盘 ai-prompt-samples/，并做结构断言：
  八字 1990-01-01 23:30 男（流派2）：【四柱】【五行力量】【大运】当前标记【今年流年】、日柱锚点
  紫微 同人：【十二宫】12 宫齐全【命宫三方四正】【当前运限】
  六爻 固定爻象（原型补丁喂 crypto）：本卦水火既济→变卦风雷益、参考用神（事业→官鬼）、六神/世应/旬空
- 亮/暗主题截图 ai-prompt-shots/，全程 JS 异常收集
用法：python3 ai_prompt_test.py
"""
import base64, json, os, shutil, subprocess, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zw_bz_upgrade_test import WS, CDP, boot, free_port, CHROME

ROOT = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(ROOT, "ai-prompt-shots")
SAMPLES = os.path.join(ROOT, "ai-prompt-samples")
HINT_TEXT = "点按此按钮，盘面信息会自动复制；跳转到 DeepSeek 后，直接粘贴发送即可，无需手动输入。"

FAILS = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not cond:
        FAILS.append(name)


def shot(cdp, name):
    cdp.call("Emulation.setDeviceMetricsOverride",
             {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    time.sleep(0.4)
    r = cdp.call("Page.captureScreenshot", {"format": "png"})
    data = r.get("result", {}).get("data")
    if data:
        with open(os.path.join(SHOTS, name), "wb") as f:
            f.write(base64.b64decode(data))
    return bool(data)


STUB_JS = """(() => {
  window.__cap = null; window.__opened = null;
  var capFn = function (t) { window.__cap = t; return Promise.resolve(); };
  try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: capFn } }); }
  catch (e) { try { navigator.clipboard.writeText = capFn; } catch (e2) {} }
  window.open = function (u) { window.__opened = u; return { closed: false, focus: function () {} }; };
  return 'stubbed';
})()"""

HINT_PROBE = """((id) => {
  const b = document.getElementById(id); if (!b) return null;
  const row = b.closest('.btn-row') || b.parentNode;
  const h = row.nextElementSibling;
  if (!h) return { found: false };
  return { found: true, tag: h.tagName, cls: h.className, text: h.textContent,
           hidden: h.hidden, isHint: h.textContent.indexOf('自动复制') >= 0,
           color: getComputedStyle(h).color, fs: getComputedStyle(h).fontSize };
})"""

BAZI_SET = """(() => {
  document.getElementById('bz-date').value = '1990-01-01';
  document.getElementById('bz-time').value = '23:30';
  document.querySelector('input[name="bz-gender"][value="1"]').checked = true;
  document.querySelector('input[name="bz-sect"][value="2"]').checked = true;
  document.getElementById('bz-true').checked = false;
  document.getElementById('bz-save').checked = false;
  document.getElementById('bz-go').click(); return 'go'; })()"""


def main():
    os.makedirs(SHOTS, exist_ok=True)
    os.makedirs(SAMPLES, exist_ok=True)
    port = free_port()
    prof = "/tmp/ai-prompt-profile"
    shutil.rmtree(prof, ignore_errors=True)
    chrome = subprocess.Popen([CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                               "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
                               "--window-size=500,1100", "about:blank"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(60):
            try:
                with urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=2) as f:
                    pages = json.load(f)
                for p in pages:
                    if p.get("type") == "page":
                        ws_url = p["webSocketDebuggerUrl"]
                        break
                if ws_url:
                    break
            except Exception:
                time.sleep(0.5)
        assert ws_url, "CDP 未就绪"
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source":
            "window.__bootMark = Math.random();"
            "window.__errs=[]; window.addEventListener('error', function(e){ window.__errs.push(String(e.message||e.type)); });"
            "window.__lyBitsOn = false;"
            "(function(){ var bits=[0,1,0, 1,1,0, 1,0,0, 1,1,1, 0,1,0, 1,0,1, 0,0,0]; var i=0;"
            " var orig = Crypto.prototype.getRandomValues;"
            " Crypto.prototype.getRandomValues = function(arr){"
            "   if (window.__lyBitsOn && arr && arr.length === 1 && i < bits.length) { arr[0] = bits[i++]; return arr; }"
            "   return orig.call(this, arr); }; })();"})
        boot(cdp)
        cdp.ev("localStorage.setItem('wuri_pro_redeem','1'); 'ok'")
        boot(cdp)
        cdp.ev(STUB_JS)

        # ---------- 按钮说明：三处存在性与文案 ----------
        for bid in ("bz-ai-btn", "zw-ai-btn", "ly-ai-btn"):
            info = cdp.ev("%s(%r)" % (HINT_PROBE, bid))
            check("说明存在 %s" % bid, bool(info and info.get("found") and info.get("isHint")), info)
            if info and info.get("found"):
                check("说明文案精确 %s" % bid, info.get("text") == HINT_TEXT, info.get("text"))

        # ---------- 八字样本 ----------
        cdp.ev("document.getElementById('bazi-enter').click(); 'x'")
        time.sleep(0.6)
        info0 = cdp.ev("%s('bz-ai-btn')" % HINT_PROBE)
        check("八字说明随按钮隐藏（input 页签）", bool(info0 and info0.get("hidden") is True), info0)
        cdp.ev(BAZI_SET)
        time.sleep(1.0)
        info1 = cdp.ev("%s('bz-ai-btn')" % HINT_PROBE)
        check("八字说明随按钮显示（result 页签）", bool(info1 and info1.get("hidden") is False), info1)
        cdp.ev("window.__cap = null; document.getElementById('bz-ai-btn').click(); 'c'")
        time.sleep(0.5)
        bz = cdp.ev("window.__cap")
        check("八字提示词已复制", isinstance(bz, str) and len(bz) > 800, (len(bz) if isinstance(bz, str) else bz))
        if isinstance(bz, str):
            with open(os.path.join(SAMPLES, "bazi-prompt.txt"), "w", encoding="utf-8") as f:
                f.write(bz)
            for kw in ("【基本信息】", "【四柱】", "日柱 丙寅", "日主（日干）：丙", "【五行力量】",
                       "【命宫·身宫·胎元】", "【大运】", "← 当前大运", "【今年流年】", "先说结论",
                       "伤官（想法多、爱表达", "数据里没给", "我的问题"):
                check("八字提示词含「%s」" % kw, kw in bz)
            check("八字提示词以提问位结尾", bz.rstrip().endswith("全面讲）"))
            check("八字跳转 DeepSeek", cdp.ev("window.__opened") == "https://chat.deepseek.com/")
        cdp.ev("document.getElementById('bz-ai-btn').scrollIntoView({block:'center'}); 's'")
        time.sleep(0.3)
        check("截图 bazi-day", shot(cdp, "bazi-day.png"))

        # ---------- 暗主题 ----------
        cdp.ev("localStorage.setItem('wuri_cfg_v1', JSON.stringify({theme:'night'})); 'n'")
        boot(cdp)
        cdp.ev(STUB_JS)
        check("暗主题生效", cdp.ev("document.documentElement.getAttribute('data-theme')") == "night")
        cdp.ev("document.getElementById('bazi-enter').click(); 'x'")
        time.sleep(0.6)
        cdp.ev(BAZI_SET)
        time.sleep(1.0)
        info_n = cdp.ev("%s('bz-ai-btn')" % HINT_PROBE)
        check("暗主题八字说明可见", bool(info_n and info_n.get("found") and info_n.get("hidden") is False), info_n)
        if info_n:
            check("暗主题说明用主题变量色", info_n.get("color") not in ("rgb(0, 0, 0)",), info_n.get("color"))
        cdp.ev("document.getElementById('bz-ai-btn').scrollIntoView({block:'center'}); 's'")
        time.sleep(0.3)
        check("截图 bazi-night", shot(cdp, "bazi-night.png"))
        cdp.ev("localStorage.setItem('wuri_cfg_v1', JSON.stringify({theme:'day'})); 'd'")
        boot(cdp)
        cdp.ev(STUB_JS)

        # ---------- 紫微样本 ----------
        cdp.ev("document.getElementById('ziwei-enter').click(); 'x'")
        time.sleep(0.6)
        cdp.ev("""(() => {
          document.getElementById('zw-date').value = '1990-01-01';
          document.getElementById('zw-time').value = '23:30';
          document.querySelector('input[name="zw-gender"][value="1"]').checked = true;
          var sv = document.getElementById('zw-save'); if (sv) sv.checked = false;
          document.getElementById('zw-go').click(); return 'go'; })()""")
        time.sleep(1.6)
        cdp.ev("window.__cap = null; document.getElementById('zw-ai-btn').click(); 'c'")
        time.sleep(0.5)
        zw = cdp.ev("window.__cap")
        check("紫微提示词已复制", isinstance(zw, str) and len(zw) > 800, (len(zw) if isinstance(zw, str) else zw))
        if isinstance(zw, str):
            with open(os.path.join(SAMPLES, "ziwei-prompt.txt"), "w", encoding="utf-8") as f:
                f.write(zw)
            for kw in ("紫微斗数命盘", "五行局", "命主", "身主", "【十二宫】", "【命宫三方四正】",
                       "【当前运限】", "当前大限", "流年四化", "我的问题"):
                check("紫微提示词含「%s」" % kw, kw in zw)
            names = ("命宫", "兄弟", "夫妻", "子女", "财帛", "疾厄", "迁移", "交友", "官禄", "田宅", "福德", "父母")
            n_p = sum(1 for ln in zw.split("\n") if any(ln.startswith(nm + "(") for nm in names))
            check("紫微十二宫齐全", n_p == 12, n_p)
        cdp.ev("document.getElementById('zw-ai-btn').scrollIntoView({block:'center'}); 's'")
        time.sleep(0.3)
        check("截图 ziwei-day", shot(cdp, "ziwei-day.png"))
        cdp.ev("document.getElementById('ziwei-back').click(); 'x'")
        time.sleep(0.4)

        # ---------- 六爻样本（固定爻象） ----------
        cdp.ev("localStorage.setItem('wuri_ly_zhanwen','今年适不适合换工作'); localStorage.setItem('wuri_ly_cat','事业'); 'q'")
        cdp.ev("document.getElementById('liuyao-enter').click(); 'x'")
        time.sleep(0.8)
        cdp.ev("window.__lyBitsOn = true; document.getElementById('ly-shake-all').click(); 's'")
        ok = False
        for _ in range(40):
            ok = cdp.ev("!document.getElementById('ly-result-card').hidden && document.getElementById('ly-yao-detail').innerText.length > 80")
            if ok is True:
                break
            time.sleep(0.5)
        check("六爻出卦完成", ok is True)
        cdp.ev("window.__cap = null; document.getElementById('ly-ai-btn').click(); 'c'")
        time.sleep(0.5)
        ly = cdp.ev("window.__cap")
        check("六爻提示词已复制", isinstance(ly, str) and len(ly) > 800, (len(ly) if isinstance(ly, str) else ly))
        if isinstance(ly, str):
            with open(os.path.join(SAMPLES, "liuyao-prompt.txt"), "w", encoding="utf-8") as f:
                f.write(ly)
            for kw in ("所问事由：今年适不适合换工作", "占问分类：事业", "参考用神", "官鬼",
                       "起卦四柱", "月建", "日辰", "旬空", "本卦：既济（坎宫", "青龙",
                       "【世】", "【应】", "变卦：益（巽宫", "【变卦六爻】", "互卦", "我的问题"):
                check("六爻提示词含「%s」" % kw, kw in ly)
        cdp.ev("document.getElementById('ly-ai-btn').scrollIntoView({block:'center'}); 's'")
        time.sleep(0.3)
        check("截图 liuyao-day", shot(cdp, "liuyao-day.png"))

        errs = cdp.ev("window.__errs || []")
        check("全程 JS 异常为零", errs == [], errs)
    finally:
        chrome.terminate()

    print("\n%d FAIL" % len(FAILS))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())

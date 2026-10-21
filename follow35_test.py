#!/usr/bin/env python3
"""v1.3.9 (35) 无音频经文隐藏「跟读」按钮 · 双线线上验证。

复用 (34) 的 CDP Fetch 桥框架（offline34_test.py 作库导入）：
沙箱 Chrome 无出口，桥由 Python 代取真实线上字节，浏览器跑原版代码/SW。
断言：①s20（无音频）工具栏无跟读、其余按钮齐全可用、排版不塌；
②s07（有音频）跟读在且能开启（时间戳经桥加载、无 alert）；
③跟读开着直接切书（JingWen.openReader 直跳，无音频经）自动退出跟读态、
高亮不串书；再切回有音频经按钮恢复、状态干净。
"""
import importlib.util, os, sys, time

spec = importlib.util.spec_from_file_location("t34", os.path.expanduser("~/workspace/wuri-web/offline34_test.py"))
t34 = importlib.util.module_from_spec(spec)
sys.modules["t34"] = t34
spec.loader.exec_module(t34)

Browser, report, wait_sw_active, open_reader = t34.Browser, t34.report, t34.wait_sw_active, t34.open_reader
GH, CF = t34.GH, t34.CF
t34.SHOTS = os.path.expanduser("~/workspace/wuri-web/follow35-shots")
os.makedirs(t34.SHOTS, exist_ok=True)

VIS = """(() => { const el = document.getElementById('jing-follow');
  if (!el) return 'missing';
  const cs = getComputedStyle(el);
  return (cs.display !== 'none' && el.offsetParent !== null) ? 'visible' : 'hidden'; })()"""

def follow_state(b):
    return b.ev("""(() => { const c = document.getElementById('jing-content');
      const btn = document.getElementById('jing-follow');
      return { on: c.classList.contains('follow-on'),
               btnOn: btn.classList.contains('on'),
               cur: document.querySelectorAll('#jing-content .follow-cur').length }; })()""")

def set_mobile(b):
    b.cdp.call("Emulation.setDeviceMetricsOverride",
               {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})

def back_to_catalog(b):
    b.ev("document.getElementById('jing-back-fab').click(); true")
    time.sleep(0.8)

def run_flow(b, base, tag):
    b.nav(base)
    report(tag + " SW 激活", wait_sw_active(b))
    caches = b.ev("(async () => await caches.keys())()")
    report(tag + " SW 缓存 v75", any("wuri-v75" in c for c in caches), caches)
    ver = b.ev("document.querySelector('[data-i18n=\"me_ver\"]').textContent")
    report(tag + " 关于页版本 (35)", "（35）" in ver, ver)
    b.ev("localStorage.setItem('wuri_pro_redeem','1'); true")
    b.nav(base)
    wait_sw_active(b)

    # ① s20 太乙金华宗旨（无音频）：跟读隐藏，其余按钮齐全可用
    report(tag + " 打开 s20", open_reader(b, 's20'))
    time.sleep(0.6)
    report(tag + " s20 跟读按钮隐藏", b.ev(VIS) == 'hidden', b.ev(VIS))
    others = b.ev("""(() => { const ids = ['jing-font-dec','jing-font-inc','jing-foldall','jing-pybtn','jing-highlight-btn'];
      const o = {}; ids.forEach(id => { const el = document.getElementById(id);
        o[id] = el ? (id === 'jing-highlight-btn' ? 'present' :
          ((getComputedStyle(el).display !== 'none' && el.offsetParent !== null) ? 'visible' : 'hidden')) : 'missing'; });
      return o; })()""")
    report(tag + " s20 其余按钮齐全（字小/字大/全部展开/注音在、高亮在 DOM）",
           others.get('jing-font-dec') == 'visible' and others.get('jing-font-inc') == 'visible'
           and others.get('jing-foldall') == 'visible' and others.get('jing-pybtn') == 'visible'
           and others.get('jing-highlight-btn') == 'present', others)
    fs0 = b.ev("parseFloat(getComputedStyle(document.querySelector('#jing-content .jing-para')).fontSize)")
    b.ev("document.getElementById('jing-font-inc').click(); true")
    time.sleep(0.4)
    fs1 = b.ev("parseFloat(getComputedStyle(document.querySelector('#jing-content .jing-para')).fontSize)")
    report(tag + " s20 字大按钮可用（字号变大）", fs1 > fs0, "%s -> %s" % (fs0, fs1))
    title = b.ev("document.getElementById('jing-title').textContent")
    report(tag + " s20 标题正确", "太乙金华宗旨" in title, title)
    b.shot("01-%s-s20-no-follow.png" % tag)

    # ② s07 道德经（有音频）：跟读在且能开启
    back_to_catalog(b)
    report(tag + " 打开 s07", open_reader(b, 's07'))
    time.sleep(0.6)
    report(tag + " s07 跟读按钮显示", b.ev(VIS) == 'visible', b.ev(VIS))
    b.ev("window.__alerts.length = 0; document.getElementById('jing-follow').click(); true")
    ok_on = b.wait("""document.getElementById('jing-content').classList.contains('follow-on')
                      && document.getElementById('jing-follow').classList.contains('on')""", 25)
    time.sleep(2.0)  # 等 ensureTimestamps 异步回调：失败会 alert 并自动关
    st = follow_state(b)
    alerts = b.ev("window.__alerts")
    report(tag + " s07 跟读开启成功（时间戳加载、无 alert）",
           ok_on and st['on'] and st['btnOn'] and not alerts, {"state": st, "alerts": alerts})
    b.shot("02-%s-s07-follow-on.png" % tag)

    # ③ 跟读开着直接切到 s20（openReader 直跳）：自动退出跟读态、不串书
    b.ev("JingWen.openReader('s20'); true")
    ok_sw = b.wait("""!!document.querySelector('#jing-reader') && !document.querySelector('#jing-reader').hidden
                      && document.getElementById('jing-title').textContent.includes('太乙金华')""", 20)
    time.sleep(0.8)
    st2 = follow_state(b)
    report(tag + " 直切 s20 后跟读态已退出、无高亮残留",
           ok_sw and not st2['on'] and not st2['btnOn'] and st2['cur'] == 0, st2)
    report(tag + " 直切 s20 后跟读按钮仍隐藏", b.ev(VIS) == 'hidden', b.ev(VIS))
    b.shot("03-%s-s20-after-switch.png" % tag)

    # 再切回 s07：按钮恢复、跟读为关闭的干净状态
    b.ev("JingWen.openReader('s07'); true")
    b.wait("""document.getElementById('jing-title').textContent.includes('道德')""", 20)
    time.sleep(0.8)
    st3 = follow_state(b)
    report(tag + " 切回 s07 跟读按钮恢复显示且状态干净",
           b.ev(VIS) == 'visible' and not st3['on'] and st3['cur'] == 0, st3)

def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "gh"
    b = Browser()
    try:
        set_mobile(b)
        if which == "gh":
            run_flow(b, GH, "GH")
        else:
            run_flow(b, CF, "CF")
    finally:
        b.close()
    print("\n==== %d/%d PASS ====" % (sum(t34.RESULTS), len(t34.RESULTS)), flush=True)
    sys.exit(0 if all(t34.RESULTS) else 1)

if __name__ == "__main__":
    main()

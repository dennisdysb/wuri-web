#!/usr/bin/env python3
"""v1.3.9 (37) 提醒时间字段防截断 · 双线线上验证（390/360 两档）。

复用 offline34_test.py 的 Fetch 桥 Browser（桥已加 no-cache，取真实线上字节）。
断言：#inp-time 宽度 ≥150、scrollWidth 不大于 clientWidth（内容不溢出）、
页面无横向溢出、标签单行；并截取提醒时机卡片图存证。
"""
import base64, importlib.util, os, sys, time

spec = importlib.util.spec_from_file_location("t34", os.path.expanduser("~/workspace/wuri-web/offline34_test.py"))
t34 = importlib.util.module_from_spec(spec)
sys.modules["t34"] = t34
spec.loader.exec_module(t34)

Browser, report, wait_sw_active = t34.Browser, t34.report, t34.wait_sw_active
SHOTS = os.path.expanduser("~/workspace/wuri-web/timefield37-shots")
os.makedirs(SHOTS, exist_ok=True)

MEASURE = """(() => {
  const inp = document.getElementById('ics-remind-time');
  if (!inp) return {err: 'no inp-time'};
  inp.scrollIntoView({block: 'center'});
  const r = inp.getBoundingClientRect();
  const lab = inp.closest('.form-row').querySelector('.ics-time-label');
  const lr = lab.getBoundingClientRect();
  const card = inp.closest('section');
  const cr = card.getBoundingClientRect();
  return { w: Math.round(r.width), sw: inp.scrollWidth, cw: inp.clientWidth,
           val: inp.value, labH: Math.round(lr.height), labFs: parseFloat(getComputedStyle(lab).fontSize),
           docSW: document.documentElement.scrollWidth, iw: window.innerWidth,
           card: {x: Math.max(0, cr.x), y: Math.max(0, cr.y + window.scrollY), w: Math.round(cr.width), h: Math.round(cr.height)} };
})()"""

def run(b, base, tag):
    b.nav(base)
    report(tag + " SW 激活", wait_sw_active(b))
    b.ev("document.querySelector('[data-tab=\"tab-remind\"]').click(); true")
    time.sleep(1.2)
    for w in (390, 360):
        b.cdp.call("Emulation.setDeviceMetricsOverride",
                   {"width": w, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        time.sleep(0.8)
        m = b.ev(MEASURE)
        ok = (m and not m.get('err') and m['w'] >= 150 and m['sw'] <= m['cw'] + 1
              and m['docSW'] <= m['iw'] + 1 and m['labH'] < m['labFs'] * 1.7)
        report("%s %dpx 时间字段完整（宽%d/val %s/标签单行/无溢出）" % (tag, w, m.get('w', -1), m.get('val')),
               bool(ok), m)
        c = m['card']
        r = b.cdp.call("Page.captureScreenshot", {"format": "png", "clip": {
            "x": c['x'], "y": c['y'], "width": c['w'], "height": min(c['h'], 700), "scale": 1}})
        with open(os.path.join(SHOTS, "%s-remind-card-%d.png" % (tag, w)), "wb") as f:
            f.write(base64.b64decode(r["data"]))

def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "gh"
    b = Browser()
    try:
        run(b, t34.GH if which == "gh" else t34.CF, "GH" if which == "gh" else "CF")
    finally:
        b.close()
    print("\n==== %d/%d PASS ====" % (sum(t34.RESULTS), len(t34.RESULTS)), flush=True)
    sys.exit(0 if all(t34.RESULTS) else 1)

if __name__ == "__main__":
    main()

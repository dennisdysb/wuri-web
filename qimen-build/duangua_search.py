#!/usr/bin/env python3
"""断卦层黄金例搜索（一次性工具）：在页面内调用 LiuYao.duan 遍历爻象×日期，
定位 化进/化退/回头生/回头克/反吟/伏吟/用神月破/用神旬空/用神不上卦 的真实命中例，
输出 JSON 供 duangua_test.py 固化断言。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
WWW = os.path.expanduser("~/workspace/wuri-web-duangua/www")
URL = "file://" + WWW + "/index.html"

SEARCH_JS = r"""
(() => {
  const out = {};
  const allBits = [];
  for (let n = 0; n < 64; n++) { const b = []; for (let i = 0; i < 6; i++) b.push((n >> i) & 1); allBits.push(b); }
  const mk = (bits, mask) => bits.map((b, i) => ({ yao: b, dong: !!((mask >> i) & 1) }));
  const txt = (la, date, topic) => {
    const dg = window.LiuYao.duan(la, date, topic, 'm');
    return dg.rows.map(r => r.label + '|' + r.items.join(' ')).join('\n');
  };
  const D0 = new Date('2024-12-25T14:00:00');
  // 动变类特征（与日期无关，一日即可）
  for (const bits of allBits) {
    for (let mask = 1; mask < 64; mask++) {
      const t = txt(mk(bits, mask), D0, '');
      if (!out.jin && t.includes('化进神（')) out.jin = { bits, mask, frag: '化进神' };
      if (!out.tui && t.includes('化退神（')) out.tui = { bits, mask, frag: '化退神' };
      if (!out.huisheng && t.includes('回头生（')) out.huisheng = { bits, mask, frag: '回头生' };
      if (!out.huike && t.includes('回头克（')) out.huike = { bits, mask, frag: '回头克' };
      if (!out.fanyin && t.includes('反吟：')) out.fanyin = { bits, mask, frag: '反吟' };
      if (!out.fuyin && t.includes('伏吟：')) out.fuyin = { bits, mask, frag: '伏吟' };
    }
    if (out.jin && out.tui && out.huisheng && out.huike && out.fanyin && out.fuyin) break;
  }
  // 用神不上卦（求财）
  for (const bits of allBits) {
    const t = txt(mk(bits, 0), D0, 'cai');
    if (t.includes('不上卦')) { out.bushang = { bits, mask: 0, topic: 'cai', frag: '不上卦' }; break; }
  }
  // 用神月破 / 用神旬空（求财，跨日期扫）
  const dates = [];
  for (let d = 0; d < 365; d += 7) { const dt = new Date(2025, 0, 1 + d, 12, 0); dates.push(dt); }
  outer:
  for (const dt of dates) {
    for (const bits of allBits) {
      const t = txt(mk(bits, 0), dt, 'cai');
      const wrow = t.split('\n').find(s => s.startsWith('旺衰|')) || '';
      if (!out.yuepo && wrow.includes('月破（逢月建冲破）')) out.yuepo = { bits, mask: 0, topic: 'cai', date: dt.toString(), frag: '月破（逢月建冲破）' };
      if (!out.xunkong && wrow.includes('逢旬空')) out.xunkong = { bits, mask: 0, topic: 'cai', date: dt.toString(), frag: '逢旬空' };
      if (out.yuepo && out.xunkong) break outer;
    }
  }
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
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.5)
        res = cdp.evaluate(SEARCH_JS)
        print(json.dumps(res, ensure_ascii=False, indent=1))
    finally:
        chrome.terminate()

if __name__ == "__main__":
    main()

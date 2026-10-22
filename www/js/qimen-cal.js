/* ============================================================
 * 戊日不上香 · 奇门遁甲模块（适配版）
 * 原作：「掌上乾坤 · 奇门遁甲助手」v3.2，作者 qzp001，MIT License。
 * 许可证全文见同目录 qimen-LICENSE.txt；「我的 → 关于」页有鸣谢。
 * 戊日适配点见各文件头注与 qimen-build/build_qimen.py。
 * ============================================================ */
/* 历法提供者：把引擎的节气/交节计算接到全站统一的 lunar-javascript。
 * - termIndex：取该时刻「上一个节气」的序号（引擎 TERMS 表顺序：立春=0 … 大寒=23）
 * - termStartRelJD：上一交节的精确时刻，换算成引擎 relJD 标尺
 * - termBounds：距上/下一交节的精确小时数（交节临界提示用）
 * 四柱干支仍由引擎按儒略日推算（与 lunar 输出逐项验证一致，见 qimen-build 测试）。 */
(function () {
  var root = (typeof window !== "undefined" ? window : globalThis);
  var Q = root.QM, Solar = root.Solar;
  if (!Q || !Solar || !Q.setCalendarProvider) return;
  var TERMS = Q.TERMS;
  function jdn(y, m, d) {
    var a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
         - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  function relJDOf(s) {
    return (jdn(s.getYear(), s.getMonth(), s.getDay()) - 2451545)
         + (s.getHour() + s.getMinute() / 60 + s.getSecond() / 3600 - 20) / 24;
  }
  function lunarAt(y, mo, d, h, mi) { return Solar.fromYmdHms(y, mo, d, h, mi, 0).getLunar(); }
  Q.setCalendarProvider({
    termIndex: function (y, mo, d, h, mi) {
      var name = lunarAt(y, mo, d, h, mi).getPrevJieQi().getName();
      var i = TERMS.indexOf(name);
      if (i < 0) throw new Error("未知节气名：" + name);
      return i;
    },
    termStartRelJD: function (y, mo, d, h, mi) {
      return relJDOf(lunarAt(y, mo, d, h, mi).getPrevJieQi().getSolar());
    },
    termBounds: function (y, mo, d, h, mi) {
      var l = lunarAt(y, mo, d, h, mi);
      var cur = (jdn(y, mo, d) - 2451545) + (h + mi / 60 - 20) / 24;
      var since = (cur - relJDOf(l.getPrevJieQi().getSolar())) * 24;
      var until = (relJDOf(l.getNextJieQi().getSolar()) - cur) * 24;
      return { since: since, until: until, near: Math.min(since, until) <= 1 };
    }
  });
})();

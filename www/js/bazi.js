/* 戊日不上香 · 八字排盘（Pro）v3
 * 三页：起盘（输入）/ 细盘（专业细盘）/ 记录（历史分组）
 * 细盘严格参照问真八字版式：日期/流年/大运前置三列，主星/干支/藏干/星运/自坐/空亡/纳音/神煞
 * 仅历法推算，不作命理解读。
 */
var Bazi = (function () {
  'use strict';
  function $(s) { return document.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isPro() { return window.WuriPro && WuriPro.isPro(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var LS_HIST = 'wuri_bazi_history_v3';

  var WX_COLOR = { '木': '#2e7d32', '火': '#c62828', '土': '#8d6e00', '金': '#b26a00', '水': '#1565c0' };
  var GAN_WX = { '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土', '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水' };
  var ZHI_WX = { '寅': '木', '卯': '木', '巳': '火', '午': '火', '申': '金', '酉': '金', '亥': '水', '子': '水', '辰': '土', '戌': '土', '丑': '土', '未': '土' };

  /* 十二长生（自坐用） */
  var CS_ORDER = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];
  var CS_START = { '甲': '亥', '丙': '寅', '戊': '寅', '庚': '巳', '壬': '申', '乙': '午', '丁': '酉', '己': '酉', '辛': '子', '癸': '卯' };
  var ZHI_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var YANG_GAN = { '甲': 1, '丙': 1, '戊': 1, '庚': 1, '壬': 1 };
  function ziZuo(gan, zhi) {
    var start = CS_START[gan];
    if (!start) return '';
    var si = ZHI_ORDER.indexOf(start), zi = ZHI_ORDER.indexOf(zhi);
    if (si < 0 || zi < 0) return '';
    var step = YANG_GAN[gan] ? (zi - si + 12) % 12 : (si - zi + 12) % 12;
    return CS_ORDER[step];
  }

  /* 神煞（传统口诀） */
  var TIANYI = { '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'], '乙': ['子', '申'], '己': ['子', '申'], '丙': ['亥', '酉'], '丁': ['亥', '酉'], '壬': ['巳', '卯'], '癸': ['巳', '卯'], '辛': ['午', '寅'] };
  var WENCHANG = { '甲': '巳', '乙': '午', '丙': '申', '戊': '申', '丁': '酉', '己': '酉', '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯' };
  var TAIJI = { '甲': ['子', '午'], '乙': ['子', '午'], '丙': ['卯', '酉'], '丁': ['卯', '酉'], '戊': ['辰', '戌', '丑', '未'], '己': ['辰', '戌', '丑', '未'], '庚': ['寅', '亥'], '辛': ['寅', '亥'], '壬': ['巳', '申'], '癸': ['巳', '申'] };
  // 桃花/驿马/华盖：按年支查
  var TAO_SANHE = { '申': '酉', '子': '酉', '辰': '酉', '寅': '卯', '午': '卯', '戌': '卯', '巳': '午', '酉': '午', '丑': '午', '亥': '子', '卯': '子', '未': '子' };
  var YIMA_SANHE = { '申': '寅', '子': '寅', '辰': '寅', '寅': '申', '午': '申', '戌': '申', '巳': '亥', '酉': '亥', '丑': '亥', '亥': '巳', '卯': '巳', '未': '巳' };
  var HUAGAI_SANHE = { '申': '辰', '子': '辰', '辰': '辰', '寅': '戌', '午': '戌', '戌': '戌', '巳': '丑', '酉': '丑', '丑': '丑', '亥': '未', '卯': '未', '未': '未' };
  /* 新增神煞（传统口诀） */
  var TIANDE = { '寅': '丁', '卯': '申', '辰': '壬', '巳': '辛', '午': '亥', '未': '甲', '申': '癸', '酉': '寅', '戌': '丙', '亥': '乙', '子': '巳', '丑': '庚' };
  var YUEDE = { '亥': '甲', '卯': '甲', '未': '甲', '寅': '丙', '午': '丙', '戌': '丙', '巳': '庚', '酉': '庚', '丑': '庚', '申': '壬', '子': '壬', '辰': '壬' };
  var DEXIU = { '亥': ['甲', '乙'], '卯': ['甲', '乙'], '未': ['甲', '乙'], '寅': ['丙', '丁'], '午': ['丙', '丁'], '戌': ['丙', '丁'], '巳': ['庚', '辛'], '酉': ['庚', '辛'], '丑': ['庚', '辛'], '申': ['壬', '癸'], '子': ['壬', '癸'], '辰': ['壬', '癸'] };
  var WANGSHEN = { '申': '亥', '子': '亥', '辰': '亥', '寅': '巳', '午': '巳', '戌': '巳', '巳': '申', '酉': '申', '丑': '申', '亥': '寅', '卯': '寅', '未': '寅' };
  var YANGBLADE = { '甲': '卯', '丙': '午', '戊': '午', '庚': '酉', '壬': '子', '乙': '寅', '丁': '巳', '己': '巳', '辛': '申', '癸': '亥' };
  var LIUXIA = { '甲': '酉', '乙': '戌', '丙': '未', '丁': '申', '戊': '巳', '己': '午', '庚': '辰', '辛': '卯', '壬': '亥', '癸': '寅' };
  var LUSHEN = { '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午', '戊': '巳', '己': '午', '庚': '申', '辛': '酉', '壬': '亥', '癸': '子' };
  var BAZHUAN = ['甲寅', '乙卯', '己未', '丁未', '庚申', '辛酉'];
  function shensha(dayGan, yearZhi, zhi, monthZhi, dayZhi, pillarGz, stem) {
    var out = [];
    if ((TIANYI[dayGan] || []).indexOf(zhi) >= 0) out.push('天乙贵人');
    if (WENCHANG[dayGan] === zhi) out.push('文昌贵人');
    if ((TAIJI[dayGan] || []).indexOf(zhi) >= 0) out.push('太极贵人');
    if (TAO_SANHE[yearZhi] === zhi) out.push('桃花');
    if (YIMA_SANHE[yearZhi] === zhi) out.push('驿马');
    if (HUAGAI_SANHE[yearZhi] === zhi) out.push('华盖');
    // 天德/月德/德秀（按月支查天干）
    if (TIANDE[monthZhi] === stem) out.push('天德贵人');
    if (YUEDE[monthZhi] === stem) out.push('月德贵人');
    if ((DEXIU[monthZhi] || []).indexOf(stem) >= 0) out.push('德秀贵人');
    // 亡神（按日支三合）
    if (WANGSHEN[dayZhi] === zhi) out.push('亡神');
    // 羊刃/流霞/禄神（按日干）
    if (YANGBLADE[dayGan] === zhi) out.push('羊刃');
    if (LIUXIA[dayGan] === zhi) out.push('流霞');
    if (LUSHEN[dayGan] === zhi) out.push('禄神');
    // 四废日（按月令季节+日柱）
    var season = { '寅': '春', '卯': '春', '辰': '春', '巳': '夏', '午': '夏', '未': '夏', '申': '秋', '酉': '秋', '戌': '秋', '亥': '冬', '子': '冬', '丑': '冬' }[monthZhi];
    var sifei = { '春': ['庚申', '辛酉'], '夏': ['壬子', '癸亥'], '秋': ['甲寅', '乙卯'], '冬': ['丙午', '丁巳'] }[season] || [];
    if (sifei.indexOf(pillarGz) >= 0) out.push('四废日');
    // 八专日
    if (BAZHUAN.indexOf(pillarGz) >= 0) out.push('八专日');
    // 天医（按月支）
    var TIANYI2 = { '寅': '卯', '卯': '辰', '辰': '巳', '巳': '午', '午': '未', '未': '申', '申': '酉', '酉': '戌', '戌': '亥', '亥': '子', '子': '丑', '丑': '寅' };
    if (TIANYI2[monthZhi] === zhi) out.push('天医');
    // 劫煞/灾煞（按年支三合）
    var JIESHA = { '申': '巳', '子': '巳', '辰': '巳', '寅': '亥', '午': '亥', '戌': '亥', '巳': '寅', '酉': '寅', '丑': '寅', '亥': '申', '卯': '申', '未': '申' };
    var ZAISHA = { '申': '午', '子': '午', '辰': '午', '寅': '子', '午': '子', '戌': '子', '巳': '卯', '酉': '卯', '丑': '卯', '亥': '酉', '卯': '酉', '未': '酉' };
    if (JIESHA[yearZhi] === zhi) out.push('劫煞');
    if (ZAISHA[yearZhi] === zhi) out.push('灾煞');
    // 将星（按年支三合）
    var JIANGXING = { '寅': '午', '午': '午', '戌': '午', '申': '子', '子': '子', '辰': '子', '巳': '酉', '酉': '酉', '丑': '酉', '亥': '卯', '卯': '卯', '未': '卯' };
    if (JIANGXING[yearZhi] === zhi) out.push('将星');
    // 金舆（按日干）
    var JINYU = { '甲': '辰', '乙': '巳', '丙': '未', '丁': '申', '戊': '未', '己': '申', '庚': '戌', '辛': '亥', '壬': '丑', '癸': '寅' };
    if (JINYU[dayGan] === zhi) out.push('金舆');
    // 红鸾/天喜（按年支）
    var HONGLUAN = { '子': '卯', '丑': '寅', '寅': '丑', '卯': '子', '辰': '亥', '巳': '戌', '午': '酉', '未': '申', '申': '未', '酉': '午', '戌': '巳', '亥': '辰' };
    var TIANXI = { '子': '酉', '丑': '申', '寅': '未', '卯': '午', '辰': '巳', '巳': '辰', '午': '卯', '未': '寅', '申': '丑', '酉': '子', '戌': '亥', '亥': '戌' };
    if (HONGLUAN[yearZhi] === zhi) out.push('红鸾');
    if (TIANXI[yearZhi] === zhi) out.push('天喜');
    // 孤辰/寡宿（按年支）
    var GUCHEN = { '亥': '寅', '子': '寅', '丑': '寅', '寅': '巳', '卯': '巳', '辰': '巳', '巳': '申', '午': '申', '未': '申', '申': '亥', '酉': '亥', '戌': '亥' };
    var GUASU = { '亥': '戌', '子': '戌', '丑': '戌', '寅': '丑', '卯': '丑', '辰': '丑', '巳': '辰', '午': '辰', '未': '辰', '申': '未', '酉': '未', '戌': '未' };
    if (GUCHEN[yearZhi] === zhi) out.push('孤辰');
    if (GUASU[yearZhi] === zhi) out.push('寡宿');
    // 大耗（按年支对冲）
    var DAHAO = { '子': '午', '丑': '未', '寅': '申', '卯': '酉', '辰': '戌', '巳': '亥', '午': '子', '未': '丑', '申': '寅', '酉': '卯', '戌': '辰', '亥': '巳' };
    if (DAHAO[yearZhi] === zhi) out.push('大耗');
    // 国印贵人（按年干/日干）
    var GUOYIN = { '甲': '戌', '乙': '亥', '丙': '丑', '丁': '寅', '戊': '丑', '己': '寅', '庚': '辰', '辛': '巳', '壬': '未', '癸': '申' };
    if (GUOYIN[dayGan] === zhi) out.push('国印贵人');
    // 魁罡日（特定日柱）
    if (['庚辰', '庚戌', '壬辰', '戊戌'].indexOf(pillarGz) >= 0) out.push('魁罡');
    // 十恶大败日
    if (['甲辰', '乙巳', '丙申', '丁亥', '戊戌', '己丑', '庚辰', '辛巳', '壬申', '癸亥'].indexOf(pillarGz) >= 0) out.push('十恶大败');
    // 天罗地网（按日支）
    if (['戌', '亥'].indexOf(dayZhi) >= 0 && ['戌', '亥'].indexOf(zhi) >= 0) out.push('天罗');
    if (['辰', '巳'].indexOf(dayZhi) >= 0 && ['辰', '巳'].indexOf(zhi) >= 0) out.push('地网');
    // 孤鸾煞（特定日柱）
    if (['乙巳', '丁巳', '辛亥', '戊申', '壬寅', '戊午', '壬子', '丙午'].indexOf(pillarGz) >= 0) out.push('孤鸾');
    // 阴阳差错日
    if (['丙子', '丁丑', '戊寅', '辛卯', '壬辰', '癸巳', '丙午', '丁未', '戊申', '辛酉', '壬戌', '癸亥'].indexOf(pillarGz) >= 0) out.push('阴阳差错');
    // 天德合/月德合（天干五合）
    var HE = { '甲': '己', '己': '甲', '乙': '庚', '庚': '乙', '丙': '辛', '辛': '丙', '丁': '壬', '壬': '丁', '戊': '癸', '癸': '戊' };
    var tiande = { '寅': '丁', '卯': '申', '辰': '壬', '巳': '辛', '午': '亥', '未': '甲', '申': '癸', '酉': '寅', '戌': '丙', '亥': '乙', '子': '巳', '丑': '庚' }[monthZhi];
    var yuede = { '亥': '甲', '卯': '甲', '未': '甲', '寅': '丙', '午': '丙', '戌': '丙', '巳': '庚', '酉': '庚', '丑': '庚', '申': '壬', '子': '壬', '辰': '壬' }[monthZhi];
    if (tiande && HE[tiande] === stem) out.push('天德合');
    if (yuede && HE[yuede] === stem) out.push('月德合');
    return out.join(' ');
  }

  var curData = null;      // 当前排盘数据
  var selDayunIdx = 0;     // 选中的大运序号
  var privacyOn = false;   // 隐私模式

  /* 晚子时流派（EightChar.setSect）：流派1＝23 时换日（晚子时归次日）；流派2＝0 时换日（晚子时归当日）。
   * 实测：lunar-javascript 1.7.7 在从未调用 setSect 时的行为等价于流派2（1990-01-01 23:30 → 日柱丙寅，与 setSect(2) 一致；
   * setSect(1) 则为丁卯）。故默认值锁定流派2，保持升级前现状不变，开关仅供用户自选。*/
  var curSect = 2;
  try { var _sectSaved = +localStorage.getItem('wuri_bazi_sect'); if (_sectSaved === 1 || _sectSaved === 2) curSect = _sectSaved; } catch (e) {}

  var GAN_ORDER = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

  /* ---------- 五行力量统计 ----------
   * 口径（自定，界面注明「供参考」）：天干每字 1.0；地支藏干按本气 1.0 / 中气 0.5 / 余气 0.3
   * （藏干数组顺序即本→中→余）；各干按其五行归集，合计后换算百分比。无时柱时只计三柱。 */
  function wxPower(cols) {
    var score = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };
    var W = [1.0, 0.5, 0.3];
    cols.forEach(function (c) {
      if (!c) return;
      if (GAN_WX[c.gan]) score[GAN_WX[c.gan]] += 1.0;
      (c.hide || []).forEach(function (g, i) { if (GAN_WX[g]) score[GAN_WX[g]] += (W[i] || 0.3); });
    });
    var total = 0, k;
    for (k in score) total += score[k];
    return { score: score, total: total };
  }

  /* ---------- 袁天罡称骨（民俗附加） ----------
   * 权重单位为「钱」（整数计，避免浮点误差）；年重按干支、月/日按农历、时重按时支。
   * 数据来源：通行袁天罡称骨表，经三处公开版本逐项交叉核对（水墨先生称骨全表、
   * CSDN 称骨算命表、每日头条称骨歌全文）；年重 60 甲子三源一致，仅癸亥一格有
   * 6 钱 / 7 钱异文，取两部全表一致的 6 钱；歌诀 51 首（2.1–7.1 两）按通行本录入，
   * 个别字有异文（4.4「便不忧」、6.4「坐高堂」取通行字）。
   * 口径：年柱用农历年（春节界，非八字立春界）；闰月上半月（≤15 日）按本月、
   * 下半月按下月（民间通行口径）。称骨为民俗附加内容，仅供参考。 */
  var CG_YEAR = { '甲子': 12, '乙丑': 9, '丙寅': 6, '丁卯': 7, '戊辰': 12, '己巳': 5, '庚午': 9, '辛未': 8, '壬申': 7, '癸酉': 8, '甲戌': 15, '乙亥': 9, '丙子': 16, '丁丑': 8, '戊寅': 8, '己卯': 19, '庚辰': 12, '辛巳': 6, '壬午': 8, '癸未': 7, '甲申': 5, '乙酉': 15, '丙戌': 6, '丁亥': 16, '戊子': 15, '己丑': 7, '庚寅': 9, '辛卯': 12, '壬辰': 10, '癸巳': 7, '甲午': 15, '乙未': 6, '丙申': 5, '丁酉': 14, '戊戌': 14, '己亥': 9, '庚子': 7, '辛丑': 7, '壬寅': 9, '癸卯': 12, '甲辰': 8, '乙巳': 7, '丙午': 13, '丁未': 5, '戊申': 14, '己酉': 5, '庚戌': 9, '辛亥': 17, '壬子': 5, '癸丑': 7, '甲寅': 12, '乙卯': 8, '丙辰': 8, '丁巳': 6, '戊午': 19, '己未': 6, '庚申': 8, '辛酉': 16, '壬戌': 10, '癸亥': 6 };
  var CG_MONTH = [6, 7, 18, 9, 5, 16, 9, 15, 18, 8, 9, 5];
  var CG_DAY = [5, 10, 8, 15, 16, 15, 8, 16, 8, 16, 9, 17, 8, 17, 10, 8, 9, 18, 5, 15, 10, 9, 8, 9, 15, 18, 7, 8, 16, 6];
  var CG_HOUR = { '子': 16, '丑': 6, '寅': 7, '卯': 10, '辰': 9, '巳': 16, '午': 10, '未': 8, '申': 8, '酉': 9, '戌': 6, '亥': 6 };
  var CG_SONG = {
    21: '短命非业谓大空，平生灾难事重重；凶祸频临陷逆境，终世困苦事不成。',
    22: '身寒骨冷苦伶仃，此命推来行乞人；劳劳碌碌无度日，终年打拱过平生。',
    23: '此命推来骨格轻，求谋作事事难成；妻儿兄弟应难许，别处他乡作散人。',
    24: '此命推来福禄无，门庭困苦总难荣；六亲骨肉皆无靠，流浪他乡作老翁。',
    25: '此命推来祖业微，门庭营度似稀奇；六亲骨肉如冰炭，一世勤劳自把持。',
    26: '平生衣禄苦中求，独自营谋事不休；离祖出门宜早计，晚来衣禄自无休。',
    27: '一生作事少商量，难靠祖宗作主张；独马单枪空做去，早年晚岁总无长。',
    28: '一生行事似飘蓬，祖宗产业在梦中；若不过房改名姓，也当移徒二三通。',
    29: '初年运限未曾亨，纵有功名在后成；须过四旬才可立，移居改姓始为良。',
    30: '劳劳碌碌苦中求，东奔西走何日休；若使终身勤与俭，老来稍可免忧愁。',
    31: '忙忙碌碌苦中求，何日云开见日头；难得祖基家可立，中年衣食渐无忧。',
    32: '初年运蹇事难谋，渐有财源如水流；到得中年衣食旺，那时名利一齐收。',
    33: '早年做事事难成，百年勤劳枉费心；半世自如流水去，后来运到始得金。',
    34: '此命福气果如何，僧道门中衣禄多；离祖出家方为妙，朝晚拜佛念弥陀。',
    35: '生平福量不周全，祖业根基觉少传；营事生涯宜守旧，时来衣食胜从前。',
    36: '不须劳碌过平生，独自成家福不轻；早有福星常照命，任君行去百般成。',
    37: '此命般般事不成，弟兄少力自孤行；虽然祖业须微有，来得明时去不明。',
    38: '一身骨肉最清高，早入簧门姓氏标；待到年将三十六，蓝衫脱去换红袍。',
    39: '此命终身运不通，劳劳作事尽皆空；苦心竭力成家计，到得那时在梦中。',
    40: '平生衣禄是绵长，件件心中自主张；前面风霜多受过，后来必定享安康。',
    41: '此命推来自不同，为人能干异凡庸；中年还有逍遥福，不比前时运来通。',
    42: '得宽怀处且宽怀，何用双眉皱不开；若使中年命运济，那时名利一起来。',
    43: '为人心性最聪明，作事轩昂近贵人；衣禄一生天注定，不须劳碌是丰亨。',
    44: '万事由天莫苦求，须知福禄赖人修；当年财帛难如意，晚景欣然便不忧。',
    45: '名利推求竟若何，前番辛苦后奔波；命中难养男和女，骨肉扶持也不多。',
    46: '东西南北尽皆通，出姓移居更觉隆；衣禄无穷无数定，中年晚景一般同。',
    47: '此命推求旺末年，妻荣子贵自怡然；平生原有滔滔福，可卜财源若水泉。',
    48: '初年运道未曾通，几许蹉跎命亦穷；兄弟六亲无依靠，一生事业晚来整。',
    49: '此命推来福不轻，自成自立显门庭；从来富贵人钦敬，使婢差奴过一生。',
    50: '为利为名终日劳，中年福禄也多遭；老来自有财星照，不比前番目下高。',
    51: '一世荣华事事通，不须劳碌自亨通；兄弟叔侄皆如意，家业成时福禄宏。',
    52: '一世亨通事事能，不须劳苦自然宁；宗族有光欣喜甚，家产丰盈自称心。',
    53: '此格推来福泽宏，兴家立业在其中；一生衣食安排定，却是人间一福翁。',
    54: '此格详采福泽宏，诗书满腹看功成；丰衣足食多安稳，正是人间有福人。',
    55: '策马扬鞭争名利，少年作事费筹论；一朝福禄源源至，富贵荣华显六亲。',
    56: '此格推来礼义通，一身福禄用无穷；甜酸苦辣皆尝过，滚滚财源盈而丰。',
    57: '福禄丰盈万事全，一身荣耀乐天年；名扬威震人争羡，此世逍遥宛似仙。',
    58: '平生衣食自然来，名利双全富贵偕；金榜题名登甲第，紫袍玉带走金阶。',
    59: '细推此格秀而清，必定才高学业成；甲第之中应有分，扬鞭走马显威荣。',
    60: '一朝金榜快题名，显祖荣宗大器成；衣禄定然无欠缺，田园财帛更丰盈。',
    61: '不作朝中金榜客，定为世上大财翁；聪明天付经书熟，名显高褂自是荣。',
    62: '此命生来福不穷，读书必定显亲宗；紫衣玉带为卿相，富贵荣华孰与同。',
    63: '命主为官福禄长，得来富贵实非常；名题雁塔传金榜，大显门庭天下扬。',
    64: '此格威权不可当，紫袍金带坐高堂；荣华富贵谁能及，万古留名姓氏扬。',
    65: '细推此命福非轻，富贵荣华孰与争；定国安邦人极品，威声显赫震寰瀛。',
    66: '此格人间一福人，堆金积玉满堂春；从来富贵有天定，金榜题名更显亲。',
    67: '此命生来福自宏，田园家业最高隆；平生衣禄盈丰足，一路荣华万事通。',
    68: '富贵由天莫苦求，万事家计不须谋；十年不比前番事，祖业根基千古留。',
    69: '君是人间福禄星，一生富贵众人钦；总然衣禄由天定，安享荣华过一生。',
    70: '此命推来福不轻，何须愁虑苦劳心；荣华富贵已天定，正笏垂绅拜紫宸。',
    71: '此命生成大不同，公侯卿相在其中；一生自有逍遥福，富贵荣华极品隆。'
  };
  function fmtQian(q) {
    var l = Math.floor(q / 10), r = q % 10;
    return (l ? l + '两' : '') + (r ? r + '钱' : (l ? '' : '0钱'));
  }
  function chenggu(data) {
    var lunar = data.lunar;
    // 年干支按农历年（春节界）：由农历年数推甲子序
    var ly = Math.abs(lunar.getYear());
    var yi = (((ly - 4) % 60) + 60) % 60;
    var yearGz = GAN_ORDER[yi % 10] + ZHI_ORDER[yi % 12];
    var yw = CG_YEAR[yearGz];
    if (!yw) return null;
    var lm = lunar.getMonth(), ld = lunar.getDay();
    var month = Math.abs(lm);
    if (lm < 0 && ld > 15) { month += 1; if (month > 12) month = 1; } // 闰月下半月按下月
    var parts = [
      { label: '年（' + yearGz + '）', w: yw },
      { label: '月（' + month + '月）', w: CG_MONTH[month - 1] },
      { label: '日（' + ld + '日）', w: CG_DAY[ld - 1] }
    ];
    var total = yw + CG_MONTH[month - 1] + CG_DAY[ld - 1];
    var noTime = !data.hasTime;
    if (!noTime) {
      var hw = CG_HOUR[data.ec.getTimeZhi()];
      if (!hw) return null;
      parts.push({ label: '时（' + data.ec.getTimeZhi() + '时）', w: hw });
      total += hw;
    }
    var song = CG_SONG[total];
    if (!song) return null;
    return { parts: parts, total: total, song: song, noTime: noTime };
  }

  function open() {
    if (!isPro()) { window.WuriPro && WuriPro.requirePro('bazi'); return; }
    $('#bazi-view').hidden = false;
    showTab('input');
    window.scrollTo(0, 0);
  }
  function close() {
    $('#bazi-view').hidden = true;
  }

  function showTab(which) {
    $all('[data-bztab]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-bztab') === which);
    });
    $('#bz-tab-input').hidden = which !== 'input';
    $('#bz-tab-result').hidden = which !== 'result';
    $('#bz-tab-history').hidden = which !== 'history';
    var aiBtn = $('#bz-ai-btn');
    if (aiBtn) aiBtn.hidden = which !== 'result';
    if (which === 'history') renderHistory();
    if (which === 'input') initInputDefaults();
  }

  /* 地支藏干（本气→中气→余气顺序，通行表；与引擎 HideGan 口径一致，供大运/流年地支取十神用） */
  var ZHI_HIDE = {
    '子': ['癸'], '丑': ['己', '癸', '辛'], '寅': ['甲', '丙', '戊'], '卯': ['乙'],
    '辰': ['戊', '乙', '癸'], '巳': ['丙', '庚', '戊'], '午': ['丁', '己'], '未': ['己', '丁', '乙'],
    '申': ['庚', '壬', '戊'], '酉': ['辛'], '戌': ['戊', '辛', '丁'], '亥': ['壬', '甲']
  };
  var SHENG_NEXT = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };
  var KE_NEXT = { '木': '土', '火': '金', '土': '水', '金': '木', '水': '火' };
  /* 任意天干对日主的十神（标准生克＋阴阳同异口径；与引擎 ShiShenGan/ShiShenZhi 对照验证过） */
  function shishenOf(dayGan, gan) {
    var di = GAN_ORDER.indexOf(dayGan), gi = GAN_ORDER.indexOf(gan);
    if (di < 0 || gi < 0) return '';
    var dw = GAN_WX[dayGan], gw = GAN_WX[gan];
    var same = (di % 2) === (gi % 2);
    if (gw === dw) return same ? '比肩' : '劫财';
    if (SHENG_NEXT[dw] === gw) return same ? '食神' : '伤官';
    if (KE_NEXT[dw] === gw) return same ? '偏财' : '正财';
    if (KE_NEXT[gw] === dw) return same ? '七杀' : '正官';
    if (SHENG_NEXT[gw] === dw) return same ? '偏印' : '正印';
    return '';
  }

  /* AI 分析数据段（2026-10-22 改结构化拼装，替代旧 innerText 抓取截 3000 字：
   * 四柱/十神/藏干/纳音/空亡/神煞、五行力量、命宫身宫胎元、大运全表＋当前大运与今年流年，
   * 全部自 curData 与引擎 API 取，与盘面同源；异常时回落旧抓取法，保证按钮可用。 */
  function buildChartText() {
    try {
      if (!curData) return;
      var data = curData, ec = data.ec;
      var dayGan = ec.getDayGan(), yearZhi = ec.getYearZhi();
      var L = [];
      L.push('【基本信息】');
      L.push('性别：' + (data.gender === 1 ? '男（乾造）' : '女（坤造）'));
      L.push('出生：' + (data.cal === 'lunar' ? '农历' : '公历') + ' ' + data.dateStr + (data.hasTime ? '' : '（未填出生时间，无时柱）'));
      try {
        L.push('对应农历：' + data.lunar.getYearInChinese() + '年' + data.lunar.getMonthInChinese() + '月' + data.lunar.getDayInChinese()
          + '（生肖' + data.lunar.getYearShengXiao() + '）');
      } catch (e) {}
      if (data.tsInfo) L.push('已按真太阳时校正（经度差 ' + (data.tsInfo.off >= 0 ? '+' : '') + data.tsInfo.off + ' 分钟，未含均时差），四柱以校正后时间排定。');
      L.push('晚子时流派：流派' + curSect + (curSect === 1 ? '（23 时换日）' : '（0 时换日）'));
      // 四柱（与 renderResult 同一套引擎取值）
      var pillars = [
        { k: 'year', label: '年柱' }, { k: 'month', label: '月柱' },
        { k: 'day', label: '日柱' }, { k: 'time', label: '时柱' }
      ];
      var cols = pillars.map(function (p) {
        if (p.k === 'time' && !data.hasTime) return null;
        var cap = p.k.charAt(0).toUpperCase() + p.k.slice(1);
        var col = { label: p.label };
        try {
          col.gan = ec['get' + cap + 'Gan']();
          col.zhi = ec['get' + cap + 'Zhi']();
          col.ssGan = ec['get' + cap + 'ShiShenGan']();
          col.hide = ec['get' + cap + 'HideGan']() || [];
          col.ssZhi = ec['get' + cap + 'ShiShenZhi']() || [];
          col.nayin = ec['get' + cap + 'NaYin']();
          col.dishi = ec['get' + cap + 'DiShi']();
          col.xunkong = ec['get' + cap + 'XunKong']();
          col.shensha = shensha(dayGan, yearZhi, col.zhi, ec.getMonthZhi(), ec.getDayZhi(), col.gan + col.zhi, col.gan);
        } catch (e) { return null; }
        return col;
      });
      L.push('');
      L.push('【四柱】日主（日干）：' + dayGan + '（' + GAN_WX[dayGan] + '）');
      cols.forEach(function (c) {
        if (!c) return;
        var hideTxt = c.hide.map(function (g, i) { return g + '（' + (c.ssZhi[i] || shishenOf(dayGan, g)) + '）'; }).join('、');
        L.push(c.label + ' ' + c.gan + c.zhi
          + '：天干十神 ' + (c.label === '日柱' ? '日主' : (c.ssGan || shishenOf(dayGan, c.gan)))
          + '｜藏干 ' + (hideTxt || '无')
          + '｜星运 ' + (c.dishi || '')
          + '｜纳音 ' + (c.nayin || '')
          + '｜空亡 ' + (c.xunkong || '')
          + (c.shensha ? '｜神煞 ' + c.shensha : ''));
      });
      // 五行力量（与盘面同一 wxPower 口径）
      try {
        var wp = wxPower(cols);
        var wpTxt = ['木', '火', '土', '金', '水'].map(function (wx) {
          return wx + ' ' + (wp.total ? Math.round(wp.score[wx] / wp.total * 100) : 0) + '%';
        }).join('、');
        L.push('');
        L.push('【五行力量】' + wpTxt + '（统计口径：天干 1.0、藏干本气 1.0/中气 0.5/余气 0.3，供参考）');
      } catch (e) {}
      try {
        L.push('【命宫·身宫·胎元】命宫 ' + ec.getMingGong() + '｜身宫 ' + ec.getShenGong() + '｜胎元 ' + ec.getTaiYuan());
      } catch (e) {}
      // 大运全表＋当前大运＋今年流年
      try {
        var yun = ec.getYun(data.gender);
        var dys = yun.getDaYun(10);
        var curYear = new Date().getFullYear();
        L.push('');
        L.push('【大运】出生后 ' + yun.getStartYear() + ' 年 ' + yun.getStartMonth() + ' 月 ' + yun.getStartDay() + ' 天起运，' + (yun.isForward() ? '顺行' : '逆行'));
        for (var i = 1; i < dys.length && i <= 8; i++) {
          var dy = dys[i], gz = '';
          try { gz = dy.getGanZhi(); } catch (e) {}
          if (!gz) continue;
          var dGan = gz.charAt(0), dZhi = gz.charAt(1);
          var isCur = false;
          try { isCur = curYear >= dy.getStartYear() && curYear <= dy.getEndYear(); } catch (e) {}
          var hide = ZHI_HIDE[dZhi] || [];
          L.push('第' + i + '步 ' + gz + '（' + dy.getStartAge() + '~' + dy.getEndAge() + '岁，' + dy.getStartYear() + '~' + dy.getEndYear() + '年）'
            + '：天干 ' + shishenOf(dayGan, dGan)
            + (hide.length ? '｜地支本气 ' + hide[0] + '（' + shishenOf(dayGan, hide[0]) + '）' : '')
            + (isCur ? ' ← 当前大运' : ''));
        }
        try {
          var lz = window.Solar.fromYmd(curYear, 6, 15).getLunar();
          var lg = lz.getYearGan(), lzh = lz.getYearZhi();
          var lHide = ZHI_HIDE[lzh] || [];
          L.push('【今年流年】' + curYear + ' 年 ' + lg + lzh + '：天干 ' + shishenOf(dayGan, lg)
            + (lHide.length ? '｜地支本气 ' + lHide[0] + '（' + shishenOf(dayGan, lHide[0]) + '）' : ''));
        } catch (e) {}
      } catch (e) {}
      window.__wuriChartText = window.__wuriChartText || {};
      window.__wuriChartText.bazi = L.join('\n');
    } catch (e) {
      try {
        var host = $('#bz-tab-result');
        var txt = host ? host.innerText.slice(0, 3000) : '';
        window.__wuriChartText = window.__wuriChartText || {};
        window.__wuriChartText.bazi = '八字排盘\n' + txt;
      } catch (e2) {}
    }
  }

  function loadHist() {
    try { return JSON.parse(localStorage.getItem(LS_HIST) || '[]'); } catch (e) { return []; }
  }
  function saveHist(l) { try { localStorage.setItem(LS_HIST, JSON.stringify(l)); } catch (e) {} }

  function initInputDefaults() {
    var d = $('#bz-date');
    if (d && !d.value) {
      var now = new Date();
      d.value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    }
    if (d) d.max = new Date().toISOString().slice(0, 10);
    /* 全局时间基准（我的→设置）：默认真太阳时；八字与时值神共用 */
    try {
      var _gc = (window.__wuriGetCfg && window.__wuriGetCfg()) || {};
      var _bt = $('#bz-true');
      if (_bt && !_bt.dataset.seeded) { _bt.checked = ((_gc.timebase || 'true') === 'true'); _bt.dataset.seeded = '1'; }
      var _bl = $('#bz-lon');
      if (_bl && !_bl.value && _gc.lon) _bl.value = _gc.lon;
    } catch (e) {}
    /* 晚子时流派单选回填（保存值/默认流派2） */
    $all('input[name="bz-sect"]').forEach(function (r) { r.checked = (+r.value === curSect); });
  }

  function trueSolar(y, m, d, h, mi, lon) {
    var dt = new Date(y, m - 1, d, h, mi);
    var off = Math.round((lon - 120) * 4);
    dt = new Date(dt.getTime() + off * 60000);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), h: dt.getHours(), mi: dt.getMinutes(), off: off };
  }

  function buildData(p) {
    var y = p.y, m = p.m, d = p.d, hh = p.hh, mm = p.mm, tsInfo = null;
    if (p.useTrue && !isNaN(p.lon)) {
      tsInfo = trueSolar(y, m, d, hh, mm, p.lon);
      y = tsInfo.y; m = tsInfo.m; d = tsInfo.d; hh = tsInfo.h; mm = tsInfo.mi;
    }
    if (!window.Solar) throw new Error('历法库未加载');
    var solar;
    if (p.cal === 'lunar') {
      var ln = window.Lunar.fromYmd(y, m, d);
      solar = ln.getSolar();
      if (p.hasTime) solar = window.Solar.fromYmdHms(solar.getYear(), solar.getMonth(), solar.getDay(), hh, mm, 0);
    } else if (p.hasTime) {
      solar = window.Solar.fromYmdHms(y, m, d, hh, mm, 0);
    } else {
      solar = window.Solar.fromYmd(y, m, d);
    }
    var lunar = solar.getLunar();
    var ec = lunar.getEightChar();
    try { ec.setSect(curSect); } catch (e) {} // 晚子时流派（默认流派2＝升级前现状）
    return {
      name: p.name, gender: p.gender, cal: p.cal, dateStr: p.dateStr,
      hasTime: p.hasTime, tsInfo: tsInfo, group: p.group, cityName: p.cityName,
      ec: ec, lunar: lunar,
      y: solar.getYear(), m: solar.getMonth(), d: solar.getDay()
    };
  }

  function doPaipan() {
    var date = $('#bz-date').value;
    if (!date) { WuriDlg.alert('请选择出生日期'); return; }
    var a = date.split('-'), y = +a[0], m = +a[1], d = +a[2];
    var now = new Date(); now.setHours(0, 0, 0, 0);
    if (new Date(y, m - 1, d) > now) { WuriDlg.alert('出生日期不能是未来'); return; }
    var timeStr = $('#bz-time').value, hasTime = !!timeStr, hh = 0, mm = 0;
    if (hasTime) { var ta = timeStr.split(':'); hh = +ta[0]; mm = +ta[1]; }
    var g = document.querySelector('input[name="bz-gender"]:checked');
    var gender = g ? +g.value : 1;
    var c = document.querySelector('input[name="bz-cal"]:checked');
    var cal = c ? c.value : 'solar';
    var useTrue = $('#bz-true').checked;
    var sEl = document.querySelector('input[name="bz-sect"]:checked');
    if (sEl) { curSect = +sEl.value; try { localStorage.setItem('wuri_bazi_sect', String(curSect)); } catch (e) {} }
    // 城市（任务9会换成分级选择器，先保留简单版）
    var lon = parseFloat($('#bz-lon') ? $('#bz-lon').value : '116.42');
    var cityName = $('#bz-cityname') ? $('#bz-cityname').value : '';

    var p = {
      name: ($('#bz-name').value || '').trim(), gender: gender, cal: cal,
      dateStr: date + (hasTime ? ' ' + timeStr : ''),
      y: y, m: m, d: d, hh: hh, mm: mm, hasTime: hasTime,
      useTrue: useTrue, lon: lon, cityName: cityName,
      group: (function(){ var s=$('#bz-group'), cu=$('#bz-group-custom'); if(s && s.value==='__custom' && cu) return (cu.value||'').trim(); return ((s&&s.value)||'').trim(); })()
    };
    var data;
    try { data = buildData(p); } catch (e) { WuriDlg.alert('排盘失败：' + e.message); return; }

    if ($('#bz-save').checked) {
      var hist = loadHist();
      hist.unshift({
        name: p.name, gender: p.gender, cal: p.cal, dateStr: p.dateStr, group: p.group,
        y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm, hasTime: p.hasTime,
        useTrue: p.useTrue, lon: p.lon, cityName: p.cityName,
        // 存四柱用于列表预览
        gz: [data.ec.getYear(), data.ec.getMonth(), data.ec.getDay(), p.hasTime ? data.ec.getTime() : '']
      });
      if (hist.length > 300) {
        hist = hist.slice(0, 300);
        try {
          if (!localStorage.getItem('wuri_bazi_hist_warned')) {
            localStorage.setItem('wuri_bazi_hist_warned', '1');
            setTimeout(function () { WuriDlg.alert('八字历史已满300条，新记录将覆盖最早的记录。'); }, 500);
          }
        } catch (e) {}
      }
      saveHist(hist);
    }
    curData = data;
    selDayunIdx = 0;
    privacyOn = false;
    renderResult();
    showTab('result');
  }

  function wxSpan(ch, wx) {
    return '<span style="color:' + (WX_COLOR[wx] || '') + '">' + esc(ch) + '</span>';
  }

  function renderResult() {
    if (!curData) return;
    var data = curData, ec = data.ec;
    var host = $('#bz-tab-result');

    var dayGan = ec.getDayGan(), yearZhi = ec.getYearZhi();
    var pillars = [
      { k: 'year', label: '年柱' }, { k: 'month', label: '月柱' },
      { k: 'day', label: '日柱' }, { k: 'time', label: '时柱' }
    ];
    var cols = pillars.map(function (p) {
      if (p.k === 'time' && !data.hasTime) return null;
      var cap = p.k.charAt(0).toUpperCase() + p.k.slice(1);
      var col = { label: p.label };
      try {
        col.gan = ec['get' + cap + 'Gan']();
        col.zhi = ec['get' + cap + 'Zhi']();
        col.ssGan = ec['get' + cap + 'ShiShenGan']();
        col.hide = ec['get' + cap + 'HideGan']() || [];
        col.ssZhi = ec['get' + cap + 'ShiShenZhi']() || [];
        col.nayin = ec['get' + cap + 'NaYin']();
        col.dishi = ec['get' + cap + 'DiShi'](); // 星运=日干对各支
        col.zizuo = ziZuo(col.gan, col.zhi);     // 自坐=本干坐本支
        col.xunkong = ec['get' + cap + 'XunKong']();
        col.shensha = shensha(dayGan, yearZhi, col.zhi, ec.getMonthZhi(), ec.getDayZhi(), col.gan + col.zhi, col.gan);
      } catch (e) { return null; }
      return col;
    });

    // 大运
    var yun = null, dys = [];
    try {
      yun = ec.getYun(data.gender);
      dys = yun.getDaYun(10);
    } catch (e) {}

    // 当前选中的大运/流年（用于前置三列）
    var selDy = dys[selDayunIdx + 1] || null; // dys[0]是起运前，dys[1]是第一步大运
    var selDyGz = '', selDySs = '';
    if (selDy) { try { selDyGz = selDy.getGanZhi(); selDySs = selDy.getGanZhiShiShen ? '' : ''; } catch (e) {} }

    var html = '';

    // 头部：姓名 + 隐私开关
    var dispName = privacyOn ? '＊＊＊' : esc(data.name || '未命名');
    var dispBirth = privacyOn ? '＊＊＊' : esc((data.cal === 'lunar' ? '农历 ' : '阳历 ') + data.dateStr);
    html += '<div class="bz-r-head">'
      + '<div class="bz-r-top"><span class="bz-r-name">' + dispName + '</span>'
      + '<button class="mini-btn tiny" id="bz-privacy">' + (privacyOn ? '显示' : '隐藏') + '</button></div>'
      + '<div class="bz-r-sub">' + esc(data.lunar.getYearShengXiao() + '年') + ' · '
      + esc(data.gender === 1 ? '乾造' : '坤造') + ' · ' + dispBirth
      + (data.tsInfo && !privacyOn ? '（真太阳时' + (data.tsInfo.off >= 0 ? '+' : '') + data.tsInfo.off + '分，未含均时差）' : '')
      + '</div></div>';

    // 主表
    html += '<div class="bz-table-wrap"><table class="bz-table">';
    // 表头：日期/流年/大运/年柱/月柱/日柱/时柱
    html += '<tr><th>日期</th><th>流年</th><th>大运</th>'
      + cols.map(function (c) { return '<th>' + (c ? c.label : '') + '</th>'; }).join('') + '</tr>';

    // 主星行
    html += '<tr><td class="bz-rowh">主星</td>';
    // 流年主星（对日干的十神）
    var lnGan = '', lnZhi = '';
    // 大运主星
    html += '<td class="bz-ss" id="bz-c-liunian-ss">-</td><td class="bz-ss" id="bz-c-dayun-ss">-</td>';
    html += cols.map(function (c) {
      if (!c) return '<td></td>';
      var ss = c.label === '日柱' ? '日主' : (c.ssGan || '');
      return '<td class="bz-ss">' + esc(ss) + '</td>';
    }).join('') + '</tr>';

    // 天干
    html += '<tr><td class="bz-rowh">天干</td><td id="bz-c-liunian-gan">-</td><td id="bz-c-dayun-gan">-</td>'
      + cols.map(function (c) {
        return c ? '<td class="bz-gan">' + wxSpan(c.gan, GAN_WX[c.gan]) + '</td>' : '<td></td>';
      }).join('') + '</tr>';
    // 地支
    html += '<tr><td class="bz-rowh">地支</td><td id="bz-c-liunian-zhi">-</td><td id="bz-c-dayun-zhi">-</td>'
      + cols.map(function (c) {
        return c ? '<td class="bz-zhi">' + wxSpan(c.zhi, ZHI_WX[c.zhi]) + '</td>' : '<td></td>';
      }).join('') + '</tr>';
    // 藏干（问真式：干支同行，一行一组）
    html += '<tr><td class="bz-rowh">藏干</td><td>-</td><td>-</td>'
      + cols.map(function (c) {
        if (!c) return '<td></td>';
        var t = c.hide.map(function (g, i) {
          return '<div class="bz-cg-line">' + wxSpan(g, GAN_WX[g]) + '<span class="bz-cg-ss">' + esc(c.ssZhi[i] || '') + '</span></div>';
        }).join('');
        return '<td class="bz-hide">' + t + '</td>';
      }).join('') + '</tr>';
    // 星运
    html += '<tr><td class="bz-rowh">星运</td><td>-</td><td>-</td>'
      + cols.map(function (c) { return c ? '<td>' + esc(c.dishi) + '</td>' : '<td></td>'; }).join('') + '</tr>';
    // 自坐
    html += '<tr><td class="bz-rowh">自坐</td><td>-</td><td>-</td>'
      + cols.map(function (c) { return c ? '<td>' + esc(c.zizuo) + '</td>' : '<td></td>'; }).join('') + '</tr>';
    // 空亡
    html += '<tr><td class="bz-rowh">空亡</td><td>-</td><td>-</td>'
      + cols.map(function (c) { return c ? '<td>' + esc(c.xunkong) + '</td>' : '<td></td>'; }).join('') + '</tr>';
    // 纳音
    html += '<tr><td class="bz-rowh">纳音</td><td>-</td><td>-</td>'
      + cols.map(function (c) { return c ? '<td>' + esc(c.nayin) + '</td>' : '<td></td>'; }).join('') + '</tr>';
    // 神煞（全展示）
    html += '<tr><td class="bz-rowh">神煞</td><td>-</td><td>-</td>'
      + cols.map(function (c) {
        if (!c) return '<td></td>';
        var items = (c.shensha || '').split(/\s+/).filter(Boolean);
        var t = items.map(function (s) { return '<span class="bz-ss-item">' + esc(s) + '</span>'; }).join('');
        return '<td class="bz-shensha">' + t + '</td>';
      }).join('') + '</tr>';
    html += '</table></div>';


    // 起运/交运
    if (yun) {
      try {
        html += '<div class="bz-yun-info">起运：出生后' + yun.getStartYear() + '年' + yun.getStartMonth() + '月' + yun.getStartDay() + '天起运'
          + ' · 交运：' + (yun.isForward() ? '顺行' : '逆行') + '</div>';
      } catch (e) {}
    }

    // 命宫 / 身宫 / 胎元（引擎现成）
    try {
      html += '<div class="bz-yun-info">命宫 ' + esc(ec.getMingGong()) + ' · 身宫 ' + esc(ec.getShenGong()) + ' · 胎元 ' + esc(ec.getTaiYuan()) + '</div>';
    } catch (e) {}

    // 五行力量（口径见 wxPower 注释）
    var wp = wxPower(cols);
    html += '<div class="bz-sec-t">五行力量 <span class="muted">（天干 1.0、藏干本气 1.0 / 中气 0.5 / 余气 0.3，供参考）</span></div><div class="bz-wxp">';
    ['木', '火', '土', '金', '水'].forEach(function (wx) {
      var pct = wp.total ? Math.round(wp.score[wx] / wp.total * 100) : 0;
      html += '<div class="bz-wxp-row"><span class="bz-wxp-name" style="color:' + WX_COLOR[wx] + '">' + wx + '</span>'
        + '<span class="bz-wxp-bar"><i style="width:' + pct + '%;background:' + WX_COLOR[wx] + '"></i></span>'
        + '<span class="bz-wxp-pct">' + pct + '%</span></div>';
    });
    html += '</div>';

    // 称骨（民俗附加）
    try {
      var cg = chenggu(data);
      if (cg) {
        html += '<div class="bz-sec-t">称骨 <span class="muted">（袁天罡称骨，民俗附加，仅供参考）</span></div><div class="bz-chenggu">'
          + '<div class="bz-cg-parts">' + cg.parts.map(function (pt) {
              return '<span class="bz-cg-part">' + esc(pt.label) + ' ' + fmtQian(pt.w) + '</span>';
            }).join('') + '</div>'
          + '<div class="bz-cg-total">总骨重 ' + fmtQian(cg.total) + (cg.noTime ? ' <span class="muted">（未计入时重：出生时间不详）</span>' : '') + '</div>'
          + '<div class="bz-cg-song">' + esc(cg.song) + '</div></div>';
      }
    } catch (e) {}

    // 大运选择器
    html += '<div class="bz-sec-t">大运 <span class="muted">（点击切换）</span></div>';
    html += '<div class="bz-hscroll"><table class="bz-htable"><tr id="bz-dayun-row">';
    for (var i = 1; i < dys.length && i <= 8; i++) {
      var gz = '', sa = '';
      try { gz = dys[i].getGanZhi(); sa = dys[i].getStartAge(); } catch (e) {}
      if (!gz) continue;
      var sel = (i - 1 === selDayunIdx) ? ' sel' : '';
      html += '<td class="bz-dy-cell' + sel + '" data-dyi="' + (i - 1) + '">'
        + '<div class="bz-hgz">' + wxSpan(gz.charAt(0), GAN_WX[gz.charAt(0)]) + wxSpan(gz.charAt(1), ZHI_WX[gz.charAt(1)]) + '</div>'
        + '<div class="bz-hage">' + sa + '岁</div></td>';
    }
    html += '</tr></table></div>';

    // 流年（选中大运的10年）
    html += '<div class="bz-sec-t">流年</div><div class="bz-hscroll"><table class="bz-htable"><tr id="bz-liunian-row"></tr></table></div>';
    // 流月
    html += '<div class="bz-sec-t">流月 <span class="muted" id="bz-liuyue-year"></span></div><div class="bz-hscroll"><table class="bz-htable"><tr id="bz-liuyue-row"></tr></table></div>';
    // 流日
    html += '<div class="bz-sec-t">流日 <span class="muted" id="bz-liuri-title">（点上方流月查看）</span></div><div class="bz-hscroll"><table class="bz-htable"><tr id="bz-liuri-row"></tr></table></div>';

    html += '<p class="hint bz-disclaimer">以上为传统历法推算，仅供参考，不作命理解读。</p>';

    host.innerHTML = html;

    // 绑定
    $('#bz-privacy').addEventListener('click', function () {
      privacyOn = !privacyOn;
      renderResult();
    });
    $all('.bz-dy-cell').forEach(function (el) {
      el.addEventListener('click', function () {
        selDayunIdx = +el.getAttribute('data-dyi');
        renderResult();
      });
    });

    updateLiunianLiuyue();
  }

  function updateLiunianLiuyue() {
    if (!curData) return;
    var ec = curData.ec, dys = [];
    try { dys = ec.getYun(curData.gender).getDaYun(10); } catch (e) { return; }
    var selDy = dys[selDayunIdx + 1];
    if (!selDy) return;

    // 大运干支填入前置列
    var dg = '', dz = '';
    try {
      var gzz = selDy.getGanZhi();
      dg = gzz.charAt(0); dz = gzz.charAt(1);
    } catch (e) {}
    var el = $('#bz-c-dayun-gan');
    if (el) el.innerHTML = wxSpan(dg, GAN_WX[dg]);
    el = $('#bz-c-dayun-zhi');
    if (el) el.innerHTML = wxSpan(dz, ZHI_WX[dz]);

    // 流年：大运起始年起10年
    var startAge = 0;
    try { startAge = selDy.getStartAge(); } catch (e) {}
    var birthY = curData.y;
    var lrHtml = '';
    var curYear = new Date().getFullYear();
    var selYear = null;
    for (var k = 0; k < 10; k++) {
      var yy = birthY + startAge + k;
      var lz;
      try { lz = window.Solar.fromYmd(yy, 6, 15).getLunar(); } catch (e) { continue; }
      var lg = lz.getYearGan(), lzh = lz.getYearZhi();
      var isCur = yy === curYear;
      if (isCur) selYear = yy;
      lrHtml += '<td class="bz-ly-cell' + (isCur ? ' sel' : '') + '" data-y="' + yy + '">'
        + '<div class="bz-hage">' + yy + '</div>'
        + '<div class="bz-hgz">' + wxSpan(lg, GAN_WX[lg]) + wxSpan(lzh, ZHI_WX[lzh]) + '</div></td>';
    }
    var lr = $('#bz-liunian-row');
    if (lr) {
      lr.innerHTML = lrHtml;
      $all('.bz-ly-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
          $all('.bz-ly-cell').forEach(function (c) { c.classList.remove('sel'); });
          cell.classList.add('sel');
          updateLiuyue(+cell.getAttribute('data-y'));
          // 更新前置流年列
          updateLiunianCol(+cell.getAttribute('data-y'));
        });
      });
    }
    // 默认选中今年（或第一年），更新流月
    updateLiuyue(selYear || (birthY + startAge));
    updateLiunianCol(selYear || (birthY + startAge));
  }

  function updateLiunianCol(yy) {
    try {
      var lz = window.Solar.fromYmd(yy, 6, 15).getLunar();
      var lg = lz.getYearGan(), lzh = lz.getYearZhi();
      var el = $('#bz-c-liunian-gan');
      if (el) el.innerHTML = wxSpan(lg, GAN_WX[lg]);
      el = $('#bz-c-liunian-zhi');
      if (el) el.innerHTML = wxSpan(lzh, ZHI_WX[lzh]);
    } catch (e) {}
  }

  /* 流月/流日：分段起止用引擎节气表取准确日期（旧版用粗略节气日近似）。
   * 流年 yy 的 12 段自立春(yy)起：立春…大雪取 yy 年节气表，小寒取 yy+1 年表；
   * 末段止于次年立春前一日。取不到节气表时回落旧近似日。 */
  function jqDate(yy, name, ofNextYear) {
    try {
      var t = window.Solar.fromYmd(ofNextYear ? yy + 1 : yy, 6, 30).getLunar().getJieQiTable();
      var s = t[name];
      if (s) return { y: s.getYear(), m: s.getMonth(), d: s.getDay() };
    } catch (e) {}
    return null;
  }
  function dAdd(o, n) { var t = new Date(o.y, o.m - 1, o.d + n); return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }; }
  function dKey(o) { return o.y * 10000 + o.m * 100 + o.d; }

  function updateLiuyue(yy) {
    if (!yy) return;
    var yl = $('#bz-liuyue-year');
    if (yl) yl.textContent = '（' + yy + '年）';
    var jieqi = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];
    var approxM = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1];
    var approxD = [4, 6, 6, 6, 6, 7, 8, 8, 9, 8, 7, 6];
    var starts = [];
    for (var i = 0; i < 12; i++) {
      var st = jqDate(yy, jieqi[i], i === 11);
      if (!st) { var am = approxM[i]; st = { y: am === 1 ? yy + 1 : yy, m: am, d: approxD[i] }; }
      starts.push(st);
    }
    var lichunNext = jqDate(yy, '立春', true) || dAdd(starts[11], 30);
    var today = new Date();
    var todayO = { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
    var html = '', defIdx = 0;
    for (var mi = 0; mi < 12; mi++) {
      var end = mi < 11 ? dAdd(starts[mi + 1], -1) : dAdd(lichunNext, -1);
      if (dKey(todayO) >= dKey(starts[mi]) && dKey(todayO) <= dKey(end)) defIdx = mi;
      var mid = dAdd(starts[mi], 2); // 段内取日读月柱（避开节气交接时刻）
      var mg = '', mzh = '';
      try {
        var lz = window.Solar.fromYmd(mid.y, mid.m, mid.d).getLunar();
        mg = lz.getMonthGan(); mzh = lz.getMonthZhi();
      } catch (e) {}
      html += '<td class="bz-ly-cell bz-lym-cell" data-mi="' + mi + '"'
        + ' data-s="' + starts[mi].y + '-' + starts[mi].m + '-' + starts[mi].d + '"'
        + ' data-e="' + end.y + '-' + end.m + '-' + end.d + '"'
        + ' data-label="' + jieqi[mi] + '月 ' + mg + mzh + '">'
        + '<div class="bz-hage">' + jieqi[mi] + '</div>'
        + '<div class="bz-hgz">' + wxSpan(mg, GAN_WX[mg]) + wxSpan(mzh, ZHI_WX[mzh]) + '</div></td>';
    }
    var lr = $('#bz-liuyue-row');
    if (lr) {
      lr.innerHTML = html;
      $all('.bz-lym-cell').forEach(function (cell) {
        cell.addEventListener('click', function () { selectLiuyueCell(cell); });
      });
      var def = lr.querySelector('[data-mi="' + defIdx + '"]');
      if (def) selectLiuyueCell(def);
    }
  }

  function selectLiuyueCell(cell) {
    $all('.bz-lym-cell').forEach(function (c) { c.classList.remove('sel'); });
    cell.classList.add('sel');
    var sp = cell.getAttribute('data-s').split('-'), ep = cell.getAttribute('data-e').split('-');
    renderLiuri(
      { y: +sp[0], m: +sp[1], d: +sp[2] },
      { y: +ep[0], m: +ep[1], d: +ep[2] },
      cell.getAttribute('data-label')
    );
  }

  function renderLiuri(start, end, label) {
    var title = $('#bz-liuri-title');
    if (title) title.textContent = '（' + label + '）';
    var row = $('#bz-liuri-row');
    if (!row) return;
    var today = new Date();
    var tk = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    var html = '', cur = start, guard = 0;
    while (dKey(cur) <= dKey(end) && guard < 40) {
      guard++;
      var dg = '', dz = '';
      try {
        var lz = window.Solar.fromYmd(cur.y, cur.m, cur.d).getLunar();
        dg = lz.getDayGan(); dz = lz.getDayZhi();
      } catch (e) {}
      var isToday = dKey(cur) === tk;
      html += '<td class="bz-ly-cell' + (isToday ? ' sel' : '') + '">'
        + '<div class="bz-hage">' + cur.m + '/' + cur.d + (isToday ? ' · 今' : '') + '</div>'
        + '<div class="bz-hgz">' + wxSpan(dg, GAN_WX[dg]) + wxSpan(dz, ZHI_WX[dz]) + '</div></td>';
      cur = dAdd(cur, 1);
    }
    row.innerHTML = html;
  }

  function renderHistory() {
    var list = loadHist();
    var host = $('#bz-hist-list');
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<p class="hint">暂无保存的排盘</p>';
      return;
    }
    // 按分组
    var groups = {}, order = [];
    list.forEach(function (it, i) {
      var g = it.group || '未分组';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push({ it: it, idx: i });
    });
    var html = '';
    order.forEach(function (g) {
      html += '<div class="bz-hg-t">' + esc(g) + '（' + groups[g].length + '）</div>';
      groups[g].forEach(function (e) {
        var it = e.it;
        var gz = it.gz || ['', '', '', ''];
        var gzHtml = '<div class="bz-hg-gz">'
          + gz.map(function (gzz) {
            if (!gzz || gzz.length < 2) return '<span></span>';
            return '<span>' + wxSpan(gzz.charAt(0), GAN_WX[gzz.charAt(0)]) + wxSpan(gzz.charAt(1), ZHI_WX[gzz.charAt(1)]) + '</span>';
          }).join('') + '</div>';
        html += '<div class="bz-hist-item" data-hi="' + e.idx + '">'
          + '<div class="bz-hi-main"><div><b>' + esc(it.name || '未命名') + '</b> '
          + '<span class="muted">' + esc(it.gender === 1 ? '男' : '女') + '</span></div>'
          + '<div class="muted small">' + esc(it.dateStr) + '</div></div>'
          + gzHtml
          + '</div>';
      });
    });
    host.innerHTML = html;
    host.querySelectorAll('.bz-hist-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var it = loadHist()[+el.getAttribute('data-hi')];
        if (it) replay(it);
      });
    });
  }

  function replay(it) {
    $('#bz-name').value = it.name || '';
    $all('input[name="bz-gender"]').forEach(function (r) { r.checked = (+r.value === it.gender); });
    $all('input[name="bz-cal"]').forEach(function (r) { r.checked = (r.value === it.cal); });
    $('#bz-date').value = it.dateStr.slice(0, 10);
    $('#bz-time').value = it.hasTime ? it.dateStr.slice(11) : '';
    $('#bz-group').value = it.group || '';
    var p = {
      name: it.name, gender: it.gender, cal: it.cal, dateStr: it.dateStr,
      y: it.y, m: it.m, d: it.d, hh: it.hh, mm: it.mm, hasTime: it.hasTime,
      useTrue: it.useTrue, lon: it.lon, cityName: it.cityName, group: it.group
    };
    try { curData = buildData(p); } catch (e) { WuriDlg.alert('排盘失败：' + e.message); return; }
    selDayunIdx = 0; privacyOn = false;
    renderResult();
    showTab('result');
  }

  /* ---------- 城市选择器 ---------- */
  var cityNav = []; // 导航栈
  function renderCityNav() {
    var nav = $('#bz-city-nav');
    if (!nav) return;
    var html = '<button class="bz-cn" data-lv="-1">全部</button>';
    cityNav.forEach(function (n, i) {
      html += ' › <button class="bz-cn" data-lv="' + i + '">' + esc(n) + '</button>';
    });
    nav.innerHTML = html;
    nav.querySelectorAll('.bz-cn').forEach(function (b) {
      b.addEventListener('click', function () {
        var lv = +b.getAttribute('data-lv');
        cityNav = lv < 0 ? [] : cityNav.slice(0, lv + 1);
        renderCityList('');
      });
    });
  }
  function renderCityList(kw) {
    var list = $('#bz-city-list');
    if (!list) return;
    kw = (kw || '').trim();
    var html = '';
    function cityBtn(name, lon, lat, sub) {
      return '<button class="bz-city-item" data-name="' + esc(name) + '" data-lon="' + lon + '" data-sub="' + esc(sub || '') + '">'
        + esc(name) + '<span class="muted small"> ' + lon + '°</span></button>';
    }
    if (kw) {
      // 搜索全部
      CITY_DATA.forEach(function (prov) {
        if (prov.countries) {
          prov.countries.forEach(function (ct) {
            ct.cities.forEach(function (c) {
              if (c[0].indexOf(kw) >= 0) html += cityBtn(c[0], c[1], c[2], ct.n);
            });
          });
        } else {
          prov.cities.forEach(function (c) {
            if (c[0].indexOf(kw) >= 0 || prov.p.indexOf(kw) >= 0) html += cityBtn(c[0], c[1], c[2], prov.p);
          });
        }
      });
      if (!html) html = '<p class="hint">无匹配城市</p>';
    } else if (cityNav.length === 0) {
      CITY_DATA.forEach(function (prov) {
        html += '<button class="bz-city-item bz-prov" data-prov="' + esc(prov.p) + '">' + esc(prov.p) + ' ›</button>';
      });
    } else if (cityNav.length === 1) {
      var pv = CITY_DATA.filter(function (x) { return x.p === cityNav[0]; })[0];
      if (pv) {
        if (pv.countries) {
          pv.countries.forEach(function (ct) {
            html += '<button class="bz-city-item bz-prov" data-country="' + esc(ct.n) + '">' + esc(ct.n) + ' ›</button>';
          });
        } else {
          pv.cities.forEach(function (c) { html += cityBtn(c[0], c[1], c[2], pv.p); });
        }
      }
    } else if (cityNav.length === 2) {
      var pv2 = CITY_DATA.filter(function (x) { return x.p === cityNav[0]; })[0];
      if (pv2 && pv2.countries) {
        var ct2 = pv2.countries.filter(function (x) { return x.n === cityNav[1]; })[0];
        if (ct2) ct2.cities.forEach(function (c) { html += cityBtn(c[0], c[1], c[2], ct2.n); });
      }
    }
    list.innerHTML = html;
    renderCityNav();
    list.querySelectorAll('[data-prov]').forEach(function (b) {
      b.addEventListener('click', function () { cityNav.push(b.getAttribute('data-prov')); renderCityList(''); });
    });
    list.querySelectorAll('[data-country]').forEach(function (b) {
      b.addEventListener('click', function () { cityNav.push(b.getAttribute('data-country')); renderCityList(''); });
    });
    list.querySelectorAll('[data-lon]').forEach(function (b) {
      b.addEventListener('click', function () {
        var nm = b.getAttribute('data-name'), lon = b.getAttribute('data-lon');
        $('#bz-lon').value = lon;
        $('#bz-cityname').value = nm;
        $('#bz-city-btn').textContent = nm + ' ' + lon + '°';
        $('#bz-city-modal').hidden = true;
      });
    });
  }
  function initCityPicker() {
    var btn = $('#bz-city-btn'), modal = $('#bz-city-modal');
    if (!btn || !modal || typeof CITY_DATA === 'undefined') return;
    btn.addEventListener('click', function () {
      cityNav = []; renderCityList(''); $('#bz-city-search').value = '';
      modal.hidden = false;
    });
    $('#bz-city-close').addEventListener('click', function () { modal.hidden = true; });
    $('#bz-city-search').addEventListener('input', function () { renderCityList(this.value); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
  }

  function init() {
    var entry = $('#bazi-enter');
    if (entry) entry.addEventListener('click', open);
    // 分组自定义
    var gSel = $('#bz-group'), gCus = $('#bz-group-custom');
    if (gSel && gCus) {
      gSel.addEventListener('change', function () {
        gCus.style.display = this.value === '__custom' ? 'block' : 'none';
      });
    }
    var back = $('#bazi-back');
    if (back) back.addEventListener('click', close);
    $all('[data-bztab]').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-bztab')); });
    });
    var go = $('#bz-go');
    if (go) go.addEventListener('click', doPaipan);
    initCityPicker();
    // citydata.js 需在 index.html 中引入
    if (typeof CITY_DATA === 'undefined') {
      var s = document.createElement('script');
      s.src = 'js/citydata.js';
      document.head.appendChild(s);
    }
  }

  return { init: init, open: open, close: close, showTab: showTab, buildChartText: buildChartText };
})();

document.addEventListener('DOMContentLoaded', function () { Bazi.init(); });

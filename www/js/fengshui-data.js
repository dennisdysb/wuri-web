/* 风水模块数据层（第一批：二十四山）
 *
 * 二十四山表转录自 ml8s/liki 的 Mountains24Table（MIT License）：
 *   源仓库 https://github.com/ml8s/liki
 *   源文件 engine/internal/engine/fengshui/mountain.go
 * 本项目开源扫描已逐行核对（见 wuri-app/opensource-scan/fengshui-scan.md）：
 * 子=阴/坎/天元龙、艮=阳、卯=阴、巳=阳/人元龙 等抽查点与原表一致，此处全表照录。
 * 字段：name 山名 / angle 中心角（子=0°，自北顺时针，每山 15°）/ wuxing 五行 /
 *       yinyang 阴阳 / gua 所属卦 / yuan 三元龙（天元/地元/人元）。
 */
window.FS24 = [
  { name: '子', angle: 0,   wuxing: '水', yinyang: '阴', gua: '坎', yuan: '天元龙' },
  { name: '癸', angle: 15,  wuxing: '水', yinyang: '阴', gua: '坎', yuan: '人元龙' },
  { name: '丑', angle: 30,  wuxing: '土', yinyang: '阴', gua: '艮', yuan: '地元龙' },
  { name: '艮', angle: 45,  wuxing: '土', yinyang: '阳', gua: '艮', yuan: '天元龙' },
  { name: '寅', angle: 60,  wuxing: '木', yinyang: '阳', gua: '艮', yuan: '人元龙' },
  { name: '甲', angle: 75,  wuxing: '木', yinyang: '阳', gua: '震', yuan: '地元龙' },
  { name: '卯', angle: 90,  wuxing: '木', yinyang: '阴', gua: '震', yuan: '天元龙' },
  { name: '乙', angle: 105, wuxing: '木', yinyang: '阴', gua: '震', yuan: '人元龙' },
  { name: '辰', angle: 120, wuxing: '土', yinyang: '阴', gua: '巽', yuan: '地元龙' },
  { name: '巽', angle: 135, wuxing: '木', yinyang: '阳', gua: '巽', yuan: '天元龙' },
  { name: '巳', angle: 150, wuxing: '火', yinyang: '阳', gua: '巽', yuan: '人元龙' },
  { name: '丙', angle: 165, wuxing: '火', yinyang: '阳', gua: '离', yuan: '地元龙' },
  { name: '午', angle: 180, wuxing: '火', yinyang: '阴', gua: '离', yuan: '天元龙' },
  { name: '丁', angle: 195, wuxing: '火', yinyang: '阴', gua: '离', yuan: '人元龙' },
  { name: '未', angle: 210, wuxing: '土', yinyang: '阴', gua: '坤', yuan: '地元龙' },
  { name: '坤', angle: 225, wuxing: '土', yinyang: '阳', gua: '坤', yuan: '天元龙' },
  { name: '申', angle: 240, wuxing: '金', yinyang: '阳', gua: '坤', yuan: '人元龙' },
  { name: '庚', angle: 255, wuxing: '金', yinyang: '阳', gua: '兑', yuan: '地元龙' },
  { name: '酉', angle: 270, wuxing: '金', yinyang: '阴', gua: '兑', yuan: '天元龙' },
  { name: '辛', angle: 285, wuxing: '金', yinyang: '阴', gua: '兑', yuan: '人元龙' },
  { name: '戌', angle: 300, wuxing: '土', yinyang: '阴', gua: '乾', yuan: '地元龙' },
  { name: '乾', angle: 315, wuxing: '金', yinyang: '阳', gua: '乾', yuan: '天元龙' },
  { name: '亥', angle: 330, wuxing: '水', yinyang: '阳', gua: '乾', yuan: '人元龙' },
  { name: '壬', angle: 345, wuxing: '水', yinyang: '阳', gua: '坎', yuan: '地元龙' }
];

/* 八卦环：[卦名, 方位角（子起顺时针）, 爻序（自下而上，1=阳爻 0=阴爻）]
 * 坎北、艮东北、震东、巽东南、离南、坤西南、兑西、乾西北。 */
window.FS_TRI = [
  ['坎', 0,   [0, 1, 0]],
  ['艮', 45,  [0, 0, 1]],
  ['震', 90,  [1, 0, 0]],
  ['巽', 135, [0, 1, 1]],
  ['离', 180, [1, 0, 1]],
  ['坤', 225, [0, 0, 0]],
  ['兑', 270, [1, 1, 0]],
  ['乾', 315, [1, 1, 1]]
];

/* 四正山（朱砂）与四隅卦山（鎏金），与设计稿盘面配色口径一致 */
window.FS_CARDINAL = { '子': 1, '卯': 1, '午': 1, '酉': 1 };
window.FS_GUA_MTN = { '艮': 1, '巽': 1, '坤': 1, '乾': 1 };

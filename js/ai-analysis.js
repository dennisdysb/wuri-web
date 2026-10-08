/* AI 分析：复制排盘+prompt，调起 DeepSeek（或提示安装） */
(function () {
'use strict';
var AI_PKG = 'com.deepseek.chat';
var AI_NAME = 'DeepSeek';
function toast(msg) {
var t = document.getElementById('wuri-ai-toast');
if (!t) {
t = document.createElement('div');
t.id = 'wuri-ai-toast';
t.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;z-index:10000;max-width:80%;text-align:center;';
document.body.appendChild(t);
}
t.textContent = msg;
t.style.display = 'block';
clearTimeout(t._tm);
t._tm = setTimeout(function () { t.style.display = 'none';}, 3000);
}
function buildPrompt(type, chartText) {
var heads = {
  liuyao: '你是一位精通六爻占卜的专家，熟悉《增删卜易》《卜筮正宗》《易隐》等六爻经典。请根据以下起卦信息进行专业分析，只按给定卦象分析，不要重新起卦。\n\n',
  bazi: '你是一位精通八字命理的专家，熟悉《滴天髓》《穷通宝鉴》《三命通会》《子平真诠》等八字经典。请根据以下八字排盘进行专业分析，只按给定四柱、大运分析，不要重新排盘。\n\n',
  ziwei: '你是一位精通紫微斗数的专家，熟悉《紫微斗数全书》《紫微斗数讲义》等紫微经典。请根据以下命盘进行专业分析，只按给定星曜、宫位分析，不要重新排盘。\n\n'
};
var tails = {
  liuyao: '\n\n请从以下角度分析：\n1. 用神与世应分析\n2. 动爻、变爻的吉凶含义\n3. 旬空、月建日辰的影响\n4. 针对所问事由给出中肯建议\n\n注意：只做命理分析，不做医疗、法律、投资等专业领域的断言。分析仅供文化研究参考。',
  bazi: '\n\n请从以下角度分析：\n1. 日主强弱与格局特点\n2. 十神组合的含义\n3. 当前大运、流年的注意事项\n4. 给出中肯的建议\n\n注意：只做命理分析，不做医疗、法律、投资等专业领域的断言。分析仅供文化研究参考。',
  ziwei: '\n\n请从以下角度分析：\n1. 命宫主星与格局特点\n2. 各宫星曜组合的吉凶含义\n3. 大限、流年的注意事项\n4. 给出中肯的建议\n\n注意：只做命理分析，不做医疗、法律、投资等专业领域的断言。分析仅供文化研究参考。'
};
var head = heads[type] || heads.liuyao;
var tail = tails[type] || tails.liuyao;
return head + chartText + tail;
}
function chartToText(type) {
try {
if (window.__wuriChartText && window.__wuriChartText[type]) return window.__wuriChartText[type];
} catch (e) {}
return '';
}
function copyText(txt) {
try {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(txt);
return true;
}
} catch (e) {}
try {
var ta = document.createElement('textarea');
ta.value = txt;
ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta);
ta.select();
document.execCommand('copy');
document.body.removeChild(ta);
return true;
} catch (e) {}
return false;
}
window.WuriAI = {
analyze: function (type) {
var chartText = chartToText(type);
if (!chartText) { toast('暂无排盘数据，请先排盘'); return;}
var prompt = buildPrompt(type, chartText);
var opened = false;
try {
if (window.WuBridge && typeof window.WuBridge.copyAndOpenApp === 'function') {
opened =!!window.WuBridge.copyAndOpenApp(prompt, AI_PKG);
} else {
copyText(prompt);
}
} catch (e) { copyText(prompt);}
if (opened) {
toast('已复制并打开' + AI_NAME + '，请粘贴发送');
} else {
toast('排盘已复制，请打开' + AI_NAME + '粘贴分析');
}
},
setAI: function (pkg, name) { AI_PKG = pkg; AI_NAME = name;}
};
document.addEventListener('click', function (e) {
var btn = e.target.closest('#ly-ai-btn, #zw-ai-btn, #bz-ai-btn');
if (!btn) return;
var type = btn.id === 'ly-ai-btn'? 'liuyao': (btn.id === 'zw-ai-btn'? 'ziwei': 'bazi');
try {
if (type === 'liuyao' && window.LiuYao && window.LiuYao.buildChartText) window.LiuYao.buildChartText();
if (type === 'bazi' && window.Bazi && window.Bazi.buildChartText) window.Bazi.buildChartText();
} catch (err) {}
window.WuriAI.analyze(type);
});
})();

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
/* 提示词（2026-10-22「说人话」版）：数据由各工具 buildChartText 结构化喂全；
 * 本段只管角色、铁规与输出格式——先结论后分项、术语配白话注、红线与全站免责口径一致。 */
var TERM_EXAMPLE = { bazi: '「伤官（想法多、爱表达、点子来得快）」', ziwei: '「化忌（容易纠结、心里放不下）」', liuyao: '「用神（这件事成败的关键角色）」' }[type] || '「伤官（想法多、爱表达、点子来得快）」';
var RULES = '先说三条规矩：\n'
  + '1. 只能依据下面给出的数据解读，不要自己重新排盘、不要改动任何干支星曜；数据里没有的内容不要编，需要而没给的就直说「数据里没给」。\n'
  + '2. 全程用简体中文，说人话：先给结论，再讲依据；专业术语第一次出现时，紧跟一个括号、用大白话解释一句，例如' + TERM_EXAMPLE + '。\n'
  + '3. 语气像一位懂行又和气的长辈在聊天，不要吓人：不用「必然、注定、克、劫数难逃」这类下死断的话，看法用「倾向于、更容易、不太容易」来说；不做疾病诊断，不给具体买什么股票基金的操作建议，不预测生死和胎儿性别。\n\n';
var QUESTION = '\n\n————\n我的问题：（粘贴后可以把最想问的问题写在这一行后面再发送；留空也可以，会按上面维度全面讲）';
var ASK_RULE = '数据末尾有一行「我的问题」：冒号后面如果写了内容，讲完分项后请再专门回答它；留空就跳过这一条。';
var heads = {
  liuyao: '你是一位精通六爻的老师傅，熟悉《增删卜易》《卜筮正宗》《易隐》。下面是我用排盘工具起好的一卦，六爻、纳甲、世应、六神、变卦都已装好，你只管断卦，不要重新起卦或改动卦象。\n\n',
  bazi: '你是一位精通子平八字的老师傅，熟悉《滴天髓》《穷通宝鉴》《子平真诠》《三命通会》。下面是我用排盘工具排好的一个八字，四柱、十神、藏干、五行力量、大运都已排好，你只管解读，不要重新排盘。\n\n',
  ziwei: '你是一位精通紫微斗数的老师傅，熟悉《紫微斗数全书》《紫微斗数讲义》。下面是我用排盘工具排好的一张命盘，十二宫星曜、四化、大限流年都已排好，你只管解读，不要重新排盘。\n\n'
};
var tails = {
  liuyao: '\n\n请按这个顺序讲：\n'
    + '一、先说结论：用 3 到 5 句白话直接回答所问的这件事——倾向于成还是不成、顺还是不顺，先把话说清。\n'
    + '二、分项展开（每一项先给一句结论，再讲依据）：\n'
    + '1. 用神：这次该取哪个六亲作用神、为什么取它；它在本卦里旺还是弱、动不动、空不空。数据里给了「参考用神」也要结合所问事由再确认一次。\n'
    + '2. 世应：世爻（问卦人自己）和应爻（对方或所问之事）各是什么状态，两边是相生、相克还是相合，态势在谁一边。\n'
    + '3. 动爻与变卦：动爻在推动什么变化，变卦说明事情往哪个方向走；如果有伏神，也说清伏神能不能出来起作用。\n'
    + '4. 月建日辰与旬空：眼下这个时间点对用神是帮还是压，空亡的爻什么时候能填实。\n'
    + '5. 时间参考：事情大致在什么时间段内见分晓，只给大致窗口和倾向，不下死断。\n'
    + '三、给建议：2 到 3 条具体、能落地的，针对所问之事说怎么做更稳妥。\n'
    + '四、' + ASK_RULE + '\n'
    + '最后一句提醒即可：以上是传统文化角度的解读，仅供参考，决定还要结合现实情况。',
  bazi: '\n\n请按这个顺序讲：\n'
    + '一、先说结论：用 3 到 5 句白话把这个八字最要紧的特点和总体倾向说清——日主强弱、格局路子、人生大致的节奏感。\n'
    + '二、分项展开（每一项先给一句结论，再讲依据）：\n'
    + '1. 日主与格局：日主强弱看月令和四柱帮扶，格局是什么路子，这决定了这个人的底子。\n'
    + '2. 性格与天赋：从十神组合看，擅长什么、短板在哪，做事是什么风格。\n'
    + '3. 事业方向：适合的行业路子与做事方式，是适合自己闯还是适合在平台里发展。\n'
    + '4. 财运：钱的来路和守成的难易，只谈节奏和习惯，不谈具体投资。\n'
    + '5. 感情与家庭：与伴侣、家人相处的倾向和容易别扭的地方。\n'
    + '6. 大运流年：现在正走哪一步大运（数据里标了「当前」），这步运十年的主题是什么；再结合今年流年，说近一两年的重点。\n'
    + '7. 需要留意的地方：容易吃亏的模式；身体方面只谈作息和生活习惯层面，不谈病名。\n'
    + '三、给建议：2 到 3 条具体、能落地的，结合这个盘的特点说。\n'
    + '四、' + ASK_RULE + '\n'
    + '最后一句提醒即可：以上是传统文化角度的解读，仅供参考。',
  ziwei: '\n\n请按这个顺序讲：\n'
    + '一、先说结论：用 3 到 5 句白话把这张命盘最要紧的特点说清——命宫主星的气质、身宫落点的人生重心、整体格局的高低走向。\n'
    + '二、分项展开（每一项先给一句结论，再讲依据）：\n'
    + '1. 命格总评：命宫主星组合与三方四正（对宫、财帛、官禄）的呼应，这个人是什么气质、底子如何。\n'
    + '2. 事业：官禄宫的路子，适合什么性质的工作、怎么发展更顺。\n'
    + '3. 财运：财帛宫的进财方式与守财能力，田宅宫一句带过即可。\n'
    + '4. 感情婚姻：夫妻宫看待感情的方式和容易别扭的地方。\n'
    + '5. 出外与人际：迁移宫、交友宫，一句到两句带过即可。\n'
    + '6. 当前大限与流年：现在走的大限落在哪一宫、这十年的主题是什么；今年流年命宫落点和流年四化，提示今年的重点与要留意的方面。\n'
    + '三、给建议：2 到 3 条具体、能落地的，结合命盘特点说。\n'
    + '四、' + ASK_RULE + '\n'
    + '最后一句提醒即可：以上是传统文化角度的解读，仅供参考。'
};
var head = heads[type] || heads.liuyao;
var tail = tails[type] || tails.liuyao;
return head + RULES + '【排盘数据】\n' + chartText + tail + QUESTION;
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
// 网页版（iOS）：复制后在新标签页打开 DeepSeek 网页版（2026-10-10）
copyText(prompt);
try { window.open('https://chat.deepseek.com/', '_blank'); opened = true; } catch (e) {}
}
} catch (e) { copyText(prompt);}
if (opened) {
toast(window.WuBridge ? '已复制并打开' + AI_NAME + '，请粘贴发送' : '排盘已复制，正在打开 DeepSeek 网页版，请粘贴分析');
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
/* 按钮正下方说明（2026-10-22）：不少用户以为点了按钮还要自己手动输入，
 * 在此明说自动复制＋粘贴发送。运行时注入，不动 index.html 标记；
 * 显隐与按钮本体同步（八字按钮按页签 hidden 切换，MutationObserver 镜像）。 */
var AI_HINT_TEXT = '点按此按钮，盘面信息会自动复制；跳转到 DeepSeek 后，直接粘贴发送即可，无需手动输入。';
function addAiHint(btn) {
if (!btn || btn.getAttribute('data-ai-hint')) return;
btn.setAttribute('data-ai-hint', '1');
var row = btn.closest ? (btn.closest('.btn-row') || btn.parentNode) : btn.parentNode;
if (!row || !row.parentNode) return;
var hint = document.createElement('p');
hint.className = 'hint small';
hint.textContent = AI_HINT_TEXT;
hint.style.marginTop = '6px';
try {
var rs = window.getComputedStyle(row);
hint.style.marginLeft = rs.marginLeft;
hint.style.marginRight = rs.marginRight;
} catch (e) {}
row.parentNode.insertBefore(hint, row.nextSibling);
var sync = function () {
var hide = btn.hidden;
if (!hide) { try { hide = window.getComputedStyle(btn).display === 'none'; } catch (e) {} }
hint.hidden = !!hide;
};
sync();
try {
new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
} catch (e) {}
}
function addAiHints() {
['ly-ai-btn', 'zw-ai-btn', 'bz-ai-btn'].forEach(function (id) { addAiHint(document.getElementById(id)); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addAiHints);
else addAiHints();
})();

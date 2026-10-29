/* 戊日不上香 · 阅读器「长按查字」辞书接口模块 (dict v1)
*
* 数据（远程 feed，随 content 一同分发，不进安装包）：
* content/dict/index.json 版本、分片表、条目数、来源与许可
* content/dict/chars-*.json 单字分片（按 Unicode 码点区间分片，懒加载）
* content/dict/words.json 自编经文词表
* content/dict/big/b*.json 大词库分片（index.json v2 起，bigShards 表，按首字码点懒加载；
*   查词三级：自编词表→大词库→未收返回 null 由调用方逐字拆；大词库不可用时静默落回不报错）
* content/dict/shuowen.json 《说文解字》公版原文摘录（亦并入 chars 分片 sw 字段）
*
* 单字条目内部紧凑格式：[py, def, radical, strokes, sw?]
* py 拼音（Unihan kMandarin；精选经文审读拼音优先校正）
* def 英文简释（Unihan kDefinition）——v1 骨架层，无中文今义时以此为准
* radical 康熙部首字，strokes 总笔画（Unihan kTotalStrokes）
* sw 《说文》原文摘录（有则附）
* 词条内部紧凑格式：[py, def, jingDef]（自编今义简释＋经文语境义）
*
* 来源与许可见 content/dict/index.json 与 ~/workspace/wuri-app/dict-build/README.md：
* Unihan © Unicode, Inc.（免费使用、保留声明）；《说文》为东汉许慎原书公版原文，
* 本项目据维基文库公版转录自录自校；词表为本项目自编。
*
* 用法：
* await __wuriDict.ready();
* await __wuriDict.lookupChar('道'); // {ch,py,def,sw,radical,strokes} | null
* await __wuriDict.lookupWord('无量寿'); // {w,py,def,jingDef} | null
* __wuriDict.expandWord(text, start, end); // {text,start,end} | null（同步；
* 词表已加载时优先扩到词表命中词，否则扩到最近标点/空白边界）
*/
(function (root) {
'use strict';

// 数据基址：以本脚本位置推导（www/js/dict.js -> www/content/dict/），推导失败回落相对路径
var BASE = 'content/dict/';
try {
var cur = (typeof document!== 'undefined' && document.currentScript && document.currentScript.src) || '';
if (cur) BASE = cur.replace(/js\/dict\.js(?:\?.*)?$/, 'content/dict/');
} catch (e) { /* keep fallback */}

var indexPromise = null;
var indexData = null;
var shardCache = Object.create(null); // file -> Promise<obj>
var wordsPromise = null;
var wordsData = null;
var bigShardCache = Object.create(null); // file -> Promise<obj>

function fetchJson(url) {
return fetch(url, { credentials: 'same-origin'}).then(function (r) {
if (!r.ok) throw new Error('dict fetch ' + r.status + ' ' + url);
return r.json();
});
}

function ready() {
if (!indexPromise) {
indexPromise = fetchJson(BASE + 'index.json').then(function (idx) {
indexData = idx;
return {
version: idx.version,
charCount: idx.charCount,
wordCount: idx.wordCount,
bigWordCount: idx.bigWordCount || 0,
shuowenCount: idx.shuowenCount
};
});
}
return indexPromise;
}

function shardFileFor(ch) {
if (!indexData ||!indexData.charShards) return null;
var cp = ch.codePointAt(0);
for (var i = 0; i < indexData.charShards.length; i++) {
var s = indexData.charShards[i];
if (cp >= s.from && cp <= s.to) return s.file;
}
return null;
}

function loadShard(file) {
if (!shardCache[file]) {
shardCache[file] = fetchJson(BASE + file).catch(function (err) {
delete shardCache[file];
throw err;
});
}
return shardCache[file];
}

function lookupChar(ch) {
if (!ch || typeof ch!== 'string') return Promise.resolve(null);
ch = String.fromCodePoint(ch.codePointAt(0));
return ready().then(function () {
var file = shardFileFor(ch);
if (!file) return null;
return loadShard(file).then(function (shard) {
var e = shard[ch];
if (!e) return null;
return {
ch: ch,
py: e[0] || '',
def: e[1] || '',
radical: e[2] || '',
strokes: (typeof e[3] === 'number'? e[3]: null),
sw: e[4] || null
};
});
}).catch(function () { return null;});
}

function loadWords() {
if (!wordsPromise) {
wordsPromise = fetchJson(BASE + 'words.json').then(function (w) {
wordsData = w;
return w;
}).catch(function (err) {
wordsPromise = null;
throw err;
});
}
return wordsPromise;
}

/* 大词库查词辅助：底本异体归一（Kanripo 用字→标准繁体，与建库口径一致） */
var VAR2STD = {'无': '無', '寳': '寶', '衆': '眾', '乗': '乘', '廻': '迴', '爲': '為', '眞': '真', '鍊': '煉'};
function normalizeWord(w) {
var out = '';
for (var i = 0; i < w.length; i++) out += VAR2STD[w[i]] || w[i];
return out;
}
var _s2t = null; // 简->繁候选表（由 t2s.js 的 T2S_MAP 反转，懒构建；无 t2s 时为空表）
function s2tMap() {
if (_s2t) return _s2t;
_s2t = Object.create(null);
try {
var m = (typeof T2S_MAP!== 'undefined')? T2S_MAP: null;
if (m) for (var t in m) { var s = m[t]; if (s && s.length === 1) { (_s2t[s] = _s2t[s] || []).push(t);} }
} catch (e) { /* 无 t2s 表时只查原形与归一形 */ }
return _s2t;
}
function wordCandidates(w) {
// 候选顺序：原形 > 异体归一形 > 简转繁枚举（束宽 24，避免组合爆炸）
var list = [], seen = Object.create(null);
function push(x) { if (x &&!seen[x]) { seen[x] = 1; list.push(x);} }
push(w);
var nw = normalizeWord(w);
push(nw);
var s2t = s2tMap();
var beams = [nw];
for (var i = 0; i < nw.length; i++) {
var opts = s2t[nw[i]];
if (!opts ||!opts.length) continue;
var next = [];
for (var b = 0; b < beams.length; b++) {
next.push(beams[b]);
for (var o = 0; o < opts.length && next.length < 24; o++) {
if (opts[o]!== nw[i]) next.push(beams[b].slice(0, i) + opts[o] + beams[b].slice(i + 1));
}
}
beams = next;
}
for (var k = 0; k < beams.length; k++) push(normalizeWord(beams[k]));
return list;
}

function bigShardFileFor(ch) {
if (!indexData ||!indexData.bigShards) return null;
var cp = ch.codePointAt(0);
for (var i = 0; i < indexData.bigShards.length; i++) {
var s = indexData.bigShards[i];
if (cp >= s.from && cp <= s.to) return s.file;
}
return null;
}

function loadBigShard(file) {
if (!bigShardCache[file]) {
bigShardCache[file] = fetchJson(BASE + file).catch(function (err) {
delete bigShardCache[file];
throw err;
});
}
return bigShardCache[file];
}

function lookupBig(w) {
return ready().then(function () {
if (!indexData ||!indexData.bigShards) return null;
var cands = wordCandidates(w);
var files = [], fseen = Object.create(null);
for (var i = 0; i < cands.length; i++) {
var f = bigShardFileFor(cands[i].charAt(0));
if (f &&!fseen[f]) { fseen[f] = 1; files.push(f); }
}
if (!files.length) return null;
return Promise.all(files.map(function (f) { return loadBigShard(f); })).then(function (shards) {
var byFile = {};
for (var j = 0; j < files.length; j++) byFile[files[j]] = shards[j];
for (var k = 0; k < cands.length; k++) {
var sh = byFile[bigShardFileFor(cands[k].charAt(0))];
if (sh && sh[cands[k]]) { var e = sh[cands[k]]; return { w: cands[k], py: e[0] || '', def: e[1] || '', jingDef: '' }; }
}
return null;
});
}).catch(function () { return null; });
}

function lookupWord(w) {
if (!w || typeof w!== 'string') return Promise.resolve(null);
return loadWords().then(function (words) {
var e = words[w];
if (e) return { w: w, py: e[0] || '', def: e[1] || '', jingDef: e[2] || '' };
var nw = normalizeWord(w);
if (nw!== w) { var e2 = words[nw]; if (e2) return { w: nw, py: e2[0] || '', def: e2[1] || '', jingDef: e2[2] || '' }; }
return lookupBig(w);
}, function () { return lookupBig(w); });
}

var PUNCT = '，。；：、！？·…—「」『』（）《》〈〉“”‘’,.;:!?()[]{}<>\t\n\r　';
function isBoundary(c) { return c === undefined || PUNCT.indexOf(c) >= 0;}

function expandWord(text, start, end) {
if (typeof text!== 'string' ||!text) return null;
if (typeof start!== 'number' || typeof end!== 'number') return null;
start = Math.max(0, Math.min(start, text.length));
end = Math.max(0, Math.min(end, text.length));
if (start > end) { var t = start; start = end; end = t;}
if (start === end) { // 零宽选区按单字处理
if (start >= text.length) start = text.length - 1;
end = start + 1;
}
// 1) 词表命中：找包含（或紧覆）选区的最长词条
if (wordsData) {
var best = null;
for (var len = 4; len >= 2; len--) {
for (var s = Math.max(0, end - len); s <= start; s++) {
if (s + len < end) continue;
var cand = text.substr(s, len);
if (wordsData[cand]) {
if (!best || len > best.len) best = { start: s, end: s + len, len: len};
}
}
if (best) break;
}
if (best) return { text: text.slice(best.start, best.end), start: best.start, end: best.end};
} else {
loadWords().catch(function () { /* 本次调用走标点边界，下次生效 */});
}
// 2) 标点边界扩展（单侧最多扩 16 字，避免吞整段）
var ns = start, ne = end, guard = 0;
while (ns > 0 &&!isBoundary(text[ns - 1]) && (start - ns) < 16) { ns--; if (++guard > 64) break;}
guard = 0;
while (ne < text.length &&!isBoundary(text[ne]) && (ne - end) < 16) { ne++; if (++guard > 64) break;}
if (ns === ne) return null;
return { text: text.slice(ns, ne), start: ns, end: ne};
}

root.__wuriDict = {
ready: ready,
lookupChar: lookupChar,
lookupWord: lookupWord,
expandWord: expandWord,
_base: BASE
};
})(typeof window!== 'undefined'? window: (typeof globalThis!== 'undefined'? globalThis: this));

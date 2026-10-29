/* 轻量自测：存量激活→账户绑定前端（2026-10-28 定版）
 * 跑法：node test-bind-account.cjs   （只读源码＋桩 localStorage/DOM，不联网）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
}
function section(t) { console.log('\n== ' + t); }

const proSrc = read('www/js/pro.js');
const acctSrc = read('www/js/account.js');
const idxSrc = read('www/index.html');
const i18nSrc = read('www/js/i18n.js');
const redeemSrc = read('www/redeem.html');

/* ---------- 桩 localStorage / DOM（给 pro.js 用） ---------- */
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}
function fakeEl(id) {
  return {
    id, hidden: false, value: '', textContent: '', className: '', style: {},
    _handlers: {},
    addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
    focus() {}, scrollIntoView() {},
    click() { (this._handlers.click || []).forEach((f) => f({ preventDefault() {} })); },
  };
}
async function flush() { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); }

(async function main() {
  section('pro.js 桩测：赠送码兑换存码');
  const store1 = makeStorage();
  const els1 = {};
  const docStub1 = {
    addEventListener() {},
    getElementById: (id) => els1[id] || null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => fakeEl('dyn'),
    body: fakeEl('body'),
  };
  const sb1 = {
    console, setTimeout, clearTimeout, Date, JSON, Math,
    localStorage: store1, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120' },
    document: docStub1, fetch: () => Promise.reject(new Error('no net')),
  };
  sb1.window = sb1; sb1.window.t = (k) => k; sb1.window.WuriPro = undefined;
  vm.createContext(sb1);
  vm.runInContext(proSrc, sb1);
  const WP = sb1.window.WuriPro;
  ok(!!WP, 'WuriPro 已导出');
  ok(typeof WP.localProInfo === 'function' && typeof WP.hasLocalPro === 'function', 'localProInfo/hasLocalPro 已导出');
  // 找一枚合法 6 位赠送码：枚举后 2 位校验
  const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let gift = null;
  outer: for (const a of CH) for (const b of CH) {
    const cand = 'AB23' + a + b;
    if (WP.validateRedeem(cand)) { gift = cand; break outer; }
  }
  ok(!!gift, '找到合法赠送码样本 ' + gift);
  ok(WP.redeemPro(gift) === true, 'redeemPro(赠送码) 成功');
  ok(store1.getItem('wuri_pro_redeem') === '1', '赠送兑换置 wuri_pro_redeem=1');
  ok(store1.getItem('wuri_pro_code') === gift, '赠送兑换存规范化码 wuri_pro_code=' + gift);
  ok(!isNaN(Date.parse(store1.getItem('wuri_pro_redeemed_at_local') || '')), '赠送兑换存 ISO 时间 wuri_pro_redeemed_at_local');
  let info = WP.localProInfo();
  ok(info.codeKind === 'gift' && info.hasLocalPro && info.hasCode, 'localProInfo 区分赠送码来源');
  store1.removeItem('wuri_pro_code');
  info = WP.localProInfo();
  ok(info.redeemed && info.localOnlyNoCode && !info.hasCode, 'localProInfo 区分「有兑换标记但无码」');
  store1.setItem('wuri_pro_code', 'WURI-ABCD-1234-EFGH');
  info = WP.localProInfo();
  ok(info.codeKind === 'wuri', 'localProInfo 区分 WURI 码来源');
  ok(WP.normalizeWuriCode('wuriabcd1234efgh') === 'WURI-ABCD-1234-EFGH', 'normalizeWuriCode 规范化');

  section('pro.js 桩测：WURI 码兑换存码（bindRedeem + fetch 桩）');
  const store2 = makeStorage();
  const els2 = {};
  ['redeem-btn', 'redeem-box', 'redeem-input', 'redeem-msg', 'redeem-cancel', 'redeem-confirm', 'redeem-email'].forEach((id) => { els2[id] = fakeEl(id); });
  els2['redeem-input'].value = 'wuriabcd1234efgh';
  els2['redeem-email'].value = '';
  const fetchCalls = [];
  const docStub2 = {
    addEventListener() {},
    getElementById: (id) => els2[id] || null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => fakeEl('dyn'),
    body: fakeEl('body'),
  };
  const sb2 = {
    console, setTimeout, clearTimeout, Date, JSON, Math,
    localStorage: store2, navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120' },
    document: docStub2,
    fetch: (url, opts) => { fetchCalls.push({ url, opts }); return Promise.resolve({ json: () => Promise.resolve({ success: true }) }); },
  };
  sb2.window = sb2; sb2.window.t = (k) => k;
  vm.createContext(sb2);
  vm.runInContext(proSrc, sb2);
  sb2.window.WuriPro.bindRedeem();
  els2['redeem-confirm'].click();
  await flush();
  ok(store2.getItem('wuri_pro_redeem') === '1', 'WURI 兑换置 wuri_pro_redeem=1');
  ok(store2.getItem('wuri_pro_code') === 'WURI-ABCD-1234-EFGH', 'WURI 兑换存规范化完整码，实存=' + store2.getItem('wuri_pro_code'));
  ok(!isNaN(Date.parse(store2.getItem('wuri_pro_redeemed_at_local') || '')), 'WURI 兑换存 ISO 时间');
  ok(fetchCalls.length === 1 && JSON.parse(fetchCalls[0].opts.body).code === 'WURI-ABCD-1234-EFGH', '兑换请求发的就是规范化码');

  section('redeem.html 存码（静态）');
  ok(/wuri_pro_code/.test(redeemSrc) && /wuri_pro_redeemed_at_local/.test(redeemSrc) && /verifiedCode/.test(redeemSrc),
    'redeem.html 成功分支存 wuri_pro_code + 时间');

  section('account.js：只增不减（提取 applyEntitlement 实测）');
  const mApply = acctSrc.match(/function applyEntitlement\(ent\) \{[\s\S]*?\n  \}/);
  ok(!!mApply, '找到 applyEntitlement');
  const rec2 = []; const st2 = { sources: [] };
  const Kstub = { pro: 'wuri_acct_pro_v1', sources: 'wuri_acct_sources_v1' };
  const apply2 = new Function('lsSet', 'lsSetJSON', 'state', 'window', 'K', mApply[0] + '\nreturn applyEntitlement;')(
    (k, v) => rec2.push([k, v]), (k, v) => rec2.push([k, JSON.stringify(v)]), st2, {}, Kstub);
  apply2(null);
  apply2({ pro: false });
  apply2({});
  ok(!rec2.some(([k, v]) => k === 'wuri_acct_pro_v1' && v == null), 'pro=false/缺字段/失败一律不清 K.pro');
  apply2({ pro: true, sources: [{ source: 'code', ref: 'WURI-ABCD-1234-EFGH' }] });
  ok(rec2.some(([k, v]) => k === 'wuri_acct_pro_v1' && v === '1'), 'pro=true 才置 K.pro=1');
  ok(Array.isArray(st2.sources) && st2.sources.length === 1, 'sources 存入 state');
  ok(!/lsSet\(K\.pro, ent\.pro \?/.test(acctSrc), '旧的 pro?1:null 写法已消除');
  ok(/prevOwner && prevOwner !== ident/.test(acctSrc) && /lsSet\(K\.pro, null\)/.test(acctSrc),
    'afterLogin owner 变更先清旧账号 K.pro');
  const clearSeg = acctSrc.slice(acctSrc.indexOf('function clearSession'), acctSrc.indexOf('function on401'));
  ok(/lsSet\(K\.pro, null\)/.test(clearSeg) && !/wuri_pro_redeem|wuri_pro_code/.test(clearSeg.replace(/绝不碰[\s\S]*?事实/, '').replace(/wuri_pro_redeem \/ wuri_pro_code/, '')),
    'clearSession 清 K.pro（注释外不碰本机码键）');

  section('account.js：device 不进同步清单');
  const lsSeg = acctSrc.slice(acctSrc.indexOf('var LS_KEYS'), acctSrc.indexOf('var LS_PREFIXES'));
  ok(!/wuri_acct_device_v1/.test(lsSeg), 'LS_KEYS 不含 wuri_acct_device_v1');
  ok(!/wuri_pro_code/.test(lsSeg) && !/wuri_pro_redeem/.test(lsSeg), 'LS_KEYS 不含 wuri_pro_code / wuri_pro_redeem');
  ok(/device: 'wuri_acct_device_v1'/.test(acctSrc) && /bindSnooze: 'wuri_acct_bind_snooze'/.test(acctSrc), 'K.device / K.bindSnooze 已定义');
  ok(/x-wuri-device-id/.test(acctSrc) && /h\['x-wuri-device-id'\] = getDeviceId\(\)/.test(acctSrc), 'api() 所有请求带 x-wuri-device-id 头');
  ok(/deviceFields\(\{ email: email, code: code/.test(acctSrc) && /deviceFields\(\{ username: username, password: pw1/.test(acctSrc),
    'verify / register 请求带 deviceId+deviceLabel');
  // deviceLabel 不得是原始 UA：deviceFields 用 deviceLabel()，且其实现只拼系统·浏览器族
  const lblSeg = acctSrc.slice(acctSrc.indexOf('function deviceLabel'), acctSrc.indexOf('function rawDeviceHint'));
  ok(!/navigator\.userAgent[^\n]*return/.test(lblSeg) && /parts\.join/.test(lblSeg), 'deviceLabel 为粗粒度派生值、非原始 UA');
  ok(/device_hint = rawDeviceHint\(\)/.test(acctSrc) && /\(navigator\.userAgent \|\| ''\)\.slice\(0, 120\)/.test(acctSrc),
    'bind-code 的 device_hint 仍发 UA 前 120（B 级证据）');

  section('account.js：三入口 + deviceCode 二段 + evicted');
  ok(acctSrc.includes("'/api/account/bind-code'"), '入口① bind-code');
  ok(acctSrc.includes("'/api/account/gift-bind-request'"), '入口② gift-bind-request');
  ok(acctSrc.includes("'/api/account/legacy-migration/issue'") && acctSrc.includes("'/api/account/legacy-migration/confirm'"), '入口③ legacy-migration issue/confirm');
  ok(acctSrc.includes("body: { localUnlocked: true, deviceId: getDeviceId() }"), 'issue 带 localUnlocked+deviceId');
  ok(acctSrc.includes("error === 'device_verification_required'"), '新设备闸分支 device_verification_required');
  ok(acctSrc.includes("error === 'device_manual_required'"), '无已验证邮箱分支 device_manual_required（终版码）');
  ok(/loginBody\.deviceCode/.test(acctSrc) && /devRow\.hidden = false/.test(acctSrc), '二次提交带 deviceCode 且首段显示验证码区');
  ok(/devEl\.value = ''/.test(acctSrc), '登录成功清 deviceCode');
  ok(acctSrc.includes("e === 'session_evicted'") && acctSrc.includes('acct_session_evicted'), 'on401 区分 session_evicted');
  ok(/on401\(r\.body && r\.body\.error\)/.test(acctSrc) && /on401\(r && r\.body && r\.body\.error\)/.test(acctSrc),
    'refreshEntitlement 等 401 把 body.error 传给 on401');
  ok(i18nSrc.includes('你的账号已在另一台设备登录，此设备已下线。请重新登录。'), 'evicted 定稿文案（简体）逐字一致');
  ok(/wuri_acct_bind_snooze/.test(acctSrc) && /7 \* 24 \* 3600 \* 1000/.test(acctSrc), '暂不 → snooze 7 天');
  ok(acctSrc.includes('acct-bind-prompt') && /sourcesHasCode/.test(acctSrc), '登录后绑码体检（sources 未含该码才提示）');

  section('index.html 与 account.js 绑定 id 对齐');
  const newIds = ['acct-bind-status-row', 'acct-bind-status', 'acct-bind-prompt', 'acct-bind-prompt-text', 'acct-bind-prompt-msg',
    'acct-bind-prompt-btn', 'acct-bind-prompt-later', 'acct-bind-code', 'acct-bind-email', 'acct-bind-btn', 'acct-bind-msg',
    'acct-gift-code', 'acct-gift-name', 'acct-gift-note', 'acct-gift-btn', 'acct-gift-msg',
    'acct-mig-issue-btn', 'acct-mig-issued', 'acct-mig-code', 'acct-mig-confirm-btn', 'acct-mig-msg',
    'acct-devcode-row', 'acct-devcode'];
  newIds.forEach((id) => {
    ok(idxSrc.includes('id="' + id + '"'), 'index.html 有 id=' + id);
    ok(acctSrc.includes("'" + id + "'") || acctSrc.includes('$(' + "'" + id), 'account.js 引用 id=' + id);
  });
  // account.js 所有 $('acct-…') 引用都应在 index.html 找得到（防接线断裂）
  const refs = new Set();
  for (const mm of acctSrc.matchAll(/\$\('([a-z0-9-]+)'\)/g)) refs.add(mm[1]);
  const missing = [...refs].filter((id) => !idxSrc.includes('id="' + id + '"'));
  ok(missing.length === 0, 'account.js 全部 $() id 在 index.html 存在' + (missing.length ? '（缺：' + missing.join(',') + '）' : ''));

  section('i18n 简繁键一致（新增 acct_ 绑定键）');
  const keysOf = (re) => { const out = new Set(); for (const mm of i18nSrc.matchAll(re)) out.add(mm[1]); return out; };
  void keysOf;
  const bindKeys = ['acct_bind_title', 'acct_bind_prompt', 'acct_bind_prompt_do', 'acct_bind_prompt_later', 'acct_bind_ok',
    'acct_bind_status_code', 'acct_bind_err_bound_other', 'acct_bind_err_proof', 'acct_gift_title', 'acct_gift_hint',
    'acct_gift_ok', 'acct_mig_title', 'acct_mig_issued', 'acct_mig_ok', 'acct_devcode_hint', 'acct_devcode_ph',
    'acct_device_manual', 'acct_session_evicted'];
  bindKeys.forEach((k) => {
    const n = (i18nSrc.match(new RegExp(k + ':', 'g')) || []).length;
    ok(n >= 2, 'i18n 键 ' + k + ' 简繁各一份（出现 ' + n + ' 次）');
    ok(idxSrc.includes('data-i18n="' + k + '"') || idxSrc.includes('data-i18n-ph="' + k + '"') || acctSrc.includes("'" + k + "'"),
      '键 ' + k + ' 被 index/account 引用');
  });

  console.log('\n==== ' + pass + ' PASS / ' + fail + ' FAIL ====');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

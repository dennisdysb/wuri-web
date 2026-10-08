/* 戊日不上香 · Pro 模块（高级版解锁与付费墙）
 * Android 原生壳：经 window.WuBridgeBilling 调 Play Billing（一次性买断 wuri_pro）。
 * iOS / 纯网页：无内购桥，Pro 功能保持锁定（iOS 版 Pro 待定）。
 * 测试包（TEST-ONLY 未剔除）：window.__wuriTestBuild=true，可用测试按钮本地解锁，
 *   正式包剔除后该路径不存在，只能走真实购买。
 */
var WuriPro = (function () {
  'use strict';
  var TEST_KEY = 'wuri_pro_test';
  var PRICE_FALLBACK = 'US$4.99';

  function billing() { return window.WuBridgeBilling || null; }
  function isTestBuild() { return !!window.__wuriTestBuild; }

  function status() {
    var b = billing();
    if (!b) return { pro: false, connected: false, price: null };
    try {
      var s = JSON.parse(b.billingStatus());
      return { pro: !!s.pro, connected: !!s.connected, price: s.price || null };
    } catch (e) { return { pro: false, connected: false, price: null }; }
  }

  function isPro() {
    if (window.IS_FREE_BUILD) return false;
    /*DEMO-ONLY*/ if (window.__wuriProDemo) return true; /*/DEMO-ONLY*/
    try { if (localStorage.getItem('wuri_pro_redeem') === '1') return true; } catch (e) {}
    if (isTestBuild()) {
      try { if (localStorage.getItem(TEST_KEY) === '1') return true; } catch (e) {}
    }
    return status().pro;
  }

  /* 兑换码校验：6位，前4随机+后2校验 */
  var REDEEM_SALT = 'wuri2026';
  var REDEEM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function redeemChecksum(s4) {
    var h = 0;
    var s = s4 + REDEEM_SALT;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    h = Math.abs(h);
    var out = '';
    for (var j = 0; j < 2; j++) {
      out += REDEEM_CHARS[h % REDEEM_CHARS.length];
      h = Math.floor(h / REDEEM_CHARS.length);
    }
    return out;
  }
  function validateRedeem(code) {
    if (!code) return false;
    var c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 6) return false;
    for (var i = 0; i < c.length; i++) {
      if (REDEEM_CHARS.indexOf(c[i]) < 0) return false;
    }
    var s4 = c.substring(0, 4);
    var chk = c.substring(4, 6);
    return redeemChecksum(s4) === chk;
  }
  function redeemPro(code) {
    if (validateRedeem(code)) {
      try { localStorage.setItem('wuri_pro_redeem', '1'); } catch (e) {}
      refreshProUI();
      return true;
    }
    return false;
  }

  /* 事件：原生侧购买/恢复/价格回调 */
  window.__wuriBillingEvent = function (ev) {
    try {
      if (typeof ev === 'string') ev = JSON.parse(ev);
      if (ev.event === 'purchased' || ev.event === 'restored') {
        refreshProUI();
        if (ev.event === 'purchased') hidePaywall();
      } else if (ev.event === 'price') {
        refreshProUI();
      } else if (ev.event === 'cancelled') {
        toast(t('pro_buy_cancelled'));
      } else if (ev.event === 'error') {
        toast(t('pro_buy_error') + (ev.message ? ': ' + ev.message : ''));
      }
    } catch (e) {}
  };

  /* i18n 的全局 t()（i18n.js 暴露的 window.t），这里直接用，不自建 */
  function toast(msg) {
    try {
      var el = document.getElementById('toast');
      if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
      el.textContent = msg; el.classList.add('show');
      clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
    } catch (e) {}
  }

  /* ---------- 付费墙 ---------- */
  function showPaywall(from) {
    var m = document.getElementById('paywall');
    if (!m) return;
    m.classList.add('show');
    refreshProUI();
    try { connect(); } catch (e) {}
  }
  function hidePaywall() {
    var m = document.getElementById('paywall');
    if (m) m.classList.remove('show');
  }

  function connect() { var b = billing(); if (b) { try { b.billingConnect(); } catch (e) {} } }
  function buy() {
    var b = billing();
    if (!b) { toast(t('pro_no_billing')); return; }
    try { b.billingBuy(); } catch (e) { toast(t('pro_buy_error')); }
  }
  function restore() {
    var b = billing();
    if (!b) { toast(t('pro_no_billing')); return; }
    try { b.billingRestore(); toast(t('pro_restoring')); } catch (e) {}
  }

  /* ---------- Pro 卡片 / 付费墙 UI 刷新 ---------- */
  /* 兑换码UI绑定 */
  function bindRedeem() {
    var btn = document.getElementById('redeem-btn');
    var box = document.getElementById('redeem-box');
    var input = document.getElementById('redeem-input');
    var msg = document.getElementById('redeem-msg');
    if (!btn || !box) return;
    btn.addEventListener('click', function () {
      box.hidden = !box.hidden;
      if (!box.hidden && input) input.focus();
    });
    var cancel = document.getElementById('redeem-cancel');
    if (cancel) cancel.addEventListener('click', function () { box.hidden = true; });
    var confirm = document.getElementById('redeem-confirm');
    if (confirm) confirm.addEventListener('click', function () {
      var code = input ? input.value.trim() : '';
      if (!code) {
        if (msg) { msg.textContent = '请输入兑换码'; msg.className = 'err'; }
        return;
      }
      if (redeemPro(code)) {
        if (msg) { msg.textContent = '兑换成功！高级版已解锁'; msg.className = 'ok'; }
        if (input) input.value = '';
        setTimeout(function () { box.hidden = true; }, 1500);
      } else {
        if (msg) { msg.textContent = '兑换码无效，请检查后重试'; msg.className = 'err'; }
      }
    });
    /* 输入时自动大写 */
    if (input) input.addEventListener('input', function () {
      var v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
      if (input.value !== v) input.value = v;
    });
  }

  function refreshProUI() {
    var pro = isPro(), st = status();
    var price = st.price || PRICE_FALLBACK;
    document.querySelectorAll('[data-pro-price]').forEach(function (el) { el.textContent = price; });
    document.querySelectorAll('[data-pro-state]').forEach(function (el) {
      el.textContent = pro ? t('pro_active') : t('pro_locked');
      el.classList.toggle('on', pro);
    });
    document.querySelectorAll('[data-pro-buybtn]').forEach(function (el) {
      el.style.display = pro ? 'none' : '';
    });
    // Pro 已激活：隐藏兑换码按钮，显示祝贺语
    var redeemBtn = document.getElementById('redeem-btn');
    if (redeemBtn) redeemBtn.style.display = pro ? 'none' : '';
    var redeemBox = document.getElementById('redeem-box');
    if (redeemBox && pro) redeemBox.hidden = true;
    var proCongrats = document.getElementById('pro-congrats');
    if (!proCongrats) {
      proCongrats = document.createElement('p');
      proCongrats.id = 'pro-congrats';
      proCongrats.style.cssText = 'text-align:center;color:#2d6a4f;font-weight:bold;margin:8px 0;';
      proCongrats.textContent = '🎉 恭喜，你已是高级版用户';
      var sec = document.querySelector('#view-me .pro-section');
      if (sec) sec.insertBefore(proCongrats, sec.firstChild);
    }
    if (proCongrats) proCongrats.style.display = pro ? '' : 'none';
    document.querySelectorAll('[data-pro-testbtn]').forEach(function (el) {
      el.style.display = (!pro && isTestBuild() && !window.IS_FREE_BUILD) ? '' : 'none';
    });
    var lock = document.getElementById('jing-lock');
    if (lock) lock.style.display = pro ? 'none' : '';
    var body = document.getElementById('jing-body');
    if (body) body.style.display = pro ? '' : 'none';
  }

  function testUnlock() {
    try { localStorage.setItem(TEST_KEY, '1'); } catch (e) {}
    refreshProUI();
    toast(t('pro_test_unlocked'));
  }

  /* 点击委托：data-pro-act=buy|restore|close|testunlock|paywall */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-pro-act]');
    if (!el) return;
    var act = el.getAttribute('data-pro-act');
    if (act === 'buy') buy();
    else if (act === 'restore') restore();
    else if (act === 'close') hidePaywall();
    else if (act === 'testunlock') testUnlock();
    else if (act === 'paywall') showPaywall(el.getAttribute('data-pro-from') || '');
  });

  return {
    isPro: isPro,
    redeemPro: redeemPro,
    validateRedeem: validateRedeem,
    status: status,
    showPaywall: showPaywall,
    hidePaywall: hidePaywall,
    buy: buy,
    restore: restore,
    connect: connect,
    refreshProUI: refreshProUI,
    requirePro: function (from) { if (isPro()) return true; showPaywall(from); return false; },
    bindRedeem: bindRedeem
  };
})();

/* 页面就绪后连一次 Billing（取价格、静默恢复） */
document.addEventListener('DOMContentLoaded', function () {
  try {
    WuriPro.bindRedeem();
    WuriPro.refreshProUI();
    if (window.WuBridgeBilling) WuriPro.connect();
  } catch (e) {}
});

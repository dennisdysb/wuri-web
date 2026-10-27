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
  /* i18n 翻译函数：i18n.js 先于本文件加载并暴露 window.t，模块初始化时即绑定为私有引用 T。
   * t() 每次调用都按当前语言实时取值，绑定函数对象本身不影响语言切换；
   * 不直用裸全局 t——window.t 可被任意全局同名赋值覆盖，覆盖后 refreshProUI 调用即抛
   * TypeError: t is not a function（2026-10-26 冒烟实测根因），私有绑定后与覆盖绝缘。 */
  var T = window.t;

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
    try { if (localStorage.getItem('wuri_pro_redeem') === '1') return true; } catch (e) {}
    /* 账号权益（js/account.js 登录后按服务端权益回写；与本机兑换态取并集，互不冲掉） */
    try { if (localStorage.getItem('wuri_acct_pro_v1') === '1') return true; } catch (e) {}
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
        toast(T('pro_buy_cancelled'));
      } else if (ev.event === 'error') {
        toast(T('pro_buy_error') + (ev.message ? ': ' + ev.message : ''));
      }
    } catch (e) {}
  };

  /* toast 文案走 i18n：用文件头绑定的私有引用 T（即 window.t 的函数对象），不自建词条 */
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
    /* 网页版：支付说明换成 Stripe（2026-10-11） */
    if (!billing()) {
      var note = m.querySelector('[data-pro-paynote]');
      if (note) note.textContent = '通过 Stripe 安全支付（支持银行卡 / Apple Pay）。付款后自动获得激活码，在「我的」页兑换即可。';
    }
    try { connect(); } catch (e) {}
  }
  function hidePaywall() {
    var m = document.getElementById('paywall');
    if (m) m.classList.remove('show');
  }

  function connect() { var b = billing(); if (b) { try { b.billingConnect(); } catch (e) {} } }
  function buy() {
    var b = billing();
    if (!b) {
      /* 网页版：跳到 Stripe 购买页（2026-10-11） */
      location.href = 'redeem.html';
      return;
    }
    try { b.billingBuy(); } catch (e) { toast(T('pro_buy_error')); }
  }
  function restore() {
    var b = billing();
    if (!b) {
      /* 网页版没有商店内购: 「恢复购买」改为「找回激活码」——凭购买邮箱补发新码 */
      hidePaywall();
      var meTab = document.querySelector('[data-tab="tab-me"]');
      if (meTab) meTab.click();
      var box = document.getElementById('recover-box');
      if (box) {
        box.hidden = false;
        var em = document.getElementById('recover-email');
        if (em) em.focus();
        try { box.scrollIntoView({ block: 'center' }); } catch (e) {}
      }
      return;
    }
    try { b.billingRestore(); toast(T('pro_restoring')); } catch (e) {}
  }

  /* 找回激活码面板绑定（网页版） */
  function bindRecover() {
    var box = document.getElementById('recover-box');
    if (!box) return;
    var email = document.getElementById('recover-email');
    var msg = document.getElementById('recover-msg');
    var cancel = document.getElementById('recover-cancel');
    if (cancel) cancel.addEventListener('click', function () { box.hidden = true; });
    var send = document.getElementById('recover-send');
    if (send) send.addEventListener('click', function () {
      var v = email ? email.value.trim() : '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
        if (msg) { msg.textContent = '请填写正确的邮箱'; msg.className = 'err'; }
        return;
      }
      if (msg) { msg.textContent = '提交中…'; msg.className = ''; }
      fetch('https://pay.shengboyu.ca/api/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: v })
      }).then(function (r) { return r.json(); }).then(function () {
        if (msg) { msg.textContent = '已提交：如果这个邮箱购买过，新的激活码马上发到该邮箱，请查收（含垃圾箱）。'; msg.className = 'ok'; }
      }).catch(function () {
        if (msg) { msg.textContent = '网络错误，请稍后重试'; msg.className = 'err'; }
      });
    });
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
      /* WURI 激活码 (后端发放): 规整后走服务器兑换; 横线/空格/小写都认 */
      var clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      var body = clean.indexOf('WURI') === 0 ? clean.slice(4) : clean;
      if (body.length === 12) {
        var wuri = 'WURI-' + body.slice(0, 4) + '-' + body.slice(4, 8) + '-' + body.slice(8, 12);
        if (msg) { msg.textContent = '验证中…'; msg.className = ''; }
        fetch('https://pay.shengboyu.ca/api/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: wuri, device: navigator.userAgent.slice(0, 120), email: (function () { var e = document.getElementById('redeem-email'); return e ? e.value.trim() : ''; })() })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.success) {
            try { localStorage.setItem('wuri_pro_redeem', '1'); } catch (e) {}
            refreshProUI();
            if (msg) { msg.textContent = '兑换成功！高级版已解锁'; msg.className = 'ok'; }
            if (input) input.value = '';
            setTimeout(function () { box.hidden = true; }, 1500);
          } else {
            if (msg) { msg.textContent = (d && d.reason) || '兑换码无效，请检查后重试'; msg.className = 'err'; }
          }
        }).catch(function () {
          if (msg) { msg.textContent = '网络错误，请稍后重试'; msg.className = 'err'; }
        });
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
    /* 输入规整: 大写, 只留字母数字与横线 (粘贴整串不截断) */
    if (input) input.addEventListener('input', function () {
      var v = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').substring(0, 24);
      if (input.value !== v) input.value = v;
    });
  }

  function refreshProUI() {
    var pro = isPro(), st = status();
    var price = st.price || PRICE_FALLBACK;
    document.querySelectorAll('[data-pro-price]').forEach(function (el) { el.textContent = price; });
    document.querySelectorAll('[data-pro-state]').forEach(function (el) {
      el.textContent = pro ? T('pro_active') : T('pro_locked');
      el.classList.toggle('on', pro);
    });
    document.querySelectorAll('[data-pro-buybtn]').forEach(function (el) {
      el.style.display = pro ? 'none' : '';
    });
    /* 网页版: 「恢复购买」实为找回激活码; 已解锁则隐藏 */
    if (!billing()) {
      document.querySelectorAll('[data-pro-act="restore"]').forEach(function (el) {
        el.textContent = '找回激活码';
        el.style.display = pro ? 'none' : '';
      });
      var rbox = document.getElementById('recover-box');
      if (rbox && pro) rbox.hidden = true;
    }
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
    /* 经文库免费开放（2026-10-14）：整页永不上锁，仅内丹书籍由 jingwen.js 在打开时验 Pro */
    var lock = document.getElementById('jing-lock');
    if (lock) lock.style.display = 'none';
    var body = document.getElementById('jing-body');
    if (body) body.style.display = '';
  }

  function testUnlock() {
    if (!isTestBuild()) return;
    try { localStorage.setItem(TEST_KEY, '1'); } catch (e) {}
    refreshProUI();
    toast(T('pro_test_unlocked'));
  }

  /* 点击委托：data-pro-act=buy|restore|close|testunlock|paywall */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-pro-act]');
    if (!el) return;
    var act = el.getAttribute('data-pro-act');
    if (act === 'buy') buy();
    else if (act === 'restore') restore();
    else if (act === 'close') hidePaywall();
    else if (act === 'testunlock') { if (isTestBuild()) testUnlock(); }
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
    bindRedeem: bindRedeem,
    bindRecover: bindRecover
  };
})();

/* 页面就绪后连一次 Billing（取价格、静默恢复） */
document.addEventListener('DOMContentLoaded', function () {
  try {
    WuriPro.bindRedeem();
    WuriPro.bindRecover();
    WuriPro.refreshProUI();
    if (window.WuBridgeBilling) WuriPro.connect();
  } catch (e) {}
});

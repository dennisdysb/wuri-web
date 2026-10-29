/* 全站自有弹窗 WuriDlg（2026-10-29）：取代原生 alert/confirm/prompt。
 * 原生弹窗带域名标题（「wuri.shengboyu.ca 显示」）、系统蓝字钮，与 App
 * 风格脱节（用户真机吐槽不专业）；家宅线 2026-10-26 已先行换自家底部层
 * （house.js hdDlg），本组件把同一视觉口径（.hd-pick-* 底部层体系、
 * 宣纸卡面 var(--card)、.btn 钮、删除类朱砂确认钮）提为全站共享件。
 * 语义与原生一一对应，均为 Promise 异步口径：
 *   WuriDlg.alert(msg)                    → Promise<void>（单「确定」钮）
 *   WuriDlg.confirm(text, okLabel, danger)→ Promise<boolean>（取消=false；
 *                                             danger 缺省 true：现行确认点
 *                                             均为删除/重置类破坏性操作）
 *   WuriDlg.prompt(title, defVal, okLabel)→ Promise<string|null>（取消=null，
 *                                             空串照原样返回，与原生一致）
 * 遮罩点按＝取消；Esc＝取消；prompt 回车＝确定。多个弹窗串行排队不叠层。 */
(function () {
  'use strict';
  if (window.WuriDlg) return;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var chain = Promise.resolve();
  function enqueue(job) {
    var p = chain.then(job, job);
    chain = p.then(function () {}, function () {});
    return p;
  }

  function openSheet(html) {
    var old = document.querySelector('.wdlg-mask');
    if (old) old.remove();
    var mask = document.createElement('div');
    mask.className = 'hd-pick-mask hd-dlg-mask wdlg-mask';
    mask.innerHTML = '<div class="hd-pick-sheet">' + html + '</div>';
    document.body.appendChild(mask);
    return mask;
  }

  function runConfirm(text, okLabel, danger) {
    return new Promise(function (resolve) {
      var mask = openSheet(
        '<div class="hd-pick-title hd-dlg-msg wdlg-msg">' + esc(text) + '</div>' +
        '<div class="hd-pick-foot">' +
        '<button class="btn" id="wdlg-cancel">取消</button>' +
        '<button class="btn ' + (danger ? 'hd-dlg-danger' : 'primary') + '" id="wdlg-ok">' +
        esc(okLabel || '确定') + '</button></div>');
      function done(v) {
        document.removeEventListener('keydown', onKey, true);
        mask.remove(); resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(false); } }
      document.addEventListener('keydown', onKey, true);
      mask.querySelector('#wdlg-ok').addEventListener('click', function () { done(true); });
      mask.querySelector('#wdlg-cancel').addEventListener('click', function () { done(false); });
      mask.addEventListener('click', function (e) { if (e.target === mask) done(false); });
    });
  }

  function runAlert(text) {
    return new Promise(function (resolve) {
      var mask = openSheet(
        '<div class="hd-pick-title hd-dlg-msg wdlg-msg">' + esc(text) + '</div>' +
        '<div class="hd-pick-foot">' +
        '<button class="btn primary" id="wdlg-ok">确定</button></div>');
      function done() {
        document.removeEventListener('keydown', onKey, true);
        mask.remove(); resolve();
      }
      function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); done(); } }
      document.addEventListener('keydown', onKey, true);
      mask.querySelector('#wdlg-ok').addEventListener('click', done);
      mask.addEventListener('click', function (e) { if (e.target === mask) done(); });
    });
  }

  function runPrompt(title, defVal, okLabel) {
    return new Promise(function (resolve) {
      var mask = openSheet(
        '<div class="hd-pick-title">' + esc(title) + '</div>' +
        '<input class="fs2-inp hd-dlg-inp" id="wdlg-inp" type="text" value="' + esc(defVal || '') + '">' +
        '<div class="hd-pick-foot">' +
        '<button class="btn" id="wdlg-cancel">取消</button>' +
        '<button class="btn primary" id="wdlg-ok">' + esc(okLabel || '确定') + '</button></div>');
      var inp = mask.querySelector('#wdlg-inp');
      function done(v) {
        document.removeEventListener('keydown', onKey, true);
        mask.remove(); resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Enter') { e.preventDefault(); done(inp.value); }
        else if (e.key === 'Escape') { e.preventDefault(); done(null); }
      }
      document.addEventListener('keydown', onKey, true);
      mask.querySelector('#wdlg-ok').addEventListener('click', function () { done(inp.value); });
      mask.querySelector('#wdlg-cancel').addEventListener('click', function () { done(null); });
      mask.addEventListener('click', function (e) { if (e.target === mask) done(null); });
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 60);
    });
  }

  window.WuriDlg = {
    alert: function (msg) { return enqueue(function () { return runAlert(msg); }); },
    confirm: function (text, okLabel, danger) {
      return enqueue(function () { return runConfirm(text, okLabel, danger !== false); });
    },
    prompt: function (title, defVal, okLabel) {
      return enqueue(function () { return runPrompt(title, defVal, okLabel); });
    }
  };
})();

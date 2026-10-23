/* 神祇图鉴（免费开放）：列表（分组）+ 详情（神诞/道场/职掌/生平·事迹/形象特征） */
/* 神图外置（v2.0.0 (2)）：全图 URL 统一解析。构建注入点 window.WURI_IMG_BASE——
 * 网页版不设（同源相对路径，行为与旧版一致）；原生包由 prepare_*_www.py 注入
 * CF 线绝对基址。原生壳内已下载到本机的素材（WuBridge 本地文件，文件名
 * deity_<图名>，与音频同目录）优先于远程。缩略图永远走包内相对路径。 */
window.WuriImg = window.WuriImg || (function () {
  function base() {
    return (typeof window.WURI_IMG_BASE === 'string' && window.WURI_IMG_BASE) ? window.WURI_IMG_BASE : '';
  }
  function localFile(name) {
    try {
      if (window.WuBridge && typeof WuBridge.getLocalAudioPath === 'function') {
        var p = WuBridge.getLocalAudioPath('deity_' + name);
        if (p) return 'file://' + p;
      }
    } catch (e) {}
    return '';
  }
  return {
    full: function (name) { return localFile(name) || (base() + 'img/deities/' + name); },
    remoteFull: function (name) { return base() + 'img/deities/' + name; },
    thumb: function (name) { return 'img/deities/thumbs/' + name; },
    isRemote: function (url) {
      return /^https?:\/\//.test(url) && url.indexOf(location.origin) !== 0;
    },
    /* <img> 全图加载失败时回落缩略图（只回落一次，绝不裂图） */
    fallback: function (img, name) {
      if (!img || img.getAttribute('data-wuri-fb')) return;
      img.setAttribute('data-wuri-fb', '1');
      img.src = 'img/deities/thumbs/' + name;
    }
  };
})();

(function () {
  var DATA = window.DEITIES_DATA;
  if (!DATA) return;
  var byId = {};
  var order = [];
  var total = 0;
  var curIdx = -1;

  var listView = document.getElementById('view-deities');
  var detailView = document.getElementById('view-deity-detail');
  var groupsEl = document.getElementById('deities-groups');
  if (!listView || !detailView || !groupsEl) return;

  /* 中文数字（首页卡片「X位道教尊神」的数量随图鉴数据动态更新） */
  function cnNum(n) {
    var D = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return D[n];
    if (n < 100) { var t = Math.floor(n / 10), o = n % 10; return (t === 1 ? '' : D[t]) + '十' + (o ? D[o] : ''); }
    if (n < 1000) { var h = Math.floor(n / 100), r = n % 100; return D[h] + '百' + (r ? (r < 10 ? '零' + D[r] : cnNum(r)) : ''); }
    return String(n);
  }

  /* ---------- 索引 + 列表渲染（远程数据源到达时可重跑） ---------- */
  function renderList() {
    byId = {};
    DATA.deities.forEach(function (d) { byId[d.id] = d; });
    /* 顺序（与列表渲染一致：按分组先后） */
    order = [];
    DATA.groups.forEach(function (g) {
      g.ids.forEach(function (id) { if (byId[id]) order.push(id); });
    });
    total = order.length;
    var dcEl = document.getElementById('deities-count-cn');
    if (dcEl) dcEl.textContent = cnNum(total);
    var html = '';
    DATA.groups.forEach(function (g) {
      html += '<h2 class="deity-group-title">' + g.name + '</h2><div class="deity-grid">';
      g.ids.forEach(function (id) {
        var d = byId[id];
        if (!d) return;
        html += '<button class="deity-card" data-deity="' + d.id + '">' +
          '<img loading="lazy" src="' + WuriImg.thumb(d.image) + '" alt="' + d.name + '">' +
          '<span class="deity-card-name">' + d.name + '</span>' +
          '<span class="deity-card-title">' + d.title + '</span>' +
          '</button>';
      });
      html += '</div>';
    });
    groupsEl.innerHTML = html;
  }
  renderList();

  /* 远程内容数据源入口（js/content-feed.js 调用）：换数据后重渲列表，
   * 详情正打开着则按当前位次刷新内容。数据不合规格时保持包内数据不动。 */
  window.__wuri_applyDeities = function (newData) {
    if (!newData || !Array.isArray(newData.groups) || !Array.isArray(newData.deities) || !newData.deities.length) return;
    var openId = (curIdx >= 0 && order[curIdx]) ? order[curIdx] : null;
    DATA = newData;
    window.DEITIES_DATA = newData;
    renderList();
    if (openId && byId[openId] && detailView && !detailView.hidden) openDetail(openId);
    else if (curIdx >= total) curIdx = total - 1;
  };

  /* ---------- 详情 ---------- */
  var F = {
    img: document.getElementById('deity-detail-img'),
    name: document.getElementById('deity-detail-name'),
    title: document.getElementById('deity-detail-title'),
    pos: document.getElementById('deity-detail-pos'),
    navPrev: document.getElementById('deity-nav-prev'),
    navNext: document.getElementById('deity-nav-next'),
    hint: document.getElementById('deity-swipe-hint'),
    birthday: document.getElementById('deity-f-birthday'),
    temple: document.getElementById('deity-f-temple'),
    domain: document.getElementById('deity-f-domain'),
    intro: document.getElementById('deity-f-intro'),
    appearance: document.getElementById('deity-f-appearance')
  };

  /* ---------- 滑动提示（滑过/点箭头后永久不再显示） ---------- */
  var HINT_KEY = 'wuri_deity_swipe_hint_seen';
  function hintSeen() {
    try { return !!localStorage.getItem(HINT_KEY); } catch (e) { return true; }
  }
  function markHintSeen() {
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) {}
    if (F.hint) F.hint.hidden = true;
  }

  /* ---------- 来源返回（v2.0.0 (2)）：进入详情时记来源视图栈与滚动位置，
   * 返回即回来源；无记录时只收详情（回退到其下层视图，与旧行为一致）。
   * 详情内左右切换不改来源。 ---------- */
  var navOrigin = null; /* {views:[viewId...], scroll:{viewId: top}} | null */
  var detailToken = 0;

  function loadDetailImage(d) {
    var my = ++detailToken;
    F.img.alt = d.name;
    var box = F.img.closest ? F.img.closest('.deity-img-box') : null;
    var phName = document.getElementById('deity-img-ph-name');
    if (phName) phName.textContent = d.name;
    if (box) box.classList.remove('ph-off');
    F.img.hidden = true;
    var tImg = new Image();
    tImg.onload = function () {
      if (my !== detailToken) return;
      F.img.src = WuriImg.thumb(d.image);
      F.img.hidden = false;
      if (box) box.classList.add('ph-off');
      var fImg = new Image();
      fImg.onload = function () { if (my === detailToken) F.img.src = WuriImg.full(d.image); };
      fImg.onerror = function () { /* 全图不到货：停在缩略图，不裂图 */ };
      fImg.src = WuriImg.full(d.image);
    };
    tImg.onerror = function () { /* 缩略图也失败：留宣纸底＋名号占位 */ };
    tImg.src = WuriImg.thumb(d.image);
  }

  function openDetail(id) {
    var d = byId[id];
    if (!d) return;
    loadDetailImage(d);
    F.name.textContent = d.name;
    F.title.textContent = d.title;
    F.birthday.textContent = d.birthday;
    F.temple.textContent = d.temple;
    F.domain.textContent = d.domain;
    F.intro.textContent = d.intro;
    F.appearance.textContent = d.appearance;
    /* 空字段隐藏整行（如二十八宿星君 birthday 为空）：仅空才隐，有值照旧 */
    [['birthday', d.birthday], ['temple', d.temple], ['domain', d.domain], ['intro', d.intro], ['appearance', d.appearance]].forEach(function (pair) {
      var sec = F[pair[0]] && F[pair[0]].closest ? F[pair[0]].closest('.deity-sec') : null;
      if (sec) sec.hidden = !(pair[1] && String(pair[1]).trim());
    });
    /* 星象互链：条目带 link_key（二十八宿星君）时追加「本宿星官 ›」签；
     * stars.js 未加载（无 __wuri_openStarRegion）时不出现 */
    var starLink = document.getElementById('deity-star-link');
    if (starLink) {
      if (d.link_key && typeof window.__wuri_openStarRegion === 'function') {
        starLink.innerHTML = '<button class="sx-deity-starlink" type="button">本宿星官 ›</button>';
        starLink.querySelector('.sx-deity-starlink').addEventListener('click', function () {
          window.__wuri_openStarRegion(d.link_key);
        });
      } else {
        starLink.innerHTML = '';
      }
    }
    curIdx = order.indexOf(id);
    if (F.pos) F.pos.textContent = '第 ' + (curIdx + 1) + ' / ' + total + ' 位';
    if (F.navPrev) F.navPrev.disabled = curIdx <= 0;
    if (F.navNext) F.navNext.disabled = curIdx >= total - 1;
    if (F.hint) F.hint.hidden = hintSeen();
    var wrap = detailView.querySelector('.deity-detail-wrap');
    if (wrap) wrap.classList.remove('slide-next', 'slide-prev');
    detailView.hidden = false;
    detailView.scrollTop = 0;
  }

  /* ---------- 上一位 / 下一位（滑动 + 键盘） ---------- */
  function goTo(idx, dir) {
    if (idx < 0 || idx >= total || idx === curIdx) return; /* 首尾停住，不循环 */
    var wrap = detailView.querySelector('.deity-detail-wrap');
    openDetail(order[idx]);
    if (wrap) {
      void wrap.offsetWidth; /* 重启动画 */
      wrap.classList.add(dir > 0 ? 'slide-next' : 'slide-prev');
    }
  }

  var tsX = 0, tsY = 0, tracking = false;
  detailView.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    tsX = e.touches[0].clientX;
    tsY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  detailView.addEventListener('touchmove', function (e) {
    if (!tracking || e.touches.length !== 1) return;
    var dx = e.touches[0].clientX - tsX;
    var dy = e.touches[0].clientY - tsY;
    /* 纵向意图明显：判定为滚动，取消本次滑动切换 */
    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) tracking = false;
  }, { passive: true });
  detailView.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    var t = e.changedTouches[0];
    if (!t) return;
    var dx = t.clientX - tsX;
    var dy = t.clientY - tsY;
    /* 阈值 50px，且横向须明显大于纵向，避免竖滚误触 */
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      markHintSeen();
      if (dx < 0) goTo(curIdx + 1, 1); else goTo(curIdx - 1, -1);
    }
  }, { passive: true });

  /* ---------- 两侧箭头（与滑动同效） ---------- */
  if (F.navPrev) F.navPrev.addEventListener('click', function () { markHintSeen(); goTo(curIdx - 1, -1); });
  if (F.navNext) F.navNext.addEventListener('click', function () { markHintSeen(); goTo(curIdx + 1, 1); });

  document.addEventListener('keydown', function (e) {
    if (detailView.hidden) return;
    if (e.key === 'ArrowRight') goTo(curIdx + 1, 1);
    else if (e.key === 'ArrowLeft') goTo(curIdx - 1, -1);
  });

  groupsEl.addEventListener('click', function (e) {
    var card = e.target.closest ? e.target.closest('[data-deity]') : null;
    if (card) {
      navOrigin = { views: ['view-deities'], scroll: { 'view-deities': listView.scrollTop } };
      openDetail(card.getAttribute('data-deity'));
    }
  });

  /* 图鉴素材下载完成后，若详情正开着，重走一遍图片解析（原生本地文件优先） */
  document.addEventListener('wuri-deity-dl-done', function () {
    if (!detailView.hidden && curIdx >= 0 && order[curIdx] && byId[order[curIdx]]) {
      loadDetailImage(byId[order[curIdx]]);
    }
  });

  /* ---------- 开/关 ---------- */
  var enter = document.getElementById('deities-enter');
  if (enter) enter.addEventListener('click', function () { listView.hidden = false; });
  var back = document.getElementById('deities-back');
  if (back) back.addEventListener('click', function () { listView.hidden = true; detailView.hidden = true; });
  var dBack = document.getElementById('deity-detail-back');
  if (dBack) dBack.addEventListener('click', function () {
    detailView.hidden = true;
    var o = navOrigin;
    navOrigin = null;
    if (o && o.views && o.views.length) {
      o.views.forEach(function (vid) {
        var v = document.getElementById(vid);
        if (v) v.hidden = false;
      });
      requestAnimationFrame(function () {
        o.views.forEach(function (vid) {
          var v = document.getElementById(vid);
          if (v && o.scroll && typeof o.scroll[vid] === 'number') v.scrollTop = o.scroll[vid];
        });
      });
    }
  });

  window.Deities = { openDetail: function (id) { navOrigin = null; openDetail(id); } };
  /* 星象模块互链入口（js/stars.js 调用）：可携来源（来源视图栈＋滚动位置），
   * 详情返回即回来源（星官区页/星官详情/步天歌等），不再写死落图鉴主页 */
  window.__wuri_openDeity = function (id, origin) { navOrigin = origin || null; openDetail(id); };
})();

/* 神祇图鉴（免费开放）：列表（分组）+ 详情（神诞/道场/职掌/生平·事迹/形象特征） */
(function () {
  var DATA = window.DEITIES_DATA;
  if (!DATA) return;
  var byId = {};
  DATA.deities.forEach(function (d) { byId[d.id] = d; });

  var listView = document.getElementById('view-deities');
  var detailView = document.getElementById('view-deity-detail');
  var groupsEl = document.getElementById('deities-groups');
  if (!listView || !detailView || !groupsEl) return;

  /* ---------- 顺序（与列表渲染一致：按分组先后） ---------- */
  var order = [];
  DATA.groups.forEach(function (g) {
    g.ids.forEach(function (id) { if (byId[id]) order.push(id); });
  });
  var total = order.length;
  var curIdx = -1;

  /* ---------- 列表渲染（一次） ---------- */
  var html = '';
  DATA.groups.forEach(function (g) {
    html += '<h2 class="deity-group-title">' + g.name + '</h2><div class="deity-grid">';
    g.ids.forEach(function (id) {
      var d = byId[id];
      if (!d) return;
      html += '<button class="deity-card" data-deity="' + d.id + '">' +
        '<img loading="lazy" src="img/deities/thumbs/' + d.image + '" alt="' + d.name + '">' +
        '<span class="deity-card-name">' + d.name + '</span>' +
        '<span class="deity-card-title">' + d.title + '</span>' +
        '</button>';
    });
    html += '</div>';
  });
  groupsEl.innerHTML = html;

  /* ---------- 详情 ---------- */
  var F = {
    img: document.getElementById('deity-detail-img'),
    name: document.getElementById('deity-detail-name'),
    title: document.getElementById('deity-detail-title'),
    pos: document.getElementById('deity-detail-pos'),
    birthday: document.getElementById('deity-f-birthday'),
    temple: document.getElementById('deity-f-temple'),
    domain: document.getElementById('deity-f-domain'),
    intro: document.getElementById('deity-f-intro'),
    appearance: document.getElementById('deity-f-appearance')
  };

  function openDetail(id) {
    var d = byId[id];
    if (!d) return;
    F.img.src = 'img/deities/' + d.image;
    F.img.alt = d.name;
    F.name.textContent = d.name;
    F.title.textContent = d.title;
    F.birthday.textContent = d.birthday;
    F.temple.textContent = d.temple;
    F.domain.textContent = d.domain;
    F.intro.textContent = d.intro;
    F.appearance.textContent = d.appearance;
    curIdx = order.indexOf(id);
    if (F.pos) F.pos.textContent = '第 ' + (curIdx + 1) + ' / ' + total + ' 位';
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
      if (dx < 0) goTo(curIdx + 1, 1); else goTo(curIdx - 1, -1);
    }
  }, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (detailView.hidden) return;
    if (e.key === 'ArrowRight') goTo(curIdx + 1, 1);
    else if (e.key === 'ArrowLeft') goTo(curIdx - 1, -1);
  });

  groupsEl.addEventListener('click', function (e) {
    var card = e.target.closest ? e.target.closest('[data-deity]') : null;
    if (card) openDetail(card.getAttribute('data-deity'));
  });

  /* ---------- 开/关 ---------- */
  var enter = document.getElementById('deities-enter');
  if (enter) enter.addEventListener('click', function () { listView.hidden = false; });
  var back = document.getElementById('deities-back');
  if (back) back.addEventListener('click', function () { listView.hidden = true; detailView.hidden = true; });
  var dBack = document.getElementById('deity-detail-back');
  if (dBack) dBack.addEventListener('click', function () { detailView.hidden = true; });

  window.Deities = { openDetail: openDetail };
})();

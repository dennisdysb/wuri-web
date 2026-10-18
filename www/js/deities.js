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
    detailView.hidden = false;
    detailView.scrollTop = 0;
  }

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

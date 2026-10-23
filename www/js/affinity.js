/* 神仙缘分测试（免费）：16 道原创情境题 → 双轴计分 → 1 主缘 + 2 次缘
 * 标签源：js/affinity-data.js（74 位全入池，含酆都大帝、太岁殷元帅独立一位）
 * 双轴：所求(needs) + 气质(traits)，经历母题(motifs)作小权重。
 * 神祇权重：主所求 3 / 次所求 1.5 / 气质 1 / 母题 0.6；
 * 「贵人逢源」不单设轴——其权重 0.75 并入该神祇的主所求。
 * 2026-10-22 权重调整（与 qimen-build/affinity_model.py 同口径）：
 * ①答案供给稀有度：用户标签分 × (全卷最大供给/该标签供给)^0.35；
 * ②所求槽位稀有度：主/次所求权重 × (1 + 0.08×ln(74/该槽位持有数))；
 * ③得分 = Σ(校正后用户分 × 有效权重) / 神祇总权重^0.52，同分按图鉴 id 序。
 * 定位：文化趣味与自我认识，文案不作吉凶断语（与全站免责正本一致）。
 * 进度与结果只存本地 localStorage，不上传。
 * 2026-10-22 分享卡改长版（750×1450）：中段加「特质相合」五边形（见下方雷达口径，
 * 结果页同步同款图）；下段双版本——带码版（二维码回流＋短域名）与小红书版
 * （无码无网址，底部印全名「戊日不上香APP」作可搜关键词）。 */
(function () {
  var TAGS = window.AFFINITY_TAGS;
  var QS = window.AFFINITY_QUESTIONS;
  if (!TAGS || !QS) return;

  var LS_PROG = 'wuri_affinity_progress'; /* {a:[已答选项下标]} */
  var LS_RES = 'wuri_affinity_result';     /* {a:[16], main:id, subs:[id,id]} */

  function T(k) { return (window.t ? window.t(k) : k); }
  function TX(s) { return (window.tx ? window.tx(s) : s); }
  function TF(k) {
    var args = Array.prototype.slice.call(arguments, 1);
    return (window.tf ? window.tf.apply(null, [T(k)].concat(args)) : T(k));
  }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  /* 2026-10-22 题库扩至 16 题：旧结果（答卷长度不符）作废，避免按新参考值错算雷达；
   * 旧进度前 12 题与新题库同序同题，保留续答（补答新增 4 题即可）。 */
  (function () {
    var res = lsGet(LS_RES);
    if (res && (!res.a || res.a.length !== QS.length)) lsDel(LS_RES);
    var prog = lsGet(LS_PROG);
    if (prog && prog.a && prog.a.length > QS.length) lsDel(LS_PROG);
  })();

  /* ---------- 计分（与 qimen-build/affinity_model.py 同口径，已仿真验证） ---------- */
  function weightsOf(d) {
    var w = { n: {}, t: {}, m: {} }, fold = 0;
    d.needs.secondary.forEach(function (s) {
      if (s === '贵人逢源') fold += 0.75; else w.n[s] = 1.5;
    });
    d.needs.primary.forEach(function (p, i) { w.n[p] = 3 + (i === 0 ? fold : 0); });
    d.traits.forEach(function (x) { w.t[x] = 1; });
    d.motifs.forEach(function (x) { w.m[x] = 0.6; });
    return w;
  }
  var WEIGHTS = {}, TOTALS = {};
  TAGS.forEach(function (d) {
    var w = weightsOf(d); WEIGHTS[d.id] = w;
    var tot = 0; ['n', 't', 'm'].forEach(function (ax) { for (var k in w[ax]) tot += w[ax][k]; });
    TOTALS[d.id] = tot;
  });
  /* 权重调整三件套（与 affinity_model.py 同口径，参数见该文件 docstring） */
  var SUPPLY = { n: {}, t: {}, m: {} }, SMAX = 0;
  QS.forEach(function (q) {
    q.options.forEach(function (o) {
      for (var ax in o.s) for (var k in o.s[ax]) {
        SUPPLY[ax][k] = (SUPPLY[ax][k] || 0) + o.s[ax][k];
        if (SUPPLY[ax][k] > SMAX) SMAX = SUPPLY[ax][k];
      }
    });
  });
  var PRI_C = {}, SEC_C = {};
  TAGS.forEach(function (d) {
    d.needs.primary.forEach(function (p) { PRI_C[p] = (PRI_C[p] || 0) + 1; });
    d.needs.secondary.forEach(function (s) { SEC_C[s] = (SEC_C[s] || 0) + 1; });
  });
  function slotFactor(c) { return 1 + 0.08 * Math.log(74 / c); }
  var EFFW = {};
  TAGS.forEach(function (d) {
    var w = WEIGHTS[d.id], ew = { n: {}, t: w.t, m: w.m }, pri = {};
    d.needs.primary.forEach(function (p) { pri[p] = 1; });
    for (var k in w.n) ew.n[k] = w.n[k] * slotFactor(pri[k] ? PRI_C[k] : SEC_C[k]);
    EFFW[d.id] = ew;
  });
  function profileOf(answers) {
    var p = { n: {}, t: {}, m: {} };
    answers.forEach(function (oi, qi) {
      var sc = QS[qi].options[oi].s;
      for (var ax in sc) for (var k in sc[ax]) p[ax][k] = (p[ax][k] || 0) + sc[ax][k];
    });
    return p;
  }
  function rankOf(answers) {
    var p = profileOf(answers);
    ['n', 't', 'm'].forEach(function (ax) {
      for (var k in p[ax]) p[ax][k] *= Math.pow(SMAX / SUPPLY[ax][k], 0.35);
    });
    var out = TAGS.map(function (d) {
      var w = EFFW[d.id], s = 0;
      ['n', 't', 'm'].forEach(function (ax) { for (var k in w[ax]) s += (p[ax][k] || 0) * w[ax][k]; });
      return { id: d.id, score: s / Math.pow(TOTALS[d.id], 0.52) };
    });
    out.sort(function (a, b) { return (b.score - a.score) || (a.id < b.id ? -1 : 1); });
    return out;
  }

  /* ---------- 特质五边形（五轴雷达，与 qimen-build/affinity_model.py 同口径） ----------
   * 同一套标签数据的可视化，不参与主缘计分。五轴由气质标签池（12）归纳，母题（12）按
   * 同轴补映射，每个标签恰好归一轴：仁厚＝温厚亲和、悯人助人；刚正＝正气威严、守序护众；
   * 灵慧＝聪慧通透、点化启悟；清峻＝清高孤介、苦修放下；洒脱＝自在来去、不拘形迹。
   * 归一（0–5，同尺＝占该轴可达上限之比）：用户＝答案原始标签分（气质原值＋母题×0.6）
   * 按轴汇总 ÷ 该轴问卷可达上限；神祇＝气质权重(1/个)＋母题权重(0.6/个) 按轴汇总
   * ÷ 全体该轴最大值。映射表改动须与 affinity_model.py 同步。 */
  var RADAR_AXES = ['仁厚', '刚正', '灵慧', '清峻', '洒脱'];
  var TRAIT_AXIS = { '慈悲仁厚': 0, '温厚守成': 0, '刚正威严': 1, '英武果决': 1, '豪迈仗义': 1,
    '聪慧机敏': 2, '沉稳谋略': 2, '清净淡泊': 3, '孤高清峻': 3, '坚毅苦修': 3, '逍遥洒脱': 4, '纯真活泼': 4 };
  var MOTIF_AXIS = { '母仪守护': 0, '行医济世': 0, '冤屈昭雪': 0, '守职尽责': 1, '镇妖除害': 1, '护民救劫': 1,
    '点化众生': 2, '少年英才': 2, '技艺成名': 2, '苦修成道': 3, '放下执念': 3, '漂泊历练': 4 };
  function axisSum(tmap, mmapScaled) {
    var out = [0, 0, 0, 0, 0], k;
    for (k in tmap) if (TRAIT_AXIS[k] !== undefined) out[TRAIT_AXIS[k]] += tmap[k];
    for (k in mmapScaled) if (MOTIF_AXIS[k] !== undefined) out[MOTIF_AXIS[k]] += mmapScaled[k];
    return out;
  }
  var USER_REF = (function () {
    var ref = [0, 0, 0, 0, 0];
    QS.forEach(function (q) {
      var per = [0, 0, 0, 0, 0];
      q.options.forEach(function (o) {
        var ms = {}, k;
        for (k in (o.s.m || {})) ms[k] = o.s.m[k] * 0.6;
        var s = axisSum(o.s.t || {}, ms);
        for (var i = 0; i < 5; i++) if (s[i] > per[i]) per[i] = s[i];
      });
      for (var i = 0; i < 5; i++) ref[i] += per[i];
    });
    return ref;
  })();
  var DEITY_REF = (function () {
    var ref = [0, 0, 0, 0, 0];
    TAGS.forEach(function (d) {
      var s = axisSum(WEIGHTS[d.id].t, WEIGHTS[d.id].m);
      for (var i = 0; i < 5; i++) if (s[i] > ref[i]) ref[i] = s[i];
    });
    return ref;
  })();
  function radarUser(answers) {
    var p = profileOf(answers), ms = {}, k;
    for (k in p.m) ms[k] = p.m[k] * 0.6;
    return axisSum(p.t, ms).map(function (v, i) { return Math.min(5, 5 * v / USER_REF[i]); });
  }
  function radarDeity(id) {
    return axisSum(WEIGHTS[id].t, WEIGHTS[id].m).map(function (v, i) { return Math.min(5, 5 * v / DEITY_REF[i]); });
  }
  /* 雷达绘制（结果页与分享卡共用同画法）：五环网格＋轴线＋轴名＋用户层（深绿）
   * ＋神祇层（金）＋交集层（赭红，逐轴 min——气质上真正相合的部分），顶点描点。
   * 绘制顺序：三层填充先行、两层边线与顶点后描，交集填充不遮边线。
   * 五边形只对照气质一层；主缘主要由所求驱动，口径说明见结果页/卡面小字。 */
  var RADAR_BOTH_FILL = 'rgba(178,84,44,0.45)';
  var RADAR_BOTH_HEX = '#B2542C';
  function drawRadar(c, cx, cy, R, uVals, dVals, labelPx) {
    var SERIF = '"Noto Serif SC","Songti SC","STSong","SimSun",serif';
    function pt(i, r) { var a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    var ring, i, p;
    c.save();
    for (ring = 1; ring <= 5; ring++) {
      c.beginPath();
      for (i = 0; i < 5; i++) { p = pt(i, R * ring / 5); if (i === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); }
      c.closePath();
      c.strokeStyle = ring === 5 ? '#C9BB8E' : '#E3DBC3'; c.lineWidth = ring === 5 ? 2 : 1; c.stroke();
    }
    for (i = 0; i < 5; i++) {
      p = pt(i, R);
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(p[0], p[1]);
      c.strokeStyle = '#E3DBC3'; c.lineWidth = 1; c.stroke();
    }
    function polyPath(vals) {
      var j, q;
      c.beginPath();
      for (j = 0; j < 5; j++) { q = pt(j, R * Math.max(vals[j], 0) / 5); if (j === 0) c.moveTo(q[0], q[1]); else c.lineTo(q[0], q[1]); }
      c.closePath();
    }
    function layerFill(vals, fill) { polyPath(vals); c.fillStyle = fill; c.fill(); }
    function layerEdge(vals, stroke) {
      var j, q;
      polyPath(vals);
      c.strokeStyle = stroke; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke();
      c.fillStyle = stroke;
      for (j = 0; j < 5; j++) { q = pt(j, R * Math.max(vals[j], 0) / 5); c.beginPath(); c.arc(q[0], q[1], 4, 0, 2 * Math.PI); c.fill(); }
    }
    var bothVals = uVals.map(function (v, j) { return Math.min(v, Math.max(dVals[j], 0)); });
    layerFill(uVals, 'rgba(42,80,68,0.20)');
    layerFill(dVals, 'rgba(162,129,59,0.20)');
    layerFill(bothVals, RADAR_BOTH_FILL);
    layerEdge(uVals, '#2A5044');
    layerEdge(dVals, '#A2813B');
    c.fillStyle = '#5B5340'; c.font = '600 ' + labelPx + 'px ' + SERIF;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (i = 0; i < 5; i++) { p = pt(i, R + labelPx * 0.95); c.fillText(RADAR_AXES[i], p[0], p[1]); }
    c.restore();
  }

  /* ---------- 相合说明（引职掌/气质/母题，不作断语） ---------- */
  function tagById(id) { for (var i = 0; i < TAGS.length; i++) if (TAGS[i].id === id) return TAGS[i]; return null; }
  function deityInfo(id) {
    var D = window.DEITIES_DATA;
    if (D && D.deities) for (var i = 0; i < D.deities.length; i++) if (D.deities[i].id === id) return D.deities[i];
    return null;
  }
  function bestShared(list, prof, preferFirst) {
    var best = null, bestV = 0;
    list.forEach(function (k) { var v = prof[k] || 0; if (v > bestV) { bestV = v; best = k; } });
    if (best) return best;
    return preferFirst && list.length ? list[0] : null;
  }
  function explain(id, prof, isMain) {
    var d = tagById(id), info = deityInfo(id);
    var need = bestShared(d.needs.primary.concat(d.needs.secondary), prof.n, true);
    var trait = bestShared(d.traits, prof.t, false);
    var motif = bestShared(d.motifs, prof.m, false);
    var parts = [];
    if (isMain) {
      parts.push('你心里最放不下的是「' + need + '」。');
      if (info && info.domain) parts.push(d.name + '的职掌——' + info.domain + '——与你所求的「' + need + '」正相呼应。');
      else parts.push(d.name + '主「' + d.needs.primary[0] + '」，与你所求的「' + need + '」正相呼应。');
      if (trait) parts.push('你为人中的那份「' + trait + '」，也与祂的气质相近。');
      if (motif) parts.push('你在选择里透出的「' + motif + '」，也是祂行世的方式之一。');
    } else {
      var s = d.name + '主「' + d.needs.primary[0] + '」';
      if (trait) s += '，你的「' + trait + '」与祂的气质相近';
      else if (need) s += '，你所求的「' + need + '」正在祂的职掌之中';
      if (motif) s += '，也都与「' + motif + '」结缘';
      parts.push(s + '。');
    }
    return parts.join('');
  }
  function shareTags(id, prof) {
    var d = tagById(id);
    return {
      need: bestShared(d.needs.primary.concat(d.needs.secondary), prof.n, true),
      trait: bestShared(d.traits, prof.t, false)
    };
  }

  /* ---------- DOM ---------- */
  var quizView = document.getElementById('view-affinity');
  var resView = document.getElementById('view-affinity-result');
  var enterBtn = document.getElementById('affinity-enter');
  var entrySub = document.getElementById('affinity-entry-sub');
  if (!quizView || !resView || !enterBtn) return;
  var E = {
    resumed: document.getElementById('affinity-resumed'),
    bar: document.getElementById('affinity-bar'),
    step: document.getElementById('affinity-step'),
    q: document.getElementById('affinity-q'),
    opts: document.getElementById('affinity-opts'),
    restart: document.getElementById('affinity-restart'),
    mainImg: document.getElementById('aff-main-img'),
    mainName: document.getElementById('aff-main-name'),
    mainTitle: document.getElementById('aff-main-title'),
    mainWhy: document.getElementById('aff-main-why'),
    mainDetail: document.getElementById('aff-main-detail'),
    subs: document.getElementById('aff-subs'),
    radar: document.getElementById('aff-radar'),
    radarDeityName: document.getElementById('aff-radar-deity-name'),
    radarNote: document.getElementById('aff-radar-note'),
    share: document.getElementById('aff-share'),
    shareXhs: document.getElementById('aff-share-xhs'),
    shareLink: document.getElementById('aff-share-link'),
    copyLink: document.getElementById('aff-copy-link'),
    retake: document.getElementById('aff-retake'),
    modal: document.getElementById('affinity-share-modal'),
    modalImg: document.getElementById('affinity-share-img'),
    modalClose: document.getElementById('affinity-share-close')
  };

  var answers = [];   /* 当前答题进度 */
  var curRes = null;  /* 当前结果 {a, main, subs} */

  function refreshEntry() {
    var res = lsGet(LS_RES), prog = lsGet(LS_PROG);
    if (res && res.main) {
      var d = tagById(res.main);
      entrySub.textContent = TF('aff_last_result', TX(d ? d.name : ''));
      enterBtn.textContent = T('aff_entry_view');
    } else if (prog && prog.a && prog.a.length) {
      entrySub.textContent = TF('aff_progress_note', prog.a.length);
      enterBtn.textContent = T('aff_entry_continue');
    } else {
      entrySub.textContent = T('aff_entry_sub');
      enterBtn.textContent = T('aff_entry_btn');
    }
  }

  /* ---------- 答题 ---------- */
  function openQuiz(resumed) {
    quizView.hidden = false;
    quizView.scrollTop = 0;
    E.resumed.hidden = !(resumed && answers.length);
    if (!E.resumed.hidden) E.resumed.textContent = TF('aff_resumed', answers.length + 1);
    E.restart.hidden = !answers.length;
    renderQ();
  }
  function renderQ() {
    var idx = answers.length;
    if (idx >= QS.length) return finish();
    var item = QS[idx];
    E.bar.style.width = (idx / QS.length * 100) + '%';
    E.step.textContent = TF('aff_step', idx + 1);
    E.q.textContent = TX(item.q);
    E.opts.innerHTML = '';
    item.options.forEach(function (op, oi) {
      var b = document.createElement('button');
      b.className = 'aff-opt';
      b.type = 'button';
      b.textContent = TX(op.t);
      b.addEventListener('click', function () { choose(oi); });
      E.opts.appendChild(b);
    });
  }
  function choose(oi) {
    answers.push(oi);
    lsSet(LS_PROG, { a: answers.slice() });
    E.resumed.hidden = true;
    E.restart.hidden = false;
    if (answers.length >= QS.length) finish();
    else renderQ();
  }
  function finish() {
    var r = rankOf(answers);
    curRes = { a: answers.slice(), main: r[0].id, subs: [r[1].id, r[2].id] };
    lsSet(LS_RES, curRes);
    lsDel(LS_PROG);
    answers = [];
    quizView.hidden = true;
    renderResult();
    resView.hidden = false;
    resView.scrollTop = 0;
    refreshEntry();
  }

  /* ---------- 结果 ---------- */
  function renderResult() {
    var res = curRes || lsGet(LS_RES);
    if (!res) return;
    curRes = res;
    var prof = profileOf(res.a);
    var info = deityInfo(res.main), d = tagById(res.main);
    if (info) { E.mainImg.src = 'img/deities/' + info.image; E.mainImg.alt = TX(info.name); }
    E.mainName.textContent = TX(d.name);
    E.mainTitle.textContent = TX(info ? info.title : '');
    E.mainWhy.textContent = TX(explain(res.main, prof, true));
    /* 特质五边形：与分享卡同数据同画法，先在结果页看到；数值挂 dataset 供冒烟对拍 */
    if (E.radar) {
      var uv = radarUser(res.a), dv = radarDeity(res.main);
      var bv = uv.map(function (v, j) { return Math.min(v, dv[j]); });
      E.radar.setAttribute('data-user', uv.map(function (v) { return v.toFixed(2); }).join(','));
      E.radar.setAttribute('data-deity', dv.map(function (v) { return v.toFixed(2); }).join(','));
      E.radar.setAttribute('data-both', bv.map(function (v) { return v.toFixed(2); }).join(','));
      var rc = E.radar.getContext('2d');
      rc.clearRect(0, 0, E.radar.width, E.radar.height);
      drawRadar(rc, E.radar.width / 2, E.radar.height / 2, E.radar.width * 0.39, uv, dv, 44);
      if (E.radarDeityName) E.radarDeityName.textContent = TF('aff_radar_deity', TX(d.name));
      /* 口径小字：五边形只对照气质，主缘主要相合在所求（头号共享所求动态填） */
      if (E.radarNote) {
        var topNeed = shareTags(res.main, prof).need;
        E.radarNote.textContent = topNeed ? TX(TF('aff_radar_note', topNeed)) : '';
        E.radarNote.hidden = !topNeed;
      }
    }
    E.subs.innerHTML = '';
    res.subs.forEach(function (id) {
      var sd = tagById(id), si = deityInfo(id);
      var card = document.createElement('button');
      card.className = 'aff-sub-card';
      card.type = 'button';
      card.innerHTML = '<span class="aff-sub-imgbox"><img alt=""></span>' +
        '<span class="aff-sub-body"><span class="aff-sub-name"></span>' +
        '<span class="aff-sub-title"></span><span class="aff-sub-why"></span></span>';
      var img = card.querySelector('img');
      if (si) { img.src = 'img/deities/thumbs/' + si.image; img.alt = TX(si.name); }
      card.querySelector('.aff-sub-name').textContent = TX(sd.name);
      card.querySelector('.aff-sub-title').textContent = TX(si ? si.title : '');
      card.querySelector('.aff-sub-why').textContent = TX(explain(id, prof, false));
      card.addEventListener('click', function () { openDeity(id); });
      E.subs.appendChild(card);
    });
  }
  function openResult() {
    if (!lsGet(LS_RES)) return;
    renderResult();
    resView.hidden = false;
    resView.scrollTop = 0;
  }
  function openDeity(id) {
    if (window.Deities && window.Deities.openDetail) window.Deities.openDetail(id);
  }

  /* ---------- 分享结果（专属页链接：www/yuanfen/<id>.html，由 qimen-build/gen_share_pages.py 生成） ---------- */
  var SHARE_PAGE_BASE = 'https://wuri.shengboyu.ca/yuanfen/';
  function sharePageUrl(id) { return SHARE_PAGE_BASE + id + '.html'; }
  /* 分享卡二维码目标 URL —— 全仓单一常量：二维码 PNG 资产（www/img/qr-yuanfen.png）
   * 由 qimen-build/gen_qr.py 读取本常量生成。发布核验时若缘分子域名未通，
   * 改此一处为 'https://wuri.shengboyu.ca/?yuanfen=1' 后重跑 gen_qr.py 即可。 */
  var QR_TARGET_URL = 'https://yuanfen.shengboyu.ca/';
  function copyText(text, done) {
    function legacy() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        done(!!ok);
      } catch (e) { done(false); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, legacy);
    } else legacy();
  }
  function sharePayload() {
    var res = curRes || lsGet(LS_RES);
    if (!res || !res.main) return null;
    var d = tagById(res.main);
    var name = TX(d ? d.name : '');
    return {
      title: TF('aff_share_title', name),
      text: TF('aff_share_text', name),
      url: sharePageUrl(res.main)
    };
  }
  function copyResultLink() {
    var payload = sharePayload();
    if (!payload) return;
    copyText(payload.url, function (ok) {
      var msg = T(ok ? 'aff_link_copied' : 'aff_link_copy_fail');
      if (window.toast) window.toast(msg); else alert(msg);
    });
  }
  /* 系统分享（微信/Facebook 等走系统面板）；环境不支持时回退复制链接 */
  function shareResultLink() {
    var payload = sharePayload();
    if (!payload) return;
    if (navigator.share) {
      navigator.share(payload).catch(function () { /* 用户取消分享：不回退复制 */ });
    } else {
      copyResultLink();
    }
  }

  /* ---------- 分享卡（canvas 合成，纯本地） ---------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /* 长版分享卡 750×1450：上段（品牌/造像/名号/相合行）；中段「特质相合」五边形
   * （含交集层）＋三项图例＋口径小字；下段诚实标注＋回流带。withQR=true 为带码版（二维码＋扫码语＋短域名）；
   * withQR=false 为小红书版（无码无网址，底部品牌行印全名「戊日不上香APP」）。
   * v1.4.0(3) 起：五边形半径 110、二维码 104（用户看样卡后要求放大）。 */
  function makeShareCard(withQR) {
    var res = curRes || lsGet(LS_RES);
    if (!res) return;
    var info = deityInfo(res.main), d = tagById(res.main);
    var prof = profileOf(res.a);
    var st = shareTags(res.main, prof);
    var img = new Image();
    img.onload = function () {
      function paint(qr) {
        try {
          var W = 750, H = 1450, cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          var c = cv.getContext('2d');
          var SERIF = '"Noto Serif SC","Songti SC","STSong","SimSun",serif';
          c.fillStyle = '#F5F1E5'; c.fillRect(0, 0, W, H);
          c.strokeStyle = '#A2813B'; c.lineWidth = 3; c.strokeRect(26, 26, W - 52, H - 52);
          c.lineWidth = 1; c.strokeRect(40, 40, W - 80, H - 80);
          c.textAlign = 'center';
          c.fillStyle = '#86702E'; c.font = '600 30px ' + SERIF;
          c.fillText('戊 日 不 上 香', W / 2, 96);
          c.fillStyle = '#8C8371'; c.font = '25px ' + SERIF;
          c.fillText('神 仙 缘 分 测 试', W / 2, 138);
          /* 造像：顶部对齐裁切（与图鉴卡 object-position:top 一致）；
           * v1.4.0(3)：造像高 540→486 让位给放大后的五边形与二维码，下方各段同幅上移；
           * 本次：造像再让 24（486→462）、下方各段同幅上移，腾出五边形口径小字一行 */
          var ix = 165, iy = 160, iw = 420, ih = 462;
          c.save(); roundRect(c, ix, iy, iw, ih, 16); c.clip();
          var sc = Math.max(iw / img.naturalWidth, ih / img.naturalHeight);
          var dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
          c.drawImage(img, ix + (iw - dw) / 2, iy, dw, dh);
          c.restore();
          c.strokeStyle = '#E3DBC3'; c.lineWidth = 2; roundRect(c, ix, iy, iw, ih, 16); c.stroke();
          c.fillStyle = '#2A251B'; c.font = '700 62px ' + SERIF;
          c.fillText(d.name, W / 2, 700);
          c.fillStyle = '#86702E'; c.font = '29px ' + SERIF;
          c.fillText(info ? info.title : '', W / 2, 746);
          c.strokeStyle = '#A2813B'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(W / 2 - 130, 770); c.lineTo(W / 2 - 14, 770); c.moveTo(W / 2 + 14, 770); c.lineTo(W / 2 + 130, 770); c.stroke();
          c.save(); c.translate(W / 2, 770); c.rotate(Math.PI / 4); c.fillStyle = '#A2813B'; c.fillRect(-6, -6, 12, 12); c.restore();
          c.fillStyle = '#2A5044'; c.font = '600 34px ' + SERIF;
          c.fillText('与' + d.name + '最相合', W / 2, 814);
          var line2 = [];
          if (st.need) line2.push('所求「' + st.need + '」');
          if (st.trait) line2.push('气质「' + st.trait + '」');
          if (line2.length) { c.fillStyle = '#5B5340'; c.font = '27px ' + SERIF; c.fillText(line2.join(' · '), W / 2, 850); }
          /* 中段：特质相合五边形（与结果页同数据同画法，含交集层）；
           * v1.4.0(3)：半径 78→110（+41%）、轴标签 25→30，间距已按新尺寸排匀 */
          c.fillStyle = '#86702E'; c.font = '600 27px ' + SERIF;
          c.fillText('特 质 相 合', W / 2, 894);
          drawRadar(c, W / 2, 1062, 110, radarUser(res.a), radarDeity(res.main), 30);
          /* 图例：你的特质（深绿）／{名号}的特质（金）／气质相合的部分（赭红），
           * 整行居中；长名号时字号自适应收窄防出框 */
          var lgItems = [['#2A5044', T('aff_radar_you')], ['#A2813B', TF('aff_radar_deity', d.name)], [RADAR_BOTH_HEX, T('aff_radar_both')]];
          var lgPx = 24, lgW = 0, li2;
          while (lgPx > 18) {
            c.font = '600 ' + lgPx + 'px ' + SERIF;
            lgW = 40 * (lgItems.length - 1);
            for (li2 = 0; li2 < lgItems.length; li2++) { lgItems[li2][2] = c.measureText(lgItems[li2][1]).width; lgW += 32 + lgItems[li2][2]; }
            if (lgW <= W - 92) break;
            lgPx -= 2;
          }
          var lx = (W - lgW) / 2, lgY = 1216;
          c.textAlign = 'left'; c.textBaseline = 'middle';
          for (li2 = 0; li2 < lgItems.length; li2++) {
            c.fillStyle = lgItems[li2][0]; c.fillRect(lx, lgY - 9, 22, 18);
            c.fillStyle = '#5B5340'; c.fillText(lgItems[li2][1], lx + 32, lgY);
            lx += 32 + lgItems[li2][2] + 40;
          }
          c.textAlign = 'center'; c.textBaseline = 'alphabetic';
          /* 口径小字（卡面短版）：五边形只对照气质，主要相合在所求 */
          if (st.need) { c.fillStyle = '#5B5340'; c.font = '20px ' + SERIF; c.fillText(TF('aff_radar_note_card', st.need), W / 2, 1252); }
          /* 下段：诚实标注 */
          c.fillStyle = '#8C8371'; c.font = '20px ' + SERIF;
          c.fillText('题目为现代创作 · 文化趣味与自我认识 · 不作吉凶断言', W / 2, 1284);
          if (withQR) {
            /* 带码版：左二维码（资产底色同卡面，含静区），右扫码语＋短域名；
             * v1.4.0(3)：码面 88→104，解码验证随发版回归重跑 */
            if (qr) c.drawImage(qr, 84, 1295, 104, 104);
            c.textAlign = qr ? 'left' : 'center';
            var tx0 = qr ? 216 : W / 2;
            c.fillStyle = '#2A5044'; c.font = '600 27px ' + SERIF;
            c.fillText('扫码测测与你有缘的神仙', tx0, 1337);
            c.fillStyle = '#86702E'; c.font = '25px ' + SERIF;
            c.fillText('wuri.shengboyu.ca', tx0, 1371);
            c.textAlign = 'center';
          } else {
            /* 小红书版：无码无网址，底部品牌行印全名作可搜关键词 */
            c.fillStyle = '#86702E'; c.font = '600 32px ' + SERIF;
            c.fillText('戊日不上香APP', W / 2, 1358);
          }
          E.modalImg.src = cv.toDataURL('image/png');
          E.modal.hidden = false;
        } catch (e) {
          if (window.toast) window.toast(T('aff_share_fail')); else alert(T('aff_share_fail'));
        }
      }
      if (withQR) {
        var q = new Image();
        q.onload = function () { paint(q); };
        q.onerror = function () { paint(null); }; /* 码图缺失时降级：只印文字行 */
        q.src = 'img/qr-yuanfen.png';
      } else {
        paint(null);
      }
    };
    img.onerror = function () { if (window.toast) window.toast(T('aff_share_fail')); };
    img.src = 'img/deities/' + (info ? info.image : '');
  }

  /* ---------- 接线 ---------- */
  enterBtn.addEventListener('click', function () {
    var res = lsGet(LS_RES), prog = lsGet(LS_PROG);
    if (prog && prog.a && prog.a.length && prog.a.length < QS.length) {
      answers = prog.a.slice();
      openQuiz(true);
    } else if (res && res.main) {
      openResult();
    } else {
      answers = [];
      openQuiz(false);
    }
  });
  document.getElementById('affinity-back').addEventListener('click', function () {
    quizView.hidden = true;
    refreshEntry();
  });
  document.getElementById('affinity-result-back').addEventListener('click', function () {
    resView.hidden = true;
    refreshEntry();
  });
  E.restart.addEventListener('click', function () {
    answers = [];
    lsDel(LS_PROG);
    E.resumed.hidden = true;
    E.restart.hidden = true;
    E.bar.style.width = '0%';
    renderQ();
  });
  E.mainDetail.addEventListener('click', function () { if (curRes) openDeity(curRes.main); });
  E.retake.addEventListener('click', function () {
    lsDel(LS_RES); lsDel(LS_PROG);
    curRes = null; answers = [];
    resView.hidden = true;
    openQuiz(false);
    refreshEntry();
  });
  E.share.addEventListener('click', function () { makeShareCard(true); });
  if (E.shareXhs) E.shareXhs.addEventListener('click', function () { makeShareCard(false); });
  if (E.shareLink) E.shareLink.addEventListener('click', shareResultLink);
  if (E.copyLink) E.copyLink.addEventListener('click', copyResultLink);
  E.modalClose.addEventListener('click', function () { E.modal.hidden = true; });
  E.modal.addEventListener('click', function (e) { if (e.target === E.modal) E.modal.hidden = true; });

  refreshEntry();

  /* 分享页 CTA 落地（?yuanfen=1）：打开图鉴视图并定位到缘分测试入口卡。
   * 只在首次加载时响应一次，不改变现有视图路由语义（等同点按首页图鉴入口）；
   * 处理后清掉参数，避免刷新/分享本页地址时重复触发。 */
  try {
    if (new URLSearchParams(location.search).get('yuanfen')) {
      var deEnter = document.getElementById('deities-enter');
      if (deEnter) deEnter.click();
      var entryCard = document.getElementById('affinity-entry');
      if (entryCard) setTimeout(function () {
        if (entryCard.scrollIntoView) entryCard.scrollIntoView({ block: 'start' });
      }, 80);
      if (window.history && history.replaceState) {
        try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
      }
    }
  } catch (e) {}

  /* 语言切换时重绘本功能动态文案（挂入全站重绘链） */
  var prevRerender = window.__wuri_rerender;
  window.__wuri_rerender = function () {
    if (prevRerender) prevRerender();
    refreshEntry();
    if (!quizView.hidden) renderQ();
    if (!resView.hidden) renderResult();
  };
})();

/* 戊日不上香 · 一键离线下载（网页版，v1.3.9 (34)）
 * 设置页一颗按钮 → 弹窗选声线（女声/男声/双声）→ 后台下载全部经文诵读音频到
 * 本地 Cache Storage（独立缓存 wuri-offline-v1，SW 版本更新不清除），
 * 全程半透明悬浮进度；关页/断网中断后下次打开自动按已缓存清单断点续传。
 * 顺带预取经文正文（content/jing/*.js）、时间码、图鉴数据与图片，离线可读可看。
 * 播放本地优先由 sw.js 的音频路由实现（命中离线缓存才出本地，未命中照常流播）。
 * 门控与 (32) 单文件下载同口径：离线下载属高级版，未激活先弹付费墙。
 */
(function () {
  'use strict';

  var CACHE_NAME = 'wuri-offline-v1'; /* 必须与 sw.js 的 OFFLINE_CACHE 一致 */
  var LS_STATE = 'wuri_offline_dl_v1';

  /* 有声经文清单：与 jingwen.js 的 JING_HAS_AUDIO 保持一致（新增有声经文时两处同步） */
  var AUDIO_BOOKS = ['s01', 's02', 's03', 's04', 's05', 's07', 's09', 's15', 's10', 's12',
    's13', 's14', 's16', 's17', 's26', 's27', 's28', 's29', 's30', 's31', 's32', 's33', 's35'];
  var VOICES = ['female', 'male'];
  var VOICE_NAME = { female: '女声', male: '男声' };

  /* 各文件字节数兜底表（GitHub 线实测值；弹窗大小以实时 HEAD 为准，HEAD 失败才用此表。
   * CF 镜像线 s01/s02 四个文件是 64kbps 转码版、更小，同样以该线 HEAD 实测为准。） */
  var FALLBACK_SIZES = {"s01_female": 39274506, "s01_male": 36314536, "s02_female": 48009639, "s02_male": 44893336, "s03_female": 9929859, "s03_male": 9355582, "s04_female": 11672126, "s04_male": 11049790, "s05_female": 11608799, "s05_male": 10027243, "s07_female": 23374194, "s07_male": 23153110, "s09_female": 23868532, "s09_male": 20458400, "s10_female": 4865479, "s10_male": 4489316, "s12_female": 1519731, "s12_male": 1367595, "s13_female": 5680896, "s13_male": 5058552, "s14_female": 22597369, "s14_male": 19822536, "s15_female": 6793106, "s15_male": 5963041, "s16_female": 5714360, "s16_male": 5161819, "s17_female": 1582847, "s17_male": 1310754, "s26_female": 2969964, "s26_male": 3233192, "s27_female": 1148560, "s27_male": 1194805, "s28_female": 1048256, "s28_male": 962573, "s29_female": 11956561, "s29_male": 10792546, "s30_female": 2201792, "s30_male": 2136172, "s31_female": 1439472, "s31_male": 1360479, "s32_female": 5858140, "s32_male": 5234545, "s33_female": 2045905, "s33_male": 1974020, "s35_female": 4971649, "s35_male": 4443767};

  var ABORT = { abort: true };
  var running = false;
  var abortFlag = false;
  var curRun = null; /* {tier, items:[{key,url,size,trusted,live,done}], totalBytes} */
  var sizeMap = null; /* key -> {size, trusted} */

  /* ---------- 基础工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function fmtMB(b) {
    if (!b && b !== 0) return '—';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function audioBase() {
    /* 与 jingwen.js 的实际播放地址等效：GitHub 线 JING_BASE 是绝对地址、
     * CF 镜像线部署时被相对化；两种情况下按页面地址解析 audio/jing/ 都得到
     * 与播放完全一致的 URL，保证缓存键与播放请求逐字对齐。 */
    return new URL('audio/jing/', location.href).href;
  }
  function relUrl(rel) { return new URL(rel, location.href).href; }
  function fileUrl(key) { return audioBase() + key + '.mp3'; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_STATE) || 'null'); } catch (e) { return null; }
  }
  function saveState(s) {
    try {
      if (s) localStorage.setItem(LS_STATE, JSON.stringify(s));
      else localStorage.removeItem(LS_STATE);
    } catch (e) {}
  }
  function isPro() { return !!(window.WuriPro && WuriPro.isPro()); }
  function toast(msg) {
    var t = $('offline-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'offline-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);' +
        'background:rgba(30,30,40,0.92);color:#fff;font-size:14px;padding:10px 18px;' +
        'border-radius:20px;z-index:10005;opacity:0;transition:opacity .3s;pointer-events:none;' +
        'max-width:86vw;text-align:center;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.style.opacity = '0'; }, 2600);
  }

  /* ---------- 大小计算（HEAD 实测，失败回落兜底表） ---------- */
  function headSize(url) {
    return fetch(url, { method: 'HEAD' }).then(function (r) {
      if (!r.ok) return null;
      var n = parseInt(r.headers.get('content-length') || '0', 10);
      return n > 0 ? n : null;
    }).catch(function () { return null; });
  }
  function computeSizes() {
    if (sizeMap) return Promise.resolve(sizeMap);
    var keys = [];
    AUDIO_BOOKS.forEach(function (b) {
      VOICES.forEach(function (v) { keys.push(b + '_' + v); });
    });
    var map = {};
    var i = 0;
    function worker() {
      if (i >= keys.length) return Promise.resolve();
      var key = keys[i++];
      return headSize(fileUrl(key)).then(function (n) {
        if (n) map[key] = { size: n, trusted: true };
        else if (FALLBACK_SIZES[key]) map[key] = { size: FALLBACK_SIZES[key], trusted: false };
        else map[key] = { size: 0, trusted: false };
        return worker();
      });
    }
    var pool = [];
    for (var k = 0; k < 6; k++) pool.push(worker());
    return Promise.all(pool).then(function () { sizeMap = map; return map; });
  }
  function tierKeys(tier) {
    var keys = [];
    AUDIO_BOOKS.forEach(function (b) {
      if (tier === 'female' || tier === 'both') keys.push(b + '_female');
      if (tier === 'male' || tier === 'both') keys.push(b + '_male');
    });
    return keys;
  }
  function tierBytes(map, tier) {
    return tierKeys(tier).reduce(function (s, k) { return s + (map[k] ? map[k].size : 0); }, 0);
  }

  /* ---------- 半透明悬浮进度 ---------- */
  function ensureFloat() {
    var f = $('offline-float');
    if (f) return f;
    var st = document.createElement('style');
    st.textContent =
      '#offline-float{position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));' +
      'z-index:10004;background:rgba(28,28,40,0.85);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);' +
      'border-radius:12px;padding:10px 14px;color:#fff;font-size:13px;box-shadow:0 2px 14px rgba(0,0,0,0.35);' +
      'transition:opacity .6s;cursor:pointer;}' +
      '#offline-float .of-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}' +
      '#offline-float .of-title{font-weight:600;}' +
      '#offline-float .of-close{background:none;border:none;color:rgba(255,255,255,0.75);font-size:17px;' +
      'line-height:1;padding:2px 4px;cursor:pointer;}' +
      '#offline-float .of-sub{color:rgba(255,255,255,0.8);font-size:12px;margin-bottom:6px;}' +
      '#offline-float .of-track{height:6px;background:rgba(255,255,255,0.22);border-radius:3px;overflow:hidden;}' +
      '#offline-float .of-fill{height:100%;width:0%;background:#4a9eff;border-radius:3px;transition:width .25s;}';
    document.head.appendChild(st);
    f = document.createElement('div');
    f.id = 'offline-float';
    f.hidden = true;
    f.innerHTML =
      '<div class="of-row"><span class="of-title" id="of-title">正在下载离线音频</span>' +
      '<button class="of-close" id="of-close" aria-label="关闭">×</button></div>' +
      '<div class="of-sub" id="of-sub"></div>' +
      '<div class="of-track"><div class="of-fill" id="of-fill"></div></div>';
    document.body.appendChild(f);
    $('of-close').addEventListener('click', function (ev) {
      ev.stopPropagation();
      hideFloat();
    });
    f.addEventListener('click', function () {
      /* 下载未全成时点悬浮窗 = 继续下载并回到设置页查看 */
      var s = loadState();
      if (s && s.status !== 'done') {
        resume();
        var tab = document.querySelector('[data-tab="tab-me"]');
        if (tab) tab.click();
      }
    });
    return f;
  }
  function showFloat() {
    var f = ensureFloat();
    f.hidden = false;
    f.style.opacity = '1';
  }
  function hideFloat() {
    var f = $('offline-float');
    if (f) f.hidden = true;
  }
  function fadeFloat(delay) {
    var f = ensureFloat();
    setTimeout(function () {
      f.style.opacity = '0';
      setTimeout(function () { f.hidden = true; f.style.opacity = '1'; }, 700);
    }, delay || 4000);
  }
  var lastPaint = 0;
  function paintProgress(force) {
    if (!curRun) return;
    var now = Date.now();
    if (!force && now - lastPaint < 150) return;
    lastPaint = now;
    var doneBytes = 0, doneFiles = 0;
    curRun.items.forEach(function (it) {
      if (it.done) { doneFiles++; doneBytes += it.size || it.live || 0; }
      else if (it.live) doneBytes += it.live;
    });
    var total = curRun.totalBytes || 1;
    var pct = Math.min(100, Math.floor(doneBytes * 100 / total));
    showFloat();
    $('of-title').textContent = '正在下载离线音频（' +
      (curRun.tier === 'both' ? '双声' : VOICE_NAME[curRun.tier]) + '）· ' + pct + '%';
    $('of-sub').textContent = '第 ' + doneFiles + ' / 共 ' + curRun.items.length + ' 个 · 已下载 ' +
      fmtMB(doneBytes) + ' / ' + fmtMB(curRun.totalBytes);
    $('of-fill').style.width = pct + '%';
    var st = $('offline-status');
    if (st) {
      st.textContent = '正在下载离线音频：' + pct + '%（第 ' + doneFiles + '/' + curRun.items.length +
        ' 个），可放心切换页面，下载会在后台继续。';
    }
  }
  function paintPrefetch(done, total) {
    showFloat();
    $('of-title').textContent = '正在预取经文正文与图鉴（离线阅读）';
    $('of-sub').textContent = '第 ' + done + ' / 共 ' + total + ' 项';
    $('of-fill').style.width = Math.floor(done * 100 / Math.max(1, total)) + '%';
  }
  function paintDone(failedCount) {
    showFloat();
    if (failedCount > 0) {
      $('of-title').textContent = '离线下载未全部完成';
      $('of-sub').textContent = '有 ' + failedCount + ' 个文件没下完，点此继续下载';
      $('of-fill').style.width = '100%';
      return; /* 不淡出，留给用户点续传 */
    }
    $('of-title').textContent = '离线音频下载完成 ✓';
    $('of-sub').textContent = '断网、飞行模式也能听经了';
    $('of-fill').style.width = '100%';
    fadeFloat(4200);
  }

  /* ---------- 下载引擎 ---------- */
  function downloadOne(it) {
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(it.url).then(function (hit) {
        if (hit) {
          var len = parseInt(hit.headers.get('content-length') || '0', 10);
          if (len > 0) it.size = len;
          it.done = true;
          paintProgress(true);
          return true;
        }
        var attempt = 0;
        function tryOnce() {
          if (abortFlag) return Promise.reject(ABORT);
          attempt++;
          return fetch(it.url, { cache: 'no-store' }).then(function (res) {
            if (!res.ok) throw new Error('http ' + res.status);
            var blobPromise;
            if (res.body && typeof res.body.getReader === 'function') {
              var reader = res.body.getReader();
              var chunks = [];
              it.live = 0;
              blobPromise = (function read() {
                if (abortFlag) {
                  try { reader.cancel(); } catch (e) {}
                  return Promise.reject(ABORT);
                }
                return reader.read().then(function (r) {
                  if (r.done) return new Blob(chunks, { type: 'audio/mpeg' });
                  chunks.push(r.value);
                  it.live += r.value.byteLength;
                  paintProgress(false);
                  return read();
                });
              })();
            } else {
              blobPromise = res.blob();
            }
            return blobPromise.then(function (blob) {
              /* 完整性粗检：实测大小明显小于 HEAD 值视为截断（兜底表大小不作数，CF 转码更小） */
              if (it.trusted && it.size && blob.size < it.size * 0.98) {
                throw new Error('truncated ' + blob.size + '/' + it.size);
              }
              if (blob.size < 10240) throw new Error('too small');
              it.size = blob.size;
              var stored = new Response(blob, {
                headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(blob.size) }
              });
              return cache.put(it.url, stored).then(function () {
                it.done = true;
                it.live = 0;
                paintProgress(true);
                return true;
              });
            });
          }).catch(function (e) {
            if (e === ABORT) throw e;
            if (attempt >= 3) return false;
            return sleep(attempt === 1 ? 800 : 2500).then(tryOnce);
          });
        }
        return tryOnce();
      });
    });
  }

  /* 预取后把 feed 三段数据同步种进 content-feed 的 localStorage 缓存：
   * 否则全新用户首次打开时目录只按包内 27 部渲染（jingwen init 早于 feed 拉取），
   * 新经（s33–s36）在目录里不出现、离线更点不开；种下后本次会话立即重渲目录、
   * 下次离线打开也按 31 部渲染（2026-10-21 (34) 线上验证发现的衔接缺口） */
  function seedFeedCache() {
    var files = { deities: 'content/deities.json', scriptures: 'content/scriptures.json', festivals: 'content/festivals.json' };
    var out = {};
    var chain = Promise.resolve();
    Object.keys(files).forEach(function (name) {
      chain = chain.then(function () {
        return fetch(relUrl(files[name])).then(function (r) {
          return r.ok ? r.json() : null;
        }).then(function (j) { if (j) out[name] = j; }).catch(function () {});
      });
    });
    return chain.then(function () {
      if (out.deities && out.scriptures && out.festivals) {
        try { localStorage.setItem('wuri_feed_cache_v1', JSON.stringify(out)); } catch (e) {}
        if (Array.isArray(out.scriptures.index)) window.JINGWEN_INDEX = out.scriptures.index;
        if (typeof out.scriptures.filesBase === 'string' && out.scriptures.filesBase) {
          window.WURI_JING_BASE = out.scriptures.filesBase;
        }
        try { document.dispatchEvent(new Event('wuri-pro-change')); } catch (e) {}
      }
    });
  }

  function prefetchAll(audioKeys) {
    var cache;
    return caches.open(CACHE_NAME).then(function (c) {
      cache = c;
      var rels = ['content/manifest.json', 'content/scriptures.json',
        'content/deities.json', 'content/festivals.json'];
      var idx = (window.JINGWEN_INDEX || []).map(function (x) { return x.id; });
      var ids = idx.length ? idx : AUDIO_BOOKS.slice();
      ids.forEach(function (id) { rels.push('content/jing/' + id + '.js'); });
      audioKeys.forEach(function (k) { rels.push('audio/timestamps/' + k + '.json'); });
      return fetch(relUrl('content/deities.json')).then(function (r) {
        return r.ok ? r.json() : null;
      }).catch(function () { return null; }).then(function (dj) {
        if (dj && dj.deities) {
          dj.deities.forEach(function (d) {
            if (d.image) {
              rels.push('img/deities/thumbs/' + d.image);
              rels.push('img/deities/' + d.image);
            }
          });
        }
        var uniq = [];
        var seen = {};
        rels.forEach(function (r) { if (!seen[r]) { seen[r] = 1; uniq.push(r); } });
        var done = 0;
        paintPrefetch(0, uniq.length);
        var chain = Promise.resolve();
        uniq.forEach(function (rel) {
          chain = chain.then(function () {
            if (abortFlag) return;
            var url = relUrl(rel);
            return cache.match(url).then(function (hit) {
              if (hit) return;
              return fetch(url).then(function (r) {
                if (r.ok) return cache.put(url, r);
              }).catch(function () {});
            }).then(function () {
              done++;
              if (done % 5 === 0 || done === uniq.length) paintPrefetch(done, uniq.length);
            });
          });
        });
        return chain;
      });
    });
  }

  function start(tier) {
    if (running) return;
    if (!('caches' in window)) { toast('当前环境不支持离线缓存'); return; }
    running = true;
    abortFlag = false;
    computeSizes().then(function (map) {
      var keys = tierKeys(tier);
      var items = keys.map(function (k) {
        return { key: k, url: fileUrl(k), size: map[k] ? map[k].size : 0, trusted: map[k] ? map[k].trusted : false, live: 0, done: false };
      });
      curRun = {
        tier: tier, items: items,
        totalBytes: items.reduce(function (s, it) { return s + (it.size || 0); }, 0)
      };
      saveState({ v: 1, tier: tier, status: 'running', failedKeys: [], ts: Date.now() });
      syncCard();
      paintProgress(true);
      var chain = Promise.resolve();
      var failed = [];
      items.forEach(function (it) {
        chain = chain.then(function () {
          if (abortFlag) return;
          return downloadOne(it).then(function (ok) { if (!ok) failed.push(it.key); });
        });
      });
      return chain.then(function () {
        if (abortFlag) return;
        return prefetchAll(keys).then(function () { return seedFeedCache(); }).then(function () {
          saveState({ v: 1, tier: tier, status: failed.length ? 'partial' : 'done', failedKeys: failed, ts: Date.now() });
          paintDone(failed.length);
          refreshStats();
        });
      });
    }).catch(function (e) {
      if (e !== ABORT) { /* 引擎级异常：保留 running 状态，下次打开自动续传 */ }
    }).then(function () {
      running = false;
      curRun = null;
      syncCard();
      refreshStats();
    });
  }

  function resume() {
    if (running) return;
    var s = loadState();
    if (!s || !s.tier) return;
    if (s.status === 'done') return;
    start(s.tier);
  }

  function stop() { abortFlag = true; }

  function deleteAll() {
    stop();
    return caches.delete(CACHE_NAME).then(function () {
      saveState(null);
      sizeMap = null;
      hideFloat();
      syncCard();
      refreshStats();
      toast('离线内容已删除');
    });
  }

  /* ---------- 设置卡状态 ---------- */
  function cacheStats() {
    if (!('caches' in window)) return Promise.resolve(null);
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.keys().then(function (reqs) {
        var audioCount = 0, audioBytes = 0, otherCount = 0, otherBytes = 0;
        var chain = Promise.resolve();
        reqs.forEach(function (req) {
          chain = chain.then(function () {
            return cache.match(req).then(function (res) {
              if (!res) return;
              var len = parseInt(res.headers.get('content-length') || '0', 10);
              var isAudio = /\/audio\/jing\/s\d+_(female|male)\.mp3$/.test(req.url);
              if (!len) {
                return res.blob().then(function (b) {
                  if (isAudio) { audioCount++; audioBytes += b.size; }
                  else { otherCount++; otherBytes += b.size; }
                });
              }
              if (isAudio) { audioCount++; audioBytes += len; }
              else { otherCount++; otherBytes += len; }
            });
          });
        });
        return chain.then(function () {
          return { audioCount: audioCount, audioBytes: audioBytes, otherCount: otherCount, otherBytes: otherBytes };
        });
      });
    }).catch(function () { return null; });
  }
  function refreshStats() {
    var st = $('offline-status');
    if (!st) return Promise.resolve();
    return cacheStats().then(function (s) {
      if (running) return; /* 下载中由 paintProgress 写状态行 */
      if (!s || (s.audioCount === 0 && s.otherCount === 0)) {
        st.textContent = '尚未下载离线音频。';
      } else {
        st.textContent = '已下载离线音频 ' + s.audioCount + ' 个文件 · ' + fmtMB(s.audioBytes) +
          (s.otherCount ? '（另含经文正文/图鉴等 ' + s.otherCount + ' 项 · ' + fmtMB(s.otherBytes) + '）' : '') +
          '。断网时可直接播放已下载的声线。';
      }
      syncCard();
    });
  }
  function syncCard() {
    var btn = $('offline-dl-btn');
    var del = $('offline-del-btn');
    var failBox = $('offline-failed');
    var resumeBtn = $('offline-resume-btn');
    if (btn) {
      btn.disabled = running;
      btn.textContent = running ? '正在下载…' : '一键下载所有音频';
    }
    if (del) del.disabled = running;
    var s = loadState();
    var hasFailed = !!(s && s.failedKeys && s.failedKeys.length);
    if (failBox) {
      if (hasFailed && !running) {
        failBox.hidden = false;
        failBox.textContent = '上次有 ' + s.failedKeys.length + ' 个文件没下完（' +
          s.failedKeys.join('、') + '），联网后点「继续下载」补齐。';
      } else {
        failBox.hidden = true;
      }
    }
    if (resumeBtn) resumeBtn.hidden = !(hasFailed && !running);
  }

  /* ---------- 弹窗 ---------- */
  function openModal() {
    var m = $('offline-modal');
    if (!m) return;
    m.classList.add('show');
    var voiceSel = $('jing-voice');
    var def = voiceSel && voiceSel.value === 'male' ? 'male' : 'female';
    var radio = document.querySelector('input[name="offline-tier"][value="' + def + '"]');
    if (radio) radio.checked = true;
    document.querySelectorAll('[data-tier-size]').forEach(function (el) {
      el.textContent = '计算大小中…';
    });
    computeSizes().then(function (map) {
      document.querySelectorAll('[data-tier-size]').forEach(function (el) {
        var tier = el.getAttribute('data-tier-size');
        el.textContent = '约 ' + fmtMB(tierBytes(map, tier)) + ' · ' + tierKeys(tier).length + ' 个文件';
      });
    });
  }
  function closeModal() {
    var m = $('offline-modal');
    if (m) m.classList.remove('show');
  }

  /* ---------- 初始化 ---------- */
  function init() {
    var btn = $('offline-dl-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!isPro()) { if (window.WuriPro) WuriPro.requirePro('jingwen'); return; }
      if (!('caches' in window)) { toast('当前环境不支持离线缓存'); return; }
      openModal();
    });
    var close = $('offline-close');
    if (close) close.addEventListener('click', closeModal);
    var modal = $('offline-modal');
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    var startBtn = $('offline-start');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        var sel = document.querySelector('input[name="offline-tier"]:checked');
        closeModal();
        start(sel ? sel.value : 'female');
      });
    }
    var del = $('offline-del-btn');
    if (del) del.addEventListener('click', function () { deleteAll(); });
    var resumeBtn = $('offline-resume-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', resume);
    refreshStats();
    /* 中断续传：上次没下完（含关页中断/部分失败），打开后自动接着下 */
    var s = loadState();
    if (s && s.tier && s.status !== 'done') {
      setTimeout(resume, 2000);
    }
    window.addEventListener('online', function () {
      var st = loadState();
      if (st && st.tier && st.status !== 'done') resume();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 测试/调试入口（与单文件下载的 window.onJingDownload* 同风格） */
  window.WuriOffline = {
    CACHE_NAME: CACHE_NAME,
    start: start,
    resume: resume,
    stop: stop,
    deleteAll: deleteAll,
    isRunning: function () { return running; },
    state: loadState,
    stats: cacheStats,
    sizes: computeSizes,
    tierBytes: function (tier) {
      return computeSizes().then(function (map) { return tierBytes(map, tier); });
    },
    /* 小批机制验证用：只下指定 key（如 ['s33_female']），走同一引擎与缓存 */
    startKeys: function (keys) {
      if (running) return Promise.resolve(false);
      running = true;
      abortFlag = false;
      return computeSizes().then(function (map) {
        var items = keys.map(function (k) {
          return { key: k, url: fileUrl(k), size: map[k] ? map[k].size : 0, trusted: map[k] ? map[k].trusted : false, live: 0, done: false };
        });
        curRun = { tier: 'female', items: items, totalBytes: items.reduce(function (s2, it) { return s2 + (it.size || 0); }, 0) };
        var chain = Promise.resolve();
        var okAll = true;
        items.forEach(function (it) {
          chain = chain.then(function () {
            return downloadOne(it).then(function (ok) { if (!ok) okAll = false; });
          });
        });
        return chain.then(function () { return okAll; });
      }).then(function (ok) {
        running = false;
        curRun = null;
        hideFloat();
        refreshStats();
        return ok;
      });
    }
  };
})();

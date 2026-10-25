/* 戊日不上香 · 一键离线下载（网页版，v1.3.9 (34)）
 * 设置页一颗按钮 → 弹窗选声线（女声/男声/双声）→ 后台下载全部经文诵读音频到
 * 本地 Cache Storage（独立缓存 wuri-offline-v1，SW 版本更新不清除），
 * 全程半透明悬浮进度；关页/断网中断后下次打开自动按已缓存清单断点续传。
 * 顺带预取经文正文（content/jing/*.js）、时间码、图鉴数据与缩略图，离线可读可看。
 * 图鉴全图另有「图鉴素材」一键下载（本文件后半段，v2.0.0 (2) 神图外置）。
 * 播放本地优先由 sw.js 的音频路由实现（命中离线缓存才出本地，未命中照常流播）。
 * 门控与 (32) 单文件下载同口径：离线下载属高级版，未激活先弹付费墙。
 */
(function () {
  'use strict';

  var CACHE_NAME = 'wuri-offline-v1'; /* 必须与 sw.js 的 OFFLINE_CACHE 一致 */
  var LS_STATE = 'wuri_offline_dl_v1';

  /* 有声经文清单：与 jingwen.js 的 JING_HAS_AUDIO 保持一致（新增有声经文时两处同步） */
  var AUDIO_BOOKS = ['s01', 's02', 's03', 's04', 's05', 's07', 's09', 's15', 's10', 's12',
    's13', 's14', 's16', 's17', 's26', 's27', 's28', 's29', 's30', 's31', 's32', 's33', 's35', 's34', 's36', 's39'];
  var VOICES = ['female', 'male'];
  var VOICE_NAME = { female: '女声', male: '男声' };

  /* 各文件字节数兜底表（GitHub 线实测值；弹窗大小以实时 HEAD 为准，HEAD 失败才用此表。
   * CF 镜像线 s01/s02 四个文件是 64kbps 转码版、更小，同样以该线 HEAD 实测为准。） */
  var FALLBACK_SIZES = {"s01_female": 39274506, "s01_male": 36314536, "s02_female": 48009639, "s02_male": 44893336, "s03_female": 9929859, "s03_male": 9355582, "s04_female": 11672126, "s04_male": 11049790, "s05_female": 11608799, "s05_male": 10027243, "s07_female": 23374194, "s07_male": 23153110, "s09_female": 23868532, "s09_male": 20458400, "s10_female": 4865479, "s10_male": 4489316, "s12_female": 1519731, "s12_male": 1367595, "s13_female": 5680896, "s13_male": 5058552, "s14_female": 22597369, "s14_male": 19822536, "s15_female": 6793106, "s15_male": 5963041, "s16_female": 5714360, "s16_male": 5161819, "s17_female": 1582847, "s17_male": 1310754, "s26_female": 2969964, "s26_male": 3233192, "s27_female": 1148560, "s27_male": 1194805, "s28_female": 1048256, "s28_male": 962573, "s29_female": 11956561, "s29_male": 10792546, "s30_female": 2201792, "s30_male": 2136172, "s31_female": 1439472, "s31_male": 1360479, "s32_female": 5858140, "s32_male": 5234545, "s33_female": 2045905, "s33_male": 1974020, "s35_female": 4971649, "s35_male": 4443767, "s34_female": 37177200, "s34_male": 35747360, "s36_female": 41408789, "s36_male": 37410581, "s39_female": 6235537, "s39_male": 5660007};

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
            /* 神图外置（v2.0.0 (2)）：预取只带缩略图，全图走「图鉴素材」单独下载，
             * 不再随音频一键下载整包拉回（否则外置瘦身被预取抵消） */
            if (d.image) rels.push('img/deities/thumbs/' + d.image);
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
    if (deityRunning) { toast('图鉴素材正在下载，请稍候'); return; }
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


  /* ---------- 图鉴素材下载（v2.0.0 (2) 神图外置） ----------
   * 全图平时从服务器按需加载、看过的留运行时缓存；此按钮把 102 张全图一次下进
   * 同一豁免缓存（wuri-offline-v1），SW 图鉴分支命中即本地出。逐文件先查缓存＝
   * 断点续传。与音频下载共用悬浮进度窗，互斥运行。总大小以 HEAD 实测为准，
   * 失败回落兜底表（呈现版上线字节数，构建时实算，非估算）。删除只删全图条目，
   * 不动同缓存里的音频/正文。 */
  var DEITY_LS = 'wuri_deity_dl_v1';
  var DEITY_FALLBACK_SIZES = {"baosheng.webp": 227964, "beidou.webp": 181270, "beiyue.webp": 226862, "bigan.webp": 217512, "bishuiyu.webp": 270218, "bixia.webp": 217648, "biyuewu.webp": 271516, "caoguojiu.webp": 189292, "changsheng.webp": 252624, "chenghuang.webp": 168268, "daode.webp": 168802, "diguan.webp": 188590, "dituhe.webp": 247930, "donghua.webp": 287960, "dongyue.webp": 258310, "doumu.webp": 178204, "doumuxie.webp": 362496, "erlang.webp": 193512, "fangritu.webp": 262874, "fengdu.webp": 243928, "gexuan.webp": 207172, "gouchen.webp": 221498, "guandi.webp": 215984, "guangze.webp": 241440, "guijinyang.webp": 294318, "hanxiangzi.webp": 177168, "hehe.webp": 209356, "hexiangu.webp": 131568, "houtu.webp": 188512, "huaguang.webp": 252268, "jiaomujiao.webp": 340744, "jingmugan.webp": 299832, "jishuibao.webp": 272674, "kangjinlong.webp": 300718, "kuimulang.webp": 272864, "kuixing.webp": 247098, "lancaihe.webp": 199452, "lingbao.webp": 202738, "linshui.webp": 247016, "lishan.webp": 191760, "liuhai.webp": 207310, "liutuzhang.webp": 296968, "longwang.webp": 267182, "loujingou.webp": 286124, "luban.webp": 193126, "lvdongbin.webp": 146838, "magu.webp": 223710, "maoriji.webp": 297230, "mazu.webp": 172962, "nandou.webp": 186588, "nanyue.webp": 233270, "nezha.webp": 216902, "niujinniu.webp": 280428, "nvtufu.webp": 237912, "puhua.webp": 233604, "qiuchuji.webp": 161208, "sanmao.webp": 180386, "sashoujian.webp": 207310, "shennong.webp": 273024, "shenshuiyuan.webp": 291734, "shihuozhu.webp": 266400, "shuiguan.webp": 194126, "taisui.webp": 242290, "taiyang.webp": 266428, "taiyi.webp": 221068, "taiyin.webp": 184960, "tianguan.webp": 184670, "tieguai.webp": 168592, "tudi.webp": 222826, "wangchongyang.webp": 187944, "wanglingguan.webp": 194316, "wangmu.webp": 241030, "weihuohu.webp": 283210, "weituzhi.webp": 274596, "weiyueyan.webp": 278350, "wenchang.webp": 163870, "wenqiong.webp": 223304, "xingrima.webp": 258098, "xinyuehu.webp": 282966, "xiyue.webp": 228918, "xuannv.webp": 211486, "xurishu.webp": 268168, "xuxun.webp": 222616, "yaowang.webp": 198222, "yihuoshe.webp": 304192, "yuanshi.webp": 200448, "yuelao.webp": 184452, "yuhuang.webp": 245560, "zaojun.webp": 171822, "zhangdaoling.webp": 169728, "zhangguolao.webp": 145226, "zhangsanfeng.webp": 165022, "zhangyuelu.webp": 245732, "zhaogongming.webp": 200574, "zhenshuiyin.webp": 257790, "zhenwu.webp": 195020, "zhongkui.webp": 179212, "zhongli.webp": 200756, "zhongyue.webp": 262486, "zhusheng.webp": 230742, "zihuohou.webp": 305390, "ziwei.webp": 198404};
  var deityRunning = false;
  var deityAbort = false;
  var deitySizeMap = null;

  function deityNames() {
    var D = window.DEITIES_DATA;
    var out = [], seen = {};
    if (D && D.deities) D.deities.forEach(function (d) {
      if (d.image && !seen[d.image]) { seen[d.image] = 1; out.push(d.image); }
    });
    return out;
  }
  function deityUrl(name) { return relUrl('img/deities/' + name); }
  function deityLoadState() {
    try { return JSON.parse(localStorage.getItem(DEITY_LS) || 'null'); } catch (e) { return null; }
  }
  function deitySaveState(st) {
    try {
      if (st) localStorage.setItem(DEITY_LS, JSON.stringify(st));
      else localStorage.removeItem(DEITY_LS);
    } catch (e) {}
  }
  /* 素材清单（v2.1.1 清单驱动）：发布环节由 gen-deity-manifest.py 按 feed
   * 名单实算生成 img/deities/manifest.json（张数/总字节/逐文件），与全图
   * 同源托管。运行时网络优先读清单并存 localStorage；断网用上次缓存；
   * 再不行回落包内兜底表推导（数值由兜底表计算、不写死）。设置页张数/大小
   * 与下载进度总量统一以清单为准。 */
  var DEITY_MANIFEST_LS = 'wuri_deity_manifest_v1';
  var deityManifestCache = null;
  function deityFallbackManifest() {
    var files = {}, total = 0, n = 0;
    for (var k in DEITY_FALLBACK_SIZES) { files[k] = DEITY_FALLBACK_SIZES[k]; total += files[k]; n++; }
    return { count: n, totalBytes: total, files: files };
  }
  function deityManifest() {
    if (deityManifestCache) return Promise.resolve(deityManifestCache);
    return fetch(relUrl('img/deities/manifest.json'), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('manifest http');
      return r.json();
    }).then(function (m) {
      if (!m || typeof m.count !== 'number' || typeof m.totalBytes !== 'number' || !m.files) throw new Error('manifest shape');
      deityManifestCache = m;
      try { localStorage.setItem(DEITY_MANIFEST_LS, JSON.stringify(m)); } catch (e) {}
      return m;
    }).catch(function () {
      try {
        var c = JSON.parse(localStorage.getItem(DEITY_MANIFEST_LS) || 'null');
        if (c && c.files && typeof c.totalBytes === 'number') { deityManifestCache = c; return c; }
      } catch (e) {}
      deityManifestCache = deityFallbackManifest();
      return deityManifestCache;
    });
  }
  function deitySizes() {
    if (deitySizeMap) return Promise.resolve(deitySizeMap);
    return deityManifest().then(function (m) {
      var names = deityNames();
      var map = {}, missing = [];
      names.forEach(function (n) {
        if (m.files && typeof m.files[n] === 'number') map[n] = m.files[n];
        else missing.push(n);
      });
      if (!missing.length) { deitySizeMap = map; return map; }
      /* 清单缺个别文件（素材刚换、清单未及重跑）：仅对缺项 HEAD 实测，再兜底表 */
      var i = 0;
      function worker() {
        if (i >= missing.length) return Promise.resolve();
        var name = missing[i++];
        return headSize(deityUrl(name)).then(function (n) {
          map[name] = n || DEITY_FALLBACK_SIZES[name] || 0;
          return worker();
        });
      }
      var pool = [];
      for (var k = 0; k < 6; k++) pool.push(worker());
      return Promise.all(pool).then(function () { deitySizeMap = map; return map; });
    });
  }
  function deityPaint(doneAll, totalN, doneBytes, totalBytes) {
    showFloat();
    var pct = totalBytes ? Math.min(100, Math.floor(doneBytes * 100 / totalBytes)) : 0;
    $('of-title').textContent = '正在下载图鉴素材 · ' + pct + '%';
    $('of-sub').textContent = '第 ' + doneAll + ' / 共 ' + totalN + ' 张 · 已下载 ' +
      fmtMB(doneBytes) + ' / ' + fmtMB(totalBytes);
    $('of-fill').style.width = pct + '%';
    var st = $('deity-dl-status');
    if (st) st.textContent = '正在下载图鉴素材：' + pct + '%（第 ' + doneAll + '/' + totalN + ' 张），可放心切换页面。';
  }
  function deityDownloadOne(cache, name, size) {
    var url = deityUrl(name);
    return cache.match(url).then(function (hit) {
      if (hit) {
        var len = parseInt(hit.headers.get('content-length') || '0', 10);
        return { ok: true, size: len || size };
      }
      var attempt = 0;
      function tryOnce() {
        if (deityAbort) return Promise.reject(ABORT);
        attempt++;
        return fetch(url, { cache: 'no-store' }).then(function (res) {
          if (!res.ok) throw new Error('http ' + res.status);
          return res.blob();
        }).then(function (blob) {
          if (blob.size < 5000) throw new Error('too small');
          if (size && blob.size < size * 0.98) throw new Error('truncated');
          var stored = new Response(blob, {
            headers: { 'Content-Type': 'image/webp', 'Content-Length': String(blob.size) }
          });
          return cache.put(url, stored).then(function () { return { ok: true, size: blob.size }; });
        }).catch(function (e) {
          if (e === ABORT) throw e;
          if (attempt >= 3) return { ok: false, size: 0 };
          return sleep(attempt === 1 ? 800 : 2500).then(tryOnce);
        });
      }
      return tryOnce();
    });
  }
  function deityStart() {
    if (deityRunning) return;
    if (running) { toast('离线音频正在下载，请稍候'); return; }
    if (!('caches' in window)) { toast('当前环境不支持离线缓存'); return; }
    var names = deityNames();
    if (!names.length) { toast('图鉴数据尚未就绪'); return; }
    deityRunning = true;
    deityAbort = false;
    deitySaveState({ v: 1, status: 'running', failed: [], ts: Date.now() });
    deitySyncCard();
    deitySizes().then(function (map) {
      var totalBytes = names.reduce(function (sm, n) { return sm + (map[n] || 0); }, 0);
      return caches.open(CACHE_NAME).then(function (cache) {
        var doneN = 0, doneBytes = 0, failed = [];
        deityPaint(0, names.length, 0, totalBytes);
        var chain = Promise.resolve();
        names.forEach(function (name) {
          chain = chain.then(function () {
            if (deityAbort) return;
            return deityDownloadOne(cache, name, map[name] || 0).then(function (r) {
              if (r.ok) { doneN++; doneBytes += r.size || map[name] || 0; }
              else failed.push(name);
              deityPaint(doneN + failed.length, names.length, doneBytes, totalBytes);
            });
          });
        });
        return chain.then(function () {
          if (deityAbort) return;
          deitySaveState({ v: 1, status: failed.length ? 'partial' : 'done', failed: failed, ts: Date.now() });
          showFloat();
          if (failed.length) {
            $('of-title').textContent = '图鉴素材未全部下载';
            $('of-sub').textContent = '有 ' + failed.length + ' 张没下完，再点一次「一键下载图鉴素材」补齐';
            $('of-fill').style.width = '100%';
          } else {
            $('of-title').textContent = '图鉴素材下载完成 ✓';
            $('of-sub').textContent = '断网、飞行模式也能看全图了';
            $('of-fill').style.width = '100%';
            fadeFloat(4200);
          }
          try { document.dispatchEvent(new Event('wuri-deity-dl-done')); } catch (e) {}
        });
      });
    }).catch(function () {}).then(function () {
      deityRunning = false;
      deitySyncCard();
      deityRefreshStats();
    });
  }
  function deityDelete() {
    if (deityRunning) return Promise.resolve(false);
    if (!('caches' in window)) return Promise.resolve(false);
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.keys().then(function (reqs) {
        var chain = Promise.resolve();
        reqs.forEach(function (req) {
          var u = new URL(req.url);
          if (/\/img\/deities\/[^/]+\.webp$/.test(u.pathname)) {
            chain = chain.then(function () { return cache.delete(req); });
          }
        });
        return chain;
      });
    }).then(function () {
      deitySaveState(null);
      deitySyncCard();
      deityRefreshStats();
      toast('图鉴素材已删除');
      return true;
    });
  }
  function deityStats() {
    if (!('caches' in window)) return Promise.resolve({ count: 0, bytes: 0 });
    var names = deityNames();
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.keys().then(function (reqs) {
        var count = 0, bytes = 0;
        var chain = Promise.resolve();
        reqs.forEach(function (req) {
          var u = new URL(req.url);
          var m = /\/img\/deities\/([^/]+\.webp)$/.exec(u.pathname);
          if (!m || names.indexOf(m[1]) < 0) return;
          chain = chain.then(function () {
            return cache.match(req).then(function (res) {
              if (!res) return;
              count++;
              var len = parseInt(res.headers.get('content-length') || '0', 10);
              if (len) { bytes += len; return; }
              return res.blob().then(function (b) { bytes += b.size; });
            });
          });
        });
        return chain.then(function () { return { count: count, bytes: bytes }; });
      });
    }).catch(function () { return { count: 0, bytes: 0 }; });
  }
  function deitySyncCard() {
    var btn = $('deity-dl-btn'), del = $('deity-del-btn'), failBox = $('deity-dl-failed');
    if (btn) {
      btn.disabled = deityRunning || running;
      btn.textContent = deityRunning ? '正在下载…' : '一键下载图鉴素材';
    }
    if (del) del.disabled = deityRunning || running;
    var st = deityLoadState();
    if (failBox) {
      if (st && st.failed && st.failed.length && !deityRunning) {
        failBox.hidden = false;
        failBox.textContent = '上次有 ' + st.failed.length + ' 张图没下完，联网后点「一键下载图鉴素材」补齐。';
      } else {
        failBox.hidden = true;
      }
    }
  }
  function deityRefreshStats() {
    var st = $('deity-dl-status');
    if (!st) return Promise.resolve();
    return deityStats().then(function (sm) {
      if (deityRunning) return;
      var total = deityNames().length;
      if (!sm.count) st.textContent = '尚未下载图鉴素材。';
      else if (sm.count >= total) st.textContent = '已下载图鉴素材 ' + sm.count + ' 张 · ' + fmtMB(sm.bytes) + '，断网时可直接看全图。';
      else st.textContent = '已下载图鉴素材 ' + sm.count + ' / ' + total + ' 张 · ' + fmtMB(sm.bytes) + '，没下完的点按钮补齐。';
      deitySyncCard();
    });
  }
  /* 设置页素材栏文案数字读清单渲染（张数＋总大小与下载总量同源） */
  function deityPaintDesc() {
    var el = $('deity-dl-desc');
    if (!el) return;
    deityManifest().then(function (m) {
      el.textContent = '神祇图鉴的全图平时从服务器按需加载，看过的会自动留在本机。点下面按钮可一次把全部 ' +
        m.count + ' 位尊神的全图（约 ' + fmtMB(m.totalBytes) + '）下载到本机，断网也能慢慢看；不需要时可随时删除腾出空间。';
    });
  }
  function deityInit() {
    var btn = $('deity-dl-btn');
    if (!btn) return;
    deityPaintDesc();
    btn.addEventListener('click', deityStart);
    var del = $('deity-del-btn');
    if (del) del.addEventListener('click', function () { deityDelete(); });
    deityRefreshStats();
    /* 中断续传：上次没下完，打开后自动接着下（与音频错峰） */
    var st = deityLoadState();
    if (st && st.status && st.status !== 'done') {
      setTimeout(function () { if (!deityRunning && !running) deityStart(); }, 2600);
    }
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
    deityInit();
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

  /* 图鉴素材下载调试/测试入口（v2.0.0 (2)） */
  window.WuriDeityDl = {
    start: deityStart,
    deleteAll: deityDelete,
    stats: deityStats,
    sizes: deitySizes,
    state: deityLoadState,
    isRunning: function () { return deityRunning; }
  };
})();

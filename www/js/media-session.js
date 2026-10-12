/* 戊日不上香 · 媒体会话管理器
 * 让音频播放时出现在 Android 媒体卡片区（通知中心之上），和汽水音乐一样
 * 用户 2026-10-10：要媒体卡片，不要挤在通知列表里
 */
(function () {
  'use strict';

  var APP_NAME = '戊日不上香';
  /* 2026-10-11 fix: artwork 写死绝对 URL，不动态拼（pathname 在根目录/子目录下算出来不一样，404 就不显示图） */
  var ICON_SRC = 'https://dennisdysb.github.io/wuri-web/www/img/logo-96.png';
  /* 2026-10-12 blob 方案：iOS 媒体管道拉 https 图不稳定，转 blob URL 最可靠 */
  var BLOB_URL = null;
  function ensureBlobUrl(cb) {
    if (BLOB_URL) { if (cb) cb(BLOB_URL); return; }
    try {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = 128; c.height = 128;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, 128, 128);
          if (c.toBlob) {
            c.toBlob(function (blob) {
              if (blob) {
                try { BLOB_URL = URL.createObjectURL(blob); } catch (e) {}
              }
              if (cb) cb(BLOB_URL);
            }, 'image/png');
          } else if (cb) {
            cb(null);
          }
        } catch (e) { if (cb) cb(null); }
      };
      img.onerror = function () { if (cb) cb(null); };
      img.src = ICON_SRC;
    } catch (e) { if (cb) cb(null); }
  }
  // 页面加载后就预生成 blob，播放时直接用
  try {
    if (document.readyState === 'complete') {
      ensureBlobUrl();
    } else {
      window.addEventListener('load', function () { ensureBlobUrl(); });
    }
  } catch (e) {}

  function isSupported() {
    try { return ('mediaSession' in navigator); } catch (e) { return false; }
  }

  function setMetadata(opts) {
    if (!isSupported()) return;
    try {
      var artwork = [];
      // 尝试用传入的封面，否则用 App 图标（blob 优先，https 兜底）
      if (opts.artwork) {
        artwork = opts.artwork;
      } else {
        var src = BLOB_URL || ICON_SRC;
        var sz = BLOB_URL ? '128x128' : '96x96';
        artwork = [{ src: src, sizes: sz, type: 'image/png' }];
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: opts.title || APP_NAME,
        artist: opts.artist || APP_NAME,
        album: opts.album || '',
        artwork: artwork
      });
      // blob 还没好：生成后刷新一次 metadata，让 logo 显示出来
      if (!opts.artwork && !BLOB_URL) {
        ensureBlobUrl(function (url) {
          if (url) {
            try {
              var md = navigator.mediaSession.metadata;
              if (md) {
                md.artwork = [{ src: url, sizes: '128x128', type: 'image/png' }];
                // 重新赋值触发 iOS 刷新
                navigator.mediaSession.metadata = md;
              }
            } catch (e) {}
          }
        });
      }
    } catch (e) {}
  }

  function setHandlers(handlers) {
    if (!isSupported()) return;
    try {
      var actions = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward'];
      for (var i = 0; i < actions.length; i++) {
        var action = actions[i];
        try {
          if (handlers[action]) {
            navigator.mediaSession.setActionHandler(action, handlers[action]);
          } else {
            navigator.mediaSession.setActionHandler(action, null);
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  function setPlaybackState(state) {
    // 'none' | 'paused' | 'playing'
    if (!isSupported()) return;
    try { navigator.mediaSession.playbackState = state; } catch (e) {}
  }

  function clear() {
    if (!isSupported()) return;
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    } catch (e) {}
  }

  // 便捷：绑定一个 Audio 元素，自动同步播放状态
  function bindAudio(audio, opts) {
    if (!audio || !isSupported()) return;
    setMetadata(opts || {});
    setHandlers({
      play: function () { try { audio.play(); } catch (e) {} },
      pause: function () { try { audio.pause(); } catch (e) {} }
    });
    var updateState = function () {
      try {
        setPlaybackState(audio.paused ? 'paused' : 'playing');
      } catch (e) {}
    };
    audio.addEventListener('play', updateState);
    audio.addEventListener('pause', updateState);
    audio.addEventListener('ended', function () { setPlaybackState('none'); });
    updateState();
  }

  window.WuriMediaSession = {
    isSupported: isSupported,
    setMetadata: setMetadata,
    setHandlers: setHandlers,
    setPlaybackState: setPlaybackState,
    bindAudio: bindAudio,
    clear: clear
  };
})();

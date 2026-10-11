/* 戊日不上香 · 媒体会话管理器
 * 让音频播放时出现在 Android 媒体卡片区（通知中心之上），和汽水音乐一样
 * 用户 2026-10-10：要媒体卡片，不要挤在通知列表里
 */
(function () {
  'use strict';

  var APP_NAME = '戊日不上香';
  var ICON_SRC = 'img/logo.png'; // 2026-10-10：icon-512.png 不存在，改用实际存在的 logo.png

  function isSupported() {
    try { return ('mediaSession' in navigator); } catch (e) { return false; }
  }

  function setMetadata(opts) {
    if (!isSupported()) return;
    try {
      var artwork = [];
      // 尝试用传入的封面，否则用 App 图标
      if (opts.artwork) {
        artwork = opts.artwork;
      } else {
        artwork = [{ src: ICON_SRC, sizes: '512x512', type: 'image/png' }];
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: opts.title || APP_NAME,
        artist: opts.artist || APP_NAME,
        album: opts.album || '',
        artwork: artwork
      });
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

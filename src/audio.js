/* =======================================================================
 * audio.js —— 全部音效由 WebAudio 实时合成，不需要任何音频文件
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Sound = {
    ctx: null,
    master: null,
    noiseBuf: null,
    volume: 0.6,
    muted: false,

    init: function () {
      if (this.ctx) { this.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);

      // 预生成 1 秒白噪声，反复复用
      var len = Math.floor(this.ctx.sampleRate);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    },

    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setVolume: function (v) {
      this.volume = v;
      if (this.master) this.master.gain.value = this.muted ? 0 : v;
    },

    /* --- 内部工具 --- */
    now: function () { return this.ctx.currentTime; },

    noise: function (dur, gain, filterType, freq, q, sweepTo) {
      if (!this.ctx || this.muted) return;
      var t = this.now();
      var src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      var f = this.ctx.createBiquadFilter();
      f.type = filterType || 'bandpass';
      f.frequency.setValueAtTime(freq, t);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
      f.Q.value = q || 1;
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.02);
    },

    tone: function (freq, dur, gain, type, freqTo) {
      if (!this.ctx || this.muted) return;
      var t = this.now();
      var o = this.ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (freqTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + dur);
      var g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },

    /* --- 具体音效 --- */
    shoot: function () {
      if (!this.ctx) return;
      this.noise(0.11, 0.42, 'bandpass', 1700, 0.7, 420);
      this.tone(190, 0.10, 0.30, 'square', 60);
      this.noise(0.05, 0.22, 'highpass', 3200, 0.5);
    },

    dryFire: function () { this.tone(880, 0.04, 0.10, 'square', 400); },

    reloadOut: function () { this.tone(320, 0.07, 0.13, 'square', 180); this.noise(0.06, 0.10, 'bandpass', 900, 2); },
    reloadIn: function () { this.tone(240, 0.11, 0.16, 'square', 460); this.noise(0.07, 0.14, 'bandpass', 1400, 2); },

    hit: function () { this.tone(1500, 0.06, 0.16, 'triangle', 2100); },
    headshot: function () { this.tone(2100, 0.09, 0.20, 'square', 2800); },
    kill: function () {
      this.noise(0.35, 0.32, 'lowpass', 900, 1, 90);
      this.tone(150, 0.35, 0.22, 'sawtooth', 40);
    },

    hurt: function () {
      this.noise(0.2, 0.26, 'lowpass', 500, 1, 120);
      this.tone(110, 0.22, 0.16, 'sawtooth', 55);
    },

    jump: function () { this.noise(0.09, 0.10, 'bandpass', 700, 1.2, 1200); },
    land: function () { this.noise(0.13, 0.17, 'lowpass', 380, 1, 140); },
    step: function () { this.noise(0.055, 0.055, 'bandpass', 420, 1.4, 260); },

    enemyShoot: function () { this.tone(700, 0.10, 0.13, 'sawtooth', 220); },
    enemyCharge: function () { this.tone(420, 0.42, 0.07, 'triangle', 900); },
    spawn: function () { this.tone(180, 0.32, 0.14, 'triangle', 620); },

    pickup: function () { this.tone(760, 0.10, 0.15, 'sine', 1180); this.tone(1180, 0.14, 0.10, 'sine', 1580); },

    waveStart: function () {
      this.tone(300, 0.5, 0.14, 'triangle', 320);
      var self = this;
      setTimeout(function () { self.tone(450, 0.55, 0.12, 'triangle', 480); }, 150);
    },

    gameOver: function () {
      this.tone(300, 1.1, 0.22, 'sawtooth', 60);
      this.noise(1.0, 0.18, 'lowpass', 600, 1, 80);
    },

    uiClick: function () { this.tone(680, 0.05, 0.10, 'square', 900); }
  };

  FPS.Sound = Sound;
})(window.FPS);

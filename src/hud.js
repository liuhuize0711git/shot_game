/* =======================================================================
 * hud.js —— 界面读写：数值面板 / 击杀播报 / 增益 / 选枪界面 / 狙击镜
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Utils = FPS.Utils;

  function $(id) { return document.getElementById(id); }

  function Hud() {
    this.el = {
      hud: $('hud'),
      kills: $('uiKills'),
      deaths: $('uiDeaths'),
      bots: $('uiBots'),
      time: $('uiTime'),
      score: $('uiScore'),
      c4: $('uiC4'),
      plant: $('uiPlant'),
      plantFill: document.querySelector('.plant-fill'),
      grenades: $('uiGrenades'),
      smokes: $('uiSmokes'),
      slot4: $('slot4'),
      slot5: $('slot5'),
      slotE: $('slotE'),
      health: $('uiHealth'),
      healthFill: $('uiHealthFill'),
      ammoMag: $('uiAmmoMag'),
      ammoReserve: $('uiAmmoReserve'),
      weaponName: $('uiWeaponName'),
      ammoBox: document.querySelector('.ammo'),
      buffs: $('uiBuffs'),
      killfeed: $('uiKillfeed'),
      banner: $('uiBanner'),
      toast: $('uiToast'),
      reload: $('uiReload'),
      flash: $('uiFlash'),
      smokeScreen: $('uiSmokeScreen'),
      hit: $('hitmarker'),
      scope: $('uiScope'),
      slot1: $('slot1'),
      slot3: $('slot3'),
      speed: $('uiSpeed'),
      chT: document.querySelector('.ch-t'),
      chB: document.querySelector('.ch-b'),
      chL: document.querySelector('.ch-l'),
      chR: document.querySelector('.ch-r'),
      select: $('select'),
      selectTitle: $('selectTitle'),
      selectSub: $('selectSub'),
      cards: $('weaponCards'),
      respawnFill: $('respawnFill'),
      respawnHint: $('respawnHint')
    };
    this.cache = {};
    this.spreadPx = 0;
    this.selectedCard = null;
  }

  Hud.prototype.show = function () { this.el.hud.classList.remove('hidden'); };
  Hud.prototype.hide = function () { this.el.hud.classList.add('hidden'); };

  Hud.prototype.setHealth = function (hp, max) {
    var v = Math.ceil(hp);
    if (v !== this.cache.health) {
      this.cache.health = v;
      this.el.health.textContent = v;
      var pct = Math.max(0, Math.min(1, hp / max)) * 100;
      this.el.healthFill.style.width = pct + '%';
      this.el.healthFill.classList.toggle('warn', pct <= 55 && pct > 25);
      this.el.healthFill.classList.toggle('crit', pct <= 25);
    }
  };

  Hud.prototype.setAmmo = function (mag, size, reloading, isKnife) {
    var key = mag + '_' + (reloading ? 1 : 0) + '_' + isKnife;
    if (key !== this.cache.mag) {
      this.cache.mag = key;
      if (isKnife) {
        this.el.ammoMag.textContent = '∞';
        this.el.ammoReserve.textContent = '';
        this.el.ammoBox.classList.remove('low');
      } else {
        this.el.ammoMag.textContent = reloading ? '--' : mag;
        this.el.ammoReserve.textContent = '∞';
        this.el.ammoBox.classList.toggle('low', !reloading && mag <= Math.max(4, size * 0.2));
      }
    }
  };

  Hud.prototype.setWeaponName = function (n) {
    if (this.cache.weapon !== n) { this.cache.weapon = n; this.el.weaponName.textContent = n; }
  };

  Hud.prototype.setSpeed = function (s) {
    if (this.cache.speed !== s) { this.cache.speed = s; this.el.speed.textContent = '移速 ' + s; }
  };

  Hud.prototype.setKills = function (n) {
    if (this.cache.kills !== n) { this.cache.kills = n; this.el.kills.textContent = n; }
  };
  Hud.prototype.setDeaths = function (n) {
    if (this.cache.deaths !== n) { this.cache.deaths = n; this.el.deaths.textContent = n; }
  };
  Hud.prototype.setBots = function (n) {
    if (this.cache.bots !== n) { this.cache.bots = n; this.el.bots.textContent = n; }
  };
  Hud.prototype.setTime = function (sec) {
    var t = Utils.formatTime(sec);
    if (this.cache.time !== t) { this.cache.time = t; this.el.time.textContent = t; }
  };

  Hud.prototype.setScore = function (n) {
    if (this.cache.score !== n) { this.cache.score = n; this.el.score.textContent = n; }
  };

  /* 装备栏：当前持有的是什么 + 手雷/烟雾剩余数量 + C4 下包进度 */
  Hud.prototype.setEquip = function (info, gadgets) {
    var slots = { 1: this.el.slot1, 3: this.el.slot3, 4: this.el.slot4, 5: this.el.slot5, 9: this.el.slotE };
    var active = info.isKnife ? 3 : (info.isThrowable && info.short === '手雷' ? 4
      : (info.isThrowable ? 9 : (info.isPlantable ? 5 : 1)));
    var key = '' + active + (gadgets && gadgets.c4 ? 1 : 0);
    if (this.cache.equip !== key) {
      this.cache.equip = key;
      Object.keys(slots).forEach(function (k) {
        if (slots[k]) slots[k].classList.toggle('active', +k === active);
      });
      this.el.slot5.classList.toggle('disabled', !!(gadgets && gadgets.c4));
    }
    if (info.grenades !== undefined && this.cache.gren !== info.grenades) {
      this.cache.gren = info.grenades;
      this.el.grenades.textContent = (info.grenades === Infinity) ? '∞' : info.grenades;
    }
    if (info.smokes !== undefined && this.cache.smk !== info.smokes) {
      this.cache.smk = info.smokes;
      this.el.smokes.textContent = (info.smokes === Infinity) ? '∞' : info.smokes;
    }
    var showPlant = info.isPlantable && info.plantProgress > 0.01;
    if (this.cache.plant !== showPlant) {
      this.cache.plant = showPlant;
      this.el.plant.classList.toggle('hidden', !showPlant);
    }
    if (showPlant) this.el.plantFill.style.width = Math.min(100, info.plantProgress / 4 * 100) + '%';
  };

  /* C4 倒计时 */
  Hud.prototype.setC4 = function (c4) {
    var show = !!c4;
    if (this.cache.c4 !== show) {
      this.cache.c4 = show;
      this.el.c4.classList.toggle('hidden', !show);
    }
    if (show) {
      var t = Math.max(0, Math.ceil(c4.fuse));
      if (this.cache.c4t !== t) { this.cache.c4t = t; this.el.c4.innerHTML = 'C4 <b>' + t + '</b>s'; }
    }
  };

  Hud.prototype.setReloadHint = function (show) {
    if (show !== this.cache.reloadHint) {
      this.cache.reloadHint = show;
      this.el.reload.classList.toggle('hidden', !show);
    }
  };

  Hud.prototype.setSpread = function (spread) {
    var px = Math.round(spread * 900) + 2;
    this.spreadPx = this.spreadPx + (px - this.spreadPx) * 0.35;
    var v = this.spreadPx.toFixed(1);
    this.el.chT.style.transform = 'translateY(-' + v + 'px)';
    this.el.chB.style.transform = 'translateY(' + v + 'px)';
    this.el.chL.style.transform = 'translateX(-' + v + 'px)';
    this.el.chR.style.transform = 'translateX(' + v + 'px)';
  };

  Hud.prototype.hitMarker = function (isHead) {
    var el = this.el.hit;
    el.style.color = isHead ? '#ffc857' : '#ffffff';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  };

  Hud.prototype.damageFlash = function () {
    var el = this.el.flash;
    el.style.transition = 'none';
    el.style.opacity = '1';
    setTimeout(function () {
      el.style.transition = 'opacity 0.35s ease-out';
      el.style.opacity = '0';
    }, 30);
  };

  Hud.prototype.banner = function (text, danger) {
    var el = this.el.banner;
    el.textContent = text;
    el.classList.toggle('danger', !!danger);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  };

  Hud.prototype.toast = function (text) {
    var el = this.el.toast;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  };

  Hud.prototype.killfeed = function (text, kind) {
    var el = document.createElement('div');
    el.className = 'kill-item' + (kind ? ' ' + kind : '');
    el.textContent = text;
    this.el.killfeed.appendChild(el);
    var feed = this.el.killfeed;
    setTimeout(function () { if (el.parentNode === feed) feed.removeChild(el); }, 6500);
    while (feed.children.length > 6) feed.removeChild(feed.firstChild);
  };

  /* 增益状态条 */
  Hud.prototype.updateBuffs = function (player) {
    var keys = [
      { id: 'damage', name: '伤害', color: '#ff5470' },
      { id: 'speed', name: '移速', color: '#5fd8ff' },
      { id: 'jump', name: '跳跃', color: '#ffd166' }
    ];
    var sig = '';
    for (var i = 0; i < keys.length; i++) {
      var t = player.buffs[keys[i].id];
      if (t > 0) sig += keys[i].id + Math.ceil(t) + ',';
    }
    if (sig === this.cache.buffs) return;
    this.cache.buffs = sig;

    var html = '';
    for (var j = 0; j < keys.length; j++) {
      var tt = player.buffs[keys[j].id];
      if (tt > 0) {
        html += '<div class="buff" style="color:' + keys[j].color + '">' +
          '<span class="dot"></span>' + keys[j].name + ' ' + Math.ceil(tt) + 's</div>';
      }
    }
    this.el.buffs.innerHTML = html;
  };

  Hud.prototype.setSlots = function (activeSlot) {
    this.el.slot1.classList.toggle('active', activeSlot === 1);
    this.el.slot3.classList.toggle('active', activeSlot === 3);
  };

  Hud.prototype.setScope = function (on) {
    if (this.cache.scope !== on) {
      this.cache.scope = on;
      this.el.scope.classList.toggle('hidden', !on);
    }
  };

  /* 在烟雾里的视野遮挡 */
  Hud.prototype.setSmokeScreen = function (v) {
    v = Math.max(0, Math.min(1, v));
    if (Math.abs((this.cache.smoke || 0) - v) < 0.02) return;
    this.cache.smoke = v;
    this.el.smokeScreen.style.opacity = v.toFixed(2);
  };

  /* ---------------------------------------------------------- 选枪界面 */
  Hud.prototype.buildWeaponCards = function (list, onSelect, onHover) {
    var self = this;
    this.el.cards.innerHTML = '';
    list.forEach(function (def, index) {
      var card = document.createElement('div');
      card.className = 'wcard';
      card.innerHTML =
        '<span class="wkey">' + (index + 1) + '</span>' +
        '<div class="wname">' + def.name + '</div>' +
        '<div class="wsub">' + def.short + '</div>' +
        '<div class="wstat"><span>弹匣</span><span>' + def.mag + ' 发</span></div>' +
        '<div class="wstat"><span>移速</span><span>' + def.speed + '</span></div>' +
        '<div class="wstat"><span>单发伤害</span><span>' + def.damage + '</span></div>' +
        '<div class="wdesc">' + def.desc + '</div>';
      card.addEventListener('click', function () { onSelect(def, index); });
      card.addEventListener('mouseenter', function () { if (onHover) onHover(def, index); });
      self.el.cards.appendChild(card);
    });
    this.cards = this.el.cards.querySelectorAll('.wcard');
  };

  Hud.prototype.selectCard = function (index) {
    if (!this.cards) return;
    for (var i = 0; i < this.cards.length; i++) {
      this.cards[i].classList.toggle('selected', i === index);
    }
  };

  Hud.prototype.showSelect = function (title, sub) {
    this.el.selectTitle.textContent = title || '选 择 主 武 器';
    this.el.selectSub.textContent = sub || '数字键 1-4 选择，或点击卡片；匕首随时可用（按 3）';
    this.el.select.classList.remove('hidden');
  };
  Hud.prototype.hideSelect = function () { this.el.select.classList.add('hidden'); };

  Hud.prototype.setRespawnProgress = function (p) {
    this.el.respawnFill.style.width = Math.round(Utils.clamp(p, 0, 1) * 100) + '%';
  };
  Hud.prototype.setRespawnHint = function (text) { this.el.respawnHint.textContent = text; };

  /* 菜单里的武器一览 */
  Hud.prototype.renderWeaponPreview = function (list) {
    var el = document.getElementById('weaponPreview');
    if (!el) return;
    var html = '';
    list.forEach(function (def) {
      html += '<div class="wp-item"><b>' + def.name + '</b>' +
        '弹匣 ' + def.mag + '<br><span>移速 ' + def.speed + ' · 伤害 ' + def.damage + '</span></div>';
    });
    el.innerHTML = html;
  };

  FPS.Hud = Hud;
})(window.FPS);

/* =======================================================================
 * main.js —— 主控：输入 / 状态机 / 复活选枪 / 设置 / 主循环
 *
 * 状态：menu → select(选枪) → playing → dying → select → playing …
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Utils = FPS.Utils, Sound = FPS.Sound;

  var KEY_FORWARD = ['KeyW', 'ArrowUp'];
  var KEY_BACK = ['KeyS', 'ArrowDown'];
  var KEY_LEFT = ['KeyA', 'ArrowLeft'];
  var KEY_RIGHT = ['KeyD', 'ArrowRight'];

  function Game() {
    this.state = 'menu';
    this.settings = {
      sensitivity: 1, smoothing: 0.5, volume: 0.5, fov: 78, bots: 8,
      minimapBots: false, lowQuality: false, allowFly: false
    };
    this.keys = {};
    this.crouchToggle = false;
    this.prevJump = false;
    this.fireHeld = false;
    this.prevFire = false;
    this.adsHeld = false;
    this.shootTargets = [];
    this.deathTimer = 0;
    this.selectTimer = 0;
    this.selectDuration = 6;
    this.stats = { kills: 0, deaths: 0, score: 0 };
    this.lastDamageType = null;
    this.suppressPause = false;
    this.inspectPressed = false;
    this.lastLockAttempt = 0;
    this.minimapTimer = 0;
    this.guns = FPS.WEAPONS ? FPS.WEAPONS.filter(function (w) { return !w.melee; }) : [];
  }

  /* ==================================================================== 初始化 */
  Game.prototype.init = function () {
    var self = this;
    this.canvas = document.getElementById('game');

    var params = new URLSearchParams(location.search);
    this.autoStart = params.has('auto');
    this.practice = params.has('practice');
    if (params.has('lite')) this.settings.lowQuality = true;
    if (params.has('fly')) this.settings.allowFly = true;

    this.debugSpawn = null;
    this._params = params;
    this.debugFly = params.has('fly');

    // 先读取本地设置，再创建渲染器（低配模式要影响阴影开关）
    try {
      var raw = localStorage.getItem('fps-game-settings-v2');
      if (raw) this.settings = Object.assign(this.settings, JSON.parse(raw));
    } catch (e) {}
    if (params.has('lite')) this.settings.lowQuality = true;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !this.settings.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 500);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.01, 20);
    this.viewScene.add(this.viewCamera);
    this.viewScene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a2028, 1.35));
    var viewDir = new THREE.DirectionalLight(0xffffff, 0.9);
    viewDir.position.set(1.4, 2.0, 1.6);
    viewDir.target.position.set(0, 0, -0.6);
    this.viewScene.add(viewDir);
    this.viewScene.add(viewDir.target);

    this.world = new FPS.World().build(this.scene);
    this.nav = new FPS.NavGrid(this.world);
    this._parseDebugSpawn();
    this.effects = new FPS.Effects(this.scene);
    this.player = new FPS.Player(this.camera, this.world);
    this.weapon = new FPS.WeaponSystem(this.camera, this.viewCamera, this.viewScene, this.world, this.effects);
    this.enemies = new FPS.EnemyManager(this.scene, this.world, this.nav, this.effects);
    this.pickups = new FPS.PickupManager(this.scene, this.world, this.effects);
    this.gadgets = new FPS.GadgetManager(this.scene, this.world, this.effects);
    this.minimap = new FPS.Minimap(document.getElementById('minimap'), this.world);
    this.hud = new FPS.Hud();

    this.enemies.pickups = this.pickups;
    this.enemies.gadgets = this.gadgets;
    this.weapon.gadgets = this.gadgets;
    this.gadgets.onExplode = function (pos, radius, centerDmg, edgeDmg) {
      self.applyExplosion(pos, radius, centerDmg, edgeDmg);
    };
    this.gadgets.onC4Change = function (c4, byDeath) {
      if (c4) {
        self.hud.killfeed('C4 已放置！60 秒后爆炸');
        self.hud.banner('C4 已放置', true);
        // 所有机器人都知道玩家位置
        for (var i = 0; i < self.enemies.squads.length; i++) {
          self.enemies.squads[i].alert(self.player.pos, null);
          self.enemies.squads[i].alertTimer = 60;
        }
      } else if (!byDeath) {
        self.addScore(1000);
        self.hud.banner('C4 爆炸 · +1000 分', false);
      } else {
        self.hud.killfeed('你已阵亡，C4 消失');
      }
    };
    this.weapon.getTargets = function () { return self.shootTargets; };

    this.wireCallbacks();
    this.loadSettings();
    this.bindEvents();
    this.setupWeaponUI();

    this.scene.updateMatrixWorld(true);
    this.player.update(0.0001, { forward: 0, right: 0, jumpPressed: false, crouch: false, sprint: false });

    this.hud.setWeaponName(this.weapon.def.name);
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);

    if (this.autoStart) this.start();
    else this.showMenu();

    requestAnimationFrame(this.loop);
  };

  /* 调试用：?spawn=列,行&yaw=角度 —— 把出生点临时换到指定格子（截图/测试用） */
  Game.prototype._parseDebugSpawn = function () {
    var params = this._params;
    var sp = params && params.get ? params.get('spawn') : null;
    if (!sp) return;
    var parts = sp.split(',');
    var col = parseFloat(parts[0]), row = parseFloat(parts[1]);
    var height = parts.length > 2 ? parseFloat(parts[2]) : null;
    if (!isFinite(col) || !isFinite(row)) return;
    var wp = this.world.tileToWorld(col, row);
    var yawDeg = params.has('yaw') ? parseFloat(params.get('yaw')) : null;
    this.debugSpawn = {
      x: wp.x, z: wp.z, y: (height !== null && isFinite(height)) ? height : null,
      yaw: (yawDeg === null || !isFinite(yawDeg)) ? null : (yawDeg * Math.PI / 180)
    };
  };

  /* ==================================================================== 回调 */
  Game.prototype.wireCallbacks = function () {
    var self = this;

    this.weapon.onHit = function (enemy, isHead) {
      self.hud.hitMarker(isHead);
      if (isHead) Sound.headshot(); else Sound.hit();
    };
    this.weapon.onSwitch = function (def) {
      self.hud.setWeaponName(def.name);
      self.hud.setSpeed(def.speed);
      self.hud.setSlots(def.melee ? 3 : 1);
    };

    this.enemies.onKill = function (bot, isHead) {
      self.stats.kills++;
      self.addScore(isHead ? 75 : 50);          // 击杀机器人得分
      self.hud.killfeed('你 [' + self.weapon.def.short + '] 击杀 ' + bot.type.name + (isHead ? ' · 爆头' : ''),
        isHead ? 'head' : '');
      self.hud.toast('+' + (isHead ? 75 : 50) + ' 分');
    };
    this.enemies.onPlayerDamage = function (dmg, typeId) {
      self.lastDamageType = typeId;
      self.hud.damageFlash();
    };
    this.enemies.onPlayerKilled = function () { self.onPlayerDeath(); };

    this.pickups.onPickup = function (type, healed) {
      if (type.id === 'heal') {
        self.hud.killfeed('拾取 医疗包 +' + Math.round(healed) + ' HP');
        self.hud.toast('+' + Math.round(healed) + ' 生命值');
      } else {
        self.hud.killfeed('拾取 ' + type.name + '（' + type.duration + ' 秒）');
        self.hud.toast(type.desc);
      }
    };
  };

  /* ==================================================================== 输入 */
  Game.prototype.bindEvents = function () {
    var self = this;

    window.addEventListener('resize', function () {
      self.camera.aspect = window.innerWidth / window.innerHeight;
      self.camera.updateProjectionMatrix();
      self.viewCamera.aspect = self.camera.aspect;
      self.viewCamera.updateProjectionMatrix();
      self.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('keydown', function (e) {
      if (e.repeat) {
        if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
        return;
      }
      self.keys[e.code] = true;
      if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();

      if (self.state === 'select') {
        var digits = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
        var idx = digits.indexOf(e.code);
        if (idx >= 0 && idx < self.guns.length) self.chooseWeapon(idx);
        return;
      }

      if (self.state === 'playing' || self.state === 'dying') {
        if (e.code === 'KeyR') self.weapon.startReload();
        if (e.code === 'KeyC') self.crouchToggle = !self.crouchToggle;
        if (e.code === 'Digit1') self.weapon.selectSlot(1);
        if (e.code === 'Digit3') self.weapon.selectSlot(3);
        if (e.code === 'Digit4') self.weapon.selectSlot(4);
        if (e.code === 'Digit5') self.weapon.selectSlot(5);
        if (e.code === 'KeyE') self.weapon.selectSlot(9);
        if (e.code === 'KeyF') self.inspectPressed = true;
        if (e.code === 'KeyQ') {
          var flying = self.player.toggleFly();
          self.hud.toast(flying ? '飞行开启：按住空格上升' : '飞行关闭');
        }
      }
    });

    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
      if (e.code === 'KeyF') self.inspectPressed = false;
    });

    window.addEventListener('blur', function () {
      self.keys = {};
      self.fireHeld = false;
      self.adsHeld = false;
    });

    document.addEventListener('mousemove', function (e) {
      if (self.state !== 'playing') return;
      if (document.pointerLockElement !== self.canvas) return;
      // 机瞄/开镜时按视野比例降低灵敏度，手感更自然
      var fovRatio = Math.max(0.25, self.camera.fov / self.settings.fov);
      var sens = self.settings.sensitivity * fovRatio;
      self.player.look(e.movementX || 0, e.movementY || 0, sens);
      self.weapon.onLookInput(e.movementX || 0, e.movementY || 0);
    });

    this.canvas.addEventListener('mousedown', function (e) {
      if (self.state !== 'playing') return;
      if (document.pointerLockElement !== self.canvas) { self.requestLock(); return; }
      if (e.button === 0) { self.fireHeld = true; e.preventDefault(); }
      if (e.button === 2) { self.adsHeld = true; e.preventDefault(); }
    });

    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) self.fireHeld = false;
      if (e.button === 2) self.adsHeld = false;
    });

    this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.addEventListener('pointerlockchange', function () {
      var locked = document.pointerLockElement === self.canvas;
      if (!locked && self.state === 'playing' && self.wasLocked && !self.suppressPause) {
        self.pause();
      }
      self.wasLocked = locked;
      self.suppressPause = false;
    });

    document.addEventListener('pointerlockerror', function () {
      self.hud.toast('鼠标锁定失败，请再点一次画面');
    });

    document.getElementById('btnStart').addEventListener('click', function () { self.start(); });
    document.getElementById('btnResume').addEventListener('click', function () { self.resume(); });
    document.getElementById('btnRestart1').addEventListener('click', function () { self.start(); });

    function bindRange(id, outId, apply, fmt) {
      var el = document.getElementById(id);
      var out = document.getElementById(outId);
      el.addEventListener('input', function () {
        var v = parseFloat(el.value);
        out.textContent = fmt ? fmt(v) : v;
        apply(v);
        self.saveSettings();
      });
    }
    bindRange('setSens', 'outSens', function (v) { self.settings.sensitivity = v; }, function (v) { return v.toFixed(2); });
    bindRange('setSmooth', 'outSmooth', function (v) {
      self.settings.smoothing = v;
      self.player.turnSmoothing = v;
    }, function (v) { return v.toFixed(2); });
    bindRange('setVol', 'outVol', function (v) {
      self.settings.volume = v / 100;
      Sound.setVolume(self.settings.volume);
    }, function (v) { return v; });
    bindRange('setFov', 'outFov', function (v) {
      self.settings.fov = v;
      if (self.weapon.ads < 0.5) {
        self.camera.fov = v;
        self.camera.updateProjectionMatrix();
      }
    }, function (v) { return v; });
    bindRange('setBots', 'outBots', function (v) {
      self.settings.bots = v;
      self.enemies.setMaxBots(v);
    }, function (v) { return v; });

    document.getElementById('setMinimapBots').addEventListener('change', function (e) {
      self.settings.minimapBots = e.target.checked;
      self.minimap.showBots = e.target.checked;
      self.saveSettings();
    });

    document.getElementById('setFly').addEventListener('change', function (e) {
      self.settings.allowFly = e.target.checked;
      self.player.allowFly = e.target.checked;
      if (!e.target.checked) self.player.flying = false;
      self.saveSettings();
    });

    document.getElementById('setLowQ').addEventListener('change', function (e) {
      self.settings.lowQuality = e.target.checked;
      self.applyQuality();
      self.saveSettings();
    });
  };

  /* 低配模式：关闭阴影并强制刷新材质 */
  Game.prototype.applyQuality = function () {
    var on = !this.settings.lowQuality;
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse(function (o) {
      if (!o.material) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      for (var i = 0; i < mats.length; i++) mats[i].needsUpdate = true;
    });
  };

  Game.prototype.readInput = function () {
    var k = this.keys, self = this;
    function any(codes) { for (var i = 0; i < codes.length; i++) if (k[codes[i]]) return true; return false; }

    var jump = !!k['Space'];
    var fire = !!this.fireHeld;
    this.input = {
      forward: (any(KEY_FORWARD) ? 1 : 0) - (any(KEY_BACK) ? 1 : 0),
      right: (any(KEY_RIGHT) ? 1 : 0) - (any(KEY_LEFT) ? 1 : 0),
      jump: jump,
      jumpPressed: jump && !this.prevJump,
      // Shift 与 Ctrl 都是下蹲（按需求把 Shift 改成下蹲）
      crouch: !!(k['ControlLeft'] || k['ControlRight'] || k['ShiftLeft'] || k['ShiftRight']) || this.crouchToggle,
      sprint: true,                      // 前进时自动疾跑
      fire: fire,
      firePressed: fire && !this.prevFire,
      ads: !!this.adsHeld,
      inspect: !!this.inspectPressed
    };
    this.prevJump = jump;
    this.prevFire = fire;
    void self;
  };

  /* ==================================================================== 流程 */
  Game.prototype.showMenu = function () {
    this.state = 'menu';
    this.hud.hide();
    this.hud.hideSelect();
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('pause').classList.add('hidden');
  };

  Game.prototype.addScore = function (n) {
    this.stats.score += n;
    this.hud.setScore(this.stats.score);
  };

  /* 范围爆炸伤害：中心伤害最高，向边缘递减到 edgeDamage（默认 0） */
  Game.prototype.applyExplosion = function (pos, radius, centerDamage, edgeDamage) {
    var self = this;
    edgeDamage = edgeDamage || 0;
    function dmgAt(dist) {
      if (dist >= radius) return 0;
      return Utils.lerp(centerDamage, edgeDamage, dist / radius);
    }
    var i;
    for (i = 0; i < this.enemies.bots.length; i++) {
      var b = this.enemies.bots[i];
      if (b.dead) continue;
      var d = b.root.position.distanceTo(pos);
      var dmg = dmgAt(d);
      if (dmg > 0) {
        var dir = new THREE.Vector3().subVectors(b.root.position, pos).normalize();
        b.takeDamage(dmg, pos.clone(), dir, false, this.player);
      }
    }
    var pd = this.player.pos.distanceTo(pos);
    var pdmg = dmgAt(pd);
    if (pdmg > 0 && !this.player.dead) {
      this.player.takeDamage(pdmg, null);
      this.hud.damageFlash();
      if (this.player.dead) this.onPlayerDeath();
    }
    void self;
  };

  Game.prototype.start = function () {
    Sound.init();
    Sound.resume();
    Sound.setVolume(this.settings.volume);
    Sound.uiClick();

    this.keys = {};
    this.crouchToggle = false;
    this.fireHeld = false;
    this.adsHeld = false;
    this.stats.kills = 0;
    this.stats.deaths = 0;
    this.stats.score = 0;

    this.effects.clear();
    this.gadgets.reset();
    this.player.reset();
    this.enemies.setMaxBots(this.settings.bots);
    this.enemies.reset();
    this.pickups.reset();
    this.weapon.setPrimary(this.weapon.primaryId, true);

    if (this.practice) {
      this.enemies.running = false;
      this.pickups.interval = 12;
    }

    document.getElementById('menu').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    this.hud.show();
    this.hud.setKills(0);
    this.hud.setDeaths(0);
    this.hud.setScore(0);
    this.hud.setBots(this.practice ? 0 : this.settings.bots);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setWeaponName(this.weapon.def.name);
    this.hud.setSpeed(this.weapon.def.speed);
    this.hud.setSlots(1);
    this.hud.killfeed('进入战场：出生点');

    this.openSelect(true);
    // 调试用：?auto=1 直接按上次的武器复活，跳过选枪等待
    if (this.autoStart) this.chooseWeapon(this.lastWeaponIndex || 0);
  };

  Game.prototype.openSelect = function (first) {
    this.state = 'select';
    this.selectTimer = this.selectDuration;
    this.suppressPause = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.showSelect(
      first ? '选 择 主 武 器' : '你 被 击 杀 · 选 择 主 武 器',
      '数字键 1-4 选择，或点击卡片；匕首随时可用（按 3）'
    );
    this.hud.selectCard(this.lastWeaponIndex || 0);
  };

  Game.prototype.chooseWeapon = function (index) {
    var def = this.guns[index];
    if (!def) return;
    this.lastWeaponIndex = index;
    this.weapon.setPrimary(def.id, true);
    this.hud.selectCard(index);
    this.respawnPlayer();
  };

  Game.prototype.respawnPlayer = function () {
    this.player.respawn(false);
    if (this.debugSpawn) {
      var d = this.debugSpawn;
      this.player.pos.set(d.x, d.y !== null ? d.y : this.world._settleY(d.x, d.z), d.z);
      this.player.vel.set(0, 0, 0);
      if (d.yaw !== null) this.player.yaw = this.player.yawTarget = d.yaw;
      if (this.debugFly) { this.player.flying = true; }
    }
    this.weapon.reset();
    this.hud.hideSelect();
    this.hud.setWeaponName(this.weapon.def.name);
    this.hud.setSpeed(this.weapon.def.speed);
    this.hud.setSlots(1);
    this.hud.banner('复 活', false);
    this.state = 'playing';
    this.requestLock();
  };

  Game.prototype.onPlayerDeath = function () {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.deathTimer = 2.2;
    this.stats.deaths++;
    // 玩家阵亡 -> 已放置的 C4 直接消失（不会爆炸）
    if (this.gadgets.c4) this.gadgets.removeC4(true);
    this.fireHeld = false;
    this.adsHeld = false;
    Sound.gameOver();
    var killer = this.lastDamageType && FPS.BOT_TYPES[this.lastDamageType]
      ? FPS.BOT_TYPES[this.lastDamageType].name : '敌人';
    this.hud.killfeed(killer + ' 击杀 你', 'killed');
  };

  Game.prototype.pause = function () {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.fireHeld = false;
    this.adsHeld = false;
    document.getElementById('pause').classList.remove('hidden');
    if (document.pointerLockElement) {
      this.suppressPause = true;
      document.exitPointerLock();
    }
  };

  Game.prototype.resume = function () {
    if (this.state !== 'paused') return;
    document.getElementById('pause').classList.add('hidden');
    this.state = 'playing';
    Sound.resume();
    this.requestLock();
    var self = this;
    setTimeout(function () {
      if (self.state === 'playing' && document.pointerLockElement !== self.canvas) {
        self.hud.toast('点击画面中心即可锁定鼠标');
      }
    }, 400);
  };

  Game.prototype.requestLock = function () {
    var now = performance.now();
    if (now - this.lastLockAttempt < 200) return;
    this.lastLockAttempt = now;
    try {
      var p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (err) { /* 浏览器冷却期内会抛错，忽略 */ }
  };

  /* ==================================================================== 设置 */
  Game.prototype.setupWeaponUI = function () {
    var self = this;
    this.hud.renderWeaponPreview(FPS.WEAPONS);
    this.hud.buildWeaponCards(this.guns, function (def, index) {
      if (self.state === 'select') self.chooseWeapon(index);
    });
  };

  Game.prototype.loadSettings = function () {
    try {
      var raw = localStorage.getItem('fps-game-settings-v2');
      if (raw) this.settings = Object.assign(this.settings, JSON.parse(raw));
    } catch (e) {}
    var s = this.settings;
    document.getElementById('setSens').value = s.sensitivity;
    document.getElementById('outSens').textContent = Number(s.sensitivity).toFixed(2);
    document.getElementById('setSmooth').value = s.smoothing;
    document.getElementById('outSmooth').textContent = Number(s.smoothing).toFixed(2);
    document.getElementById('setVol').value = Math.round(s.volume * 100);
    document.getElementById('outVol').textContent = Math.round(s.volume * 100);
    document.getElementById('setFov').value = s.fov;
    document.getElementById('outFov').textContent = s.fov;
    document.getElementById('setBots').value = s.bots;
    document.getElementById('outBots').textContent = s.bots;
    document.getElementById('setMinimapBots').checked = !!s.minimapBots;
    document.getElementById('setLowQ').checked = !!s.lowQuality;
    document.getElementById('setFly').checked = !!s.allowFly;

    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.player.turnSmoothing = s.smoothing;
    this.player.allowFly = !!s.allowFly;
    this.enemies.setMaxBots(s.bots);
    this.minimap.showBots = !!s.minimapBots;
    Sound.setVolume(s.volume);
  };

  Game.prototype.saveSettings = function () {
    try { localStorage.setItem('fps-game-settings-v2', JSON.stringify(this.settings)); } catch (e) {}
  };

  /* ==================================================================== 主循环 */
  Game.prototype.loop = function (now) {
    requestAnimationFrame(this.loop);
    var dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    var active = (this.state === 'playing' || this.state === 'dying' || this.state === 'select');
    if (active) this.update(dt);

    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.viewScene, this.viewCamera);
    this.renderer.autoClear = true;
  };

  Game.prototype.update = function (dt) {
    this.readInput();
    var playing = this.state === 'playing';
    var i;

    // 本帧射击目标 = 场景实体 + 机器人命中盒
    this.shootTargets.length = 0;
    for (i = 0; i < this.world.meshes.length; i++) this.shootTargets.push(this.world.meshes[i]);
    for (i = 0; i < this.enemies.hitMeshes.length; i++) this.shootTargets.push(this.enemies.hitMeshes[i]);

    if (playing && !this.player.dead) {
      this.player.update(dt, this.input);
      this.weapon.update(dt, this.player, this.input);
    } else {
      if (this.player.dead) this.updateDeath(dt);
      this.weapon.update(dt, this.player, { fire: false, firePressed: false, ads: false });
    }

    this.enemies.update(dt, this.player, this.camera);
    this.pickups.update(dt, this.player);
    this.gadgets.update(dt, this.player);
    this.effects.update(dt);

    // 开镜：改变主相机视野 + 显示镜筒
    var targetFov = this.weapon.adsFov(this.settings.fov);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
    this.hud.setScope(this.weapon.isScoped());
    // 玩家在烟雾里 -> 视野被灰白浓烟挡住
    this.hud.setSmokeScreen(this.gadgets.smokeDensityAt(this.camera.position, 0) * 1.15);

    // 死亡 → 选枪
    if (this.state === 'dying') {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.openSelect(false);
    } else if (this.state === 'select') {
      this.selectTimer -= dt;
      this.hud.setRespawnProgress(1 - this.selectTimer / this.selectDuration);
      this.hud.setRespawnHint(Math.ceil(Math.max(0, this.selectTimer)) + ' 秒后自动复活');
      if (this.selectTimer <= 0) this.chooseWeapon(this.lastWeaponIndex || 0);
    }

    this.updateHud(dt);

    // 小地图刷新（限制频率，省性能）
    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.05;
      this.minimap.draw(this.player, this.pickups, this.enemies, this.enemies.elapsed);
    }
  };

  Game.prototype.updateDeath = function (dt) {
    var p = this.player;
    p.pitchTarget = Utils.damp(p.pitchTarget, -0.42, 2.0, dt);
    p.pitch = Utils.damp(p.pitch, p.pitchTarget, 12, dt);
    p.height = Utils.damp(p.height, 0.72, 2.0, dt);
    p.vel.y -= 22 * dt;
    p.ctx.height = p.height;
    p.ctx.grounded = false;
    FPS.Collide.moveAxis(p.pos, p.vel.y * dt, 'y', p.ctx);
    if (p.ctx.grounded) p.vel.y = 0;
    p.shake = Utils.damp(p.shake, 0, 3, dt);
    p.camera.position.set(p.pos.x, p.pos.y + p.eyeHeight(), p.pos.z);
    p.camera.rotation.set(p.pitch, p.yaw, 0.32);
  };

  Game.prototype.updateHud = function (dt) {
    var p = this.player, w = this.weapon;
    var info = w.hudInfo();
    this.hud.setHealth(p.health, p.maxHealth);
    this.hud.setAmmo(info.mag, info.magSize, info.reloading, info.isKnife);
    this.hud.setWeaponName(info.name);
    this.hud.setSpeed(info.speed);
    this.hud.setSlots(info.isKnife ? 3 : 1);
    this.hud.setKills(this.stats.kills);
    this.hud.setDeaths(this.stats.deaths);
    this.hud.setScore(this.stats.score);
    this.hud.setBots(this.enemies.running ? this.enemies.bots.length : 0);
    this.hud.setTime(this.enemies.elapsed);
    this.hud.setEquip(info, this.gadgets);
    this.hud.setC4(this.gadgets.c4);
    this.hud.setSpread(w.currentSpread() + (info.isKnife ? 0 : 0));
    this.hud.setReloadHint(!info.isKnife && info.mag <= Math.max(3, info.magSize * 0.15) && !info.reloading && !p.dead);
    this.hud.updateBuffs(p);
  };

  /* ==================================================================== 启动 */
  function boot() {
    var game = new Game();
    window.__game = game;
    try {
      game.init();
    } catch (err) {
      console.error(err);
      var msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'background:#05070c;color:#ff5470;font:14px/1.7 monospace;padding:40px;text-align:center;z-index:99';
      msg.textContent = '初始化失败：' + (err && err.message ? err.message : err) + '（请用 Chrome/Edge 打开）';
      document.body.appendChild(msg);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.FPS);

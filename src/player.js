/* =======================================================================
 * player.js —— 第一人称玩家：丝滑转向 / 移动 / 跳跃 / 下蹲 / 复活 / 增益
 *
 * 转向手感说明：
 *   鼠标输入先累加到 yawTarget/pitchTarget（目标朝向），相机每帧用指数平滑
 *   逼近目标朝向。这样既不会有明显延迟，又不会因为帧率抖动而"突然一顿"。
 *   平滑强度可以在暂停菜单里调（转向平滑）。
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var Utils = FPS.Utils, Collide = FPS.Collide, Sound = FPS.Sound;

  var BASE_SPEED = 6.5;          // 移速系数 100 对应的速度（m/s）
  var SPRINT_MUL = 1.22;         // 疾跑倍率
  var CROUCH_MUL = 0.48;         // 下蹲倍率
  var GROUND_ACCEL_LAMBDA = 15;  // 地面加速响应
  var GROUND_STOP_LAMBDA = 17;   // 松手减速响应
  var AIR_LAMBDA = 2.4;          // 空中控制
  var GRAVITY = 22;
  var JUMP_VELOCITY = 7.1;
  var STEP_HEIGHT = 0.46;
  var FLY_UP = 7.5;         // 飞行时上升速度
  var FLY_DOWN = 3.6;       // 飞行时松开空格的下落速度

  function Player(camera, world) {
    this.camera = camera;
    this.world = world;

    this.pos = new THREE.Vector3(world.playerSpawn.x, world.playerSpawn.y, world.playerSpawn.z);
    this.vel = new THREE.Vector3();

    this.yaw = 0;          // 平滑后的朝向（相机使用）
    this.pitch = 0;
    this.yawTarget = 0;    // 鼠标输入累积的目标朝向
    this.pitchTarget = 0;
    this.turnSmoothing = 0.5;   // 0 = 完全跟手，1 = 非常顺滑

    this.radius = 0.36;
    this.standHeight = 1.8;
    this.crouchHeight = 1.15;
    this.height = this.standHeight;

    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.crouching = false;
    this.wasOnGround = true;

    this.bobPhase = 0;
    this.bobAmount = 0;
    this.airCrouchTimer = 0;
    this.stepTimer = 0;
    this.landKick = 0;
    this.jumpKick = 0;
    this.stepSmooth = 0;      // 上台阶时的平滑偏移
    this.landDip = 0;

    this.maxHealth = 100;
    this.health = 100;
    this.regenDelay = 0;
    this.dead = false;
    this.invuln = 0;          // 复活保护

    this.shake = 0;
    this.speed = 0;
    this.flying = false;          // 飞行状态（需要设置里打开）
    this.allowFly = false;
    this.airCrouchBoost = false;
    this.moveSpeedRatio = 0.8;  // 由当前武器决定（步枪 0.8 / 刀 1.5 …）
    this.buffs = { damage: 0, speed: 0, jump: 0 };

    this._wish = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._eye = new THREE.Vector3();

    this.ctx = {
      radius: this.radius,
      height: this.height,
      colliders: world.colliders,
      stepHeight: STEP_HEIGHT,
      stepped: false,
      grounded: false,
      hitCeiling: false
    };

    this.camera.rotation.order = 'YXZ';
  }

  /* ------------------------------------------------------------ 复活 / 重置 */
  Player.prototype.reset = function () {
    this.respawn(true);
  };

  Player.prototype.respawn = function (full) {
    var s = this.world.playerSpawn;
    this.pos.set(s.x, s.y, s.z);
    this.vel.set(0, 0, 0);
    // 出生朝向由地图决定（面向地图内部）
    this.yaw = this.yawTarget = this.world.playerSpawnYaw || 0;
    this.pitch = this.pitchTarget = 0;
    this.height = this.standHeight;
    this.health = this.maxHealth;
    this.dead = false;
    this.regenDelay = 0;
    this.shake = 0;
    this.landKick = 0;
    this.jumpKick = 0;
    this.stepSmooth = 0;
    this.bobAmount = 0;
    this.invuln = 2.0;
    this.flying = false;
    this.airCrouchBoost = false;
    // 复活后增益清空（full 参数保留给未来扩展）
    this.buffs.damage = this.buffs.speed = this.buffs.jump = 0;
    void full;
  };

  /* ------------------------------------------------------------ 输入 */
  Player.prototype.look = function (dx, dy, sens) {
    var s = 0.0022 * sens;
    this.yawTarget -= dx * s;
    this.pitchTarget -= dy * s;
    this.pitchTarget = Utils.clamp(this.pitchTarget, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  };

  Player.prototype.addRecoil = function (pitchKick, yawKick) {
    this.pitchTarget = Utils.clamp(this.pitchTarget + pitchKick, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
    this.yawTarget += yawKick;
  };

  Player.prototype.takeDamage = function (amount, fromDir) {
    if (this.dead || this.invuln > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.regenDelay = 5;
    this.shake = Math.min(1.2, this.shake + amount * 0.02);
    Sound.hurt();
    if (this.health <= 0) { this.dead = true; return true; }
    return false;
  };

  Player.prototype.heal = function (amount) {
    var before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  };

  Player.prototype.eyeHeight = function () {
    return this.height - 0.25;
  };

  Player.prototype.speedMultiplier = function () {
    var m = this.moveSpeedRatio;
    if (this.adsSpeedMul) m *= this.adsSpeedMul;      // 机瞄/开镜减速
    if (this.buffs.speed > 0) m *= 1.4;
    return m;
  };

  /* 伤害强化：命中伤害倍率 */
  Player.prototype.damageMultiplier = function () {
    return this.buffs.damage > 0 ? 1.6 : 1;
  };

  /* 开关飞行（需要设置里允许） */
  Player.prototype.toggleFly = function () {
    if (!this.allowFly || this.dead) return false;
    this.flying = !this.flying;
    if (this.flying) this.vel.y = Math.max(this.vel.y, 0.5);
    return this.flying;
  };

  /* ------------------------------------------------------------ 每帧更新 */
  Player.prototype.update = function (dt, input) {
    var moving = 0;

    /* ---- 转向平滑：相机朝向指数逼近目标朝向 ---- */
    // 快速甩枪时用更高的跟随速度，避免出现"跟不上→突然追上来"的卡顿感
    var turnDelta = Math.abs(this.yawTarget - this.yaw) + Math.abs(this.pitchTarget - this.pitch);
    var lambda = Utils.lerp(190, 14, Utils.clamp(this.turnSmoothing, 0, 1)) +
      Math.min(420, turnDelta * 620);
    this.yaw = Utils.damp(this.yaw, this.yawTarget, lambda, dt);
    this.pitch = Utils.damp(this.pitch, this.pitchTarget, lambda, dt);

    /* ---- 下蹲：目标身高 + 平滑过渡 ---- */
    var wantCrouch = input.crouch;
    var targetHeight = wantCrouch ? this.crouchHeight : this.standHeight;
    if (!wantCrouch && this.height < this.standHeight - 0.01) {
      var probe = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
      if (Collide.overlapsAny(this.world.colliders, probe, this.radius, this.standHeight)) {
        targetHeight = this.crouchHeight;   // 头顶有东西，站不起来
      }
    }
    this.height = Utils.damp(this.height, targetHeight, 11, dt);
    this.crouching = this.height < this.standHeight - 0.15;

    /* ---- 期望移动方向 ---- */
    this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this._wish.set(0, 0, 0)
      .addScaledVector(this._fwd, input.forward)
      .addScaledVector(this._right, input.right);
    var wishLen = this._wish.length();
    if (wishLen > 0.001) {
      this._wish.multiplyScalar(1 / wishLen);
      moving = 1;
    } else {
      this._wish.set(0, 0, 0);
    }

    var sprinting = input.sprint && !this.crouching && input.forward > 0.1;
    var maxSpeed = BASE_SPEED * this.speedMultiplier();
    if (this.crouching) maxSpeed *= CROUCH_MUL;
    else if (sprinting) maxSpeed *= SPRINT_MUL;

    /* ---- 水平速度 ---- */
    if (this.onGround) {
      var lambdaMove = moving ? GROUND_ACCEL_LAMBDA : GROUND_STOP_LAMBDA;
      this.vel.x = Utils.damp(this.vel.x, this._wish.x * maxSpeed, lambdaMove, dt);
      this.vel.z = Utils.damp(this.vel.z, this._wish.z * maxSpeed, lambdaMove, dt);
    } else if (moving) {
      var airTarget = Math.max(this.speed, maxSpeed);
      this.vel.x = Utils.damp(this.vel.x, this._wish.x * airTarget, AIR_LAMBDA, dt);
      this.vel.z = Utils.damp(this.vel.z, this._wish.z * airTarget, AIR_LAMBDA, dt);
    }

    /* ---- 跳跃：土狼时间 + 输入缓冲 + 起跳/落地缓冲 ---- */
    if (this.onGround) this.coyote = 0.12; else this.coyote -= dt;
    if (input.jumpPressed) this.jumpBuffer = 0.14; else this.jumpBuffer -= dt;

    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.dead) {
      var jumpV = JUMP_VELOCITY * (this.buffs.jump > 0 ? 1.42 : 1);
      if (input.crouch) jumpV *= 1.18;          // 跳蹲：蹲着起跳能跳更高
      this.vel.y = jumpV;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpKick = 0.085;
      this.airCrouchBoost = false;     // 本次跳跃的"跳蹲加成"还没用过
      this.airCrouchTimer = 0.35;
      Sound.jump();
    }

    // 起跳后 0.35 秒内按下蹲 -> 空中再给一次小上推（跳蹲）
    if (!this.onGround && this.airCrouchTimer > 0) {
      this.airCrouchTimer -= dt;
      if (input.crouch && !this.airCrouchBoost) {
        this.airCrouchBoost = true;
        this.vel.y = Math.max(this.vel.y, 0) + 1.3;
        this.jumpKick = 0.06;
      }
    }

    /* ---- 重力 / 飞行 ---- */
    if (this.flying && !this.dead) {
      // 飞行：按住空格上升，松开则缓慢下降
      this.vel.y = input.jump ? FLY_UP : -FLY_DOWN;
      this.onGround = false;
    } else {
      this.vel.y -= GRAVITY * dt;
    }
    if (this.vel.y < -45) this.vel.y = -45;

    /* ---- 碰撞推进 ---- */
    this.ctx.height = this.height;
    this.ctx.stepped = false;
    this.ctx.grounded = false;
    this.ctx.hitCeiling = false;
    var beforeY = this.pos.y;

    Collide.moveAxis(this.pos, this.vel.x * dt, 'x', this.ctx);
    Collide.moveAxis(this.pos, this.vel.z * dt, 'z', this.ctx);
    var fellSpeed = this.vel.y;
    Collide.moveAxis(this.pos, this.vel.y * dt, 'y', this.ctx);

    if (this.ctx.grounded) {
      if (!this.wasOnGround && fellSpeed < -4) {
        this.landKick = Utils.clamp(-fellSpeed * 0.02, 0, 0.26);
        this.landDip = Utils.clamp(-fellSpeed * 0.012, 0, 0.16);
        Sound.land();
      }
      this.onGround = true;
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }
    if (this.ctx.hitCeiling) this.vel.y = Math.min(this.vel.y, 0);
    if (this.ctx.stepped) {
      this.onGround = true;
      this.vel.y = Math.min(this.vel.y, 0);
      // 上台阶的瞬间高度差做平滑，避免相机"跳一下"
      this.stepSmooth += (this.pos.y - beforeY);
    }
    this.wasOnGround = this.onGround;
    if (this.pos.y < -20) this.respawn(false);

    /* ---- 头部晃动 / 脚步声 / 各种缓冲 ---- */
    this.speed = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
    var speedRatio = Utils.clamp(this.speed / (BASE_SPEED * 0.9), 0, 1.7);
    this.bobPhase += dt * (2.0 + speedRatio * 9.0) * (this.onGround ? 1 : 0.3);
    this.bobAmount = Utils.damp(this.bobAmount, this.onGround ? speedRatio : 0, 10, dt);
    this.landKick = Utils.damp(this.landKick, 0, 9, dt);
    this.landDip = Utils.damp(this.landDip, 0, 6, dt);
    this.jumpKick = Utils.damp(this.jumpKick, 0, 7, dt);
    this.stepSmooth = Utils.damp(this.stepSmooth, 0, 16, dt);
    this.shake = Utils.damp(this.shake, 0, 7, dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.buffs.damage > 0) this.buffs.damage -= dt;
    if (this.buffs.speed > 0) this.buffs.speed -= dt;
    if (this.buffs.jump > 0) this.buffs.jump -= dt;

    if (this.onGround && speedRatio > 0.3) {
      this.stepTimer -= dt * speedRatio;
      if (this.stepTimer <= 0) { this.stepTimer = 0.52; Sound.step(); }
    } else {
      this.stepTimer = 0.5;
    }

    /* ---- 回血 ---- */
    if (this.regenDelay > 0) this.regenDelay -= dt;
    else if (this.health < this.maxHealth && !this.dead) {
      this.health = Math.min(this.maxHealth, this.health + 13 * dt);
    }

    /* ---- 应用到相机 ---- */
    var bobY = Math.sin(this.bobPhase * 2) * 0.034 * this.bobAmount;
    var bobX = Math.cos(this.bobPhase) * 0.028 * this.bobAmount;
    var eye = this.eyeHeight() + bobY - this.landKick - this.landDip + this.jumpKick - this.stepSmooth;
    this._eye.set(this.pos.x, this.pos.y + eye, this.pos.z);

    if (this.shake > 0.001) {
      var s = this.shake * 0.05;
      this._eye.x += Utils.rand(-s, s);
      this._eye.y += Utils.rand(-s, s);
      this._eye.z += Utils.rand(-s, s);
    }

    this.camera.position.copy(this._eye);
    this.camera.rotation.set(
      this.pitch,
      this.yaw,
      bobX * 0.12 + (this.shake > 0.001 ? Utils.rand(-this.shake * 0.02, this.shake * 0.02) : 0)
    );
  };

  Player.prototype.forwardVector = function (out) {
    out = out || new THREE.Vector3();
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  };

  FPS.Player = Player;
})(window.FPS);

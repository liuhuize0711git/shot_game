/* =======================================================================
 * minimap.js —— 小地图雷达
 *   黄色点 = 玩家（带朝向箭头）
 *   绿色点 = 地图道具
 *   红色点 = 机器人（可在设置里开关）
 * ===================================================================== */
(function (FPS) {
  'use strict';

  function Minimap(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.size = canvas.width;          // 逻辑像素
    this.scale = this.size / (world.cols * world.tile);
    this.showBots = false;
    this.bg = this._buildBackground();
  }

  Minimap.prototype._buildBackground = function () {
    var w = this.world, size = this.size, s = this.scale;
    var bg = document.createElement('canvas');
    bg.width = size;
    bg.height = size;
    var ctx = bg.getContext('2d');

    ctx.fillStyle = '#151c24';
    ctx.fillRect(0, 0, size, size);

    /* 配色和玩家给的雷达图一致：白/灰=一层，黄=二层，绿=机器人出生点，蓝=玩家出生点 */
    var colors = {
      '.': '#98a4ae',           // 一层地面
      '2': '#f2c53c',           // 二层 / 楼梯
      '3': '#f2c53c',           // 建筑顶上的二层天桥
      A: '#d8a45c', B: '#d8a45c', // 包点
      T: '#1fb85c',             // 机器人出生点（绿）
      P: '#3ec8fb',             // 玩家出生点（蓝）
      o: '#8a8f96', w: '#8a8f96', c: '#8a8f96', p: '#8a8f96'   // 小建筑
    };

    for (var r = 0; r < w.rows; r++) {
      for (var c = 0; c < w.cols; c++) {
        var ch = w.tileAt(c, r);
        if (ch === '#') continue;
        ctx.fillStyle = colors[ch] || '#4a5560';
        ctx.fillRect(
          Math.floor(c * w.tile * s),
          Math.floor(r * w.tile * s),
          Math.ceil(w.tile * s), Math.ceil(w.tile * s)
        );
      }
    }

    // 建筑轮廓
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    for (var r2 = 0; r2 < w.rows; r2++) {
      for (var c2 = 0; c2 < w.cols; c2++) {
        if (w.tileAt(c2, r2) !== '#') continue;
        var x = c2 * w.tile * s, y = r2 * w.tile * s;
        var n = (w.tileAt(c2, r2 - 1) !== '#');
        var sN = (w.tileAt(c2, r2 + 1) !== '#');
        var e = (w.tileAt(c2 + 1, r2) !== '#');
        var we = (w.tileAt(c2 - 1, r2) !== '#');
        if (n) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w.tile * s, y); ctx.stroke(); }
        if (sN) { ctx.beginPath(); ctx.moveTo(x, y + w.tile * s); ctx.lineTo(x + w.tile * s, y + w.tile * s); ctx.stroke(); }
        if (we) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + w.tile * s); ctx.stroke(); }
        if (e) { ctx.beginPath(); ctx.moveTo(x + w.tile * s, y); ctx.lineTo(x + w.tile * s, y + w.tile * s); ctx.stroke(); }
      }
    }

    // 文字标注
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < w.mapInfo.labels.length; i++) {
      var lb = w.mapInfo.labels[i];
      var lx = lb.col * w.tile * s;
      var ly = lb.row * w.tile * s;
      if (lb.kind === 'site') {
        ctx.font = 'bold 13px Consolas, monospace';
        ctx.fillStyle = lb.text === 'A' ? 'rgba(255,170,70,0.95)' : 'rgba(110,220,255,0.95)';
      } else if (lb.kind === 'spawn') {
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.fillStyle = 'rgba(235,245,255,0.9)';
      } else {
        ctx.font = '9px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = 'rgba(210,230,245,0.55)';
      }
      ctx.fillText(lb.text, lx, ly);
    }

    return bg;
  };

  /* 世界坐标 -> 雷达坐标 */
  Minimap.prototype.toCanvas = function (x, z) {
    var w = this.world;
    return {
      x: (x - w.originX) * this.scale,
      y: (z - w.originZ) * this.scale
    };
  };

  Minimap.prototype.draw = function (player, pickups, enemies, time) {
    var ctx = this.ctx, size = this.size;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.bg, 0, 0);

    var i, p;

    // 道具：绿点（闪烁）
    if (pickups) {
      for (i = 0; i < pickups.items.length; i++) {
        var it = pickups.items[i];
        p = this.toCanvas(it.x, it.z);
        var pulse = 0.65 + Math.sin(time * 4 + it.phase) * 0.35;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(60,240,140,' + pulse.toFixed(2) + ')';
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(10,40,20,0.9)';
        ctx.stroke();
      }
    }

    // 机器人：红点（默认关闭，可在设置里打开）
    if (this.showBots && enemies) {
      for (i = 0; i < enemies.bots.length; i++) {
        var b = enemies.bots[i];
        if (b.dead || b.state === 'spawning') continue;
        p = this.toCanvas(b.root.position.x, b.root.position.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,80,100,0.85)';
        ctx.fill();
      }
    }

    // 玩家：黄点 + 朝向箭头
    p = this.toCanvas(player.pos.x, player.pos.z);
    var fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    ctx.beginPath();
    ctx.moveTo(p.x + fx * 8, p.y + fz * 8);
    ctx.lineTo(p.x - fz * 4.5 - fx * 2, p.y + fx * 4.5 - fz * 2);
    ctx.lineTo(p.x + fz * 4.5 - fx * 2, p.y - fx * 4.5 - fz * 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,222,90,0.35)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffde5a';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(40,30,0,0.9)';
    ctx.stroke();
  };

  FPS.Minimap = Minimap;
})(window.FPS);

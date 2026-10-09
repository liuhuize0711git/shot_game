/* =======================================================================
 * nav.js —— 导航网格 + A* 寻路
 * 直接由地图建筑生成：把每个格子标记为可走/不可走，机器人就能绕开墙、
 * 穿过公寓走廊、走上香蕉道，而不是傻傻地卡在墙角。
 * ===================================================================== */
(function (FPS) {
  'use strict';

  var CELL = 1.0;          // 导航格边长（米）——越小越能保留窄通道
  var BOT_RADIUS = 0.40;   // 计算可通行时使用的机器人半径（机器人已收窄 30%）
  var BLOCK_HEIGHT = 0.45; // 高于这个高度的物体算障碍（矮台阶可以直接迈过去）

  function NavGrid(world) {
    this.world = world;
    this.cell = CELL;
    this.minX = world.bounds.minX;
    this.minZ = world.bounds.minZ;
    this.cols = Math.ceil((world.bounds.maxX - this.minX) / CELL);
    this.rows = Math.ceil((world.bounds.maxZ - this.minZ) / CELL);
    this.walk = null;
    this.build();
  }

  NavGrid.prototype.build = function () {
    var n = this.cols * this.rows;
    var walk = new Uint8Array(n);
    walk.fill(1);

    // 1) 把障碍物"盖"到网格上
    var r = BOT_RADIUS;
    var list = this.world.colliders;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.nav === false) continue;
      if (b.max.y < BLOCK_HEIGHT) continue;
      if (b.min.y > 2.2) continue;      // 头顶结构（拱廊顶、雨棚）不挡地面通行
      // 以"格心是否落在膨胀后的障碍里"为准，避免把整格都判死而堵掉窄通道
      var c0 = Math.ceil((b.min.x - r - this.minX) / CELL - 0.5);
      var c1 = Math.floor((b.max.x + r - this.minX) / CELL - 0.5) + 1;
      var r0 = Math.ceil((b.min.z - r - this.minZ) / CELL - 0.5);
      var r1 = Math.floor((b.max.z + r - this.minZ) / CELL - 0.5) + 1;
      if (c0 < 0) c0 = 0;
      if (r0 < 0) r0 = 0;
      if (c1 > this.cols) c1 = this.cols;
      if (r1 > this.rows) r1 = this.rows;
      for (var rr = r0; rr < r1; rr++) {
        for (var cc = c0; cc < c1; cc++) walk[rr * this.cols + cc] = 0;
      }
    }

    // 2) 地图上标为建筑的格子也封掉（防止建筑之间的缝里生成路径）
    for (var row = 0; row < this.rows; row++) {
      for (var col = 0; col < this.cols; col++) {
        var p = this.cellToWorld(col, row);
        var t = this.world.worldToTile(p.x, p.z);
        if (this.world.isSolidTile(t.col, t.row)) {
          var idx = row * this.cols + col;
          // 只有完全落在建筑内部的格子才封，边缘保留给角色贴墙走
          var q1 = this.world.worldToTile(p.x - 0.6, p.z - 0.6);
          var q2 = this.world.worldToTile(p.x + 0.6, p.z + 0.6);
          if (this.world.isSolidTile(q1.col, q1.row) && this.world.isSolidTile(q2.col, q2.row)) {
            walk[idx] = 0;
          }
        }
      }
    }

    this.walk = walk;

    // 3) 只保留与机器人出生点连通的区域
    var start = this.world.botSpawnCenter;
    var sc = this.toCell(start.x, start.z);
    var reach = new Uint8Array(n);
    if (sc >= 0) this._flood(sc, reach);
    var beforePrune = 0, reachableCount = 0;
    for (var i6 = 0; i6 < n; i6++) {
      if (walk[i6]) beforePrune++;
      if (reach[i6]) reachableCount++;
    }
    for (var i2 = 0; i2 < n; i2++) if (walk[i2] && !reach[i2]) walk[i2] = 0;

    // 自检：如果有明显区域与出生点不连通，通常说明通道被道具/建筑堵死了
    this.stats = { beforePrune: beforePrune, reachable: reachableCount, pruned: beforePrune - reachableCount };
    if (beforePrune > 0 && (beforePrune - reachableCount) > beforePrune * 0.08) {
      console.warn('[nav] 有 ' + (beforePrune - reachableCount) + ' 个可走格与出生点不连通（共 ' +
        beforePrune + '），检查是否有道具或建筑堵住了通道');
    }

    // 预先筛出会挡路的碰撞体，供路径拉直使用
    this.blockers = [];
    for (var i3 = 0; i3 < list.length; i3++) {
      var bb = list[i3];
      if (bb.nav === false || bb.max.y < BLOCK_HEIGHT) continue;
      if (bb.min.y > 2.2) continue;
      this.blockers.push(bb);
    }

    // A* 复用缓冲
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.came = new Int32Array(n);
    this.state = new Uint8Array(n);
    this.stamp = new Int32Array(n);
    this.stampId = 0;
    this.heap = [];
  };

  NavGrid.prototype._flood = function (startIdx, out) {
    var q = [startIdx], head = 0;
    out[startIdx] = 1;
    while (head < q.length) {
      var idx = q[head++];
      var c = idx % this.cols, r = (idx / this.cols) | 0;
      for (var k = 0; k < 4; k++) {
        var nc = c + (k === 0 ? 1 : k === 1 ? -1 : 0);
        var nr = r + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        var ni = nr * this.cols + nc;
        if (this.walk[ni] && !out[ni]) { out[ni] = 1; q.push(ni); }
      }
    }
  };

  NavGrid.prototype.toCol = function (x) { return Math.floor((x - this.minX) / CELL); };
  NavGrid.prototype.toRow = function (z) { return Math.floor((z - this.minZ) / CELL); };
  NavGrid.prototype.cellToWorld = function (col, row) {
    return { x: this.minX + (col + 0.5) * CELL, z: this.minZ + (row + 0.5) * CELL };
  };
  NavGrid.prototype.toCell = function (x, z) {
    var c = this.toCol(x), r = this.toRow(z);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    var idx = r * this.cols + c;
    return this.walk[idx] ? idx : -1;
  };

  /* 找一个离目标最近的可走格 */
  NavGrid.prototype._nearestWalkable = function (col, row, maxRadius) {
    maxRadius = maxRadius || 6;
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    if (this.walk[row * this.cols + col]) return row * this.cols + col;
    for (var rad = 1; rad <= maxRadius; rad++) {
      for (var dc = -rad; dc <= rad; dc++) {
        for (var dr = -rad; dr <= rad; dr++) {
          if (Math.abs(dc) !== rad && Math.abs(dr) !== rad) continue;
          var c = col + dc, r = row + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          var idx = r * this.cols + c;
          if (this.walk[idx]) return idx;
        }
      }
    }
    return -1;
  };

  /* ------------------------------------------------------------- A* */
  NavGrid.prototype.findPath = function (from, to) {
    var startIdx = this.toCell(from.x, from.z);
    var goalIdx = this._nearestWalkable(this.toCol(to.x), this.toRow(to.z));
    if (startIdx < 0 || goalIdx < 0) return null;
    if (startIdx === goalIdx) return [{ x: to.x, z: to.z }];

    var cols = this.cols, rows = this.rows, walk = this.walk;
    var g = this.g, came = this.came, state = this.state, stamp = this.stamp;
    var id = ++this.stampId;
    var heap = this.heap;
    heap.length = 0;

    var gc = goalIdx % cols, gr = (goalIdx / cols) | 0;

    function push(idx, f) {
      heap.push(idx);
      var i = heap.length - 1;
      while (i > 0) {
        var p = (i - 1) >> 1;
        var pf = g[heap[p]] + heuristic(heap[p]);
        if (pf <= f) break;
        heap[i] = heap[p]; i = p;
      }
      heap[i] = idx;
    }
    function heuristic(idx) {
      var c = idx % cols, r = (idx / cols) | 0;
      var dx = Math.abs(c - gc), dz = Math.abs(r - gr);
      return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
    }
    function pop() {
      var top = heap[0];
      var last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        var i = 0, n = heap.length;
        while (true) {
          var l = i * 2 + 1, rgt = i * 2 + 2, best = i;
          var bf = g[heap[best]] + heuristic(heap[best]);
          if (l < n) {
            var lf = g[heap[l]] + heuristic(heap[l]);
            if (lf < bf) { best = l; bf = lf; }
          }
          if (rgt < n) {
            var rf = g[heap[rgt]] + heuristic(heap[rgt]);
            if (rf < bf) best = rgt;
          }
          if (best === i) break;
          var t = heap[i]; heap[i] = heap[best]; heap[best] = t;
          i = best;
        }
      }
      return top;
    }

    g[startIdx] = 0;
    state[startIdx] = 1;
    stamp[startIdx] = id;
    came[startIdx] = -1;
    push(startIdx, heuristic(startIdx));

    var found = false, guard = 0;
    while (heap.length && guard++ < 20000) {
      var cur = pop();
      if (stamp[cur] !== id || state[cur] === 2) continue;
      state[cur] = 2;
      if (cur === goalIdx) { found = true; break; }

      var c = cur % cols, r = (cur / cols) | 0;
      for (var k = 0; k < 8; k++) {
        var dc = [1, -1, 0, 0, 1, 1, -1, -1][k];
        var dr = [0, 0, 1, -1, 1, -1, 1, -1][k];
        var nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        var ni = nr * cols + nc;
        if (!walk[ni]) continue;
        if (dc !== 0 && dr !== 0) {
          if (!walk[r * cols + nc] || !walk[nr * cols + c]) continue; // 不能斜穿墙角
        }
        var step = (dc !== 0 && dr !== 0) ? 1.4142 : 1;
        var ng = g[cur] + step;
        if (stamp[ni] !== id) {
          stamp[ni] = id; state[ni] = 0; g[ni] = Infinity; came[ni] = -1;
        }
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          state[ni] = 1;
          push(ni, ng + heuristic(ni));
        }
      }
    }

    if (!found) return null;

    var path = [], node = goalIdx;
    while (node !== -1) { path.push(node); node = came[node]; }
    path.reverse();

    var pts = [];
    for (var i2 = 0; i2 < path.length; i2++) {
      var w = this.cellToWorld(path[i2] % cols, (path[i2] / cols) | 0);
      pts.push({ x: w.x, z: w.z });
    }
    pts[pts.length - 1] = { x: to.x, z: to.z };
    return this._smooth(from, pts);
  };

  /* 拉直路径：能直线到达的中间点全部丢掉 */
  NavGrid.prototype._smooth = function (from, pts) {
    if (pts.length <= 2) return pts;
    var out = [];
    var anchorX = from.x, anchorZ = from.z;
    var i = 0;
    while (i < pts.length) {
      var j = Math.min(pts.length - 1, i + 12);   // 只向前看 12 格，保证性能
      var best = -1;
      for (; j > i; j--) {
        if (!this.lineBlocked(anchorX, anchorZ, pts[j].x, pts[j].z)) { best = j; break; }
      }
      if (best < 0) best = i;              // 下一格
      out.push(pts[best]);
      anchorX = pts[best].x;
      anchorZ = pts[best].z;
      i = best + 1;
    }
    return out;
  };

  /* 2D 视线检测：两点之间是否被"有高度"的障碍挡住 */
  NavGrid.prototype.lineBlocked = function (x0, z0, x1, z1) {
    var list = this.blockers || this.world.colliders;
    var dx = x1 - x0, dz = z1 - z0;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      // 用 2D 版 slab 检测
      var tmin = 0, tmax = 1, blocked = true;
      var axes = [[x0, dx, b.min.x, b.max.x], [z0, dz, b.min.z, b.max.z]];
      for (var a = 0; a < 2; a++) {
        var o = axes[a][0], d = axes[a][1], lo = axes[a][2], hi = axes[a][3];
        if (Math.abs(d) < 1e-8) {
          if (o < lo || o > hi) { blocked = false; break; }
        } else {
          var t1 = (lo - o) / d, t2 = (hi - o) / d, tmp;
          if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { blocked = false; break; }
        }
      }
      if (blocked) return true;
    }
    return false;
  };

  /* 随机取一个可走点（道具刷新 / 散开用） */
  NavGrid.prototype.randomPoint = function () {
    for (var i = 0; i < 400; i++) {
      var c = Math.floor(Math.random() * this.cols);
      var r = Math.floor(Math.random() * this.rows);
      if (this.walk[r * this.cols + c]) return this.cellToWorld(c, r);
    }
    return { x: this.world.botSpawnCenter.x, z: this.world.botSpawnCenter.z };
  };

  FPS.NavGrid = NavGrid;
})(window.FPS);

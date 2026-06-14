/* ============================================================
 * 大富翁 · 联机服务器
 * Node.js >= 18  |  Express + Socket.IO
 * 启动: node server.js   (默认端口 3000, 可用环境变量 PORT 修改)
 * ============================================================ */
function attachDafuwengGame(io) {

/* ---------------- 游戏数据 ---------------- */
const TILES = [
  { n: "起点", t: "go" },
  { n: "老北京胡同", t: "prop", p: 600, g: "#C8503C" },
  { n: "运气", t: "chance" },
  { n: "上海外滩", t: "prop", p: 800, g: "#C8503C" },
  { n: "广州塔", t: "prop", p: 1000, g: "#C8503C" },
  { n: "意外支出", t: "tax", amt: 800 },
  { n: "成都锦里", t: "prop", p: 1400, g: "#FF8C42" },
  { n: "西安兵马俑", t: "prop", p: 1600, g: "#FF8C42" },
  { n: "监狱", t: "jail" },
  { n: "重庆洪崖洞", t: "prop", p: 2000, g: "#FF8C42" },
  { n: "杭州西湖", t: "prop", p: 2200, g: "#3D7EA6" },
  { n: "运气", t: "chance" },
  { n: "苏州园林", t: "prop", p: 2400, g: "#3D7EA6" },
  { n: "南京夫子庙", t: "prop", p: 2600, g: "#3D7EA6" },
  { n: "长沙橘子洲", t: "prop", p: 2800, g: "#3D7EA6" },
  { n: "武汉黄鹤楼", t: "prop", p: 3000, g: "#3D7EA6" },
  { n: "免费停车", t: "park" },
  { n: "厦门鼓浪屿", t: "prop", p: 3200, g: "#8E6CB8" },
  { n: "青岛栈桥", t: "prop", p: 3400, g: "#8E6CB8" },
  { n: "运气", t: "chance" },
  { n: "深圳科技园", t: "prop", p: 4000, g: "#8E6CB8" },
  { n: "香港中环", t: "prop", p: 5000, g: "#2E8B63" },
  { n: "澳门大三巴", t: "prop", p: 5500, g: "#2E8B63" },
  { n: "台北故宫", t: "prop", p: 6000, g: "#2E8B63" },
  { n: "国际机场", t: "airport" },
  { n: "北京CBD", t: "prop", p: 6500, g: "#2E8B63" },
  { n: "税务局", t: "tax", amt: 2000 },
  { n: "台北101", t: "prop", p: 7000, g: "#D4A017" },
  { n: "上海中心大厦", t: "prop", p: 7500, g: "#D4A017" },
  { n: "运气", t: "chance" },
  { n: "三亚海滩度假村", t: "prop", p: 8000, g: "#D4A017" },
  { n: "故宫博物院", t: "prop", p: 10000, g: "#C0392B" },
];
const CHANCES = [
  { txt: "🎉 彩票中奖,获得 ¥3000", d: 3000 },
  { txt: "🧧 收到长辈红包 ¥1888", d: 1888 },
  { txt: "📱 手机摔坏,维修花费 ¥800", d: -800 },
  { txt: "🍲 请全桌吃火锅,支出 ¥1200", d: -1200 },
  { txt: "📈 股票大涨,入账 ¥2500", d: 2500 },
  { txt: "🚗 违章停车,罚款 ¥600", d: -600 },
  { txt: "🪙 路边捡到金币 ¥888", d: 888 },
  { txt: "👜 钱包被偷,损失 ¥1000", d: -1000 },
  { txt: "🎰 赌场赢钱 ¥2000", d: 2000 },
  { txt: "💼 获得年终奖金 ¥3800", d: 3800 },
  { txt: "🏥 生病住院,花费 ¥1500", d: -1500 },
  { txt: "🎓 拿到AI培训证书,政府补贴 ¥1800", d: 1800 },
  { txt: "⚡ 家中电器短路,维修费 ¥700", d: -700 },
  { txt: "🛒 超市大促销省了 ¥500", d: 500 },
  { txt: "💎 投资NFT赚了一笔 ¥4200", d: 4200 },
  { txt: "🌪️ 台风灾害,房屋维修 ¥2500", d: -2500 },
];
const START_MONEY = 18000;
const GO_BONUS = 2000;
const DECIDE_TIMEOUT = 30_000;   // 买地/升级 决策超时(毫秒)
const ROOM_TTL = 30 * 60_000;    // 空房间保留时间

const rentOf = (tile, lv) => Math.round(tile.p * 0.3 * lv);
const upCost = (tile) => Math.round(tile.p * 0.5);
const fmt = (n) => "¥" + n.toLocaleString("zh-CN");
const rid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- 房间管理 ---------------- */
const rooms = new Map(); // code -> room

function newCode() {
  let c;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c));
  return c;
}

function makePlayer(name) {
  return {
    id: rid(), token: rid() + rid(), name: String(name).slice(0, 8),
    socketId: null, online: true,
    money: START_MONEY, pos: 0, jailed: false, bankrupt: false,
  };
}

function publicState(room) {
  return {
    code: room.code, hostId: room.hostId, status: room.status,
    turn: room.turn, winner: room.winner || null,
    pending: room.pending ? { playerId: room.pending.playerId, type: room.pending.type, tileIdx: room.pending.tileIdx } : null,
    turnDeadline: room.turnDeadline || null,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, online: p.online,
      money: p.money, pos: p.pos, jailed: p.jailed, bankrupt: p.bankrupt,
    })),
    owners: room.owners,
    log: room.log.slice(0, 50),
  };
}

function broadcast(room) {
  io.to("room:" + room.code).emit("state", publicState(room));
}
function log(room, txt) {
  room.log.unshift(txt);
}
function toast(room, txt) {
  io.to("room:" + room.code).emit("toast", txt);
}

function advanceTurn(room) {
  const alive = room.players.filter((p) => !p.bankrupt);
  if (alive.length <= 1) {
    room.status = "ended";
    room.winner = alive[0] ? alive[0].name : "无人";
    log(room, `👑 游戏结束!${room.winner} 富甲一方!`);
    return;
  }
  let t = room.turn;
  do { t = (t + 1) % room.players.length; } while (room.players[t].bankrupt);
  room.turn = t;
  startTurnTimer(room);
}

function pay(room, player, amount, toPlayer) {
  player.money -= amount;
  if (toPlayer) toPlayer.money += amount;
  if (player.money < 0) {
    player.bankrupt = true;
    for (const k of Object.keys(room.owners)) {
      if (room.owners[k].pid === player.id) delete room.owners[k];
    }
    log(room, `💥 ${player.name} 破产出局!名下地产全部释放`);
    toast(room, `💥 ${player.name} 破产出局`);
  }
}

function clearPending(room) {
  if (room.pending) { clearTimeout(room.pending.timer); room.pending = null; }
}

function touch(room) {
  clearTimeout(room.ttlTimer);
  room.ttlTimer = setTimeout(() => {
    if (room.players.every((p) => !p.online)) rooms.delete(room.code);
    else touch(room);
  }, ROOM_TTL);
}

/* ---------------- 回合逻辑(服务器权威) ---------------- */
function resolveTile(room, p) {
  const tile = TILES[p.pos];
  const finish = () => { advanceTurn(room); room.busy = false; broadcast(room); };

  if (tile.t === "prop") {
    const own = room.owners[p.pos];
    if (!own) {
      if (p.money >= tile.p) return askDecision(room, p, "buy", p.pos);
      log(room, `💸 ${p.name} 买不起「${tile.n}」,只好路过`);
      return finish();
    }
    if (own.pid === p.id) {
      if (own.lv < 4 && p.money >= upCost(tile)) return askDecision(room, p, "upgrade", p.pos);
      return finish();
    }
    const owner = room.players.find((x) => x.id === own.pid);
    const rent = rentOf(tile, own.lv);
    pay(room, p, rent, owner);
    log(room, `🏠 ${p.name} 踩进 ${owner.name} 的「${tile.n}」(Lv${own.lv}),付租金 ${fmt(rent)}`);
    toast(room, `${p.name} 付给 ${owner.name} 租金 ${fmt(rent)}`);
    return finish();
  }
  if (tile.t === "chance") {
    const ev = CHANCES[(Math.random() * CHANCES.length) | 0];
    if (ev.d >= 0) p.money += ev.d;
    else pay(room, p, -ev.d);
    log(room, `🎴 ${p.name}:${ev.txt}`);
    toast(room, `${p.name}:${ev.txt}`);
    return finish();
  }
  if (tile.t === "tax") {
    pay(room, p, tile.amt);
    log(room, `🧾 ${p.name} 缴税 ${fmt(tile.amt)}`);
    return finish();
  }
  if (tile.t === "jail") {
    p.jailed = true;
    log(room, `🚔 ${p.name} 被关进监狱,下回合休息`);
    toast(room, `🚔 ${p.name} 进监狱了`);
    return finish();
  }
  if (tile.t === "airport") {
    p.pos = 0;
    p.money += GO_BONUS;
    log(room, `✈️ ${p.name} 搭机直飞起点,领取 ${fmt(GO_BONUS)}`);
    toast(room, `✈️ ${p.name} 直飞起点 +${fmt(GO_BONUS)}`);
    io.to("room:" + room.code).emit("teleport", { playerId: p.id, pos: 0 });
    return finish();
  }
  return finish(); // 起点 / 免费停车
}

function askDecision(room, p, type, tileIdx) {
  room.pending = {
    playerId: p.id, type, tileIdx,
    timer: setTimeout(() => applyDecision(room, p.id, false, true), DECIDE_TIMEOUT),
  };
  broadcast(room);
  const tile = TILES[tileIdx];
  const payload = {
    type, tileIdx, name: tile.n, color: tile.g,
    price: type === "buy" ? tile.p : upCost(tile),
    rent: rentOf(tile, type === "buy" ? 1 : room.owners[tileIdx].lv + 1),
    nextLv: type === "upgrade" ? room.owners[tileIdx].lv + 1 : 1,
    timeout: DECIDE_TIMEOUT,
  };
  if (p.socketId) io.to(p.socketId).emit("ask", payload);
}

function applyDecision(room, playerId, yes, isTimeout = false) {
  if (!room.pending || room.pending.playerId !== playerId) return;
  const { type, tileIdx } = room.pending;
  clearPending(room);
  const p = room.players.find((x) => x.id === playerId);
  const tile = TILES[tileIdx];
  if (yes && type === "buy" && p.money >= tile.p && !room.owners[tileIdx]) {
    p.money -= tile.p;
    room.owners[tileIdx] = { pid: p.id, lv: 1 };
    log(room, `🏷️ ${p.name} 以 ${fmt(tile.p)} 买下「${tile.n}」`);
    toast(room, `🏷️ ${p.name} 买下了「${tile.n}」`);
  } else if (yes && type === "upgrade" && room.owners[tileIdx]?.pid === p.id && p.money >= upCost(tile)) {
    p.money -= upCost(tile);
    room.owners[tileIdx].lv++;
    log(room, `⭐ ${p.name} 升级「${tile.n}」到 Lv${room.owners[tileIdx].lv}`);
  } else if (isTimeout) {
    log(room, `⏱️ ${p.name} 决策超时,自动放弃`);
  }
  advanceTurn(room);
  room.busy = false;
  broadcast(room);
}


/* ---------------- 回合计时器(自动投骰/跳过) ---------------- */
function startTurnTimer(room) {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  const p = room.players[room.turn];
  if (!p || p.bankrupt || room.status !== 'playing') { room.turnDeadline = null; return; }
  const delay = p.jailed ? 5000 : 10000;
  room.turnDeadline = Date.now() + delay;
  broadcast(room);
  room.turnTimer = setTimeout(() => {
    if (room.status !== 'playing' || room.busy || room.pending) return;
    const cur = room.players[room.turn];
    if (!cur || cur.bankrupt) return;
    if (cur.jailed) {
      cur.jailed = false; room.turnDeadline = null;
      log(room, '⏰ ' + cur.name + ' 监狱期满,自动跳过');
      broadcast(room); advanceTurn(room); broadcast(room);
    } else {
      room.busy = true; room.turnDeadline = null;
      const d1 = 1 + ((Math.random() * 6) | 0);
      const d2 = 1 + ((Math.random() * 6) | 0);
      const steps = d1 + d2; const path = []; let pos = cur.pos;
      for (let i = 0; i < steps; i++) { pos = (pos + 1) % 32; path.push(pos); }
      io.to('room:' + room.code).emit('dice', { playerId: cur.id, d1, d2, path });
      if (cur.pos + steps >= 32) { cur.money += 2000; log(room, '💰 ' + cur.name + ' 经过起点,领取 2000'); }
      cur.pos = pos;
      log(room, '🎲 ' + cur.name + ' 自动投九子 ' + d1 + '+' + d2);
      setTimeout(() => resolveTile(room, cur), 1100 + steps * 280);
    }
  }, delay);
}

/* ---------------- Socket 事件 ---------------- */
io.on("connection", (socket) => {
  let myRoom = null;
  let myPlayer = null;

  const bind = (room, player) => {
    myRoom = room;
    myPlayer = player;
    player.socketId = socket.id;
    player.online = true;
    socket.join("room:" + room.code);
    touch(room);
  };

  socket.on("create", ({ name }, cb) => {
    if (!name || !String(name).trim()) return cb({ ok: false, err: "先取个昵称吧" });
    const room = {
      code: newCode(), hostId: null, status: "lobby",
      turn: 0, players: [], owners: {}, log: [], pending: null, busy: false, turnTimer: null, turnDeadline: null,
    };
    const p = makePlayer(String(name).trim());
    room.hostId = p.id;
    room.players.push(p);
    log(room, `🏮 ${p.name} 创建了房间 ${room.code}`);
    rooms.set(room.code, room);
    bind(room, p);
    cb({ ok: true, code: room.code, playerId: p.id, token: p.token, state: publicState(room) });
  });

  socket.on("join", ({ code, name }, cb) => {
    const room = rooms.get(String(code));
    if (!room) return cb({ ok: false, err: "没找到这个房间,确认房间号正确" });
    if (!name || !String(name).trim()) return cb({ ok: false, err: "先取个昵称吧" });
    if (room.status !== "lobby") return cb({ ok: false, err: "这局游戏已经开始了" });
    if (room.players.length >= 4) return cb({ ok: false, err: "房间满员(最多 4 人)" });
    const p = makePlayer(String(name).trim());
    room.players.push(p);
    log(room, `👋 ${p.name} 加入了房间`);
    bind(room, p);
    cb({ ok: true, code: room.code, playerId: p.id, token: p.token, state: publicState(room) });
    broadcast(room);
  });

  socket.on("rejoin", ({ code, token }, cb) => {
    const room = rooms.get(String(code));
    const p = room && room.players.find((x) => x.token === token);
    if (!p) return cb({ ok: false, err: "重连失败,房间可能已结束" });
    bind(room, p);
    log(room, `🔌 ${p.name} 重新连线`);
    cb({ ok: true, code: room.code, playerId: p.id, token: p.token, state: publicState(room) });
    broadcast(room);
  });

  socket.on("start", () => {
    const room = myRoom;
    if (!room || room.status !== "lobby" || myPlayer.id !== room.hostId) return;
    if (room.players.length < 2) return toast(room, "至少需要 2 名玩家才能开局");
    room.status = "playing";
    room.turn = 0;
    log(room, `🎲 游戏开始!${room.players[0].name} 先行`);
    broadcast(room);
  });

  socket.on("roll", () => {
    const room = myRoom;
    if (!room || room.status !== "playing" || room.busy || room.pending) return;
    const p = room.players[room.turn];
    if (!p || p.id !== myPlayer.id || p.bankrupt || p.jailed) return;
    room.busy = true;

    const d1 = 1 + ((Math.random() * 6) | 0);
    const d2 = 1 + ((Math.random() * 6) | 0);
    const steps = d1 + d2;
    const path = [];
    let pos = p.pos;
    for (let i = 0; i < steps; i++) { pos = (pos + 1) % 32; path.push(pos); }

    io.to("room:" + room.code).emit("dice", { playerId: p.id, d1, d2, path });

    if (p.pos + steps >= TILES.length) {
      p.money += GO_BONUS;
      log(room, `💰 ${p.name} 经过起点,领取 ${fmt(GO_BONUS)}`);
    }
    p.pos = pos;
    log(room, `🎲 ${p.name} 掷出 ${d1}+${d2},来到「${TILES[pos].n}」`);

    // 等客户端走完动画再揭晓结果(骰子 0.8s + 每步 0.23s)
    setTimeout(() => resolveTile(room, p), 1100 + steps * 280);
  });

  socket.on("decide", ({ yes }) => {
    if (myRoom) applyDecision(myRoom, myPlayer.id, !!yes);
  });

  socket.on("skipJail", () => {
    const room = myRoom;
    if (!room || room.status !== "playing" || room.busy || room.pending) return;
    const p = room.players[room.turn];
    if (!p || p.id !== myPlayer.id || !p.jailed) return;
    p.jailed = false;
    log(room, `⏭️ ${p.name} 在监狱蹲了一回合`);
    advanceTurn(room);
    broadcast(room);
  });

  socket.on("forceNext", () => {
    const room = myRoom;
    if (!room || room.status !== "playing" || myPlayer.id !== room.hostId) return;
    const cur = room.players[room.turn];
    if (cur.id === myPlayer.id) return;
    clearPending(room);
    room.busy = false;
    log(room, `⚠️ 房主跳过了 ${cur.name} 的回合`);
    advanceTurn(room);
    broadcast(room);
  });

  socket.on("chat", (txt) => {
    if (!myRoom || typeof txt !== "string") return;
    const msg = txt.trim().slice(0, 60);
    if (msg) toast(myRoom, `💬 ${myPlayer.name}:${msg}`);
  });

  socket.on("disconnect", () => {
    const room = myRoom;
    if (!room || !myPlayer) return;
    myPlayer.online = false;
    myPlayer.socketId = null;
    if (room.status === "lobby") {
      room.players = room.players.filter((p) => p.id !== myPlayer.id);
      if (room.players.length === 0) { rooms.delete(room.code); return; }
      if (room.hostId === myPlayer.id) room.hostId = room.players[0].id;
      log(room, `👋 ${myPlayer.name} 离开了房间`);
    } else {
      log(room, `🔌 ${myPlayer.name} 掉线了(可刷新页面重连)`);
    }
    broadcast(room);
    touch(room);
  });
});

}

module.exports = { attachDafuwengGame };

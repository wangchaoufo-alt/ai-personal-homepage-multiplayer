function attachDafuwengGame(io) {

/* ---------------- 棋盘数据 ---------------- */
const TILES = [
  {id:0,type:"jail"},{id:1,type:"empty"},{id:2,type:"empty"},{id:3,type:"empty"},
  {id:4,type:"coin",v:666},{id:5,type:"shop"},{id:6,type:"empty"},{id:7,type:"jail"},
  {id:8,type:"coin",v:1111},{id:9,type:"empty"},{id:10,type:"coin",v:666},{id:11,type:"magic"},
  {id:12,type:"coin",v:666},{id:13,type:"empty"},{id:14,type:"coin",v:1111},{id:15,type:"empty"},
  {id:16,type:"empty"},{id:17,type:"empty"},{id:18,type:"shop"},{id:19,type:"magic"},
  {id:20,type:"coin",v:666},{id:21,type:"coin",v:666},{id:22,type:"shop"},{id:23,type:"magic"},
  {id:24,type:"coin",v:3333},{id:25,type:"hospital"},{id:26,type:"shop"},{id:27,type:"magic"},
  {id:28,type:"coin",v:666},{id:29,type:"coin",v:1111},
];
const LOOP = TILES.map(t=>t.id);
const L = LOOP.length;
const START_MONEY = 10000;
const GO_BONUS = 2000;
const DECIDE_TIMEOUT = 30000;
const ROOM_TTL = 30*60000;
const rentOf = (tile,lv) => Math.round(tile.v*0.25*(lv||1));
const upCost = (tile) => Math.round(tile.v*0.6);
const fmt = (n) => "¥"+n.toLocaleString("zh-CN");
const rid = () => Math.random().toString(36).slice(2,10);

const rooms = new Map();
function newCode(){let c;do{c=String(Math.floor(1000+Math.random()*9000));}while(rooms.has(c));return c;}
function makePlayer(name){
  return {id:rid(),token:rid()+rid(),name:String(name).slice(0,8),socketId:null,online:true,
    money:START_MONEY,pos:0,jailed:false,bankrupt:false};
}
function publicState(room){
  return {code:room.code,hostId:room.hostId,status:room.status,turn:room.turn,winner:room.winner||null,
    pending:room.pending?{playerId:room.pending.playerId,type:room.pending.type,tileIdx:room.pending.tileIdx}:null,
    players:room.players.map(p=>({id:p.id,name:p.name,online:p.online,money:p.money,pos:p.pos,jailed:p.jailed,bankrupt:p.bankrupt})),
    owners:room.owners,log:room.log.slice(0,50)};
}
function broadcast(room){io.to("room:"+room.code).emit("state",publicState(room));}
function log(room,txt){room.log.unshift(txt);}
function toast(room,txt){io.to("room:"+room.code).emit("toast",txt);}

function advanceTurn(room){
  const alive=room.players.filter(p=>!p.bankrupt);
  if(alive.length<=1){room.status="ended";room.winner=alive[0]?alive[0].name:"无人";log(room,"👑 游戏结束!"+room.winner+" 富甲一方!");return;}
  let t=room.turn;
  do{t=(t+1)%room.players.length;}while(room.players[t].bankrupt);
  room.turn=t;
}

function payPlayer(room,player,amount,to){
  player.money-=amount;
  if(to)to.money+=amount;
  if(player.money<0){
    player.bankrupt=true;
    for(const k of Object.keys(room.owners)){
      if(room.owners[k].pid===player.id)delete room.owners[k];
    }
    log(room,"💜 "+player.name+" 破产出局!");
    toast(room,"💜 "+player.name+" 破产出局");
  }
}

function clearPending(room){if(room.pending){clearTimeout(room.pending.timer);room.pending=null;}}
function touch(room){clearTimeout(room.ttlTimer);room.ttlTimer=setTimeout(()=>{if(room.players.every(p=>!p.online))rooms.delete(room.code);else touch(room);},ROOM_TTL);}

/* ---------------- 回合逻辑 ---------------- */
function resolveTile(room,p){
  const tile=TILES[LOOP[p.pos]];
  const finish=()=>{advanceTurn(room);room.busy=false;broadcast(room);};

  if(tile.type==="coin"){
    const own=room.owners[p.pos];
    if(!own){
      if(p.money>=tile.v)return askDecision(room,p,"buy",p.pos);
      log(room,"💸 "+p.name+" 买不起这个金币格");return finish();
    }
    if(own.pid===p.id){
      if(own.lv<4&&p.money>=upCost(tile))return askDecision(room,p,"upgrade",p.pos);
      return finish();
    }
    const owner=room.players.find(x=>x.id===own.pid);
    const rent=rentOf(tile,own.lv);
    payPlayer(room,p,rent,owner);
    log(room,"🏪 "+p.name+" 踩进 "+owner.name+" 的金币格(Lv"+own.lv+"),付租金 "+fmt(rent));
    return finish();
  }
  if(tile.type==="magic"){
    const events=[{txt:"🎉 彩票中奖!获得 ¥3000",d:3000},{txt:"🧧 收到长辈红包 ¥1888",d:1888},{txt:"📱 手机摔坏,维修 ¥800",d:-800},
      {txt:"🍲 请全桌吃火锅,支出 ¥1200",d:-1200},{txt:"📈 股票大涨,入账 ¥2500",d:2500},{txt:"🚗 违章停车,罚款 ¥600",d:-600},
      {txt:"🪙 路边捡到金币 ¥888",d:888},{txt:"💰 钱包被偷,损失 ¥1000",d:-1000},{txt:"🎰 赌场赢钱 ¥2000",d:2000},
      {txt:"🧧 获得年终奖金 ¥3800",d:3800}];
    const ev=events[(Math.random()*events.length)|0];
    if(ev.d>=0)p.money+=ev.d;else payPlayer(room,p,-ev.d);
    log(room,"🎴 "+p.name+":"+ev.txt);toast(room,p.name+":"+ev.txt);
    return finish();
  }
  if(tile.type==="jail"){
    p.jailed=true;log(room,"🚔 "+p.name+" 被关进监狱!下回合休息");toast(room,"🚔 "+p.name+" 进监狱了");
    return finish();
  }
  if(tile.type==="hospital"){
    p.jailed=true;log(room,"🏥 "+p.name+" 住院了!下回合休息");toast(room,"🏥 "+p.name+" 住院了");
    return finish();
  }
  if(tile.type==="shop"){
    const cost=Math.round(Math.random()*1500+500);
    payPlayer(room,p,cost);
    log(room,"🏪 "+p.name+" 在商店购物花了 "+fmt(cost));toast(room,p.name+" 购物 "+fmt(cost));
    return finish();
  }
  return finish(); // empty or start
}

function askDecision(room,p,type,tileIdx){
  room.pending={playerId:p.id,type,tileIdx,timer:setTimeout(()=>applyDecision(room,p.id,false,true),DECIDE_TIMEOUT)};
  broadcast(room);
  const tile=TILES[LOOP[tileIdx]]; // Use tileIdx as direct index into TILES
  const payload={type,tileIdx,name:"金币格",color:"#FFD700",
    price:type==="buy"?tile.v:upCost(tile),rent:rentOf(tile,type==="buy"?1:room.owners[tileIdx].lv+1),
    nextLv:type==="upgrade"?room.owners[tileIdx].lv+1:1,timeout:DECIDE_TIMEOUT};
  if(p.socketId)io.to(p.socketId).emit("ask",payload);
}

function applyDecision(room,playerId,yes,isTimeout){
  if(!room.pending||room.pending.playerId!==playerId)return;
  const{type,tileIdx}=room.pending;clearPending(room);
  const p=room.players.find(x=>x.id===playerId);const tile=TILES[LOOP[tileIdx]];
  if(yes&&type==="buy"&&p.money>=tile.v&&!room.owners[tileIdx]){
    p.money-=tile.v;room.owners[tileIdx]={pid:p.id,lv:1};
    log(room,"🪙 "+p.name+" 以 "+fmt(tile.v)+" 买下金币格");toast(room,"🪙 "+p.name+" 买下了金币格");
  }else if(yes&&type==="upgrade"&&room.owners[tileIdx]?.pid===p.id&&p.money>=upCost(tile)){
    p.money-=upCost(tile);room.owners[tileIdx].lv++;
    log(room,"⬆️ "+p.name+" 升级金币格到 Lv"+room.owners[tileIdx].lv);
  }else if(isTimeout)log(room,"⏰ "+p.name+" 决策超时,自动放弃");
  advanceTurn(room);room.busy=false;broadcast(room);
}

/* ---------------- Socket 事件 ---------------- */
io.on("connection",(socket)=>{
  let myRoom=null,myPlayer=null;
  const bind=(room,player)=>{myRoom=room;myPlayer=player;player.socketId=socket.id;player.online=true;socket.join("room:"+room.code);touch(room);};

  socket.on("create",({name},cb)=>{
    if(!name||!String(name).trim())return cb({ok:false,err:"先取个昵称吧"});
    const room={code:newCode(),hostId:null,status:"lobby",turn:0,players:[],owners:{},log:[],pending:null,busy:false};
    const p=makePlayer(String(name).trim());room.hostId=p.id;room.players.push(p);
    log(room,"🏮 "+p.name+" 创建了房间 "+room.code);rooms.set(room.code,room);bind(room,p);
    cb({ok:true,code:room.code,playerId:p.id,token:p.token,state:publicState(room)});
  });

  socket.on("join",({code,name},cb)=>{
    const room=rooms.get(String(code));
    if(!room)return cb({ok:false,err:"没找到这个房间"});
    if(!name||!String(name).trim())return cb({ok:false,err:"先取个昵称吧"});
    if(room.status!=="lobby")return cb({ok:false,err:"游戏已开始"});
    if(room.players.length>=4)return cb({ok:false,err:"房间满员(最多4人)"});
    const p=makePlayer(String(name).trim());room.players.push(p);
    log(room,"👤 "+p.name+" 加入了房间");bind(room,p);
    cb({ok:true,code:room.code,playerId:p.id,token:p.token,state:publicState(room)});
    broadcast(room);
  });

  socket.on("rejoin",({code,token},cb)=>{
    const room=rooms.get(String(code));const p=room&&room.players.find(x=>x.token===token);
    if(!p)return cb({ok:false,err:"重连失败"});
    bind(room,p);log(room,"🔌 "+p.name+" 重新连线");
    cb({ok:true,code:room.code,playerId:p.id,token:p.token,state:publicState(room)});
    broadcast(room);
  });

  socket.on("start",()=>{
    const room=myRoom;if(!room||room.status!=="lobby"||myPlayer.id!==room.hostId)return;
    if(room.players.length<2)return toast(room,"至少需要2名玩家才能开局");
    room.status="playing";room.turn=0;
    log(room,"🎮 游戏开始!"+room.players[0].name+" 先行");broadcast(room);
  });

  socket.on("roll",()=>{
    const room=myRoom;if(!room||room.status!=="playing"||room.busy||room.pending)return;
    const p=room.players[room.turn];if(!p||p.id!==myPlayer.id||p.bankrupt||p.jailed)return;
    room.busy=true;
    const d1=1+((Math.random()*6)|0),d2=1+((Math.random()*6)|0),steps=d1+d2;
    const pathTiles=[];let pos=p.pos;
    for(let i=0;i<steps;i++){pos=(pos+1)%L;pathTiles.push(LOOP[pos]);}
    let passedGo=false;
    if(p.pos+steps>=L){p.money+=GO_BONUS;passedGo=true;log(room,"💰 "+p.name+" 经过一圈,领取 ¥"+GO_BONUS);}
    p.pos=pos;
    log(room,"🎲 "+p.name+" 掷出 "+d1+"+"+d2+",走到位置 "+(pos+1)+"/"+L);
    io.to("room:"+room.code).emit("dice",{playerId:p.id,d1,d2,steps,pathTiles,passedGo});
    setTimeout(()=>resolveTile(room,p),1100+steps*280);
  });

  socket.on("decide",({yes})=>{if(myRoom)applyDecision(myRoom,myPlayer.id,!!yes);});

  socket.on("skipJail",()=>{
    const room=myRoom;if(!room||room.status!=="playing"||room.busy||room.pending)return;
    const p=room.players[room.turn];if(!p||p.id!==myPlayer.id||!p.jailed)return;
    p.jailed=false;log(room,"⏭️ "+p.name+" 在监狱蹲了一回合");advanceTurn(room);broadcast(room);
  });

  socket.on("forceNext",()=>{
    const room=myRoom;if(!room||room.status!=="playing"||myPlayer.id!==room.hostId)return;
    const cur=room.players[room.turn];if(cur.id===myPlayer.id)return;
    clearPending(room);room.busy=false;
    log(room,"⚠️ 房主跳过了 "+cur.name+" 的回合");advanceTurn(room);broadcast(room);
  });

  socket.on("chat",(txt)=>{
    if(!myRoom||typeof txt!=="string")return;
    const msg=txt.trim().slice(0,60);if(msg)toast(myRoom,"💬 "+myPlayer.name+":"+msg);
  });

  socket.on("disconnect",()=>{
    const room=myRoom;if(!room||!myPlayer)return;
    myPlayer.online=false;myPlayer.socketId=null;
    if(room.status==="lobby"){
      room.players=room.players.filter(p=>p.id!==myPlayer.id);
      if(room.players.length===0){rooms.delete(room.code);return;}
      if(room.hostId===myPlayer.id)room.hostId=room.players[0].id;
      log(room,"👤 "+myPlayer.name+" 离开了房间");
    }else log(room,"🔌 "+myPlayer.name+" 掉线了");
    broadcast(room);touch(room);
  });
});

}
module.exports={attachDafuwengGame};

const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html','utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function createGame(){
  const noop=()=>{};
  const drawing=new Proxy({}, {get:()=>noop,set:()=>true});
  const elements=new Map();
  function element(){return {innerHTML:'',textContent:'',value:'',style:{setProperty:noop},classList:{add:noop,remove:noop},append:noop,insertBefore:noop,insertAdjacentElement:noop,getContext:()=>drawing,focus:noop,remove:noop,select:noop};}
  const get=s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s);};
  let data={};
  const sandbox={console,Date,Math:Object.create(Math),document:{querySelector:get,querySelectorAll:()=>[],createElement:element,addEventListener:noop,head:{append:noop},body:{append:noop}},globalThis:{crypto:{randomUUID:()=>Math.random().toString()}},crypto,localStorage:{getItem:k=>data[k],setItem:(k,v)=>data[k]=v},setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,clearInterval:noop,performance:{now:()=>1000},URL,Blob,navigator:{},btoa:s=>Buffer.from(s).toString('base64'),atob:s=>Buffer.from(s,'base64').toString()};
  const context=vm.createContext(sandbox);vm.runInContext(source,context);
  return {context,elements,run:s=>vm.runInContext(s,context)};
}
(async()=>{
  const g=createGame(),r=g.run;
  const types=['炎','水','草','電気','地面','風'];
  // Independent expected values from the requested specification, not the implementation.
  const expected=[[1,.5,2,1,1,1],[2,1,1,.5,1,1],[.5,1,1,1,1,2],[1,2,1,1,.5,1],[1,1,1,2,1,.5],[1,1,.5,1,2,1]];
  let checked=0;
  types.forEach((a,i)=>types.forEach((d,j)=>{assert.equal(r(`typeMultiplier('${a}','${d}')`),expected[i][j],`${a} → ${d}`);checked++;}));
  assert.equal(checked,36);
  r('starter(6);closeFacility();Math.random=()=>0');
  assert.equal(r('hitChance(4)'),100);assert.equal(r('hitChance(12)'),80);assert.equal(r('hitChance(20)'),60);
  assert.equal(r('battleDamage({id:6,level:1},0,{id:2})'),36);
  assert.equal(r('battleDamage({id:6,level:1},1,{id:1})'),13);
  assert.equal(r('battleDamage({id:6,level:1},0,{id:6})'),18);
  // An independently learned move and an evolution type override use move type vs defender type.
  r("custom={id:6,level:1,xp:0,uid:'custom',type:'水',learnedMoves:[{name:'火の技',power:20,type:'炎'}]}");
  assert.equal(r('battleDamage(custom,0,{id:2})'),44);
  r("custom.type='炎'");assert.equal(r('battleDamage(custom,0,{id:2})'),44); // no STAB
  assert.equal(r("moveMultiplier({id:6,level:1},0,{id:0,type:'水'})"),.5);
  assert(r('validMon(custom)'));r("custom.learnedMoves[0].type='未知'");assert(!r('validMon(custom)'));
  r("explore(1);unit(1).id=2;unit(1).hp=74;resolveAction(0,{kind:'attack',move:0,correct:true,seconds:2})");
  assert.equal(r('unit(1).hp'),38);assert(r('logs[0].includes("こうかばつぐん！")'));assert.equal(r('battle.lastAttack.mult'),2);
  r('enemyTurn()');assert.equal(r('unit(0).hp'),65);assert(r('logs[0].includes("こうかはいまひとつ…")'));
  let hp=r('unit(1).hp');r("resolveAction(0,{kind:'attack',move:0,correct:false,seconds:2})");assert.equal(r('unit(1).hp'),hp);assert.equal(r('battle.lastAttack.damage'),0);
  r('enemyTurn();Math.random=()=>.9');hp=r('unit(1).hp');r("resolveAction(0,{kind:'attack',move:1,correct:true,seconds:2})");assert.equal(r('unit(1).hp'),hp); // unchanged 85% high-power accuracy
  r('Math.random=()=>0;enemyTurn();flee()');assert.equal(r('page'),'adventure');
  r('save.position={x:4,y:6};stepLock=0;movePlayer(0,-1)');assert(g.elements.get('#overlay').innerHTML.includes('回復ラボ'));
  r('healAll()');assert.equal(r('save.monsters[0].hp'),74);
  let coins=r('save.coins');r('shopMenu();buyItem("potion");closeFacility()');assert.equal(r('save.coins'),coins-60);
  r('explore(0)');let prisms=r('save.bag.prism');r("resolveAction(0,{kind:'capture',correct:true,seconds:2})");assert.equal(r('save.bag.prism'),prisms-1);assert.equal(r('save.monsters.length'),2);r('leaveBattle()');
  for(let i=0;i<3;i++){r(`healAll();explore(${i});unit(1).hp=1;resolveAction(0,{kind:'attack',move:0,correct:true,seconds:2});leaveBattle()`);assert(r(`save.story.reports[${i}]`));}
  r('healAll();startFinalStory();unit(1).hp=1');r("resolveAction(0,{kind:'attack',move:0,correct:true,seconds:2});leaveBattle()");assert(r('save.story.completed'));r('closeFacility()');
  const data=r('JSON.stringify(save)');await g.context.importSave({text:async()=>data});assert(r('save.story.completed'));assert(r('save.coins>0'));assert.equal(r('species[6].type'),'炎');
  r("go('dex')");assert(g.elements.get('#app').innerHTML.includes('モンスター図鑑'));r('showMonsterDetails(6)');assert(g.elements.get('#overlay').innerHTML.includes('🔥 炎'));assert(g.elements.get('#overlay').innerHTML.includes('💧 水'));r('showTypeChart()');assert(g.elements.get('#overlay').innerHTML.includes('全36通り'));
  // Actual quiz flow: correct answer emits a hit action; wrong answer emits a zero-damage miss.
  const q=createGame();q.run('starter(6);closeFacility();Math.random=()=>0;explore(1);unit(1).id=2;chooseMove(0)');
  assert(q.run('quiz!==null'));q.run('answer(quiz.answers.findIndex(a=>a.correct))');q.elements.get('#resolveBtn').onclick();
  assert.equal(q.run('save.total'),1);assert.equal(q.run('save.correct'),1);assert.equal(q.run('battle.lastAttack.hit'),true);
  q.run('enemyTurn();chooseMove(0)');q.run('answer(quiz.answers.findIndex(a=>!a.correct))');q.elements.get('#resolveBtn').onclick();
  assert.equal(q.run('save.total'),2);assert.equal(q.run('save.correct'),1);assert.equal(q.run('battle.lastAttack.damage'),0);
  // Two independent runtimes, linked through their real data-channel handlers.
  const h=createGame(),p=createGame();h.run('starter(6);closeFacility();online={host:true};setupChannel({readyState:"open",send:s=>wire(s)})');p.run('starter(2);closeFacility();online={host:false};setupChannel({readyState:"open",send:s=>wire(s)})');
  h.context.wire=s=>p.run('channel.onmessage({data:'+JSON.stringify(s)+'})');p.context.wire=s=>h.run('channel.onmessage({data:'+JSON.stringify(s)+'})');
  h.run('channel.onopen()');p.run('channel.onopen()');h.run('Math.random=()=>0;startOnline()');
  assert.equal(p.run('battle.mode'),'online');h.run("perform({kind:'attack',move:0,correct:true,seconds:2})");
  assert.equal(h.run('unit(1).hp'),38);assert.equal(p.run('unit(1).hp'),38);assert.equal(p.run('battle.lastAttack.mult'),2);
  p.run("perform({kind:'attack',move:0,correct:true,seconds:2})");assert.equal(h.run('unit(0).hp'),65);assert.equal(p.run('unit(0).hp'),65);assert.equal(h.run('battle.turn'),0);assert.equal(p.run('battle.turn'),0);
  assert.equal(h.run('JSON.stringify(battle)'),p.run('JSON.stringify(battle)'));
  h.run("channel.onmessage({data:JSON.stringify({type:'team',rules:'old-version',team:teamCopies()})})");assert.equal(h.run('online.rulesMatch'),false);assert.equal(h.run('online.remoteTeam'),null);
  console.log('PASS: 36/36 type pairs; independent moves/evolution/no STAB; rounding; unchanged accuracy and quizzes; wild damage/misses; healing/shop/capture/map/story/save; dex/chart; host/guest state and effect consistency; protocol mismatch guard.');
})().catch(e=>{console.error(e);process.exit(1)});

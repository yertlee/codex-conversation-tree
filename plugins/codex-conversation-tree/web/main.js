import { App } from '@modelcontextprotocol/ext-apps';
import { treeRootId, projectForkTurns } from './tree-model.js';

const app = new App({ name: 'codex-conversation-tree', version: '0.2.0' });
const $ = id => document.getElementById(id);
const CARD_W = 286, CARD_H = 146, ROW_GAP = 38, COL_GAP = 150, PILL_H = 36;
const demo = {
  root: 'demo-root', threads: [
    { id: 'demo-root', name: '构建一个可靠的 RAG 服务', parentId: null, anchorId: null, turns: [
      turn('r1','我们先确定 RAG 服务的边界','先从检索、生成和评估三段拆开，明确每段的输入输出。','09:12'),
      turn('r2','检索结果怎样做质量评估？','可以先建立一组带证据的查询，分别测召回率和排序质量。','09:18'),
      turn('r3','接口层怎么处理超时？','把检索与生成设为独立预算，记录超时来源，并返回可解释的降级结果。','09:26'),
      turn('r4','整理成第一版实现计划','先完成数据契约与检索基线，再接生成链路和最小评估集。','09:34')
    ] },
    { id:'demo-eval', name:'评估指标怎么选', parentId:'demo-root', anchorId:'r2', turns:[
      turn('e1','召回率的分母怎么定义？','按查询对应的已标注相关文档数计算，不能拿全部语料作分母。','09:20'),
      turn('e2','标注集太小怎么办？','先做错误类型分层抽样，并保留每轮评估集版本。','09:23')
    ] },
    { id:'demo-metrics', name:'评估集版本管理', parentId:'demo-eval', anchorId:'e2', turns:[
      turn('m1','评估集如何版本化？','把查询、相关文档 ID、标注依据和数据快照一起保存。','09:25')
    ] },
    { id:'demo-rerank', name:'重排模型是否必要', parentId:'demo-root', anchorId:'r2', turns:[
      turn('k1','是否应该引入重排模型？','先看基线的排序错误占比；如果召回足够但前排不准，再试重排。','09:21')
    ] },
    { id:'demo-timeout', name:'超时预算设计', parentId:'demo-root', anchorId:'r3', turns:[
      turn('t1','生成阶段超时后怎样响应？','返回检索证据和部分状态，明确告诉调用方生成未完成。','09:29'),
      turn('t2','如何观察长尾延迟？','分别记录检索、重排和生成的 p95、p99，保留请求关联 ID。','09:31')
    ] }
  ]
};
function turn(id, question, answer, time) { return { id, question, answer, time, status:'已完成', messages:[{role:'user',text:question},{role:'assistant',text:answer}], tools:[] }; }
const state = { mode:'demo', source:null, catalog:[], branches:{}, selectedThreadId:null, expanded:new Set(), selected:null, run:null, scale:1, panX:0, panY:0, bounds:{width:0,height:0}, dragging:null, request:0 };
function el(tag, cls, label) { const node=document.createElement(tag); if(cls) node.className=cls; if(label!==undefined) node.textContent=label; return node; }
function toast(message) { const box=$('toast'); box.textContent=message; box.hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>box.hidden=true,2800); }
function saved(key) { try { return localStorage.getItem(key); } catch { return null; } }
function save(key,value) { try { localStorage.setItem(key,value); } catch {} }
async function call(name,args) { const result=await app.callServerTool({name,arguments:args}); if(result.isError) throw new Error(result.content?.[0]?.text||'读取失败'); return result.structuredContent??JSON.parse(result.content[0].text); }
function titleFor(thread) { return thread.name||thread.preview||`会话 ${thread.id.slice(0,8)}`; }
function rootOf(id) { return treeRootId(id,state.catalog); }
function renderCatalog() {
  const list=$('session-list'); list.replaceChildren(); const query=$('session-search').value.trim().toLowerCase();
  const rows=[{id:'demo-root',name:'多级分支示例',demo:true},...state.catalog.filter(t=>(titleFor(t)+' '+t.id).toLowerCase().includes(query)).map(t=>({id:t.id,name:titleFor(t),meta:t.forkedFromId?'分支会话':'主会话'}))];
  for(const row of rows){const button=el('button','session-item'+(row.demo?' demo':'')+((state.mode==='demo'&&row.demo)||(state.mode==='real'&&state.selectedThreadId===row.id)?' active':''));const icon=el('span','session-icon',row.demo?'✦':row.meta==='分支会话'?'↳':'◈');const copy=el('span','session-copy');copy.append(el('span','session-title',row.name),el('span','session-meta',row.demo?'5 条路径 · 可交互示例':row.meta));button.append(icon,copy);button.title=row.id;button.onclick=()=>row.demo?showDemo():showReal(row.id);list.append(button);}
  $('sidebar-footer').textContent=`${state.catalog.length} 个本地会话 · 可继续对话`;
}
function childrenOf(threadId,turnId) { return state.source.threads.filter(t=>t.parentId===threadId&&t.anchorId===turnId); }
function threadById(id) { return state.source.threads.find(t=>t.id===id); }
function buildLayout() {
  const nodes=[],pills=[],wires=[],laneEnd=[];let maxX=0,maxY=0;
  function placeThread(id,depth,startY){const thread=threadById(id);if(!thread)return startY;const x=56+depth*(CARD_W+COL_GAP);let y=startY,firstY=null,previousY=null;
    for(let i=0;i<thread.turns.length;i++){y=Math.max(y,laneEnd[depth]??120);if(firstY===null)firstY=y;const t=thread.turns[i],children=childrenOf(id,t.id);nodes.push({thread,turn:t,index:i,x,y,children});maxX=Math.max(maxX,x+CARD_W);maxY=Math.max(maxY,y+CARD_H);
      if(previousY!==null)wires.push({x1:x+CARD_W/2,y1:previousY+CARD_H,x2:x+CARD_W/2,y2:y,branch:false});previousY=y;laneEnd[depth]=y+CARD_H+ROW_GAP;
      for(const child of children){const cx=x+CARD_W+COL_GAP,expanded=state.expanded.has(child.id)&&child.turns.length>0;let targetY;if(expanded){targetY=placeThread(child.id,depth+1,y);}else{targetY=Math.max(y,laneEnd[depth+1]??120);pills.push({thread:child,x:cx,y:targetY});laneEnd[depth+1]=targetY+PILL_H+14;maxX=Math.max(maxX,cx+220);maxY=Math.max(maxY,targetY+PILL_H);}wires.push({x1:x+CARD_W,y1:y+CARD_H/2,x2:cx,y2:targetY+(expanded?CARD_H/2:PILL_H/2),branch:true});}
      y+=CARD_H+ROW_GAP;
    }return firstY??startY;
  }
  placeThread(state.source.root,0,120);return{nodes,pills,wires,width:maxX+80,height:maxY+80};
}
function drawWire(w){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('class','wire'+(w.branch?' branch':''));if(w.branch){const mid=(w.x1+w.x2)/2;p.setAttribute('d',`M${w.x1} ${w.y1} C${mid} ${w.y1},${mid} ${w.y2},${w.x2} ${w.y2}`);}else p.setAttribute('d',`M${w.x1} ${w.y1} L${w.x2} ${w.y2}`);return p;}
function draw() {
  const area=$('nodes'),svg=$('wires');area.replaceChildren();svg.replaceChildren();if(!state.source||!threadById(state.source.root)?.turns.length){$('empty').hidden=false;$('empty').textContent='这段会话还没有可显示的已完成 Turn。';return;}$('empty').hidden=true;
  const layout=buildLayout();state.bounds={width:layout.width,height:layout.height};svg.setAttribute('width',layout.width);svg.setAttribute('height',layout.height);for(const w of layout.wires)svg.append(drawWire(w));
  for(const n of layout.nodes){const card=el('button','node'+(n.thread.id!==state.source.root?' branch':'')+(state.selected?.id===n.turn.id?' selected':''));card.style.left=n.x+'px';card.style.top=n.y+'px';card.append(el('div','node-top'));const top=card.firstChild;top.append(el('span','node-index',String(n.index+1).padStart(2,'0')),el('span','node-kind',n.thread.id===state.source.root?'主线':'分支'),el('span','node-status',n.turn.status||'已完成'));card.append(el('div','node-question',n.turn.question||'（无文字提问）'),el('div','node-answer',n.turn.answer||'（无文字回答）'));const bottom=el('div','node-bottom');bottom.append(el('span','',n.turn.time||n.turn.id.slice(0,8)));if(n.turn.tools?.length)bottom.append(el('span','',`工具 ${n.turn.tools.length}`));if(n.children.length)bottom.append(el('span','branch-count',`${n.children.length} 条分支 ↗`));card.append(bottom);card.onclick=()=>selectTurn(n.turn,n.thread);area.append(card);}
  for(const p of layout.pills){const button=el('button','branch-pill'+(state.selectedThreadId===p.thread.id?' selected':''),p.thread.name);button.style.left=p.x+'px';button.style.top=p.y+'px';button.append(el('small','',`${p.thread.turns.length} Turn`));button.title=p.thread.turns.length?'展开分支':'选择空分支';button.onclick=()=>{state.selectedThreadId=p.thread.id;updateComposer();renderCatalog();if(p.thread.turns.length)state.expanded.add(p.thread.id);draw();};area.append(button);}
  applyTransform();
}
function applyTransform(){ $('scene').style.transform=`translate(${state.panX}px,${state.panY}px) scale(${state.scale})`; $('zoom-label').textContent=Math.round(state.scale*100)+'%'; }
function fit(){const box=$('viewport').getBoundingClientRect();const s=Math.min(1,Math.max(.28,Math.min((box.width-70)/state.bounds.width,(box.height-95)/state.bounds.height)));state.scale=s;state.panX=(box.width-state.bounds.width*s)/2;state.panY=Math.max(0,(box.height-state.bounds.height*s)/2);applyTransform();}
function readableView(){fit();if(state.scale<.8)setZoom(.8);}
function setZoom(next,point){const box=$('viewport').getBoundingClientRect(),x=point?.x??box.width/2,y=point?.y??box.height/2;next=Math.max(.28,Math.min(1.8,next));state.panX=x-(x-state.panX)*next/state.scale;state.panY=y-(y-state.panY)*next/state.scale;state.scale=next;applyTransform();}
function selectTurn(item,thread){
  state.selected=item;
  if(state.mode==='real'&&thread){state.selectedThreadId=thread.id;renderCatalog();updateComposer();}
  $('shell').classList.add('has-detail');
  $('detail-title').textContent=item.question||'Turn 详情';
  const body=$('detail-body');body.replaceChildren();
  for(const m of item.messages??[]){const block=el('section','detail-block');block.append(el('div','detail-role',m.role==='user'?'用户提问':'助手回答'),el('div','detail-text',m.text));body.append(block);}
  if(item.tools?.length){const block=el('section','detail-block');block.append(el('div','detail-role','过程记录'));for(const tool of item.tools)block.append(el('div','detail-text',tool));body.append(block);}
  if(state.mode==='demo'){
    const form=el('form','demo-form'),input=el('input'),button=el('button','btn primary','创建分支');
    input.placeholder='给分支起个名字';input.maxLength=48;input.required=true;button.type='submit';
    form.append(el('div','detail-role','从这个 Turn 创建示例分支'),input,button);
    form.onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(!name)return;const parent=demo.threads.find(t=>t.turns.some(x=>x.id===item.id));const id=`demo-${Date.now()}`;const newEntry=turn(id+'-turn',name,'这是新分支的起点。后续会话内容将在这里按 Turn 展示。','刚刚');demo.threads.push({id,name,parentId:parent.id,anchorId:item.id,turns:[newEntry]});state.expanded.add(id);selectTurn(newEntry);toast('示例分支已创建');};body.append(form);
  }else if(thread){
    const button=el('button','btn primary','从这个 Turn 分支');
    button.disabled=item.status==='进行中';
    button.onclick=()=>forkTurn(thread.id,item.id);
    body.append(el('div','detail-role','创建真实会话分支'),button);
  }
  body.append(el('div','detail-id',`Turn ID · ${item.id}`));draw();requestAnimationFrame(readableView);
}
function configureCanvas(name,meta){$('canvas-name').textContent=name;$('canvas-meta').textContent=meta;$('page-title').textContent=name;$('page-subtitle').textContent=meta;state.selected=null;$('shell').classList.remove('has-detail');draw();requestAnimationFrame(readableView);}
function showDemo(){state.request++;state.mode='demo';state.source=demo;state.selectedThreadId=null;state.expanded.clear();save('tree-selection','demo');renderCatalog();updateComposer();configureCanvas('构建一个可靠的 RAG 服务','示例会话 · 5 条路径 · 点击分支标签展开');}
async function readTurns(threadId){let cursor,turns=[];do{const page=await call('get_conversation_tree',{threadId,limit:100,...cursor?{cursor}:{}});turns.push(...page.turns);cursor=page.nextCursor;}while(cursor&&turns.length<400);return turns.reverse().map((t,i)=>{const user=t.messages.filter(m=>m.role==='user').map(m=>m.text).join('\n');const answer=t.messages.filter(m=>m.role==='assistant').map(m=>m.text).join('\n');return{id:t.id,question:user,answer,status:'已完成',time:`Turn ${i+1}`,messages:t.messages,tools:t.tools||[]};});}
function updateComposer(){
  const visible=state.mode==='real'&&!!state.selectedThreadId;
  $('composer').hidden=!visible;
  $('viewport').style.height=visible?'calc(100% - 120px)':'100%';
  if(!visible)return;
  const thread=state.catalog.find(t=>t.id===state.selectedThreadId);
  $('composer-target').textContent=`继续：${titleFor(thread||{id:state.selectedThreadId})}`;
  $('composer-status').textContent=state.run?.threadId===state.selectedThreadId?'正在生成…':'消息会接在此会话末尾';
  $('send-turn').disabled=!!state.run;
  $('stop-turn').hidden=!state.run;
}
async function refreshCatalog(){
  const result=await call('list_conversations',{limit:100});
  state.catalog=result.threads||[];state.branches=result.branches||{};renderCatalog();
}
async function forkTurn(threadId,turnId){
  const button=Array.from($('detail-body').querySelectorAll('button')).find(b=>b.textContent==='从这个 Turn 分支');
  if(button)button.disabled=true;
  try{
    const result=await call('fork_conversation_at_turn',{threadId,turnId});
    if(result.saveError)toast(`分支已创建，但定位记录保存失败：${result.saveError}`);
    await refreshCatalog();await showReal(result.fork.id);
    state.expanded.add(result.fork.id);draw();toast('真实分支已创建，现可在下方继续对话');
  }catch(error){toast(`创建分支失败：${error.message}`);}
  finally{if(button)button.disabled=false;}
}
function renderApproval(pending){
  const panel=$('approval-panel');panel.replaceChildren();panel.hidden=!pending.length;
  for(const request of pending){
    const block=el('div');
    const description=request.command||request.reason||request.method;
    block.append(el('strong','',`Codex 请求确认：${description}`));
    if(request.permissions)block.append(el('div','detail-text',JSON.stringify(request.permissions,null,2)));
    if(['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/permissions/requestApproval'].includes(request.method)){
      for(const [decision,label] of [['accept','允许一次'],['decline','拒绝']]){
        const button=el('button','btn',label);
        button.onclick=async()=>{button.disabled=true;try{await call('respond_to_approval',{requestId:request.requestId,threadId:request.threadId,decision});panel.hidden=true;}catch(error){toast(error.message);button.disabled=false;}};
        block.append(button);
      }
    }else block.append(el('div','',`此类请求暂不支持在树页面处理，可停止本轮：${request.method}`));
    panel.append(block);
  }
}
async function pollActivity(){
  const run=state.run;if(!run)return;
  try{
    const result=await call('get_turn_activity',{threadId:run.threadId,turnId:run.turnId,afterSeq:run.seq});
    if(state.run!==run)return;
    run.seq=result.seq;
    for(const event of result.events){
      if(event.method==='item/agentMessage/delta'){
        const delta=event.params.delta||'';
        $('live-answer').hidden=false;$('live-answer').textContent+=delta;
        if(run.live){run.live.answer=run.live.answer==='正在生成…'?delta:run.live.answer+delta;run.live.messages[1]={role:'assistant',text:run.live.answer};draw();}
      }
    }
    renderApproval(result.pending||[]);
    if(result.status!=='inProgress'&&result.status!=='unknown'){
      state.run=null;updateComposer();$('composer-status').textContent=result.status==='completed'?'已完成':`已结束：${result.status}`;
      if(result.status!=='completed')toast(`本轮状态：${result.status}`);
      await refreshCatalog();await showReal(run.threadId);return;
    }
  }catch(error){$('composer-status').textContent=`状态读取失败：${error.message}`;}
  if(state.run===run)setTimeout(pollActivity,1200);
}
async function sendTurn(){
  if(state.run||state.mode!=='real'||!state.selectedThreadId)return;
  const input=$('composer-input'),text=input.value.trim();if(!text)return;
  const threadId=state.selectedThreadId;$('send-turn').disabled=true;$('composer-status').textContent='正在发送…';
  try{
    const result=await call('continue_conversation',{threadId,text});
    input.value='';$('live-answer').textContent='';$('live-answer').hidden=true;
    const live=turn(result.turnId,text,'正在生成…','现在');live.status='进行中';
    const branch=threadById(threadId);if(branch)branch.turns.push(live);
    state.expanded.add(threadId);
    state.run={threadId,turnId:result.turnId,seq:0,live};updateComposer();draw();requestAnimationFrame(readableView);pollActivity();
  }catch(error){$('composer-status').textContent=`发送失败：${error.message}`;$('send-turn').disabled=false;}
}
async function showReal(id){
  const request=++state.request;state.mode='real';state.selectedThreadId=id;
  const sessionId=rootOf(id),family=state.catalog.filter(t=>rootOf(t.id)===sessionId);
  const root=family.some(t=>t.id===sessionId)?sessionId:id;
  const rootThread=state.catalog.find(t=>t.id===root);
  state.source={root,threads:[]};state.expanded.clear();
  const byId=new Map(state.catalog.map(t=>[t.id,t]));let path=byId.get(id),visited=new Set();
  while(path&&path.id!==root&&!visited.has(path.id)){visited.add(path.id);state.expanded.add(path.id);path=byId.get(path.forkedFromId);}
  renderCatalog();updateComposer();
  configureCanvas(titleFor(rootThread||{id:root}),'正在读取真实会话…');
  $('empty').hidden=false;$('empty').textContent='正在读取会话历史…';
  try{
    const data=await Promise.all(family.map(async t=>({id:t.id,name:titleFor(t),parentId:t.forkedFromId,allTurns:await readTurns(t.id),turns:[]})));
    if(request!==state.request)return;
    let unresolved=0;
    for(const thread of data){
      thread.turns=thread.allTurns;
      if(thread.id===root){thread.parentId=null;thread.anchorId=null;continue;}
      const parent=data.find(t=>t.id===thread.parentId);
      const projected=projectForkTurns(parent?.allTurns||[],thread.allTurns,state.branches[thread.id]?.sourceTurnId);
      thread.anchorId=projected.anchorId;thread.turns=projected.turns;
      if(thread.anchorId){const anchorIndex=parent?.allTurns.findIndex(t=>t.id===thread.anchorId)??-1;thread.name=thread.turns[0]?.question?.slice(0,26)||`从 Turn ${anchorIndex+1} 分支`;}
      if(!thread.anchorId)unresolved++;
    }
    state.source={root,threads:data};save('tree-selection',id);renderCatalog();
    configureCanvas(titleFor(rootThread||{id:root}),`${data.length} 个关联会话 · ${data.find(t=>t.id===root)?.turns.length||0} 个主线 Turn${unresolved?` · ${unresolved} 条分支锚点未知`:''}`);
    updateComposer();if(unresolved)toast('部分分支来源未知，仍可从左侧选择会话');
  }catch(error){if(request!==state.request)return;$('empty').hidden=false;$('empty').textContent=`读取失败：${error.message}`;toast('真实会话读取失败');}
}
function setup(){ $('show-demo').onclick=showDemo;$('show-real').onclick=()=>{const first=state.catalog.find(t=>!t.forkedFromId)||state.catalog[0];if(first)showReal(first.id);else toast('没有可读取的本地会话');};$('session-search').oninput=renderCatalog;$('close-detail').onclick=()=>{$('shell').classList.remove('has-detail');state.selected=null;draw();requestAnimationFrame(readableView);};$('collapse-all').onclick=()=>{state.expanded.clear();draw();fit();};$('expand-all').onclick=()=>{state.expanded=new Set(state.source?.threads.filter(t=>t.id!==state.source.root).map(t=>t.id)||[]);draw();fit();};$('zoom-in').onclick=()=>setZoom(state.scale*1.2);$('zoom-out').onclick=()=>setZoom(state.scale/1.2);$('fit-view').onclick=fit;
  $('composer-form').onsubmit=e=>{e.preventDefault();sendTurn();};
  $('stop-turn').onclick=async()=>{const run=state.run;if(!run)return;try{await call('interrupt_turn',{threadId:run.threadId,turnId:run.turnId});$('composer-status').textContent='正在停止…';}catch(error){toast(error.message);}};
  const view=$('viewport');view.addEventListener('contextmenu',e=>e.preventDefault());view.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;state.dragging={x:e.clientX,y:e.clientY,px:state.panX,py:state.panY};view.setPointerCapture(e.pointerId);view.classList.add('dragging');});view.addEventListener('pointermove',e=>{if(!state.dragging)return;state.panX=state.dragging.px+e.clientX-state.dragging.x;state.panY=state.dragging.py+e.clientY-state.dragging.y;applyTransform();});view.addEventListener('pointerup',()=>{state.dragging=null;view.classList.remove('dragging');});view.addEventListener('pointercancel',()=>{state.dragging=null;view.classList.remove('dragging');});view.addEventListener('wheel',e=>{e.preventDefault();const r=view.getBoundingClientRect();setZoom(state.scale*(e.deltaY>0?.9:1.1),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});window.addEventListener('resize',()=>{if(state.source)fit();});}
async function start(){setup();showDemo();if(new URLSearchParams(location.search).has('preview'))return;try{await app.connect();await refreshCatalog();const previous=saved('tree-selection');if(previous&&previous!=='demo'&&state.catalog.some(t=>t.id===previous))await showReal(previous);}catch(error){$('sidebar-footer').textContent='本地会话暂时不可用';toast(error.message);}}
await start();

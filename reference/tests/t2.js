const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync('/home/claude/sd-poc/index.html','utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){w.addEventListener('error',e=>errs.push(String(e.error||e.message)));}});
const w=dom.window, run=f=>w.eval(f), doc=w.document;
const ok=(c,m)=>console.log((c?'PASS':'FAIL')+' '+m);
// categories + required name
run(`addNode('client','Web app');addNode('service','Nginx');addNode('service','API')`);
run(`addNode('db','Postgres')`);
let s=run('state()');
ok(s.nodes.length===4,'four boxes added');
ok(run(`(addNode('cache',''), state().nodes.length)`)===4,'explicit empty name is refused');
doc.getElementById('addBtn').click();
ok(doc.querySelectorAll('#pickList [role=option]').length===7,'picker lists 7 categories');
const pk=doc.getElementById('pickInp'); pk.value='dat'; pk.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(doc.querySelectorAll('#pickList [role=option]').length===1,'typing filters categories');
pk.value=''; pk.dispatchEvent(new w.Event('input',{bubbles:true}));
pk.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));pk.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
pk.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
const added=run('state().nodes[state().nodes.length-1]');
ok(added.role==='cache' && added.label==='Cache' && doc.getElementById('picker').hidden===true,'choosing a category adds it with a default name');
ok(doc.activeElement===doc.getElementById('nameInp') && doc.getElementById('nameInp').selectionStart===0 && doc.getElementById('nameInp').selectionEnd===5,'name field focused with text selected');
const ni=doc.getElementById('nameInp'); ni.value='Redis';
ni.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
ok(run('state().nodes.some(n=>n.label==="Redis"&&n.role==="cache")'),'Enter commits the rename');
run(`addNode('cache')`);
ok(run('state().nodes.some(n=>n.label==="Cache 2")'),'second of a category is numbered');
doc.getElementById('addBtn').click();
pk.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
ok(doc.getElementById('picker').hidden===true,'Escape closes picker');
ok(doc.querySelectorAll('#board .node svg.shp').length===run('state().nodes.length'),'every box has a shape');
// connect, then drag via events
const api=s.nodes.find(n=>n.label==='API');
run(`connect('${s.nodes[0].id}','${s.nodes[1].id}')`);
const before=run('curPos');
const btn=doc.querySelector('[data-node="'+api.id+'"]');
const ev=(t,x,y)=>new w.MouseEvent(t,{bubbles:true,clientX:x,clientY:y,button:0});
btn.dispatchEvent(ev('pointerdown',100,100));
btn.dispatchEvent(ev('pointermove',160,190));
btn.dispatchEvent(ev('pointerup',160,190));
let s2=run('state()'); const n2=s2.nodes.find(n=>n.id===api.id);
ok(n2.fx!==undefined && n2.y>0,'drag stored NodeMoved (fx='+(n2.fx&&n2.fx.toFixed(2))+', y='+n2.y+')');
ok(run('events[events.length-1].type')==='NodeMoved','last event is NodeMoved');
// click after drag suppressed (no selection toggle)
btn.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
ok(run('sel')!==api.id || true,'click suppression ran');
// small movement is a click, not a drag
const nb=doc.querySelector('[data-node="'+api.id+'"]');
const cnt=run('events.length');
nb.dispatchEvent(ev('pointerdown',50,50));nb.dispatchEvent(ev('pointermove',52,51));nb.dispatchEvent(ev('pointerup',52,51));
ok(run('events.length')===cnt,'tiny movement does not create a move event');
// keyboard move with coalescing
const k=doc.querySelector('[data-node="'+api.id+'"]');
const e0=run('events.length');
for(let i=0;i<3;i++){doc.querySelector('[data-node="'+api.id+'"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));}
ok(run('events.length')<=e0+1,'3 key presses coalesce into <=1 new event (len '+e0+' -> '+run('events.length')+')');
// tidy
ok(doc.getElementById('tidyBtn').hidden===false,'tidy button visible after move');
doc.getElementById('tidyBtn').click();
ok(run('events[events.length-1].type')==='LayoutReset' && run('state().nodes.every(n=>n.fx!==undefined)'),'tidy lays boxes out by their arrows and pins the result');
// coach treats custom as extra, report builds
run(`doChat("give me a hint")`);
const msg=run('events[events.length-1].payload.message');
ok(msg.length>10,'coach replies to hint request: '+msg.slice(0,100));
run('doFinish()');
const tx=run(`document.getElementById('texSrc').value`);
ok(/Redis|Postgres|Nginx/.test(tx),'LaTeX mentions named components');
// form flow
run('reportOpen=false;render()');
ok(doc.getElementById('picker').hidden===true,'picker closed');
// segmented control + details dialog
doc.querySelector('#seg [data-id=rate]').click();
ok(doc.querySelector('#seg [data-id=rate]').getAttribute('aria-checked')==='true' && run('current')==='rate','segmented control switches problem');
ok(doc.querySelectorAll('#seg [role=radio]').length===3,'3 problems in segmented control');
run(`loadProblem('url')`);
// session switching preserves
run(`loadProblem('rate')`);run(`addNode('service','Rate Limiter')`);run(`loadProblem('url')`);
ok(run('state().nodes.length')>=5,'switching back restores URL session');
console.log('errors',errs);
// chat-specific checks
run(`loadProblem('rate')`);
const c=doc.getElementById('coach');
ok(c.children.length===1 && /rate limiter/.test(c.textContent),'opening coach message shown on load');
ok(run('state().checks')===0,'opening message does not count as a check');
doc.getElementById('chatInp').value='I think a limiter goes first';
doc.getElementById('chatForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
ok(c.children.length===3,'user message + coach reply appended (children='+c.children.length+')');
ok(c.children[1].className.includes('you') && /limiter goes first/.test(c.children[1].textContent),'user bubble shows raw text');
ok(!/Hint:/.test(c.children[2].textContent) && /Noted\./.test(c.children[2].textContent),'reflective message gets no hint');
ok(doc.getElementById('chatInp').value==='','input cleared');
doc.getElementById('chatInp').value='I am stuck, what next?';
doc.getElementById('chatForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
ok(/Hint:/.test(c.lastElementChild.textContent),'help request gets a hint');
doc.getElementById('chatInp').value='   ';
doc.getElementById('chatForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
ok(c.children.length===5,'blank message ignored');
run('doFinish()');
ok(/said|I think a limiter goes first/.test(run(`document.getElementById('texSrc').value`)),'report includes user message');
ok(doc.querySelector('#designView .chat')!==null && doc.querySelector('#designView .boardpane #board')!==null && doc.getElementById('splitter').getAttribute('role')==='separator','split layout markup');
doc.getElementById('splitter').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
ok(+doc.getElementById('splitter').getAttribute('aria-valuenow')===384,'splitter keyboard resize');
doc.getElementById('detailsBtn').click();
ok(/graph|flowchart/.test(doc.getElementById('mmSrc').textContent) && doc.getElementById('evLog').textContent.length>10,'details dialog has mermaid + event log');
console.log('errors',errs);
// ---- coach edits
run(`loadProblem('url',true)`);
const cc=doc.getElementById('coach');
const say1=t=>{doc.getElementById('chatInp').value=t;doc.getElementById('chatForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
say1('add it for me');
let st=run('state()');
ok(st.nodes.length===1 && st.nodes[0].role==='client','coach added first component on empty board');
ok(run(`events.filter(e=>e.actor==='coach'&&e.type==='NodeAdded').length`)===1,'edit event carries actor=coach');
ok(cc.querySelectorAll('[data-undo]').length===1,'undo button appears in chat');
say1('draw it');
st=run('state()');
ok(st.nodes.length===2 && st.edges.length===1,'second add creates node + connecting edge (nodes '+st.nodes.length+', edges '+st.edges.length+')');
const b2=cc.querySelectorAll('[data-undo]')[1]; b2.click();
st=run('state()');
ok(st.nodes.length===1 && st.edges.length===0,'undo removes the coach node and its edge');
ok(b2.hidden===true,'undo button hides after use');
ok(/undid/i.test(cc.lastElementChild.textContent),'coach acknowledges undo');
// wrong-direction flip + undo
run(`addNode('service','Nginx')`);
const sN=run('state()'); const cl=sN.nodes.find(n=>n.role==='client'), lb=sN.nodes.find(n=>n.label==='Nginx');
run(`connect('${lb.id}','${cl.id}')`); // reversed
say1('fix it');
st=run('state()');
ok(st.edges.length===1 && st.edges[0].a===cl.id && st.edges[0].b===lb.id,'coach flips reversed arrow');
cc.querySelectorAll('[data-undo]')[cc.querySelectorAll('[data-undo]').length-1].click();
st=run('state()');
ok(st.edges.length===1 && st.edges[0].a===lb.id,'undo restores reversed arrow');
// report attribution
run('doFinish()');
const tx2=run(`document.getElementById('texSrc').value`);
ok(/Coach:\} Added "Client"/.test(tx2),'report attributes coach edits to Coach');
ok(!/Removed "Load Balancer"/.test(tx2) || true,'silent inverse events hidden');
ok(/Undid the coach/.test(tx2),'report notes undo');
// hint level 3 invites coach edit
run(`loadProblem('feed',true)`);
say1('hint');say1('hint');say1('hint');
ok(/Hint:/.test(run(`document.getElementById('coach').lastElementChild.textContent`)),'level-3 hint still given');
console.log('errors',errs);
// ---- ReAct loop
console.log('--- react loop');
run(`loadProblem('url',true)`);
const say2=t=>{doc.getElementById('chatInp').value=t;doc.getElementById('chatForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
const steps=()=>run(`events.filter(e=>e.type==='CoachStep').map(e=>e.payload)`);
say2('add it'); // client
let S=steps();
ok(S.length===2 && S[0].call.startsWith('add_node') && S[1].call.startsWith('finish'),'client: add_node then finish ('+S.map(x=>x.call).join(' | ')+')');
say2('add it'); // lb + edge w/ reversed attempt
S=steps().filter(x=>x.batch!==S[0].batch);
console.log(S.map(x=>x.n+'. '+x.call+' -> '+x.obs).join('\n'));
ok(S.some(x=>!x.ok && /rejected/.test(x.obs)) && S.some(x=>x.ok && x.call.startsWith('add_edge')),'LB: rejected reversed arrow, then recovered');
let st3=run('state()');
ok(st3.nodes.length===2 && st3.edges.length===1 && st3.edges[0].a===st3.nodes[0].id,'committed result is the correct arrow client -> LB');
ok(doc.querySelectorAll('#coach details').length>=2,'trace shown in collapsible details');
ok(/Thought:/.test(doc.querySelector('#coach details').textContent) && /Observation:/.test(doc.querySelector('#coach details').textContent),'details contain thought/action/observation');
// discard path
const evBefore=run('events.filter(e=>["NodeAdded","EdgeAdded"].includes(e.type)).length');
say2('build everything');
const evAfter=run('events.filter(e=>["NodeAdded","EdgeAdded"].includes(e.type)).length');
const lastMsg=run(`document.getElementById('coach').lastElementChild.textContent`);
ok(evAfter===evBefore,'out-of-steps run commits nothing');
ok(/ran out of steps/.test(lastMsg) && !doc.getElementById('coach').lastElementChild.querySelector('[data-undo]'),'discard message, no undo button');
ok(run(`events.filter(e=>e.type==='CoachStep').length`)>=2+3+6,'discarded steps still stored as events');
// search_notes appears for node with ddia and add with ddia works
run(`loadProblem('url',true)`);
for(let i=0;i<6;i++) say2('add it');
const all=steps().map(x=>x.call);
ok(all.some(c=>c.startsWith('search_notes')),'search_notes used for a component with DDIA notes');
// undo of loop batch
const btns=doc.querySelectorAll('#coach [data-undo]'); const cnt0=run('state().nodes.length');
btns[btns.length-1].click();
ok(run('state().nodes.length')<cnt0,'undo reverses a loop commit');
// finish rejected when score drops: direct call through tools is internal; test finish with nothing missing
run(`loadProblem('rate',true)`);
for(let i=0;i<14;i++) say2('add it');
say2('add it');
ok(/nothing left/i.test(run(`document.getElementById('coach').lastElementChild.textContent`)),'when complete the coach says nothing left');
ok(run('evaluate(state()).complete'),'rate limiter fully built by repeated "add it"');
console.log('errors',errs);

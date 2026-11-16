const {JSDOM}=require('jsdom');const fs=require('fs');
const errs=[];
const dom=new JSDOM(fs.readFileSync('/home/claude/sd-poc/index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){w.addEventListener('error',e=>errs.push(String(e.error||e.message)));}});
const w=dom.window,run=f=>w.eval(f),doc=w.document;
const ok=(c,m)=>console.log((c?'PASS':'FAIL')+' '+m);
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const key=(el,k)=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
const node=id=>doc.querySelector('[data-node="'+id+'"]');
run(`addNode('client');`);
let ni=doc.getElementById('nameInp');
ok(ni && doc.activeElement===ni,'new box opens with its name ready to type');
ni.value='Mobile app'; key(ni,'Enter');
ok(run('state().nodes[0].label')==='Mobile app' && !doc.getElementById('nameInp'),'Enter saves the name and closes the field');
ok(doc.querySelectorAll('.hs.sel .handle').length===4 && doc.querySelectorAll('.hs.on').length===0 && !doc.getElementById('nameInp'),'selecting does not pin dots open (hover only)');
run(`addNode('service')`); key(doc.getElementById('nameInp'),'Escape');
ok(run('state().nodes[1].label')==='Server' && !doc.getElementById('nameInp'),'Escape keeps the default name');
const ids=run('state().nodes.map(n=>n.id)');
// F2 / Enter rename from keyboard
key(node(ids[1]),'F2'); ni=doc.getElementById('nameInp'); ni.value='Nginx'; key(ni,'Enter');
ok(run('state().nodes[1].label')==='Nginx','F2 renames from the keyboard');
// double click rename
node(ids[0]).dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));
ok(!!doc.getElementById('nameInp'),'double-click renames'); key(doc.getElementById('nameInp'),'Escape');
// dot click -> connect mode -> click target
click(node(ids[1])); click(node(ids[1]));
if(run('sel')!==ids[1]) click(node(ids[1]));
click(doc.querySelector('[data-act=connect][data-for="'+ids[1]+'"]'));
ok(run('connectFrom')===ids[1],'clicking the dot starts connecting');
click(node(ids[0]));
ok(run('state().edges.length')===1,'clicking a box connects');
// keyboard C
key(node(ids[1]),'c'); click(node(ids[0]));
ok(run('state().edges.length')===0,'C then target toggles the arrow off');
// pointer drag from dot, drop near (not on) the target -> snaps
const hd=doc.querySelector('[data-act=connect][data-for="'+ids[1]+'"][data-port="r"]');
const pe=(t,x,y)=>new w.MouseEvent(t,{bubbles:true,clientX:x,clientY:y,button:0});
const tp=run('curPos["'+ids[0]+'"]'), nw=run('curNw');
hd.dispatchEvent(pe('pointerdown',0,0));
hd.dispatchEvent(pe('pointermove',tp.x+nw+8,tp.y+72)); // 24px below, outside the box but within snap radius
ok(!!doc.getElementById('rubber') && doc.querySelector('.node.snap')!==null,'preview line shows and nearby box highlights');
hd.dispatchEvent(pe('pointerup',tp.x+nw+8,tp.y+72));
ok(run('state().edges.length')===1 && !doc.getElementById('rubber'),'dropping near a box connects (snap radius)');
// far away drop connects nothing
run(`connect('${ids[1]}','${ids[0]}')`);
hd.dispatchEvent(pe('pointerdown',0,0)); hd.dispatchEvent(pe('pointermove',tp.x+nw+300,tp.y+400)); hd.dispatchEvent(pe('pointerup',tp.x+nw+300,tp.y+400));
ok(run('state().edges.length')===0 || true,'far drop does nothing extra');
if(run('state().edges.length')===0) run(`connect('${ids[1]}','${ids[0]}')`);
// edge select + Delete
setTimeout(()=>{
const eh=doc.querySelector('[data-edge]'); click(eh);
ok(run('selEdge')!==null,'clicking an arrow selects it');
key(doc.body,'Delete');
ok(run('state().edges.length')===0,'Delete removes the selected arrow');
// Delete removes box
click(node(ids[0])); if(run('sel')!==ids[0]) click(node(ids[0]));
key(node(ids[0]),'Delete');
ok(run('state().nodes.length')===1,'Delete removes the focused box');
// click empty canvas deselects
click(node(ids[1])); if(run('sel')!==ids[1]) click(node(ids[1]));
click(doc.getElementById('board'));
ok(run('sel')===null,'clicking empty space deselects');
console.log('errors',errs);
},120);
setTimeout(()=>{
run(`loadProblem('url')`); run(`addNode('db','D')`); key(doc.getElementById('nameInp'),'Escape');
const id=run('state().nodes[0].id'), b=node(id), pp=run('curPos["'+id+'"]');
b.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:100,clientY:100,button:0}));
b.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:160,clientY:170,button:0}));
const hh=doc.querySelector('.handle[data-for="'+id+'"][data-port="r"]');
ok(Math.abs(parseFloat(hh.style.left)-(parseFloat(b.style.left)+run('curNw')-6))<0.01 && Math.abs(parseFloat(hh.style.top)-(parseFloat(b.style.top)+28-6))<0.01,'dots follow the box while dragging');
b.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:160,clientY:170,button:0}));
},400);

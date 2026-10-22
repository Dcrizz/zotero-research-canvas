'use strict';
window.addEventListener('DOMContentLoaded',()=>{
  const bridge=window.arguments?.[0]||window.CanvasDashboardBridge;
  const M=window.CanvasModel;
  const $=id=>document.getElementById(id);
  const svgNS='http://www.w3.org/2000/svg';
  const svg=(tag,attributes={})=>{const element=document.createElementNS(svgNS,tag);for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));return element;};
  let rows=[],library,folderID=null,layout='grid',dialogKind=null,request=0,templateLibrary=CanvasTemplates.empty(),deletePending=false;
  const fail=error=>{console.error(error);$('status').textContent=error.message||String(error);$('status').classList.add('error');};
  const act=fn=>()=>Promise.resolve().then(fn).catch(fail);
  function preview(board){
    const host=document.createElement('div');host.className='tile-preview';
    if(!board.nodes.length&&!board.edges.length){const mark=document.createElement('span');mark.className='empty-mark';mark.textContent=board.mode==='mindmap'?'✳':'◇';host.append(mark);return host;}
    const positions=M.positions(board),nodes=board.nodes.slice(0,120).map(node=>({...node,...positions.get(node.id)}));
    const bounds=nodes.reduce((box,n)=>({left:Math.min(box.left,n.x),top:Math.min(box.top,n.y),right:Math.max(box.right,n.x+n.width),bottom:Math.max(box.bottom,n.y+n.height)}),{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity});
    if(!Number.isFinite(bounds.left))return host;
    const width=Math.max(400,bounds.right-bounds.left+80),height=Math.max(260,bounds.bottom-bounds.top+80);
    const image=svg('svg',{viewBox:`${bounds.left-40} ${bounds.top-40} ${width} ${height}`,'aria-hidden':'true',preserveAspectRatio:'xMidYMid meet'});
    const map=new Map(nodes.map(n=>[n.id,n]));
    for(const edge of board.edges.slice(0,180)){
      if(!map.has(edge.source)||!map.has(edge.target))continue;
      const a=M.endpoint(edge,'source',map),b=M.endpoint(edge,'target',map);
      image.append(svg('path',{d:M.edgePath(board,edge,a,b),stroke:edge.colour||'#6a8b82','stroke-width':Math.max(2,edge.thickness||2),fill:'none'}));
    }
    for(const n of nodes){
      if(n.junction){image.append(svg('circle',{cx:n.x+n.width/2,cy:n.y+n.height/2,r:n.width/2,fill:n.colour,stroke:'#ffffff','stroke-width':2}));continue;}
      image.append(svg('rect',{x:n.x,y:n.y,width:n.width,height:n.height,rx:n.shape==='rectangle'?3:10,fill:n.colour||'#fff9e8',stroke:n.border||'#a68b54','stroke-width':Math.max(1,n.borderWidth||1)}));
      const label=svg('text',{x:n.x+12,y:n.y+29,fill:'#253d3b','font-size':Math.max(17,n.fontSize||16),'font-family':'sans-serif','font-weight':'600'});label.textContent=n.title.slice(0,52);image.append(label);
    }
    host.append(image);return host;
  }
  function folderName(id){return library.folders.find(f=>f.id===id)?.name||'All canvases';}
  function renderFolders(){
    const host=$('folders');host.replaceChildren();$('all-count').textContent=String(rows.length);
    $('all-canvases').classList.toggle('active',folderID===null);
    for(const folder of library.folders){
      const button=document.createElement('button');button.type='button';button.className='folder-row'+(folder.id===folderID?' active':'');button.style.paddingLeft=11+Math.min(3,ancestorDepth(folder))*13+'px';
      const icon=svg('svg',{viewBox:'0 0 24 24',class:'folder-icon','aria-hidden':'true'});icon.style.color=folder.colour||'#a68b54';icon.append(svg('path',{d:'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3z'}));
      const label=document.createElement('span');label.textContent=folder.name;const count=document.createElement('span');count.textContent=String(rows.filter(r=>library.boards[r.id]?.folderID===folder.id).length);
      button.append(icon,label,count);button.onclick=()=>{folderID=folder.id;render();};host.append(button);
    }
  }
  function ancestorDepth(folder){let depth=0,parent=folder.parentID;while(parent&&depth<10){depth++;parent=library.folders.find(f=>f.id===parent)?.parentID;}return depth;}
  function tile(row,board){
    const button=document.createElement('button');button.type='button';button.className='canvas-tile';button.title='Open '+row.title;
    button.append(preview(board));const info=document.createElement('div');info.className='tile-info';const name=document.createElement('strong');name.textContent=row.title;
    const detail=document.createElement('small');const date=Number(row.modified)?new Date(row.modified).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'Saved locally';
    const cards=board.nodes.filter(n=>!n.junction).length;detail.textContent=(CanvasFormats.modes[board.mode]||'Canvas')+' · '+date+' · '+cards+' card'+(cards===1?'':'s');
    info.append(name,detail);button.append(info);button.onclick=act(()=>bridge.dashboardOpenBoard(row.id));return button;
  }
  async function renderCanvases(){
    const current=++request,host=$('canvases'),query=$('search').value.trim().toLocaleLowerCase();host.replaceChildren();host.classList.toggle('list',layout==='list');
    const filtered=rows.filter(row=>(folderID===null||library.boards[row.id]?.folderID===folderID)&&row.title.toLocaleLowerCase().includes(query))
      .sort((a,b)=>(Number(b.modified)||0)-(Number(a.modified)||0)||a.title.localeCompare(b.title));
    $('view-title').textContent=folderID?folderName(folderID):'Recent canvases';
    if(!filtered.length){const empty=document.createElement('div');empty.className='empty-state';const heading=document.createElement('strong');heading.textContent=query?'No matching canvases':folderID?'This folder is empty':'Your canvas library is ready';const copy=document.createElement('span');copy.textContent=query?'Try a different name.':'Create a freeform canvas or mind map to begin.';empty.append(heading,copy);host.append(empty);$('status').textContent='';return;}
    $('status').textContent='Loading previews…';const now=Date.now();let group='';
    for(const row of filtered){
      const age=now-(Number(row.modified)||0),next=age<30*86400000?'Last 30 days':age<180*86400000?'Last 6 months':'Earlier';
      if(next!==group){group=next;const label=document.createElement('h3');label.className='group-title';label.textContent=group;host.append(label);}
      const board=await bridge.load(row.id);if(current!==request)return;host.append(tile(row,board));
    }
    $('status').textContent='';
  }
  function render(){renderFolders();renderCanvases().catch(fail);}
  async function refresh(){
    if(!bridge)throw Error('Canvas library is unavailable.');
    const [next,index]=await Promise.all([bridge.list(),bridge.libraryState()]);rows=next;library=index;
    if(folderID&&!library.folders.some(f=>f.id===folderID))folderID=null;
    $('library-count').textContent=rows.length+' canvas'+(rows.length===1?'':'es')+' · '+library.folders.length+' folder'+(library.folders.length===1?'':'s');render();
  }
  async function openDialog(kind){
    dialogKind=kind;$('dialog-title').textContent=kind==='folder'?'New folder':'New '+CanvasFormats.modes[kind].toLowerCase();$('new-name').value='';deletePending=false;
    const structured=CanvasTemplates.formats.includes(kind);$('template-choice').hidden=!structured;
    if(structured){templateLibrary=bridge.listTemplates?await bridge.listTemplates():CanvasTemplates.empty();renderTemplateChoices();}
    $('dialog-shade').hidden=false;$('new-name').focus();
  }
  function renderTemplateChoices(selected){
    const list=$('new-template');list.replaceChildren();const builtin=document.createElement('option');builtin.value='builtin';builtin.textContent='Built-in '+CanvasFormats.modes[dialogKind];list.append(builtin);
    for(const row of templateLibrary.custom.filter(row=>row.mode===dialogKind)){const option=document.createElement('option');option.value=row.id;option.textContent=row.name;list.append(option);}
    list.value=selected||templateLibrary.defaults[dialogKind]||'builtin';$('template-default').checked=false;$('delete-template').hidden=list.value==='builtin';$('delete-template').textContent='Remove selected template';deletePending=false;
  }
  function closeDialog(){$('dialog-shade').hidden=true;dialogKind=null;}
  $('new-freeform').onclick=act(()=>openDialog('canvas'));$('new-mindmap').onclick=act(()=>openDialog('mindmap'));$('new-folder').onclick=act(()=>openDialog('folder'));
  for(const button of document.querySelectorAll('[data-create-mode]'))button.onclick=act(()=>openDialog(button.dataset.createMode));
  $('new-template').onchange=()=>{deletePending=false;$('delete-template').textContent='Remove selected template';$('delete-template').hidden=$('new-template').value==='builtin';};
  $('delete-template').onclick=act(async()=>{if(!deletePending){deletePending=true;$('delete-template').textContent='Click again to remove';return;}if(!bridge.deleteTemplate)throw Error('Template storage is unavailable.');await bridge.deleteTemplate($('new-template').value);templateLibrary=await bridge.listTemplates();renderTemplateChoices();});
  $('cancel-dialog').onclick=closeDialog;
  $('dialog-shade').onclick=event=>{if(event.target===$('dialog-shade'))closeDialog();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('dialog-shade').hidden)closeDialog();});
  $('create-dialog').onsubmit=event=>{event.preventDefault();const name=$('new-name').value.trim(),kind=dialogKind;if(!name)return;
    const template=CanvasTemplates.formats.includes(kind)?$('new-template').value:null,makeDefault=template&&$('template-default').checked;
    closeDialog();Promise.resolve().then(async()=>{if(kind==='folder')await bridge.dashboardCreateFolder(name,folderID);else{if(makeDefault&&bridge.updateTemplateDefault)await bridge.updateTemplateDefault(kind,template);await bridge.dashboardCreateBoard(name,kind,folderID,template);}await refresh();}).catch(fail);
  };
  $('all-canvases').onclick=()=>{folderID=null;render();};$('search').oninput=()=>renderCanvases().catch(fail);
  for(const [id,value] of [['grid-view','grid'],['list-view','list']])$(id).onclick=()=>{layout=value;$('grid-view').setAttribute('aria-pressed',String(value==='grid'));$('list-view').setAttribute('aria-pressed',String(value==='list'));renderCanvases().catch(fail);};
  $('open-editor').onclick=act(async()=>{const first=rows.sort((a,b)=>(Number(b.modified)||0)-(Number(a.modified)||0))[0];if(first)await bridge.dashboardOpenBoard(first.id);else openDialog('canvas');});
  window.addEventListener('focus',()=>refresh().catch(fail));window.CanvasDashboard={refresh};refresh().catch(fail);
});

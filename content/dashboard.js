'use strict';
window.addEventListener('DOMContentLoaded',()=>{
  const bridge=window.arguments?.[0]||window.CanvasDashboardBridge;
  const M=window.CanvasModel;
  const $=id=>document.getElementById(id);
  const svgNS='http://www.w3.org/2000/svg';
  const svg=(tag,attributes={})=>{const element=document.createElementNS(svgNS,tag);for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));return element;};
  let rows=[],library,folderID=null,layout='grid',dialogKind=null,request=0,templateLibrary=CanvasTemplates.empty(),deletePending=false;
  let managerLibrary=CanvasTemplates.empty(),resetDefaultsPending=false,deleteCustomPending=false,restoreOnePending=false;
  const fail=error=>{console.error(error);$('status').textContent=error.message||String(error);$('status').classList.add('error');};
  const act=fn=>()=>Promise.resolve().then(fn).catch(fail);
  const templatePickers=[];
  function templatePicker(select,label){
    const choices=CanvasChoices.attach(select,{label,layout:'list'}),wrapper=document.createElement('div'),toggle=document.createElement('button');wrapper.className='template-select';toggle.type='button';toggle.className='template-select-toggle';toggle.setAttribute('aria-label',label);toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-haspopup','true');choices.group.id=select.id+'-choices';toggle.setAttribute('aria-controls',choices.group.id);
    choices.group.replaceWith(wrapper);wrapper.append(toggle,choices.group);choices.group.hidden=true;
    const close=()=>{choices.group.hidden=true;toggle.setAttribute('aria-expanded','false');};
    const sync=()=>{toggle.textContent=select.selectedOptions[0]?.textContent||'Choose a template';};
    toggle.onclick=()=>{const open=choices.group.hidden;for(const picker of templatePickers)picker.close();choices.group.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)choices.focus();};
    select.addEventListener('change',()=>{sync();close();toggle.focus({preventScroll:true});});
    const api={wrapper,toggle,choices,close,refresh(){choices.refresh();sync();}};templatePickers.push(api);sync();return api;
  }
  document.addEventListener('pointerdown',event=>{for(const picker of templatePickers)if(!picker.wrapper.contains(event.target))picker.close();});
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
    if(!$('templates-shade').hidden)await refreshTemplateManager();
  }
  function renderTemplateManagerChoices(selected){
    const mode=$('manage-format').value,list=$('manage-template');list.replaceChildren();
    for(const row of mode==='custom'?managerLibrary.custom:[{id:'builtin',name:'Default '+CanvasFormats.modes[mode]},...managerLibrary.custom.filter(t=>t.mode===mode)]){const option=document.createElement('option');option.value=row.id;option.textContent=row.name;list.append(option);}
    list.value=[...list.options].some(o=>o.value===selected)?selected:mode==='custom'?list.options[0]?.value||'':managerLibrary.defaults[mode]||'builtin';managerTemplatePicker.refresh();renderTemplateManager();
  }
  function renderTemplateManager(){
    const category=$('manage-format').value,id=$('manage-template').value,custom=managerLibrary.custom.find(row=>row.id===id&&(category==='custom'||row.mode===category)),mode=custom?.mode||category;
    restoreOnePending=false;$('restore-one-template').textContent='Restore default';$('restore-one-template').hidden=category==='custom';$('manage-template-picker').hidden=category!=='custom';$('manage-template-default').hidden=category!=='custom';
    deleteCustomPending=false;$('manage-template-delete').hidden=!custom;$('manage-template-delete').textContent='Delete custom template';$('manage-template-edit').disabled=!id;
    if(!id){$('manage-template-preview').replaceChildren();$('manage-template-cards').replaceChildren();$('manage-template-default').disabled=true;$('manage-template-status').textContent='No custom templates saved yet.';$('template-edit-hint').textContent='Create a freeform canvas with instruction cards, then use Save template. Right-click Zotero sources → Canvas tools → Use custom template to fill it.';return;}
    const board=custom?custom.board:managerLibrary.builtinOverrides?.[mode]||CanvasTemplates.builtIn(M,mode,'Default '+CanvasFormats.modes[mode]);
    $('manage-template-preview').replaceChildren(preview(board));const cards=$('manage-template-cards');cards.replaceChildren();
    for(const node of board.nodes.filter(n=>!n.junction)){const item=document.createElement('details'),title=document.createElement('summary'),text=document.createElement('p');title.textContent=node.title;text.textContent=node.text;item.append(title,text);cards.append(item);}
    const isDefault=(managerLibrary.defaults[mode]||'builtin')===id;$('manage-template-default').disabled=isDefault||!CanvasTemplates.formats.includes(mode);$('manage-template-default').textContent=!CanvasTemplates.formats.includes(mode)?'Custom template':isDefault?'Current default':'Use by default';
    $('manage-template-status').textContent=custom?'Saved template · '+CanvasFormats.modes[mode]:managerLibrary.builtinOverrides?.[mode]?'Customised default · '+CanvasFormats.modes[mode]:'Built-in default · '+CanvasFormats.modes[mode];
    $('template-edit-hint').textContent=custom?'Editing opens a draft. Use Save template to update this named template.':'Edits to this format default save automatically. Return to the dashboard when you are finished; no name is required.';
    resetDefaultsPending=false;$('reset-default-templates').textContent='Restore all defaults';
  }
  async function refreshTemplateManager(){if(!bridge.listTemplates)throw Error('Template storage is unavailable.');const selected=$('manage-template').value;managerLibrary=await bridge.listTemplates();renderTemplateManagerChoices(selected);}
  for(const mode of CanvasTemplates.formats){const option=document.createElement('option');option.value=mode;option.textContent=CanvasFormats.modes[mode];$('manage-format').append(option);}
  const customCategory=document.createElement('option');customCategory.value='custom';customCategory.textContent='Custom templates (all formats)';$('manage-format').append(customCategory);
  const selectedTemplateMode=()=>managerLibrary.custom.find(row=>row.id===$('manage-template').value)?.mode||$('manage-format').value;
  const managerFormatPicker=templatePicker($('manage-format'),'Template format'),managerTemplatePicker=templatePicker($('manage-template'),'Saved template'),creationTemplatePicker=templatePicker($('new-template'),'Starting template');
  async function openTemplates(){await refreshTemplateManager();$('templates-shade').hidden=false;managerFormatPicker.toggle.focus();}
  $('manage-templates').onclick=act(openTemplates);
  $('manage-format').onchange=()=>renderTemplateManagerChoices();$('manage-template').onchange=renderTemplateManager;
  $('close-templates').onclick=()=>{for(const picker of templatePickers)picker.close();$('templates-shade').hidden=true;$('manage-templates').focus();};
  $('templates-shade').onclick=event=>{if(event.target===$('templates-shade'))$('close-templates').click();};
  $('create-custom-template').onclick=act(async()=>{if(!bridge.dashboardCreateTemplate)throw Error('Template creation is available in the installed plugin.');await bridge.dashboardCreateTemplate();});
  $('restore-one-template').onclick=act(async()=>{const mode=$('manage-format').value;if(!CanvasTemplates.formats.includes(mode))throw Error('Choose a format to restore.');if(!restoreOnePending){restoreOnePending=true;$('restore-one-template').textContent='Confirm restore';return;}if(!bridge.resetDefaultTemplates)throw Error('Template reset is unavailable.');await bridge.resetDefaultTemplates(mode);await refreshTemplateManager();});
  $('manage-template-default').onclick=act(async()=>{if(!bridge.updateTemplateDefault)throw Error('Template defaults are unavailable.');await bridge.updateTemplateDefault(selectedTemplateMode(),$('manage-template').value);await refreshTemplateManager();});
  $('manage-template-edit').onclick=act(async()=>{if(!bridge.dashboardEditTemplate)throw Error('Template editing is available in the installed Zotero plugin.');await bridge.dashboardEditTemplate(selectedTemplateMode(),$('manage-template').value);});
  $('manage-template-delete').onclick=act(async()=>{if(!deleteCustomPending){deleteCustomPending=true;$('manage-template-delete').textContent='Confirm delete template';return;}if(!bridge.deleteTemplate)throw Error('Template deletion is unavailable.');await bridge.deleteTemplate($('manage-template').value);await refreshTemplateManager();});
  $('reset-default-templates').onclick=act(async()=>{if(!resetDefaultsPending){resetDefaultsPending=true;$('reset-default-templates').textContent='Confirm restore defaults';$('manage-template-status').textContent='Restore all six built-in format templates and their default selections? Named custom templates will stay saved.';return;}if(!bridge.resetDefaultTemplates)throw Error('Default template reset is unavailable.');await bridge.resetDefaultTemplates();$('manage-template').value='builtin';await refreshTemplateManager();$('manage-template-status').textContent='All six format defaults restored. Named custom templates are still available.';});
  async function openDialog(kind){
    dialogKind=kind;$('dialog-title').textContent=kind==='folder'?'New folder':'New '+CanvasFormats.modes[kind].toLowerCase();$('new-name').value='';deletePending=false;
    const structured=CanvasTemplates.formats.includes(kind);$('template-choice').hidden=!structured;
    if(structured){templateLibrary=bridge.listTemplates?await bridge.listTemplates():CanvasTemplates.empty();renderTemplateChoices();}
    $('dialog-shade').hidden=false;$('new-name').focus();
  }
  function renderTemplateChoices(selected){
    const list=$('new-template');list.replaceChildren();const builtin=document.createElement('option');builtin.value='builtin';builtin.textContent='Default '+CanvasFormats.modes[dialogKind];list.append(builtin);
    for(const row of templateLibrary.custom.filter(row=>row.mode===dialogKind)){const option=document.createElement('option');option.value=row.id;option.textContent=row.name;list.append(option);}
    list.value=selected||templateLibrary.defaults[dialogKind]||'builtin';creationTemplatePicker.refresh();$('template-default').checked=false;$('delete-template').hidden=list.value==='builtin';$('delete-template').textContent='Remove selected template';deletePending=false;
  }
  function closeDialog(){for(const picker of templatePickers)picker.close();$('dialog-shade').hidden=true;dialogKind=null;}
  $('new-freeform').onclick=act(()=>openDialog('canvas'));$('new-mindmap').onclick=act(()=>openDialog('mindmap'));$('new-folder').onclick=act(()=>openDialog('folder'));
  for(const button of document.querySelectorAll('[data-create-mode]'))button.onclick=act(()=>openDialog(button.dataset.createMode));
  $('new-template').onchange=()=>{deletePending=false;$('delete-template').textContent='Remove selected template';$('delete-template').hidden=$('new-template').value==='builtin';};
  $('delete-template').onclick=act(async()=>{if(!deletePending){deletePending=true;$('delete-template').textContent='Click again to remove';return;}if(!bridge.deleteTemplate)throw Error('Template storage is unavailable.');await bridge.deleteTemplate($('new-template').value);templateLibrary=await bridge.listTemplates();renderTemplateChoices();});
  $('cancel-dialog').onclick=closeDialog;
  $('dialog-shade').onclick=event=>{if(event.target===$('dialog-shade'))closeDialog();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=templatePickers.find(p=>!p.choices.group.hidden);if(open){open.close();open.toggle.focus();return;}if(!$('dialog-shade').hidden)closeDialog();if(!$('templates-shade').hidden)$('close-templates').click();}});
  $('create-dialog').onsubmit=event=>{event.preventDefault();const name=$('new-name').value.trim(),kind=dialogKind;if(!name)return;
    const template=CanvasTemplates.formats.includes(kind)?$('new-template').value:null,makeDefault=template&&$('template-default').checked;
    closeDialog();Promise.resolve().then(async()=>{if(kind==='folder')await bridge.dashboardCreateFolder(name,folderID);else{if(makeDefault&&bridge.updateTemplateDefault)await bridge.updateTemplateDefault(kind,template);await bridge.dashboardCreateBoard(name,kind,folderID,template);}await refresh();}).catch(fail);
  };
  $('all-canvases').onclick=()=>{folderID=null;render();};$('search').oninput=()=>renderCanvases().catch(fail);
  for(const [id,value] of [['grid-view','grid'],['list-view','list']])$(id).onclick=()=>{layout=value;$('grid-view').setAttribute('aria-pressed',String(value==='grid'));$('list-view').setAttribute('aria-pressed',String(value==='list'));renderCanvases().catch(fail);};
  $('open-editor').onclick=act(async()=>{const first=rows.sort((a,b)=>(Number(b.modified)||0)-(Number(a.modified)||0))[0];if(first)await bridge.dashboardOpenBoard(first.id);else openDialog('canvas');});
  window.addEventListener('focus',()=>refresh().catch(fail));window.CanvasDashboard={refresh,openTemplates};refresh().catch(fail);
});

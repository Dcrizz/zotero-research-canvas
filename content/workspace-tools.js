'use strict';
// Board tools keep their selection state separate from Zotero's native editors.
window.CanvasWorkspace = function (ctx) {
  const {getBoard, checkpoint, changed, redraw, point, element, model: M, viewport, select, report} = ctx;
  let frameID = null, frameDrag = null;
  const shelf = element('nav'); shelf.id = 'workspace-tools'; shelf.setAttribute('aria-label', 'Research tools');
  document.querySelector('main').before(shelf);
  const button = (label, action, parent = shelf) => {
    const b = element('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', () => Promise.resolve().then(action).catch(report)); parent.append(b); return b;
  };
  function iconButton(b,label,path){b.textContent='';b.classList.add('toolbar-icon');b.title=label;b.dataset.tooltip=label;b.setAttribute('aria-label',label);const ns='http://www.w3.org/2000/svg',icon=document.createElementNS(ns,'svg'),shape=document.createElementNS(ns,'path');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');shape.setAttribute('d',path);icon.append(shape);b.append(icon);return b;}
  const creation=element('div');creation.id='canvas-create-toolbar';creation.hidden=true;creation.setAttribute('role','toolbar');creation.setAttribute('aria-label','Create on canvas');document.body.append(creation);let creationPoint=null;
  for(const [label,kind,path] of [['Add card','card','M4 5h16v14H4z M8 9h8 M8 13h5'],['Add frame','frame','M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6']]){const b=button('',()=>{const at=creationPoint;creation.hidden=true;if(!at)return;if(kind==='card')ctx.addCard(at.x,at.y);else createFrame(at);},creation);b.title=label;b.setAttribute('aria-label',label);b.dataset.create=kind;const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d',path);shape.setAttribute('fill','none');shape.setAttribute('stroke','currentColor');shape.setAttribute('stroke-width','1.7');shape.setAttribute('stroke-linejoin','round');icon.append(shape);b.append(icon);}
  viewport.addEventListener('contextmenu',ev=>{if(ev.target.closest('.card,.edge-hit,.edge-label,.endpoint,.route-handle,.frame-heading,button,input,select,textarea'))return;ev.preventDefault();ev.stopPropagation();ctx.hideStyles();select(null,null);closeFrameMenu();creationPoint=point(ev);creation.hidden=false;creation.querySelector('[data-create=frame]').disabled=getBoard().mode!=='canvas';const r=viewport.getBoundingClientRect();creation.style.left=Math.max(r.left+8,Math.min(ev.clientX,r.right-creation.offsetWidth-8))+'px';creation.style.top=Math.max(r.top+8,Math.min(ev.clientY,r.bottom-creation.offsetHeight-8))+'px';creation.firstElementChild.focus({preventScroll:true});});
  document.addEventListener('pointerdown',ev=>{if(!creation.contains(ev.target))creation.hidden=true;});viewport.addEventListener('wheel',()=>{creation.hidden=true;},{passive:true});document.addEventListener('keydown',ev=>{if(ev.key==='Escape')creation.hidden=true;});
  const framesLayer = element('div'); framesLayer.id = 'frames'; document.getElementById('world').prepend(framesLayer);
  const frameControls=element('div');frameControls.id='frame-controls';document.getElementById('world').append(frameControls);
  const menu = element('div'); menu.id = 'frame-toolbar'; menu.hidden = true; menu.setAttribute('role', 'toolbar'); menu.setAttribute('aria-label', 'Frame styling'); document.body.append(menu);
  const popover = element('div'); popover.id = 'frame-options'; popover.hidden = true; popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', 'Frame options'); document.body.append(popover);
  const currentFrame = () => getBoard().frames?.find(f => f.id === frameID);
  function contained(frame) {
    return getBoard().nodes.filter(n => n.x >= frame.x && n.y >= frame.y && n.x + n.width <= frame.x + frame.width && n.y + n.height <= frame.y + frame.height);
  }
  function frameRect(frame) {
    if (getBoard().mode === 'canvas') return frame;
    const nodes = getBoard().nodes.filter(n => frame.members.includes(n.id)), ps = M.positions(getBoard());
    return nodes.length ? M.bounds(nodes.map(n => ({...n, ...ps.get(n.id)})), 40) : frame;
  }
  function closeFrameMenu() { menu.hidden = popover.hidden = true; }
  function updateFrame(field, value) { const f = currentFrame(); if (!f) return; checkpoint(); f[field] = value; changed(); redraw(); }
  function openOption(kind) {
    popover.replaceChildren();
    const f = currentFrame(); if (!f) return;
    const label = element('label'); label.textContent = {title: 'Frame name', colour: 'Frame fill', border: 'Frame border', size: 'Frame size'}[kind];
    if (kind === 'size') {
      for (const key of ['width', 'height']) {
        const l = element('label'); l.textContent = key === 'width' ? 'Width' : 'Height'; const input = element('input'); input.type = 'number'; input.min = '200'; input.max = '10000'; input.value = f[key]; input.setAttribute('aria-label', 'Frame ' + key);
        input.addEventListener('change', () => { if (input.checkValidity()) updateFrame(key, Number(input.value)); }); l.append(input); popover.append(l);
      }
    } else {
      const input = element('input'); input.type = kind === 'title' ? 'text' : 'color'; input.value = f[kind]; input.maxLength = 500; input.setAttribute('aria-label', label.textContent);
      input.addEventListener('change', () => updateFrame(kind, input.value)); label.append(input); popover.append(label);
    }
    popover.hidden = false; positionFrameMenu(); popover.querySelector('input')?.focus();
  }
  function openFrameMenu(id) {
    frameID = id; select(null, null); menu.replaceChildren();
    for (const [label, icon, kind] of [['Frame name', 'T', 'title'], ['Frame fill', '●', 'colour'], ['Frame border', '□', 'border'], ['Frame size', '↔', 'size']]) {
      const b = button(icon, () => openOption(kind), menu); b.title = label; b.setAttribute('aria-label', label); b.dataset.frameTool = kind;
      if (kind === 'colour' || kind === 'border') b.style.color = currentFrame()[kind];
    }
    const remove = button('×', () => { checkpoint(); getBoard().frames = getBoard().frames.filter(f => f.id !== frameID); frameID = null; closeFrameMenu(); changed(); redraw(); }, menu); remove.title = 'Remove frame (keep cards)'; remove.setAttribute('aria-label', remove.title);
    menu.hidden = false; popover.hidden = true; redraw();
  }
  function positionFrameMenu() {
    const f = currentFrame(); if (!f) { closeFrameMenu(); return; }
    const rect = frameRect(f), v = viewport.getBoundingClientRect(), b = getBoard();
    const x = Math.max(v.left + 8, Math.min(v.right - menu.offsetWidth - 8, v.left + b.view.x + rect.x * b.view.zoom));
    const y = Math.max(v.top + 8, Math.min(v.bottom - menu.offsetHeight - 8, v.top + b.view.y + rect.y * b.view.zoom - 76));
    Object.assign(menu.style, {left: x + 'px', top: y + 'px'});
    Object.assign(popover.style, {left: Math.max(8,Math.min(x, window.innerWidth - popover.offsetWidth - 8)) + 'px', top: Math.max(8,Math.min(y + menu.offsetHeight + 6,window.innerHeight-popover.offsetHeight-8)) + 'px'});
  }
  function createFrame(at=null) {
    const b = getBoard(); if (b.mode !== 'canvas') throw Error('Switch to freeform canvas to create or move a frame.');
    checkpoint(); const rect = at?{x:at.x,y:at.y,width:600,height:400}:b.nodes.length ? M.bounds(b.nodes, 45) : {x: (60 - b.view.x) / b.view.zoom, y: (100 - b.view.y) / b.view.zoom, width: 600, height: 400};
    const f = {id: crypto.randomUUID(), title: 'New frame', ...rect, colour: '#dcebe6', border: '#69877d', members: at?[]:b.nodes.map(n => n.id)};
    (b.frames ||= []).push(f); changed(); openFrameMenu(f.id); if(!at)ctx.fit();else redraw();
  }
  const addFrameButton=button('+ Frame',()=>createFrame());addFrameButton.id='add-frame';addFrameButton.hidden=true;
  viewport.addEventListener('pointermove', ev => {
    if (!frameDrag) return; const p = point(ev), d = frameDrag, f = currentFrame(); if (!f) return;
    if (d.resize) { f.width = Math.max(200, Math.min(10000, d.width + p.x - d.start.x)); f.height = Math.max(200, Math.min(10000, d.height + p.y - d.start.y)); }
    else { const dx = p.x - d.start.x, dy = p.y - d.start.y; f.x = d.x + dx; f.y = d.y + dy; for (const n of d.nodes) { const node = getBoard().nodes.find(item => item.id === n.id); if (node) { node.x = n.x + dx; node.y = n.y + dy; } } }
    redraw();
  });
  for (const type of ['pointerup', 'pointercancel']) viewport.addEventListener(type, ev => {
    if (!frameDrag) return; const id = frameDrag.pointer; frameDrag = null; if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    const f = currentFrame(); if (f) f.members = contained(f).map(n => n.id); changed(); redraw();
  });
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#frame-toolbar,#frame-options,.canvas-frame')) closeFrameMenu(); }, true);
  const filterPanel = element('section'); filterPanel.id = 'filter-panel'; filterPanel.hidden = true; filterPanel.setAttribute('aria-label', 'Canvas filters'); shelf.after(filterPanel);
  const filtersButton=iconButton(button('Filters & colours', () => { filterPanel.hidden = !filterPanel.hidden;filtersButton.setAttribute('aria-expanded',String(!filterPanel.hidden)); syncFilterFields(); }),'Filters & colours','M3 6h18 M3 12h18 M3 18h18 M8 3v6 M16 9v6 M10 15v6');filtersButton.id='toggle-filters';filtersButton.setAttribute('aria-expanded','false');filtersButton.setAttribute('aria-controls','filter-panel');
  const filterFields = {};
  for (const [key, name, hint] of [['tag','Tag','e.g. ds/samp'], ['author','Author','Surname'], ['year','Year','e.g. 2022'], ['itemType','Item type','note, annotation, book…'], ['colourFamily','Colour tag family','e.g. ds/samp']]) {
    const label = element('label'); label.textContent = name; const input = element('input'); input.type = 'text'; input.placeholder = hint; input.setAttribute('aria-label', name); input.id = 'filter-' + key;
    input.addEventListener('change', () => { checkpoint(); const filters = getBoard().filters ||= emptyFilters(); filters[key] = input.value.trim(); changed(); redraw(); }); label.append(input); filterPanel.append(label); filterFields[key] = input;
  }
  const modeLabel = element('label'); modeLabel.textContent = 'Non-matches'; filterPanel.append(modeLabel);
  for (const [mode, label] of [['dim','Dim'], ['hide','Hide']]) button(label, () => { checkpoint(); (getBoard().filters ||= emptyFilters()).mode = mode; changed(); redraw(); }, modeLabel).dataset.filterMode = mode;
  button('Clear filters & colours', () => { checkpoint(); getBoard().filters = emptyFilters(); changed(); redraw(); syncFilterFields(); }, filterPanel).id = 'clear-filters';
  const filterCount = element('small'); filterCount.id = 'filter-count'; filterPanel.append(filterCount);
  function emptyFilters() { return {tag:'',author:'',year:'',itemType:'',colourFamily:'',mode:'dim'}; }
  function syncFilterFields() { const filters = getBoard().filters || emptyFilters(); for (const [key,input] of Object.entries(filterFields)) if (document.activeElement !== input) input.value = filters[key]; }
  function matches(n) {
    const f = getBoard().filters || emptyFilters(), m = n.metadata || {tags:[],author:'',year:'',itemType:n.kind || 'idea'};
    return (!f.tag || m.tags.some(t => t.toLowerCase().includes(f.tag.toLowerCase()))) && (!f.author || m.author.toLowerCase().includes(f.author.toLowerCase())) && (!f.year || m.year.includes(f.year)) && (!f.itemType || (m.itemType + ' ' + (n.kind || 'idea')).toLowerCase().includes(f.itemType.toLowerCase()));
  }
  function visualTag(n) {
    const prefix = getBoard().filters?.colourFamily; if (!prefix) return null;
    const tag = n.metadata?.tags.find(t => t === prefix || t.startsWith(prefix + '/')); if (!tag) return null;
    let hash = 0; for (const c of tag) hash = ((hash * 31) + c.charCodeAt(0)) | 0;
    return {tag, colour: ['#d8e8f8','#f4dfcb','#d9edda','#e9ddf5','#f3dce3','#d4eceb','#f2e9c8'][Math.abs(hash) % 7]};
  }
  function renderFilters() {
    syncFilterFields(); const b = getBoard(), matching = new Set(b.nodes.filter(matches).map(n=>n.id)), mode = b.filters?.mode || 'dim';
    filterCount.textContent = matching.size + ' of ' + b.nodes.length + ' cards match';
    for (const card of document.querySelectorAll('#cards > .card')) {
      const n = b.nodes.find(n => n.id === card.dataset.id), match = matching.has(n.id), tag = visualTag(n);
      card.classList.toggle('filtered-dim', !match && mode === 'dim'); card.classList.toggle('filtered-hide', !match && mode === 'hide');
      if (tag) { card.style.backgroundColor = n.fillMode === 'outline' ? 'transparent' : tag.colour + (n.fillMode === 'partial' ? '59' : ''); const badge = element('span'); badge.className = 'tag-badge'; badge.textContent = tag.tag; badge.title = 'Canvas colour from tag; original note formatting unchanged'; card.append(badge); }
    }
    for (const edge of b.edges) {
      const show = (!edge.source||matching.has(edge.source)) && (!edge.target||matching.has(edge.target));
      for (const path of document.querySelectorAll('[data-edge="' + CSS.escape(edge.id) + '"],[data-filter-edge="' + CSS.escape(edge.id) + '"]')) { path.style.opacity = show ? '' : mode === 'hide' ? '0' : '.18'; path.style.pointerEvents = show ? '' : 'none'; }
    }
    for (const button of filterPanel.querySelectorAll('[data-filter-mode]')) button.setAttribute('aria-pressed',String(button.dataset.filterMode === mode));
  }
  const multiple = new Set(); let multiBoardID = null, multiDrag = null, selecting = false;
  const multiPanel = element('div'); multiPanel.id = 'multi-tools'; multiPanel.hidden = true; shelf.append(multiPanel);
  const multiCount = element('span'); multiPanel.append(multiCount);
  const selectButton=iconButton(button('Select cards',()=>{selecting=!selecting;updateSelectionMode();}),'Select cards','M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M9 9l3 10 2-5 5-2z');selectButton.id='select-cards';selectButton.setAttribute('aria-pressed','false');
  const selectionHint=element('div');selectionHint.id='selection-hint-overlay';selectionHint.textContent='Drag a box around cards. Press Esc to finish.';selectionHint.hidden=true;viewport.append(selectionHint);
  function updateSelectionMode(){selectButton.setAttribute('aria-pressed',String(selecting));viewport.classList.toggle('selection-mode',selecting);selectionHint.hidden=!selecting;}
  const marquee = element('div'); marquee.id = 'selection-marquee'; marquee.hidden = true; document.body.append(marquee);
  const multiNodes = () => getBoard().nodes.filter(n=>multiple.has(n.id));
  function mutateMultiple(action, requiresCanvas = true) {
    if (requiresCanvas && getBoard().mode !== 'canvas') throw Error('Switch to freeform canvas for alignment and resizing.');
    checkpoint(); action(multiNodes()); changed(); redraw();
  }
  const bulkColour = element('input'); bulkColour.type = 'color'; bulkColour.id = 'bulk-colour'; bulkColour.value = '#dcebe6'; bulkColour.setAttribute('aria-label','Selected cards colour'); multiPanel.append(bulkColour);
  bulkColour.addEventListener('change',()=>mutateMultiple(nodes=>nodes.forEach(n=>{n.colour=bulkColour.value;}),false));
  for (const [label,axis,side] of [['Align left','x','start'],['Align right','x','end'],['Align top','y','start'],['Align bottom','y','end']]) button(label,()=>mutateMultiple(nodes=>{
    if (!nodes.length) return; const dim=axis==='x'?'width':'height', anchor=side==='start'?Math.min(...nodes.map(n=>n[axis])):Math.max(...nodes.map(n=>n[axis]+n[dim])); for(const n of nodes)n[axis]=side==='start'?anchor:anchor-n[dim];
  }),multiPanel);
  for(const [label,axis] of [['Space horizontally','x'],['Space vertically','y']]) button(label,()=>mutateMultiple(nodes=>{
    if(nodes.length<3)throw Error('Select at least three cards to distribute spacing.'); const dim=axis==='x'?'width':'height'; nodes.sort((a,b)=>a[axis]-b[axis]); const start=nodes[0][axis],last=nodes.at(-1),end=last[axis]+last[dim],total=nodes.reduce((sum,n)=>sum+n[dim],0),gap=(end-start-total)/(nodes.length-1);let cursor=start;for(const n of nodes){n[axis]=cursor;cursor+=n[dim]+gap;}
  }),multiPanel);
  button('Frame selection',()=>{const nodes=multiNodes();if(!nodes.length)return;checkpoint();const f={id:crypto.randomUUID(),title:'Selected group',...M.bounds(nodes,45),colour:'#dcebe6',border:'#69877d',members:nodes.map(n=>n.id)};(getBoard().frames ||= []).push(f);changed();openFrameMenu(f.id);},multiPanel).id='frame-selection';
  async function deleteMultiple() {
    const activeBoard=getBoard(),ids=new Set(multiple); if(!ids.size)return; await ctx.saveInlineNotes(true); if(getBoard()!==activeBoard)throw Error('The board changed while saving notes. Select the cards again.');
    checkpoint();const b=getBoard();b.nodes=b.nodes.filter(n=>!ids.has(n.id));b.edges=b.edges.filter(e=>!ids.has(e.source)&&!ids.has(e.target));for(const f of b.frames||[])f.members=f.members.filter(id=>!ids.has(id));multiple.clear();select(null,null);changed();redraw();
  }
  button('Delete cards',deleteMultiple,multiPanel).id='delete-cards';
  function cardPointerDown(ev,node) {
    if(ev.button!==0||ev.target.closest('.linked,.note-preview'))return false;
    if(ev.shiftKey){ev.preventDefault();ev.stopPropagation();multiBoardID=getBoard().id;if(multiple.has(node.id))multiple.delete(node.id);else multiple.add(node.id);select(null,null);redraw();return true;}
    if(multiple.size>1&&multiple.has(node.id)&&getBoard().mode==='canvas'&&ev.target.closest('.heading,.resize')){
      ev.preventDefault();ev.stopPropagation();checkpoint();const direction=ev.target.closest('.resize')?.dataset.direction;
      multiDrag={pointer:ev.pointerId,start:point(ev),nodes:M.clone(multiNodes()),rect:M.bounds(multiNodes(),0),resize:direction};
      viewport.setPointerCapture(ev.pointerId);return true;
    }
    if(multiple.size&&!ev.target.closest('.port')){multiple.clear();redraw();}return false;
  }
  viewport.addEventListener('pointerdown',ev=>{
    if(ev.button!==0||(!selecting&&!ev.shiftKey)||ev.target.closest('.card,.canvas-frame,.edge-hit,.edge-label,.endpoint,.route-handle'))return;
    ev.preventDefault();ev.stopImmediatePropagation();multiple.clear();multiBoardID=getBoard().id;select(null,null);multiDrag={pointer:ev.pointerId,start:point(ev),screen:{x:ev.clientX,y:ev.clientY},box:true};viewport.setPointerCapture(ev.pointerId);
  });
  viewport.addEventListener('pointermove',ev=>{
    if(!multiDrag)return;const d=multiDrag,p=point(ev),dx=p.x-d.start.x,dy=p.y-d.start.y,b=getBoard();
    if(d.box){Object.assign(marquee.style,{left:Math.min(d.screen.x,ev.clientX)+'px',top:Math.min(d.screen.y,ev.clientY)+'px',width:Math.abs(ev.clientX-d.screen.x)+'px',height:Math.abs(ev.clientY-d.screen.y)+'px'});marquee.hidden=false;const ps=M.positions(b),x=Math.min(p.x,d.start.x),y=Math.min(p.y,d.start.y),r=Math.max(p.x,d.start.x),bottom=Math.max(p.y,d.start.y);multiple.clear();for(const n of b.nodes){const pos=ps.get(n.id);if(matches(n)&&pos.x>=x&&pos.y>=y&&pos.x+n.width<=r&&pos.y+n.height<=bottom)multiple.add(n.id);}}
    else if(d.resize){const dir=d.resize,rx=dir.includes('w')?-dx:dir.includes('e')?dx:0,ry=dir.includes('n')?-dy:dir.includes('s')?dy:0;const sx=Math.max(...d.nodes.map(n=>(n.objectType?24:140)/n.width),Math.min(...d.nodes.map(n=>1200/n.width),1+rx/d.rect.width)),sy=Math.max(...d.nodes.map(n=>(n.objectType?24:100)/n.height),Math.min(...d.nodes.map(n=>1200/n.height),1+ry/d.rect.height)),ox=dir.includes('w')?d.rect.x+d.rect.width:d.rect.x,oy=dir.includes('n')?d.rect.y+d.rect.height:d.rect.y;for(const original of d.nodes){const n=b.nodes.find(n=>n.id===original.id);if(n)Object.assign(n,{x:ox+(original.x-ox)*sx,y:oy+(original.y-oy)*sy,width:original.width*sx,height:original.height*sy});}}
    else for(const original of d.nodes){const n=b.nodes.find(n=>n.id===original.id);if(n){n.x=original.x+dx;n.y=original.y+dy;}}
    redraw();
  });
  for(const type of ['pointerup','pointercancel'])viewport.addEventListener(type,ev=>{if(!multiDrag)return;const d=multiDrag;multiDrag=null;marquee.hidden=true;if(viewport.hasPointerCapture(d.pointer))viewport.releasePointerCapture(d.pointer);if(!d.box)changed();redraw();});
  document.addEventListener('keydown',ev=>{
    if(ev.target.closest('input,textarea,select')||!document.getElementById('note-panel').hidden)return;
    if(ev.key==='Escape'){multiple.clear();selecting=false;updateSelectionMode();redraw();}
    if(multiple.size&&['Delete','Backspace'].includes(ev.key)){ev.preventDefault();ev.stopImmediatePropagation();deleteMultiple().catch(report);}
  },true);
  function renderMultiple(){const b=getBoard();if(multiBoardID!==b.id){multiple.clear();selecting=false;updateSelectionMode();multiBoardID=b.id;}for(const id of multiple)if(!b.nodes.some(n=>n.id===id))multiple.delete(id);for(const card of document.querySelectorAll('#cards > .card'))card.classList.toggle('multi-selected',multiple.has(card.dataset.id));multiPanel.hidden=!multiple.size;multiCount.textContent=multiple.size+' cards';}
  const membershipsPanel=element('section');membershipsPanel.id='memberships-panel';membershipsPanel.hidden=true;document.body.append(membershipsPanel);
  const membershipButton=button('Find on canvases',async()=>{
    const node=ctx.selected();if(!node?.link)throw Error('Select a linked note, reference or annotation card first.');
    if(!ctx.bridge.memberships)throw Error('Canvas membership is available in the installed Zotero plugin.');
    membershipsPanel.replaceChildren();membershipsPanel.hidden=false;const heading=element('h3');heading.textContent='Used on canvases';membershipsPanel.append(heading);const close=element('button');close.textContent='Close';close.onclick=()=>{membershipsPanel.hidden=true;};membershipsPanel.append(close);
    const rows=await ctx.bridge.memberships(node.link,node.annotationKey);
    if(!rows.length){const p=element('p');p.textContent='No saved cards found.';membershipsPanel.append(p);}
    for(const match of rows)button(match.boardTitle+' · '+match.cardTitle,async()=>{await ctx.jumpTo(match.boardID,match.cardID);},membershipsPanel);
  });membershipButton.id='find-memberships';iconButton(membershipButton,'Find on canvases','M3 3h12v10H3z M7 7h12v4 M16 12a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M19 19l3 3');
  const exportPanel=element('section');exportPanel.id='export-panel';exportPanel.hidden=true;exportPanel.setAttribute('aria-label','Export and recovery');shelf.after(exportPanel);
  const exportToggle=button('Export & recovery',()=>{exportPanel.hidden=!exportPanel.hidden;});exportToggle.id='toggle-export';exportToggle.hidden=true;
  let exportScope='canvas';const scope=element('div');scope.className='export-scope';exportPanel.append(scope);
  for(const [value,label]of [['canvas','Whole canvas'],['frame','Selected frame']]){const b=button(label,()=>{exportScope=value;for(const child of scope.children)child.setAttribute('aria-pressed',String(child===b));},scope);b.dataset.scope=value;b.setAttribute('aria-pressed',String(value===exportScope));}
  async function exportData(options={}){
    await ctx.saveInlineNotes();await ctx.flush();
    const board=M.clone(getBoard());for(const n of board.nodes)if(n.kind==='annotation'&&ctx.annotationMarkup)n.annotationHTML=ctx.annotationMarkup(n);const frame=(options.scope||exportScope)==='frame'?currentFrame():null;
    if((options.scope||exportScope)==='frame'&&!frame)throw Error('Right-click a frame to select it before exporting.');
    const positionedFrame=frame?{...frame,...frameRect(frame)}:null;
    const noteHTML=ctx.bridge.exportNotes?await ctx.bridge.exportNotes(board.nodes):{};
    for(const n of board.nodes)if(n.kind==='canvas'&&ctx.canvasMarkup)noteHTML[n.id]=await ctx.canvasMarkup(n);
    return window.CanvasExport.createSVG(board,{frame:positionedFrame,noteHTML,visible:n=>board.filters?.mode!=='hide'||matches(n),tagColour:n=>visualTag(n)?.colour});
  }
  for(const format of ['svg','png','pdf'])button(format.toUpperCase(),async()=>{
    ctx.status('Preparing '+format.toUpperCase()+'...');const payload=await exportData();
    const name=(getBoard().title.replace(/[^a-z0-9 _-]/gi,'_').slice(0,100)||'Canvas')+'.'+format;
    if(format==='png')payload.png=await window.CanvasExport.png(payload);
    if(format==='pdf')payload.pdf=await window.CanvasExport.pdf(payload);
    const saved=ctx.bridge.exportFile?await ctx.bridge.exportFile(format,name,payload):await window.CanvasExport.download(format,name,payload);
    ctx.status(saved===false?'Export cancelled':'Exported '+format.toUpperCase());
  },exportPanel).id='export-'+format;
  async function obsidianBundle(){
    await ctx.saveInlineNotes();await ctx.flush();const boards=[M.clone(getBoard())],seen=new Set([getBoard().id]),available=new Set((await ctx.bridge.list()).map(b=>b.id));
    for(let i=0;i<boards.length;i++)for(const n of boards[i].nodes.filter(n=>n.kind==='canvas'))if(!seen.has(n.canvasID)&&available.has(n.canvasID)){if(boards.length>=200)throw Error('This export has more than 200 linked canvases. Export a smaller set.');seen.add(n.canvasID);boards.push(await ctx.bridge.load(n.canvasID));}
    const allNodes=boards.flatMap(b=>b.nodes);if(allNodes.length>20000)throw Error('Export up to 20,000 cards at a time.');
    if(ctx.bridge.refresh){const annotations=allNodes.filter(n=>n.kind==='annotation'&&n.annotationKey);for(let i=0;i<annotations.length;i+=50){const batch=annotations.slice(i,i+50),sources=await ctx.bridge.refresh(batch.map(n=>({...n.link,annotationKey:n.annotationKey})));for(let j=0;j<batch.length;j++){const source=sources[j];if(source.missing)batch[j].sourceUnavailable=true;else for(const key of ['title','text','annotationHTML','annotationColour','annotationColourName'])if(source[key]!==undefined)batch[j][key]=source[key];}}}
    const noteHTML=ctx.bridge.exportNotes?await ctx.bridge.exportNotes(allNodes):{},sourceLinks=ctx.bridge.sourceLinks?await ctx.bridge.sourceLinks(allNodes):{};
    const prefix='Zotero Canvas/'+CanvasObsidian.safeName(getBoard().title)+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8);
    return CanvasObsidian.createBundle(boards,{prefix,noteHTML,sourceLinks});
  }
  button('Send to Obsidian',async()=>{if(!ctx.bridge.sendToObsidian)throw Error('Send to Obsidian is available in the installed Zotero plugin.');ctx.status('Preparing Obsidian canvas...');const bundle=await obsidianBundle(),result=await ctx.bridge.sendToObsidian(bundle);ctx.status(result===false?'Obsidian export cancelled':'Sent '+bundle.canvases+' canvas'+(bundle.canvases===1?'':'es')+' to Obsidian'+(bundle.warnings.length?' · see Export details for style differences':''));},exportPanel).id='send-obsidian';
  if(ctx.bridge.openSettings)button('Zotero Canvas settings',()=>ctx.bridge.openSettings(),exportPanel).id='canvas-settings';
  const history=element('div');history.id='history-list';exportPanel.append(history);
  button('Version history',async()=>{
    await ctx.flush();history.replaceChildren();if(!ctx.bridge.listSnapshots)throw Error('Version history is available in the installed Zotero plugin.');
    const id=getBoard().id,rows=await ctx.bridge.listSnapshots(id);const title=element('strong');title.textContent=rows.length?'Restore a previous arrangement as a new canvas:':'No previous arrangements saved yet.';history.append(title);
    for(const row of rows)button(new Date(row.date).toLocaleString(),async()=>{const b=await ctx.bridge.loadSnapshot(id,row.name);await ctx.restoreBoard(b);history.replaceChildren();ctx.status('Restored as a separate canvas');},history).dataset.snapshot=row.name;
  },exportPanel).id='version-history';
  const connectionPanel=window.CanvasConnectionPanel({getBoard,element,bridge:ctx.bridge,report,flush:async()=>{await ctx.saveInlineNotes();await ctx.flush();},selectedIDs:()=>multiple.size?[...multiple]:ctx.selected()?.id?[ctx.selected().id]:[],currentFrame,readCards:async nodes=>ctx.bridge.connectionCards?ctx.bridge.connectionCards(nodes):nodes.map(n=>({id:n.id,title:n.title,text:n.kind==='annotation'?CanvasConnections.plain(n.annotationHTML):n.text})),accept:ctx.acceptConnection,reject:ctx.rejectConnection,jumpTo:ctx.jumpTo});
  const connectionButton=button('Connections',()=>{document.querySelector('#counterexample-panel [aria-label="Close counterexample search"]').click();connectionPanel.open();});connectionButton.id='suggest-connections';connectionButton.hidden=true;
  const counterPanel=window.CanvasCounterexamplePanel({getBoard,element,bridge:ctx.bridge,report,selected:ctx.selected,flush:async()=>{await ctx.saveInlineNotes();await ctx.flush();},hasSource:key=>getBoard().nodes.some(n=>n.link&&n.link.libraryID+'/'+(n.annotationKey||n.link.key)===key),add:ctx.addCounterexample});
  const counterButton=button('Find counterexamples',()=>{document.querySelector('#connection-panel [aria-label="Close suggested connections"]').click();counterPanel.open();});counterButton.id='counterexamples';counterButton.hidden=true;counterButton.title='Select a card, then search the library for counterevidence';

  const supportButton=button('Find supporting sources',()=>{document.querySelector('#connection-panel [aria-label="Close suggested connections"]').click();counterPanel.open('support');});supportButton.id='supporting-sources';supportButton.hidden=true;
  function render() {
    const board = getBoard();connectionPanel.render();counterPanel.render();counterButton.disabled=!board.nodes.some(n=>n.id===ctx.selected()?.id&&n.kind!=='canvas'); supportButton.disabled=counterButton.disabled; membershipButton.disabled=!ctx.selected()?.link; renderFilters(); renderMultiple(); framesLayer.replaceChildren();frameControls.replaceChildren();
    for (const f of board.frames || []) {
      const rect = frameRect(f), frame = element('section'); frame.className = 'canvas-frame' + (f.id === frameID ? ' active-frame' : ''); frame.dataset.frame = f.id;
      Object.assign(frame.style, {left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px', backgroundColor: f.colour + '66', borderColor: f.border});
      const backdrop=element('div');backdrop.className='frame-backdrop'+(f.id===frameID?' active-frame':'');Object.assign(backdrop.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px',backgroundColor:f.colour+'66',borderColor:f.border});framesLayer.append(backdrop);frame.style.backgroundColor='transparent';frame.style.borderColor='transparent';frame.classList.remove('active-frame');
      const heading = element('button'); heading.className = 'frame-heading'; heading.textContent = f.title; heading.style.backgroundColor = f.border; heading.style.color = M.labelPalette(f.border).foreground; frame.append(heading);
      const resize = element('button'); resize.className = 'frame-resize'; resize.setAttribute('aria-label', 'Resize frame ' + f.title); frame.append(resize);
      frame.oncontextmenu = ev => { ev.preventDefault(); ev.stopPropagation(); openFrameMenu(f.id); };
      frame.onpointerdown = ev => {
        if (ev.button !== 0) return; ev.stopPropagation(); frameID = f.id; select(null, null);
        if (board.mode !== 'canvas') { openFrameMenu(f.id); return; }
        checkpoint(); f.members = contained(f).map(n => n.id); frameDrag = {pointer: ev.pointerId, start: point(ev), x: f.x, y: f.y, width: f.width, height: f.height, nodes: M.clone(contained(f)), resize: ev.target === resize};
        viewport.setPointerCapture(ev.pointerId); ev.preventDefault(); closeFrameMenu(); redraw();
      };
      frameControls.append(frame);
    }
    if (!menu.hidden) positionFrameMenu();
  }
  function openAI(id,action){const node=getBoard().nodes.find(n=>n.id===id);if(!node||node.kind==='canvas')throw Error('Choose a readable card for AI analysis.');select('node',id);if(action==='connections'){document.querySelector('#counterexample-panel [aria-label="Close counterexample search"]').click();connectionPanel.open(id);}else{document.querySelector('#connection-panel [aria-label="Close suggested connections"]').click();counterPanel.open(action==='support'?'support':'counterexample');}}
  return {endSelection(){selecting=false;multiple.clear();updateSelectionMode();redraw();},openAI, render, positionFrameMenu, frameRect, currentFrame, createFrame, contained, matches, visualTag, cardPointerDown, exportData, obsidianBundle, showConnectionEvidence:edge=>connectionPanel.evidence(edge),showCounterexampleEvidence:node=>counterPanel.evidence(node)};
};

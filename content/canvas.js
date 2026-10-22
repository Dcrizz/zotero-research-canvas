'use strict';
window.addEventListener('DOMContentLoaded', event => {
if (event.target !== document) return;
const M = globalThis.CanvasModel;
const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const html = tag => document.createElementNS('http://www.w3.org/1999/xhtml', tag);
const svg = (name, attrs = {}) => {
  const el = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
};
const bridge = window.arguments?.[0] || {
  directory: 'Browser preview storage',
  async getSettings(){return CanvasSettings.validate(JSON.parse(localStorage.getItem('research-canvas-settings')||JSON.stringify(CanvasSettings.defaults())));},
  async saveSettings(value){localStorage.setItem('research-canvas-settings',JSON.stringify(CanvasSettings.validate(value)));},
  async libraryState(){return CanvasLibrary.validate(JSON.parse(localStorage.getItem('research-canvas-library')||JSON.stringify(CanvasLibrary.empty())));},
  async organise(c){if(c.op.endsWith('Board'))await this.load(c.id);const next=CanvasLibrary.apply(await this.libraryState(),c);localStorage.setItem('research-canvas-library',JSON.stringify(next));return next;},
  async list(includeTrash=false) { const index=await this.libraryState();return JSON.parse(localStorage.getItem('research-canvas-index') || '[]').filter(b=>includeTrash||!index.boards[b.id]?.trashedAt); },
  async load(id) { return M.validate(JSON.parse(localStorage.getItem('research-canvas-' + id))); },
  async save(b) {
    const old=localStorage.getItem('research-canvas-'+b.id);
    if(old && JSON.stringify({...JSON.parse(old),view:null})!==JSON.stringify({...b,view:null})){
      const key='research-canvas-history-'+b.id,history=JSON.parse(localStorage.getItem(key)||'[]');history.unshift({name:Date.now()+'-'+crypto.randomUUID(),date:new Date().toISOString(),board:JSON.parse(old)});localStorage.setItem(key,JSON.stringify(history.slice(0,40)));
    }
    localStorage.setItem('research-canvas-' + b.id, JSON.stringify(b));
    const index = await this.list(true); const row = index.find(x => x.id === b.id);
    if (row) row.title = b.title; else index.push({id: b.id, title: b.title});
    localStorage.setItem('research-canvas-index', JSON.stringify(index));
  },
  async listSnapshots(id){return JSON.parse(localStorage.getItem('research-canvas-history-'+id)||'[]').map(({name,date})=>({name,date}));},
  async loadSnapshot(id,name){const row=JSON.parse(localStorage.getItem('research-canvas-history-'+id)||'[]').find(r=>r.name===name);if(!row)throw Error('Snapshot unavailable.');return M.validate(row.board);},
  async listMeanings() { return JSON.parse(localStorage.getItem('research-canvas-meanings') || '[]'); },
  async saveMeanings(values) { localStorage.setItem('research-canvas-meanings',JSON.stringify(values)); },
  async listTemplates(){return CanvasTemplates.validateLibrary(M,JSON.parse(localStorage.getItem('research-canvas-templates')||JSON.stringify(CanvasTemplates.empty())));},
  async saveTemplate(template,makeDefault=false){const library=await this.listTemplates();library.custom=[...library.custom.filter(row=>row.id!==template.id),template];if(makeDefault)library.defaults[template.mode]=template.id;localStorage.setItem('research-canvas-templates',JSON.stringify(CanvasTemplates.validateLibrary(M,library)));},
  async saveDefaultTemplate(mode,board,revision){const library=CanvasTemplates.saveDefault(M,await this.listTemplates(),mode,board,revision);localStorage.setItem('research-canvas-templates',JSON.stringify(library));},
  async fillTemplate(){throw Error('AI template filling is available when installed in Zotero.');},
  async selected() { throw Error('Zotero selection is available when installed in Zotero.'); },
  async open() { throw Error('Open linked items from the installed Zotero plugin.'); }
};
let workspace, explorer, objectTools;
let customMeanings = [];
let annotationAppearance={background:'#67b2e0',text:'#ffffff',rules:[]};
let board, selection = null, undo = [], redo = [], revision = 0, savedRevision = -1;
let saveTimer, saveChain = Promise.resolve(), gesture = null, ready = false, attachmentHint = null, hoverAttachment = null;
let noteFrame = null, noteOpening = false, refreshTimer, stopWatching, refreshJob = null, refreshAgain = false;
let styleTarget = null, activeTool = null, styleAnchor = null;
let labelDraft = null;
let noteMenuID = null, aiMenuID = null;
let previewsLoading = 0, objectTap=null;
const relationTasks = new Set();
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function report(error) { console.error(error); status(error.message, true); }
function act(fn) { return (...args) => { Promise.resolve().then(() => fn(...args)).catch(report); }; }
function checkpoint() { undo.push(M.clone(board)); if (undo.length > 80) undo.shift(); redo = []; }
function changed() {
  revision++; status('Unsaved changes'); clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flush().catch(report), 350);
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
}
function flush() {
  clearTimeout(saveTimer);
  if (!ready || savedRevision === revision) return saveChain;
  const snapshot = M.validate(board), rev = revision;
  const job = saveChain.then(async () => {await bridge.save(snapshot);if(snapshot.templateDefaultMode){if(!bridge.saveDefaultTemplate)throw Error('Default template storage is unavailable.');await bridge.saveDefaultTemplate(snapshot.templateDefaultMode,snapshot,snapshot.templateDefaultRevision);}}).then(async () => {
    savedRevision = rev;
    if (revision === rev) status(snapshot.templateDefaultMode?'Template saved automatically':'Saved locally');
    const option = [...$('boards').options].find(o => o.value === snapshot.id);
    if (option) option.textContent = snapshot.title;
    await explorer?.refresh();
  });
  saveChain = job.catch(() => {}); // Caller receives the error; later saves may retry.
  return job;
}
function selected() {
  if (!selection) return null;
  return (selection.kind === 'node' ? board.nodes : board.edges).find(x => x.id === selection.id);
}
function select(kind, id) {
  if (selection?.id === id && selection?.kind === kind) { inspector(); return; }
  finishLabel();
  hideStyles();
  selection = id ? {kind, id} : null; render(); inspector();
}
function inspector() {
  const value = selected();
  $('card-form').hidden = !value || selection.kind !== 'node';
  $('edge-form').hidden = !value || selection.kind !== 'edge';
  $('selection-hint').hidden = !!value; $('delete').disabled = !value;
  if (!value) return;
  if (selection.kind === 'node') {
    for (const key of ['title', 'text', 'colour', 'border', 'borderWidth', 'fontSize', 'width', 'height']) $(key).value = value[key];
    $('width').min=value.objectType?'24':'140';$('height').min=value.objectType?'24':'100';$('open-link').hidden = !value.link;
    $('expand-note').hidden = value.kind !== 'note';
    $('title').readOnly = $('text').readOnly = value.kind === 'note' || value.kind === 'annotation';
    $('title-field').hidden = $('text-field').hidden = value.kind === 'note' || value.kind === 'annotation';if(['table','library','file'].includes(value.objectType))$('text-field').hidden=true;
  } else {
    for (const key of ['style', 'thickness', 'arrow']) $(key).value = value[key];
    $('edge-colour').value = value.colour; $('hierarchy').checked = value.hierarchy;
    $('outlineColour').value = value.outlineColour || '#253d3b'; $('outlineWidth').value = value.outlineWidth || 0;
    $('sync-related').disabled = !notePair(value);
  }
}
function renderMeanings() {
  const container=$('meaning-options');container.replaceChildren();
  for(const preset of M.meanings(customMeanings)){
    const row=html('div');row.className='meaning-row';const button=html('button');button.type='button';button.textContent=preset.title;button.dataset.meaning=preset.id;button.style.borderLeft='5px solid '+preset.colour;
    button.onclick=()=>{const edge=selected();if(!edge||selection.kind!=='edge')return;checkpoint();for(const key of M.meaningFields)edge[key]=preset[key];changed();render();inspector();};row.append(button);
    if(customMeanings.some(p=>p.id===preset.id)){const remove=html('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remove meaning '+preset.title);remove.onclick=act(async()=>{const next=customMeanings.filter(p=>p.id!==preset.id);await bridge.saveMeanings(next);customMeanings=next;renderMeanings();});row.append(remove);}
    container.append(row);
  }
}
function edgeMiddle(id) {
  const line = [...$('edges').querySelectorAll('.edge-hit')].find(el => el.dataset.edge === id);
  return line ? line.getPointAtLength(line.getTotalLength() / 2) : null;
}
function edgePoint(id, near) {
  const line=[...$('edges').querySelectorAll('.edge-hit')].find(el=>el.dataset.edge===id);
  if(!line)throw Error('Connector is no longer visible.');
  const length=line.getTotalLength();let closest=line.getPointAtLength(length/2),distance=Infinity;
  for(let i=1;i<100;i++){const p=line.getPointAtLength(length*i/100),d=(p.x-near.x)**2+(p.y-near.y)**2;if(d<distance){distance=d;closest=p;}}
  return {x:closest.x,y:closest.y};
}
function addJunction(edgeID,near,saveHistory=true){
  const at=edgePoint(edgeID,near);if(saveHistory)checkpoint();
  const result=M.splitEdge(board,edgeID,at);board=result.board;changed();render();select('node',result.junctionID);return result.junctionID;
}
function positionLabelEditor() {
  if (!labelDraft) return;
  const middle = edgeMiddle(labelDraft.id);
  if (!middle) { finishLabel(false); return; }
  const viewport = $('viewport').getBoundingClientRect(), input = $('label-editor');
  input.style.left = Math.max(viewport.left + 8, Math.min(viewport.right - input.offsetWidth - 8, viewport.left + board.view.x + middle.x * board.view.zoom - input.offsetWidth / 2)) + 'px';
  input.style.top = Math.max(viewport.top + 8, Math.min(viewport.bottom - 42, viewport.top + board.view.y + middle.y * board.view.zoom - 18)) + 'px';
}
function openLabel(id) {
  finishLabel(); select('edge', id); hideStyles();
  const edge = selected(); if (!edge) return;
  labelDraft = {id, boardID: board.id};
  const input = $('label-editor'), palette = M.labelPalette(edge.colour);
  input.value = edge.label; input.hidden = false;
  Object.assign(input.style, {backgroundColor: palette.background, color: palette.foreground, borderColor: palette.border});
  render(); positionLabelEditor(); input.focus({preventScroll: true}); input.select();
}
function finishLabel(commit = true) {
  if (!labelDraft) return;
  const draft = labelDraft; labelDraft = null;
  const input = $('label-editor'), value = input.value.trim(); input.hidden = true;
  const edge = board?.id === draft.boardID && board.edges.find(e => e.id === draft.id);
  if (commit && edge && edge.label !== value) { checkpoint(); edge.label = value; changed(); }
  render();
}
function notePair(edge) {
  if (!edge) return null;
  const pair = [edge.source, edge.target].map(id => board.nodes.find(n => n.id === id));
  return pair.every(n => n?.kind === 'note' && n.link) ? pair.map(n => M.clone(n.link)) : null;
}
function syncRelation(edge) {
  const pair = notePair(edge);
  if (!pair || !bridge.relateNotes) return;
  const task = Promise.resolve().then(() => bridge.relateNotes(...pair)).then(async () => { await flush(); status('Notes related in Zotero'); });
  relationTasks.add(task);
  task.catch(report).finally(() => relationTasks.delete(task));
}
function annotationDocument(n) {
  const parsed = new DOMParser().parseFromString(n.annotationHTML, 'text/html');
  const tags = new Set(['DIV', 'P', 'SPAN', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SUB', 'SUP', 'BR', 'UL', 'OL', 'LI', 'IMG', 'A', 'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'PRE', 'CODE', 'HR']);
  for (const el of [...parsed.body.querySelectorAll('*')]) {
    if (!tags.has(el.tagName)) { el.remove(); continue; }
    for (const attribute of [...el.attributes]) {
      const name = attribute.name;
      if (!['class', 'style', 'width', 'height', 'data-annotation', 'data-citation', 'src'].includes(name)
        || (name === 'src' && (el.tagName !== 'IMG' || !/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(attribute.value)))) el.removeAttribute(name);
    }
  }
  const textNodes=[],walker=parsed.createTreeWalker(parsed.body,NodeFilter.SHOW_TEXT);let textNode;
  while((textNode=walker.nextNode()))if(!textNode.parentElement.closest('pre,code,a'))textNodes.push(textNode);
  for(const node of textNodes){
    const matches=[...node.textContent.matchAll(/(^|[\s([{])(#(?:[\p{L}\p{N}_-]+\/)*[\p{L}\p{N}_-]+)/gu)];if(!matches.length)continue;
    const fragment=parsed.createDocumentFragment();let from=0;
    for(const match of matches){const start=match.index+match[1].length,tag=match[2],rules=(annotationAppearance.rules||[]).filter(r=>tag===r.prefix||tag.startsWith(r.prefix+'/')).sort((a,b)=>b.prefix.length-a.prefix.length),colours=rules[0]||annotationAppearance,pill=parsed.createElement('span');fragment.append(parsed.createTextNode(node.textContent.slice(from,start)));pill.className='canvas-tag-pill';pill.textContent=tag;if(/^#[a-f0-9]{6}$/i.test(colours.background||''))pill.style.backgroundColor=colours.background;if(/^#[a-f0-9]{6}$/i.test(colours.text||''))pill.style.color=colours.text;fragment.append(pill);from=start+tag.length;}
    fragment.append(parsed.createTextNode(node.textContent.slice(from)));node.replaceWith(fragment);
  }
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src resource: \'unsafe-inline\'; font-src resource:"><link rel="stylesheet" href="resource://zotero/note-editor/editor.css"><style>html,body{margin:0;background:transparent;color:#253d3b}body{padding:14px;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.45;overflow-wrap:anywhere}.ProseMirror{outline:none}img{max-width:100%;height:auto}blockquote{background:#fff;border-left:3px solid #a7cedd;margin:12px 0;padding:14px 12px;color:#242424}.canvas-tag-pill{border-radius:8px;padding:0 3px;color:#fff;box-decoration-break:clone;-webkit-box-decoration-break:clone}p{margin:.6em 0}h1,h2,h3{line-height:1.25}a{color:#216d85;text-decoration:underline}</style></head><body><div class="primary-editor"><div class="editor-core"><div class="ProseMirror">' + parsed.body.innerHTML + '</div></div></div></body></html>';
}
function previewWarning(key, message) {
  for (const slot of $('cards').querySelectorAll('.note-preview')) if (slot.dataset.key === key) {
    const caption = slot.querySelector('.preview-message'); caption.hidden = false; caption.textContent = message; caption.classList.add('error');
  }
}
function toggleNoteMenu(id) {
  aiMenuID=null;noteMenuID = noteMenuID === id ? null : id; hideStyles(); render();
  if (noteMenuID) [...$('cards').children].find(card => card.dataset.id === id)?.querySelector('.note-actions-menu button:not(:disabled)')?.focus({preventScroll: true});
}
async function saveInlineNotes(close = false) {
  const slots = [...$('cards').querySelectorAll('.note-preview[data-editing=true]')];
  await Promise.all(slots.map(async slot => {
    const host = slot.querySelector('iframe')?.contentWindow.NoteHost;
    if (!host) throw Error('An inline note editor is not ready to save.');
    if (close) { await host.setEditable(false); slot.dataset.editing = 'false'; }
    else await host.flush({close: false});
  }));
  if (close && slots.length) render();
}
async function toggleInlineNote(id) {
  const card = [...$('cards').children].find(el => el.dataset.id === id), slot = card?.querySelector('.note-preview');
  if (!slot || slot.dataset.state !== 'ready' || slot.dataset.switching === 'true') throw Error('Wait for the note preview to load.');
  const editing = slot.dataset.editing !== 'true'; slot.dataset.switching = 'true'; render();
  try {
    await slot.querySelector('iframe').contentWindow.NoteHost.setEditable(editing);
    slot.dataset.editing = String(editing);
    if (!editing) { await refreshNotes(); await flush(); }
  } finally { slot.dataset.switching = 'false'; render(); }
}
function loadVisibleNotes() {
  if (!bridge.nativeNotes || !board) return;
  const viewport = $('viewport').getBoundingClientRect();
  for (const slot of $('cards').querySelectorAll('.note-preview')) {
    if (previewsLoading >= 2) break;
    if (slot.dataset.state !== 'pending') continue;
    const r = slot.getBoundingClientRect();
    if (r.right < viewport.left || r.left > viewport.right || r.bottom < viewport.top || r.top > viewport.bottom) continue;
    const node = board.nodes.find(n => n.id === slot.closest('.card').dataset.id); if (!node) continue;
    slot.dataset.state = 'loading'; previewsLoading++;
    const frame = html('iframe'); frame.className = 'native-note-preview'; frame.title = 'Note preview: ' + node.title;
    frame.src = 'chrome://research-canvas/content/note-host.xhtml'; slot.prepend(frame);
    (async () => {
      try {
        const deadline = Date.now() + 15000;
        while (!frame.contentWindow.NoteHost || !frame.contentWindow.document.getElementById('canvas-note-editor')) {
          if (!slot.isConnected) return;
          if (Date.now() > deadline) throw Error('The Zotero note preview did not initialize.');
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        const capabilities = await frame.contentWindow.NoteHost.open(node.link, {preview: true, cardID: node.id});
        if (!slot.isConnected) return;
        slot.dataset.state = 'ready'; slot.dataset.editable = String(capabilities.editable); slot.querySelector('.preview-message').hidden = true; render();
      } catch (error) {
        if (!slot.isConnected) return;
        frame.remove(); slot.dataset.state = 'error';
        const caption = slot.querySelector('.preview-message'); caption.textContent = 'Note preview unavailable: ' + error.message; caption.classList.add('error'); caption.hidden = false;
        const retry = html('button'); retry.textContent = 'Retry preview'; retry.className = 'linked'; retry.addEventListener('click', ev => { ev.stopPropagation(); retry.remove(); caption.textContent = 'Loading Zotero note...'; slot.dataset.state = 'pending'; loadVisibleNotes(); }); slot.append(retry);
        console.error(error);
      } finally { previewsLoading--; if (ready) loadVisibleNotes(); }
    })();
  }
}
function renderView() {
  $('world').style.transform = `translate(${board.view.x}px,${board.view.y}px) scale(${board.view.zoom})`;
  $('zoom').textContent = Math.round(board.view.zoom * 100) + '%';
  positionStyles();positionLabelEditor();workspace?.positionFrameMenu();loadVisibleNotes();
}
function render() {
  if(attachmentHint&&!gesture)attachmentHint.hidden=true;
  const appearance=board.appearance||CanvasSettings.defaults().canvas;Object.assign($('viewport').style,{backgroundColor:appearance.background,backgroundImage:appearance.showGrid?`radial-gradient(${appearance.gridColour} 1px,transparent 1px)`:'none',backgroundSize:appearance.gridSize+'px '+appearance.gridSize+'px'});
  const positions = M.positions(board);
  $('world').style.transform = `translate(${board.view.x}px,${board.view.y}px) scale(${board.view.zoom})`;
  $('zoom').textContent = Math.round(board.view.zoom * 100) + '%';
  $('mode').value = board.mode;$('mode').disabled=!!board.templateDefaultMode; $('mode')._canvasChoices?.sync(); $('board-title').value = board.title;
  if($('mode-toggle'))$('mode-toggle').disabled=!!board.templateDefaultMode;
  if($('mode-toggle'))$('mode-toggle').textContent=$('mode').selectedOptions[0].textContent+' ▾';
  $('mindmap-direction').hidden=board.mode!=='mindmap';
  $('reflow-layout').hidden=!M.layoutKey(board);
  for(const button of $('mindmap-direction').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.direction===(board.mindmapDirection||'horizontal')));
  $('empty').hidden = !!board.nodes.length || !!board.frames?.length || !!board.edges.length;
  $('template-save').hidden=!CanvasTemplates.modes.includes(board.mode)||!board.nodes.some(n=>!n.junction)||board.nodes.some(n=>n.link||n.kind||n.objectType);
  $('template-fill').hidden=!CanvasTemplates.modes.includes(board.mode)||!board.templateDraft;
  $('template-omissions').hidden=!board.templateOmissions?.length;
  if(board.mode==='matrix')$('empty').innerHTML='Choose sources in Zotero.<br/><small>Select items in the main library pane, then click + Zotero selection above, or drag them here.</small>';
  else $('empty').innerHTML='Start with an idea.<br/><small>Add a card or bring in your Zotero selection.</small>';
  $('format-guides').replaceChildren();
  for(const guide of M.formatGuides(board)){
    const group=svg('g',{class:'format-guide format-'+guide.kind});
    group.append(svg('rect',{x:guide.x,y:guide.y,width:guide.width,height:guide.height,rx:12}));
    const title=svg('text',{x:guide.x+17,y:guide.y+31});title.textContent=guide.label;group.append(title);$('format-guides').append(group);
  }
  const existingCards = new Map([...$('cards').children].map(card => [card.dataset.id, card]));
  const currentIDs = new Set(board.nodes.map(n => n.id));
  for (const [id, card] of existingCards) if (!currentIDs.has(id)) card.remove();
  $('edges').replaceChildren(); $('handles').replaceChildren();
  const nodes = new Map(board.nodes.map(n => [n.id, {...n, ...positions.get(n.id)}]));
  for (const e of board.edges) {
    const a = M.endpoint(e,'source',nodes), c = M.endpoint(e,'target',nodes);
    const geometry=M.edgeGeometry(board,e,a,c),d=M.edgePath(board,e,a,c);
    const defs = svg('defs');
    for (const [suffix, direction] of [['end', 'auto'], ['start', 'auto-start-reverse']]) {
      const marker = svg('marker', {id: `arrow-${e.id}-${suffix}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: direction});
      marker.append(svg('path', {d: 'M 0 0 L 10 5 L 0 10 z', fill: e.fillMode === 'outline' ? '#f0f2ed' : e.colour, stroke: e.colour, 'stroke-width': e.fillMode === 'outline' ? 1.5 : 0})); defs.append(marker);
    }
    $('edges').append(defs);
    const dash = e.pattern === 'dashed' ? `${e.thickness * 4} ${e.thickness * 3}` : e.pattern === 'dotted' ? `1 ${Math.max(5, e.thickness * 2.5)}` : 'none';
    const width = e.thickness + (e.fillMode === 'outline' ? 4 : 0);
    const appearance = {'data-filter-edge': e.id, 'stroke-dasharray': dash, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'};
    if (e.outlineWidth) $('edges').append(svg('path', {d, class: 'edge-line edge-outline', stroke: e.outlineColour || '#253d3b', 'stroke-width': width + e.outlineWidth * 2, ...appearance}));
    const line = svg('path', {d, class: 'edge-line edge-main', stroke: e.colour, 'stroke-width': width, ...appearance});
    if (['end', 'both'].includes(e.arrow)) line.setAttribute('marker-end', `url(#arrow-${e.id}-end)`);
    if (['start', 'both'].includes(e.arrow)) line.setAttribute('marker-start', `url(#arrow-${e.id}-start)`);
    if (selection?.id === e.id) $('edges').append(svg('path', {d, class: 'edge-line', 'data-filter-edge': e.id, stroke: '#70b7a8', 'stroke-width': e.thickness + 7, opacity: .6}));
    const hit = svg('path', {d, class: 'edge-hit', 'data-edge': e.id});
    hit.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; ev.stopPropagation(); select('edge', e.id); });
    hit.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); openStyles('edge', e.id, {x: ev.clientX, y: ev.clientY, world: point(ev)}); });
    $('edges').append(line);
    if (e.fillMode === 'outline') $('edges').append(svg('path', {d, class: 'edge-line edge-hollow', stroke: '#f0f2ed', 'stroke-width': e.thickness, ...appearance}));
    $('edges').append(hit);
    if (selection?.id === e.id) {
      for (const [end, node, side] of [['source', a, geometry.sourceSide], ['target', c, geometry.targetSide]]) {
        const p = M.anchor(node, side,e[end+'Offset']), handle = svg('circle', {cx: p.x, cy: p.y, r: 13/board.view.zoom, class: 'endpoint', 'data-end': end, 'data-filter-edge': e.id, role: 'button', 'aria-label': 'Move connector ' + end});
        handle.addEventListener('pointerdown', ev => {
          if (ev.button !== 0) return; ev.preventDefault(); ev.stopPropagation(); hideStyles(); checkpoint();
          gesture = {type: 'reconnect', id: e.id, end, pointer: ev.pointerId, start: point(ev), moved: false, originalHierarchy: e.hierarchy};
          $('viewport').setPointerCapture(ev.pointerId);
        }); $('handles').append(handle,svg('circle',{cx:p.x,cy:p.y,r:5/board.view.zoom,class:'endpoint-visual'}));
      }
    }
    if(selection?.id===e.id&&board.mode!=='mindmap'&&e.style==='elbow'){
      const points=M.elbowPoints(a,c,geometry.sourceSide,geometry.targetSide,e.routePoints||[],e.sourceOffset,e.targetOffset);
      if(points.length===3){const p=points[1],size=24/board.view.zoom,h=svg('rect',{x:p.x-size/2,y:p.y-size/2,width:size,height:size,rx:2,class:'route-handle',role:'button','aria-label':'Move elbow corner','data-edge':e.id});h.addEventListener('pointerdown',ev=>{if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();hideStyles();checkpoint();gesture={type:'elbow-corner',id:e.id,points:M.clone(points),start:point(ev),pointer:ev.pointerId};$('viewport').setPointerCapture(ev.pointerId);});$('handles').append(h,svg('rect',{x:p.x-4/board.view.zoom,y:p.y-4/board.view.zoom,width:8/board.view.zoom,height:8/board.view.zoom,class:'route-handle-visual'}));}
      for(let i=1;i<points.length-2;i++){const p=points[i],q=points[i+1],middle={x:(p.x+q.x)/2,y:(p.y+q.y)/2},size=24/board.view.zoom,h=svg('rect',{x:middle.x-size/2,y:middle.y-size/2,width:size,height:size,rx:2,class:'route-handle',role:'button','aria-label':'Move elbow segment','data-edge':e.id,'data-route-index':i});h.addEventListener('pointerdown',ev=>{if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();hideStyles();checkpoint();gesture={type:'elbow-route',id:e.id,index:i,points:M.clone(points),horizontal:Math.abs(p.y-q.y)<.01,start:point(ev),pointer:ev.pointerId};$('viewport').setPointerCapture(ev.pointerId);});$('handles').append(h,svg('rect',{x:middle.x-4/board.view.zoom,y:middle.y-4/board.view.zoom,width:8/board.view.zoom,height:8/board.view.zoom,rx:2,class:'route-handle-visual'}));}
      for(const endpoint of $('handles').querySelectorAll('.endpoint,.endpoint-visual'))$('handles').append(endpoint);
    }
    if(selection?.id===e.id&&board.mode!=='mindmap'&&e.style!=='elbow'){
      const route=e.routePoints?.length?e.routePoints:[.25,.5,.75].map(t=>{const p=line.getPointAtLength(line.getTotalLength()*t);return {x:p.x,y:p.y};});
      const addHandle=(p,index,insert=false)=>{const size=24/board.view.zoom,h=svg('rect',{x:p.x-size/2,y:p.y-size/2,width:size,height:size,rx:2,class:'route-handle',role:'button','aria-label':insert?'Add connector bend':'Move connector bend','data-route-index':index,'data-edge':e.id});
        h.addEventListener('pointerdown',ev=>{if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();hideStyles();checkpoint();gesture={type:'route',id:e.id,index,route:M.clone(route),insert,point:{...p},start:point(ev),pointer:ev.pointerId};$('viewport').setPointerCapture(ev.pointerId);});
        h.addEventListener('dblclick',ev=>{ev.preventDefault();ev.stopPropagation();if(!ev.altKey||insert||!e.routePoints?.length){openLabel(e.id);return;}checkpoint();e.routePoints.splice(index,1);changed();render();});$('handles').append(h,svg('rect',{x:p.x-4/board.view.zoom,y:p.y-4/board.view.zoom,width:8/board.view.zoom,height:8/board.view.zoom,rx:2,class:'route-handle-visual'}));};
      route.forEach((p,i)=>addHandle(p,i));
      if(e.routePoints?.length){const points=[M.anchor(a,e.sourceSide||'right',e.sourceOffset),...route,M.anchor(c,e.targetSide||'left',e.targetOffset)];for(let i=0;i<points.length-1;i++)addHandle({x:(points[i].x+points[i+1].x)/2,y:(points[i].y+points[i+1].y)/2},i,true);}
      for(const endpoint of $('handles').querySelectorAll('.endpoint,.endpoint-visual'))$('handles').append(endpoint);
    }
    if (e.label && labelDraft?.id !== e.id) {
      const middle = edgeMiddle(e.id), measure=document.createElement('canvas').getContext('2d');measure.font="14px 'Avenir Next', 'Segoe UI', sans-serif";const width=Math.min(360,Math.max(60,Math.ceil(measure.measureText(e.label).width)+30));
      const label = svg('foreignObject', {class: 'edge-label', 'data-edge': e.id, x: middle.x - width / 2, y: middle.y - 16, width, height: 32});
      const pill = html('div'); pill.className = 'edge-pill'; pill.textContent = e.label; pill.title = e.label;pill.style.whiteSpace='normal';pill.style.overflowWrap='anywhere';pill.style.overflow='visible';
      const palette = M.labelPalette(e.colour); Object.assign(pill.style, {backgroundColor: palette.background, color: palette.foreground, borderColor: palette.border}); label.append(pill);const height=Math.max(32,pill.scrollHeight);label.setAttribute('height',height);label.setAttribute('y',middle.y-height/2);
      label.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; ev.stopPropagation(); select('edge', e.id); }); $('edges').append(label);
      label.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); openStyles('edge', e.id, {x: ev.clientX, y: ev.clientY, world: point(ev)}); });
    }
  }
  for (const n of nodes.values()) {
    const card = existingCards.get(n.id) || html('article'); card.className = 'card' + (selection?.id === n.id ? ' selected' : ''); card.dataset.id = n.id;card.ondblclick=null;
    let preview = n.kind === 'note' && bridge.nativeNotes ? card.querySelector('.note-preview') : null;
    const annotationFrame = n.kind === 'annotation' ? card.querySelector('.annotation-frame') : null;
    const objectImage = n.objectType && n.objectType !== 'file' ? card.querySelector('.object-body') : null;
    const canvasBody = n.kind === 'canvas' ? card.querySelector('.body') : null;
    if (preview && preview.dataset.source !== `${n.link.libraryID}/${n.link.key}`) { preview.remove(); preview = null; }
    // Moving an iframe out of the DOM reloads its document and visibly flashes.
    for (const child of [...card.children]) if (child !== preview && child !== annotationFrame && child !== objectImage && child !== canvasBody && !(n.objectType==='file'&&child.classList.contains('file-preview'))) child.remove();
    card.tabIndex = 0; card.setAttribute('aria-label', n.title);
    Object.assign(card.style, {left: n.x + 'px', top: n.y + 'px', width: n.width + 'px', height: n.height + 'px', backgroundColor: n.colour, borderColor: n.border, borderWidth: n.borderWidth + 'px', fontSize: n.fontSize + 'px'});
    card.style.backgroundColor = n.fillMode === 'outline' ? 'transparent' : n.colour + (n.fillMode === 'partial' ? '59' : ''); card.style.borderStyle = n.pattern || 'solid';
    card.style.borderRadius = n.shape === 'rectangle' ? '0' : n.shape === 'ellipse' ? '50%' : '9px';
    if(n.junction){
      card.classList.add('junction-card');card.title='Connector junction: drag to connect; right-click to delete';
      card.oncontextmenu=ev=>{ev.preventDefault();ev.stopPropagation();openStyles('node',n.id);};
      card.onpointerdown=ev=>{if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();select('node',n.id);checkpoint();gesture={type:'connect',id:n.id,side:'right',start:point(ev),pointer:ev.pointerId};$('viewport').setPointerCapture(ev.pointerId);};
      if(!card.isConnected)$('cards').append(card);
      continue;
    }
    if (n.shape === 'ellipse') card.classList.add('oval-card');
    card.oncontextmenu = ev => { ev.preventDefault(); ev.stopPropagation(); openStyles('node', n.id); };
    const heading = html('div'); heading.className = 'heading'; heading.textContent = n.title; heading.title = n.title;
    if(n.synthesisType){card.classList.add('synthesis-card');heading.style.backgroundColor=n.border;heading.style.borderColor=n.border;}
    let cardHeading = heading;
    if (n.kind === 'note' || n.kind === 'annotation') {
      card.classList.add('note-card'); if (noteMenuID === n.id) card.classList.add('actions-open');
      const header = html('div'); header.className = 'note-card-header';
      const toggle = html('button'); toggle.type = 'button'; toggle.className = 'linked note-actions-toggle'; toggle.title = n.kind === 'annotation' ? 'Annotation actions' : 'Note actions'; toggle.setAttribute('aria-label', toggle.title + ' for ' + n.title); toggle.setAttribute('aria-haspopup', 'menu'); toggle.setAttribute('aria-expanded', String(noteMenuID === n.id));
      const icon = svg('svg', {viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true'}); icon.append(svg('path', {d: 'M4 16l-1 5 5-1L20 8l-4-4z M13 7l4 4 M4 16l4 4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'})); toggle.append(icon);
      toggle.addEventListener('click', () => toggleNoteMenu(n.id)); header.append(heading, toggle); cardHeading = header;
    }
    const body = html('div'); body.className = 'body'; body.textContent = n.text;
    if(n.topicHeading){const topic=html('h3');topic.className='topic-heading';topic.textContent=n.topicHeading;body.replaceChildren(topic,document.createTextNode(n.text.startsWith(n.topicHeading)?n.text.slice(n.topicHeading.length).trimStart():n.text));}
    if(!n.kind || n.kind==='reference')for(const target of [heading,body])target.ondblclick=ev=>{ev.stopPropagation();openStyles('node',n.id);$('style-toolbar').querySelector('[data-tool=text]').click();$(target===heading?'title':'text').focus();};
    if (n.kind === 'note' && bridge.nativeNotes) {
      if (!preview) {
        preview = html('div'); preview.className = 'note-preview'; preview.dataset.source = `${n.link.libraryID}/${n.link.key}`; preview.dataset.key = n.link.key; preview.dataset.state = 'pending';
        const message = html('small'); message.className = 'preview-message'; message.textContent = 'Loading Zotero note...'; preview.append(message); card.append(preview);
      }
      card.append(cardHeading);
    } else if (n.objectType==='file') {
      card.classList.add('file-card');card.append(cardHeading);
      let body=card.querySelector('.file-preview');
      if(!body){body=html('div');body.className='file-preview';const d=n.objectData;
        if(d.mime.startsWith('image/')){const image=html('img');image.src='data:'+d.mime+';base64,'+d.base64;image.alt=d.name;image.draggable=false;body.append(image);}
        else if(d.mime==='application/pdf'){const frame=html('iframe');frame.setAttribute('type','content');frame.title=d.name;frame.src='data:application/pdf;base64,'+d.base64;body.append(frame);}
        else {const text=html('pre');text.textContent=d.preview||'Preview unavailable for this file type. Use Save file to open it in another application.';body.append(text);}
        const download=html('a');download.className='linked file-download';download.textContent='Save file';download.download=d.name;download.href='data:'+d.mime+';base64,'+d.base64;body.append(download);card.append(body);
      }
    } else if (n.objectType) {
      card.classList.add('object-card','object-'+n.objectType);card.style.backgroundColor='transparent';card.style.borderWidth='0';const image=objectImage||html('img');image.className='object-body';image.alt=n.title;image.draggable=false;const source='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(CanvasObjects.svg(n));if(image.src!==source)image.src=source;image.ondblclick=card.ondblclick=ev=>{if(ev.target.closest('button'))return;ev.stopPropagation();if(n.objectType==='table')objectTools.editTable(n.id);else if(n.objectType!=='library'){openStyles('node',n.id);$('style-toolbar').querySelector('[data-tool=text]').click();$('text').focus();}};if(objectImage)card.insertBefore(cardHeading,image);else card.append(cardHeading,image);
    } else if (n.kind === 'annotation') {
      const frame = annotationFrame || html('iframe'); frame.className = 'annotation-frame'; frame.title = 'Annotation preview: ' + n.title;
      frame.setAttribute('sandbox', '');
      if(frame._canvasSourceHTML!==n.annotationHTML||frame._canvasAppearance!==annotationAppearance){frame.srcdoc=annotationDocument(n);frame._canvasSourceHTML=n.annotationHTML;frame._canvasAppearance=annotationAppearance;}
      if(annotationFrame)card.insertBefore(cardHeading,frame);else card.append(cardHeading,frame);
      if(n.annotationColour){const pill=html('span');pill.className='annotation-colour-pill';pill.textContent=n.annotationColourName || 'Highlight colour';pill.style.backgroundColor=n.annotationColour;pill.style.color=M.labelPalette(n.annotationColour).foreground;card.append(pill);}
      if (n.sourceUnavailable) { const warning = html('small'); warning.className = 'source-warning'; warning.textContent = 'Source unavailable; showing saved preview'; card.append(warning); }
    } else if(n.kind==='canvas'){
      card.classList.add('canvas-card');const displayBody=canvasBody||body;if(canvasBody)card.insertBefore(cardHeading,displayBody);else card.append(cardHeading,displayBody);if(!canvasBody)displayBody.textContent=n.embedded?'Loading canvas preview...':'Linked canvas';
      const open=html('button');open.className='linked open-canvas';open.textContent='Open canvas';open.onclick=act(()=>switchBoard(n.canvasID));card.append(open);
      const refresh=html('button');refresh.className='linked';refresh.textContent='Refresh preview';refresh.onclick=act(()=>drawCanvasPreview(n,displayBody));if(n.embedded)card.append(refresh);
      drawCanvasPreview(n,displayBody).catch(report);
    } else card.append(cardHeading, body);
    const ai=html('button');ai.type='button';ai.className='linked card-ai-toggle';ai.title='AI actions';ai.hidden=['library','file'].includes(n.objectType);ai.setAttribute('aria-label','AI actions for '+n.title);ai.setAttribute('aria-haspopup','menu');ai.setAttribute('aria-expanded',String(aiMenuID===n.id));
    const aiIcon=svg('svg',{viewBox:'0 0 24 24',width:20,height:20,'aria-hidden':'true'});aiIcon.append(svg('path',{d:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M20 3v4 M18 5h4',fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linejoin':'round'}));ai.append(aiIcon);
    ai.onclick=()=>{const opening=aiMenuID!==n.id;aiMenuID=opening?n.id:null;noteMenuID=null;hideStyles();select('node',n.id);render();if(opening)[...$('cards').children].find(c=>c.dataset.id===n.id)?.querySelector('.card-ai-menu button:not(:disabled)')?.focus({preventScroll:true});};
    const aiMenu=html('div');aiMenu.className='card-ai-menu';aiMenu.hidden=aiMenuID!==n.id;aiMenu.setAttribute('role','menu');aiMenu.setAttribute('aria-label','AI actions');
    if(aiMenuID===n.id)card.classList.add('actions-open');
    for(const [action,title]of [['connections','Connections'],['counterexample','Counter'],['support','Supporting']]){const b=html('button');b.type='button';b.className='linked';b.textContent=title;b.dataset.aiAction=action;b.setAttribute('role','menuitem');b.disabled=n.kind==='canvas';if(b.disabled)b.title='Choose a text, note, reference or annotation card';b.onclick=act(()=>{aiMenuID=null;aiMenu.hidden=true;ai.setAttribute('aria-expanded','false');workspace.openAI(n.id,action);});aiMenu.append(b);}
    aiMenu.onkeydown=ev=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(ev.key))return;ev.preventDefault();ev.stopPropagation();const items=[...aiMenu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);items[ev.key==='Home'?0:ev.key==='End'?items.length-1:(i+(ev.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();};card.append(ai,aiMenu);

    const handles = [['se', 'bottom right'], ['sw', 'bottom left'], ['ne', 'top right'], ['nw', 'top left'], ['n', 'top'], ['e', 'right'], ['s', 'bottom'], ['w', 'left']].map(([direction, label]) => {
      const handle = html('button'); handle.className = 'resize resize-' + direction; handle.dataset.direction = direction; handle.setAttribute('aria-label', 'Resize ' + n.title + ' from ' + label); return handle;
    });
    if (n.kind === 'note' || n.kind === 'annotation') {
      const menu = html('div'); menu.className = 'note-actions-menu'; menu.hidden = noteMenuID !== n.id; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', n.kind==='annotation'?'Annotation actions':'Note actions');
      menu.addEventListener('keydown', ev => { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) return; ev.preventDefault(); const items = [...menu.querySelectorAll('button:not(:disabled)')], index = items.indexOf(document.activeElement); if (!items.length) return; const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1 : (index + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next].focus(); });
      const closeMenu = () => { noteMenuID = null; menu.hidden = true; card.classList.remove('actions-open'); card.querySelector('.note-actions-toggle').setAttribute('aria-expanded', 'false'); };
      if(n.kind==='annotation'){
        const expand=html('button');expand.className='linked expand-annotation';expand.textContent=n.height>=500?'Collapse annotation':'Expand annotation';expand.setAttribute('role','menuitem');expand.onclick=()=>{closeMenu();checkpoint();const current=board.nodes.find(x=>x.id===n.id);current.height=current.height>=500?280:600;changed();render();};menu.append(expand);
        const open=html('button');open.className='linked open-source';open.textContent='Open source';open.setAttribute('role','menuitem');open.onclick=act(()=>{closeMenu();if(n.annotationKey){if(!bridge.openSource)throw Error('Open source is available in the installed Zotero plugin.');return bridge.openSource(n.link,n.annotationKey);}return bridge.open(n.link,n.pageIndex);});menu.append(open);card.append(menu);
      }else{
      if (bridge.nativeNotes) {
        const edit = html('button'); edit.className = 'linked edit-note'; edit.textContent = preview.dataset.switching === 'true' ? 'Saving...' : preview.dataset.editing === 'true' ? 'Done editing' : preview.dataset.editable === 'false' ? 'Read-only note' : 'Edit note';
        edit.disabled = preview.dataset.state !== 'ready' || preview.dataset.switching === 'true' || preview.dataset.editable === 'false';
        edit.setAttribute('role', 'menuitem'); edit.addEventListener('click', act(() => { closeMenu(); return toggleInlineNote(n.id); })); menu.append(edit);
      } else {
        const edit = html('button'); edit.className = 'linked edit-note'; edit.textContent = 'Edit note'; edit.disabled = true; edit.setAttribute('role', 'menuitem'); menu.append(edit);
      }
      const expand = html('button'); expand.className = 'linked expand-note'; expand.textContent = 'Expand / edit note';
      expand.setAttribute('role', 'menuitem'); expand.addEventListener('click', act(() => { closeMenu(); return expandNote(n); })); menu.append(expand);
      const open = html('button'); open.className = 'linked open-note'; open.textContent = 'Open in Zotero'; open.setAttribute('role', 'menuitem'); open.addEventListener('click', act(() => { closeMenu(); return bridge.open(n.link); })); menu.append(open); card.append(menu);
      }
    }
    if (n.link && n.kind !== 'note' && n.kind !== 'annotation') { const link = html('button'); link.className = 'linked'; link.textContent = n.annotationKey ? 'Open source' : Number.isInteger(n.pageIndex)?'Open PDF page':'Open in Zotero'; link.addEventListener('click', act(() => { if (!n.annotationKey) return bridge.open(n.link,n.pageIndex); if (!bridge.openSource) throw Error('Open source is available in the installed Zotero plugin.'); return bridge.openSource(n.link, n.annotationKey); })); card.append(link); }
    card.append(...handles);
    card.onpointerdown = ev => {
      if(ev.target.closest('.file-preview')){ev.stopPropagation();return;}
      if (workspace?.cardPointerDown(ev, n)) return;
      if (ev.target.closest('.note-preview')) { ev.stopPropagation(); return; }
      if (ev.target.closest('.linked')) { ev.stopPropagation(); return; }
      if (ev.button !== 0) return;
      ev.stopPropagation();
      if(n.objectType&&ev.target.closest('.object-body')){const now=performance.now();if(objectTap?.id===n.id&&now-objectTap.time<500&&Math.hypot(ev.clientX-objectTap.x,ev.clientY-objectTap.y)<7){objectTap=null;ev.preventDefault();select('node',n.id);if(n.objectType==='table')objectTools.editTable(n.id);else if(n.objectType!=='library'){openStyles('node',n.id);$('style-toolbar').querySelector('[data-tool=text]').click();$('text').focus();}return;}objectTap={id:n.id,time:now,x:ev.clientX,y:ev.clientY};}
      const type = ev.target.closest('.port') ? 'connect' : ev.target.closest('.resize') ? 'resize' : (ev.target.closest('.heading')||n.objectType&&ev.target.closest('.object-body')) && (board.mode === 'canvas'||M.layoutKey(board)) ? 'move' : null;
      select('node', n.id);
      if (type) {
        const position=type==='move'?M.positions(board).get(n.id):n;
        checkpoint(); gesture = {type, id: n.id,minWidth:n.objectType?24:140,minHeight:n.objectType?24:100, side: ev.target.closest('.port')?.dataset.side, direction: ev.target.closest('.resize')?.dataset.direction, start: point(ev), x: position.x, y: position.y, width: n.width, height: n.height, pointer: ev.pointerId};
        $('viewport').setPointerCapture(ev.pointerId); ev.preventDefault();
      }
    };
    if (!card.isConnected) $('cards').append(card);
  }
  workspace?.render();objectTools?.render();
  explorer?.accent();
  positionStyles();
  positionLabelEditor();
  loadVisibleNotes();
}
const toolSpecs = {
  node: [['shape', 'Card shape', 'M4 5h16v14H4z'], ['fill', 'Card colour', 'M12 3l8 8-8 8-8-8z M4 22h16'], ['border', 'Border', 'M4 4h16v16H4z M8 8h8v8H8z'], ['text', 'Text size', 'M5 5h14 M12 5v15 M8 20h8'], ['size', 'Card dimensions', 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5']],
  edge: [['route', 'Connector shape', 'M3 18h6V6h12'], ['stroke', 'Connector colour', 'M4 12h16'], ['weight', 'Connector thickness', 'M4 5h16 M4 12h16 M4 19h16'], ['outline', 'Connector outline', 'M3 8h18v8H3z'], ['pattern', 'Solid, dashed or dotted', 'M3 12h4 M10 12h4 M17 12h4'], ['edgefill', 'Connector fill', 'M3 8h18v8H3z M3 12h18'], ['arrows', 'Arrowheads', 'M3 12h18 M15 6l6 6-6 6'], ['meaning', 'Link types', 'M4 5h16v11H9l-5 4z M8 9h8'], ['relation', 'Parent-child relationship', 'M12 3v7 M5 14v7 M19 14v7 M5 14v-4h14v4']]
};
function hideStyles() {
  $('style-toolbar').hidden = $('style-popover').hidden = true;
  styleTarget = null; activeTool = null;
}
function updateVisualChoices() {
  const value = selected();
  for (const button of document.querySelectorAll('.visual-options button')) {
    const field = button.dataset.field;
    const current = value?.[field] || (field === 'pattern' ? 'solid' : field === 'fillMode' ? 'filled' : 'end');
    button.setAttribute('aria-pressed', String(button.dataset.value === current));
  }
}
function renderOrganizationPanel(){
  const panel=$('tools-organize'),n=selected();panel.replaceChildren();if(!n||!M.formatGuides(board).length)return;
  const title=html('strong');title.textContent='Place in '+$('mode').selectedOptions[0].textContent;panel.append(title);
  const fields={evidence:[['evidenceRole','Role','select',[['','Automatic'],['claim','Claim'],['support','Supporting'],['critical','Critical'],['unresolved','Unresolved']]]],matrix:[['matrixRow','Source / row','text'],['matrixColumn','Theme / column','text']],timeline:[['timelineDate','Date (YYYY or YYYY-MM-DD)','text']],literature:[['literatureGroup','Concept / group','text']],process:[['processStep','Step number','number']]}[board.mode]||[];
  for(const [key,name,type,options]of fields){const label=html('label');label.textContent=name;const input=html(type==='select'?'select':'input');if(type==='select')for(const [value,text]of options){const option=html('option');option.value=value;option.textContent=text;input.append(option);}else{input.type=type;input.maxLength=100;if(type==='number'){input.min='1';input.max='5000';}}
    input.value=n.organization?.[key]??'';input.setAttribute('aria-label',name);input.onchange=()=>{const value=input.value.trim();if(key==='timelineDate'&&value&&!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)){status('Use YYYY, YYYY-MM or YYYY-MM-DD.',true);return;}if(key==='processStep'&&value&&(!Number.isInteger(Number(value))||Number(value)<1||Number(value)>5000)){status('Choose a step from 1 to 5000.',true);return;}checkpoint();n.organization||={};if(value)n.organization[key]=key==='processStep'?Number(value):value;else delete n.organization[key];if(!Object.keys(n.organization).length)delete n.organization;changed();render();fit();};label.append(input);panel.append(label);}
}
function openStyles(kind, id, anchor = null) {
  finishLabel();
  select(kind, id); inspector(); styleTarget = {kind, id}; styleAnchor = anchor; activeTool = null;
  for (const button of $('shape-options').children) button.setAttribute('aria-pressed', String(button.dataset.shape === (selected().shape || 'rounded')));
  for (const button of $('route-options').children) button.setAttribute('aria-pressed', String(button.dataset.route === selected().style));
  updateVisualChoices();
  $('style-popover').hidden = true;
  const bar = $('style-toolbar'); bar.replaceChildren();
  for (const [key, title, path] of [...(kind==='node'&&selected().junction?[]:toolSpecs[kind]),...(kind==='edge'?[['junction','Add junction at this point','M12 3v18 M3 12h18 M8 8a4 4 0 1 0 8 8a4 4 0 1 0-8-8']]:[]),...(kind==='node'&&!selected().junction&&CanvasFormats.structured.has(board.mode)?[['organize','Place in view','M4 5h16 M4 12h16 M4 19h16 M8 3v18']]:[]),...(kind==='node'&&selected().objectType==='table'?[['table','Edit table','M3 4h18v16H3z M3 9h18 M9 4v16 M15 4v16']]:[]),...(kind==='node'&&selected().counterexampleEvidence?[['counterevidence','View source explanation','M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5']]:[]),...(kind==='edge'&&selected().aiEvidence?[['evidence','View connection explanation','M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5']]:[]),['delete','Delete selection','M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7']]) {
    const button = html('button'); button.type = 'button'; button.dataset.tool = key;
    button.title = title; button.setAttribute('aria-label', title); button.setAttribute('aria-expanded', 'false');
    if (key === 'fill' || key === 'stroke') button.style.setProperty('--swatch', selected().colour);
    const icon = svg('svg', {viewBox: '0 0 24 24', width: 21, height: 21, 'aria-hidden': 'true'});
    icon.append(svg('path', {d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'})); button.append(icon);
    button.addEventListener('click', () => {
      if(key==='table'){const id=selected().id;hideStyles();objectTools.editTable(id);return;}
      if(key==='junction'){const id=selected().id,near=styleAnchor?.world||edgeMiddle(id);hideStyles();addJunction(id,near);return;}
      if(key==='delete'){act(deleteSelection)();return;}
      if(key==='counterevidence'){workspace.showCounterexampleEvidence(selected());hideStyles();return;}
      if(key==='evidence'){workspace.showConnectionEvidence(selected());hideStyles();return;}
      activeTool = activeTool === key ? null : key;if(activeTool==='organize')renderOrganizationPanel();
      for (const item of bar.children) item.setAttribute('aria-expanded', String(item === button && !!activeTool));
      for (const panel of document.querySelectorAll('.style-options')) panel.hidden = panel.id !== 'tools-' + activeTool;
      $('style-popover').hidden = !activeTool;
      positionStyles();
    });
    bar.append(button);
  }
  bar.hidden = false; positionStyles(); bar.firstElementChild.focus({preventScroll: true});
}
function positionStyles() {
  if (!styleTarget || $('style-toolbar').hidden) return;
  if (selection?.id !== styleTarget.id || selection?.kind !== styleTarget.kind || !selected()) { hideStyles(); return; }
  const viewport = $('viewport').getBoundingClientRect(), bar = $('style-toolbar');
  let anchor, titleHeight = 0;
  if (styleTarget.kind === 'node') { const card = [...$('cards').children].find(el => el.dataset.id === styleTarget.id); anchor = card?.getBoundingClientRect(); titleHeight = card?.querySelector('.heading').getBoundingClientRect().height || 0; }
  else anchor = {left: styleAnchor.x, right: styleAnchor.x, top: styleAnchor.y, bottom: styleAnchor.y};
  if (!anchor || anchor.right < viewport.left || anchor.left > viewport.right || anchor.bottom < viewport.top || anchor.top > viewport.bottom) { hideStyles(); return; }
  const clamp = (v, low, high) => Math.max(low, Math.min(v, Math.max(low, high)));
  const x = clamp((anchor.left + anchor.right - bar.offsetWidth) / 2, viewport.left + 8, viewport.right - bar.offsetWidth - 8);
  const above = anchor.top - bar.offsetHeight - titleHeight - 12;
  const y = clamp(above >= viewport.top + 8 ? above : anchor.bottom + 12, viewport.top + 8, viewport.bottom - bar.offsetHeight - 8);
  Object.assign(bar.style, {left: x + 'px', top: y + 'px'});
  const pop = $('style-popover');
  if (!pop.hidden) {
    const button = [...bar.children].find(el => el.dataset.tool === activeTool).getBoundingClientRect();
    const px = clamp(button.left - 12, viewport.left + 8, viewport.right - pop.offsetWidth - 8);
    const aboveSpace = y - viewport.top - 17, belowSpace = viewport.bottom - y - bar.offsetHeight - 17;
    const above = pop.scrollHeight + 2 <= aboveSpace || aboveSpace >= belowSpace;
    pop.style.maxHeight = Math.max(20, above ? aboveSpace : belowSpace) + 'px';
    const py = above ? y - pop.offsetHeight - 9 : y + bar.offsetHeight + 9;
    Object.assign(pop.style, {left: px + 'px', top: py + 'px'});
  }
}
function refreshNotes() {
  if (!bridge.refresh || !board) return Promise.resolve();
  refreshAgain = true;
  if (!refreshJob) refreshJob = Promise.resolve().then(async () => {
    try { while (refreshAgain) { refreshAgain = false; await refreshCurrentSources(); } }
    finally { refreshJob = null; }
  });
  return refreshJob;
}
async function refreshCurrentSources() {
  const activeBoard = board;
  {
    const links = [...new Map(board.nodes.filter(n => n.link && (n.kind !== 'annotation' || n.annotationKey)).map(n => [`${n.link.libraryID}/${n.link.key}/${n.kind === 'annotation' ? n.annotationKey : ''}`, n.kind === 'annotation' ? {...n.link, annotationKey: n.annotationKey} : n.link])).values()];
    if (!links.length) return;
    const items = await bridge.refresh(links);
    if (board !== activeBoard) return;
    let updated = false;
    for (const item of items) {
      if (item.annotationKey) {
        // Source refreshes update cached content in history too, so canvas Undo
        // cannot restore an obsolete annotation or undo an edit made in Zotero.
        for (const snapshot of [board, ...undo, ...redo]) {
          for (const n of snapshot.nodes.filter(n => n.kind === 'annotation' && n.annotationKey === item.annotationKey && n.link?.libraryID === item.link.libraryID && n.link.key === item.link.key)) {
            const values = item.missing ? {sourceUnavailable: true} : {title: item.title, text: item.text, annotationHTML: item.annotationHTML, ...(item.annotationColour ? {annotationColour:item.annotationColour,annotationColourName:item.annotationColourName || 'Custom colour'} : {}), sourceUnavailable: false, ...(item.metadata ? {metadata: item.metadata} : {})};
            for (const [key, value] of Object.entries(values)) if (JSON.stringify(n[key]) !== JSON.stringify(value)) { n[key] = value; if (snapshot === board) updated = true; }
          }
        }
        continue;
      }
      for (const snapshot of [board, ...undo, ...redo]) {
        for (const n of snapshot.nodes.filter(n => n.link?.libraryID === item.link.libraryID && n.link.key === item.link.key)) {
          if (item.metadata && JSON.stringify(n.metadata) !== JSON.stringify(item.metadata)) { n.metadata = M.clone(item.metadata); if (snapshot === board) updated = true; }
          if (item.missing) continue; // Keep the last preview when its source is unavailable.
          if (!n.synthesis && (item.kind === 'note' || n.kind === 'note' || n.kind === undefined)) {
            for (const key of ['kind', 'title', 'text']) if (n[key] !== item[key]) { n[key] = item[key]; if (snapshot === board) updated = true; }
          }
        }
      }
    }
    if (updated) { changed(); render(); inspector(); }
  }
}
function scheduleSourceRefresh() {
  clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refreshNotes().catch(report), 120);
}
async function expandNote(n) {
  hideStyles();
  if (noteOpening || noteFrame) return;
  await saveInlineNotes(true);
  if (!bridge.refresh) throw Error('Native note editing is available in the installed Zotero plugin.');
  noteOpening = true;
  $('note-panel').hidden = false; $('note-title').textContent = n.title;
  noteStatus('Loading Zotero note editor...');
  $('close-note').disabled = true;
  const frame = html('iframe'); frame.id = 'native-note-frame'; frame.setAttribute('title', 'Zotero note editor'); noteFrame = frame;
  try {
    frame.src = 'chrome://research-canvas/content/note-host.xhtml'; $('note-frame-container').append(frame);
    // XUL documents embedded in HTML chrome windows don't reliably fire iframe load.
    const deadline = Date.now() + 15000;
    while (!frame.contentWindow.NoteHost || !frame.contentWindow.document.getElementById('canvas-note-editor')) {
      if (Date.now() > deadline) throw Error('The note editor could not be loaded.');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await frame.contentWindow.NoteHost.open(n.link);
  } catch (error) { frame.remove(); noteFrame = null; $('note-panel').hidden = true; throw error; }
  finally { noteOpening = false; $('close-note').disabled = false; }
}
function noteStatus(message, error = false) { $('note-status').textContent = message; $('note-status').classList.toggle('error', error); }
async function closeNote() {
  if (noteOpening) throw Error('Wait for the note editor to finish loading.');
  if (!noteFrame) return;
  $('close-note').disabled = true;
  noteFrame.inert = true;
  noteStatus('Saving note to Zotero...');
  try {
    await noteFrame.contentWindow.NoteHost.flush();
    noteFrame.remove(); noteFrame = null; $('note-panel').hidden = true;
    await refreshNotes(); await flush();
  } catch (error) { noteStatus(error.message, true); throw error; }
  finally { if (noteFrame) noteFrame.inert = false; $('close-note').disabled = false; }
}
function itemNode(item,x,y){const n=M.node(x,y,item.title,item.text);n.link=item.link;if(item.metadata)n.metadata=M.clone(item.metadata);n.kind=item.kind||'reference';if(n.kind==='annotation'){n.annotationHTML=item.annotationHTML;if(item.evidenceQuote?.length>=12)n.evidenceQuote=item.evidenceQuote;if(item.annotationColour){n.annotationColour=item.annotationColour;n.annotationColourName=item.annotationColourName||'Custom colour';}if(item.annotationKey)n.annotationKey=item.annotationKey;}return n;}
function addItems(items,x,y){if(!items.length){status('Select or drop notes and references from Zotero first.');return;}checkpoint();items.forEach((item,i)=>board.nodes.push(itemNode(item,x+i*35,y+i*45)));changed();render();}
async function addCounterexample(row,sourceID,expectedBoard){
  if(board!==expectedBoard)throw Error('The canvas changed. Search again.');const source=board.nodes.find(n=>n.id===sourceID);if(!source)throw Error('The selected card was removed.');
  const existing=board.nodes.find(n=>n.link&&n.link.libraryID+'/'+(n.annotationKey||n.link.key)===row.key);if(existing)throw Error('This source is already on the canvas.');
  const snapshot=CanvasConnections.prepare(await bridge.connectionCards([source]))[0],candidate=await bridge.counterexampleCard(row.itemID);
  if(board!==expectedBoard)throw Error('The canvas changed. Search again.');if(snapshot?.signature!==row.selectedSignature||candidate.signature!==row.signature||candidate.key!==row.key)throw Error('The selected card or library source changed. Search again before adding.');
  if(!snapshot.text.includes(row.selectedExcerpt)||!candidate.fullText.includes(row.candidateExcerpt))throw Error('The supporting excerpts no longer match the original sources.');
  const items=await bridge.fromDrop(String(row.itemID));if(board!==expectedBoard)throw Error('The canvas changed. Search again.');
  if(board.nodes.some(n=>n.link&&n.link.libraryID+'/'+(n.annotationKey||n.link.key)===row.key))throw Error('This source is already on the canvas.');
  const position=M.positions(board).get(source.id),n=itemNode(items[0],position.x+source.width+100,position.y);while(board.nodes.some(c=>n.x<c.x+c.width+20&&n.x+n.width+20>c.x&&n.y<c.y+c.height+45&&n.y+n.height+45>c.y))n.y+=n.height+60;
  n.evidenceQuote=row.candidateExcerpt;n.counterexampleEvidence={purpose:row.purpose||'counterexample',selectedCardID:source.id,selectedTitle:row.selectedTitle,selectedExcerpt:row.selectedExcerpt,candidateExcerpt:row.candidateExcerpt,reason:row.reason,type:row.type,model:row.model,generatedAt:row.generatedAt,selectedSignature:row.selectedSignature,candidateSignature:row.signature};const edge=M.edge(source.id,n.id);Object.assign(edge,{label:row.purpose==='support'?'SL ✅':'❌CL',colour:row.purpose==='support'?'#277c6b':'#b34747',thickness:3,hierarchy:false,aiEvidence:{reason:row.reason,sourceExcerpt:row.selectedExcerpt,targetExcerpt:row.candidateExcerpt,sourceTitle:row.selectedTitle,targetTitle:row.title,sourceSignature:row.selectedSignature,targetSignature:row.signature,model:row.model,generatedAt:row.generatedAt}});checkpoint();board.nodes.push(n);board.edges.push(edge);changed();render();
  try{await flush();}catch(error){board.nodes=board.nodes.filter(c=>c.id!==n.id);board.edges=board.edges.filter(e=>e.id!==edge.id);changed();render();throw error;}return n.id;
}
let searchRequest = 0;
async function searchLibrary(ev) {
  ev.preventDefault();
  const request = ++searchRequest, results = $('search-results');
  results.replaceChildren(); results.hidden = true; $('search-close').hidden = false;
  $('search-status').textContent = 'Searching...';
  try {
    if (!bridge.search) throw Error('Library search is available in the installed Zotero plugin.');
    const matches = await bridge.search($('search-query').value, $('search-mode').value, $('search-types').querySelector('[aria-pressed=true]').dataset.kind);
    if (request !== searchRequest) return;
    for (const item of matches) {
      const button = html('button'); button.type = 'button'; button.className = 'search-result';
      const title = html('strong'); title.textContent = item.title;
      const detail = html('small'); detail.textContent = item.kind + ' · ' + item.library;
      button.append(title, detail); button.addEventListener('click', act(async () => {
        const items = await bridge.fromDrop(String(item.id));
        addItems(items, (80 - board.view.x) / board.view.zoom, (100 - board.view.y) / board.view.zoom);
        searchRequest++; results.hidden = true; $('search-close').hidden = true; $('search-status').textContent = 'Added to ' + board.title;
        status('Added to ' + board.title);
      })); results.append(button);
    }
    results.hidden = !matches.length;
    $('search-status').textContent = matches.length ? matches.length + ' results — click an item to add it to this canvas.' : 'No results. Try another term or search method.';
  } catch (error) { if (request === searchRequest) $('search-status').textContent = error.message; }
}
function point(ev) {
  const r = $('viewport').getBoundingClientRect();
  return {x: (ev.clientX - r.left - board.view.x) / board.view.zoom, y: (ev.clientY - r.top - board.view.y) / board.view.zoom};
}
function fit() {
  if (!board.nodes.length && !board.frames?.length && !board.edges.length) return;
  const ps = M.positions(board); let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const headers = new Map([...$('cards').children].map(card => [card.dataset.id, card.querySelector('.note-card-header,.heading')?.getBoundingClientRect().height / board.view.zoom || 0]));
  for (const n of board.nodes) { const p = ps.get(n.id); left = Math.min(left, p.x); top = Math.min(top, p.y - (headers.get(n.id) || 0)); right = Math.max(right, p.x + n.width); bottom = Math.max(bottom, p.y + n.height); }
  for (const f of board.frames || []) { const r = workspace?.frameRect(f) || f; left = Math.min(left, r.x); top = Math.min(top, r.y - 40); right = Math.max(right, r.x + r.width); bottom = Math.max(bottom, r.y + r.height); }
  for(const r of M.extraRects(board)){left=Math.min(left,r.x);top=Math.min(top,r.y);right=Math.max(right,r.x+(r.width||0));bottom=Math.max(bottom,r.y+(r.height||0));}
  board.view.zoom = Math.max(.2, Math.min(1.5, ($('viewport').clientWidth - 100) / (right - left), ($('viewport').clientHeight - 100) / (bottom - top)));
  board.view.x = 50 - left * board.view.zoom; board.view.y = 50 - top * board.view.zoom;
  changed(); render();
}
function createChild(parent,side='right'){
  const ps=M.positions(board),n=M.child({...parent,...ps.get(parent.id)},side);
  while(board.nodes.some(c=>n.x<c.x+c.width+20&&n.x+n.width+20>c.x&&n.y<c.y+c.height+45&&n.y+n.height+45>c.y))n.y+=n.height+60;
  const e=M.edge(parent.id,n.id);e.sourceSide=side;e.targetSide={right:'left',left:'right',top:'bottom',bottom:'top'}[side];board.nodes.push(n);board.edges.push(e);changed();select('node',n.id);if(board.mode!=='canvas')fit();return n;
}
function addObjects(nodes,edges=[],frames=[]){const next={...board,nodes:[...board.nodes,...nodes],edges:[...board.edges,...edges],frames:[...(board.frames||[]),...frames]};M.validate(next);checkpoint();board.nodes.push(...nodes);board.edges.push(...edges);if(frames.length)(board.frames||=[]).push(...frames);changed();select('node',nodes[0].id);if(nodes.length>1)fit();}
function addNode(x, y) { checkpoint(); const n = M.node(x, y); board.nodes.push(n); changed(); select('node', n.id); }
async function refreshList() {
  $('boards').replaceChildren();
  for (const b of await bridge.list()) { const o = html('option'); o.value = b.id; o.textContent = b.title; $('boards').append(o); }
  if (board) $('boards').value = board.id;
  await explorer?.refresh();
}
async function switchBoard(id) {
  if(!(await bridge.list()).some(b=>b.id===id))throw Error('Canvas is unavailable or in Trash. Restore it from the Explorer.');
  await saveInlineNotes(true);
  await closeNote();
  await flush(); const next = await checkTemplateEditor(await bridge.load(id)); board = next;
  selection = null; undo = []; redo = []; revision = 0; savedRevision = 0;
  render(); inspector(); await refreshList(); $('undo').disabled = true; $('redo').disabled = true; status('Saved locally'); await refreshNotes();
}
async function checkTemplateEditor(next){if(next.templateDefaultMode&&bridge.listTemplates){const library=await bridge.listTemplates();if(next.templateDefaultRevision!==CanvasTemplates.revisionFor(library,next.templateDefaultMode)){delete next.templateDefaultMode;delete next.templateDefaultRevision;}}return next;}
function defaultTemplatesReset(value,mode=null){let detached=false;for(const snapshot of [board,...undo,...redo])if(snapshot?.templateDefaultMode&&(!mode||snapshot.templateDefaultMode===mode)&&snapshot.templateDefaultRevision<value){delete snapshot.templateDefaultMode;delete snapshot.templateDefaultRevision;detached=true;}if(detached){changed();render();status('Defaults restored. Reopen a default template from Templates to edit it.');}}
async function restoreBoard(snapshot){
  const next=M.validate(snapshot);await saveInlineNotes(true);await closeNote();await flush();next.id=M.board().id;next.title+=' (restored)';await bridge.save(next);board=next;revision=savedRevision=0;selection=null;undo=[];redo=[];await refreshList();render();inspector();await refreshNotes();fit();await flush();
}
async function jumpTo(boardID,cardID){
  if(board.id!==boardID){await refreshList();await switchBoard(boardID);$('boards').value=boardID;}
  const n=board.nodes.find(n=>n.id===cardID);if(!n)throw Error('This card was removed. Refresh its canvas membership.');
  const p=M.positions(board).get(n.id);board.view.zoom=Math.max(.2,Math.min(1,($('viewport').clientWidth-120)/n.width,($('viewport').clientHeight-160)/n.height));
  board.view.x=$('viewport').clientWidth/2-(p.x+n.width/2)*board.view.zoom;board.view.y=$('viewport').clientHeight/2-(p.y+n.height/2)*board.view.zoom;
  changed();select('node',n.id);await flush();
}
async function deleteSelection() {
  if (!selected()) return;
  const original = selection, activeBoard = board;
  await saveInlineNotes(true);
  if (board !== activeBoard || selection !== original) return;
  checkpoint(); const id = selection.id;
  if (selection.kind === 'node') { board.nodes = board.nodes.filter(n => n.id !== id); for (const f of board.frames || []) f.members = f.members.filter(member => member !== id); board.edges = board.edges.filter(e => e.source !== id && e.target !== id); }
  else board.edges = board.edges.filter(e => e.id !== id);
  changed(); select(null, null);
}
async function history(direction) {
  await saveInlineNotes(true);
  const from = direction === 'undo' ? undo : redo, to = direction === 'undo' ? redo : undo;
  if (!from.length) return; to.push(M.clone(board)); board = from.pop(); selection = null; changed(); render(); inspector();
}
let templateAction=null,templateGeneration=0;
function openTemplateDialog(action){
  templateAction=action;templateGeneration++;$('template-dialog-title').textContent=action==='save'?'Save canvas template':'Fill template with AI';
  $('template-dialog-help').textContent=action==='save'?'Edit the cards and their AI instructions first. Begin a conditional card with “Only if: …” to require explicit source support. This saves a reusable, source-free template for this format.':'Select 1–8 regular Zotero sources. Cards headed 1. Definition, 2. Alternative view, and so on run in number order; unnumbered cards run together afterward. Cards beginning “Only if: …” are created only when supported; omitted reasons appear after filling. Each numbered step makes one AI request.';
  $('template-name-row').hidden=action!=='save';$('template-focus-row').hidden=action!=='fill';$('template-default-row').hidden=action!=='save'||!CanvasTemplates.formats.includes(board.mode);
  $('template-confirm').textContent=action==='save'?'Save template':'Fill cards';$('template-name').required=action==='save';
  $('template-name').value=action==='save'?(board.templateSourceName||''):'';$('template-focus').value='';$('template-default').checked=false;$('template-dialog-status').textContent='';$('template-dialog-shade').hidden=false;
  if(action==='save'&&board.templateSourceID)$('template-dialog-help').textContent='Save changes to this template. New canvases created from it will use these instructions.';
  (action==='save'?$('template-name'):$('template-focus')).focus();
}
function closeTemplateDialog(){templateGeneration++;$('template-dialog-shade').hidden=true;templateAction=null;}
function showTemplateOmissions(){
  const rows=board.templateOmissions||[],list=$('template-omissions-list');list.replaceChildren();
  for(const row of rows){const item=html('article'),title=html('strong'),condition=html('p'),reason=html('p');title.textContent=row.title;condition.textContent='Condition: '+row.condition;reason.textContent='AI assessment: '+row.reason;item.append(title,condition,reason);list.append(item);}
  $('template-omissions-panel').hidden=!rows.length;
}
async function submitTemplateDialog(){
  const action=templateAction,active=board,generation=templateGeneration;if(!action)return;
  $('template-confirm').disabled=true;$('template-dialog-status').textContent=action==='fill'?'Reading selected sources and checking excerpts…':'';
  try{
    finishLabel();await saveInlineNotes();await flush();if(board!==active)throw Error('The canvas changed. Reopen the template action.');const activeRevision=revision;
    if(action==='save'){
      if(!bridge.saveTemplate)throw Error('Template storage is unavailable.');
      const template=CanvasTemplates.capture(M,board,$('template-name').value,board.templateSourceID||crypto.randomUUID());
      await bridge.saveTemplate(template,CanvasTemplates.formats.includes(board.mode)&&$('template-default').checked);board.templateDraft=true;board.templateSourceID=template.id;board.templateSourceName=template.name;changed();render();await flush();closeTemplateDialog();status('Custom template saved');
    }else{
      const result=await bridge.fillTemplate(M.clone(board),$('template-focus').value,step=>{
        if(generation!==templateGeneration)throw Error('Template fill dismissed.');
        if(board!==active||revision!==activeRevision)throw Error('The canvas changed during AI generation. No cards were replaced.');
        $('template-dialog-status').textContent='Analysing '+(step.number===null?'unnumbered cards':'step '+step.number)+' ('+step.index+' of '+step.total+')…';
      });
      if(generation!==templateGeneration)return;
      if(board!==active||revision!==activeRevision)throw Error('The canvas changed during AI generation. No cards were replaced.');
      checkpoint();board=M.validate(result.board);changed();render();fit();await flush();closeTemplateDialog();if(board.templateOmissions?.length)showTemplateOmissions();status(result.filled+' template cards filled; '+(board.templateOmissions?.length||0)+' conditional branches omitted; '+result.rejected+' unsupported AI entries excluded.');
    }
  }catch(error){if(generation===templateGeneration){$('template-dialog-status').textContent=error.message;report(error);}}
  finally{$('template-confirm').disabled=false;}
}
function nearestAttachment(p,exclude=null,tolerance=Infinity){
  const positions=M.positions(board);let best=null;
  for(const node of board.nodes){if(node.id===exclude||node.junction)continue;const rect={...node,...positions.get(node.id)},at=M.attachment(rect,p),anchor=M.anchor(rect,at.side,at.offset),distance=Math.hypot(p.x-anchor.x,p.y-anchor.y);if(distance<=tolerance&&(!best||distance<best.distance))best={id:node.id,...at,anchor,distance};}
  return best;
}
function showAttachment(ev){
  if(!attachmentHint)return;
  if(!gesture&&selection?.kind==='edge'){const edge=board.edges.find(e=>e.id===selection.id),positions=M.positions(board),nodes=new Map(board.nodes.map(n=>[n.id,{...n,...positions.get(n.id)}]));if(edge){const a=M.endpoint(edge,'source',nodes),b=M.endpoint(edge,'target',nodes),g=M.edgeGeometry(board,edge,a,b),p=point(ev);if([['source',a,g.sourceSide],['target',b,g.targetSide]].some(([end,node,side])=>{const at=M.anchor(node,side,edge[end+'Offset']);return Math.hypot(at.x-p.x,at.y-p.y)<18/board.view.zoom;})){attachmentHint.hidden=true;hoverAttachment=null;return;}}}
  if(!gesture&&(ev.altKey||ev.target.closest('.resize-se,.resize-sw,.resize-ne,.resize-nw,.linked,button:not(.perimeter-port):not(.resize)'))&&!ev.target.closest('.perimeter-port')){attachmentHint.hidden=true;return;}
  const edge=gesture?.type==='reconnect'?board.edges.find(e=>e.id===gesture.id):null,exclude=gesture?.type==='connect'?gesture.id:edge?edge[gesture.end==='source'?'target':'source']:null;
  const match=nearestAttachment(point(ev),exclude,18/board.view.zoom);hoverAttachment=match;attachmentHint.hidden=!match;
  if(match){attachmentHint.dataset.node=match.id;attachmentHint.dataset.side=match.side;attachmentHint.style.left=board.view.x+match.anchor.x*board.view.zoom+'px';attachmentHint.style.top=board.view.y+match.anchor.y*board.view.zoom+'px';attachmentHint.style.pointerEvents=gesture?'none':'auto';attachmentHint.setAttribute('aria-label','Connect '+board.nodes.find(n=>n.id===match.id).title+' at this edge position');}
}
function bind() {
  attachmentHint=html('button');attachmentHint.type='button';attachmentHint.id='attachment-hint';attachmentHint.className='perimeter-port';attachmentHint.title='Drag to connect here; click to add a child; Alt-drag an edge to resize';attachmentHint.hidden=true;$('viewport').append(attachmentHint);
  attachmentHint.onpointerdown=ev=>{if(ev.button!==0||!hoverAttachment)return;ev.preventDefault();ev.stopPropagation();const at={...hoverAttachment};select('node',at.id);checkpoint();gesture={type:'connect',id:at.id,side:at.side,offset:at.offset,start:point(ev),pointer:ev.pointerId};attachmentHint.hidden=true;$('viewport').setPointerCapture(ev.pointerId);};
  $('viewport').addEventListener('pointerleave',()=>{if(!gesture)attachmentHint.hidden=true;});
  $('canvas-home').onclick=act(async()=>{
    if(!bridge.openDashboard)throw Error('The dashboard is available in the installed Zotero plugin.');
    finishLabel();await saveInlineNotes(true);await closeNote();await flush();await bridge.openDashboard();
  });
  $('template-save').onclick=act(async()=>{if(board.templateDefaultMode){finishLabel();await flush();status('Template saved automatically');}else openTemplateDialog('save');});$('template-fill').onclick=()=>openTemplateDialog('fill');$('template-cancel').onclick=closeTemplateDialog;
  $('template-omissions').onclick=showTemplateOmissions;$('template-omissions-close').onclick=()=>{$('template-omissions-panel').hidden=true;};
  $('template-dialog-shade').onclick=event=>{if(event.target===$('template-dialog-shade'))closeTemplateDialog();};
  $('template-dialog').onsubmit=event=>{event.preventDefault();submitTemplateDialog().catch(report);};
  function choices(container, field, rows, kind = 'edge') {
    for (const [value, title, path] of rows) {
      const button = html('button'); button.type = 'button'; button.dataset.field = field; button.dataset.value = value; button.title = title; button.setAttribute('aria-label', title);
      const icon = svg('svg', {viewBox: '0 0 40 22', width: 40, height: 22, 'aria-hidden': 'true'}); icon.append(svg('path', {d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': field === 'fillMode' && value === 'filled' ? 5 : 1.8, 'stroke-linejoin': 'round'}));
      button.append(icon, document.createTextNode(title));
      button.addEventListener('click', () => { if (selection?.kind !== kind) return; checkpoint(); selected()[field] = value; if (field === 'arrow') $('arrow').value = value; changed(); render(); updateVisualChoices(); });
      $(container).append(button);
    }
  }
  choices('arrow-options', 'arrow', [['none', 'None', 'M4 11h32'], ['start', 'Start', 'M6 11h28 M13 4l-7 7 7 7'], ['end', 'End', 'M4 11h30 M27 4l7 7-7 7'], ['both', 'Both ends', 'M6 11h28 M13 4l-7 7 7 7 M27 4l7 7-7 7']]);
  choices('pattern-options', 'pattern', [['solid', 'Solid', 'M3 11h34'], ['dashed', 'Dashed', 'M3 11h7 M16 11h7 M29 11h7'], ['dotted', 'Dotted', 'M5 11h1 M15 11h1 M25 11h1 M35 11h1']]);
  choices('edgefill-options', 'fillMode', [['filled', 'Filled', 'M3 11h34'], ['outline', 'Outline', 'M3 7h34v8H3z']]);
  choices('card-pattern-options', 'pattern', [['solid', 'Solid border', 'M3 11h34'], ['dashed', 'Dashed border', 'M3 11h7 M16 11h7 M29 11h7'], ['dotted', 'Dotted border', 'M5 11h1 M15 11h1 M25 11h1 M35 11h1']], 'node');
  choices('card-fill-options', 'fillMode', [['filled', 'Filled', 'M5 5h30v12H5z'], ['partial', 'Partial fill', 'M5 5h30v12H5z M6 16L16 6 M16 16L26 6'], ['outline', 'No fill', 'M5 5h30v12H5z']], 'node');
  for (const id of ['colour', 'border', 'edge-colour']) {
    const palette = html('div'); palette.className = 'colour-palette';
    for (const colour of ['#ffffff', '#d5e0e7', '#83939f', '#283b45', '#007f78', '#2ea8e5', '#735ac4', '#d54d89', '#ff6666', '#e98f36', '#f1ce4c', '#5fb236', '#d4f0ed', '#dceefa', '#e8dff7', '#f8dce8', '#faddd5', '#ffe6c7', '#fff4c9', '#e6f2d7']) {
      const swatch = html('button'); swatch.type = 'button'; swatch.className = 'colour-swatch'; swatch.style.backgroundColor = colour; swatch.title = colour; swatch.setAttribute('aria-label', 'Use ' + colour);
      swatch.addEventListener('click', () => { $(id).value = colour; $(id).dispatchEvent(new Event('change')); }); palette.append(swatch);
    }
    $(id).parentElement.after(palette);
  }
  $('label-editor').addEventListener('pointerdown', ev => ev.stopPropagation());
  $('label-editor').addEventListener('blur', () => finishLabel());
  $('label-editor').addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); finishLabel(ev.key === 'Enter'); } });
  for (const [route, title, path] of [['straight', 'Straight', 'M3 18L27 4'], ['curved', 'Curved', 'M3 18C18 18 12 4 27 4'], ['elbow', 'Elbow', 'M3 18H15V4H27']]) {
    const button = html('button'); button.type = 'button'; button.dataset.route = route;
    const icon = svg('svg', {viewBox: '0 0 30 22', width: 30, height: 22, 'aria-hidden': 'true'}); icon.append(svg('path', {d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': 2}));
    button.append(icon, document.createTextNode(title));
    button.addEventListener('click', () => {
      if (selection?.kind !== 'edge') return;
      checkpoint(); selected().style = route; $('style').value = route; changed(); render();
      for (const option of $('route-options').children) option.setAttribute('aria-pressed', String(option === button));
    }); $('route-options').append(button);
  }
  document.addEventListener('pointerdown', ev => {
    if(aiMenuID&&!ev.target.closest('.card-ai-toggle,.card-ai-menu')){aiMenuID=null;render();}
    if (noteMenuID && !ev.target.closest('.note-actions-toggle,.note-actions-menu')) { noteMenuID = null; render(); }
    if (!ev.target.closest('#label-editor')) finishLabel();
    if (!ev.target.closest('#style-toolbar,#style-popover')) hideStyles();
  }, true);
  window.addEventListener('resize', positionStyles);
  window.addEventListener('resize', loadVisibleNotes);
  window.addEventListener('focus', scheduleSourceRefresh);
  for (const [shape, label] of CanvasObjects.shapes.map(shape=>[shape,shape[0].toUpperCase()+shape.slice(1)])) {
    const button = html('button'); button.type = 'button'; button.dataset.shape = shape; button.title = label; button.setAttribute('aria-label', label);
    const icon = svg('svg', {viewBox: '0 0 30 22', width: 38, height: 28, 'aria-hidden': 'true'});
    icon.append(shape === 'ellipse' ? svg('ellipse', {cx: 15, cy: 11, rx: 12, ry: 8, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6}) : svg('rect', {x: 3, y: 3, width: 24, height: 16, rx: shape === 'rounded' ? 5 : 0, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6}));
    if(!['rectangle','rounded','ellipse'].includes(shape)){icon.replaceChildren();const path=svg('path',{d:{diamond:'M15 2L28 11 15 20 2 11Z',hexagon:'M8 3H22L29 11 22 19H8L1 11Z',triangle:'M15 2L29 20H1Z',parallelogram:'M8 3H29L22 19H1Z',cylinder:'M3 5C3 0 27 0 27 5V17C27 22 3 22 3 17Z M3 5C3 10 27 10 27 5',pill:'M9 3H21C31 3 31 19 21 19H9C-1 19 -1 3 9 3Z'}[shape],fill:'none',stroke:'currentColor','stroke-width':1.6});icon.append(path);}
    button.append(icon);
    button.addEventListener('click', () => {
      if (selection?.kind !== 'node') return;
      if(selected().link&&!['rectangle','rounded','ellipse'].includes(shape)){status('Use these shapes for freeform objects; linked source cards keep their readable layout.');return;}
      checkpoint();if(!selected().link&&!['rectangle','rounded','ellipse'].includes(shape))selected().objectType='shape'; selected().shape = shape; changed(); render();
      for (const el of $('shape-options').children) el.setAttribute('aria-pressed', String(el === button));
    }); $('shape-options').append(button);
  }
  for (const form of [$('card-form'), $('edge-form')]) form.addEventListener('submit', ev => ev.preventDefault());
  for (const key of ['title', 'text', 'colour', 'border', 'borderWidth', 'fontSize', 'width', 'height', 'style', 'edge-colour', 'thickness', 'arrow', 'hierarchy', 'outlineWidth', 'outlineColour']) {
    $(key).addEventListener('change', () => {
      const value = selected(); if (!value) return;
      if (value.kind === 'note' && ['title', 'text'].includes(key)) { inspector(); return; }
      const field = key === 'edge-colour' ? 'colour' : key;
      const number = ['borderWidth', 'fontSize', 'width', 'height', 'thickness', 'outlineWidth'].includes(key);
      if (number && !$(key).checkValidity()) { inspector(); return; }
      checkpoint(); value[field] = key === 'hierarchy' ? $(key).checked : number ? Number($(key).value) : $(key).value;
      changed(); render();
      if (key === 'edge-colour' || key === 'colour') [...$('style-toolbar').children].find(b => ['stroke', 'fill'].includes(b.dataset.tool))?.style.setProperty('--swatch', value.colour);
    });
  }
  for (const [id, delta] of [['thickness-less', -1], ['thickness-more', 1]]) $(id).onclick = () => {
    const edge = selected(); if (!edge || !styleTarget || styleTarget.kind !== 'edge') return;
    const next = Math.max(1, Math.min(12, edge.thickness + delta));
    if (next === edge.thickness) return;
    $('thickness').value = String(next); $('thickness').dispatchEvent(new Event('change'));
  };
  renderMeanings();
  $('save-meaning').onclick=act(async()=>{const edge=selected();if(!edge||selection.kind!=='edge')return;const preset=M.meaning(crypto.randomUUID(),$('meaning-name').value,edge),next=[...customMeanings.filter(p=>p.title!==preset.title),preset];if(!bridge.saveMeanings)throw Error('Meaning storage is unavailable.');await bridge.saveMeanings(next);customMeanings=next;$('meaning-name').value='';renderMeanings();status('Link type saved');});
  $('open-link').onclick = act(() => selected().annotationKey ? bridge.openSource(selected().link,selected().annotationKey) : bridge.open(selected().link,selected().pageIndex));
  $('expand-note').onclick = act(() => expandNote(selected()));
  $('close-note').onclick = act(closeNote);
  $('sync-related').onclick = () => syncRelation(selected());
  $('add').onclick = () => addNode((80 - board.view.x) / board.view.zoom, (80 - board.view.y) / board.view.zoom);
  $('add-child').onclick = () => {
    const parent = selection?.kind === 'node' ? selected() : null;
    if (!parent) { status('Select a parent card first.'); return; }
    checkpoint(); createChild(parent);
  };
  $('add-zotero').onclick = act(async () => {
    const items = await bridge.selected();
    if (!items.length) { status('Select notes or references in the Zotero library first.'); return; }
    addItems(items, (60 - board.view.x) / board.view.zoom, (60 - board.view.y) / board.view.zoom); fit();
  });
  const modeChoices=CanvasChoices.attach($('mode'),{label:'View mode',layout:'list'}),modePicker=html('div'),modeToggle=html('button');
  modePicker.id='mode-picker';modeToggle.id='mode-toggle';modeToggle.type='button';modeToggle.setAttribute('aria-haspopup','true');modeToggle.setAttribute('aria-expanded','false');modeToggle.setAttribute('aria-label','Choose canvas format');
  modeChoices.group.replaceWith(modePicker);modePicker.append(modeToggle,modeChoices.group);modeChoices.group.hidden=true;
  const closeModes=()=>{modeChoices.group.hidden=true;modeToggle.setAttribute('aria-expanded','false');};
  modeToggle.onclick=()=>{const open=modeChoices.group.hidden;modeChoices.group.hidden=!open;modeToggle.setAttribute('aria-expanded',String(open));if(open)modeChoices.focus();};
  document.addEventListener('pointerdown',ev=>{if(!modePicker.contains(ev.target))closeModes();});
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeModes();});
  $('mode').onchange = () => { closeModes();modeToggle.textContent=$('mode').selectedOptions[0].textContent+' ▾';checkpoint(); board.mode = $('mode').value; changed(); render(); fit(); };
  for(const button of $('mindmap-direction').querySelectorAll('button'))button.onclick=()=>{if(board.mindmapDirection===button.dataset.direction)return;checkpoint();board.mindmapDirection=button.dataset.direction;changed();render();fit();};
  $('reflow-layout').onclick=()=>{const key=M.layoutKey(board);if(!key)return;checkpoint();for(const n of board.nodes)if(n.layoutOverrides){delete n.layoutOverrides[key];if(!Object.keys(n.layoutOverrides).length)delete n.layoutOverrides;}changed();render();fit();};
  modeToggle.textContent=$('mode').selectedOptions[0].textContent+' ▾';
  $('board-title').onchange = () => { checkpoint(); board.title = $('board-title').value || 'Untitled board'; changed(); };
  $('delete').onclick = act(deleteSelection);
  $('undo').onclick = act(() => history('undo')); $('redo').onclick = act(() => history('redo'));
  $('fit').onclick = fit;
  function setZoom(value) {
    const cx=$('viewport').clientWidth/2,cy=$('viewport').clientHeight/2,old=board.view.zoom;
    const x=(cx-board.view.x)/old,y=(cy-board.view.y)/old;
    board.view.zoom=Math.max(.2,Math.min(3,value));board.view.x=cx-x*board.view.zoom;board.view.y=cy-y*board.view.zoom;changed();renderView();
  }
  $('zoom-in').onclick = () => setZoom(board.view.zoom*1.2); $('zoom-out').onclick = () => setZoom(board.view.zoom/1.2);$('zoom').onclick=()=>setZoom(1);
  $('zoom-centre').onclick=()=>{const ps=M.positions(board),rects=board.nodes.map(n=>({...n,...ps.get(n.id)}));for(const f of board.frames||[])rects.push(workspace?.frameRect(f)||f);rects.push(...M.extraRects(board));if(!rects.length)return;const r=M.bounds(rects,0);board.view.x=$('viewport').clientWidth/2-(r.x+r.width/2)*board.view.zoom;board.view.y=$('viewport').clientHeight/2-(r.y+r.height/2)*board.view.zoom;changed();renderView();};
  for(const type of ['pointerdown','dblclick','wheel'])$('canvas-zoom').addEventListener(type,ev=>ev.stopPropagation());
  $('boards').onchange = act(async () => { try { await switchBoard($('boards').value); } catch (error) { $('boards').value = board.id; throw error; } });
  $('new').onclick = act(() => explorer.create());
  $('export').onclick = act(async () => {
    await saveInlineNotes(); await refreshNotes();
    await flush(); const url = URL.createObjectURL(new Blob([JSON.stringify(board, null, 2)], {type: 'application/json'}));
    const a = html('a'); a.href = url; a.download = board.title.replace(/[^a-z0-9 _-]/gi, '_') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const fileMenu=html('div');fileMenu.id='canvas-file-menu';fileMenu.hidden=true;fileMenu.setAttribute('role','menu');fileMenu.setAttribute('aria-label','Export and import');document.body.append(fileMenu);
  const closeFiles=()=>{fileMenu.hidden=true;$('file-menu-toggle').setAttribute('aria-expanded','false');};
  for(const [label,id]of [['Export JSON','export'],['Import JSON','import'],['Export options & recovery','toggle-export']]){const b=html('button');b.type='button';b.textContent=label;b.setAttribute('role','menuitem');b.dataset.fileAction=id;b.onclick=()=>{closeFiles();$(id).click();};fileMenu.append(b);}
  $('file-menu-toggle').onclick=()=>{const open=fileMenu.hidden;closeFiles();if(!open)return;fileMenu.hidden=false;$('file-menu-toggle').setAttribute('aria-expanded','true');const r=$('file-menu-toggle').getBoundingClientRect();fileMenu.style.left=Math.max(8,Math.min(r.right-fileMenu.offsetWidth,innerWidth-fileMenu.offsetWidth-8))+'px';fileMenu.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-fileMenu.offsetHeight-8))+'px';fileMenu.firstElementChild.focus();};
  fileMenu.onkeydown=ev=>{if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();closeFiles();$('file-menu-toggle').focus();return;}if(!['ArrowUp','ArrowDown','Home','End'].includes(ev.key))return;ev.preventDefault();const items=[...fileMenu.children],i=items.indexOf(document.activeElement);items[ev.key==='Home'?0:ev.key==='End'?items.length-1:(i+(ev.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();};
  document.addEventListener('pointerdown',ev=>{if(!ev.target.closest('#canvas-file-menu,#file-menu-toggle'))closeFiles();});window.addEventListener('resize',closeFiles);
  $('import').onclick = () => $('file').click();
  $('file').onchange = act(async () => {
    const file = $('file').files[0]; if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw Error('Import is limited to 20 MB.');
      const next = M.validate(JSON.parse(await file.text())); next.id = M.board().id; next.title += ' (imported)';
      await saveInlineNotes(true);
      await closeNote();
      await flush(); await bridge.save(next); board = next; revision = 0; savedRevision = 0; selection = null; undo = []; redo = [];
      await refreshList(); render(); inspector(); status('Imported and saved locally'); await refreshNotes();
    } finally { $('file').value = ''; }
  });
  $('viewport').addEventListener('dragover', ev => {
    if (!ev.dataTransfer || !Array.from(ev.dataTransfer.types).some(type => ['zotero/item', 'zotero/annotation'].includes(type))) return;
    ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; $('viewport').classList.add('drop-ready');
  });
  $('viewport').addEventListener('dragleave', ev => { if (!$('viewport').contains(ev.relatedTarget)) $('viewport').classList.remove('drop-ready'); });
  $('viewport').addEventListener('drop', ev => {
    ev.preventDefault(); $('viewport').classList.remove('drop-ready');
    const annotations = ev.dataTransfer?.getData('zotero/annotation');
    const raw = annotations || ev.dataTransfer?.getData('zotero/item'), position = point(ev), activeBoard = board;
    act(async () => {
      if (!bridge.fromDrop) throw Error('Drag Zotero items into the installed Zotero plugin.');
      if (!annotations) M.droppedIDs(raw);
      if (annotations && !bridge.fromAnnotations) throw Error('Annotation drops require the installed Zotero plugin.');
      const items = await (annotations ? bridge.fromAnnotations(raw) : bridge.fromDrop(raw));
      if (board !== activeBoard) throw Error('The board changed while the drop was loading. Drop the items again.');
      addItems(items, position.x, position.y);
      if (board.mode !== 'canvas') fit();
    })();
  });
  $('viewport').addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    select(null, null); gesture = {type: 'pan', sx: ev.clientX, sy: ev.clientY, x: board.view.x, y: board.view.y, pointer: ev.pointerId};
    $('viewport').setPointerCapture(ev.pointerId);
  });
  $('viewport').addEventListener('pointermove', ev => {
    if(!gesture||['connect','reconnect'].includes(gesture.type))showAttachment(ev);
    if (!gesture) return; const g = gesture, p = point(ev), n = board.nodes.find(n => n.id === g.id);
    if(g.type==='elbow-corner'&&(g.moved||Math.hypot(p.x-g.start.x,p.y-g.start.y)*board.view.zoom>3)){const edge=board.edges.find(e=>e.id===g.id),first=g.points[0],last=g.points.at(-1),x=Math.round((g.points[1].x+p.x-g.start.x)/10)*10,y=Math.round((g.points[1].y+p.y-g.start.y)/10)*10;edge.routePoints=M.simplifyPoints([first,{x,y:first.y},{x,y},{x:last.x,y},last]).slice(1,-1);g.moved=true;render();}
    if(g.type==='elbow-route'&&(g.moved||Math.hypot(p.x-g.start.x,p.y-g.start.y)*board.view.zoom>3)){const edge=board.edges.find(e=>e.id===g.id),axis=g.horizontal?'y':'x',delta=p[axis]-g.start[axis],points=M.clone(g.points);let value=g.points[g.index][axis]+delta;const snap=points.map(point=>point[axis]).find(v=>Math.abs(v-value)<12/board.view.zoom);value=snap??Math.round(value/10)*10;points[g.index][axis]=points[g.index+1][axis]=value;edge.routePoints=M.simplifyPoints(points).slice(1,-1);g.moved=true;render();}
    if(g.type==='route'&&(g.moved||Math.hypot(p.x-g.start.x,p.y-g.start.y)*board.view.zoom>3)){const edge=board.edges.find(e=>e.id===g.id);if(!g.moved){if(!edge.routePoints?.length)edge.routePoints=M.clone(g.route);if(g.insert)edge.routePoints.splice(g.index,0,g.point);g.moved=true;}edge.routePoints[g.index]={x:p.x,y:p.y};render();}
    if (g.type === 'pan') { board.view.x = g.x + ev.clientX - g.sx; board.view.y = g.y + ev.clientY - g.sy; renderView(); }
    if (g.type === 'move') {if(objectTap&&Math.hypot(ev.clientX-objectTap.x,ev.clientY-objectTap.y)>7)objectTap=null;const x=g.x+p.x-g.start.x,y=g.y+p.y-g.start.y;if(board.mode==='canvas'){n.x=x;n.y=y;}else (n.layoutOverrides||={})[M.layoutKey(board)]={x,y};render(); }
    if (g.type === 'resize') { const next = M.resize(g, g.direction, p.x - g.start.x, p.y - g.start.y); n.width = next.width; n.height = next.height; if (board.mode === 'canvas') { n.x = next.x; n.y = next.y; } render(); }
    if(g.type==='reconnect'&&(g.moved||Math.hypot(p.x-g.start.x,p.y-g.start.y)*board.view.zoom>3)){const edge=board.edges.find(e=>e.id===g.id);if(edge){g.moved=true;edge[g.end]=null;delete edge[g.end+'Offset'];edge[g.end+'Point']=hoverAttachment?{...hoverAttachment.anchor}:{x:p.x,y:p.y};render();}}
    if(g.type==='connect'){const source=board.nodes.find(n=>n.id===g.id),position=M.positions(board).get(g.id),from={...source,...position},to={...(hoverAttachment?.anchor||p),width:0,height:0};$('edges').querySelector('.preview')?.remove();$('edges').append(svg('path',{class:'preview',d:M.path(from,to,'elbow',g.side,hoverAttachment?.side||(g.side==='left'?'right':g.side==='top'?'bottom':g.side==='bottom'?'top':'left'),[],g.offset)}));}
  });
  function endGesture(ev) {
    if (!gesture) return;
    const g = gesture; gesture = null;if(attachmentHint)attachmentHint.hidden=true; let connected;
    if(ev.type==='pointercancel'){if(g.type!=='pan'){const previous=undo.pop();if(previous)board=M.clone(previous);}if($('viewport').hasPointerCapture(g.pointer))$('viewport').releasePointerCapture(g.pointer);render();return;}
    if(g.type==='move'&&Math.hypot(point(ev).x-g.start.x,point(ev).y-g.start.y)<2){undo.pop();if($('viewport').hasPointerCapture(g.pointer))$('viewport').releasePointerCapture(g.pointer);return;}
    if(['route','elbow-route','elbow-corner'].includes(g.type)&&!g.moved){undo.pop();if($('viewport').hasPointerCapture(g.pointer))$('viewport').releasePointerCapture(g.pointer);return;}
    if(g.type==='reconnect'&&!g.moved&&Math.hypot(point(ev).x-g.start.x,point(ev).y-g.start.y)*board.view.zoom<3){undo.pop();if($('viewport').hasPointerCapture(g.pointer))$('viewport').releasePointerCapture(g.pointer);return;}
    if (g.type === 'connect' || g.type === 'reconnect') {
      // Handles sit above ports; ignore them while finding the drop destination.
      $('handles').style.display = 'none';
      const element = document.elementFromPoint(ev.clientX, ev.clientY);let target = element?.closest('.card')?.dataset.id;
      const targetEdge=!target&&document.elementsFromPoint(ev.clientX,ev.clientY).find(el=>el.matches('.edge-hit'))?.dataset.edge;
      $('handles').style.display = '';
      let node = board.nodes.find(n => n.id === target), p = point(ev), ps = M.positions(board);
      const precise=node?M.attachment({...node,...ps.get(node.id)},p):nearestAttachment(p,g.type==='connect'?g.id:null,18/board.view.zoom);
      const destination=node||board.nodes.find(n=>n.id===precise?.id),side=precise?.side,offset=precise?.offset;
      if(!node&&destination){node=destination;target=destination.id;}
      const edge = g.type === 'reconnect' && board.edges.find(e => e.id === g.id);
      const other = edge ? edge[g.end === 'source' ? 'target' : 'source'] : g.id;
      if(!node&&targetEdge&&targetEdge!==g.id&&(!edge||targetEdge!==edge.id)){
        const junctionID=addJunction(targetEdge,p,false);
        if(edge){const current=board.edges.find(e=>e.id===edge.id);current[g.end]=junctionID;delete current[g.end+'Point'];delete current[g.end+'Offset'];current[g.end+'Side']='left';current.hierarchy=false;connected=current;}
        else{const created=M.edge(g.id,junctionID);created.sourceSide=g.side;if(g.offset!==undefined)created.sourceOffset=g.offset;created.targetSide='left';created.hierarchy=false;board.edges.push(created);connected=created;}
      } else if (node && target !== other && ev.type !== 'pointercancel') {
        if (edge) { edge[g.end] = target; delete edge[g.end+'Point']; edge[g.end + 'Side'] = side;edge[g.end+'Offset']=offset;edge.hierarchy=g.originalHierarchy; connected = edge; }
        else { const created = M.edge(g.id, target); created.sourceSide = g.side;if(g.offset!==undefined)created.sourceOffset=g.offset;created.targetSide = side;created.targetOffset=offset; board.edges.push(created); connected = created; }
      } else if(ev.type!=='pointercancel'&&!node){
        if(g.type==='connect'&&Math.hypot(p.x-g.start.x,p.y-g.start.y)*board.view.zoom<6){if(board.nodes.find(n=>n.id===g.id)?.junction)undo.pop();else createChild(board.nodes.find(n=>n.id===g.id),g.side);}
        else if(edge){edge[g.end]=null;delete edge[g.end+'Offset'];edge[g.end+'Point']={x:p.x,y:p.y};edge.hierarchy=false;}
        else{const created=M.edge(g.id,null);created.sourceSide=g.side;if(g.offset!==undefined)created.sourceOffset=g.offset;created.targetPoint={x:p.x,y:p.y};created.hierarchy=false;created.style='elbow';board.edges.push(created);selection={kind:'edge',id:created.id};}
      } else if(ev.type!=='pointercancel'&&g.type==='connect'&&target===g.id&&Math.hypot(p.x-g.start.x,p.y-g.start.y)*board.view.zoom<6&&!board.nodes.find(n=>n.id===g.id)?.junction){createChild(board.nodes.find(n=>n.id===g.id),g.side);}else undo.pop();
    }
    if ($('viewport').hasPointerCapture(g.pointer)) $('viewport').releasePointerCapture(g.pointer);
    changed(); render(); inspector();
    if (connected) syncRelation(connected);
  }
  $('viewport').addEventListener('pointerup', endGesture); $('viewport').addEventListener('pointercancel', endGesture);
  $('viewport').addEventListener('dblclick', ev => {
    if (ev.target.closest('.card,.endpoint')) return;
    const nearby=[...$('handles').querySelectorAll('.route-handle')].find(h=>{const r=h.getBoundingClientRect();return ev.clientX>=r.left-3&&ev.clientX<=r.right+3&&ev.clientY>=r.top-3&&ev.clientY<=r.bottom+3;});if(nearby){ev.preventDefault();openLabel(nearby.dataset.edge);return;}
    const edge = ev.target.closest('[data-edge]') || document.elementsFromPoint(ev.clientX, ev.clientY).find(el => el.matches('.edge-hit,.edge-label'));
    if (edge) { ev.preventDefault(); ev.stopPropagation(); openLabel(edge.dataset.edge); }
    else { const p = point(ev); addNode(p.x, p.y); }
  });
  $('viewport').addEventListener('wheel', ev => {
    const body = ev.target.closest('.body,.file-preview');
    if (body && body.scrollHeight > body.clientHeight && !ev.ctrlKey && !ev.metaKey) return;
    hideStyles();if(attachmentHint)attachmentHint.hidden=true;
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) {
      const p = point(ev), r = $('viewport').getBoundingClientRect();
      board.view.zoom = Math.max(.2, Math.min(3, board.view.zoom * Math.exp(-ev.deltaY * .004)));
      board.view.x = ev.clientX - r.left - p.x * board.view.zoom; board.view.y = ev.clientY - r.top - p.y * board.view.zoom;
    } else { board.view.x -= ev.deltaX; board.view.y -= ev.deltaY; }
    changed(); renderView();
  }, {passive: false});
  window.addEventListener('keydown', ev => {
    if(ev.key==='Escape'&&aiMenuID){const id=aiMenuID;aiMenuID=null;render();[...$('cards').children].find(c=>c.dataset.id===id)?.querySelector('.card-ai-toggle')?.focus({preventScroll:true});ev.preventDefault();return;}
    if (ev.key === 'Escape' && noteMenuID) { const id = noteMenuID; noteMenuID = null; render(); [...$('cards').children].find(card => card.dataset.id === id)?.querySelector('.note-actions-toggle')?.focus({preventScroll: true}); ev.preventDefault(); return; }
    if (!$('note-panel').hidden) return;
    if (ev.key === 'Escape' && styleTarget) { hideStyles(); ev.preventDefault(); return; }
    if (ev.target.closest('input,textarea,select')) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); act(deleteSelection)(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); act(() => history(ev.shiftKey ? 'redo' : 'undo'))(); }
    if (ev.key === 'Escape') select(null, null);
  });
  window.addEventListener('beforeunload', ev => {
    finishLabel();
    if ($('cards').querySelector('.note-preview[data-editing=true]')) { saveInlineNotes(true).catch(report); ev.preventDefault(); ev.returnValue = ''; return; }
    if (noteFrame) { closeNote().catch(report); ev.preventDefault(); ev.returnValue = ''; return; }
    if (ready && revision !== savedRevision) { flush().catch(report); ev.preventDefault(); ev.returnValue = ''; }
  });
  window.addEventListener('unload', () => { ready = false; stopWatching?.(); window.removeEventListener('focus', scheduleSourceRefresh); clearTimeout(refreshTimer); }, {once: true});
}
async function acceptConnection(row,meta){
  if(meta.boardID!==board.id)throw Error('The canvas changed. Generate suggestions again.');
  if(!board.nodes.some(n=>n.id===row.source)||!board.nodes.some(n=>n.id===row.target))throw Error('A source card was removed.');
  if(board.edges.some(e=>CanvasConnections.pair(e.source,e.target)===CanvasConnections.pair(row.source,row.target)))throw Error('These cards are already connected.');
  checkpoint();const edge=M.edge(row.source,row.target);edge.hierarchy=false;edge.label=row.label;edge.arrow=row.label==='Related theme'?'none':'end';edge.colour=row.label==='Contradicts'?'#ad4b4b':row.label==='Supports'?'#277c6b':'#697b7a';edge.aiEvidence={reason:row.reason,sourceExcerpt:row.sourceExcerpt,targetExcerpt:row.targetExcerpt,sourceTitle:row.sourceTitle,targetTitle:row.targetTitle,sourceSignature:row.sourceSignature,targetSignature:row.targetSignature,model:meta.model,generatedAt:meta.generatedAt};board.edges.push(edge);changed();render();
  try{await flush();}catch(error){board.edges=board.edges.filter(e=>e.id!==edge.id);changed();render();throw error;}syncRelation(edge);return edge.id;
}
async function rejectConnection(row){checkpoint();const rejection={source:row.source,target:row.target,sourceSignature:row.sourceSignature,targetSignature:row.targetSignature};board.connectionRejections=[...(board.connectionRejections||[]).filter(r=>CanvasConnections.pair(r.source,r.target)!==CanvasConnections.pair(row.source,row.target)),rejection].slice(-500);changed();await flush();}
async function createBoard(title='Untitled board'){
  await saveInlineNotes(true);await closeNote();await flush();const next=M.board(title);await bridge.save(next);board=next;revision=savedRevision=0;selection=null;undo=[];redo=[];await refreshList();render();inspector();status('Saved locally');return next.id;
}
async function renameBoard(id,title){
  if(id===board.id){checkpoint();board.title=title;changed();render();await flush();}else{const data=await bridge.load(id);data.title=title;await bridge.save(data);}await refreshList();
}
async function trashBoard(id){
  await saveInlineNotes(true);await closeNote();await flush();await bridge.organise({op:'trashBoard',id});
  if(board.id===id){const rows=await bridge.list();if(rows.length)await switchBoard(rows[0].id);else await createBoard();}await refreshList();
}
async function insertCanvas(id,embedded=true){
  if(id===board.id)throw Error('Choose another canvas to link or embed.');
  const target=await bridge.load(id);checkpoint();const n=M.node((100-board.view.x)/board.view.zoom,(100-board.view.y)/board.view.zoom,target.title,'');Object.assign(n,{kind:'canvas',canvasID:id,embedded,width:420,height:300});board.nodes.push(n);changed();render();select('node',n.id);await flush();
}
async function drawCanvasPreview(n,body){
  const available=(await bridge.list()).some(b=>b.id===n.canvasID);if(!available){delete body.dataset.canvasSignature;body.textContent='Canvas unavailable or in Trash. Restore it in the Explorer.';return;}
  const data=await bridge.load(n.canvasID);if(!body.isConnected)return;const current=board.nodes.find(x=>x.id===n.id&&x.canvasID===n.canvasID);if(current&&current.title!==data.title){current.title=data.title;const heading=body.closest('.card').querySelector('.heading');heading.textContent=data.title;heading.title=data.title;changed();}const signature=JSON.stringify(data);if(body.dataset.canvasSignature===signature)return;body.dataset.canvasSignature=signature;body.replaceChildren();
  const name=html('strong');name.textContent=data.title;body.append(name);if(!n.embedded)return;
  const positions=M.positions(data),bounds=data.nodes.length||data.edges.length?M.bounds([...data.nodes.map(n=>({...n,...positions.get(n.id)})),...M.extraRects(data)]):{x:0,y:0,width:200,height:150},image=svg('svg',{viewBox:`${bounds.x-30} ${bounds.y-40} ${Math.max(200,bounds.width+60)} ${Math.max(150,bounds.height+80)}`,class:'canvas-thumbnail','aria-label':'Preview of '+data.title});
  for(const edge of data.edges){const map=new Map(data.nodes.map(n=>[n.id,{...n,...positions.get(n.id)}]));const a=M.endpoint(edge,'source',map),b=M.endpoint(edge,'target',map);image.append(svg('path',{d:M.edgePath(data,edge,a,b),fill:'none',stroke:edge.colour,'stroke-width':edge.thickness}));}
  for(const node of data.nodes){const pos=positions.get(node.id);if(node.junction){image.append(svg('circle',{cx:pos.x+node.width/2,cy:pos.y+node.height/2,r:node.width/2,fill:node.colour,stroke:'#ffffff','stroke-width':2}));continue;}if(node.objectType){image.append(svg('image',{x:pos.x,y:pos.y,width:node.width,height:node.height,href:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(CanvasObjects.svg(node))}));continue;}image.append(svg('rect',{x:pos.x,y:pos.y,width:node.width,height:node.height,rx:8,fill:node.colour,stroke:node.border,'stroke-width':2}));const text=svg('text',{x:pos.x+10,y:pos.y+25,fill:'#253d3b','font-size':16});text.textContent=node.title.slice(0,60);image.append(text);}
  body.append(image);if(!data.nodes.length){const p=html('p');p.textContent='Empty canvas';body.append(p);}
}
const embedRefresh=setInterval(()=>{if(!ready||document.hidden)return;for(const n of board.nodes.filter(n=>n.kind==='canvas')){const body=[...$('cards').children].find(c=>c.dataset.id===n.id)?.querySelector('.body');if(body)drawCanvasPreview(n,body).catch(report);}},2500);
window.addEventListener('unload',()=>clearInterval(embedRefresh),{once:true});
window.CanvasApp = {defaultTemplatesReset,placeObject:(spec,at)=>objectTools.place(spec,at),updateDefaults:value=>M.setDefaults(value),refreshMeanings:values=>{customMeanings=values.map(p=>M.meaning(p.id,p.title,p));renderMeanings();}, obsidianBundle:()=>workspace.obsidianBundle(), createBoard, openBoard:switchBoard, renameBoard, trashBoard, insertCanvas, refreshExplorer:()=>explorer.refresh(), jumpTo, restoreBoard, exportData: options => workspace.exportData(options), async receiveItems(id, items) { await refreshList(); if (board.id !== id) await switchBoard(id); addItems(items, (80 - board.view.x) / board.view.zoom, (100 - board.view.y) / board.view.zoom); fit(); await flush(); },async flush() { finishLabel(); await saveInlineNotes(); await refreshNotes(); await Promise.allSettled([...relationTasks]); await flush(); }, closeNote, closeInlineNotes: () => saveInlineNotes(true), closeNoteMenu() { if (noteMenuID) { noteMenuID = null; render(); } }, noteStatus, previewWarning, previewRevoked(id) { const slot = [...$('cards').querySelectorAll('.note-preview')].find(el => el.closest('.card').dataset.id === id); if (slot && slot.dataset.editable !== 'false') { slot.dataset.editing = 'false'; slot.dataset.editable = 'false'; render(); } }, styleNote(id) { if (board.nodes.some(n => n.id === id && n.kind === 'note')) openStyles('node', id); }, getBoard: () => board ? M.clone(board) : null};
(async () => {
  try {
    if(bridge.getSettings)M.setDefaults(await bridge.getSettings());
    const list = await bridge.list();
    board = list.length ? await checkTemplateEditor(await bridge.load(list[0].id)) : M.board();
    if (!list.length) await bridge.save(board);
    for (const button of $('search-methods').children) button.onclick = () => { $('search-mode').value = button.dataset.method; for (const other of $('search-methods').children) other.setAttribute('aria-pressed', String(other === button)); };
    for (const button of $('search-types').children) button.onclick = () => { for (const other of $('search-types').children) other.setAttribute('aria-pressed', String(other === button)); if ($('search-query').value.trim().length >= 2) $('search-form').dispatchEvent(new Event('submit', {cancelable:true})); };
    $('search-form').addEventListener('submit', searchLibrary);
    $('search-close').onclick = () => { searchRequest++; $('search-results').hidden = true; $('search-status').textContent = ''; $('search-close').hidden = true; };
    if(bridge.annotationAppearance)annotationAppearance=await bridge.annotationAppearance();
    if(bridge.listMeanings)customMeanings=(await bridge.listMeanings()).map(p=>M.meaning(p.id,p.title,p));
    workspace = window.CanvasWorkspace({getBoard: () => board, addCounterexample, addCard:addNode, hideStyles, acceptConnection, rejectConnection, checkpoint, changed, redraw: render, point, element: html, model: M, viewport: $('viewport'), select, report, fit, saveInlineNotes, selected, bridge, jumpTo, flush, restoreBoard, status, canvasMarkup: async n=>{const body=[...$('cards').children].find(c=>c.dataset.id===n.id)?.querySelector('.body');if(!body)return '';await drawCanvasPreview(n,body);const image=body.querySelector('svg');if(!image){const text=html('p');text.textContent=body.textContent;return text.outerHTML;}const data=await CanvasExport.png({svg:new XMLSerializer().serializeToString(image),width:n.width-30,height:n.height-70});const picture=html('img');picture.src=data;return picture.outerHTML;}, annotationMarkup: n => new DOMParser().parseFromString(annotationDocument(n),'text/html').querySelector('.ProseMirror').innerHTML});
    window.CanvasTemplateAuthorUI({element:html,getBoard:()=>M.clone(board),bridge,report,model:M,status,prepare:async()=>{finishLabel();await saveInlineNotes();await flush();},apply:async next=>{checkpoint();board=next;selection=null;changed();render();inspector();fit();await flush();}});
    explorer=window.CanvasExplorer({bridge,element:html,report,getBoard:()=>board,create:createBoard,open:switchBoard,rename:renameBoard,trash:trashBoard,insert:insertCanvas,refreshList,layout:()=>{positionStyles();}});
    objectTools=window.CanvasObjectTools({model:M,element:html,viewport:$('viewport'),getBoard:()=>board,point,addObjects,checkpoint,changed,redraw:render,report,bridge,endSelection:()=>workspace.endSelection()});await objectTools.load();
    ready = true; savedRevision = revision; await refreshList(); bind(); render(); inspector();
    $('undo').disabled = true; $('redo').disabled = true; status('Saved locally');
    await refreshNotes();
    if (bridge.subscribe) stopWatching = bridge.subscribe(scheduleSourceRefresh);
  } catch (error) { report(error); for (const el of document.querySelectorAll('button,input,select')) el.disabled = true; }
})();
}, {once: true});

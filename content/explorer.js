(function(root){
  'use strict';
  root.CanvasExplorer=function(ctx){
    const {bridge,element:el,report}=ctx,L=root.CanvasLibrary;
    let state=L.empty(),rows=[],selectedFolder=null,dragID=null,refreshID=0;
    const panel=el('aside');panel.id='canvas-explorer';panel.hidden=true;panel.setAttribute('aria-label','Canvas Explorer');
    document.querySelector('main').prepend(panel);
    const panelHeading=el('div');panelHeading.className='explorer-heading';const title=el('h2');title.textContent='Canvases';panelHeading.append(title);panel.append(panelHeading);
    const actions=el('div');actions.className='explorer-actions';panel.append(actions);
    function button(text,fn,parent=actions){const b=el('button');b.type='button';b.textContent=text;b.onclick=()=>Promise.resolve().then(fn).catch(report);parent.append(b);return b;}
    const tree=el('div');tree.id='canvas-tree';panel.append(tree);
    const trash=el('details');trash.id='canvas-trash';panel.append(trash);
    const menu=el('div');menu.id='canvas-context';menu.setAttribute('role','menu');menu.hidden=true;document.body.append(menu);
    const toggle=document.getElementById('toggle-explorer');
    const fold=button('',()=>setOpen(false),panelHeading);fold.id='fold-explorer';fold.title='Fold Canvas Explorer';fold.setAttribute('aria-label',fold.title);
    const reopen=button('',()=>setOpen(true),document.getElementById('viewport'));reopen.id='unfold-explorer';reopen.title='Unfold Canvas Explorer';reopen.setAttribute('aria-label',reopen.title);
    for(const [b,right] of [[fold,false],[reopen,true]]){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',right?'M9 5l7 7-7 7':'M15 5l-7 7 7 7');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');icon.append(path);b.append(icon);}
    function setOpen(open){panel.hidden=!open;reopen.hidden=open;toggle.setAttribute('aria-expanded',String(open));ctx.layout();if(open)fold.focus();else reopen.focus();}
    toggle.onclick=()=>setOpen(panel.hidden);
    for(const type of ['pointerdown','dblclick','wheel'])reopen.addEventListener(type,e=>e.stopPropagation());
    function prompt(title,value='',choices=null,inputType='text'){
      return new Promise(resolve=>{
        const shade=el('div');shade.className='canvas-dialog-shade';const dialog=el('form');dialog.className='canvas-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',title);
        const heading=el('h2');heading.textContent=title;dialog.append(heading);
        const input=el(choices?'select':'input');input.id='canvas-name';input.setAttribute('aria-label',choices?'Destination folder':'Name');
        if(choices)for(const c of choices){const o=el('option');o.value=c.id||'';o.textContent=c.name;input.append(o);}else{input.maxLength=200;input.required=true;}
        if(!choices)input.type=inputType;
        input.value=value;dialog.append(input);
        const controls=el('div');controls.className='explorer-actions';dialog.append(controls);
        const done=v=>{shade.remove();resolve(v);};button('Cancel',()=>done(null),controls);
        const save=el('button');save.type='submit';save.textContent=choices?'Move':'Save';controls.append(save);
        dialog.onsubmit=e=>{e.preventDefault();if(!choices&&!input.value.trim())return;done(choices?input.value:input.value.trim());};
        shade.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();done(null);}};shade.append(dialog);document.body.append(shade);if(choices)CanvasChoices.attach(input,{label:'Destination folder',layout:'list'}).focus();else{input.focus();input.select();}
      });
    }
    function folderPath(f){const names=[f.name];let p=f.parentID;while(p){const parent=state.folders.find(f=>f.id===p);names.unshift(parent.name);p=parent.parentID;}return names.join(' / ');}
    const choices=()=>[{id:'',name:'Canvases (no folder)'},...state.folders.map(f=>({id:f.id,name:folderPath(f)})).sort((a,b)=>a.name.localeCompare(b.name))];
    async function command(c){if(!bridge.organise)throw Error('Canvas organisation is unavailable in this preview.');await bridge.organise(c);await ctx.refreshList();}
    async function create(){const name=await prompt('New canvas');if(name===null)return;const id=await ctx.create(name);if(selectedFolder)await command({op:'moveBoard',id,folderID:selectedFolder});await refresh();}
    async function newFolder(){const name=await prompt('New folder');if(name!==null)await command({op:'createFolder',id:crypto.randomUUID(),name,folderID:selectedFolder});}
    button('+ Canvas',create).id='new-canvas';button('+ Folder',newFolder).id='new-folder';
    async function move(id,isFolder=false){const current=isFolder?state.folders.find(f=>f.id===id).parentID:state.boards[id]?.folderID;const destination=await prompt('Move '+(isFolder?'folder':'canvas'),current||'',choices().filter(c=>c.id!==id));if(destination!==null)await command({op:isFolder?'moveFolder':'moveBoard',id,folderID:destination||null});}
    function context(event,row,isFolder=false){
      event.preventDefault();event.stopPropagation();menu.replaceChildren();menu.hidden=false;
      const add=(name,fn)=>{const b=button(name,async()=>{menu.hidden=true;await fn();},menu);b.setAttribute('role','menuitem');};
      if(!row){add('New canvas',create);add('New folder',newFolder);}
      else if(isFolder){add('Rename',async()=>{const name=await prompt('Rename folder',row.name);if(name!==null)await command({op:'renameFolder',id:row.id,name});});add('Folder colour',async()=>{const colour=await prompt('Folder colour',row.colour||'#a68b54',null,'color');if(colour!==null)await command({op:'colourFolder',id:row.id,colour});});if(row.colour)add('Reset folder colour',()=>command({op:'colourFolder',id:row.id,colour:null}));add('Move',()=>move(row.id,true));add('Delete empty folder',()=>command({op:'deleteFolder',id:row.id}));}
      else if(state.boards[row.id]?.trashedAt){add('Restore canvas',()=>command({op:'restoreBoard',id:row.id}));}
      else{
        add('Open canvas',()=>ctx.open(row.id));
        add('Rename',async()=>{const name=await prompt('Rename canvas',row.title);if(name!==null)await ctx.rename(row.id,name);});
        add('Move',()=>move(row.id));add('Move to Trash',()=>ctx.trash(row.id));
        if(row.id!==ctx.getBoard().id){add('Embed in current canvas',()=>ctx.insert(row.id,true));add('Link from current canvas',()=>ctx.insert(row.id,false));}
        add('Find incoming canvas links',async()=>{
          const found=[];for(const b of rows.filter(b=>!state.boards[b.id]?.trashedAt)){const data=await bridge.load(b.id);if(data.nodes.some(n=>n.kind==='canvas'&&n.canvasID===row.id))found.push(b);}
          menu.replaceChildren();menu.hidden=false;if(!found.length){const p=el('p');p.textContent='No incoming canvas links.';menu.append(p);}for(const b of found)add(b.title,()=>ctx.open(b.id));
        });
      }
      menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-menu.offsetHeight-8))+'px';
    }
    panel.oncontextmenu=e=>context(e,null);
    document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))menu.hidden=true;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')menu.hidden=true;});
    function dropzone(target,folderID){
      target.ondragover=e=>{if(dragID||e.dataTransfer.types.includes('application/x-research-canvas')){e.preventDefault();e.stopPropagation();target.classList.add('drop-target');}};
      target.ondragleave=()=>target.classList.remove('drop-target');
      target.ondrop=e=>{e.preventDefault();e.stopPropagation();target.classList.remove('drop-target');const id=dragID||e.dataTransfer.getData('application/x-research-canvas');if(id)command({op:'moveBoard',id,folderID}).catch(report);dragID=null;};
    }
    function boardRow(b,parent,deleted=false){
      const line=el('div');line.className='canvas-row';line.dataset.board=b.id;parent.append(line);
      const open=button(b.title,()=>deleted?command({op:'restoreBoard',id:b.id}):ctx.open(b.id),line);open.className='canvas-open';open.title=deleted?'Restore '+b.title:b.title;
      const icon=el('img');icon.className='explorer-canvas-icon';icon.src='canvas-entry.png';icon.alt='';icon.width=18;icon.height=18;open.prepend(icon);
      if(!deleted){line.draggable=true;line.ondragstart=e=>{dragID=b.id;e.dataTransfer.setData('application/x-research-canvas',b.id);e.dataTransfer.effectAllowed='move';};line.ondragend=()=>{dragID=null;};}
      line.oncontextmenu=e=>context(e,b);return line;
    }
    function render(){
      tree.replaceChildren();trash.replaceChildren();const summary=el('summary');summary.textContent='Trash · '+rows.filter(b=>state.boards[b.id]?.trashedAt).length;trash.append(summary);
      const root=button('All canvases',()=>{selectedFolder=null;render();},tree);root.className='folder-root';root.setAttribute('aria-pressed',String(!selectedFolder));dropzone(root,null);
      function contents(parentID,host){
        for(const f of state.folders.filter(f=>(f.parentID||null)===parentID).sort((a,b)=>a.name.localeCompare(b.name))){
          const folder=el('details');folder.className='canvas-folder';folder.open=true;const s=el('summary');s.dataset.folder=f.id;s.onclick=()=>{selectedFolder=f.id;};s.oncontextmenu=e=>context(e,f,true);
          const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.classList.add('explorer-folder-icon');icon.style.color=f.colour||'#a68b54';
          const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3z');path.setAttribute('fill','currentColor');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.5');path.setAttribute('stroke-linejoin','round');icon.append(path);
          s.append(icon,document.createTextNode(f.name));folder.append(s);dropzone(s,f.id);host.append(folder);contents(f.id,folder);
        }
        for(const b of rows.filter(b=>!state.boards[b.id]?.trashedAt&&(state.boards[b.id]?.folderID||null)===parentID))boardRow(b,host);
      }
      contents(null,tree);for(const b of rows.filter(b=>state.boards[b.id]?.trashedAt))boardRow(b,trash,true);accent();
    }
    function accent(){const active=ctx.getBoard();document.getElementById('current-board-title').textContent=active?.title||'';for(const row of tree.querySelectorAll('.canvas-row')){const on=row.dataset.board===active?.id;row.classList.toggle('active',on);row.querySelector('button').setAttribute('aria-current',on?'page':'false');}}
    async function refresh(){const request=++refreshID;const [next,index]=await Promise.all([bridge.list(true),bridge.libraryState?bridge.libraryState():L.empty()]);if(request!==refreshID)return;rows=next;state=L.validate(index);if(selectedFolder&&!state.folders.some(f=>f.id===selectedFolder))selectedFolder=null;render();}
    return {refresh,accent,create};
  };
})(window);

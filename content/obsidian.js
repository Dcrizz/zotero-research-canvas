(function(root){
  'use strict';
  const safeName=value=>String(value).normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f\[\]#^]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,90)||'Untitled';
  const md=value=>String(value).replace(/[\\`*_\[\]<>]/g,'\\$&');
  function markdown(markup,{asset,link=href=>href}={}){
    const doc=new DOMParser().parseFromString(markup,'text/html');
    for(const item of doc.querySelectorAll('script,style,iframe,object,embed,link,meta'))item.remove();
    for(const n of doc.querySelectorAll('*'))for(const a of [...n.attributes])if(/^on/i.test(a.name)||['srcdoc','srcset'].includes(a.name))n.removeAttribute(a.name);
    function children(n){return [...n.childNodes].map(walk).join('');}
    function list(n,depth=0){return [...n.children].filter(x=>x.tagName==='LI').map((li,i)=>{const nested=[...li.children].filter(x=>['UL','OL'].includes(x.tagName));const copy=li.cloneNode(true);for(const x of copy.querySelectorAll('ul,ol'))x.remove();return '  '.repeat(depth)+(n.tagName==='OL'?(i+1)+'. ':'- ')+children(copy).trim().replace(/\n/g,'\n'+'  '.repeat(depth+1))+'\n'+nested.map(x=>list(x,depth+1)).join('');}).join('');}
    function walk(n){
      if(n.nodeType===3)return md(n.nodeValue.replace(/\s+/g,' '));if(n.nodeType!==1)return '';
      const tag=n.tagName,c=()=>children(n);
      if(tag==='BR')return '\n';if(/^H[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+c().trim()+'\n\n';
      if(['UL','OL'].includes(tag))return '\n\n'+list(n)+'\n';
      if(tag==='BLOCKQUOTE')return '\n\n'+c().trim().split('\n').map(l=>'> '+l).join('\n')+'\n\n';
      if(tag==='A'){const href=n.getAttribute('href')||'',target=link(href);return /^(https?:|zotero:|obsidian:|#)/i.test(target)?'['+c()+'](<'+target.replace(/>/g,'%3E')+'>)':c();}
      if(tag==='IMG'){const src=n.getAttribute('src')||'',file=asset?.(src);if(file)return '!['+md(n.getAttribute('alt')||'Image')+'](<'+encodeURI(file)+'>)';if(/^https?:/i.test(src))return '!['+md(n.getAttribute('alt')||'Image')+'](<'+src.replace(/>/g,'%3E')+'>)';throw Error('An embedded image could not be exported. Its source was preserved in Zotero.');}
      if(['STRONG','B'].includes(tag))return '**'+c()+'**';if(['EM','I'].includes(tag))return '*'+c()+'*';if(['S','DEL','STRIKE'].includes(tag))return '~~'+c()+'~~';if(tag==='U')return '<u>'+c()+'</u>';if(tag==='MARK')return '=='+c()+'==';
      if(tag==='CODE')return '`'+n.textContent.replace(/`/g,'\\`')+'`';if(tag==='PRE')return '\n\n````\n'+n.textContent+'\n````\n\n';
      if(tag==='HR')return '\n\n---\n\n';if(tag==='TABLE'){const rows=[...n.querySelectorAll('tr')].map(row=>[...row.children].filter(c=>['TD','TH'].includes(c.tagName)).map(cell=>children(cell).trim().replace(/\|/g,'\\|').replace(/\n/g,'<br>')));if(!rows.length)return '';const width=Math.max(...rows.map(r=>r.length)),line=r=>'| '+Array.from({length:width},(_,i)=>r[i]||'').join(' | ')+' |';return '\n\n'+line(rows[0])+'\n'+line(Array(width).fill('---'))+'\n'+rows.slice(1).map(line).join('\n')+'\n\n';}
      if(['P','DIV'].includes(tag))return '\n\n'+c()+'\n\n';return c();
    }
    return children(doc.body).replace(/\n[ \t]+\n/g,'\n\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function createBundle(boards,{prefix,noteHTML={},sourceLinks={}}){
    if(!Array.isArray(boards)||!boards.length||boards.length>200)throw Error('Export between 1 and 200 linked canvases.');
    if(!prefix||prefix.split('/').some(p=>!p||p==='.'||p==='..'||/[\\\x00]/.test(p)))throw Error('Invalid export folder.');
    const files=[],paths=new Map(),sourceFiles=new Map(),images=new Map(),warnings=new Set();let serial=0;
    for(const b of boards)paths.set(b.id,prefix+'/Boards/'+safeName(b.title)+'-'+safeName(b.id).slice(0,12)+'.canvas');
    const asset=src=>{
      if(!/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(src))return null;
      if(images.has(src))return images.get(src);
      const ext=src.match(/^data:image\/(\w+);/i)[1].toLowerCase().replace('jpeg','jpg'),path=prefix+'/Assets/image-'+(++serial)+'.'+ext;files.push({path,base64:src.split(',')[1]});images.set(src,path);return path;
    };
    for(const board of boards){
      const M=root.CanvasModel,positions=M.positions(board),nodes=[],edges=[];
      for(const f of board.frames||[]){const members=board.nodes.filter(n=>f.members.includes(n.id)).map(n=>({...n,...positions.get(n.id)}));const r=board.mode==='mindmap'&&members.length?M.bounds(members,40):f;nodes.push({id:'frame-'+f.id,type:'group',label:f.title,color:f.colour,x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)});}
      for(const n of board.nodes){
        const p=positions.get(n.id),out={id:n.id,x:Math.round(p.x),y:Math.round(p.y),width:Math.round(n.width),height:Math.round(n.height),color:n.colour};
        if(n.objectType==='file'){const path=prefix+'/Assets/'+safeName(n.id)+'-'+safeName(n.objectData.name);files.push({path,base64:n.objectData.base64});Object.assign(out,{type:'file',file:path});}else if(n.objectType==='library'||n.objectType==='wireframe'){const path=prefix+'/Assets/'+safeName(n.title)+'-'+safeName(n.id)+'.svg';files.push({path,text:root.CanvasObjects.svg(n)});Object.assign(out,{type:'file',file:path});warnings.add('Wireframes and library objects export as SVG images; edit their components in Zotero Canvas.');}else if(n.objectType==='table'){Object.assign(out,{type:'text',text:'# '+md(n.title)+'\n\n'+root.CanvasObjects.markdown(n)});}else if(n.kind==='canvas'){
          const target=paths.get(n.canvasID);if(target){if(n.embedded)Object.assign(out,{type:'file',file:target});else Object.assign(out,{type:'text',text:'['+md(n.title)+'](<'+encodeURI(target)+'>)'});}else{Object.assign(out,{type:'text',text:'# '+md(n.title)+'\n\nLinked canvas is unavailable or in Trash.'});warnings.add('Some linked canvases were unavailable.');}
        }else if(n.link){
          const key=[n.kind,n.link.libraryID,n.link.key,n.annotationKey||''].join('-');let path=sourceFiles.get(key);
          if(!path){path=prefix+'/Notes/'+safeName(n.title)+'-'+safeName(key)+'.md';sourceFiles.set(key,path);const html=n.kind==='annotation'?n.annotationHTML:noteHTML[n.id];if(n.sourceUnavailable||n.kind==='note'&&!html)warnings.add('Some source items were unavailable; their last saved canvas previews were exported.');const body=html?markdown(html,{asset}):n.text||'';const source=sourceLinks[n.id]||'zotero://select/'+(n.link.libraryID===1?'library':'groups/'+n.link.libraryID)+'/items/'+n.link.key;files.push({path,text:'---\nzotero_source: '+JSON.stringify(source)+'\nresearch_canvas: '+JSON.stringify(board.title)+'\n---\n\n# '+md(n.title)+'\n\n'+body+'\n\n[Open original in Zotero](<'+source+'>)\n'});}
          Object.assign(out,{type:'file',file:path});
        }else Object.assign(out,{type:'text',text:'# '+md(n.title)+(n.text?'\n\n'+n.text:'')});
        nodes.push(out);
        if(n.fontSize!==15||n.shape&&n.shape!=='rounded'||n.borderWidth!==2||n.pattern&&n.pattern!=='solid')warnings.add('Custom shapes, borders and font sizes use Obsidian styling.');
      }
      for(const e of board.edges){const ends={};for(const end of ['source','target']){ends[end]=e[end];if(e[end]===null){const p=e[end+'Point'],id='loose-'+e.id+'-'+end;nodes.push({id,type:'text',text:'',x:Math.round(p.x),y:Math.round(p.y),width:1,height:1});ends[end]=id;warnings.add('Loose connector endpoints use tiny editable anchor cards in Obsidian.');}}edges.push({id:e.id,fromNode:ends.source,fromSide:e.sourceSide||'right',fromEnd:['start','both'].includes(e.arrow)?'arrow':'none',toNode:ends.target,toSide:e.targetSide||'left',toEnd:['end','both'].includes(e.arrow)?'arrow':'none',color:e.colour,label:e.label||''});if(e.routePoints?.length||e.pattern&&e.pattern!=='solid'||e.outlineWidth||e.thickness!==2||e.style!=='curved')warnings.add('Connector labels, colours and endpoints are retained; routing, thickness and dash styles use Obsidian defaults.');}
      files.push({path:paths.get(board.id),text:JSON.stringify({nodes,edges},null,2)});
    }
    files.push({path:prefix+'/Export details.md',text:'# Zotero Canvas export\n\nThis is an editable snapshot. Edits in Obsidian do not sync back to Zotero. Original notes and annotations are linked from each exported note.\n\n'+[...warnings].map(w=>'- '+w).join('\n')+'\n'});
    return {files,entry:paths.get(boards[0].id),warnings:[...warnings],canvases:boards.length};
  }
  root.CanvasObsidian={safeName,markdown,createBundle};
})(globalThis);

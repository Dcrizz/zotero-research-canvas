(function(root){
  'use strict';
  const empty=()=>({version:1,folders:[],boards:{}});
  const validID=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
  function validate(value){
    const s=JSON.parse(JSON.stringify(value));
    if(s?.version!==1||!Array.isArray(s.folders)||s.folders.length>1000||!s.boards||typeof s.boards!=='object'||Array.isArray(s.boards))throw Error('Invalid canvas library.');
    const ids=new Set();
    for(const f of s.folders){if(!validID(f.id)||ids.has(f.id)||typeof f.name!=='string'||!f.name.trim()||f.name.length>200||(f.colour!==undefined&&!/^#[0-9a-f]{6}$/i.test(f.colour)))throw Error('Invalid canvas folder.');ids.add(f.id);}
    for(const f of s.folders){const seen=new Set([f.id]);let parent=f.parentID;while(parent){if(!ids.has(parent)||seen.has(parent))throw Error('Invalid folder hierarchy.');seen.add(parent);parent=s.folders.find(x=>x.id===parent).parentID;}}
    for(const [id,b] of Object.entries(s.boards)){if(!validID(id)||!b||b.folderID!==null&&!ids.has(b.folderID)||b.trashedAt!==null&&!Number.isFinite(b.trashedAt))throw Error('Invalid canvas library entry.');}
    return s;
  }
  function apply(value,c){
    const s=validate(value),folder=id=>{const f=s.folders.find(f=>f.id===id);if(!f)throw Error('Folder unavailable.');return f;};
    if(c.folderID)folder(c.folderID);
    if(c.op==='createFolder')s.folders.push({id:c.id,name:c.name,parentID:c.folderID||null});
    else if(c.op==='renameFolder')folder(c.id).name=c.name;
    else if(c.op==='colourFolder'){if(c.colour===null)delete folder(c.id).colour;else folder(c.id).colour=c.colour;}
    else if(c.op==='moveFolder')folder(c.id).parentID=c.folderID||null;
    else if(c.op==='deleteFolder'){
      folder(c.id);if(s.folders.some(f=>f.parentID===c.id)||Object.values(s.boards).some(b=>b.folderID===c.id))throw Error('Move the folder contents before deleting it.');s.folders=s.folders.filter(f=>f.id!==c.id);
    }else if(['moveBoard','trashBoard','restoreBoard'].includes(c.op)){
      if(!validID(c.id))throw Error('Invalid canvas ID.');
      const b=s.boards[c.id]||(s.boards[c.id]={folderID:null,trashedAt:null});
      if(c.op==='moveBoard')b.folderID=c.folderID||null;
      else b.trashedAt=c.op==='trashBoard'?Date.now():null;
    }else throw Error('Unknown library action.');
    return validate(s);
  }
  root.CanvasLibrary={empty,validate,apply};
  if(typeof module!=='undefined')module.exports=root.CanvasLibrary;
})(globalThis);

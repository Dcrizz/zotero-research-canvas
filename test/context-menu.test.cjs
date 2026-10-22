const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
  const elements=new Map();
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.events={};this.attributes={};this.style={};}
    set id(value){this._id=value;elements.set(value,this);}get id(){return this._id;}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(name,callback){(this.events[name]||=[]).push(callback);}
    removeEventListener(name,callback){this.events[name]=(this.events[name]||[]).filter(fn=>fn!==callback);}
    append(...children){this.children.push(...children);for(const child of children)child.parent=this;}
    appendChild(child){this.append(child);}remove(){this.parent.children=this.parent.children.filter(child=>child!==this);elements.delete(this.id);}
    emit(name){for(const fn of this.events[name]||[])fn({target:this});}
  }
  const doc={getElementById:id=>elements.get(id),createXULElement:tag=>new Element(tag)};
  for(const id of ['menu_ToolsPopup','zotero-itemmenu','zotero-collectionmenu']){const item=new Element('menupopup');item.id=id;}
  let selected=[],collection=[];
  const window={document:doc,ZoteroPane:{getSelectedItems:()=>selected,getSelectedCollection:()=>({getChildItems:()=>collection})}};
  const context=vm.createContext({console,Promise});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../bootstrap.js'),'utf8'),context);context.onMainWindowLoad({window});
  return {elements,context,select(items){selected=items;},collect(items){collection=items;}};
}
test('item and collection commands live in one iconic Canvas tools submenu with short distinct labels',()=>{
  const f=fixture();for(const id of ['zotero-itemmenu','zotero-collectionmenu']){
    const popup=f.elements.get(id);assert.equal(popup.children.length,1);const parent=popup.children[0];assert.equal(parent.tag,'menu');assert.equal(parent.attributes.label,'Canvas tools');assert.match(parent.attributes.image,/icon.png$/);
    const actions=parent.children[0].children;assert.deepEqual(actions.slice(1,5).map(el=>el.attributes.label),['Compare on Canvas','Create Concept Map','Explain Concept','Use custom template…']);assert.equal(new Set(actions.map(el=>el.attributes.image)).size,actions.length);
    for(const action of actions)assert.ok(fs.existsSync(path.resolve(__dirname,'../content',action.attributes.image.split('/').at(-1))));
  }
  const item={isRegularItem:()=>true};f.select([item,item]);f.elements.get('zotero-itemmenu').emit('popupshowing');assert.equal(f.elements.get('research-canvas-comparison').disabled,false);assert.equal(f.elements.get('research-canvas-concept').disabled,true);
  f.collect([item]);f.elements.get('zotero-collectionmenu').emit('popupshowing');assert.equal(f.elements.get('research-canvas-concept-collection').disabled,false);assert.equal(f.elements.get('research-canvas-comparison-collection').disabled,true);
  for(const clean of f.context.menuCleanups)clean();assert.equal(f.elements.get('zotero-itemmenu').children.length,0);assert.equal(f.elements.get('zotero-collectionmenu').children.length,0);
});
test('custom-template command preserves selected sources and optional focus without changing the saved template',async()=>{
  const f=fixture(),M=require('../content/model.js'),T=require('../content/templates.js'),F=require('../content/formats.js');
  const board=M.board('Custom'),node=M.node(0,0);node.text='Define the topic.';board.nodes.push(node);const template=T.capture(M,board,'My instructions'),snapshot=JSON.stringify(template),items=[{isRegularItem:()=>true}],calls=[];
  Object.assign(f.context,{CanvasModel:M,CanvasTemplates:T,CanvasFormats:F,Services:{prompt:{select(win,title,text,choices,choice){assert.match(choices[0],/My instructions/);choice.value=0;return true;},prompt(win,title,text,answer){answer.value='platform governance';return true;},alert(){}}},Zotero:{ProgressWindow:class{changeHeadline(){}addDescription(){}show(){}close(){calls.push('closed');}}}});
  f.context.canvasBridge={listTemplates:async()=>({custom:[template]}),fillTemplate:async(draft,focus,progress,selected)=>{assert.equal(focus,'platform governance');assert.equal(selected,items);assert.equal(draft.mode,'canvas');assert.notEqual(draft.id,board.id);return {board:draft,filled:1,rejected:0,unread:0};},save:async b=>calls.push(b.id),dashboardOpenBoard:async id=>assert.equal(id,calls[0])};
  await f.context.createCustomTemplateCanvas({},items);assert.equal(JSON.stringify(template),snapshot);assert.equal(calls.length,2);assert.equal(calls[1],'closed');
});
test('Send to Canvas offers active canvases and never sends Zotero items into template drafts',async()=>{
  const f=fixture(),selected=[{id:17,deleted:false}],calls=[];
  f.context.Services={prompt:{select(win,title,message,labels,choice){calls.push([...labels]);choice.value=0;return true;}}};
  f.context.canvasBridge={list:async()=>[{id:'draft',title:'Comparison matrix template',templateDraft:true},{id:'canvas',title:'Test Canvas',templateDraft:false}],load:async id=>({templateDraft:id==='draft'}),fromDrop:async()=>[{title:'Annotation'}]};
  f.context.ensureCanvas=async()=>{};f.context.canvasWindow={CanvasApp:{receiveItems:async(id,items)=>calls.push({id,items})},focus(){}};
  await f.context.sendToCanvas({},async()=>selected);
  assert.deepEqual(calls[0],['Test Canvas']);assert.equal(calls[1].id,'canvas');assert.equal(calls[1].items[0].title,'Annotation');
  f.context.canvasBridge.list=async()=>[{id:'draft',title:'Comparison matrix template',templateDraft:true}];
  await assert.rejects(()=>f.context.sendToCanvas({},async()=>selected),/Templates are edited in Templates/);
});

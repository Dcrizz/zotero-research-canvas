(function(root){
  'use strict';
  root.CanvasCounterexampleLibrary=function(bridge){
    const C=root.CanvasConnections,X=root.CanvasCounterexamples,jobs=new Map();
    async function card(itemID){
      if(!Number.isSafeInteger(itemID)||itemID<1)throw Error('Invalid counterexample item.');
      const item=await Zotero.Items.getAsync(itemID);if(!item||item.deleted||(!item.isNote()&&!item.isAnnotation()))throw Error('The original note or annotation is unavailable.');
      let parent=item;for(let depth=0;parent.parentID&&depth<3;depth++){parent=await Zotero.Items.getAsync(parent.parentID);if(!parent||parent.deleted)throw Error('The source document is unavailable.');}
      const annotation=item.isAnnotation(),kind=annotation?'annotation':'note';let title=annotation?'':item.getNoteTitle();
      if(annotation){const attachment=await Zotero.Items.getAsync(item.parentID),regular=parent.isRegularItem();title=root.CanvasModel.referenceTitle(regular?parent.getField('firstCreator'):'',regular?(parent.getField('date').match(/\b\d{4}\b/)||[''])[0]:'',parent.getField('title')||attachment.getField('title'));}
      const fullText=annotation?C.normalize(C.plain(item.annotationComment||'')+' '+(item.annotationText||'')):C.plain(item.getNote());
      return {id:'item-'+item.id,itemID:item.id,key:item.libraryID+'/'+item.key,parentKey:parent.libraryID+'/'+parent.key,kind,title,fullText,signature:C.signature(title+'\n'+fullText)};
    }
    async function expand(matches,excluded,queries,check){
      const docs=new Map(),candidates=new Map(),skipped={ambiguous:0,truncated:false};
      for(const row of matches){check();if(typeof row.itemKey!=='string')continue;const ids=await Zotero.DB.columnQueryAsync('SELECT itemID FROM items WHERE key=?'+(Number.isInteger(row.libraryID)?' AND libraryID=?':''),Number.isInteger(row.libraryID)?[row.itemKey,row.libraryID]:[row.itemKey]);if(ids.length!==1){if(ids.length>1)skipped.ambiguous++;continue;}
        const item=await Zotero.Items.getAsync(ids[0]);if(!item||item.deleted)continue;
        let doc=docs.get(item.id);if(!doc){doc={item,score:Number(row.score)||0,matchTexts:[]};docs.set(item.id,doc);}doc.score=Math.max(doc.score,Number(row.score)||0);doc.matchTexts.push(...(row.matchedChunks||[]).filter(c=>typeof c.text==='string').slice(0,4).map(c=>c.text));
      }
      async function add(id,doc){check();if(candidates.size>=4000){skipped.truncated=true;return;}const item=await Zotero.Items.getAsync(id);if(!item||item.deleted||(!item.isNote()&&!item.isAnnotation())||excluded.has(item.libraryID+'/'+item.key))return;let ancestor=item;for(let i=0;ancestor.parentID&&i<3;i++){ancestor=await Zotero.Items.getAsync(ancestor.parentID);if(!ancestor||ancestor.deleted)return;}
        const value=await card(id);if(value.fullText.length<20)return;const existing=candidates.get(id);if(existing){existing.score=Math.max(existing.score,doc.score);existing.matchTexts.push(...doc.matchTexts);}else candidates.set(id,{...value,score:doc.score,matchTexts:[...doc.matchTexts]});
      }
      for(const doc of docs.values()){check();const item=doc.item;if(item.isNote()||item.isAnnotation()){await add(item.id,doc);continue;}
        const noteIDs=await Zotero.DB.columnQueryAsync('SELECT itemID FROM itemNotes WHERE parentItemID=? ORDER BY itemID',[item.id]);for(const id of noteIDs)await add(id,doc);
        const attachments=item.isRegularItem()?await item.getAttachments():item.isAttachment()?[item.id]:[];
        for(const id of attachments){const attachment=await Zotero.Items.getAsync(id);if(!attachment||attachment.deleted)continue;const annotationIDs=await Zotero.DB.columnQueryAsync('SELECT itemID FROM itemAnnotations WHERE parentItemID=? ORDER BY sortIndex',[id]);for(const annotationID of annotationIDs)await add(annotationID,doc);if(skipped.truncated)break;}if(skipped.truncated)break;
      }
      return {candidates:[...candidates.values()],documents:docs.size,skipped};
    }
    return {
      counterexampleReady(){if(typeof Zotero.ZoteroMCP?.data?.httpServer?.mcpServer?.callSemanticSearch!=='function')throw Error('Enable the Zotero MCP Plugin semantic search service first.');},
      counterexampleCard:card,
      cancelAllCounterexamples(){for(const id of jobs.keys())this.cancelCounterexamples(id);},
      async counterexampleSemantic(query){const service=Zotero.ZoteroMCP?.data?.httpServer?.mcpServer;if(typeof service?.callSemanticSearch!=='function')throw Error('Enable the Zotero MCP Plugin semantic search service first.');const result=await service.callSemanticSearch({query,topK:20,minScore:0.1,language:'all'});if(!Array.isArray(result.data))throw Error('Unexpected semantic search response.');return result.data;},
      cancelCounterexamples(id){const state=jobs.get(id);if(state)state.cancelled=true;bridge.cancelConnections(id);},
      async findCounterexamples(node,excluded,focus,kind,jobID,onProgress,purpose='counterexample'){
        if(!['counterexample','support'].includes(purpose))throw Error('Invalid evidence search purpose.');
        if(!node||node.kind==='canvas'||!Array.isArray(excluded)||excluded.length>5000||excluded.some(k=>typeof k!=='string'||k.length>100)||!['all','note','annotation'].includes(kind)||typeof focus!=='string'||focus.length>500||typeof jobID!=='string'||jobID.length>100)throw Error('Invalid counterexample search.');
        const state={cancelled:false};jobs.set(jobID,state);const check=()=>{if(state.cancelled)throw Error('Counterexample search cancelled.');},progress=text=>{check();onProgress?.(text);};
        try{
          bridge.counterexampleReady();
          const source=C.prepare(await bridge.connectionCards([node]))[0];if(!source)throw Error('Select a card with at least 20 characters of readable body text.');
          progress(purpose==='support'?'Planning searches for supporting evidence and corroboration...':'Planning searches for opposing accounts and limitations...');const planned=await bridge.connectionAIRequest(X.plan(source,focus,purpose),jobID);check();const queries=X.queries(planned.text),matches=[];
          for(let i=0;i<queries.length;i++){progress('Searching your indexed library ('+(i+1)+'/'+queries.length+')...');matches.push(...await bridge.counterexampleSemantic(queries[i]));check();}
          progress('Finding saved notes and annotations in retrieved sources...');const pool=await expand(matches,new Set(excluded),queries,check),candidates=X.shortlist(pool.candidates.filter(c=>kind==='all'||c.kind===kind),source,queries);
          const base={source,queries,documents:pool.documents,retrieved:pool.candidates.length,reviewed:candidates.length,limited:pool.skipped.truncated,ambiguous:pool.skipped.ambiguous};
          if(!candidates.length)return {...base,results:[],invalid:0,model:planned.model};
          progress('Reviewing '+candidates.length+' notes and annotations for '+(purpose==='support'?'supporting evidence...':'counterevidence...'));const response=await bridge.connectionAIRequest(X.prompt(source,candidates,focus,purpose),jobID);check();const verified=X.verify(response.text,source,candidates,purpose),generatedAt=new Date().toISOString();
          return {...base,...verified,model:response.model,results:verified.results.map(r=>({...r,purpose,model:response.model,generatedAt}))};
        }finally{jobs.delete(jobID);}
      },
      async openCounterexample(itemID){const value=await card(itemID);const item=await Zotero.Items.getAsync(itemID);if(value.kind==='annotation'){const attachment=await Zotero.Items.getAsync(item.parentID);return bridge.openSource({libraryID:item.libraryID,key:attachment.key},item.key);}return bridge.open({libraryID:item.libraryID,key:item.key});}
    };
  };
})(globalThis);

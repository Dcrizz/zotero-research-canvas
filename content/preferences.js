var ResearchCanvasPreferences={
  async init(container){
    const doc=container.ownerDocument,$=id=>doc.getElementById('research-canvas-'+id),service=Zotero.ResearchCanvasPreferences;
    const show=(message,error=false)=>{$('pref-status').textContent=message;$('pref-status').classList.toggle('research-canvas-pref-error',error);};
    const guard=fn=>async()=>{try{await fn();}catch(error){Zotero.logError(error);show(error.message,true);}};
    const shapeChoices=doc.defaultView.CanvasChoices.attach($('card-shape'),{label:'Default card shape'});
    const providerChoices=doc.defaultView.CanvasChoices.attach($('api-provider'),{label:'AI provider'});
    const linkChoices=['pattern','style','arrow'].map(key=>doc.defaultView.CanvasChoices.attach($('link-'+key),{label:'Link '+key}));
    let settings,linkTypes=[],editingID=null;
    const html=tag=>doc.createElementNS('http://www.w3.org/1999/xhtml',tag);
    const syncAPI=()=>{const own=$('api-provider').value==='openai-compatible';for(const id of ['api-endpoint','api-model','api-key','save-api-key','clear-api-key'])$(id).disabled=!own;};
    function resetLinkEditor(){editingID=null;$('link-name').value='';$('link-label').value='';$('link-colour').value='#277c6b';$('link-thickness').value='3';$('link-pattern').value='solid';$('link-style').value='curved';$('link-arrow').value='end';linkChoices.forEach(choice=>choice.sync());$('link-save').textContent='Add link type';$('link-cancel').hidden=true;}
    function effectiveLinkTypes(){const values=new Map(service.defaultLinkTypes().map(type=>[type.id,type]));for(const type of linkTypes)values.set(type.id,type);return [...values.values()];}
    function renderLinkTypes(){
      const list=$('link-types');list.replaceChildren();
      for(const type of effectiveLinkTypes()){
        const row=html('div');row.className='research-canvas-link-row';const swatch=html('span');swatch.className='research-canvas-link-swatch';swatch.style.backgroundColor=type.colour;
        const summary=html('span');summary.textContent=type.title+' · '+type.label+' · '+type.pattern+' · '+type.thickness+' px';row.append(swatch,summary);
        const builtIn=service.defaultLinkTypes().some(item=>item.id===type.id),overridden=linkTypes.some(item=>item.id===type.id);
        {
          const edit=html('button');edit.type='button';edit.textContent='Edit';edit.setAttribute('aria-label','Edit '+type.title);edit.onclick=()=>{editingID=type.id;$('link-name').value=type.title;$('link-label').value=type.label;$('link-colour').value=type.colour;$('link-thickness').value=String(type.thickness);$('link-pattern').value=type.pattern;$('link-style').value=type.style;$('link-arrow').value=type.arrow;linkChoices.forEach(choice=>choice.sync());$('link-save').textContent='Save link type';$('link-cancel').hidden=false;$('link-name').focus();};
          row.append(edit);
          if(!builtIn||overridden){const remove=html('button');remove.type='button';remove.textContent=builtIn?'Reset':'Delete';remove.setAttribute('aria-label',(builtIn?'Reset ':'Delete ')+type.title);remove.onclick=guard(async()=>{const next=linkTypes.filter(item=>item.id!==type.id);await service.saveLinkTypes(next);linkTypes=next;if(editingID===type.id)resetLinkEditor();renderLinkTypes();show(builtIn?'Built-in link type restored.':'Link type deleted. Existing connectors keep their appearance.');});row.append(remove);}
          if(builtIn){const hint=html('small');hint.textContent=overridden?'Customised built-in':'Built in';row.append(hint);}
        }
        list.append(row);
      }
    }
    function fill(){
      $('export-path').value=settings.obsidian.path;$('open-after').checked=settings.obsidian.openAfterExport;
      $('api-provider').value=settings.api.provider;$('api-endpoint').value=settings.api.endpoint;$('api-model').value=settings.api.model;providerChoices.sync();syncAPI();
      for(const [key,value] of Object.entries(settings.card))$('card-'+key).value=value;shapeChoices.sync();
      for(const [key,value] of Object.entries(settings.canvas)){const field=$('canvas-'+key);if(typeof value==='boolean')field.checked=value;else field.value=value;}
    }
    $('browse').onclick=guard(async()=>{const path=await service.choose(doc.defaultView);if(path)$('export-path').value=path;});
    $('manage-templates').onclick=guard(()=>service.openTemplates());
    $('api-provider').addEventListener('change',syncAPI);
    const updateKeyStatus=()=>{$('api-key-status').textContent=service.hasAIKey()?'API key saved locally':'No API key saved';};
    $('save-api-key').onclick=guard(async()=>{if(!$('api-key').value.trim())throw Error('Enter an API key first.');await service.saveAIKey($('api-key').value.trim());$('api-key').value='';updateKeyStatus();show('AI API key saved in Zotero’s password manager.');});
    $('clear-api-key').onclick=guard(async()=>{await service.saveAIKey('');$('api-key').value='';updateKeyStatus();show('AI API key removed.');});
    $('save-settings').onclick=guard(async()=>{
      const next=JSON.parse(JSON.stringify(settings));next.obsidian.path=$('export-path').value.trim();next.obsidian.openAfterExport=$('open-after').checked;
      next.api.provider=$('api-provider').value;next.api.endpoint=$('api-endpoint').value.trim();next.api.model=$('api-model').value.trim();
      for(const key of Object.keys(next.card)){const field=$('card-'+key);next.card[key]=field.type==='number'?Number(field.value):field.value;}
      for(const key of Object.keys(next.canvas)){const field=$('canvas-'+key);next.canvas[key]=field.type==='checkbox'?field.checked:field.type==='number'?Number(field.value):field.value;}
      await service.save(next);settings=next;show('Saved. New cards and canvases will use these defaults.');
    });
    $('reset-appearance').onclick=guard(async()=>{const defaults=await service.defaults();settings.card=defaults.card;settings.canvas=defaults.canvas;fill();show('Appearance reset. Click Save settings to apply.');});
    $('link-cancel').onclick=resetLinkEditor;
    $('link-save').onclick=guard(async()=>{
      const name=$('link-name').value.trim(),label=$('link-label').value.trim(),thickness=Number($('link-thickness').value);
      if(!name||!label||label.length>120||!$('link-thickness').checkValidity())throw Error('Enter a link type name, label and thickness from 1 to 12.');
      if(effectiveLinkTypes().some(type=>type.title.toLocaleLowerCase()===name.toLocaleLowerCase()&&type.id!==editingID))throw Error('A link type with that name already exists.');
      const id=editingID||doc.defaultView.crypto.randomUUID(),previous=effectiveLinkTypes().find(type=>type.id===id);
      const type=service.linkType(id,name,{...previous,label,colour:$('link-colour').value,thickness,pattern:$('link-pattern').value,style:$('link-style').value,arrow:$('link-arrow').value,hierarchy:previous?.hierarchy??false});
      const next=[...linkTypes.filter(item=>item.id!==id),type];await service.saveLinkTypes(next);linkTypes=next;resetLinkEditor();renderLinkTypes();show('Link type saved. It is ready in the connector menu.');
    });
    try{[settings,linkTypes]=await Promise.all([service.get(),service.listLinkTypes()]);fill();renderLinkTypes();updateKeyStatus();}catch(error){Zotero.logError(error);show(error.message,true);}
  }
};
window.ResearchCanvasPreferences=ResearchCanvasPreferences;

var chromeHandle;
var canvasWindow;
var dashboardWindow;
var canvasBridge;
var canvasObservers = new Set();
var menuCleanups = [];
var annotationMenuHandler;
var stopConnectionJobs;

function install() {}
function uninstall() {}

async function startup({rootURI}) {
  await Zotero.initializationPromise;
  chromeHandle = Cc['@mozilla.org/addons/addon-manager-startup;1'].getService(Ci.amIAddonManagerStartup)
    .registerChrome(Services.io.newURI(rootURI + 'manifest.json'), [['content', 'research-canvas', 'content/']]);
  Services.scriptloader.loadSubScript(rootURI + 'content/connections.js', this);
  Services.scriptloader.loadSubScript(rootURI + 'content/counterexamples.js', this);
  Services.scriptloader.loadSubScript(rootURI + 'content/counterexample-library.js', this);
  Services.scriptloader.loadSubScript(rootURI + 'content/settings.js', this);
  Services.scriptloader.loadSubScript(rootURI + 'content/objects.js', this);
  Services.scriptloader.loadSubScript(rootURI + 'content/ai-provider.js', this);
  Services.scriptloader.loadSubScript(rootURI + 'content/model.js', this);
  Services.scriptloader.loadSubScript(rootURI + 'content/library.js', this);
  const directory = PathUtils.join(Zotero.DataDirectory.dir, 'research-canvas');
  await IOUtils.makeDirectory(directory, {ignoreExisting: true});
  let queue = Promise.resolve();
  const connectionJobs=new Map();
  const credentialOrigin='https://research-canvas.invalid',credentialRealm='Research Canvas AI';
  const savedAIKeys=()=>Services.logins.findLogins(credentialOrigin,null,credentialRealm).filter(login=>login.username==='research-canvas');
  const readAIKey=()=>savedAIKeys()[0]?.password||'';
  const writeAIKey=async value=>{if(typeof value!=='string'||value.length>4096)throw Error('Invalid AI API key.');for(const login of savedAIKeys())Services.logins.removeLogin(login);if(value){const login=Cc['@mozilla.org/login-manager/loginInfo;1'].createInstance(Ci.nsILoginInfo);login.init(credentialOrigin,null,credentialRealm,'research-canvas',value,'','');await Services.logins.addLoginAsync(login);}};
  stopConnectionJobs=()=>{for(const state of connectionJobs.values()){state.cancelled=true;state.xhr?.abort();}connectionJobs.clear();};
  const file = id => {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw Error('Invalid board identifier.');
    return PathUtils.join(directory, id + '.json');
  };
  const metadata = async item => {
    const tags = new Set(item.getTags().map(t => t.tag));
    let source = item;
    for (let depth = 0; source.parentID && depth < 3; depth++) {
      source = await Zotero.Items.getAsync(source.parentID);
      for (const tag of source.getTags()) tags.add(tag.tag);
    }
    const regular = source.isRegularItem();
    return {tags: [...tags].sort(), author: regular ? source.getCreators().map(c => c.lastName || c.name || '').filter(Boolean).join(', ') : '',
      year: regular ? (source.getField('date').match(/\b\d{4}\b/) || [''])[0] : '', itemType: item.itemType};
  };
  const describe = async item => {
    if (!item || item.deleted) throw Error('The linked Zotero item is unavailable or in Trash.');
    const note = item.isNote();
    const parsed = note ? new DOMParser().parseFromString(item.getNote(), 'text/html') : null;
    if (parsed) {
      for (const el of parsed.querySelectorAll('br')) el.replaceWith(parsed.createTextNode('\n'));
      for (const el of parsed.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6')) el.append(parsed.createTextNode('\n'));
    }
    return {metadata: await metadata(item), title: note ? item.getNoteTitle() : item.getField('title') || item.key,
      text: note ? parsed.body.textContent.trim() : item.getField('firstCreator') || '',
      kind: note ? 'note' : 'reference', editable: !!Zotero.Libraries.get(item.libraryID).editable,
      link: {libraryID: item.libraryID, key: item.key}};
  };
  const describeAnnotation = async (annotation, allowEmpty = false) => {
    const attachment = await Zotero.Items.getAsync(annotation.attachmentItemID);
    if (!attachment || attachment.deleted || !attachment.isAttachment()) throw Error('The annotation attachment is unavailable.');
    if (!['highlight', 'underline', 'note', 'text', 'image', 'ink'].includes(annotation.type)) throw Error('Unsupported annotation type: ' + annotation.type);
    if (['image', 'ink'].includes(annotation.type) && !annotation.image) throw Error('Annotation image is not available yet. Open the attachment in Zotero and drag the annotation again.');
    const rendered = Zotero.EditorInstanceUtilities.serializeAnnotations([annotation]);
    if (!rendered.html && !allowEmpty) throw Error('The annotation has no content to display.');
    const parsed = new DOMParser().parseFromString(rendered.html, 'text/html');
    const source = attachment.parentID ? await Zotero.Items.getAsync(attachment.parentID) : attachment;
    const sourceMetadata = await metadata(attachment); sourceMetadata.itemType = 'annotation'; sourceMetadata.tags = [...new Set([...sourceMetadata.tags, ...(annotation.tags || []).map(t => t.name || t.tag).filter(Boolean)])].sort();
    const palette=Zotero.Prefs.get('zoterostyle.annotationColors');
    const annotationColourName=CanvasModel.annotationLabel(annotation.color,palette?JSON.parse(palette):[]);
    return {annotationColour: annotation.color, annotationColourName, metadata: sourceMetadata, kind: 'annotation', title: CanvasModel.referenceTitle(source.isRegularItem()?source.getField('firstCreator')||sourceMetadata.author:'',sourceMetadata.year,source.getField('title')||attachment.getField('title')),
      text: parsed.body.textContent.trim(), annotationHTML: rendered.html || '<p></p>',
      link: {libraryID: attachment.libraryID, key: attachment.key},
      annotationKey: /^[A-Z0-9]{8}$/.test(annotation.id || '') ? annotation.id : undefined};
  };
  const describeDroppedItem = async (item, allowEmpty = false) => {
    if (!item || item.deleted) throw Error('The dropped item is unavailable.');
    if (!item.isAnnotation()) return describe(item);
    const annotation = await Zotero.Annotations.toJSON(item);
    annotation.id = item.key; annotation.attachmentItemID = item.parentID;
    return describeAnnotation(annotation, allowEmpty);
  };
  canvasBridge = {
    nativeNotes: true,
    directory,
    async connectionCards(nodes){
      if(!Array.isArray(nodes)||nodes.length>30)throw Error('Choose up to 30 cards for connection suggestions.');
      const result=[];for(const n of nodes){if(!n||typeof n.id!=='string'||typeof n.title!=='string'||typeof n.text!=='string')throw Error('Invalid connection card.');let title=n.title,text=n.text;
        if(n.kind==='note'&&n.link){const item=await Zotero.Items.getByLibraryAndKeyAsync(n.link.libraryID,n.link.key);text=item&&!item.deleted&&item.isNote()?CanvasConnections.plain(item.getNote()):'';if(item&&!item.deleted)title=item.getNoteTitle();}
        if(n.kind==='annotation'){if(n.link&&n.annotationKey){const item=await Zotero.Items.getByLibraryAndKeyAsync(n.link.libraryID,n.annotationKey);text=item&&!item.deleted&&item.isAnnotation()?CanvasConnections.plain(item.annotationComment||'')+' '+(item.annotationText||''):'';}else text=CanvasConnections.plain(n.annotationHTML||'');}
        result.push({id:n.id,title,text:CanvasConnections.normalize(text)});
      }return result;
    },
    async connectionAIRequest(turn,jobID){
      const settings=await this.getSettings();
      if(settings.api.provider==='openai-compatible'){
        if(!settings.api.model)throw Error('Set an AI model in Zotero Canvas settings first.');
        const key=readAIKey();if(!key)throw Error('Save an AI API key in Zotero Canvas settings first.');
        const state={cancelled:false,xhr:null};connectionJobs.set(jobID,state);
        try{const request=CanvasAI.request({endpoint:settings.api.endpoint,model:settings.api.model,key,turn});state.xhr=request.xhr;const result=await request.promise;if(state.cancelled)throw Error('Connection analysis cancelled.');return result;}finally{connectionJobs.delete(jobID);}
      }
      const ai=Zotero.getMainWindow().Meet?.OpenAI;if(typeof ai?.requestChatTurn!=='function')throw Error('Enable Awesome GPT and configure its AI model to suggest connections.');
      const params=ai.getCompletionsParams();if(!params.model)throw Error('Choose a model in Awesome GPT first.');
      const state={cancelled:false,xhr:null};connectionJobs.set(jobID,state);
      try{const result=await ai.requestChatTurn(turn,{sessionId:'research-canvas-'+jobID,reasoningEffortOverride:'low',responseStartTimeoutMs:60000,idleTimeoutMs:45000,absoluteTimeoutMs:120000,requestTimeoutMs:120000,isCancelled:()=>state.cancelled,onXhr:xhr=>{state.xhr=xhr;if(state.cancelled)xhr.abort();}});if(state.cancelled)throw Error('Connection analysis cancelled.');return {text:result.text,model:String(params.model)};}finally{connectionJobs.delete(jobID);}
    },
    cancelConnections(jobID){const state=connectionJobs.get(jobID);if(state){state.cancelled=true;state.xhr?.abort();}},
    async suggestConnections(cards,excluded,jobID){
      const sources=CanvasConnections.prepare(cards);if(sources.length<2||!Array.isArray(excluded)||excluded.length>20000||typeof jobID!=='string'||jobID.length>100)throw Error('Invalid connection analysis request.');for(const p of excluded){let pair;try{pair=JSON.parse(p);}catch{throw Error('Invalid excluded connection.');}if(!Array.isArray(pair)||pair.length!==2||pair.some(id=>typeof id!=='string'))throw Error('Invalid excluded connection.');}
      return this.connectionAIRequest(CanvasConnections.prompt(sources,excluded),jobID);
    },
    async getSettings(){const path=PathUtils.join(directory,'settings','preferences.json');return await IOUtils.exists(path)?CanvasSettings.validate(await IOUtils.readJSON(path)):CanvasSettings.defaults();},
    saveSettings(value){const settings=CanvasSettings.validate(value);const operation=queue.then(async()=>{const dir=PathUtils.join(directory,'settings');await IOUtils.makeDirectory(dir,{ignoreExisting:true});const path=PathUtils.join(dir,'preferences.json');await IOUtils.writeJSON(path,settings,{tmpPath:path+'.tmp',backupFile:path+'.bak'});CanvasModel.setDefaults(settings);canvasWindow?.CanvasApp?.updateDefaults(settings);});queue=operation.catch(error=>Zotero.logError(error));return operation;},
    openSettings(){Zotero.Utilities.Internal.openPreferences('research-canvas-settings');},
    chooseObsidianDirectory(window=canvasWindow){return new Promise(resolve=>{const picker=Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);picker.init(window.browsingContext,'Choose an export folder inside your Obsidian vault',Ci.nsIFilePicker.modeGetFolder);picker.open(result=>resolve(result===Ci.nsIFilePicker.returnCancel?null:picker.file.path));});},
    async sourceLinks(nodes){const result={};for(const n of nodes.filter(n=>n.link)){const groupID=Zotero.Libraries.get(n.link.libraryID).libraryType==='group'?Zotero.Groups.getGroupIDFromLibraryID(n.link.libraryID):null;const location=groupID?'groups/'+groupID:'library';result[n.id]=n.kind==='annotation'&&n.annotationKey?'zotero://open-pdf/'+location+'/items/'+n.link.key+'?annotation='+n.annotationKey:'zotero://select/'+location+'/items/'+n.link.key;}return result;},
    async writeObsidianBundle(bundle,destination){
      if(!bundle||!Array.isArray(bundle.files)||bundle.files.length>50000||!bundle.files.length||typeof bundle.entry!=='string')throw Error('Invalid Obsidian export.');
      const entryParts=bundle.entry.split('/'),root=entryParts.slice(0,2).join('/');
      if(entryParts.length<4||!['Research Canvas','Zotero Canvas'].includes(entryParts[0])||!entryParts[1])throw Error('Invalid Obsidian export folder.');
      const paths=new Set();let size=0;
      for(const f of bundle.files){if(typeof f.path!=='string'||!f.path.startsWith(root+'/')||f.path.split('/').some(p=>!p||p==='.'||p==='..'||/[\\\x00]/.test(p))||paths.has(f.path)||(typeof f.text==='string')===(typeof f.base64==='string'))throw Error('Invalid Obsidian export file.');paths.add(f.path);size+=(f.text??f.base64).length;if(f.base64&&!/^[A-Za-z0-9+/=\r\n]+$/.test(f.base64))throw Error('Invalid exported image.');}
      if(size>300000000||!paths.has(bundle.entry))throw Error('Obsidian export is too large or missing its canvas.');
      if(!PathUtils.isAbsolute(destination)||!(await IOUtils.stat(destination)).type.includes('directory'))throw Error('Choose an existing export folder.');
      const exportRoot=PathUtils.join(destination,...root.split('/'));await IOUtils.makeDirectory(PathUtils.parent(exportRoot),{ignoreExisting:true});if(await IOUtils.exists(exportRoot))throw Error('This export already exists. Send again to create a fresh export.');await IOUtils.makeDirectory(exportRoot,{ignoreExisting:false});
      for(const f of [...bundle.files].sort((a,b)=>Number(a.path===bundle.entry)-Number(b.path===bundle.entry))){const path=PathUtils.join(destination,...f.path.split('/'));await IOUtils.makeDirectory(PathUtils.parent(path),{ignoreExisting:true});if(typeof f.text==='string')await IOUtils.writeUTF8(path,f.text);else await IOUtils.write(path,Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0)));}
      return PathUtils.join(destination,...bundle.entry.split('/'));
    },
    async sendToObsidian(bundle){
      const settings=await this.getSettings();let path=settings.obsidian.path;
      if(!path){path=await this.chooseObsidianDirectory();if(!path)return false;settings.obsidian.path=path;}
      let vault=path;for(let i=0;i<60;i++){if(await IOUtils.exists(PathUtils.join(vault,'.obsidian')))break;const parent=PathUtils.parent(vault);if(parent===vault||i===59)throw Error('Choose an export folder inside an Obsidian vault. Set it in Zotero Settings → Zotero Canvas.');vault=parent;}
      const relative=path.slice(vault.length).replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');if(relative){const root=bundle.entry.split('/').slice(0,2).join('/')+'/',encodedRoot=encodeURI(root),rebase=text=>text.split(encodedRoot).join(encodeURI(relative)+'/'+encodedRoot);bundle={...bundle,files:bundle.files.map(f=>{if(typeof f.text!=='string')return f;if(f.path.endsWith('.canvas')){const data=JSON.parse(f.text);for(const n of data.nodes){if(n.file?.startsWith(root))n.file=relative+'/'+n.file;if(n.text)n.text=rebase(n.text);}return {...f,text:JSON.stringify(data,null,2)};}return {...f,text:rebase(f.text)};})};}
      const entry=await this.writeObsidianBundle(bundle,path);await this.saveSettings(settings);
      if(settings.obsidian.openAfterExport)Zotero.launchURL('obsidian://open?path='+encodeURIComponent(entry));return {path:entry};
    },
    async libraryState(){const path=PathUtils.join(directory,'settings','library.json');return await IOUtils.exists(path)?CanvasLibrary.validate(await IOUtils.readJSON(path)):CanvasLibrary.empty();},
    organise(command){const operation=queue.then(async()=>{if(command.op.endsWith('Board'))await this.load(command.id);const next=CanvasLibrary.apply(await this.libraryState(),command);const dir=PathUtils.join(directory,'settings');await IOUtils.makeDirectory(dir,{ignoreExisting:true});const path=PathUtils.join(dir,'library.json');await IOUtils.writeJSON(path,next,{tmpPath:path+'.tmp',backupFile:path+'.bak'});return next;});queue=operation.catch(error=>Zotero.logError(error));return operation;},
    async list(includeTrash=false) {
      const result = [];
      for (const p of await IOUtils.getChildren(directory)) {
        if (!p.endsWith('.json')) continue;
        try { const b = CanvasModel.validate(await IOUtils.readJSON(p)); result.push({id: b.id, title: b.title, modified: (await IOUtils.stat(p)).lastModified}); }
        catch (error) { Zotero.logError(error); throw Error('Cannot read board ' + p + '. It has been preserved. ' + error.message); }
      }
      const index=await this.libraryState();return result.filter(b=>includeTrash||!index.boards[b.id]?.trashedAt).sort((a, b) => a.title.localeCompare(b.title));
    },
    async load(id) { const board=CanvasModel.validate(await IOUtils.readJSON(file(id)));for(const edge of board.edges){if(edge.aiEvidence&&edge.label==='Supporting source')edge.label='SL ✅';if(edge.aiEvidence&&edge.label==='Counterexample')edge.label='❌CL';}return board; },
    save(value) {
      const b = CanvasModel.validate(value);
      const operation = queue.then(async () => {
        const p = file(b.id);
        if(await IOUtils.exists(p)){
          const previous=CanvasModel.validate(await IOUtils.readJSON(p));
          const graph=value=>JSON.stringify({...value,view:null});
          if(graph(previous)!==graph(b)){
            const snapshots=PathUtils.join(directory,'snapshots',b.id);await IOUtils.makeDirectory(snapshots,{ignoreExisting:true});
            const name=Date.now()+'-'+Zotero.Utilities.generateObjectKey()+'.json';await IOUtils.writeJSON(PathUtils.join(snapshots,name),previous);
            const entries=(await IOUtils.getChildren(snapshots)).filter(p=>p.endsWith('.json')).sort().reverse();for(const old of entries.slice(40))await IOUtils.remove(old);
          }
        }
        await IOUtils.writeJSON(p, b, {tmpPath: p + '.tmp', backupFile: p + '.bak'});
      });
      queue = operation.catch(error => { Zotero.logError(error); });
      return operation;
    },
    async search(query, mode = 'keyword', kind = 'all') {
      query = String(query).trim().slice(0, 500);
      if (query.length < 2) throw Error('Enter at least two characters.');
      if (!['all','note','annotation','reference'].includes(kind)) throw Error('Invalid search content type.');
      const allowed = kind === 'all' ? null : new Set(await Zotero.DB.columnQueryAsync(kind === 'reference' ? 'SELECT itemID FROM items WHERE itemTypeID NOT IN (?,?)' : 'SELECT itemID FROM items WHERE itemTypeID=?', kind === 'reference' ? [Zotero.ItemTypes.getID('note'),Zotero.ItemTypes.getID('annotation')] : [Zotero.ItemTypes.getID(kind)]));
      let items;
      if (mode === 'semantic') {
        const service = Zotero.ZoteroMCP?.data?.httpServer?.mcpServer;
        if (typeof service?.callSemanticSearch !== 'function') throw Error('Enable the Zotero MCP Plugin and its semantic search service first.');
        const result = await service.callSemanticSearch({query, topK: kind === 'all' ? 25 : 100, minScore: 0.1, language: 'all'});
        if (!Array.isArray(result.data)) throw Error('Unexpected semantic search response.');
        items = [];
        for (const match of result.data) {
          const ids = await Zotero.DB.columnQueryAsync('SELECT itemID FROM items WHERE key=?', [match.itemKey]);
          // Keys can repeat between libraries: only resolve unambiguous matches.
          if (ids.length === 1) items.push(await Zotero.Items.getAsync(ids[0]));
        }
      } else {
        const search = new Zotero.Search();
        search.addCondition('joinMode', 'any');
        for (const field of ['title', 'tag', 'note', 'annotationText', 'annotationComment']) search.addCondition(field, 'contains', query);
        // Recently saved notes may still be waiting for Zotero's full-text index.
        const recentNotes = await Zotero.DB.columnQueryAsync('SELECT itemID FROM itemNotes WHERE title LIKE ? AND itemID NOT IN (SELECT itemID FROM deletedItems) ORDER BY itemID DESC LIMIT 60', ['%' + query + '%']);
        items = await Zotero.Items.getAsync([...new Set([...recentNotes, ...await search.search()])].filter(id => !allowed || allowed.has(id)).slice(0, 60));
      }
      return items.filter(i => i && !i.deleted && (!allowed || allowed.has(i.id))).slice(0, mode === 'semantic' ? 25 : 60).map(i => ({id: i.id, title: i.isNote() ? i.getNoteTitle() : i.isAnnotation() ? (i.annotationComment || i.annotationText || 'Image / drawing annotation').slice(0, 180) : i.getField('title') || i.key, kind: i.isNote() ? 'Note' : i.isAnnotation() ? 'Annotation' : 'Reference', library: Zotero.Libraries.get(i.libraryID).name}));
    },
    async listSnapshots(id){
      file(id);const dir=PathUtils.join(directory,'snapshots',id);if(!await IOUtils.exists(dir))return [];
      return (await IOUtils.getChildren(dir)).filter(p=>/^\d+-[A-Z0-9]{8}\.json$/.test(PathUtils.filename(p))).sort().reverse().map(p=>({name:PathUtils.filename(p),date:new Date(Number(PathUtils.filename(p).split('-')[0])).toISOString()}));
    },
    async loadSnapshot(id,name){
      file(id);if(!/^\d+-[A-Z0-9]{8}\.json$/.test(name))throw Error('Invalid snapshot name.');
      return CanvasModel.validate(await IOUtils.readJSON(PathUtils.join(directory,'snapshots',id,name)));
    },
    annotationAppearance(){
      const value=Zotero.Prefs.get('noteTagPills.appearance');
      return value?JSON.parse(value):{background:'#67b2e0',text:'#ffffff',rules:[]};
    },
    async exportNotes(nodes){
      const result={};
      for(const node of nodes.filter(n=>n.kind==='note'&&n.link)){
        const item=await Zotero.Items.getByLibraryAndKeyAsync(node.link.libraryID,node.link.key);
        if(item&&!item.deleted&&item.isNote())result[node.id]=await Zotero.Notes.getExportableNote(item);
      }
      return result;
    },
    chooseExportPath(name,format){
      return new Promise(resolve=>{const picker=Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);picker.init(canvasWindow.browsingContext,'Export canvas',Ci.nsIFilePicker.modeSave);picker.defaultString=name;picker.defaultExtension=format;picker.appendFilter(format.toUpperCase(),'*.'+format);picker.open(result=>resolve(result===Ci.nsIFilePicker.returnCancel?null:picker.file.path));});
    },
    async exportFile(format,name,payload){
      if(!['svg','png','pdf'].includes(format)||!payload||typeof payload.svg!=='string'||payload.svg.length>100000000||!Number.isFinite(payload.width)||!Number.isFinite(payload.height)||payload.width<1||payload.height<1)throw Error('Invalid canvas export.');
      const path=await this.chooseExportPath(name,format);if(!path)return false;
      if(format==='svg'){await IOUtils.writeUTF8(path,payload.svg);return true;}
      if(format==='png'){if(!/^data:image\/png;base64,/.test(payload.png||''))throw Error('Invalid PNG export.');await IOUtils.write(path,Uint8Array.from(atob(payload.png.split(',')[1]),c=>c.charCodeAt(0)));return true;}
      if(!/^data:application\/pdf;base64,/.test(payload.pdf||''))throw Error('Invalid PDF export.');
      await IOUtils.write(path,Uint8Array.from(atob(payload.pdf.split(',')[1]),c=>c.charCodeAt(0)));return true;
    },
    async memberships(link, annotationKey) {
      if(canvasWindow && !canvasWindow.closed && canvasWindow.CanvasApp?.getBoard())await canvasWindow.CanvasApp.flush();
      const matches=[];
      for(const row of await this.list()){
        const b=await this.load(row.id);
        for(const node of b.nodes)if(node.link?.libraryID===link.libraryID && node.link.key===link.key && (!annotationKey || node.annotationKey===annotationKey))matches.push({boardID:b.id,boardTitle:b.title,cardID:node.id,cardTitle:node.title});
      }
      return matches;
    },
    async listMeanings() {
      const path=PathUtils.join(directory,'settings','meanings.json');
      if(!await IOUtils.exists(path))return [];
      const values=await IOUtils.readJSON(path);if(!Array.isArray(values)||values.length>200)throw Error('Invalid connector meanings file; it has been preserved.');
      return values.map(value=>CanvasModel.meaning(value.id,value.title,value));
    },
    saveMeanings(values) {
      if(!Array.isArray(values)||values.length>200)throw Error('Keep up to 200 connector meanings.');
      const presets=values.map(value=>CanvasModel.meaning(value.id,value.title,value));
      const operation=queue.then(async()=>{const dir=PathUtils.join(directory,'settings');await IOUtils.makeDirectory(dir,{ignoreExisting:true});const p=PathUtils.join(dir,'meanings.json');await IOUtils.writeJSON(p,presets,{tmpPath:p+'.tmp',backupFile:p+'.bak'});canvasWindow?.CanvasApp?.refreshMeanings(presets);});queue=operation.catch(error=>Zotero.logError(error));return operation;
    },
    async pickCanvasFile(){
      const path=await new Promise(resolve=>{const picker=Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);picker.init(canvasWindow.browsingContext,'Insert image or file',Ci.nsIFilePicker.modeOpen);picker.appendFilters(Ci.nsIFilePicker.filterAll);picker.open(result=>resolve(result===Ci.nsIFilePicker.returnCancel?null:picker.file.path));});
      if(!path)return null;
      const stat=await IOUtils.stat(path);if(stat.size>20*1024*1024)throw Error('Choose a file smaller than 20 MB.');
      const bytes=await IOUtils.read(path);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      const name=PathUtils.filename(path),ext=name.split('.').pop().toLowerCase();let preview='';
      if(ext==='docx'){
        const zip=Cc['@mozilla.org/libjar/zip-reader;1'].createInstance(Ci.nsIZipReader),file=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);file.initWithPath(path);zip.open(file);
        try{if(!zip.hasEntry('word/document.xml'))throw Error('This Word file has no document content.');if(zip.getEntry('word/document.xml').realSize>5000000)throw Error('Word preview text exceeds 5 MB.');const stream=zip.getInputStream('word/document.xml'),input=Cc['@mozilla.org/scriptableinputstream;1'].createInstance(Ci.nsIScriptableInputStream);input.init(stream);let raw;try{raw=input.read(input.available());}finally{input.close();}const xml=new canvasWindow.DOMParser().parseFromString(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))),'application/xml');if(xml.querySelector('parsererror'))throw Error('Could not read the Word document.');preview=[...xml.getElementsByTagNameNS('*','p')].map(p=>[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join('')).join('\n\n');}finally{zip.close();}
      }
      return {name,base64:canvasWindow.btoa(binary),preview};
    },
    async objectLibrary(){const path=PathUtils.join(directory,'settings','objects.json');return await IOUtils.exists(path)?CanvasObjects.library(await IOUtils.readJSON(path)):[];},
    saveObjectLibrary(values){const entries=CanvasObjects.library(values),operation=queue.then(async()=>{const dir=PathUtils.join(directory,'settings');await IOUtils.makeDirectory(dir,{ignoreExisting:true});const path=PathUtils.join(dir,'objects.json');await IOUtils.writeJSON(path,entries,{tmpPath:path+'.tmp',backupFile:path+'.bak'});});queue=operation.catch(error=>Zotero.logError(error));return operation;},
    openObjectLibraries(){Zotero.launchURL('https://libraries.excalidraw.com/');},
    async selected() {
      const win = Zotero.getMainWindow();
      return Promise.all(win.ZoteroPane.getSelectedItems().map(item => describeDroppedItem(item)));
    },
    async fromDrop(raw) {
      const items = await Zotero.Items.getAsync(CanvasModel.droppedIDs(raw));
      return Promise.all(items.map(item => describeDroppedItem(item)));
    },
    async fromAnnotations(raw) {
      if (typeof raw !== 'string' || raw.length > 50000000) throw Error('The annotation drop is too large.');
      const annotations = JSON.parse(raw);
      if (!Array.isArray(annotations) || !annotations.length || annotations.length > 200) throw Error('Drop between 1 and 200 annotations at a time.');
      return Promise.all(annotations.map(async value => {
        if (!value || !Number.isSafeInteger(value.attachmentItemID)) throw Error('Invalid annotation drop.');
        const attachment = await Zotero.Items.getAsync(value.attachmentItemID);
        if (!attachment) throw Error('The annotation attachment is unavailable.');
        const key = value.id || value.key;
        const item = /^[A-Z0-9]{8}$/.test(key || '') ? await Zotero.Items.getByLibraryAndKeyAsync(attachment.libraryID, key) : null;
        if (item?.isAnnotation() && !item.deleted) return describeDroppedItem(item);
        return describeAnnotation(value);
      }));
    },
    async refresh(links) {
      return Promise.all(links.map(async link => {
        if (link.annotationKey) {
          const sourceLink = {libraryID: link.libraryID, key: link.key};
          const attachment = await Zotero.Items.getByLibraryAndKeyAsync(link.libraryID, link.key);
          const annotation = await Zotero.Items.getByLibraryAndKeyAsync(link.libraryID, link.annotationKey);
          if (!attachment || attachment.deleted || !annotation || annotation.deleted || !annotation.isAnnotation() || annotation.parentID !== attachment.id) return {link: sourceLink, annotationKey: link.annotationKey, missing: true};
          if (['image', 'ink'].includes(annotation.annotationType) && !await Zotero.Annotations.hasCacheImage(annotation)) return {link: sourceLink, annotationKey: link.annotationKey, missing: true};
          return describeDroppedItem(annotation, true);
        }
        const item = await Zotero.Items.getByLibraryAndKeyAsync(link.libraryID, link.key);
        return item && !item.deleted ? describe(item) : {link, missing: true};
      }));
    },
    relateNotes(first, second) {
      const operation = queue.then(() => Zotero.DB.executeTransaction(async () => {
        const a = await Zotero.Items.getByLibraryAndKeyAsync(first.libraryID, first.key);
        const b = await Zotero.Items.getByLibraryAndKeyAsync(second.libraryID, second.key);
        if (!a || !b || a.deleted || b.deleted || !a.isNote() || !b.isNote()) throw Error('Both cards must link to available Zotero notes.');
        if (a.id === b.id) return;
        if (a.libraryID !== b.libraryID) throw Error('Zotero cannot relate notes from different libraries. The canvas connector is preserved.');
        if (!a.isEditable() || !b.isEditable()) throw Error('Both notes must be editable to add a Zotero relationship. The canvas connector is preserved.');
        if (a.relatedItems.includes(b.key) && b.relatedItems.includes(a.key)) return;
        const backups = PathUtils.join(directory, 'relation-backups');
        await IOUtils.makeDirectory(backups, {ignoreExisting: true});
        await IOUtils.writeJSON(PathUtils.join(backups, Zotero.Utilities.generateObjectKey() + '-' + Date.now() + '.json'), {created: new Date().toISOString(), items: [a, b].map(item => ({libraryID: item.libraryID, key: item.key, relations: item.getRelations()}))});
        if (a.addRelatedItem(b)) await a.save();
        if (b.addRelatedItem(a)) await b.save();
      }));
      queue = operation.catch(error => { Zotero.logError(error); });
      return operation;
    },
    subscribe(callback) {
      const observer = {notify: () => callback()};
      const id = Zotero.Notifier.registerObserver(observer, ['item', 'group'], 'researchCanvas');
      canvasObservers.add(id);
      return () => { if (canvasObservers.delete(id)) Zotero.Notifier.unregisterObserver(id); };
    },
    async openSource(link, annotationKey) {
      const attachment = await Zotero.Items.getByLibraryAndKeyAsync(link.libraryID, link.key);
      if (!attachment || attachment.deleted || !attachment.isAttachment()) throw Error('The source attachment is unavailable.');
      if (!/^[A-Z0-9]{8}$/.test(annotationKey || '')) throw Error('This card has no saved annotation link. Drag the saved annotation from Zotero again.');
      const annotation = await Zotero.Items.getByLibraryAndKeyAsync(link.libraryID, annotationKey);
      if (!annotation || annotation.deleted || !annotation.isAnnotation() || annotation.parentID !== attachment.id) throw Error('The original annotation is unavailable. The saved card is preserved.');
      await Zotero.Reader.open(attachment.id, {annotationID: annotation.key});
      Zotero.getMainWindow().focus();
    },
    async open(link) {
      const item = await Zotero.Items.getByLibraryAndKeyAsync(link.libraryID, link.key);
      if (!item || item.deleted) throw Error('The linked Zotero item is unavailable or in Trash.');
      const win = Zotero.getMainWindow(); win.focus(); await win.ZoteroPane.selectItems([item.id]);
      if (item.isNote()) win.ZoteroPane.openNoteWindow(item.id);
    }
  };
  Object.assign(canvasBridge,CanvasCounterexampleLibrary(canvasBridge));
  canvasBridge.dashboardOpenBoard=async id=>{const window=Zotero.getMainWindow(),win=await ensureCanvas(window);await win.CanvasApp.openBoard(id);win.focus();};
  canvasBridge.dashboardCreateBoard=async(title,mode,folderID=null)=>{
    if(!['canvas','mindmap'].includes(mode)||typeof title!=='string'||!title.trim()||title.length>200)throw Error('Invalid canvas details.');
    if(folderID!==null&&!(await canvasBridge.libraryState()).folders.some(f=>f.id===folderID))throw Error('Folder unavailable.');
    const board=CanvasModel.board(title.trim());board.mode=mode;await canvasBridge.save(board);
    if(folderID)await canvasBridge.organise({op:'moveBoard',id:board.id,folderID});
    await canvasBridge.dashboardOpenBoard(board.id);return board.id;
  };
  canvasBridge.dashboardCreateFolder=async(name,parentID=null)=>{
    if(typeof name!=='string'||!name.trim()||name.length>200)throw Error('Invalid folder name.');
    return canvasBridge.organise({op:'createFolder',id:Services.uuid.generateUUID().toString().slice(1,-1),name:name.trim(),folderID:parentID});
  };
  CanvasModel.setDefaults(await canvasBridge.getSettings());
  Zotero.ResearchCanvasPreferences={defaults:()=>CanvasSettings.defaults(),get:()=>canvasBridge.getSettings(),save:value=>canvasBridge.saveSettings(value),choose:window=>canvasBridge.chooseObsidianDirectory(window),hasAIKey:()=>!!readAIKey(),saveAIKey:value=>writeAIKey(value),listLinkTypes:()=>canvasBridge.listMeanings(),saveLinkTypes:values=>canvasBridge.saveMeanings(values),defaultLinkTypes:()=>CanvasModel.defaultMeanings(),linkType:(id,title,edge)=>CanvasModel.meaning(id,title,edge)};
  await Zotero.PreferencePanes.register({id:'research-canvas-settings',pluginID:'research-canvas@local',src:rootURI+'content/preferences.xhtml',scripts:[rootURI+'content/choices.js',rootURI+'content/preferences.js'],stylesheets:[rootURI+'content/choices.css',rootURI+'content/preferences.css'],label:'Zotero Canvas',image:rootURI+'content/icon.png'});

  annotationMenuHandler = event => event.append({label: 'Send to Canvas...', onCommand: () => sendToCanvas(Zotero.getMainWindow(), async () => {
    const attachment = await Zotero.Items.getAsync(event.reader.itemID);
    return Promise.all(event.params.ids.map(key => Zotero.Items.getByLibraryAndKeyAsync(attachment.libraryID, key)));
  }).catch(error => { Zotero.logError(error); Services.prompt.alert(Zotero.getMainWindow(), 'Send to Canvas', error.message); })});
  Zotero.Reader.registerEventListener('createAnnotationContextMenu', annotationMenuHandler, 'research-canvas@local');
  for (const window of Zotero.getMainWindows()) onMainWindowLoad({window});
}

function onMainWindowLoad({window}) {
  const doc = window.document;
  if (doc.getElementById('research-canvas-menu')) return;
  const menu = doc.createXULElement('menuitem');
  menu.id = 'research-canvas-menu'; menu.setAttribute('label', 'Zotero Canvas');
  menu.setAttribute('class', 'menuitem-iconic');
  menu.setAttribute('image', 'chrome://research-canvas/content/icon.png');
  menu.addEventListener('command', () => {
    if (canvasWindow && !canvasWindow.closed) { canvasWindow.focus(); return; }
    canvasWindow = window.openDialog('chrome://research-canvas/content/canvas.xhtml', 'research-canvas',
      'chrome,centerscreen,resizable,width=1250,height=820,dialog=no', canvasBridge);
  });
  doc.getElementById('menu_ToolsPopup').appendChild(menu);
  const openDashboard=()=>{
    if(dashboardWindow&&!dashboardWindow.closed){dashboardWindow.focus();dashboardWindow.CanvasDashboard?.refresh();return;}
    dashboardWindow=window.openDialog('chrome://research-canvas/content/dashboard.xhtml','zotero-canvas-dashboard',
      'chrome,centerscreen,resizable,width=1320,height=860,dialog=no',canvasBridge);
  };
  const addLauncher=nav=>{
    if(!nav||doc.getElementById('research-canvas-launcher-'+nav.id))return;
    const holder=doc.createElementNS('http://www.w3.org/1999/xhtml','div');holder.id='research-canvas-launcher-'+nav.id;
    holder.className='pin-wrapper';holder.setAttribute('role','tab');
    const button=doc.createXULElement('toolbarbutton');button.className='btn';button.setAttribute('tooltiptext','Zotero Canvas dashboard');
    button.setAttribute('aria-label','Zotero Canvas dashboard');button.style.cssText='width:28px;height:28px;padding:5px;';
    const icon=doc.createXULElement('image');icon.className='toolbarbutton-icon';icon.style.cssText='width:18px;height:18px;list-style-image:url("chrome://research-canvas/content/icon.png");';button.append(icon);
    button.addEventListener('command',openDashboard);holder.append(button);
    nav.insertBefore(holder,nav.querySelector('#explore-library-button')||nav.querySelector('.divider:last-of-type')||null);
    menuCleanups.push(()=>holder.remove());
  };
  addLauncher(doc.getElementById('zotero-view-item-sidenav'));
  addLauncher(doc.getElementById('zotero-context-pane-sidenav'));
  const dashboardMenu=doc.createXULElement('menuitem');dashboardMenu.id='research-canvas-dashboard-menu';dashboardMenu.setAttribute('label','Zotero Canvas dashboard');
  dashboardMenu.addEventListener('command',openDashboard);doc.getElementById('menu_ToolsPopup').appendChild(dashboardMenu);
  menuCleanups.push(()=>dashboardMenu.remove());
  for (const [popupID, collection] of [['zotero-itemmenu', false], ['zotero-collectionmenu', true]]) {
    const popup = doc.getElementById(popupID);
    if (!popup) continue;
    const action = doc.createXULElement('menuitem'); action.id = 'research-canvas-send-' + popupID; action.setAttribute('label', 'Send to Canvas...');
    const update = () => { action.disabled = collection ? !window.ZoteroPane.getSelectedCollection() : !window.ZoteroPane.getSelectedItems().length; };
    popup.addEventListener('popupshowing', update);
    action.addEventListener('command', () => sendToCanvas(window, async () => collection ? window.ZoteroPane.getSelectedCollection().getChildItems() : window.ZoteroPane.getSelectedItems()).catch(error => { Zotero.logError(error); Services.prompt.alert(window, 'Send to Canvas', error.message); }));
    popup.append(action); menuCleanups.push(() => { popup.removeEventListener('popupshowing', update); action.remove(); });
    if(!collection){
      const find=doc.createXULElement('menuitem');find.id='research-canvas-find';find.setAttribute('label','Find on Canvases...');
      const updateFind=()=>{find.disabled=window.ZoteroPane.getSelectedItems().length!==1;};popup.addEventListener('popupshowing',updateFind);
      find.addEventListener('command',()=>findOnCanvases(window).catch(error=>{Zotero.logError(error);Services.prompt.alert(window,'Find on Canvases',error.message);}));popup.append(find);menuCleanups.push(()=>{popup.removeEventListener('popupshowing',updateFind);find.remove();});
    }
  }
}
async function ensureCanvas(window){
  if(!canvasWindow || canvasWindow.closed)window.document.getElementById('research-canvas-menu').doCommand();
  for(let i=0;i<100 && !canvasWindow?.CanvasApp?.getBoard();i++)await Zotero.Promise.delay(50);
  if(!canvasWindow?.CanvasApp?.getBoard())throw Error('Canvas did not finish opening. Please try again.');
  return canvasWindow;
}
async function findOnCanvases(window){
  const items=window.ZoteroPane.getSelectedItems();if(items.length!==1)throw Error('Select one item to find its canvases.');
  const item=items[0],source=item.isAnnotation()?await Zotero.Items.getAsync(item.parentID):item;
  const matches=await canvasBridge.memberships({libraryID:source.libraryID,key:source.key},item.isAnnotation()?item.key:undefined);
  if(!matches.length){Services.prompt.alert(window,'Find on Canvases','This item is not on a saved canvas yet.');return;}
  const chosen={value:0};if(!Services.prompt.select(window,'Find on Canvases','Choose a card to open:',matches.map(m=>m.boardTitle+' — '+m.cardTitle),chosen))return;
  const target=matches[chosen.value],win=await ensureCanvas(window);await win.CanvasApp.jumpTo(target.boardID,target.cardID);win.focus();
}
async function sendToCanvas(window, getItems) {
  const items = (await getItems()).filter(item => item && !item.deleted);
  if (!items.length) throw Error('No available items selected.');
  if (items.length > 200) throw Error('Send up to 200 items at a time. Select a smaller group in the item list.');
  const boards = await canvasBridge.list();
  if (!boards.length) throw Error('Create a board in Zotero Canvas first.');
  const chosen = {value: 0};
  if (!Services.prompt.select(window, 'Send to Canvas', 'Choose a canvas for ' + items.length + ' item(s):', boards.map(b => b.title), chosen)) return;
  const target = boards[chosen.value];
  const descriptions = await canvasBridge.fromDrop(items.map(i => i.id).join(','));
  await ensureCanvas(window);
  await canvasWindow.CanvasApp.receiveItems(target.id, descriptions);
  canvasWindow.focus();
}
function onMainWindowUnload() {}
async function shutdown() {
  if(dashboardWindow&&!dashboardWindow.closed)dashboardWindow.close();dashboardWindow=null;
  if (canvasWindow && !canvasWindow.closed) {
    if (canvasWindow.CanvasApp) await canvasWindow.CanvasApp.closeNote();
    if (canvasWindow.CanvasApp) await canvasWindow.CanvasApp.closeInlineNotes();
    if (canvasWindow.CanvasApp) await canvasWindow.CanvasApp.flush();
    canvasWindow.close();
  }
  canvasWindow = null;
  for (const id of canvasObservers) Zotero.Notifier.unregisterObserver(id);
  canvasObservers.clear();
  for (const clean of menuCleanups.splice(0)) clean();
  if (annotationMenuHandler) Zotero.Reader.unregisterEventListener('createAnnotationContextMenu', annotationMenuHandler);
  annotationMenuHandler = null;
  for (const win of Zotero.getMainWindows()) win.document.getElementById('research-canvas-menu')?.remove();
  if (chromeHandle) chromeHandle.destruct();
  canvasBridge?.cancelAllCounterexamples?.();
  stopConnectionJobs?.();stopConnectionJobs=null;
  chromeHandle = null; canvasBridge = null; delete Zotero.ResearchCanvasPreferences;
}

'use strict';
Services.scriptloader.loadSubScript('chrome://zotero/content/include.js', this);
Services.scriptloader.loadSubScript('chrome://global/content/globalOverlay.js', this);
Services.scriptloader.loadSubScript('chrome://global/content/contentAreaUtils.js', this);
Services.scriptloader.loadSubScript('chrome://zotero/content/editMenuOverlay.js', this);
Services.scriptloader.loadSubScript('chrome://zotero/content/customElements.js', this);

let editor, currentItem, notifierID, preview = false, pillsTimer, pillsCore, pillsTarget, pillsConfig;
let previewContextDocument, previewContextHandler, editorPointerDocument;
function dismissCardMenu() { parent.CanvasApp.closeNoteMenu(); }
const pendingSaves = new Set();
let saveError;
function canEdit(item) { return !!item && !item.deleted && Zotero.Libraries.get(item.libraryID).editable; }
function signal(message, error = false) {
  if (preview) { if (error) parent.CanvasApp.previewWarning(currentItem?.key, message); return; }
  parent.CanvasApp.noteStatus(message, error);
}
function updateTagPills() {
  const instance = editor?.getCurrentInstance(), target = instance?._iframeWindow?.wrappedJSObject;
  const core = target?._currentEditorInstance?._editorCore;
  if (!core?.view) return;
  const plugin = Zotero.NoteTagPills;
  if (!plugin) { if (pillsTarget) pillsTarget.eval('window.NoteTagPillsEditor?.detachAll();'); pillsTarget = pillsCore = pillsConfig = undefined; return; }
  const config = Zotero.Prefs.get('noteTagPills.appearance') || '{"background":"#ed1736","text":"#ffffff","rules":[]}';
  if (core === pillsCore && config === pillsConfig) return;
  // The installed Tag Options scanner only sees top-level note editors. Use its
  // own display-only decorator for this nested native editor, with the same prefs.
  if (core !== pillsCore) { target.eval('window.NoteTagPillsEditor?.detachAll();'); target.eval(plugin.editorSource); }
  target.eval('NoteTagPillsEditor.configure(' + JSON.stringify(JSON.parse(config)) + ');');
  if (core !== pillsCore) target.eval('NoteTagPillsEditor.attach(_currentEditorInstance._editorCore);');
  pillsCore = core; pillsTarget = target; pillsConfig = config;
}
function bindInstance() {
  const instance = editor.getCurrentInstance();
  const originalSave = instance._save.bind(instance);
  instance._save = (...args) => {
    if (!canEdit(currentItem) && !instance._readOnly) { instance._readOnly = true; throw Error('This note is no longer editable.'); }
    const operation = originalSave(...args); pendingSaves.add(operation);
    operation.then(() => { pendingSaves.delete(operation); signal('Saved to Zotero'); }, error => { pendingSaves.delete(operation); saveError = error; signal(error.message, true); });
    return operation;
  };
  if (previewContextDocument) previewContextDocument.removeEventListener('contextmenu', previewContextHandler, true);
  previewContextDocument = null;
  if (preview && editor.mode === 'view') {
    instance._readOnly = true; instance._disableSaving = true;
    previewContextDocument = instance._iframeWindow.document;
    previewContextHandler = event => { event.preventDefault(); event.stopPropagation(); parent.CanvasApp.styleNote(cardID); };
    previewContextDocument.addEventListener('contextmenu', previewContextHandler, true);
  }
  if (editorPointerDocument) editorPointerDocument.removeEventListener('pointerdown', dismissCardMenu, true);
  editorPointerDocument = preview ? instance._iframeWindow.document : null;
  editorPointerDocument?.addEventListener('pointerdown', dismissCardMenu, true);
  updateTagPills();
}
async function waitForEditor(promise) {
  let timer;
  try { await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Zotero note editor did not initialize.')), 15000); })]); }
  finally { clearTimeout(timer); }
}
let cardID, switching = false;
window.NoteHost = {
  async open(link, options = {}) {
    preview = !!options.preview; cardID = options.cardID;
    currentItem = await Zotero.Items.getByLibraryAndKeyAsync(link.libraryID, link.key);
    if (!currentItem || currentItem.deleted || !currentItem.isNote()) throw Error('The linked note is unavailable or in Trash.');
    editor = document.getElementById('canvas-note-editor');
    Zotero.UIProperties.registerRoot(editor);
    editor.mode = !preview && canEdit(currentItem) ? 'edit' : 'view';
    editor.viewMode = 'window'; editor.item = currentItem;
    await waitForEditor(editor._initPromise);
    if (preview) document.documentElement.classList.add('note-preview-host');
    bindInstance();
    pillsTimer = setInterval(() => { try { updateTagPills(); } catch (error) { Zotero.logError(error); clearInterval(pillsTimer); signal('Tag styling could not be loaded: ' + error.message, true); } }, 1000);
    notifierID = Zotero.Notifier.registerObserver({notify() {
      if (preview && !canEdit(currentItem)) parent.CanvasApp.previewRevoked(cardID);
      if (!canEdit(currentItem) && editor.mode === 'edit' && !switching) {
        switching = true;
        const instance = editor.getCurrentInstance(); instance._readOnly = true; instance._disableSaving = true;
        editor.mode = 'view';
        editor.initEditor().then(() => { bindInstance(); if (preview) parent.CanvasApp.previewRevoked(cardID); }).catch(error => signal(error.message, true)).finally(() => { switching = false; });
        signal('This note is read-only or has been moved to Trash.', true);
      }
    }}, ['item', 'group'], 'researchCanvasNote');
    if (!preview) { signal(canEdit(currentItem) ? 'Editing the original Zotero note. Changes save automatically.' : 'Read-only Zotero note'); editor.focus(); }
    return {editable: canEdit(currentItem)};
  },
  async setEditable(enabled) {
    if (!preview || switching) throw Error('The note editor is busy.');
    if (enabled && !canEdit(currentItem)) throw Error('This note is read-only or unavailable.');
    switching = true;
    try {
      await this.flush();
      editor.mode = enabled ? 'edit' : 'view';
      await waitForEditor(editor.initEditor()); bindInstance();
      if (enabled) editor.focus();
    } finally { switching = false; }
  },
  async flush({close = true} = {}) {
    if (!editor) return;
    const instance = editor.getCurrentInstance();
    if (canEdit(currentItem) && editor.mode === 'edit') {
      const data = instance._iframeWindow.wrappedJSObject.getDataSync(false);
      if (data) await instance._save(JSON.parse(JSON.stringify(data)));
    }
    await Promise.all([...pendingSaves]);
    if (saveError) throw saveError;
    if (close) instance._disableSaving = true;
  }
};
window.addEventListener('unload', () => {
  clearInterval(pillsTimer);
  editorPointerDocument?.removeEventListener('pointerdown', dismissCardMenu, true);
  previewContextDocument?.removeEventListener('contextmenu', previewContextHandler, true);
  if (pillsTarget && !Components.utils.isDeadWrapper(pillsTarget)) pillsTarget.eval('window.NoteTagPillsEditor?.detachAll();');
  if (notifierID !== undefined) Zotero.Notifier.unregisterObserver(notifierID);
  editor?.saveSync();
}, {once: true});

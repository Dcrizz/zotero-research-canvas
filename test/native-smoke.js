// Test harness only. Append to a COPY of bootstrap.js in a disposable Zotero profile.
// Creates fixture items; never load this in a real research library.
var smokeStarted = false;
var originalWindowLoad = onMainWindowLoad;
onMainWindowLoad = function(args) {
  originalWindowLoad(args);
  if (smokeStarted) return;
  smokeStarted = true;
  setTimeout(async () => {
    const result = {version: Zotero.version, checks: []};
    const check = (ok, name) => { if (!ok) throw Error(name); result.checks.push(name); };
    try {
      const win = args.window;
      check(!!win.document.getElementById('research-canvas-menu'), 'Tools menu registered');
      win.document.getElementById('research-canvas-menu').doCommand();
      for (let i = 0; i < 100 && !canvasWindow?.document?.getElementById('add')?.onclick; i++) await Zotero.Promise.delay(100);
      check(!!canvasWindow.CanvasApp.getBoard(), 'Privileged XHTML window loaded');
      const doc = canvasWindow.document;
      doc.getElementById('add').click();
      check(canvasWindow.CanvasApp.getBoard().nodes.length === 1, 'Add card');
      doc.getElementById('add-child').click();
      check(canvasWindow.CanvasApp.getBoard().edges.length === 1, 'Create hierarchy');
      const mode = doc.getElementById('mode'); mode.value = 'mindmap'; mode.dispatchEvent(new canvasWindow.Event('change'));
      check(canvasWindow.CanvasApp.getBoard().mode === 'mindmap', 'Mode switch');
      await canvasWindow.CanvasApp.flush();
      const b = canvasWindow.CanvasApp.getBoard();
      check((await canvasBridge.load(b.id)).nodes.length === 2, 'Atomic JSON persisted and reloaded');
      check(await IOUtils.exists(PathUtils.join(canvasBridge.directory, b.id + '.json.bak')), 'Previous save backup exists');
      const note = new Zotero.Item('note'); note.libraryID = Zotero.Libraries.userLibraryID;
      note.setNote('<p>Disposable Canvas integration note</p>'); await note.saveTx();
      await win.ZoteroPane.selectItems([note.id]);
      const selected = await canvasBridge.selected();
      check(selected.length === 1 && selected[0].link.key === note.key, 'Native selected-note link');
      doc.getElementById('add-zotero').click();
      await Zotero.Promise.delay(400);
      check(canvasWindow.CanvasApp.getBoard().nodes.some(n => n.link?.key === note.key), 'Selected note added to canvas');
      await canvasBridge.open({libraryID: note.libraryID, key: note.key});
      check(win.ZoteroPane.getSelectedItems()[0]?.id === note.id, 'Open linked note');
      const ref = new Zotero.Item('book'); ref.libraryID = Zotero.Libraries.userLibraryID; ref.setField('title','Disposable Canvas reference'); await ref.saveTx();
      await win.ZoteroPane.selectItems([ref.id]);
      const refs = await canvasBridge.selected();
      check(refs[0].link.key === ref.key, 'Native selected-reference link');
      await canvasBridge.open(refs[0].link);
      check(win.ZoteroPane.getSelectedItems()[0]?.id === ref.id, 'Open linked reference');
      await canvasWindow.CanvasApp.flush();
      canvasWindow.close(); canvasWindow = null;
      win.document.getElementById('research-canvas-menu').doCommand();
      for (let i = 0; i < 100 && !canvasWindow?.document?.getElementById('add')?.onclick; i++) await Zotero.Promise.delay(100);
      check(canvasWindow.CanvasApp.getBoard().nodes.length === 3, 'Window reopen retains graph and note link');
      await shutdown();
      check(!win.document.getElementById('research-canvas-menu'), 'Shutdown removes menu and closes canvas');
      result.success = true;
    } catch (error) { result.error = String(error) + '\n' + error.stack; Zotero.logError(error); }
    await IOUtils.writeJSON(PathUtils.join(Zotero.DataDirectory.dir, 'smoke-result.json'), result);
  }, 1500);
};

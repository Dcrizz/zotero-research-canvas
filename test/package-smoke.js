// Disposable-profile companion plugin bootstrap; expects the linked-note fixture from native-smoke.js.
function install() {}
function uninstall() {}
async function startup() { for (const window of Zotero.getMainWindows()) onMainWindowLoad({window}); }
function shutdown() {}
var started = false;
function onMainWindowLoad({window}) {
 if (started) return; started=true;
 setTimeout(async () => {
 const result = {version: Zotero.version};
 try {
  const {AddonManager} = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addon=await AddonManager.getAddonByID('research-canvas@local'); if(!addon) throw Error('XPI not discovered'); if(!addon.isActive) await addon.enable();
  const menu = window.document.getElementById('research-canvas-menu');
  if (!menu) throw Error('Packaged Tools menu missing');
  menu.doCommand();
  let canvas;
  for(let i=0;i<100;i++) {
   const en=Services.wm.getEnumerator(null);
   while(en.hasMoreElements()) { const w=en.getNext(); if(w.document?.documentURI === 'chrome://research-canvas/content/canvas.xhtml') canvas=w; }
   if(canvas?.document?.getElementById('add')?.onclick) break;
   await Zotero.Promise.delay(100);
  }
  if (!canvas?.CanvasApp?.getBoard()) throw Error('Packaged window failed to initialize');
  const before=canvas.CanvasApp.getBoard().nodes.length;
  canvas.document.getElementById('add').click();
  if(canvas.CanvasApp.getBoard().nodes.length!==before+1) throw Error('Packaged card creation failed');
  await canvas.CanvasApp.flush();
  const linked = canvas.document.querySelector('.linked');
  if (!linked) throw Error('Fixture linked-note card missing');
  linked.click(); await Zotero.Promise.delay(500);
  if (!window.ZoteroPane.getSelectedItems()[0]?.isNote()) throw Error('Packaged linked card click failed');
  result.success=true; result.checks=['Final XPI discovered and enabled','Tools menu opens packaged XHTML','Packaged UI creates card','Packaged storage flush succeeds','Packaged linked-card button opens native note'];
 } catch(error) {result.error=String(error)+'\n'+error.stack;}
 await IOUtils.writeJSON(PathUtils.join(Zotero.DataDirectory.dir,'package-result.json'), result);
 },1500);
}

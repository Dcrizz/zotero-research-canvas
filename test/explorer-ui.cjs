const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../content'),server=http.createServer((req,res)=>{const name=req.url.split('?')[0].slice(1)||'canvas.xhtml';if(!/^[a-z-]+\.(xhtml|js|css|png)$/.test(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.xhtml')?'application/xhtml+xml':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/javascript');res.end(fs.readFileSync(path.join(root,name)));}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>CanvasApp?.getBoard());
 assert.equal(await page.locator('#selection-legacy').isVisible(),false);assert.equal(await page.locator('#boards').isVisible(),false);
 await page.locator('#unfold-explorer').click();assert.equal(await page.locator('#canvas-explorer').isVisible(),true);await page.locator('#fold-explorer').click();assert.equal(await page.locator('#canvas-explorer').isVisible(),false);await page.locator('#unfold-explorer').click();const first=(await page.evaluate(()=>CanvasApp.getBoard())).id;
 assert.equal(await page.locator('.canvas-row.active').getAttribute('data-board'),first);
 await page.locator('#new-folder').click();await page.locator('#canvas-name').fill('Analysis');await page.locator('.canvas-dialog button[type=submit]').click();await page.locator('.canvas-folder summary').click();
 assert.equal(await page.locator('.explorer-folder-icon').count(),1);
 await page.locator('.canvas-folder summary').click({button:'right'});await page.getByRole('menuitem',{name:'Folder colour',exact:true}).click();await page.locator('#canvas-name').fill('#237a61');await page.locator('.canvas-dialog button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.explorer-folder-icon')?.style.color==='rgb(35, 122, 97)');
 await page.locator('#new-canvas').click();await page.locator('#canvas-name').fill('Evidence');await page.locator('.canvas-dialog button[type=submit]').click();await page.waitForFunction(()=>CanvasApp.getBoard().title==='Evidence');const second=await page.evaluate(()=>CanvasApp.getBoard().id);
 await page.locator('#add').dispatchEvent('click');await page.evaluate(()=>CanvasApp.flush());
 assert.equal(await page.locator('.canvas-folder .canvas-row.active').getAttribute('data-board'),second);
 // Move via native drag payload, preserving board data.
 await page.locator('.canvas-row.active').dragTo(page.locator('.folder-root'));await page.waitForFunction(id=>JSON.parse(localStorage.getItem('research-canvas-library')).boards[id].folderID===null,second);
 await page.locator(`[data-board="${second}"]`).click({button:'right'});await page.getByRole('menuitem',{name:'Rename',exact:true}).click();await page.locator('#canvas-name').fill('Evidence revised');await page.locator('.canvas-dialog button[type=submit]').click();await page.waitForFunction(()=>CanvasApp.getBoard().title==='Evidence revised');
 await page.locator(`[data-board="${first}"] .canvas-open`).click();
 await page.locator(`[data-board="${second}"]`).click({button:'right'});await page.getByRole('menuitem',{name:'Embed in current canvas'}).click();await page.locator('.canvas-thumbnail rect').first().waitFor();
 assert.equal((await page.evaluate(()=>CanvasApp.getBoard())).nodes[0].canvasID,second);
 await page.locator('.open-canvas').click();await page.waitForFunction(id=>CanvasApp.getBoard().id===id,second);
 // Reciprocal embed is a single-level preview, not recursive iframes.
 await page.evaluate(id=>CanvasApp.insertCanvas(id,true),first);await page.locator('.canvas-thumbnail').waitFor();assert.equal(await page.locator('.canvas-card iframe').count(),0);
 await page.evaluate(()=>CanvasApp.flush());await page.reload();await page.waitForFunction(()=>CanvasApp?.getBoard());await page.evaluate(id=>CanvasApp.openBoard(id),first);await page.locator('.canvas-thumbnail rect').first().waitFor();assert.equal(await page.locator('.explorer-folder-icon').evaluate(e=>e.style.color),'rgb(35, 122, 97)');await page.waitForFunction(()=>[...document.querySelectorAll('.explorer-canvas-icon')].every(i=>i.complete&&i.naturalWidth>0));
 await page.evaluate(async id=>{await CanvasApp.openBoard(id);await CanvasApp.renameBoard(id,'Updated source');},second);await page.evaluate(id=>CanvasApp.openBoard(id),first);await page.waitForFunction(()=>document.querySelector('.canvas-card .body strong')?.textContent==='Updated source');
 await page.evaluate(id=>{const k='research-canvas-'+id,b=JSON.parse(localStorage.getItem(k));b.title='Live source title';localStorage.setItem(k,JSON.stringify(b));},second);await page.waitForFunction(()=>document.querySelector('.canvas-card .heading')?.textContent==='Live source title');
 await page.locator('#toggle-explorer').click();await page.locator(`[data-board="${second}"]`).click({button:'right'});await page.getByRole('menuitem',{name:'Move to Trash'}).click();await page.waitForFunction(id=>JSON.parse(localStorage.getItem('research-canvas-library')).boards[id].trashedAt,second);
 await page.evaluate(id=>CanvasApp.openBoard(id),first);await page.waitForFunction(()=>document.querySelector('.canvas-card .body')?.textContent.includes('Trash'));
 await page.locator('#canvas-trash summary').click();await page.locator(`#canvas-trash [data-board="${second}"]`).click({button:'right'});await page.getByRole('menuitem',{name:'Restore canvas'}).click();await page.waitForFunction(id=>!JSON.parse(localStorage.getItem('research-canvas-library')).boards[id].trashedAt,second);
 await page.waitForFunction(()=>document.querySelector('.canvas-thumbnail rect'));
 await page.locator(`[data-board="${second}"] .canvas-open`).click();assert.equal((await page.evaluate(()=>CanvasApp.getBoard())).nodes.length,2);
 const obsidian=await page.evaluate(()=>CanvasApp.obsidianBundle());assert.equal(obsidian.canvases,2);assert.equal(obsidian.files.filter(f=>f.path.endsWith('.canvas')).length,2);
 const exported=await page.evaluate(()=>CanvasApp.exportData({scope:'canvas'}));assert.ok(exported.svg.includes('data:image/png;base64,'));
 await page.screenshot({path:path.resolve(__dirname,'../../research-canvas-explorer-preview.png')});assert.deepEqual(errors,[]);console.log('Explorer UI passed: named canvases, active accent, folders, drag move, rename, reciprocal embeds, reload, refresh, Trash and restore.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'../content');
  const server=http.createServer((req,res)=>{const name=req.url.split('?')[0].slice(1)||'canvas.xhtml';if(!/^[a-z-]+\.(xhtml|js|css|png)$/.test(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.xhtml')?'application/xhtml+xml':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/javascript');res.end(fs.readFileSync(path.join(root,name)));}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/canvas.xhtml');await page.waitForFunction(()=>CanvasApp?.getBoard());
    await page.evaluate(async()=>{const board=CanvasTemplates.builtIn(CanvasModel,'conceptmap','Concept template');localStorage.setItem('research-canvas-'+board.id,JSON.stringify(board));const list=JSON.parse(localStorage.getItem('research-canvas-index')||'[]');list.push({id:board.id,title:board.title});localStorage.setItem('research-canvas-index',JSON.stringify(list));await CanvasApp.openBoard(board.id);});
    assert.equal(await page.locator('.card').count(),7);assert.equal(await page.locator('#template-save').isVisible(),true);await page.locator('#fit').click();await page.screenshot({path:path.resolve(__dirname,'../docs/images/concept-template.png')});
    await page.locator('.card').first().locator('.body').dblclick();await page.locator('#text').fill('Define the concept and its competing interpretation.');await page.locator('#text').press('Tab');await page.keyboard.press('Escape');
    await page.locator('#template-save').click();await page.locator('#template-name').fill('My definition branches');await page.locator('#template-default').check();await page.locator('#template-confirm').click();
    await page.waitForFunction(()=>!!JSON.parse(localStorage.getItem('research-canvas-templates')||'null')?.custom?.length);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('research-canvas-templates')));assert.equal(saved.custom[0].name,'My definition branches');assert.equal(saved.defaults.conceptmap,saved.custom[0].id);assert.equal(saved.custom[0].board.nodes[0].text,'Define the concept and its competing interpretation.');
    await page.locator('#template-fill').click();await page.locator('#template-confirm').click();assert.match(await page.locator('#template-dialog-status').innerText(),/installed in Zotero/);
    assert.equal((await page.evaluate(()=>CanvasApp.getBoard())).templateDraft,true);assert.deepEqual(errors,[]);
    await page.locator('#template-cancel').click();await page.evaluate(async()=>{const board=CanvasTemplates.builtIn(CanvasModel,'timeline','Timeline template');localStorage.setItem('research-canvas-'+board.id,JSON.stringify(board));const list=JSON.parse(localStorage.getItem('research-canvas-index')||'[]');list.push({id:board.id,title:board.title});localStorage.setItem('research-canvas-index',JSON.stringify(list));await CanvasApp.openBoard(board.id);});
    assert.equal(await page.locator('.junction-card').count(),3);await page.locator('#fit').click();await page.screenshot({path:path.resolve(__dirname,'../docs/images/timeline-template.png')});
    console.log('PASS: edit card instructions, save a named template and default, and preserve draft on unavailable AI.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

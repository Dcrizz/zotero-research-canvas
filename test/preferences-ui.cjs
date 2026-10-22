const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'../content'),browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const markup=fs.readFileSync(path.join(root,'preferences.xhtml'),'utf8').replace(/<vbox[^>]*>/,'<div id="prefs">').replace('</vbox>','</div>').replace(/html:/g,'').replace(/groupbox/g,'section').replace(/<(div|span)([^>]*?)\/>/g,'<$1$2></$1>');
    await page.route('http://localhost/preferences-test',route=>route.fulfill({contentType:'text/html',body:markup}));await page.goto('http://localhost/preferences-test');for(const name of ['choices','settings','objects','formats','model','preferences'])await page.addScriptTag({path:path.join(root,name+'.js')});
    await page.evaluate(async()=>{window.savedLinks=[];window.prefErrors=[];window.Zotero={logError:error=>prefErrors.push(error.stack||error.message),ResearchCanvasPreferences:{get:async()=>CanvasSettings.defaults(),defaults:()=>CanvasSettings.defaults(),listLinkTypes:async()=>savedLinks,saveLinkTypes:async values=>{savedLinks=values;},defaultLinkTypes:()=>CanvasModel.defaultMeanings(),linkType:(id,title,edge)=>CanvasModel.meaning(id,title,edge),hasAIKey:()=>false,openTemplates:async()=>{window.templatesOpened=true;}}};await ResearchCanvasPreferences.init(document.getElementById('prefs'));if(prefErrors.length)throw Error(prefErrors.join('\n'));});
    await page.getByRole('button',{name:'Edit Supporting link',exact:true}).click();await page.locator('#research-canvas-link-label').fill('Agrees');await page.locator('#research-canvas-link-colour').fill('#334455');await page.locator('#research-canvas-link-save').click();
    await page.waitForFunction(()=>savedLinks.length===1);assert.equal((await page.evaluate(()=>savedLinks[0])).id,'supports');assert.equal((await page.evaluate(()=>savedLinks[0])).label,'Agrees');assert.equal(await page.locator('.research-canvas-link-row').count(),4);
    await page.getByRole('button',{name:'Reset Supporting link',exact:true}).click();await page.waitForFunction(()=>savedLinks.length===0);assert.equal(await page.locator('.research-canvas-link-row').count(),4);
    await page.locator('#research-canvas-manage-templates').click();await page.waitForFunction(()=>window.templatesOpened);assert.deepEqual(errors,[]);console.log('PASS: built-in link edits persist as overrides, reset restores defaults, and settings opens template management.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

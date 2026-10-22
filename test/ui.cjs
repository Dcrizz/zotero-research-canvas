const {chromium} = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../content');
async function openText(page){if(await page.locator('#tools-text').isVisible())return;await page.locator('.card.selected').click({button:'right'});await page.locator('[data-tool=text]').click();}
(async () => {
  const server = http.createServer((req, res) => {
    const name = req.url.split('?')[0] === '/' ? 'canvas.xhtml' : req.url.split('?')[0].slice(1);
    if (!['canvas.xhtml', 'canvas.css', 'choices.js', 'choices.css', 'canvas.js', 'template-author.js', 'template-author-ui.js', 'objects.js', 'object-presets.js', 'objects-ui.js', 'formats.js', 'model.js', 'templates.js', 'research.js', 'workspace-tools.js', 'export.js', 'library.js', 'explorer.js', 'settings.js', 'obsidian.js', 'connections.js', 'connection-ui.js', 'counterexamples.js', 'counterexample-ui.js', 'canvas-entry.png', 'icon.png'].includes(name)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', name.endsWith('.xhtml') ? 'application/xhtml+xml' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/javascript');
    res.end(fs.readFileSync(path.join(root, name)));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 960}});
    page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.CanvasApp?.getBoard(), null, {timeout: 6000});
    await page.locator('#add').dispatchEvent('click'); await openText(page); await page.locator('#title').fill('Research question'); await page.locator('#title').press('Tab'); await page.keyboard.press('Escape');
    await openText(page); await page.locator('#text').fill('How do different sources frame this issue?'); await page.locator('#text').press('Tab'); await page.keyboard.press('Escape');
    await page.locator('#add-child').dispatchEvent('click'); await openText(page); await page.locator('#title').fill('Source evidence'); await page.locator('#title').press('Tab'); await page.keyboard.press('Escape');
    await page.locator('.card').nth(1).click({button: 'right'});
    const floating = await page.locator('#style-toolbar').boundingBox();
    const styledCard = await page.locator('.card').nth(1).boundingBox();
    const canvasBounds = await page.locator('#viewport').boundingBox();
    assert.ok(floating.y + floating.height < styledCard.y, JSON.stringify({floating,styledCard,canvasBounds}));
    assert.ok(floating.x >= canvasBounds.x && floating.x + floating.width <= canvasBounds.x + canvasBounds.width);
    await page.locator('[data-tool="size"]').click();
    await page.locator('#width').fill('280'); await page.locator('#width').press('Tab');
    assert.equal((await page.evaluate(() => window.CanvasApp.getBoard())).nodes[1].width, 280);
    await page.locator('[data-tool="fill"]').click();
    await page.locator('#colour').fill('#e1eee8'); await page.locator('#colour').dispatchEvent('change');
    await page.locator('#card-fill-options [data-value=outline]').click();
    assert.equal(await page.locator('.card').nth(1).evaluate(el => el.style.backgroundColor), 'transparent');
    await page.locator('#card-fill-options [data-value=filled]').click();
    await page.locator('[data-tool=border]').click();
    await page.locator('#card-pattern-options [data-value=dashed]').click();
    assert.equal(await page.locator('.card').nth(1).evaluate(el => el.style.borderStyle), 'dashed');
    await page.locator('#card-pattern-options [data-value=solid]').click();
    await page.locator('[data-tool="shape"]').click();
    await page.locator('[data-shape="ellipse"]').click();
    assert.equal((await page.evaluate(() => window.CanvasApp.getBoard())).nodes[1].shape, 'ellipse');
    await page.locator('[data-shape="rounded"]').click();
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#style-toolbar').isHidden(), true);
    assert.equal(await page.locator('.card').count(), 2); assert.equal(await page.locator('.edge-hit').count(), 1);
    const get = () => page.evaluate(() => window.CanvasApp.getBoard());
    let b = await get(); const initial = structuredClone(b);
    // Move a card by its heading.
    let rect = await page.locator('.card').first().locator('.heading').boundingBox();
    await page.mouse.move(rect.x + 40, rect.y + 15); await page.mouse.down(); await page.mouse.move(rect.x + 140, rect.y + 115, {steps: 8}); await page.mouse.up();
    b = await get(); assert.ok(b.nodes[0].x > initial.nodes[0].x + 80);
    // Resize the second card.
    rect = await page.locator('.card').nth(1).locator('.resize-se').boundingBox();
    await page.mouse.move(rect.x + 6, rect.y + 6); await page.mouse.down(); await page.mouse.move(rect.x + 86, rect.y + 66, {steps: 8}); await page.mouse.up();
    b = await get(); assert.ok(b.nodes[1].width > initial.nodes[1].width + 60);
    assert.equal(await page.locator('.card').nth(1).locator('.resize').count(), 8);
    for (const direction of ['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w']) {
      const before = (await get()).nodes[1], handle = await page.locator('.card').nth(1).locator('.resize-' + direction).boundingBox();
      const x = handle.x + (handle.width > 20 ? 10 : handle.width / 2), y = handle.y + (handle.height > 20 ? 10 : handle.height / 2);
      const dx = direction.includes('w') ? -20 : direction.includes('e') ? 20 : 0, dy = direction.includes('n') ? -20 : direction.includes('s') ? 20 : 0;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, {steps: 6}); await page.mouse.up();
      const after = (await get()).nodes[1];
      assert.equal(Math.round(after.width - before.width), /[we]/.test(direction) ? 20 : 0);
      assert.equal(Math.round(after.height - before.height), /[ns]/.test(direction) ? 20 : 0);
      if (direction.includes('w')) assert.equal(after.x + after.width, before.x + before.width);
      if (direction.includes('n')) assert.equal(after.y + after.height, before.y + before.height);
      await page.locator('#undo').click();
    }
    const freeform = structuredClone(b.nodes);
    await page.locator('#mode-toggle').click(); await page.locator('[data-for=mode] [data-value=mindmap]').click(); await page.locator('#mode-toggle').click(); await page.locator('[data-for=mode] [data-value=canvas]').click();
    b = await get(); assert.deepEqual(b.nodes, freeform); assert.equal(b.edges.length, 1);
    await page.locator('#fit').click();
    // Drag a second connector from the source port to target card.
    const port = await page.locator('.card').first().locator('.port[data-side=bottom]').boundingBox();
    const target = await page.locator('.card').nth(1).locator('.heading').boundingBox();
    await page.mouse.move(port.x + 9, port.y + 9); await page.mouse.down(); await page.mouse.move(target.x + 40, target.y + 15, {steps: 10}); await page.mouse.up();
    assert.equal((await get()).edges.length, 2);
    await page.locator('#mode-toggle').click(); await page.locator('[data-for=mode] [data-value=mindmap]').click();
    assert.ok((await page.locator('.edge-main').first().getAttribute('d')).includes(' L '));
    const beforeMove=await page.locator('.card .heading').first().boundingBox();
    await page.mouse.move(beforeMove.x+15,beforeMove.y+10);await page.mouse.down();await page.mouse.move(beforeMove.x+55,beforeMove.y+30,{steps:6});await page.mouse.up();
    assert.ok((await get()).nodes[0].layoutOverrides?.['mindmap-horizontal']);
    await page.locator('#mode-toggle').click();await page.locator('[data-for=mode] [data-value=conceptmap]').click();await page.locator('#fit').click();
    const conceptHeading=await page.locator('.card .heading').first().boundingBox();
    await page.mouse.move(conceptHeading.x+15,conceptHeading.y+10);await page.mouse.down();await page.mouse.move(conceptHeading.x+55,conceptHeading.y+30,{steps:6});await page.mouse.up();
    assert.ok((await get()).nodes[0].layoutOverrides?.conceptmap);
    await page.locator('#reflow-layout').click();assert.equal((await get()).nodes[0].layoutOverrides?.conceptmap,undefined);
    await page.locator('#mode-toggle').click(); await page.locator('[data-for=mode] [data-value=canvas]').click();
    // Select an edge at a point on the SVG path and format it.
    const edgePoint = await page.locator('.edge-hit').first().evaluate(el => { const p = el.getPointAtLength(el.getTotalLength() * .5), m = el.getScreenCTM(); return {x: p.x * m.a + m.e, y: p.y * m.d + m.f}; });
    await page.locator('.edge-hit').first().dispatchEvent('contextmenu',{clientX:edgePoint.x,clientY:edgePoint.y});
    await page.locator('[data-tool="route"]').click();
    await page.locator('[data-route=elbow]').click();
    await page.locator('[data-tool="arrows"]').click(); await page.locator('[data-field=arrow][data-value=both]').click();
    assert.equal(await page.locator('[data-tool=label]').count(), 0);
    await page.keyboard.press('Escape');
    const labelPoint = await page.locator('.edge-hit').first().evaluate(el => { const p = el.getPointAtLength(el.getTotalLength() / 2), m = el.getScreenCTM(); return {x: p.x * m.a + m.e, y: p.y * m.d + m.f}; });
    await page.mouse.dblclick(labelPoint.x, labelPoint.y);
    await page.locator('#label-editor').fill('Supports'); await page.locator('#label-editor').press('Enter');
    assert.equal(await page.locator('#label-editor').isHidden(), true);
    assert.equal(await page.locator('.edge-pill').textContent(), 'Supports');
    const pill = await page.locator('.edge-label').boundingBox();
    assert.ok(Math.abs(pill.y + pill.height / 2 - labelPoint.y) < 2);
    assert.ok(Math.abs(pill.x + pill.width / 2 - labelPoint.x) < 2);
    await page.mouse.dblclick(labelPoint.x, labelPoint.y);
    await page.locator('#label-editor').fill(''); await page.locator('#label-editor').press('Enter');
    assert.equal(await page.locator('.edge-pill').count(), 0);
    assert.equal(await page.locator('#label-editor').isHidden(), true);
    await page.mouse.dblclick(labelPoint.x, labelPoint.y);
    assert.equal(await page.locator('#label-editor').evaluate(el => el.value), '');
    await page.locator('#label-editor').fill('Discarded'); await page.locator('#label-editor').press('Escape');
    assert.equal((await get()).edges[0].label, '');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.edge-pill').textContent(), 'Supports');
    await page.locator('.edge-hit').first().dispatchEvent('contextmenu', {clientX: labelPoint.x, clientY: labelPoint.y});
    await page.locator('[data-tool="weight"]').click();
    await page.locator('#thickness').fill('5'); await page.locator('#thickness').press('Tab');
    b = await get(); assert.ok(b.edges.some(e => e.style === 'elbow' && e.arrow === 'both' && e.label === 'Supports' && e.thickness === 5));
    await page.locator('#thickness-more').click(); assert.equal((await get()).edges[0].thickness, 6);
    await page.locator('#thickness-less').click(); assert.equal((await get()).edges[0].thickness, 5);
    await page.locator('[data-tool=pattern]').click(); await page.locator('#pattern-options [data-field=pattern][data-value=dashed]').click();
    assert.notEqual(await page.locator('.edge-main').first().getAttribute('stroke-dasharray'), 'none');
    await page.locator('[data-tool=edgefill]').click(); await page.locator('#edgefill-options [data-field=fillMode][data-value=outline]').click();
    assert.equal(await page.locator('.edge-hollow').count(), 1);
    await page.locator('[data-tool=outline]').click(); await page.locator('#outlineWidth').fill('2'); await page.locator('#outlineWidth').press('Tab');
    assert.equal(await page.locator('.edge-outline').count(), 1);
    assert.equal(await page.locator('.port').count(), 8);
    await page.keyboard.press('Escape');
    // Drag the existing target to the bottom of the same card.
    const handle = await page.locator('.endpoint[data-end=target]').boundingBox();
    const bottomPort = await page.locator('.card').nth(1).locator('.port[data-side=bottom]').boundingBox();
    const beforeRetarget = await get();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(bottomPort.x + bottomPort.width / 2, bottomPort.y + bottomPort.height / 2, {steps: 8}); await page.mouse.up();
    const retargeted = await get(); const edited = retargeted.edges.find(e => e.label === 'Supports');
    assert.equal(edited.targetSide, 'bottom'); assert.equal(edited.label, 'Supports'); assert.equal(edited.thickness, 5); assert.equal(retargeted.edges.length, beforeRetarget.edges.length);
    await page.locator('#undo').click(); assert.deepEqual((await get()).edges, beforeRetarget.edges);
    await page.locator('#add').dispatchEvent('click'); await page.locator('#fit').click();
    const third = (await get()).nodes[2];
    await page.locator('.edge-hit').first().dispatchEvent('contextmenu', {clientX: edgePoint.x, clientY: edgePoint.y});
    await page.keyboard.press('Escape');
    const sourceHandle = await page.locator('.endpoint[data-end=source]').boundingBox();
    const thirdPort = await page.locator('.card').nth(2).locator('.port[data-side=right]').boundingBox();
    await page.mouse.move(sourceHandle.x + sourceHandle.width / 2, sourceHandle.y + sourceHandle.height / 2); await page.mouse.down(); await page.mouse.move(thirdPort.x + thirdPort.width / 2, thirdPort.y + thirdPort.height / 2, {steps: 8}); await page.mouse.up();
    assert.equal((await get()).edges[0].source, third.id); assert.equal((await get()).edges[0].sourceSide, 'right');
    await page.locator('#undo').click(); assert.equal((await get()).edges[0].source, beforeRetarget.edges[0].source);
    await page.locator('#undo').click(); assert.equal((await get()).nodes.length, 2);
    // Reselect before testing deletion.
    await page.locator('.edge-hit').first().dispatchEvent('contextmenu', {clientX: edgePoint.x, clientY: edgePoint.y});
    await page.locator('[data-tool=delete]').click(); assert.equal((await get()).edges.length, 1);
    await page.locator('#undo').click(); assert.equal((await get()).edges.length, 2);
    await page.locator('#redo').click(); assert.equal((await get()).edges.length, 1);
    await page.locator('#undo').click();
    await page.evaluate(() => window.CanvasApp.flush()); const persisted = await get();
    await page.reload(); await page.waitForFunction(() => window.CanvasApp?.getBoard()); assert.deepEqual(await get(), persisted);
    // Import creates a new board rather than replacing the existing one.
    // Playwright's file helper expects an uppercase tagName, which XHTML doesn't use.
    const linkedCopy = structuredClone(persisted); linkedCopy.nodes[0].link = {libraryID: 1, key: 'ABCD1234'};
    await page.evaluate(data => { const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(data)], 'board.json', {type: 'application/json'})); const input = document.getElementById('file'); input.files = dt.files; input.dispatchEvent(new Event('change')); }, linkedCopy);
    await page.waitForFunction(() => window.CanvasApp.getBoard().title.endsWith('(imported)'));
    assert.equal(await page.locator('#boards option').count(), 2);
    const imported = await get(); assert.notEqual(imported.id, persisted.id); assert.deepEqual(imported.nodes, linkedCopy.nodes);
    await page.getByRole('button',{name:'Open in Zotero',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Open linked items from the installed Zotero plugin'));
    await page.evaluate(id=>window.CanvasApp.openBoard(id),persisted.id); await page.waitForFunction(id => window.CanvasApp.getBoard().id === id, persisted.id);
    // Hostile text remains plain text.
    await page.locator('.heading').first().click(); await openText(page); await page.locator('#text').fill('<img src=x onerror="alert(1)"/>'); await page.locator('#text').press('Tab'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.card img').count(), 0);
    await openText(page); await page.locator('#text').fill('Compare how sources frame the question.'); await page.locator('#text').press('Tab'); await page.keyboard.press('Escape');
    await page.locator('.heading').nth(1).click(); await openText(page); await page.locator('#text').fill('Keep the claim connected to its evidence.'); await page.locator('#text').press('Tab'); await page.keyboard.press('Escape');
    await page.locator('#mode-toggle').click(); await page.locator('[data-for=mode] [data-value=mindmap]').click(); await page.locator('#fit').click();
    await page.evaluate(() => window.CanvasApp.flush());
    await page.screenshot({path: path.resolve(__dirname, '../../research-canvas-preview.png')});
    // Failed writes remain visible and retryable, rather than reporting success.
    await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw new DOMException('Test quota exceeded', 'QuotaExceededError'); }; });
    await openText(page); await page.locator('#title').fill('Unsaved title'); await page.locator('#title').press('Tab'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Test quota exceeded'));
    await page.evaluate(async () => { Storage.prototype.setItem = window.originalSetItem; await window.CanvasApp.flush(); });
    assert.equal(await page.locator('#status').textContent(), 'Saved locally');
    const beforeInvalid = await get();
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['{"version":99}'], 'invalid.json')); const input = document.getElementById('file'); input.files = dt.files; input.dispatchEvent(new Event('change')); });
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Invalid board'));
    assert.deepEqual(await get(), beforeInvalid);
    // Corrupt saved data disables editing and is left intact.
    await page.evaluate(() => { const id = window.CanvasApp.getBoard().id; localStorage.setItem('research-canvas-' + id, '{broken'); });
    await page.reload(); await page.waitForFunction(() => document.getElementById('status').classList.contains('error'));
    assert.equal(await page.locator('#add').isDisabled(), true);
    const dropPage = await browser.newPage({viewport: {width: 1440, height: 960}});
    dropPage.on('pageerror', e => errors.push(e.message));
    await dropPage.addInitScript(() => {
      const boards = new Map();
      window.dropNote = {title: 'Linked source note', text: 'Live note preview', kind: 'note', link: {libraryID: 1, key: 'ABCD1234'}};
      window.dropAnnotation = {kind: 'annotation', annotationKey: 'ANNO1234', title: 'Annotation heading', text: 'Rich quote', annotationHTML: '<h2>Heading</h2><blockquote><b>Rich quote</b><span class="citation">(Author, 2026, p. 1)</span></blockquote><script>parent.badAnnotation=true</script><img src="https://example.com/track.png"/>', link: {libraryID: 1, key: 'PDF12345'}};
      window.arguments = [{
        async list() { return [...boards.values()].map(b => ({id: b.id, title: b.title})); },
        async load(id) { return structuredClone(boards.get(id)); },
        async save(b) { boards.set(b.id, structuredClone(b)); },
        async fromDrop(raw) { window.receivedDrop = raw; return [structuredClone(window.dropNote)]; },
        async fromAnnotations() { return [structuredClone(window.dropAnnotation)]; },
        async refresh(links) { return links.map(link => link.annotationKey ? window.annotationMissing ? {link: {libraryID: link.libraryID, key: link.key}, annotationKey: link.annotationKey, missing: true} : structuredClone(window.dropAnnotation) : structuredClone(window.dropNote)); },
        async relateNotes(a, b) { window.relatedCalls = [...(window.relatedCalls || []), [a, b]]; },
        subscribe(callback) { window.sourceChanged = callback; return () => {}; }
      }];
    });
    await dropPage.goto(`http://127.0.0.1:${server.address().port}/`);
    await dropPage.waitForFunction(() => document.getElementById('add').onclick);
    await dropPage.evaluate(() => {
      const viewport = document.getElementById('viewport'), rect = viewport.getBoundingClientRect();
      const data = new DataTransfer(); data.setData('zotero/item', '42');
      viewport.dispatchEvent(new DragEvent('dragover', {dataTransfer: data, bubbles: true, cancelable: true}));
      if (!viewport.classList.contains('drop-ready')) throw Error('Drop affordance missing');
      const event=new DragEvent('drop', {dataTransfer: data, clientX: rect.left + 200, clientY: rect.top + 200, bubbles: true, cancelable: true}),view=CanvasApp.getBoard().view;window.expectedDrop={x:(event.clientX-rect.left-view.x)/view.zoom,y:(event.clientY-rect.top-view.y)/view.zoom};viewport.dispatchEvent(event);
    });
    await dropPage.waitForFunction(() => window.CanvasApp.getBoard().nodes.length === 1);
    await dropPage.evaluate(() => {
      const controller = window.CanvasApp;
      document.getElementById('viewport').dispatchEvent(new Event('DOMContentLoaded', {bubbles: true}));
      if (window.CanvasApp !== controller) throw Error('Embedded document reset the canvas controller');
    });
    const dropped = await dropPage.evaluate(() => window.CanvasApp.getBoard().nodes[0]);
    assert.equal(dropped.kind, 'note'); const expectedDrop=await dropPage.evaluate(()=>window.expectedDrop);assert.equal(dropped.x,expectedDrop.x);assert.equal(dropped.y,expectedDrop.y);
    await dropPage.locator('.heading').click();
    assert.equal(await dropPage.locator('#text').getAttribute('readonly'), '');
    assert.equal(await dropPage.locator('#text-field').isHidden(), true);
    assert.equal(await dropPage.locator('.expand-note').count(), 1);
    assert.equal(await dropPage.locator('.note-actions-menu').isHidden(), true);
    await dropPage.locator('.note-actions-toggle').click();
    assert.equal(await dropPage.locator('.note-actions-menu').isVisible(), true);
    assert.equal(await dropPage.locator('.note-actions-menu [role=menuitem]').count(), 3);
    assert.equal(await dropPage.locator('.card > .linked:not(.card-ai-toggle)').count(), 0);
    await dropPage.keyboard.press('End');
    assert.equal(await dropPage.evaluate(() => document.activeElement.classList.contains('open-note')), true);
    await dropPage.keyboard.press('Escape');
    assert.equal(await dropPage.locator('.note-actions-menu').isHidden(), true);
    await dropPage.evaluate(() => { window.dropNote.title = 'A very long note title that should wrap onto several lines rather than being cut off at the edge of the card'; window.sourceChanged(); });
    await dropPage.waitForFunction(() => window.CanvasApp.getBoard().nodes[0].title.startsWith('A very long'));
    const titleBounds = await dropPage.locator('.card .heading').boundingBox(), noteBounds = await dropPage.locator('.card').boundingBox();
    assert.ok(titleBounds.height > 34 && Math.abs(titleBounds.x - noteBounds.x) < 4);
    await dropPage.locator('.note-actions-toggle').click();
    await dropPage.keyboard.press('Escape');
    assert.equal(await dropPage.locator('.note-actions-menu').isHidden(), true);
    await dropPage.evaluate(() => { window.dropNote.text = 'Updated in main Zotero'; window.sourceChanged(); });
    await dropPage.waitForFunction(() => window.CanvasApp.getBoard().nodes[0].text === 'Updated in main Zotero');
    const droppedBeforeMode = await dropPage.evaluate(() => window.CanvasApp.getBoard().nodes);
    await dropPage.locator('#mode-toggle').click(); await dropPage.locator('[data-for=mode] [data-value=mindmap]').click(); await dropPage.locator('#mode-toggle').click(); await dropPage.locator('[data-for=mode] [data-value=canvas]').click();
    assert.deepEqual(await dropPage.evaluate(() => window.CanvasApp.getBoard().nodes), droppedBeforeMode);
    await dropPage.evaluate(() => {
      const data = new DataTransfer(); data.setData('zotero/item', 'bad payload');
      document.getElementById('viewport').dispatchEvent(new DragEvent('drop', {dataTransfer: data, bubbles: true, cancelable: true}));
    });
    await dropPage.waitForFunction(() => document.getElementById('status').classList.contains('error'));
    assert.equal(await dropPage.locator('.card').count(), 1);
    await dropPage.evaluate(() => { const data = new DataTransfer(); data.setData('zotero/annotation', '[{}]'); document.getElementById('viewport').dispatchEvent(new DragEvent('drop', {dataTransfer: data, bubbles: true, cancelable: true})); });
    await dropPage.waitForFunction(() => window.CanvasApp.getBoard().nodes.length === 2);
    assert.equal(await dropPage.locator('.annotation-frame').getAttribute('sandbox'), '');
    const annotationDoc = await dropPage.locator('.annotation-frame').getAttribute('srcdoc');
    assert.ok(annotationDoc.includes('<blockquote>') && annotationDoc.includes('(Author, 2026, p. 1)'));
    assert.ok(!annotationDoc.includes('<script>') && !annotationDoc.includes('https://example.com/track.png'));
    await dropPage.locator('#fit').click();await dropPage.locator('.card').nth(1).locator('.note-actions-toggle').click();await dropPage.getByRole('menuitem',{name:'Expand annotation',exact:true}).click();
    assert.equal((await dropPage.evaluate(() => window.CanvasApp.getBoard().nodes))[1].height, 600);
    const beforeRefresh = await dropPage.evaluate(() => window.CanvasApp.getBoard().nodes[1]);
    await dropPage.evaluate(() => { window.dropAnnotation.title = 'Changed original annotation'; window.dropAnnotation.text = 'Revised quote'; window.dropAnnotation.annotationHTML = '<h3>Changed original annotation</h3><blockquote>Revised quote</blockquote>'; window.sourceChanged(); });
    await dropPage.waitForFunction(() => window.CanvasApp.getBoard().nodes[1].title === 'Changed original annotation');
    const refreshed = await dropPage.evaluate(() => window.CanvasApp.getBoard().nodes[1]);
    for (const key of ['id', 'x', 'y', 'width', 'height', 'colour', 'border', 'borderWidth', 'fontSize']) assert.equal(refreshed[key], beforeRefresh[key]);
    await dropPage.locator('#undo').click();
    assert.equal((await dropPage.evaluate(() => window.CanvasApp.getBoard().nodes))[1].title, 'Changed original annotation');
    await dropPage.evaluate(() => { window.annotationMissing = true; window.sourceChanged(); });
    await dropPage.waitForFunction(() => window.CanvasApp.getBoard().nodes[1].sourceUnavailable);
    assert.equal(await dropPage.locator('.source-warning').count(), 1);
    await dropPage.evaluate(() => { window.annotationMissing = false; window.sourceChanged(); });
    await dropPage.waitForFunction(() => !window.CanvasApp.getBoard().nodes[1].sourceUnavailable);
    const linkedBoardID = await dropPage.evaluate(() => window.CanvasApp.getBoard().id);
    await dropPage.evaluate(()=>window.CanvasApp.createBoard());
    await dropPage.evaluate(() => { window.dropAnnotation.title = 'Edited while board was closed'; window.sourceChanged(); });
    await dropPage.evaluate(id=>window.CanvasApp.openBoard(id),linkedBoardID);
    await dropPage.waitForFunction(() => window.CanvasApp.getBoard().nodes[1]?.title === 'Edited while board was closed');
    // A second linked note uses the real connector gesture to request Related.
    await dropPage.evaluate(() => { window.dropNote = {title: 'Second note', text: 'Second source', kind: 'note', link: {libraryID: 1, key: 'NOTE5678'}}; const dt = new DataTransfer(); dt.setData('zotero/item', '43'); document.getElementById('viewport').dispatchEvent(new DragEvent('drop', {dataTransfer: dt, clientX: 700, clientY: 600, bubbles: true, cancelable: true})); });
    await dropPage.waitForFunction(() => window.CanvasApp.getBoard().nodes.length === 3);
    const from = await dropPage.locator('.card').first().locator('.port[data-side=bottom]').boundingBox();
    const to = await dropPage.locator('.card').nth(2).locator('.port[data-side=left]').boundingBox();
    await dropPage.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await dropPage.mouse.down(); await dropPage.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {steps: 10}); await dropPage.mouse.up();
    await dropPage.waitForFunction(() => window.relatedCalls?.length === 1);
    assert.deepEqual(await dropPage.evaluate(() => window.relatedCalls[0]), [{libraryID: 1, key: 'ABCD1234'}, {libraryID: 1, key: 'NOTE5678'}]);
    assert.deepEqual(errors, []);
    console.log('PASS: XHTML rendering, card editing/drag/resize, mouse connector creation, connector formatting, mode retention, delete/undo/redo, reload persistence, import, board switch, plain-text safety, save-failure retry, malformed-import preservation, corrupt-storage protection.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '../content');
  const server = http.createServer((request, response) => {
    const name = request.url.split('?')[0].slice(1) || 'canvas.xhtml';
    if (!/^[a-z-]+\.(xhtml|js|css|png)$/.test(name)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', name.endsWith('.xhtml') ? 'application/xhtml+xml' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/javascript');
    response.end(fs.readFileSync(path.join(root, name)));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => CanvasApp?.getBoard());
    await page.evaluate(async () => {
      const board = CanvasModel.board('Stable preview');
      const annotation = CanvasModel.node(150, 150, 'Sample annotation', 'Saved passage');
      Object.assign(annotation, { kind: 'annotation', link: { libraryID: 1, key: 'ABCD1234' }, annotationHTML: '<p>Sample highlighted passage</p>' });
      board.nodes.push(annotation);
      await CanvasApp.restoreBoard(board);
      window.previewFrame = document.querySelector('.annotation-frame');
      window.previewLoads = 0;
      previewFrame.addEventListener('load', () => previewLoads++);
    });
    await page.waitForFunction(() => previewLoads >= 1);
    await page.evaluate(() => { previewLoads = 0; });
    const stable = () => page.evaluate(() => previewFrame === document.querySelector('.annotation-frame') && previewFrame.isConnected);
    const start = await page.evaluate(() => ({ ...CanvasApp.getBoard().view }));
    await page.mouse.move(1000, 650);
    await page.mouse.down();
    await page.mouse.move(1080, 690, { steps: 12 });
    await page.mouse.up();
    assert.equal(await stable(), true);
    const moved = await page.evaluate(() => CanvasApp.getBoard().view);
    assert.ok(moved.x > start.x && moved.y > start.y);
    await page.mouse.wheel(0, 90);
    assert.equal(await stable(), true);
    await page.locator('#zoom-in').click();
    assert.equal(await stable(), true);
    const heading = await page.locator('.annotation-frame').locator('..').locator('.heading').boundingBox();
    await page.mouse.move(heading.x + 30, heading.y + 12);
    await page.mouse.down();
    await page.mouse.move(heading.x + 80, heading.y + 42, { steps: 8 });
    await page.mouse.up();
    assert.equal(await stable(), true);
    assert.equal(await page.evaluate(() => previewLoads), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: panning, wheel movement, zoom and annotation-card drag keep the same loaded preview iframe.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

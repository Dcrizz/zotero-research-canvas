// Capture public documentation images with sample data, never a user's Zotero profile.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../content');
const destination = path.resolve(__dirname, '../docs/images');
const allowed = new Set(['canvas.xhtml', 'canvas.css', 'choices.js', 'choices.css', 'canvas.js', 'objects.js', 'object-presets.js', 'objects-ui.js', 'formats.js', 'model.js', 'workspace-tools.js', 'export.js', 'library.js', 'explorer.js', 'settings.js', 'obsidian.js', 'connections.js', 'connection-ui.js', 'counterexamples.js', 'counterexample-ui.js', 'canvas-entry.png', 'icon.png']);

(async () => {
  fs.mkdirSync(destination, { recursive: true });
  const server = http.createServer((request, response) => {
    const name = request.url.split('?')[0] === '/' ? 'canvas.xhtml' : request.url.split('?')[0].slice(1);
    if (!allowed.has(name)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', name.endsWith('.xhtml') ? 'application/xhtml+xml' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/javascript');
    response.end(fs.readFileSync(path.join(root, name)));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.CanvasApp?.getBoard());
    await page.evaluate(async () => {
      const originalID = CanvasApp.getBoard().id;
      const board = CanvasModel.board('Urban heat and tree cover');
      const make = (x, y, title, text, colour, border) => {
        const card = CanvasModel.node(x, y, title, text);
        Object.assign(card, { width: 270, height: 170, colour, border });
        board.nodes.push(card);
        return card;
      };
      const question = make(120, 130, 'Research question', 'How does tree cover affect heat exposure across neighbourhoods?', '#fff8e7', '#a68b54');
      const survey = make(690, 130, 'Resident survey', 'Participants describe shaded streets as more comfortable during summer afternoons.', '#e6f3ec', '#5b9476');
      make(690, 430, 'Temperature records', 'Street-level readings show lower afternoon temperatures beneath mature trees.', '#e4eef8', '#5c83a8');
      const challenge = make(120, 430, 'Alternative account', 'Building density and wind exposure may also explain the measured difference.', '#fbe8e4', '#b98272');
      board.frames = [{ id: crypto.randomUUID(), title: 'Evidence and interpretations', x: 70, y: 80, width: 1090, height: 680, colour: '#eaf2ed', border: '#82ad9a', members: board.nodes.map(n => n.id) }];
      const supports = CanvasModel.edge(survey.id, question.id);
      Object.assign(supports, { label: 'Supports', colour: '#277c6b', hierarchy: false, style: 'elbow' });
      const counter = CanvasModel.edge(challenge.id, question.id);
      Object.assign(counter, { label: 'Challenges', colour: '#ad4b4b', hierarchy: false, style: 'elbow' });
      board.edges.push(supports, counter);
      await CanvasApp.restoreBoard(board);
      await CanvasApp.renameBoard(CanvasApp.getBoard().id, 'Urban heat and tree cover');
      await CanvasApp.renameBoard(originalID, 'Reading notes');
    });
    await page.locator('#fit').click();
    await page.evaluate(() => CanvasApp.flush());
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Saved locally');
    await page.locator('#toggle-explorer').click();
    await page.screenshot({ path: path.join(destination, 'canvas-overview.png') });
    await page.locator('[data-objects=wireframe]').click();
    await page.screenshot({ path: path.join(destination, 'object-palette.png') });
    if (errors.length) throw Error(errors.join('\n'));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

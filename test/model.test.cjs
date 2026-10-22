const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../content/model.js');
test('Zotero drag payload accepts native comma-separated IDs and deduplicates', () => {
  assert.deepEqual(M.droppedIDs('42,51,42'), [42, 51]);
});
test('Zotero drag payload rejects arbitrary text, unsafe IDs and large batches', () => {
  for (const raw of ['', 'abc', 'https://example.com', '1,-2', '1,0', '9007199254740993', '1;2', undefined]) assert.throws(() => M.droppedIDs(raw));
  assert.throws(() => M.droppedIDs(Array.from({length: 201}, (_, i) => i + 1).join(',')));
});
function fixture() { const b = M.board(); b.nodes.push(M.node(32, 42), M.node(430, 92), M.node(500, 400)); b.edges.push(M.edge(b.nodes[0].id, b.nodes[1].id), M.edge(b.nodes[0].id, b.nodes[2].id)); return b; }
test('eight-way resizing anchors the opposite edges and clamps dimensions', () => {
  const rect = {x: 100, y: 200, width: 300, height: 250};
  for (const direction of ['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w']) {
    const r = M.resize(rect, direction, direction.includes('w') ? -50 : 50, direction.includes('n') ? -30 : 30);
    assert.equal(r.width, /[we]/.test(direction) ? 350 : 300); assert.equal(r.height, /[ns]/.test(direction) ? 280 : 250);
    if (direction.includes('w')) assert.equal(r.x + r.width, rect.x + rect.width); else assert.equal(r.x, rect.x);
    if (direction.includes('n')) assert.equal(r.y + r.height, rect.y + rect.height); else assert.equal(r.y, rect.y);
  }
  assert.deepEqual(M.resize(rect, 'nw', 10000, 10000), {x: 260, y: 350, width: 140, height: 100});
  assert.deepEqual(M.resize(rect, 'nw', -10000, -10000), {x: -800, y: -750, width: 1200, height: 1200});
});
test('connector appearance is optional for older boards and validates new styles', () => {
  const b = fixture(); assert.deepEqual(M.validate(b), b);
  Object.assign(b.edges[0], {pattern: 'dashed', fillMode: 'outline', outlineWidth: 2, outlineColour: '#123456', arrow: 'start'});
  assert.deepEqual(M.validate(b), b);
  for (const [field, value] of [['pattern', 'striped'], ['fillMode', 'image'], ['outlineWidth', 7], ['outlineColour', 'red']]) {
    const copy = M.clone(b); copy.edges[0][field] = value; assert.throws(() => M.validate(copy));
  }
});
test('label colour inherits a darker connector colour with accessible text contrast', () => {
  const luminance = hex => { const values = [1, 3, 5].map(i => { const s = parseInt(hex.slice(i, i + 2), 16) / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return values[0] * .2126 + values[1] * .7152 + values[2] * .0722; };
  for (const hex of ['#ffffff', '#000000', '#007f78', '#ff6666', '#f1ce4c', '#697b7a', '#a0a0a0', '#808080']) {
    const p = M.labelPalette(hex), a = luminance(p.background), b = luminance(p.foreground);
    assert.ok(a <= luminance(hex)); assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5);
  }
});
test('all sixteen attachment side combinations preserve exact endpoints for all geometries', () => {
  const b = fixture(), sides = ['left', 'right', 'top', 'bottom'];
  for (const sourceSide of sides) for (const targetSide of sides) for (const style of ['straight', 'curved', 'elbow']) {
    const a = M.anchor(b.nodes[0], sourceSide), c = M.anchor(b.nodes[1], targetSide);
    const path = M.path(b.nodes[0], b.nodes[1], style, sourceSide, targetSide);
    assert.ok(path.startsWith(`M ${a.x} ${a.y} `)); assert.ok(!path.includes('NaN'));
    if (style !== 'elbow') assert.ok(path.endsWith(`${c.x} ${c.y}`));
  }
  b.edges[0].sourceSide = 'bottom'; b.edges[0].targetSide = 'top'; assert.deepEqual(M.validate(b).edges, b.edges);
  b.edges[0].targetSide = 'outside'; assert.throws(() => M.validate(b));
});
test('annotation rich snapshots survive persistence and switching layouts', () => {
  const b = fixture(), n = b.nodes[0]; n.kind = 'annotation'; n.link = {libraryID: 1, key: 'PDF12345'}; n.annotationHTML = '<blockquote><b>Quote</b></blockquote>'; n.annotationKey = 'ANNO1234';
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(b))), b); M.layout(b); assert.equal(n.annotationHTML, '<blockquote><b>Quote</b></blockquote>');
  n.annotationHTML = null; assert.throws(() => M.validate(b));
});
test('mode switches preserve graph, styles, links and freeform coordinates', () => {
  const b = fixture(); b.nodes[0].link = {libraryID: 1, key: 'ABCD1234'}; b.edges[0].label = 'Supports';
  const original = M.clone(b); b.mode = 'mindmap'; const positions = M.positions(b);
  assert.equal(positions.size, 3); assert.ok(positions.get(b.nodes[1].id).x > positions.get(b.nodes[0].id).x);
  b.mode = 'canvas'; assert.deepEqual(b, original); assert.deepEqual(M.validate(JSON.parse(JSON.stringify(b))), original);
});
test('mind maps arrange generations horizontally or vertically with facing direct links',()=>{
  const b=fixture();b.mode='mindmap';
  const horizontal=M.positions(b),a=b.nodes[0],child=b.nodes[1],edge=b.edges[0];
  assert.ok(horizontal.get(child.id).x>horizontal.get(a.id).x);
  assert.deepEqual(M.edgeGeometry(b,edge,{...a,...horizontal.get(a.id)},{...child,...horizontal.get(child.id)}),{style:'straight',sourceSide:'right',targetSide:'left',routePoints:[]});
  b.mindmapDirection='vertical';const vertical=M.positions(b);
  assert.ok(vertical.get(child.id).y>vertical.get(a.id).y);
  assert.deepEqual(M.edgeGeometry(b,edge,{...a,...vertical.get(a.id)},{...child,...vertical.get(child.id)}),{style:'straight',sourceSide:'bottom',targetSide:'top',routePoints:[]});
  assert.ok(M.edgePath(b,edge,{...a,...vertical.get(a.id)},{...child,...vertical.get(child.id)}).includes(' L '));
  b.mindmapDirection='diagonal';assert.throws(()=>M.validate(b));
});
test('mind map and concept map positions can be moved without changing freeform placement',()=>{
  const b=fixture(),freeform=b.nodes.map(n=>({x:n.x,y:n.y}));b.mode='mindmap';
  const auto=M.positions(b).get(b.nodes[1].id);b.nodes[1].layoutOverrides={'mindmap-horizontal':{x:auto.x+80,y:auto.y+35}};
  assert.deepEqual(M.positions(b).get(b.nodes[1].id),{x:auto.x+80,y:auto.y+35});
  b.mindmapDirection='vertical';assert.notDeepEqual(M.positions(b).get(b.nodes[1].id),b.nodes[1].layoutOverrides['mindmap-horizontal']);
  b.mode='conceptmap';const centre=M.positions(b).get(b.nodes[0].id),left=M.positions(b).get(b.nodes[1].id);
  assert.ok(left.x<centre.x);assert.equal(M.edgeGeometry(b,b.edges[0],{...b.nodes[0],...centre},{...b.nodes[1],...left}).sourceSide,'left');
  b.nodes[1].layoutOverrides.conceptmap={x:centre.x+800,y:centre.y};assert.deepEqual(M.positions(b).get(b.nodes[1].id),{x:centre.x+800,y:centre.y});
  assert.deepEqual(M.validate(b),b);b.mode='canvas';assert.deepEqual(b.nodes.map(n=>({x:n.x,y:n.y})),freeform);
  b.nodes[1].layoutOverrides.conceptmap={x:Infinity,y:0};assert.throws(()=>M.validate(b));
});
test('layout handles cycles, multiple parents, cross-links and disconnected nodes without data loss', () => {
  const b = fixture(); b.edges.push(M.edge(b.nodes[1].id, b.nodes[0].id), M.edge(b.nodes[2].id, b.nodes[1].id)); b.nodes.push(M.node());
  const before = M.clone(b); const positions = M.layout(b); assert.equal(positions.size, b.nodes.length); assert.deepEqual(b, before);
  assert.ok([...positions.values()].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});
test('layout spaces variable-size siblings without overlap', () => {
  const b = fixture(); b.nodes[1].height = 900; b.nodes[2].height = 350; b.nodes[1].width = 800;
  const p = M.layout(b); assert.ok(p.get(b.nodes[2].id).y >= p.get(b.nodes[1].id).y + 900);
});
test('reference edges do not alter parent-child hierarchy', () => {
  const b = fixture(); b.edges.forEach(e => e.hierarchy = false); const positions = M.layout(b);
  assert.ok([...positions.values()].every(p => p.x === 0));
});
test('layout is iterative for deep hierarchies', () => {
  const b = M.board(); for (let i = 0; i < 4000; i++) { b.nodes.push(M.node()); if (i) b.edges.push(M.edge(b.nodes[i - 1].id, b.nodes[i].id)); }
  assert.equal(M.layout(b).size, 4000);
});
test('all connector geometries are distinct', () => {
  const a = {...M.node(), x: 0, y: 0}, b = {...M.node(), x: 500, y: 300};
  const paths = ['straight', 'curved', 'elbow'].map(style => M.path(a, b, style)); assert.equal(new Set(paths).size, 3); assert.ok(paths[1].includes('C')); assert.ok(paths[2].includes('H'));
});
for (const [name, mutate] of [
  ['unsupported version', b => b.version = 9], ['dangling edge', b => b.edges[0].target = 'missing'],
  ['duplicate node', b => b.nodes.push(b.nodes[0])], ['unsafe colour', b => b.nodes[0].colour = 'url(https://example.com)'],
  ['invalid size', b => b.nodes[0].width = -1], ['invalid item key', b => b.nodes[0].link = {libraryID: 1, key: '../../bad'}],
  ['invalid arrow', b => b.edges[0].arrow = 'invalid'], ['invalid zoom', b => b.view.zoom = 0],
  ['duplicate connector', b => b.edges.push(b.edges[0])], ['self-link', b => b.edges[0].target = b.edges[0].source]
]) test('rejects ' + name, () => { const b = fixture(); mutate(b); assert.throws(() => M.validate(b)); });

test('frames and filters roundtrip, reject invalid metadata and orphan membership', () => {
  const b=fixture(); b.frames=[{id:'frame-1',title:'Sampling',...M.bounds(b.nodes,40),colour:'#dcebe6',border:'#69877d',members:b.nodes.map(n=>n.id)}];
  b.filters={tag:'ds/samp',author:'',year:'',itemType:'',colourFamily:'ds/samp',mode:'dim'};
  b.nodes[0].metadata={tags:['ds/samp/core'],author:'Jones',year:'2024',itemType:'book'};
  assert.deepEqual(M.validate(b),b);
  const bad=M.clone(b);bad.frames[0].members.push('missing');assert.throws(()=>M.validate(bad));
  const badMeta=M.clone(b);badMeta.nodes[0].metadata.tags=[5];assert.throws(()=>M.validate(badMeta));
});

test('annotation colour pills use the active custom palette names without a hash',()=>{
  assert.equal(M.annotationLabel('#ffa4c6',[['💬 QT','#ffa4c6']]),'💬 QT');
  assert.equal(M.annotationLabel('#2ea8e5',[['#Supporting source','#2ea8e5']]),'Supporting source');
  assert.equal(M.annotationLabel('#2ea8e5'),'Blue');
});

test('annotation reference titles preserve creator, four-digit year and document title',()=>{
  assert.equal(M.referenceTitle('Benjamin','2022','Title of Item'),'Benjamin (2022) - Title of Item');
  assert.equal(M.referenceTitle('Research Group','','Report'),'Research Group - Report');
  assert.equal(M.referenceTitle('','2024','Report'),'(2024) - Report');
  assert.equal(M.referenceTitle('','','Standalone PDF'),'Standalone PDF');
});

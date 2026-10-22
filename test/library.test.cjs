const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../content/library.js'),M=require('../content/model.js');
test('folders reject cycles, preserve input and protect nonempty folders',()=>{
 const original=L.empty(),a=L.apply(original,{op:'createFolder',id:'a',name:'Analysis'}),b=L.apply(a,{op:'createFolder',id:'b',name:'Sources',folderID:'a'});
 assert.equal(original.folders.length,0);assert.throws(()=>L.apply(b,{op:'moveFolder',id:'a',folderID:'b'}),/hierarchy/);
 assert.throws(()=>L.apply(b,{op:'deleteFolder',id:'a'}),/contents/);
 assert.throws(()=>L.apply(b,{op:'moveBoard',id:'__proto__'}),/Invalid/);
});
test('trash is recoverable and preserves folder membership',()=>{
 let s=L.apply(L.empty(),{op:'createFolder',id:'a',name:'Analysis'});s=L.apply(s,{op:'moveBoard',id:'board-one',folderID:'a'});s=L.apply(s,{op:'trashBoard',id:'board-one'});
 assert.ok(s.boards['board-one'].trashedAt);assert.equal(s.boards['board-one'].folderID,'a');s=L.apply(s,{op:'restoreBoard',id:'board-one'});assert.equal(s.boards['board-one'].trashedAt,null);
});
test('cross canvas cards roundtrip without recursive data and validate targets',()=>{
 const b=M.board(),n=M.node();Object.assign(n,{kind:'canvas',canvasID:'other-board',embedded:true});b.nodes.push(n);assert.deepEqual(M.validate(b),b);n.canvasID='../escape';assert.throws(()=>M.validate(b),/Invalid card/);
});

test('folder colours are optional, validated, persistent and reset independently',()=>{
 let s=L.apply(L.empty(),{op:'createFolder',id:'folder',name:'Sources'});const original=structuredClone(s);s=L.apply(s,{op:'colourFolder',id:'folder',colour:'#187a64'});assert.equal(s.folders[0].colour,'#187a64');assert.equal(original.folders[0].colour,undefined);assert.deepEqual(L.validate(JSON.parse(JSON.stringify(s))),s);assert.throws(()=>L.apply(s,{op:'colourFolder',id:'folder',colour:'red'}),/Invalid canvas folder/);s=L.apply(s,{op:'colourFolder',id:'folder',colour:null});assert.deepEqual(s,original);
});

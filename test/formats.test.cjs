const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../content/model.js');
test('structured formats retain cards and produce distinct editable placements',()=>{
  const b=M.board('Sources'),a=M.node(50,60,'Jones study'),c=M.node(410,90,'Smith study');
  a.metadata={tags:['algorithm'],author:'Jones',year:'2022',itemType:'article'};c.metadata={tags:['audience'],author:'Smith',year:'2024',itemType:'article'};
  b.nodes=[a,c];b.edges=[M.edge(a.id,c.id)];const original=M.clone(b);
  for(const mode of ['evidence','matrix','timeline','literature','process']){
    b.mode=mode;const positions=M.positions(b),guides=M.formatGuides(b);
    assert.equal(positions.size,2);assert.ok(guides.length>0);assert.ok([...positions.values()].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.deepEqual(M.validate(b),b);
  }
  b.mode='canvas';assert.deepEqual(b,original);
});

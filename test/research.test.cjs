const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../content/research.js');
const M=require('../content/model.js');

test('evidence health distinguishes verified, changed, missing and unavailable page checks',()=>{
  const node=M.node();node.link={libraryID:1,key:'ABCDEFGH'};node.synthesis=true;node.evidenceQuote='The observed users rejected many recommended videos.';
  assert.equal(R.assess(node,{exists:true,text:'The observed users rejected many recommended videos.'}).state,'verified');
  assert.equal(R.assess(node,{exists:true,text:'A revised source passage.'}).state,'changed');
  assert.equal(R.assess(node,{exists:false}).state,'missing');
  node.pageIndex=4;
  assert.equal(R.assess(node,{exists:true,text:'The observed users rejected many recommended videos.',pageText:null}).state,'unchecked');
  assert.equal(R.assess(node,{exists:true,pageText:'The observed users rejected many recommended videos.'}).state,'verified');
  assert.equal(R.assess(node,{exists:true,pageText:'Different passage on page five.'}).state,'changed');
  assert.deepEqual(M.validate({...M.board(),nodes:[node]}).nodes[0].evidenceQuote,node.evidenceQuote);
});

test('legacy synthesis cards can check their quoted excerpt without changing saved data',()=>{
  const node=M.node();node.link={libraryID:1,key:'ABCDEFGH'};node.synthesis=true;node.text='Interpretation\n\n“An exact source excerpt survives here.”\n\nSource: Jones';
  assert.equal(R.quote(node),'An exact source excerpt survives here.');
  assert.equal(R.assess(node,{exists:true,text:'An exact source excerpt survives here.'}).state,'verified');
  assert.equal(R.assess({...node,synthesis:false},{exists:true,text:''}).state,'unchecked');
});

test('source coverage groups cards by parent work and finds claims with one source',()=>{
  const board=M.board(),claim=M.node(),support=M.node(),other=M.node();
  claim.synthesisType='Claim';claim.link={libraryID:1,key:'NOTEA111'};support.link={libraryID:1,key:'ANNOB222'};other.link={libraryID:1,key:'NOTEC333'};
  board.nodes.push(claim,support,other);const edge=M.edge(claim.id,support.id);edge.label='Supports claim';board.edges.push(edge);
  const identity=[{id:claim.id,libraryID:1,key:'PAPERAAA',title:'Algorithm study',author:'Jones',year:'2023'},{id:support.id,libraryID:1,key:'PAPERAAA',title:'Algorithm study',author:'Jones',year:'2023'},{id:other.id,libraryID:1,key:'PAPERBBB',title:'Audience study',author:'Smith',year:'2024'}];
  const first=R.coverage(board,identity);assert.equal(first.groups.length,2);assert.equal(first.groups[0].cards.length,2);assert.equal(first.claims[0].sources.length,1);
  identity[1]={...identity[1],key:'PAPERBBB',title:'Audience study'};
  assert.equal(R.coverage(board,identity).claims[0].sources.length,2);
});

test('walkthrough visits claim, support, challenge and limitation before unrelated cards',()=>{
  const board=M.board(),claim=M.node(),support=M.node(),challenge=M.node(),limit=M.node(),aside=M.node();
  claim.synthesisType='Claim';support.synthesisType='Finding';challenge.synthesisType='Counterargument';limit.synthesisType='Limitation';
  board.nodes.push(aside,limit,challenge,claim,support);
  for(const [node,label] of [[challenge,'Contradicts claim'],[limit,'Qualifies claim'],[support,'Supports claim']]){const edge=M.edge(claim.id,node.id);edge.label=label;board.edges.push(edge);}
  assert.deepEqual(R.walkthrough(board).map(step=>step.id),[claim.id,support.id,challenge.id,limit.id,aside.id]);
  assert.match(R.walkthrough(board)[1].relation,/Support/);
  assert.deepEqual(R.walkthrough(M.board()),[]);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../content/synthesis.js');
const M=require('../content/model.js');
const sources=[
  {id:'s0',title:'Platform study',author:'Jones',year:'2023',passages:[{id:'p1',origin:'PDF annotation',text:'The recommendation algorithm amplified sensational videos during the observation period.',link:{libraryID:1,key:'ABCDEFGH'},annotationKey:'IJKLMNOP'}]},
  {id:'s1',title:'Audience study',author:'Smith',year:'2024',passages:[{id:'p1',origin:'Saved note',text:'Interviewees described actively rejecting many recommended sensational videos.',link:{libraryID:1,key:'QRSTUVWX'}}]}
];
test('source synthesis verifies exact quotes and builds linked comparison cards',()=>{
  const data={claims:[{id:'c1',source:'s0',passage:'p1',quote:sources[0].passages[0].text,title:'Algorithm amplifies sensational content',cardType:'Finding',interpretation:'A reported finding in this period.'},{id:'c2',source:'s1',passage:'p1',quote:sources[1].passages[0].text,title:'Audience responses varied',cardType:'Limitation',interpretation:'A reported interview finding.'}],relations:[{from:'c2',to:'c1',type:'Qualifies',reason:'Audience rejection limits a deterministic reading of recommendations.'}]};
  assert.equal(S.prompt(sources,'comparison').tools.length,0);
  const verified=S.verify(JSON.stringify(data),sources,'comparison');const board=S.build(M,verified,'comparison','Comparison','fixture');
  assert.equal(board.mode,'literature');assert.equal(board.nodes.length,2);assert.equal(board.edges.length,1);assert.equal(board.nodes[0].annotationKey,'IJKLMNOP');assert.equal(board.nodes[0].synthesisType,'Finding');assert.match(board.nodes[0].title,/Finding/);assert.notEqual(board.nodes[0].colour,board.nodes[1].colour);assert.equal(board.edges[0].label,'Qualifies finding');assert.deepEqual(M.validate(board),board);
  data.claims[1].quote='A fabricated observation.';assert.equal(S.verify(JSON.stringify(data),sources,'comparison').rejected,2);
});
test('annotation page labels are preserved without inventing pages for plain PDF text',()=>{
  assert.equal(S.annotationOrigin('12'),'PDF annotation · p. 12');
  assert.equal(S.annotationOrigin('iv'),'PDF annotation · p. iv');
  assert.equal(S.annotationOrigin(''),'PDF annotation');
  assert.match(S.prompt(sources,'comparison').messages[0].content,/cardType/);
});
test('optional source focus steers the model and selects matching PDF passages',()=>{
  const general=JSON.parse(S.prompt(sources,'comparison').messages[0].content);
  const focused=JSON.parse(S.prompt(sources,'comparison','','Compare algorithmic amplification and creator agency').messages[0].content);
  assert.equal(general.focus,undefined);
  assert.equal(focused.focus,'Compare algorithmic amplification and creator agency');
  assert.match(focused.focusInstruction,/Prioritize/);
  assert.deepEqual(S.focusTerms(focused.focus),['algorithmic','amplification','creator','agency']);
  const pdf='Background discussion. '.repeat(120)+'Creator agency can limit algorithmic amplification. '+'Background discussion. '.repeat(120);
  const starts=S.focusedStarts(pdf,S.focusTerms(focused.focus));
  assert.ok(starts.some(start=>pdf.slice(start,start+1450).includes('Creator agency')));
  assert.throws(()=>S.prompt(sources,'comparison','', 'x'.repeat(501)));
});
test('concept canvases require verified source passages and produce a directional mind map',()=>{
  const input=[{...sources[0],passages:[{...sources[0].passages[0],text:'The algorithmic feedback loop is a repeated interaction between recommendations and audience responses.'},{id:'p2',origin:'Indexed PDF text (page unavailable)',text:'Repeated recommendations shape which videos users encounter during later sessions.',link:{libraryID:1,key:'ABCDEFGH'}}]}];
  const data={claims:[{id:'c1',source:'s0',passage:'p1',quote:input[0].passages[0].text,title:'Algorithmic feedback loop',interpretation:'A working definition from the source.'},{id:'c2',source:'s0',passage:'p2',quote:input[0].passages[1].text,title:'Later recommendations',interpretation:'A component of the loop.'}],relations:[]};
  const board=S.build(M,S.verify(JSON.stringify(data),input,'concept'),'concept','Algorithmic feedback loop','fixture');
  assert.equal(board.mode,'mindmap');assert.equal(board.edges.length,1);assert.equal(board.edges[0].hierarchy,true);assert.deepEqual(M.validate(board),board);
  assert.throws(()=>S.verify(JSON.stringify({...data,claims:data.claims.slice(0,1)}),input,'concept'));
});
test('page-aware PDF excerpts retain a verified page and source link',()=>{
  const documents=[{pageContent:'A definition of the algorithmic feedback loop appears on this page.',metadata:{id:42,position:{pageIndex:5}}},{pageContent:'A competing explanation appears on the next page.',metadata:{id:42,position:{pageIndex:6}}},{pageContent:'Unrelated attachment.',metadata:{id:43,position:{pageIndex:9}}}];
  assert.deepEqual(S.pdfPassages(documents,42).map(p=>p.pageIndex),[5,6]);
  const input=[{...sources[0],passages:[{id:'p1',origin:'PDF text · p. 6',text:documents[0].pageContent,link:{libraryID:1,key:'ABCDEFGH'},pageIndex:5}]}];
  const data={claims:[{id:'c1',source:'s0',passage:'p1',quote:documents[0].pageContent,title:'Feedback loop definition',cardType:'Definition',interpretation:'Source definition.'}],relations:[]};
  const board=S.build(M,S.verify(JSON.stringify(data),input,'conceptmap'),'conceptmap','Concept Map — Feedback loop','fixture','Feedback loop');
  assert.equal(board.mode,'conceptmap');assert.equal(board.nodes[0].title,'Feedback loop');assert.equal(board.nodes[1].pageIndex,5);assert.match(board.nodes[1].title,/◈ Definition · Jones \(2023\) - Platform study/);assert.equal(board.nodes[1].topicHeading,'Feedback loop definition');assert.match(board.nodes[1].text,/^Feedback loop definition\n\n/);assert.equal(board.edges[0].label,'Definition');assert.deepEqual(M.validate(board),board);
  const positions=M.positions(board);assert.ok(positions.get(board.nodes[0].id).x>positions.get(board.nodes[1].id).x);
});

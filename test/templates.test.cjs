const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../content/model.js');
const T=require('../content/templates.js');
const sources=[
  {id:'s0',title:'Platform study',author:'Jones',year:'2023',passages:[{id:'p1',origin:'PDF text · p. 6',text:'The recommendation system repeatedly privileges popular material in the observed sample.',link:{libraryID:1,key:'ABCDEFGH'},pageIndex:5}]},
  {id:'s1',title:'Audience study',author:'Smith',year:'2024',passages:[{id:'p1',origin:'Saved note',text:'Participants actively rejected several recommended videos and described their own selection practices.',link:{libraryID:1,key:'QRSTUVWX'}}]}
];
test('six built-in templates have editable instruction cards and distinct native structures',()=>{
  for(const mode of T.formats){const board=T.builtIn(M,mode,mode);assert.equal(board.mode,mode);assert.equal(board.templateDraft,true);assert.ok(board.nodes.length>=3);assert.ok(board.nodes.every(n=>n.junction||n.text.length>20&&!n.link));assert.deepEqual(M.validate(board),board);}
  const concept=T.builtIn(M,'conceptmap','Concept');assert.ok(concept.edges.some(e=>concept.nodes.find(n=>n.id===e.source).title==='Alternative view'&&concept.nodes.find(n=>n.id===e.target).title==='Strength of alternative'));
  const matrix=T.builtIn(M,'matrix','Compare');assert.ok(matrix.nodes.every(n=>n.organization.matrixColumn==='{{source}}'));
  assert.notDeepEqual(M.positions(concept).get(concept.nodes[0].id),M.positions(concept).get(concept.nodes[1].id));
  const timeline=T.builtIn(M,'timeline','Chronology');assert.equal(timeline.nodes.filter(n=>n.junction).length,3);assert.equal(timeline.edges.length,5);assert.equal(T.tasks(timeline,sources).length,3);
  const dots=timeline.nodes.filter(n=>n.junction),positions=M.positions(timeline);assert.ok(positions.get(dots[0].id).x<positions.get(dots[1].id).x);
  const spine=timeline.edges.find(e=>e.source===dots[0].id&&e.target===dots[1].id);
  const between=M.splitEdge(timeline,spine.id,{x:460,y:326}),placed=M.positions(between.board),inserted=placed.get(between.junctionID);
  assert.ok(placed.get(dots[0].id).x<inserted.x&&inserted.x<placed.get(dots[1].id).x);
  const entries=T.tasks(timeline,sources).map(slot=>({task:slot.id,source:'s0',passage:'p1',quote:sources[0].passages[0].text,text:'Dated, grounded event.'}));
  const filled=T.fill(M,timeline,T.verify(JSON.stringify({entries}),timeline,sources));assert.equal(filled.nodes.filter(n=>n.junction).length,3);assert.equal(filled.edges.length,5);
});
test('edited instruction graphs save as independent per-format templates',()=>{
  const board=T.builtIn(M,'conceptmap','Concept');board.nodes[0].text='Define the concept and contrast a competing theory with the source page.';
  const template=T.capture(M,board,'My concept pattern'),library=T.validateLibrary(M,{version:1,custom:[template],defaults:{conceptmap:template.id}});
  const next=T.instantiate(M,library.custom[0],'Fresh concept');assert.notEqual(next.id,board.id);assert.notEqual(next.nodes[0].id,board.nodes[0].id);assert.equal(next.nodes[0].text,board.nodes[0].text);assert.equal(next.edges.length,board.edges.length);
  board.nodes[0].link={libraryID:1,key:'ABCDEFGH'};assert.throws(()=>T.capture(M,board,'Unsafe'),/editable instruction cards/);
  assert.throws(()=>T.tasks(board,sources),/linked source cards/);
  assert.throws(()=>T.validateLibrary(M,{version:1,custom:[],defaults:{conceptmap:template.id}}),/unavailable/);
});
test('editing a saved template retains its ID without carrying edit state into new canvases',()=>{
  const board=T.builtIn(M,'conceptmap','Editable');board.templateSourceID='saved-template';board.templateSourceName='My template';
  const template=T.capture(M,board,'Updated name',board.templateSourceID);assert.equal(template.id,'saved-template');assert.equal(template.board.templateSourceID,undefined);
  const next=T.instantiate(M,template,'New canvas');assert.equal(next.templateSourceID,undefined);assert.equal(next.templateDraft,true);
});
test('AI filling replaces instructions only when exact excerpts verify and preserves source links',()=>{
  const board=T.builtIn(M,'conceptmap','Concept'),before=M.clone(board),root=board.nodes[0],alternative=board.nodes.find(n=>n.title==='Alternative view');
  root.text='Define the concept, then include an Alternative view when a competing theory is stated.';
  assert.match(T.prompt(board,sources,'algorithmic influence').messages[0].content,/Alternative view/);
  const response={entries:[
    {task:root.id,source:'s0',passage:'p1',quote:sources[0].passages[0].text,text:'Definition\nThe system privileges popular material.\n\nAlternative view\nAudience choice can qualify this.'},
    {task:alternative.id,source:'s1',passage:'p1',quote:sources[1].passages[0].text,text:'Participants report active selection.'},
    {task:board.nodes[2].id,source:'s1',passage:'p1',quote:'Fabricated quotation',text:'Unsupported'}
  ]};
  const checked=T.verify(JSON.stringify(response),board,sources);assert.equal(checked.rejected,1);
  const filled=T.fill(M,board,checked);assert.equal(filled.nodes.length,2);assert.equal(filled.edges.length,1);assert.equal(filled.templateDraft,false);assert.equal(filled.nodes[0].pageIndex,5);assert.deepEqual(filled.nodes[0].link,{libraryID:1,key:'ABCDEFGH'});assert.match(filled.nodes[0].text,/Source: Jones \(2023\) - Platform study · PDF text · p. 6/);assert.deepEqual(M.validate(filled),filled);
  assert.equal(board.nodes.length,before.nodes.length);assert.equal(board.templateDraft,true);
  assert.throws(()=>T.verify(JSON.stringify({entries:[response.entries[1]]}),board,sources),/central template card/);
});
test('comparison matrix repeats each instruction row for every selected source',()=>{
  const board=T.builtIn(M,'matrix','Compare'),slots=T.tasks(board,sources);assert.equal(slots.length,board.nodes.length*sources.length);
  const entries=slots.map(slot=>{const source=sources.find(s=>s.id===slot.source);return {task:slot.id,source:source.id,passage:'p1',quote:source.passages[0].text,text:'Grounded comparison cell.'};});
  const filled=T.fill(M,board,T.verify(JSON.stringify({entries}),board,sources));
  assert.equal(filled.nodes.length,8);assert.equal(filled.mode,'matrix');assert.ok(filled.nodes.some(n=>n.organization.matrixColumn==='Jones (2023)'));assert.ok(filled.nodes.some(n=>n.organization.matrixColumn==='Smith (2024)'));assert.equal(M.formatGuides(filled).filter(g=>g.kind==='matrix-column').length,2);
});
test('numbered cards run in ascending stages and later stages see only verified earlier answers',async()=>{
  const board=T.builtIn(M,'conceptmap','Ordered concept'),[definition,theory,alternative]=board.nodes;
  definition.title='1. Definition';alternative.title='2. Alternative view';theory.text='2) Explain the mechanism with evidence.';
  const stages=T.sequence(board,sources);assert.deepEqual(stages.map(stage=>stage.number),[1,2,null]);
  assert.deepEqual(stages[1].slots.map(slot=>slot.node.id),[theory.id,alternative.id]);
  const calls=[],progress=[];
  const checked=await T.run(board,sources,'algorithmic influence',async request=>{
    const payload=JSON.parse(request.messages[0].content);calls.push(payload);
    if(calls.length===1)assert.equal(payload.sequence.earlier.length,0);
    if(calls.length===2){assert.equal(payload.sequence.step,2);assert.equal(payload.sequence.earlier.length,1);assert.equal(payload.sequence.earlier[0].card,'1. Definition');}
    if(calls.length===3){assert.equal(payload.sequence.step,'remaining unnumbered cards');assert.equal(payload.sequence.earlier.length,3);}
    return JSON.stringify({entries:payload.slots.map(slot=>({task:slot.id,source:'s0',passage:'p1',quote:sources[0].passages[0].text,text:'Grounded answer for '+slot.title}))});
  },step=>progress.push(step));
  assert.equal(calls.length,3);assert.deepEqual(progress.map(step=>step.number),[1,2,null]);assert.equal(checked.entries.length,board.nodes.length);
  const filled=T.fill(M,board,checked);assert.equal(filled.nodes[0].title,'1. Definition');assert.match(filled.nodes[0].text,/Grounded answer/);
});
test('unnumbered cards keep one request; an out-of-order numbered answer cannot fill an earlier step',async()=>{
  const board=T.builtIn(M,'evidence','Evidence');assert.deepEqual(T.sequence(board,sources).map(step=>step.number),[null]);
  let calls=0;await T.run(board,sources,'',async request=>{calls++;const payload=JSON.parse(request.messages[0].content);return JSON.stringify({entries:payload.slots.map(slot=>({task:slot.id,source:'s0',passage:'p1',quote:sources[0].passages[0].text,text:'Grounded answer'}))});});assert.equal(calls,1);
  board.nodes[0].title='1. Claim';board.nodes[1].title='2. Supporting evidence';
  await assert.rejects(T.run(board,sources,'',async request=>{const payload=JSON.parse(request.messages[0].content);return JSON.stringify({entries:[{task:board.nodes[1].id,source:'s0',passage:'p1',quote:sources[0].passages[0].text,text:'Wrong step'}]});}),/central template card lacked grounded evidence/);
  assert.equal(board.templateDraft,true);
});
test('numbered comparison rows keep all selected sources within the same step',()=>{
  const board=T.builtIn(M,'matrix','Comparison');board.nodes[0].title='1. Question';board.nodes[1].title='2. Argument';
  const stages=T.sequence(board,sources);assert.deepEqual(stages.map(stage=>stage.number),[1,2,null]);
  assert.equal(stages[0].slots.length,2);assert.deepEqual(stages[0].slots.map(slot=>slot.source),['s0','s1']);
  assert.equal(stages[2].slots.length,4);
});

test('conditional cards omit unsupported branches and save an explainable report',async()=>{
  const board=T.builtIn(M,'conceptmap','Conditional concept');board.nodes[0].title='1. Definition';
  const alternative=board.nodes.find(n=>n.title==='Alternative view');alternative.title='2. Alternative view';alternative.text='Only if: a selected source explicitly describes a competing theory.\nExplain the theory and its source.';
  assert.match(T.condition(alternative),/competing theory/);
  const checked=await T.run(board,sources,'',async request=>{
    const payload=JSON.parse(request.messages[0].content);
    if(payload.slots.some(slot=>slot.id===alternative.id))return JSON.stringify({entries:[],omissions:[{task:alternative.id,reason:'The supplied excerpts discuss findings but name no competing theory.'}]});
    return JSON.stringify({entries:payload.slots.filter(slot=>slot.id===board.nodes[0].id).map(slot=>({task:slot.id,source:'s0',passage:'p1',quote:sources[0].passages[0].text,text:'Definition grounded in the source.'}))});
  });
  assert.equal(checked.omissions.length,1);const filled=T.fill(M,board,checked);assert.equal(filled.templateOmissions.length,1);assert.equal(filled.templateOmissions[0].title,'2. Alternative view');assert.ok(!filled.nodes.some(n=>n.title==='2. Alternative view'));
  assert.deepEqual(M.validate(filled),filled);
});

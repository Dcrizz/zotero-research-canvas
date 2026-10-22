(function(root){
  'use strict';
  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
  function quote(node){
    if(node.evidenceQuote)return normalize(node.evidenceQuote);
    if(!node.synthesis)return '';
    const match=/[“"]([^”"]{12,600})[”"]/.exec(node.text);
    return match?normalize(match[1]):'';
  }
  function assess(node,live){
    if(!node.link)return {state:'unlinked',detail:'This card has no Zotero source link.'};
    if(!live?.exists)return {state:'missing',detail:'The linked Zotero source or annotation is unavailable.'};
    const excerpt=quote(node);
    if(!excerpt)return {state:'unchecked',detail:'Source link is available; this card has no saved excerpt to compare.'};
    if(Number.isInteger(node.pageIndex)){
      if(live.pageText===null||live.pageText===undefined)return {state:'unchecked',detail:'Source is available, but its PDF page could not be checked.'};
      if(!normalize(live.pageText).includes(excerpt))return {state:'changed',detail:'The excerpt is no longer on the saved PDF page.'};
    }else{
      if(live.text===null||live.text===undefined)return {state:'unchecked',detail:'Source is available, but its text could not be checked.'};
      if(!normalize(live.text).includes(excerpt))return {state:'changed',detail:'The saved excerpt no longer matches the source text.'};
    }
    return {state:'verified',detail:'Source link and saved excerpt match'+(Number.isInteger(node.pageIndex)?' the saved PDF page.':'.')};
  }
  function coverage(board,sourceRows){
    const byCard=new Map(sourceRows.map(row=>[row.id,row])),groups=new Map();
    for(const node of board.nodes.filter(n=>n.link&&!n.junction)){
      const source=byCard.get(node.id);if(!source)continue;
      const key=source.libraryID+'/'+source.key;
      if(!groups.has(key))groups.set(key,{key,title:source.title,author:source.author||'',year:source.year||'',cards:[]});
      groups.get(key).cards.push(node.id);
    }
    const supported=edge=>/\b(support\w*|corroborat\w*|prov\w*|evidence)\b|SL ✅/i.test(edge.label);
    const supportMap=new Map();for(const edge of board.edges.filter(supported))for(const [from,to] of [[edge.source,edge.target],[edge.target,edge.source]]){if(!supportMap.has(from))supportMap.set(from,[]);supportMap.get(from).push(to);}
    const claims=board.nodes.filter(n=>n.synthesisType==='Claim'||n.organization?.evidenceRole==='claim').map(node=>{
      const supportIDs=supportMap.get(node.id)||[];
      const related=[node.id,...supportIDs];
      const sourceKeys=[...new Set(related.map(id=>byCard.get(id)).filter(Boolean).map(row=>row.libraryID+'/'+row.key))];
      return {id:node.id,title:node.title,sources:sourceKeys,supportingCards:supportIDs.length};
    });
    return {groups:[...groups.values()].sort((a,b)=>b.cards.length-a.cards.length||a.title.localeCompare(b.title)),claims,linked:board.nodes.filter(n=>n.link&&!n.junction).length};
  }
  function walkthrough(board){
    const nodes=board.nodes.filter(n=>!n.junction&&!n.objectType&&n.kind!=='canvas'),byID=new Map(nodes.map(n=>[n.id,n])),seen=new Set(),steps=[];
    const adjacent=new Map(nodes.map(n=>[n.id,[]]));for(const edge of board.edges){if(adjacent.has(edge.source))adjacent.get(edge.source).push({edge,id:edge.target});if(adjacent.has(edge.target))adjacent.get(edge.target).push({edge,id:edge.source});}
    const role=node=>node.synthesisType||({claim:'Claim',support:'Support',critical:'Counterargument',unresolved:'Limitation'}[node.organization?.evidenceRole]||'Card');
    const kind=edge=>/support|corroborat|prov|evidence|SL ✅/i.test(edge.label)?'Support':/contradict|counter|critic|challeng|❌CL/i.test(edge.label)?'Counterargument':/limit|qualif/i.test(edge.label)?'Limitation':'Related';
    const add=(node,relation='')=>{if(!node||seen.has(node.id))return;seen.add(node.id);steps.push({id:node.id,title:node.title,role:role(node),relation});};
    const roots=nodes.filter(n=>['Claim','Definition'].includes(role(n)));
    for(const rootNode of roots){add(rootNode);
      const neighbours=adjacent.get(rootNode.id).map(({edge,id})=>({edge,node:byID.get(id),kind:kind(edge)})).filter(row=>row.node&&!seen.has(row.node.id));
      const rank={Support:0,Counterargument:1,Limitation:2,Related:3};neighbours.sort((a,b)=>rank[a.kind]-rank[b.kind]);
      for(const row of neighbours)add(row.node,row.kind+(row.edge.label?' · '+row.edge.label:''));
    }
    for(const node of nodes)add(node);
    return steps;
  }
  const api={normalize,quote,assess,coverage,walkthrough};root.CanvasResearch=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

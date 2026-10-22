(function(root){
  'use strict';
  function render(text,doc=document){
    const fragment=doc.createDocumentFragment();let list=null;
    const inline=(host,value)=>{const re=/(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*)/g;let start=0,match;while((match=re.exec(value))){host.append(doc.createTextNode(value.slice(start,match.index)));const el=doc.createElement(match[2]?'strong':'em');el.textContent=match[2]||match[3];host.append(el);start=re.lastIndex;}host.append(doc.createTextNode(value.slice(start)));};
    for(const line of String(text).split('\n')){const heading=/^(#{1,3})\s+(.*)$/.exec(line),item=/^\s*(?:([-*]) |(\d+)\. )(.*)$/.exec(line);if(item){const tag=item[1]?'ul':'ol';if(!list||list.localName!==tag){list=doc.createElement(tag);fragment.append(list);}const li=doc.createElement('li');inline(li,item[3]);list.append(li);continue;}list=null;const el=doc.createElement(heading?'h'+heading[1].length:'div');if(heading)inline(el,heading[2]);else if(line)inline(el,line);else el.append(doc.createElement('br'));fragment.append(el);}
    return fragment;
  }
  function serialize(host){
    const inline=n=>n.nodeType===3?n.textContent:n.nodeType!==1?'':n.localName==='br'?'\n':['b','strong'].includes(n.localName)?'**'+[...n.childNodes].map(inline).join('')+'**':['i','em'].includes(n.localName)?'*'+[...n.childNodes].map(inline).join('')+'*':[...n.childNodes].map(inline).join('');
    const block=n=>{if(n.nodeType===3)return n.textContent;if(n.nodeType!==1)return '';const tag=n.localName;if(tag==='ul'||tag==='ol')return [...n.children].map((li,i)=>(tag==='ul'?'- ':i+1+'. ')+inline(li).replace(/\n$/,'')).join('\n');const value=inline(n).replace(/\n$/,'');return /^h[1-3]$/.test(tag)?'#'.repeat(Number(tag[1]))+' '+value:value;};
    return [...host.childNodes].map(block).join('\n').replace(/\u00a0/g,' ').replace(/\n{3,}$/,'\n\n');
  }
  function eligible(n){return !n.junction&&(!n.kind||n.kind==='reference')&&(!n.objectType||['shape','sticky','text'].includes(n.objectType));}
  root.CanvasCardText={render,serialize,eligible};if(typeof module!=='undefined')module.exports=root.CanvasCardText;
})(globalThis);

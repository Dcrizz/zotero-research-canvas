(function (root) {
  'use strict';
  const O=root.CanvasObjects||(typeof require==='function'?require('./objects.js'):null);
  const F=root.CanvasFormats||(typeof require==='function'?require('./formats.js'):null);
  const clone = value => JSON.parse(JSON.stringify(value));
  let appearanceDefaults=null;
  function setDefaults(value){appearanceDefaults=root.CanvasSettings.validate(value);}
  const id = () => globalThis.crypto.randomUUID();
  const colour = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const finite = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
  function board(title = 'Untitled board') {
    return {version: 1, id: id(), title, mode: 'canvas', nodes: [], edges: [], view: {x: 60, y: 60, zoom: 1},...(appearanceDefaults?{appearance:clone(appearanceDefaults.canvas)}:{})};
  }
  function node(x = 0, y = 0, title = 'New idea', text = '') {
    return {id: id(), x, y, width: 240, height: 160, title, text, colour: '#fff9e8', border: '#a68b54', borderWidth: 2, fontSize: 15, link: null,...(appearanceDefaults?clone(appearanceDefaults.card):{})};
  }
  function edge(source, target) {
    return {id: id(), source, target, style: 'curved', colour: '#697b7a', thickness: 2, arrow: 'end', label: '', hierarchy: true};
  }
  function junction(x, y, colour = '#697b7a') {
    return {id: id(), x: x - 11, y: y - 11, width: 22, height: 22, title: 'Connector junction', text: '', colour, border: '#ffffff', borderWidth: 2, fontSize: 12, link: null, junction: true, shape: 'ellipse'};
  }
  function splitEdge(b, edgeID, at) {
    if (!validPoint(at)) throw Error('Choose a point on the connector.');
    const original = b.edges.find(e => e.id === edgeID);
    if (!original) throw Error('Connector unavailable.');
    const next = clone(b), downstream = next.edges.find(e => e.id === edgeID);
    const dot = junction(at.x, at.y, downstream.colour);
    const source=next.nodes.find(n=>n.id===downstream.source),target=next.nodes.find(n=>n.id===downstream.target);
    const layout=positions(b),start=source?{...layout.get(source.id),width:source.width,height:source.height}:b.edges.find(e=>e.id===edgeID).sourcePoint;
    const end=target?{...layout.get(target.id),width:target.width,height:target.height}:b.edges.find(e=>e.id===edgeID).targetPoint;
    const dx=(end.x+(end.width||0)/2)-(start.x+(start.width||0)/2),dy=(end.y+(end.height||0)/2)-(start.y+(start.height||0)/2);
    const forward=Math.abs(dx)>=Math.abs(dy)?(dx>=0?['left','right']:['right','left']):(dy>=0?['top','bottom']:['bottom','top']);
    if(b.mode==='timeline'){
      dot.junctionRole=source?.junctionRole==='spine'&&target?.junctionRole==='spine'?'spine':'branch';
      if(dot.junctionRole==='spine')dot.organization={...target.organization};
    }
    const upstream = {...clone(downstream), id: id(), target: dot.id, targetSide: forward[0], label: '', arrow: downstream.arrow === 'start' || downstream.arrow === 'both' ? 'start' : 'none'};
    delete upstream.targetPoint; delete upstream.targetOffset; delete upstream.routePoints; delete upstream.aiEvidence;
    downstream.source = dot.id; downstream.sourceSide = forward[1];
    downstream.arrow = downstream.arrow === 'both' ? 'end' : downstream.arrow === 'start' ? 'none' : downstream.arrow;
    delete downstream.sourcePoint; delete downstream.sourceOffset; delete downstream.routePoints;
    if(dot.junctionRole==='spine')next.nodes.splice(next.nodes.findIndex(n=>n.id===target.id),0,dot);else next.nodes.push(dot);
    next.edges.push(upstream);
    return {board: validate(next), junctionID: dot.id, upstreamID: upstream.id, downstreamID: downstream.id};
  }
  function validate(b) {
    if (!b || b.version !== 1 || typeof b.id !== 'string' || typeof b.title !== 'string' || !Object.hasOwn(F.modes,b.mode)
      || !Array.isArray(b.nodes) || !Array.isArray(b.edges) || b.nodes.length > 5000 || b.edges.length > 20000
      || !b.view || !finite(b.view.x, -1e7, 1e7) || !finite(b.view.y, -1e7, 1e7) || !finite(b.view.zoom, .2, 3)) throw Error('Invalid board format or unsupported version.');
    if(b.appearance!==undefined&&(!b.appearance||!colour(b.appearance.background)||!colour(b.appearance.gridColour)||!finite(b.appearance.gridSize,8,100)||typeof b.appearance.showGrid!=='boolean'))throw Error('Invalid canvas appearance.');
    if(b.mindmapDirection!==undefined&&!['horizontal','vertical'].includes(b.mindmapDirection))throw Error('Invalid mind map direction.');
    if(b.templateDraft!==undefined&&typeof b.templateDraft!=='boolean')throw Error('Invalid template state.');
    if(b.templateSourceID!==undefined&&(!b.templateDraft||typeof b.templateSourceID!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(b.templateSourceID)||typeof b.templateSourceName!=='string'||!b.templateSourceName.trim()||b.templateSourceName.length>100))throw Error('Invalid template editing source.');
    if(b.templateDefaultMode!==undefined&&(!b.templateDraft||!F.structured.has(b.templateDefaultMode)||b.mode!==b.templateDefaultMode||!Number.isSafeInteger(b.templateDefaultRevision)||b.templateDefaultRevision<0))throw Error('Invalid default template editor.');
    if(b.templateOmissions!==undefined&&(!Array.isArray(b.templateOmissions)||b.templateOmissions.length>32||b.templateOmissions.some(row=>!row||typeof row.title!=='string'||row.title.length>500||typeof row.condition!=='string'||row.condition.length>300||typeof row.reason!=='string'||row.reason.length>500||typeof row.source!=='string'||row.source.length>100)))throw Error('Invalid template omission report.');
    if (b.filters !== undefined && (!b.filters || ['tag','author','year','itemType','colourFamily'].some(k => typeof b.filters[k] !== 'string') || !['dim','hide'].includes(b.filters.mode))) throw Error('Invalid filters.');
    const ids = new Set();
    for (const n of b.nodes) {
      if(n?.templateGuide!==undefined&&(n.templateGuide!==true||n.link||n.kind||n.objectType))throw Error('Invalid template guidance card.');
      if (!n || typeof n.id !== 'string' || ids.has(n.id) || typeof n.title !== 'string' || typeof n.text !== 'string'
        || !finite(n.x, -1e7, 1e7) || !finite(n.y, -1e7, 1e7) || !finite(n.width, n.junction?16:n.objectType?24:140, 1200) || !finite(n.height, n.junction?16:n.objectType?24:100, 1200)
        || (n.junction !== undefined && (n.junction !== true || n.kind || n.objectType || n.link || n.text))
        || (n.junctionRole !== undefined && (!n.junction || !['spine','branch'].includes(n.junctionRole)))
        || !colour(n.colour) || !colour(n.border) || !finite(n.borderWidth, 0, 12) || !finite(n.fontSize, 10, 40)
        || (n.kind !== undefined && !['note', 'reference', 'annotation', 'canvas'].includes(n.kind))
        || (n.kind === 'canvas' && (!/^[a-zA-Z0-9-]{1,80}$/.test(n.canvasID)||typeof n.embedded!=='boolean'))
        || (n.kind === 'annotation' && (typeof n.annotationHTML !== 'string' || n.annotationHTML.length > 50000000 || !n.link))
        || (n.annotationKey !== undefined && !/^[A-Z0-9]{8}$/.test(n.annotationKey))
        || (n.pageIndex !== undefined && (!Number.isInteger(n.pageIndex)||n.pageIndex<0||n.pageIndex>100000))
        || (n.sourceUnavailable !== undefined && typeof n.sourceUnavailable !== 'boolean')
        || (n.evidenceQuote !== undefined && (typeof n.evidenceQuote !== 'string' || n.evidenceQuote.length<12 || n.evidenceQuote.length>600))
        || (n.synthesis !== undefined && typeof n.synthesis !== 'boolean')
        || (n.synthesisType !== undefined && !['Claim','Finding','Counterargument','Proves','Disproves','Limitation','Definition','Theory','Alternative','Justification','Example'].includes(n.synthesisType))
        || (n.topicHeading !== undefined && (typeof n.topicHeading!=='string'||n.topicHeading.length>100))
        || (n.layoutOverrides !== undefined && (!n.layoutOverrides || typeof n.layoutOverrides!=='object' || Array.isArray(n.layoutOverrides)
          || Object.entries(n.layoutOverrides).some(([key,position])=>!['mindmap-horizontal','mindmap-vertical','conceptmap'].includes(key)||!validPoint(position))))
        || (n.pattern !== undefined && !['solid', 'dashed', 'dotted'].includes(n.pattern))
        || (n.fillMode !== undefined && !['filled', 'partial', 'outline'].includes(n.fillMode))
        || (n.kind === 'note' && !n.link)
        || (n.shape !== undefined && !O.shapes.includes(n.shape))
        || (n.link !== null && (!n.link || !Number.isInteger(n.link.libraryID) || n.link.libraryID < 1 || !/^[A-Z0-9]{8}$/.test(n.link.key)))) throw Error('Invalid card data.');
      O.validate(n);
      if(n.organization!==undefined){
        const o=n.organization;
        if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!['evidenceRole','matrixRow','matrixColumn','timelineDate','literatureGroup','processStep'].includes(k))
          ||o.evidenceRole!==undefined&&!['claim','support','critical','unresolved'].includes(o.evidenceRole)
          ||['matrixRow','matrixColumn','literatureGroup'].some(k=>o[k]!==undefined&&(typeof o[k]!=='string'||o[k].length>100))
          ||o.timelineDate!==undefined&&(typeof o.timelineDate!=='string'||!/^(?:\d{4})(?:-\d{2}(?:-\d{2})?)?$/.test(o.timelineDate))
          ||o.processStep!==undefined&&(!Number.isInteger(o.processStep)||o.processStep<1||o.processStep>5000))throw Error('Invalid format placement.');
      }
      if(n.counterexampleEvidence!==undefined){const e=n.counterexampleEvidence;if(!e||(e.purpose!==undefined&&!['counterexample','support'].includes(e.purpose))||!(e.purpose==='support'?['Supports','Corroborates','Supporting example']:['Contradicts','Qualifies','Counterexample','Alternative interpretation']).includes(e.type)||['selectedCardID','selectedTitle','selectedExcerpt','candidateExcerpt','reason','model','generatedAt','selectedSignature','candidateSignature'].some(k=>typeof e[k]!=='string'||e[k].length>1800)||!Number.isFinite(Date.parse(e.generatedAt)))throw Error('Invalid counterexample evidence.');}
      if ((n.annotationColour !== undefined && !colour(n.annotationColour)) || (n.annotationColourName !== undefined && typeof n.annotationColourName !== 'string')) throw Error('Invalid annotation colour.');
      if (n.metadata !== undefined && (!n.metadata || !Array.isArray(n.metadata.tags) || n.metadata.tags.some(t => typeof t !== 'string') || ['author','year','itemType'].some(k => typeof n.metadata[k] !== 'string'))) throw Error('Invalid source metadata.');
      ids.add(n.id);
    }
    if (b.frames !== undefined) {
      if (!Array.isArray(b.frames) || b.frames.length > 500) throw Error('Invalid frames.');
      const frameIDs = new Set();
      for (const f of b.frames) {
        if (!f || typeof f.id !== 'string' || frameIDs.has(f.id) || typeof f.title !== 'string' || f.title.length > 500 || !colour(f.colour) || !colour(f.border)
          || !finite(f.x, -1e7, 1e7) || !finite(f.y, -1e7, 1e7) || !finite(f.width, 200, 1e7) || !finite(f.height, 200, 1e7)
          || !Array.isArray(f.members) || f.members.some(id => !ids.has(id)) || f.isGroup!==undefined&&typeof f.isGroup!=='boolean') throw Error('Invalid frame data.');
        frameIDs.add(f.id);
      }
    }
    if(b.connectionRejections!==undefined&&(!Array.isArray(b.connectionRejections)||b.connectionRejections.length>500||b.connectionRejections.some(r=>!r||['source','target','sourceSignature','targetSignature'].some(k=>typeof r[k]!=='string'||r[k].length>300))))throw Error('Invalid connection review history.');
    const edgeIDs = new Set();
    for (const e of b.edges) {
      if (!e || typeof e.id !== 'string' || edgeIDs.has(e.id) || !(ids.has(e.source) || e.source === null && validPoint(e.sourcePoint)) || !(ids.has(e.target) || e.target === null && validPoint(e.targetPoint)) || e.source !== null && e.source === e.target
        || !['straight', 'curved', 'elbow'].includes(e.style) || !colour(e.colour) || !finite(e.thickness, 1, 12)
        || !['none', 'start', 'end', 'both'].includes(e.arrow) || typeof e.label !== 'string' || typeof e.hierarchy !== 'boolean') throw Error('Invalid connector data.');
      for (const key of ['sourceSide', 'targetSide']) if (e[key] !== undefined && !['top', 'right', 'bottom', 'left'].includes(e[key])) throw Error('Invalid connector attachment side.');
      for(const end of ['source','target'])if(e[end+'Offset']!==undefined&&(!finite(e[end+'Offset'],0,1)||e[end]===null||!e[end+'Side']))throw Error('Invalid connector perimeter position.');
      if ((e.pattern !== undefined && !['solid', 'dashed', 'dotted'].includes(e.pattern))
        || (e.fillMode !== undefined && !['filled', 'outline'].includes(e.fillMode))
        || (e.outlineWidth !== undefined && !finite(e.outlineWidth, 0, 6))
        || (e.outlineColour !== undefined && !colour(e.outlineColour))) throw Error('Invalid connector appearance.');
      if(e.aiEvidence!==undefined&&(!e.aiEvidence||['reason','sourceExcerpt','targetExcerpt','sourceTitle','targetTitle','model','generatedAt','sourceSignature','targetSignature'].some(k=>typeof e.aiEvidence[k]!=='string'||e.aiEvidence[k].length>1800)||!Number.isFinite(Date.parse(e.aiEvidence.generatedAt))))throw Error('Invalid connection evidence.');
      if(e.routePoints!==undefined&&(!Array.isArray(e.routePoints)||e.routePoints.length>100||e.routePoints.some(p=>!validPoint(p))))throw Error('Invalid connector route points.');
      edgeIDs.add(e.id);
    }
    return clone(b);
  }
  // First incoming hierarchy edge owns placement. Cross-links and cycles remain intact.
  function layout(b) {
    const vertical=b.mindmapDirection==='vertical';
    const primary=n=>vertical?n.height:n.width,secondary=n=>vertical?n.width:n.height;
    const children = new Map(b.nodes.map(n => [n.id, []]));
    const parent = new Set();
    for (const e of b.edges) if (e.hierarchy && children.has(e.source) && children.has(e.target) && !parent.has(e.target)) {
      children.get(e.source).push(e.target); parent.add(e.target);
    }
    const nodes = new Map(b.nodes.map(n => [n.id, n]));
    const widths = [];
    const seen = new Set(); const levels = new Map();
    const order = [], roots = [], tree = new Map(b.nodes.map(n => [n.id, []]));
    function visit(start) {
      roots.push(start);
      const stack = [[start, 0, null]];
      while (stack.length) {
        const [key, depth, ancestor] = stack.pop(); if (seen.has(key)) continue;
        seen.add(key); levels.set(key, depth); order.push(key);
        if (ancestor) tree.get(ancestor).push(key);
        widths[depth] = Math.max(widths[depth] || 0, primary(nodes.get(key)));
        for (const child of [...children.get(key)].reverse()) stack.push([child, depth + 1, key]);
      }
    }
    b.nodes.filter(n => !parent.has(n.id)).forEach(n => visit(n.id));
    b.nodes.forEach(n => { if (!seen.has(n.id)) visit(n.id); });
    const columns = [0]; widths.forEach((w, i) => { columns[i + 1] = columns[i] + w + 100; });
    const spans = new Map();
    for (const key of [...order].reverse()) {
      const kids = tree.get(key);
      spans.set(key, Math.max(secondary(nodes.get(key)), kids.reduce((sum, child) => sum + spans.get(child), 0) + Math.max(0, kids.length - 1) * 35));
    }
    const result = new Map(); let y = 0;
    const stack = [];
    for (const key of roots) { stack.push([key, y]); y += spans.get(key) + 80; }
    while (stack.length) {
      const [key, top] = stack.pop();
      const cross=top+(spans.get(key)-secondary(nodes.get(key)))/2;
      result.set(key, vertical?{x:cross,y:columns[levels.get(key)]}:{x:columns[levels.get(key)],y:cross});
      let childTop = top;
      for (const child of tree.get(key)) { stack.push([child, childTop]); childTop += spans.get(child) + 35; }
    }
    return result;
  }
  function layoutKey(b){return b.mode==='mindmap'?'mindmap-'+(b.mindmapDirection||'horizontal'):b.mode==='conceptmap'?'conceptmap':null;}
  function positions(b) {
    const result=b.mode==='mindmap'?layout(b):F.structured.has(b.mode)?F.layout(b).positions:new Map(b.nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
    const key=layoutKey(b);if(key)for(const n of b.nodes){const override=n.layoutOverrides?.[key];if(override)result.set(n.id,override);}
    return result;
  }
  function formatGuides(b){return F.structured.has(b.mode)?F.layout(b).guides:[];}
  const validPoint = p => p && finite(p.x,-1e7,1e7) && finite(p.y,-1e7,1e7);
  function endpoint(e,end,nodes){return e[end]===null?{...e[end+'Point'],width:0,height:0}:nodes.get(e[end]);}
  function extraRects(b){return [...b.edges.flatMap(e=>[...(e.routePoints||[]),...(e.source===null?[e.sourcePoint]:[]),...(e.target===null?[e.targetPoint]:[])]).map(p=>({...p,width:0,height:0})),...formatGuides(b)];}
  function child(parent,side='right'){
    const n=node();for(const key of ['colour','border','borderWidth','fontSize','shape','pattern','fillMode'])if(parent[key]!==undefined)n[key]=parent[key];
    if(parent.objectType&&!['library','file'].includes(parent.objectType)){n.objectType=parent.objectType;if(parent.objectType==='table'){n.objectData={cells:parent.objectData.cells.map(r=>r.map(()=>''))};n.text=O.markdown(n);}if(parent.objectType==='wireframe')n.objectData={variant:parent.objectData.variant};}
    n.width=Math.max(parent.objectType?24:140,Math.round(parent.width*.85));n.height=Math.max(parent.objectType?24:100,Math.round(parent.height*.85));
    n.x=side==='left'?parent.x-n.width-100:side==='right'?parent.x+parent.width+100:parent.x+(parent.width-n.width)/2;
    n.y=side==='top'?parent.y-n.height-100:side==='bottom'?parent.y+parent.height+100:parent.y+(parent.height-n.height)/2;return n;
  }
  function anchor(n, side, offset=.5) {
    const t=Math.max(0,Math.min(1,offset));
    if(n.shape==='ellipse'||n.shape==='diamond'){const k=2*t-1,factor=n.shape==='ellipse'?Math.sqrt(Math.max(0,1-k*k)):1-Math.abs(k);return ['top','bottom'].includes(side)?{x:n.x+n.width*t,y:n.y+n.height/2+(side==='top'?-1:1)*n.height/2*factor}:{x:n.x+n.width/2+(side==='left'?-1:1)*n.width/2*factor,y:n.y+n.height*t};}
    return {x: n.x + (side === 'left' ? 0 : side === 'right' ? n.width : n.width * t), y: n.y + (side === 'top' ? 0 : side === 'bottom' ? n.height : n.height * t)};
  }
  function attachment(n,p){
    if(n.shape==='ellipse'||n.shape==='diamond'){
      let dx=(p.x-n.x-n.width/2)/(n.width/2),dy=(p.y-n.y-n.height/2)/(n.height/2);if(!dx&&!dy)dy=-1;
      const scale=n.shape==='ellipse'?Math.hypot(dx,dy):Math.abs(dx)+Math.abs(dy);dx/=scale;dy/=scale;
      const side=Math.abs(dy)>=Math.abs(dx)?dy<0?'top':'bottom':dx<0?'left':'right';return {side,offset:Math.max(0,Math.min(1,(['top','bottom'].includes(side)?dx:dy)/2+.5))};
    }
    const clamp=v=>Math.max(0,Math.min(1,v)),candidates=[{side:'top',offset:clamp((p.x-n.x)/n.width)},{side:'bottom',offset:clamp((p.x-n.x)/n.width)},{side:'left',offset:clamp((p.y-n.y)/n.height)},{side:'right',offset:clamp((p.y-n.y)/n.height)}];
    return candidates.reduce((best,row)=>{const a=anchor(n,row.side,row.offset),distance=Math.hypot(a.x-p.x,a.y-p.y);return distance<best.distance?{...row,distance}:best;},{distance:Infinity});
  }
  function simplifyPoints(points){const result=[];for(const p of points){const last=result.at(-1);if(last&&Math.hypot(last.x-p.x,last.y-p.y)<.01)continue;while(result.length>1){const a=result.at(-2),b=result.at(-1);if(Math.abs((b.x-a.x)*(p.y-b.y)-(b.y-a.y)*(p.x-b.x))>.01)break;if((b.x-a.x)*(p.x-b.x)+(b.y-a.y)*(p.y-b.y)<0)break;result.pop();}result.push({...p});}return result;}
  function elbowPoints(a,c,sourceSide='right',targetSide='left',route=[],sourceOffset=.5,targetOffset=.5){
    const first=anchor(a,sourceSide,sourceOffset),last=anchor(c,targetSide,targetOffset),horizontal=side=>['left','right'].includes(side);let points=[first];
    if(route.length){for(const p of [...route,last]){points.push({x:p.x,y:points.at(-1).y},{...p});}}
    else if(horizontal(sourceSide)&&horizontal(targetSide)){const mid=(first.x+last.x)/2;points.push({x:mid,y:first.y},{x:mid,y:last.y},last);}
    else if(!horizontal(sourceSide)&&!horizontal(targetSide)){const mid=(first.y+last.y)/2;points.push({x:first.x,y:mid},{x:last.x,y:mid},last);}
    else points.push(horizontal(sourceSide)?{x:last.x,y:first.y}:{x:first.x,y:last.y},last);
    return simplifyPoints(points);
  }
  function edgeGeometry(b,e,a,c){
    if(e.source===null||e.target===null||!['mindmap','conceptmap'].includes(b.mode)&&e.routePoints?.length)return {style:e.style,sourceSide:e.sourceSide||'right',targetSide:e.targetSide||'left',routePoints:e.routePoints||[]};
    if(b.mode==='mindmap'&&e.hierarchy&&e.sourceOffset===undefined&&e.targetOffset===undefined&&!a.layoutOverrides?.[layoutKey(b)]&&!c.layoutOverrides?.[layoutKey(b)]){
      const vertical=b.mindmapDirection==='vertical',forward=vertical?a.y<=c.y:a.x<=c.x;
      return {style:'straight',sourceSide:vertical?(forward?'bottom':'top'):(forward?'right':'left'),targetSide:vertical?(forward?'top':'bottom'):(forward?'left':'right'),routePoints:[]};
    }
    const dx=c.x+c.width/2-a.x-a.width/2,dy=c.y+c.height/2-a.y-a.height/2;
    let pairs=Math.abs(dy)>Math.abs(dx)?[[dy>=0?'bottom':'top',dy>=0?'top':'bottom'],[dx>=0?'right':'left',dx>=0?'left':'right']]:[[dx>=0?'right':'left',dx>=0?'left':'right'],[dy>=0?'bottom':'top',dy>=0?'top':'bottom']];
    if(a.x<c.x+c.width&&c.x<a.x+a.width&&Math.abs(dy)>=(a.height+c.height)/2)pairs=[pairs.find(pair=>['top','bottom'].includes(pair[0]))];
    else if(a.y<c.y+c.height&&c.y<a.y+a.height&&Math.abs(dx)>=(a.width+c.width)/2)pairs=[pairs.find(pair=>['left','right'].includes(pair[0]))];
    const [sourceSide,targetSide]=pairs.reduce((best,pair)=>{
      const p=anchor(a,pair[0]),q=anchor(c,pair[1]),distance=(p.x-q.x)**2+(p.y-q.y)**2;
      return distance<best.distance?{pair,distance}:best;
    },{pair:pairs[0],distance:Infinity}).pair;
    return {style:b.mode==='mindmap'?'straight':e.style,sourceSide:e.sourceSide||sourceSide,targetSide:e.targetSide||targetSide,routePoints:b.mode==='mindmap'?[]:e.routePoints||[]};
  }
  function edgePath(b,e,a,c){const route=edgeGeometry(b,e,a,c);return path(a,c,route.style,route.sourceSide,route.targetSide,route.routePoints,e.sourceOffset,e.targetOffset);}
  function path(a, c, style, sourceSide = 'right', targetSide = 'left', routePoints = [], sourceOffset=.5, targetOffset=.5) {
    const {x: x1, y: y1} = anchor(a, sourceSide,sourceOffset), {x: x2, y: y2} = anchor(c, targetSide,targetOffset);
    if(style==='elbow'){const points=elbowPoints(a,c,sourceSide,targetSide,routePoints,sourceOffset,targetOffset);return points.map((p,i)=>i?(Math.abs(p.y-points[i-1].y)<.01?'H '+p.x:'V '+p.y):'M '+p.x+' '+p.y).join(' ');}
    if(routePoints.length){
      const points=[{x:x1,y:y1},...routePoints,{x:x2,y:y2}];let d=`M ${x1} ${y1}`;
      if(style==='curved'){for(let i=1;i<points.length-1;i++){const p=points[i],next=points[i+1];d+=` Q ${p.x} ${p.y} ${(p.x+next.x)/2} ${(p.y+next.y)/2}`;}return d+` L ${x2} ${y2}`;}
      for(const p of points.slice(1))d+=style==='elbow'?` H ${p.x} V ${p.y}`:` L ${p.x} ${p.y}`;return d;
    }
    if (style === 'straight') return `M ${x1} ${y1} L ${x2} ${y2}`;
    const distance = Math.max(50, Math.hypot(x2 - x1, y2 - y1) / 2);
    const offset = side => ({left: [-distance, 0], right: [distance, 0], top: [0, -distance], bottom: [0, distance]}[side]);
    const s = offset(sourceSide), t = offset(targetSide);
    return `M ${x1} ${y1} C ${x1 + s[0]} ${y1 + s[1]} ${x2 + t[0]} ${y2 + t[1]} ${x2} ${y2}`;
  }
  function bounds(nodes, padding = 0) {
    const left = Math.min(...nodes.map(n => n.x)), top = Math.min(...nodes.map(n => n.y)) - 45;
    const right = Math.max(...nodes.map(n => n.x + n.width)), bottom = Math.max(...nodes.map(n => n.y + n.height));
    return {x: left - padding, y: top - padding, width: Math.max(200, right - left + padding * 2), height: Math.max(200, bottom - top + padding * 2)};
  }
  function droppedIDs(raw) {
    if (typeof raw !== 'string' || !/^\d+(,\d+)*$/.test(raw) || raw.length > 4000) throw Error('Drop notes or references from Zotero\'s items list.');
    const ids = [...new Set(raw.split(',').map(Number))];
    if (ids.length > 200 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw Error('Drop up to 200 valid Zotero items at a time.');
    return ids;
  }
  function labelPalette(hex) {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const background = '#' + rgb.map(v => Math.round(v * .84).toString(16).padStart(2, '0')).join('');
    const linear = rgb.map(v => { const s = v * .84 / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
    const light = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    const foreground = light > .179 ? '#000000' : '#ffffff';
    return {background, foreground, border: foreground};
  }
  function resize(rect, direction, dx, dy) {
    const width = Math.max(rect.minWidth||140, Math.min(1200, rect.width + (direction.includes('w') ? -dx : direction.includes('e') ? dx : 0)));
    const height = Math.max(rect.minHeight||100, Math.min(1200, rect.height + (direction.includes('n') ? -dy : direction.includes('s') ? dy : 0)));
    return {x: direction.includes('w') ? rect.x + rect.width - width : rect.x, y: direction.includes('n') ? rect.y + rect.height - height : rect.y, width, height};
  }
  function referenceTitle(creator, year, title) {
    const author=String(creator||'').trim(),date=String(year||'').trim(),name=String(title||'').trim()||'Untitled document';
    const citation=[author,date?'('+date+')':''].filter(Boolean).join(' ');
    return citation?citation+' - '+name:name;
  }
  function annotationLabel(hex, palette = []) {
    const colour=String(hex||'').toLowerCase(),custom=Array.isArray(palette)?palette.find(entry=>Array.isArray(entry)&&typeof entry[0]==='string'&&String(entry[1]).toLowerCase()===colour):null;
    if(custom)return custom[0].replace(/^#/,'');
    return {'#ffd400':'Yellow','#ff6666':'Red','#5fb236':'Green','#2ea8e5':'Blue','#a28ae5':'Purple','#e56eee':'Magenta','#f19837':'Orange','#aaaaaa':'Grey','#39cacf':'Teal','#b4a68e':'Brown','#ffa4c6':'Pink','#befae8':'Mint'}[colour]||'Custom colour';
  }
  const meaningFields = ['label','style','colour','thickness','arrow','hierarchy','pattern','fillMode','outlineWidth','outlineColour'];
  function meaning(id, title, edge) {
    if (typeof id !== 'string' || typeof title !== 'string' || !title.trim() || title.length > 100) throw Error('Give the connector meaning a name of up to 100 characters.');
    const value = {id, title: title.trim(), pattern:'solid', fillMode:'filled', outlineWidth:0, outlineColour:'#253d3b'};
    for (const key of meaningFields) if (edge[key] !== undefined) value[key] = edge[key];
    const b=board(),a=node(),c=node();b.nodes=[a,c];b.edges=[{...value,id:'preset-validation',source:a.id,target:c.id}];validate(b);
    return value;
  }
  function defaultMeanings() {
    return [['supports','Supporting link','SL ✅','#287b63','solid'],['contradicts','Critical link','❌CL','#b34747','dashed'],['extends','Extends','Extends','#4679a3','solid'],['example','Example of','Example of','#967536','dotted']].map(([id,title,label,colour,pattern])=>meaning(id,title,{label,colour,pattern,style:'curved',thickness:3,arrow:'end',hierarchy:false}));
  }
  function meanings(custom=[]){const values=new Map(defaultMeanings().map(type=>[type.id,type]));for(const type of custom)values.set(type.id,meaning(type.id,type.title,type));return [...values.values()];}
  const api = {setDefaults, clone, board, node, edge, junction, splitEdge, endpoint, attachment, simplifyPoints, elbowPoints, extraRects, formatGuides, layoutKey, child, validate, layout, positions, path, anchor, edgeGeometry, edgePath, droppedIDs, labelPalette, resize, bounds, meaning, meaningFields, defaultMeanings, meanings, annotationLabel, referenceTitle};
  if (typeof module !== 'undefined') module.exports = api;
  else root.CanvasModel = api;
})(globalThis);

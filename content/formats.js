(function(root){
  'use strict';
  const modes={canvas:'Freeform canvas',mindmap:'Mind map',conceptmap:'Concept Map',evidence:'Evidence map',matrix:'Comparison matrix',timeline:'Timeline',literature:'Literature map',process:'Process diagram'};
  const structured=new Set(['conceptmap','evidence','matrix','timeline','literature','process']);
  const label=value=>String(value||'').trim().slice(0,100);
  function groups(board,kind){
    const first=board.nodes[0]?.id;
    const evidenceRole=node=>{
      if(node.organization?.evidenceRole)return node.organization.evidenceRole;
      if(node.id===first)return 'claim';
      const relation=board.edges.find(e=>e.source===node.id&&e.target===first);
      if(/counter|critical|contradict|challenge|❌/i.test(relation?.label||''))return 'critical';
      if(/support|corroborat|SL ✅/i.test(relation?.label||''))return 'support';
      return 'unresolved';
    };
    if(kind==='evidence')return [
      ['support','Supporting evidence',board.nodes.filter(n=>evidenceRole(n)==='support')],
      ['claim','Claims',board.nodes.filter(n=>evidenceRole(n)==='claim')],
      ['critical','Critical evidence',board.nodes.filter(n=>evidenceRole(n)==='critical')],
      ['unresolved','Unresolved',board.nodes.filter(n=>evidenceRole(n)==='unresolved')]];
    const key=kind==='literature'?n=>label(n.organization?.literatureGroup||n.metadata?.tags?.[0])||'Ungrouped':
      n=>label(n.organization?.timelineDate||n.metadata?.year)||'Undated';
    const map=new Map();for(const node of board.nodes){const name=key(node);if(!map.has(name))map.set(name,[]);map.get(name).push(node);}
    const entries=[...map.entries()];if(kind==='timeline')entries.sort((a,b)=>a[0]==='Undated'?1:b[0]==='Undated'?-1:a[0].localeCompare(b[0]));
    else entries.sort((a,b)=>a[0].localeCompare(b[0]));return entries.map(([name,nodes])=>[name,name,nodes]);
  }
  function columns(data,kind){
    const positions=new Map(),guides=[];let x=0;
    const literature=kind==='literature',padding=literature?34:23,rowGap=literature?80:34,columnGap=literature?100:35,top=literature?92:75;
    for(const [key,title,nodes] of data){
      if(!nodes.length)continue;
      const width=Math.max(300,...nodes.map(n=>n.width+padding*2)),height=Math.max(260,top+nodes.reduce((sum,n)=>sum+n.height+rowGap,0));
      let y=top;for(const n of nodes){positions.set(n.id,{x:x+padding,y});y+=n.height+rowGap;}
      guides.push({x,y:0,width,height,label:title,kind:key});x+=width+columnGap;
    }
    return {positions,guides};
  }
  function matrix(board){
    const rows=new Map(),columns=new Map(),cells=new Map();
    for(const n of board.nodes){
      const row=label(n.organization?.matrixRow||n.metadata?.author||n.title)||'Source';
      const column=label(n.organization?.matrixColumn||n.metadata?.tags?.[0])||'Evidence';
      if(!rows.has(row))rows.set(row,rows.size);if(!columns.has(column))columns.set(column,columns.size);
      const id=row+'\u0000'+column;if(!cells.has(id))cells.set(id,[]);cells.get(id).push(n);
    }
    const widths=[...columns.keys()].map(column=>Math.max(300,...[...cells.entries()].filter(([id])=>id.endsWith('\u0000'+column)).flatMap(([,nodes])=>nodes.map(n=>n.width+32))));
    const starts=widths.map((_,i)=>260+widths.slice(0,i).reduce((sum,w)=>sum+w+18,0));
    const positions=new Map(),guides=[];let y=85;const total=260+widths.reduce((sum,w)=>sum+w+18,0);
    for(const [column,index] of columns)guides.push({x:starts[index],y:0,width:widths[index],height:60,label:column,kind:'matrix-column'});
    for(const row of rows.keys()){
      let height=150;for(const column of columns.keys()){const cell=cells.get(row+'\u0000'+column)||[];height=Math.max(height,30+cell.reduce((sum,n)=>sum+n.height+18,0));}
      guides.push({x:0,y,width:total,height,label:row,kind:'matrix-row'});
      for(const [column,index] of columns){let offset=y+18;for(const n of cells.get(row+'\u0000'+column)||[]){positions.set(n.id,{x:starts[index]+15,y:offset});offset+=n.height+18;}}
      y+=height+12;
    }
    return {positions,guides};
  }
  function timeline(board){
    if(!board.nodes.some(n=>n.junction))return columns(groups(board,'timeline'),'timeline');
    const positions=new Map(),guides=[];
    const dots=board.nodes.filter(n=>n.junction&&n.junctionRole!=='branch').sort((a,b)=>(a.organization?.timelineDate||'').localeCompare(b.organization?.timelineDate||''));
    let x=100;
    for(const dot of dots){
      const branches=board.edges.filter(e=>e.source===dot.id||e.target===dot.id).map(e=>board.nodes.find(n=>n.id===(e.source===dot.id?e.target:e.source))).filter(n=>n&&!n.junction);
      const width=Math.max(340,...branches.map(n=>n.width+90));
      positions.set(dot.id,{x:x+width/2-dot.width/2,y:370});
      let upper=100,lower=445;
      for(const node of branches){const above=upper<=lower-345;positions.set(node.id,{x:x+(width-node.width)/2,y:above?upper:lower});if(above)upper+=node.height+40;else lower+=node.height+40;}
      guides.push({x,y:0,width,height:Math.max(680,lower+60),label:dot.organization?.timelineDate||'Date',kind:'timeline'});
      x+=width+90;
    }
    for(const n of board.nodes)if(!positions.has(n.id)){positions.set(n.id,n.junction?{x:n.x,y:n.y}:{x,y:500});if(!n.junction)x+=Math.max(300,n.width+60);}
    return {positions,guides};
  }
  function process(board){
    const nodes=board.nodes.map((node,index)=>({node,index})).sort((a,b)=>(a.node.organization?.processStep??a.index+1)-(b.node.organization?.processStep??b.index+1)||a.index-b.index);
    const positions=new Map(),guides=[];let y=0;
    for(let start=0;start<nodes.length;start+=4){const row=nodes.slice(start,start+4),height=Math.max(...row.map(({node})=>node.height))+110;let x=0;
      row.forEach(({node},index)=>{const width=Math.max(300,node.width+35);guides.push({x,y,width,height,label:'Step '+(start+index+1),kind:'process-step'});positions.set(node.id,{x:x+18,y:y+70});x+=width+30;});y+=height+40;
    }
    return {positions,guides};
  }
  function conceptmap(board){
    const positions=new Map(),nodes=board.nodes;if(!nodes.length)return {positions,guides:[]};
    const arms=[[],[],[],[]],cardGap=120,centerGap=180,horizontalGap=280;
    nodes.slice(1).forEach((node,index)=>arms[index%4].push(node));
    const height=arm=>arm.reduce((sum,node)=>sum+node.height+cardGap,0);
    const upperHeight=Math.max(height(arms[0]),height(arms[1]));
    const centerX=Math.max(360,...[...arms[0],...arms[2]].map(node=>node.width+horizontalGap));
    const centerY=upperHeight+centerGap;
    positions.set(nodes[0].id,{x:centerX,y:centerY});
    for(let armIndex=0;armIndex<arms.length;armIndex++){
      const arm=arms[armIndex],left=armIndex%2===0,upper=armIndex<2;
      const x=left?centerX-horizontalGap-Math.max(0,...arm.map(node=>node.width)):centerX+nodes[0].width+horizontalGap;
      let y=upper?centerY-centerGap:centerY+nodes[0].height+centerGap;
      for(const node of arm){if(upper)y-=node.height;positions.set(node.id,{x,y});y+=upper?-cardGap:node.height+cardGap;}
    }
    return {positions,guides:[]};
  }
  function layout(board){
    if(board.mode==='conceptmap')return conceptmap(board);
    if(board.mode==='matrix')return matrix(board);
    if(board.mode==='timeline')return timeline(board);
    if(board.mode==='process')return process(board);
    if(structured.has(board.mode))return columns(groups(board,board.mode),board.mode);
    return {positions:new Map(board.nodes.map(n=>[n.id,{x:n.x,y:n.y}])),guides:[]};
  }
  const api={modes,structured,layout};root.CanvasFormats=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

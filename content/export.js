'use strict';
window.CanvasExport = (() => {
  const ns='http://www.w3.org/2000/svg', xhtml='http://www.w3.org/1999/xhtml', M=window.CanvasModel;
  function el(name,attrs={},text){const e=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
  function cleanHTML(markup){
    const parsed=new DOMParser().parseFromString(markup,'text/html');
    for(const node of parsed.querySelectorAll('script,style,iframe,object,embed,link,meta,form,svg,math,video,audio,source'))node.remove();
    for(const node of parsed.body.querySelectorAll('*')){
      for(const attr of [...node.attributes]){
        if(/^on/i.test(attr.name)||['srcset','background','formaction'].includes(attr.name)||(attr.name==='style'&&/url\s*\(|@import|expression\s*\(/i.test(attr.value)))node.removeAttribute(attr.name);
        if(['src','href','xlink:href'].includes(attr.name)){
          if(node.tagName==='IMG'){if(!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(attr.value))node.removeAttribute(attr.name);}
          else if(attr.name==='src'||!/^https?:|^zotero:|^#/i.test(attr.value))node.removeAttribute(attr.name);
        }
      }
    }
    const body=document.createElementNS(xhtml,'div');
    for(const child of [...parsed.body.childNodes])body.append(document.importNode(child,true));
    return body;
  }
  function lines(text,max){const words=text.split(/\s+/),result=[];let line='';for(const word of words){if(line&&line.length+word.length>max){result.push(line);line='';}line+=(line?' ':'')+word;}if(line)result.push(line);return result.length?result:[''];}
  function createSVG(board,{frame=null,noteHTML={},visible=()=>true,tagColour=()=>null}={}){
    const positions=M.positions(board),all=board.nodes.map(n=>({...n,...positions.get(n.id)}));
    const nodes=all.filter(n=>visible(n)&&(!frame||(n.x>=frame.x&&n.y>=frame.y&&n.x+n.width<=frame.x+frame.width&&n.y+n.height<=frame.y+frame.height)));
    const frames=frame?[frame]:(board.frames||[]).map(f=>board.mode==='mindmap'&&f.members.length?{...f,...M.bounds(all.filter(n=>f.members.includes(n.id)),40)}:f);
    if(!nodes.length&&!frames.length&&!board.edges.some(e=>e.source===null&&e.target===null))throw Error('There are no visible cards or frames to export.');
    const rect=frame?{x:frame.x-25,y:frame.y-65,width:frame.width+50,height:frame.height+90}:M.bounds([...nodes,...frames,...M.extraRects(board)],30);
    const svg=el('svg',{xmlns:ns,width:Math.ceil(rect.width),height:Math.ceil(rect.height),viewBox:[rect.x,rect.y,rect.width,rect.height].join(' ')});
    svg.append(el('title',{},board.title),el('rect',{x:rect.x,y:rect.y,width:rect.width,height:rect.height,fill:'#f0f2ed'}));
    const defs=el('defs');svg.append(defs);
    for(const f of frames){svg.append(el('rect',{x:f.x,y:f.y,width:f.width,height:f.height,rx:10,fill:f.colour,'fill-opacity':.4,stroke:f.border,'stroke-width':2}));svg.append(el('rect',{x:f.x,y:f.y-31,width:Math.min(f.width,Math.max(100,f.title.length*8+25)),height:31,rx:4,fill:f.border}));svg.append(el('text',{x:f.x+10,y:f.y-10,fill:M.labelPalette(f.border).foreground,'font-size':15,'font-family':'sans-serif'},f.title));}
    const byID=new Map(nodes.map(n=>[n.id,n]));
    for(const edge of board.edges){const a=M.endpoint(edge,'source',byID),b=M.endpoint(edge,'target',byID);if(!a||!b||frame&&[a,b].some(p=>p.width===0&&(p.x<frame.x||p.x>frame.x+frame.width||p.y<frame.y||p.y>frame.y+frame.height)))continue;const d=M.path(a,b,edge.style,edge.sourceSide,edge.targetSide,edge.routePoints),dash=edge.pattern==='dashed'?`${edge.thickness*4} ${edge.thickness*3}`:edge.pattern==='dotted'?`1 ${Math.max(5,edge.thickness*2.5)}`:'none';
      const attrs={d,fill:'none','stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':dash};
      const width=edge.thickness+(edge.fillMode==='outline'?4:0);
      if(edge.outlineWidth)svg.append(el('path',{...attrs,stroke:edge.outlineColour,'stroke-width':width+edge.outlineWidth*2}));
      const path=el('path',{...attrs,stroke:edge.colour,'stroke-width':width});
      for(const end of ['start','end'])if(edge.arrow===end||edge.arrow==='both'){const id='export-'+edge.id+'-'+end,marker=el('marker',{id,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:end==='start'?'auto-start-reverse':'auto'});marker.append(el('path',{d:'M0 0L10 5L0 10z',fill:edge.fillMode==='outline'?'#f0f2ed':edge.colour,stroke:edge.colour}));defs.append(marker);path.setAttribute('marker-'+end,'url(#'+id+')');}
      svg.append(path);if(edge.fillMode==='outline')svg.append(el('path',{...attrs,stroke:'#f0f2ed','stroke-width':edge.thickness}));
      if(edge.label){const middle=path.getPointAtLength(path.getTotalLength()/2),palette=M.labelPalette(edge.colour),measure=document.createElement('canvas').getContext('2d');measure.font='14px sans-serif';const width=Math.min(360,Math.max(60,Math.ceil(measure.measureText(edge.label).width)+30)),textLines=[];for(const line of edge.label.split('\n')){let current='';for(const word of line.split(/\s+/)){const next=current?current+' '+word:word;if(current&&measure.measureText(next).width>width-24){textLines.push(current);current=word;}else current=next;}textLines.push(current);}const height=Math.max(32,textLines.length*19+13),top=middle.y-height/2;svg.append(el('rect',{x:middle.x-width/2,y:top,width,height,rx:16,fill:palette.background,stroke:palette.border}));for(const [i,line]of textLines.entries())svg.append(el('text',{x:middle.x,y:top+20+i*19,'text-anchor':'middle',fill:palette.foreground,'font-family':'sans-serif','font-size':14},line));}
    }
    for(const n of nodes){
      if(n.objectType){svg.append(el('image',{x:n.x,y:n.y,width:n.width,height:n.height,href:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(CanvasObjects.svg(n))}));continue;}
      const group=el('g',{'data-card':n.id}),fill=tagColour(n)||n.colour;
      group.append(n.shape==='ellipse'?el('ellipse',{cx:n.x+n.width/2,cy:n.y+n.height/2,rx:n.width/2,ry:n.height/2,fill:n.fillMode==='outline'?'none':fill,'fill-opacity':n.fillMode==='partial'?.35:1,stroke:n.border,'stroke-width':n.borderWidth}):el('rect',{x:n.x,y:n.y,width:n.width,height:n.height,rx:n.shape==='rectangle'?0:9,fill:n.fillMode==='outline'?'none':fill,'fill-opacity':n.fillMode==='partial'?.35:1,stroke:n.border,'stroke-width':n.borderWidth,'stroke-dasharray':n.pattern==='dashed'?'8 6':n.pattern==='dotted'?'2 5':'none'}));
      const titleLines=lines(n.title,Math.max(10,Math.floor((n.width-20)/8))),titleHeight=titleLines.length*19+12;
      group.append(el('rect',{x:n.x,y:n.y-titleHeight,width:n.width,height:titleHeight,rx:4,fill:'#3b4147'}));
      for(const [i,line]of titleLines.entries())group.append(el('text',{x:n.x+10,y:n.y-titleHeight+20+i*19,fill:'#fff','font-size':14,'font-weight':600,'font-family':'sans-serif'},line));
      const fo=el('foreignObject',{x:n.x+10,y:n.y+10,width:n.width-20,height:n.height-(n.annotationColour?50:20)});let body;
      const rich=n.kind==='annotation'?n.annotationHTML:noteHTML[n.id];
      if(rich)body=cleanHTML(rich);else{body=document.createElementNS(xhtml,'div');body.textContent=n.text;body.style.whiteSpace='pre-wrap';}
      body.setAttribute('xmlns',xhtml);body.style.cssText+=';font-family:sans-serif;font-size:'+n.fontSize+'px;line-height:1.45;color:#253d3b;overflow:hidden;height:100%;overflow-wrap:anywhere';
      const style=document.createElementNS(xhtml,'style');style.textContent='*{box-sizing:border-box}h1{font-size:1.3em}h2{font-size:1.15em}h3{font-size:1.05em}img{max-width:100%;height:auto}p{margin:.5em 0}a{color:#0752ad}blockquote{background:white;border-left:3px solid #a7cedd;padding:12px;margin:10px 0}.canvas-tag-pill{border-radius:8px;padding:0 3px}';body.prepend(style);fo.append(body);group.append(fo);if(n.annotationColour){const width=Math.min(n.width-20,Math.max(70,(n.annotationColourName||'Highlight colour').length*7+20));group.append(el('rect',{x:n.x+12,y:n.y+n.height-30,width,height:22,rx:11,fill:n.annotationColour}));group.append(el('text',{x:n.x+22,y:n.y+n.height-15,'font-size':11,'font-family':'sans-serif',fill:M.labelPalette(n.annotationColour).foreground},n.annotationColourName||'Highlight colour'));}svg.append(group);
    }
    // Wrapped titles can rise above their cards; include their complete visible area.
    const minTitle=Math.min(rect.y,...nodes.map(n=>n.y-lines(n.title,Math.max(10,Math.floor((n.width-20)/8))).length*19-42));
    if(!frame&&minTitle<rect.y){rect.height+=rect.y-minTitle;rect.y=minTitle;svg.setAttribute('viewBox',[rect.x,rect.y,rect.width,rect.height].join(' '));svg.setAttribute('height',Math.ceil(rect.height));const background=svg.querySelector('rect');background.setAttribute('y',rect.y);background.setAttribute('height',rect.height);}
    return {svg:new XMLSerializer().serializeToString(svg),width:Math.ceil(rect.width),height:Math.ceil(rect.height),cards:nodes.length};
  }
  function dataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
  async function raster(payload,type){
    const image=new Image();image.src=await dataURL(new Blob([payload.svg],{type:'image/svg+xml'}));await image.decode();
    const scale=Math.min(2,8192/payload.width,8192/payload.height,Math.sqrt(16000000/(payload.width*payload.height))),canvas=document.createElementNS(xhtml,'canvas');canvas.width=Math.max(1,Math.round(payload.width*scale));canvas.height=Math.max(1,Math.round(payload.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return {data:canvas.toDataURL(type,.96),width:canvas.width,height:canvas.height};
  }
  async function png(payload){return (await raster(payload,'image/png')).data;}
  async function pdf(payload){
    const image=await raster(payload,'image/jpeg'),jpeg=Uint8Array.from(atob(image.data.split(',')[1]),c=>c.charCodeAt(0)),encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;
    const push=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);length+=bytes.length;};
    const object=(id,body)=>{offsets[id]=length;push(id+' 0 obj\n'+body+'\nendobj\n');};
    const scale=Math.min(.75,14400/Math.max(payload.width,payload.height)),width=payload.width*scale,height=payload.height*scale;
    push('%PDF-1.4\n% Canvas export\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+width+' '+height+'] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4]=length;push('4 0 obj\n<< /Type /XObject /Subtype /Image /Width '+image.width+' /Height '+image.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n');push(jpeg);push('\nendstream\nendobj\n');
    const content='q '+width+' 0 0 '+height+' 0 0 cm /Im0 Do Q';object(5,'<< /Length '+encoder.encode(content).length+' >>\nstream\n'+content+'\nendstream');
    const xref=length;push('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');push('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
    return dataURL(new Blob(chunks,{type:'application/pdf'}));
  }
  async function download(format,name,payload){
    const blob=format==='svg'?new Blob([payload.svg],{type:'image/svg+xml'}):await(await fetch(format==='pdf'?await pdf(payload):await png(payload))).blob(),url=URL.createObjectURL(blob),a=document.createElementNS(xhtml,'a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return {createSVG,png,pdf,download,cleanHTML};
})();

(function(root){
  'use strict';
  const defaults=()=>({version:1,obsidian:{path:'',openAfterExport:true},api:{provider:'awesome-gpt',endpoint:'https://api.openai.com/v1/chat/completions',model:''},card:{colour:'#fff9e8',border:'#a68b54',borderWidth:2,fontSize:15,width:240,height:160,shape:'rounded'},canvas:{background:'#f0f2ed',gridColour:'#bfcac2',gridSize:24,showGrid:true}});
  function validate(value){
    const d=defaults(),s=JSON.parse(JSON.stringify(value));
    if(s?.version!==1)throw Error('Unsupported Zotero Canvas settings.');
    for(const key of ['obsidian','api','card','canvas'])if(s[key]!==undefined&&(!s[key]||typeof s[key]!=='object'||Object.keys(s[key]).some(k=>!Object.hasOwn(d[key],k))))throw Error('Invalid Zotero Canvas settings.');
    const result={version:1,obsidian:{...d.obsidian,...s.obsidian},api:{...d.api,...s.api},card:{...d.card,...s.card},canvas:{...d.canvas,...s.canvas}};
    const color=v=>typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v),number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
    if(typeof result.obsidian.path!=='string'||result.obsidian.path.length>4096||typeof result.obsidian.openAfterExport!=='boolean')throw Error('Invalid Obsidian export settings.');
    if(!['awesome-gpt','openai-compatible'].includes(result.api.provider)||typeof result.api.model!=='string'||result.api.model.length>120||typeof result.api.endpoint!=='string'||result.api.endpoint.length>2048||!/^https:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/.test(result.api.endpoint))throw Error('Use an HTTPS chat completions endpoint and a valid AI model name.');
    if(!color(result.card.colour)||!color(result.card.border)||!number(result.card.borderWidth,0,12)||!number(result.card.fontSize,10,40)||!number(result.card.width,140,1200)||!number(result.card.height,100,1200)||!['rectangle','rounded','ellipse'].includes(result.card.shape))throw Error('Invalid default card appearance.');
    if(!color(result.canvas.background)||!color(result.canvas.gridColour)||!number(result.canvas.gridSize,8,100)||typeof result.canvas.showGrid!=='boolean')throw Error('Invalid default canvas appearance.');
    return result;
  }
  root.CanvasSettings={defaults,validate};if(typeof module!=='undefined')module.exports=root.CanvasSettings;
})(globalThis);

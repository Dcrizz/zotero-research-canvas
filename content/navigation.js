(function(root){
  'use strict';
  function create(){
    let entries=[],index=-1;
    const copy=route=>({...route});
    function visit(route){if(!route||!['dashboard','templates','canvas'].includes(route.kind)||route.kind==='canvas'&&typeof route.id!=='string')throw Error('Invalid canvas navigation destination.');if(JSON.stringify(entries[index])===JSON.stringify(route))return;entries=entries.slice(0,index+1);entries.push(copy(route));if(entries.length>100)entries.shift();index=entries.length-1;}
    function peek(delta){if(![-1,1].includes(delta))throw Error('Invalid navigation direction.');return entries[index+delta]?copy(entries[index+delta]):null;}
    function move(delta){if(!peek(delta))throw Error('No navigation destination is available.');index+=delta;return copy(entries[index]);}
    return {visit,peek,move,state:()=>({back:index>0,forward:index>=0&&index<entries.length-1,current:entries[index]?copy(entries[index]):null})};
  }
  root.CanvasNavigation={create};if(typeof module!=='undefined')module.exports=root.CanvasNavigation;
})(globalThis);

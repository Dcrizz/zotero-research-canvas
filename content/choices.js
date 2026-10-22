(function(root){
  'use strict';
  // Chrome XHTML native select popups can paint their option text twice.
  // Keep the select as the value/event source, and expose one HTML choice UI.
  function attach(select,{label,layout='row'}={}){
    if(select._canvasChoices)return select._canvasChoices;
    const doc=select.ownerDocument,win=doc.defaultView,make=tag=>doc.createElementNS('http://www.w3.org/1999/xhtml',tag),group=make('div');
    group.className='canvas-choices canvas-choices-'+layout;group.dataset.for=select.id;group.setAttribute('role','radiogroup');group.setAttribute('aria-label',label||select.getAttribute('aria-label')||'Choose an option');select.hidden=true;select.after(group);
    function sync(){for(const b of group.children){const chosen=b.dataset.value===select.value;b.setAttribute('aria-checked',String(chosen));b.setAttribute('aria-pressed',String(chosen));b.tabIndex=chosen?0:-1;b.disabled=select.disabled||select.options[b.dataset.index]?.disabled;}}
    function render(){group.replaceChildren();[...select.options].forEach((o,index)=>{const b=make('button');b.type='button';b.textContent=o.textContent;b.dataset.value=o.value;b.dataset.index=index;b.setAttribute('role','radio');b.onclick=()=>{if(b.disabled)return;select.value=o.value;select.dispatchEvent(new win.Event('change',{bubbles:true}));sync();};b.onkeydown=ev=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(ev.key))return;ev.preventDefault();ev.stopPropagation();const buttons=[...group.children].filter(b=>!b.disabled),i=buttons.indexOf(b),next=ev.key==='Home'?0:ev.key==='End'?buttons.length-1:(i+(['ArrowLeft','ArrowUp'].includes(ev.key)?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();buttons[next]?.click();};group.append(b);});sync();}
    select.addEventListener('change',sync);render();const api={sync,group,focus:()=>group.querySelector('[aria-checked=true]')?.focus()};select._canvasChoices=api;return api;
  }
  root.CanvasChoices={attach};if(typeof window!=='undefined')window.CanvasChoices=root.CanvasChoices;
})(globalThis);

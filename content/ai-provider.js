(function(root){
  'use strict';
  function request({endpoint,model,key,turn},makeXHR=()=>new XMLHttpRequest()){
    if(!/^https:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/.test(endpoint)||!model||!key||!turn||typeof turn.system!=='string'||!Array.isArray(turn.messages))throw Error('Invalid AI provider request.');
    const xhr=makeXHR(),promise=new Promise((resolve,reject)=>{
      xhr.open('POST',endpoint);xhr.timeout=120000;xhr.setRequestHeader('Content-Type','application/json');xhr.setRequestHeader('Authorization','Bearer '+key);
      xhr.onload=()=>{if(xhr.status<200||xhr.status>=300){reject(Error('AI provider returned HTTP '+xhr.status+'. Check the model, key and provider settings.'));return;}try{const response=JSON.parse(xhr.responseText),text=response.choices?.[0]?.message?.content;if(typeof text!=='string'||!text.trim())throw Error('AI provider returned no readable text.');resolve({text,model:response.model||model});}catch(error){reject(error);}};
      xhr.onerror=()=>reject(Error('Could not reach the AI provider.'));
      xhr.ontimeout=()=>reject(Error('AI provider timed out.'));
      xhr.onabort=()=>reject(Error('Connection analysis cancelled.'));
      xhr.send(JSON.stringify({model,messages:[{role:'system',content:turn.system},...turn.messages],stream:false}));
    });
    return {xhr,promise};
  }
  root.CanvasAI={request};if(typeof module!=='undefined')module.exports=root.CanvasAI;
})(globalThis);

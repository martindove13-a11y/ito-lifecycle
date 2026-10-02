// The real check.html in jsdom, against the real proxy and a stubbed Airtable. Walks a Sales
// respondent from the opening screen to the report and the post-report profile, then opens the
// share link as a stranger. No network, no live base. Needs: npm install jsdom
process.env.DIAG_AIRTABLE_BASE='appTEST'; process.env.DIAG_AIRTABLE_TOKEN='tok'; process.env.CLERK_ISSUER='';
const {JSDOM}=require('jsdom'); const fs=require('fs');
const store={Deals:[],Responses:[]};let n=1;
global.fetch=async(url,opts={})=>{const json=(s,b)=>({ok:s<300,status:s,json:async()=>b});
 const u=new URL(url),p=u.pathname.split('/'),table=decodeURIComponent(p[3]),recId=p[4];
 if(opts.method==='POST'){const f=JSON.parse(opts.body).fields;const r={id:'rec'+(n++),fields:f};store[table].push(r);return json(200,r);}
 if(opts.method==='PATCH'){const r=store[table].find(x=>x.id===recId);Object.assign(r.fields,JSON.parse(opts.body).fields);return json(200,r);}
 const formula=u.searchParams.get('filterByFormula')||'';const eq=[...formula.matchAll(/\{([^}]+)\}="([^"]*)"/g)];
 return json(200,{records:store[table].filter(r=>eq.every(([,k,v])=>String(r.fields[k]??'')===v))});};
const {handler}=require('../netlify/functions/diag-airtable.js');
const html=fs.readFileSync(__dirname+'/../check.html','utf8');
const ok=(l,c)=>{console.log((c?'ok   ':'FAIL ')+l);if(!c)process.exitCode=1;};
const tick=(ms)=>new Promise(r=>setTimeout(r,ms||25));
function boot(url,seed){
  const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
    if(seed) w.localStorage.setItem('diag_session',JSON.stringify(seed));
    w.fetch=async(u,o)=>{const res=await handler({httpMethod:'POST',headers:{},body:o.body});return{ok:res.statusCode<300,status:res.statusCode,json:async()=>JSON.parse(res.body)};};
    w.scrollTo=()=>{}; w.navigator.clipboard={writeText:async()=>{}};
  }});
  return dom.window;
}
(async()=>{
  let w=boot('https://x.test/check'); let d=w.document; await tick(60);
  const txt=()=>d.getElementById('root').textContent;
  const click=sel=>d.querySelector(sel).click();
  ok('intro loads from config, asks which side', /Which side are you on/.test(txt()));
  click('.opt[data-v="Supplier view"]'); click('#next'); await tick();
  ok('role screen lists the six supplier roles', d.querySelectorAll('.opt[data-g="role"]').length===6);
  click('.opt[data-v="Sales"]'); click('#next'); await tick();
  ok('deal screen: three essentials, no name field', /Three things the report needs/.test(txt())&&!/customer name/i.test(txt()));
  d.getElementById('cm').value='Subscription'; d.getElementById('cm').onchange();
  d.getElementById('rm').value='3'; d.getElementById('rm').onchange();
  d.getElementById('ry').value=String(new Date().getFullYear()+1); d.getElementById('ry').onchange();
  click('.opt[data-v="1 to 2 years"]'); ok('continue enabled once all three given', !d.getElementById('next').disabled);
  click('#next'); await tick();
  ok('consent screen present with version and honeypot', /One line of consent/.test(txt())&&!!d.getElementById('website'));
  ok('start disabled before consent', d.getElementById('next').disabled);
  click('#cbox'); await w.start(); await tick(60);
  ok('start created a deal and a response, nothing stored before consent', store.Deals.length===1&&store.Responses.length===1);
  ok('role framing names Discovery, Proposal, Contract for Sales', /Discovery · Proposal · Contract/.test(txt()));
  click('.primary'); await tick();
  ok('headline 1 of 3 with four levels and dk', /Headline 1 of 3/.test(txt())&&d.querySelectorAll('.opt[data-g="hl"]').length===5);
  click('.opt[data-v="financial"]'); await tick(); click('#next'); await tick();
  click('.opt[data-v="operational"]'); await tick(); click('#next'); await tick();
  click('.opt[data-v="technical"]'); await tick(); click('#next'); await tick();
  ok('sales question shown to Sales', /customers like them achieved/.test(txt()));
  click('.opt[data-v="No"]'); await tick(); click('#next'); await tick();
  ok('element 1 of 9, five rungs, live rung muted for Sales, dk present', /1 of 9/.test(txt())&&d.querySelectorAll('.opt[data-g="el"]').length===6&&d.querySelector('.opt[data-v="4"]').classList.contains('muted'));
  // element 1: pick rung 3, tick shows, tick it
  click('.opt[data-v="3"]'); await tick();
  ok('tick appears under a claimed rung', d.querySelector('.tick[data-for="3"]').classList.contains('show'));
  const cb=d.querySelector('.tick[data-for="3"] input'); cb.checked=true; cb.onchange(); await tick(); click('#next'); await tick();
  const pattern=[null,'dk',1,2,4,2,4,2,0]; // elements 2..9
  for(let e=2;e<=9;e++){ click('.opt[data-v="'+pattern[e-1]+'"]'); await tick(); click('#next'); await tick(80); }
  await tick(120);
  const A=JSON.parse(store.Responses[0].fields.Answers);
  ok('all nine saved server side with the tick on element 1 only', Object.keys(A).length===9&&A['1'].show_tick===true&&A['3'].show_tick===false);
  ok('report rendered with the headline line and no score', /of 9 reach where good practice expects/.test(txt())&&!/score/i.test(txt().slice(0,400)));
  ok('strip has nine rows and the five rung columns', d.querySelectorAll('.strip tbody tr').length===9&&d.querySelectorAll('.strip thead th').length===6);
  ok('gaps named: promise and exposure', /Promise gap/.test(txt())&&/Exposure gap/.test(txt())&&!/Opportunity gap/.test(txt()));
  ok('comparator hypothesis and limits lines present', /not a benchmark/.test(txt())&&/needs a facilitator/.test(txt()));
  ok('share link offered, email optional after report', /Keep this report/.test(txt())&&!!d.getElementById('pe'));
  ok('response completed with seconds and plausibility flag', !!store.Responses[0].fields['Completed at']&&typeof store.Responses[0].fields['Seconds to complete']==='number');
  d.getElementById('pe').value='sales@acme.com'; d.getElementById('ps').value='Enterprise'; d.getElementById('psave').onclick(); await tick(80);
  ok('profile saved email and size band', store.Responses[0].fields.Email==='sales@acme.com'&&store.Deals[0].fields['Size band']==='Enterprise'&&/Saved\./.test(txt()));
  const res=store.Responses[0].fields['Results token'];
  // stranger opens the share link
  w=boot('https://x.test/check?r='+res); d=w.document; await tick(80);
  const t2=d.getElementById('root').textContent;
  ok('share link shows the report only, no email field, no session', /shared report/.test(t2)&&!d.getElementById('pe')&&!/sess_/.test(d.documentElement.innerHTML)&&!/acme\.com/.test(t2));
  // resume path
  w=boot('https://x.test/check',{sessionToken:'sess_x',dealCode:'D-TEST',headlines:{},answers:{},perspective:'Supplier view',role:'Sales'}); d=w.document; await tick(60);
  ok('resume screen offered when a session is saved on the device', /check in progress/.test(d.getElementById('root').textContent));
  console.log(process.exitCode?'\nSOME CHECKS FAILED':'\nALL E2E CHECKS PASS');
})().catch(e=>{console.error('E2E FAIL',e);process.exit(1);});

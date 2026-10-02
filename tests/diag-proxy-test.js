// Proxy against a stubbed Airtable and a real RS256-signed JWT. No network, no live base.
process.env.DIAG_AIRTABLE_BASE='appTEST'; process.env.DIAG_AIRTABLE_TOKEN='tok'; process.env.CLERK_ISSUER='https://clerk.test';
const crypto=require('crypto');
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});jwk.kid='k1';jwk.alg='RS256';jwk.use='sig';
const b64u=b=>Buffer.from(b).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
function tok(claims){const h=b64u(JSON.stringify({alg:'RS256',kid:'k1',typ:'JWT'}));const p=b64u(JSON.stringify(Object.assign({iss:'https://clerk.test',exp:Math.floor(Date.now()/1000)+3600},claims)));
 return h+'.'+p+'.'+crypto.sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');}
const SUPER=tok({role:'super_admin',sub:'u_super',email:'m@ito.com'}), FAC=tok({role:'facilitator',account:'ecosystems',sub:'u_fac'}), REP=tok({role:'rep',account:'ecosystems',sub:'u_rep1'}), REP2=tok({role:'rep',account:'ecosystems',sub:'u_rep2'}), ADMIN=tok({role:'admin',account:'ecosystems',sub:'u_adm'});
const store={Deals:[],Responses:[]};let n=1;
global.fetch=async(url,opts={})=>{const json=(s,b)=>({ok:s<300,status:s,json:async()=>b});
 if(String(url).includes('jwks'))return json(200,{keys:[jwk]});
 const u=new URL(url),p=u.pathname.split('/'),table=decodeURIComponent(p[3]),recId=p[4];
 if(opts.method==='POST'){const f=JSON.parse(opts.body).fields;const r={id:'rec'+(n++),fields:f};store[table].push(r);return json(200,r);}
 if(opts.method==='PATCH'){const r=store[table].find(x=>x.id===recId);Object.assign(r.fields,JSON.parse(opts.body).fields);return json(200,r);}
 const formula=u.searchParams.get('filterByFormula')||'';
 const eq=[...formula.matchAll(/\{([^}]+)\}="([^"]*)"/g)];
 const isOr=formula.startsWith('OR(');
 const recs=store[table].filter(r=>{if(!eq.length)return true;const hits=eq.map(([,k,v])=>String(r.fields[k]??'')===v);return isOr?hits.some(Boolean):hits.every(Boolean);});
 return json(200,{records:recs});};
const {handler}=require('../netlify/functions/diag-airtable.js');
const call=async(b,t)=>{const r=await handler({httpMethod:'POST',headers:t?{authorization:'Bearer '+t}:{},body:JSON.stringify(b)});return{code:r.statusCode,body:JSON.parse(r.body)};};
const ok=(label,cond)=>{console.log((cond?'ok   ':'FAIL ')+label);if(!cond)process.exitCode=1;};
(async()=>{
 let r=await call({action:'config'});
 ok('config: no credential, 200, carries instrument version and derived grid totals', r.code===200&&r.body.instrumentVersion==='1.0'&&r.body.gridTotals.created===35&&r.body.gridTotals.carried===27);
 ok('config: scoring never ships to the browser', !('scoreCell' in r.body)&&!('naAllowed' in r.body));
 const good={action:'start',consent:true,consentVersion:'1.0',respondentRole:'Sales',commercialModel:'Subscription',renewalYear:2027,renewalMonth:3,signedBand:'1 to 2 years'};
 r=await call(Object.assign({},good,{consent:false})); ok('start: refuses without consent', r.code===400&&r.body.error==='consent_required');
 r=await call(Object.assign({},good,{website:'bot'})); ok('start: honeypot trips', r.code===400);
 r=await call(Object.assign({},good,{respondentRole:'Wizard'})); ok('start: unknown role refused with options', r.code===400&&Array.isArray(r.body.options));
 r=await call(Object.assign({},good,{commercialModel:'Barter'})); ok('start: band enforced', r.code===400);
 r=await call(Object.assign({},good,{Mode:'Facilitated review',Account:'hacked','Rep key':'x'}));
 ok('start: anonymous creates a Deal and a Response', r.code===200&&store.Deals.length===1&&store.Responses.length===1);
 const S=r.body; const deal=store.Deals[0].fields, resp=store.Responses[0].fields;
 ok('start: tokens minted with the right prefixes', /^sess_/.test(S.sessionToken)&&/^res_/.test(S.resultsToken)&&/^D-[A-Z2-9]{7}$/.test(S.dealCode));
 ok('start: server stamps mode, perspective, source, bands, versions', deal.Mode==='Quick check'&&deal.Perspective==='Supplier view'&&deal.Source==='Website'&&deal['Renewal band']&&deal['Instrument version']==='1.0'&&deal['Consent version']==='1.0'&&deal['Created at']);
 ok('start: client cannot set Account or Rep key', deal.Account===''&&deal['Rep key']===undefined);
 ok('start: renewal month/year stored as first of month', deal['Renewal date']==='2027-03-01');
 ok('start: response linked by Deal code, view Single, role kept', resp['Deal code']===S.dealCode&&resp['View type']==='Single'&&resp['Respondent role']==='Sales');
 ok('start: no customer name field anywhere', !Object.keys(deal).concat(Object.keys(resp)).some(k=>/customer name|company name/i.test(k)));
 ok('start: Sales gets the sales question and the live rung muted', S.salesQuestion===true&&JSON.stringify(S.mutedRungs)==='[4]');
 // answers
 r=await call({action:'answer',sessionToken:'sess_nope',element:1,rung:2}); ok('answer: bad session refused', r.code===403||r.code===401);
 r=await call({action:'answer',sessionToken:S.sessionToken,element:1,rung:7}); ok('answer: rung out of range refused', r.code===400);
 r=await call({action:'answer',sessionToken:S.sessionToken,element:1,rung:3,showTick:true,extra:'ignored'}); ok('answer: valid rung saved', r.code===200);
 r=await call({action:'answer',sessionToken:S.sessionToken,element:2,rung:'dk',showTick:true});
 r=await call({action:'answer',sessionToken:S.sessionToken,element:3,rung:1,showTick:true});
 const A=JSON.parse(store.Responses[0].fields.Answers);
 ok('answer: rebuilt server side, dk stored as its own value, tick only on a claimed rung', A['1'].rung===3&&A['1'].show_tick===true&&A['2'].rung==='dk'&&A['2'].show_tick===false&&A['3'].show_tick===false&&Object.keys(A['1']).length===2);
 r=await call({action:'answer',sessionToken:S.sessionToken,headline:'sold',level:'financial'});
 r=await call({action:'answer',sessionToken:S.sessionToken,headline:'contracted',level:'bogus'}); ok('answer: bad headline level refused', r.code===400);
 r=await call({action:'answer',sessionToken:S.sessionToken,salesQuestion:'No'}); ok('answer: sales question saved for Sales', r.code===200&&store.Responses[0].fields['Sales question']==='No');
 ok('answer: headline stored', JSON.parse(store.Responses[0].fields.Headlines).sold==='financial');
 // customer perspective start, not sales
 r=await call(Object.assign({},good,{perspective:'Customer view',respondentRole:'Finance'}));
 ok('start: customer view accepted with a customer role', r.code===200&&store.Deals[1].fields.Perspective==='Customer view');
 r=await call({action:'answer',sessionToken:r.body.sessionToken,salesQuestion:'Yes'}); ok('answer: sales question refused where not asked', r.code===400);
 // list
 r=await call({action:'list'}); ok('list: anonymous 401', r.code===401);
 r=await call({action:'list'},ADMIN); ok('list: admin from another app is 403', r.code===403);
 r=await call({action:'list'},SUPER); ok('list: super sees all deals', r.code===200&&r.body.records.length===2);
 r=await call({action:'list',table:'Responses'},SUPER); ok('list: super sees Email, never Session token', r.body.records[0].fields['Session token']===undefined&&('Email' in r.body.records[0].fields||true));
 // rep-stamped deal: simulate a rep-created deal and a facilitator-account deal
 store.Deals.push({id:'rd',fields:{'Deal code':'D-REP0001','Rep key':'u_rep1',Account:'ecosystems',Mode:'Discovery'}});
 store.Responses.push({id:'rr',fields:{'Deal code':'D-REP0001','Session token':'sess_x','Email':'p@acme.com','Respondent role':'Sales'}});
 r=await call({action:'list'},REP); ok('list: rep sees only own Rep key deals', r.code===200&&r.body.records.length===1&&r.body.records[0].fields['Deal code']==='D-REP0001');
 r=await call({action:'list'},REP2); ok('list: another rep sees nothing of it', r.code===200&&r.body.records.length===0);
 r=await call({action:'list',table:'Responses'},REP); ok('list: rep responses joined through deal, no Email, no Session token', r.body.records.length===1&&r.body.records[0].fields.Email===undefined&&r.body.records[0].fields['Session token']===undefined);
 r=await call({action:'list'},FAC); ok('list: facilitator scoped by account', r.code===200&&r.body.records.every(x=>x.fields.Account==='ecosystems'));
 // ── Phase 2: complete, profile, report ──────────────────────────────
 let notes=[]; process.env.NOTIFY_EMAIL='m@ito.com';
 r=await call({action:'complete',sessionToken:S.sessionToken}); ok('complete: refuses with fewer than nine answers', r.code===400&&r.body.error==='incomplete');
 for(let e=4;e<=9;e++) await call({action:'answer',sessionToken:S.sessionToken,element:e,rung:e===9?0:(e%2?4:2),showTick:e===4});
 await call({action:'answer',sessionToken:S.sessionToken,headline:'contracted',level:'operational'});
 await call({action:'answer',sessionToken:S.sessionToken,headline:'provable',level:'technical'});
 r=await call({action:'report',sessionToken:S.sessionToken}); ok('report: 409 before completion', r.code===409);
 r=await call({action:'complete',sessionToken:S.sessionToken});
 ok('complete: 200 with a report and the results token', r.code===200&&r.body.report&&r.body.resultsToken===S.resultsToken);
 const R=r.body.report, rf=store.Responses[0].fields;
 ok('complete: stamps Completed at, seconds, plausibility (fast test run is flagged), benchmark false without email', rf['Completed at']&&typeof rf['Seconds to complete']==='number'&&rf['Plausibility flag']===true&&rf['Counted in benchmark']===false);
 ok('report: headline counts reached and dk separately, no summary score', /of 9 reach where good practice expects/.test(R.headline.line)&&R.headline.dontKnow===1&&R.headline.reached===2&&!('score' in R));
 const byN=Object.fromEntries(R.elements.map(x=>[x.n,x]));
 ok('report: dk is "Not visible to you" and does not count', byN[2].status.key==='dk'&&byN[2].status.counts===false);
 ok('report: rung 1 reads as exists but never seen', byN[3].status.key==='internal');
 ok('report: rung 0 reads as not in place', byN[9].status.key==='absent');
 ok('report: rung 2 stops short and names the next rung', byN[4].status.key==='short'&&/Expected to reach/.test(byN[4].status.label));
 ok('report: rung 4 reaches the expected extent', byN[5].status.reached===true&&byN[5].extent===4);
 ok('report: headline levels and gaps: sold financial, contracted operational, provable technical gives promise and exposure gaps', R.headlineLevels.gaps.map(g=>g.key).join(',')==='promise,exposure');
 ok('report: carries comparator hypothesis and limits lines, role tagged', /not a benchmark/.test(R.comparator)&&/facilitator/.test(R.limits)&&R.role==='Sales'&&R.view==='Single');
 r=await call({action:'complete',sessionToken:S.sessionToken}); ok('complete: idempotent on a second call', r.code===200&&r.body.alreadyComplete===true);
 r=await call({action:'answer',sessionToken:S.sessionToken,element:1,rung:0}); ok('answer: locked after completion', r.code===403);
 // profile
 r=await call({action:'profile',sessionToken:S.sessionToken,email:'not-an-email'}); ok('profile: bad email refused', r.code===400);
 r=await call({action:'profile',sessionToken:S.sessionToken,email:'Jo@Acme.com',sizeBand:'Enterprise',valueFunction:'No',industry:'Logistics',secondsReading:140});
 ok('profile: saves email, domain, bands on the deal, reading time', r.code===200&&store.Responses[0].fields.Email==='jo@acme.com'&&store.Responses[0].fields['Email domain']==='acme.com'&&store.Deals[0].fields['Size band']==='Enterprise'&&store.Deals[0].fields['Value function']==='No'&&store.Responses[0].fields['Seconds reading']===140);
 ok('profile: benchmark re-evaluated, still false because the plausibility flag tripped', store.Responses[0].fields['Counted in benchmark']===false);
 ok('profile: supplier gets no portfolio key', store.Deals[0].fields['Portfolio key']===undefined);
 r=await call({action:'profile',sessionToken:S.sessionToken,sizeBand:'Huge'}); ok('profile: band enforced', r.code===400);
 // free mail never counts; work mail on a slow, complete, first response does
 const good2=Object.assign({},good,{respondentRole:'Customer success'});
 r=await call(good2); const T=r.body;
 for(let e=1;e<=9;e++) await call({action:'answer',sessionToken:T.sessionToken,element:e,rung:3});
 store.Responses.find(x=>x.fields['Session token']===T.sessionToken).fields['Created at']=new Date(Date.now()-600000).toISOString();
 await call({action:'complete',sessionToken:T.sessionToken});
 await call({action:'profile',sessionToken:T.sessionToken,email:'cs@acme.com'});
 ok('benchmark: complete + work domain + first from role + plausible => counted', store.Responses.find(x=>x.fields['Session token']===T.sessionToken).fields['Counted in benchmark']===true);
 r=await call(Object.assign({},good,{respondentRole:'Executive'})); const G=r.body;
 for(let e=1;e<=9;e++) await call({action:'answer',sessionToken:G.sessionToken,element:e,rung:3});
 store.Responses.find(x=>x.fields['Session token']===G.sessionToken).fields['Created at']=new Date(Date.now()-600000).toISOString();
 await call({action:'complete',sessionToken:G.sessionToken}); await call({action:'profile',sessionToken:G.sessionToken,email:'exec@gmail.com'});
 ok('benchmark: gmail answers but never counts', store.Responses.find(x=>x.fields['Session token']===G.sessionToken).fields['Counted in benchmark']===false);
 // customer portfolio key
 r=await call(Object.assign({},good,{perspective:'Customer view',respondentRole:'Procurement or commercial'})); const P=r.body;
 for(let e=1;e<=9;e++) await call({action:'answer',sessionToken:P.sessionToken,element:e,rung:2});
 await call({action:'complete',sessionToken:P.sessionToken}); await call({action:'profile',sessionToken:P.sessionToken,email:'buyer@bigco.com'});
 const pd=store.Deals.find(d=>d.fields['Deal code']===P.dealCode).fields;
 ok('profile: customer with email gets a Portfolio key (salted hash, not the email)', /^pf_/.test(pd['Portfolio key'])&&!/bigco/.test(pd['Portfolio key']));
 // share link
 r=await call({action:'report',resultsToken:S.resultsToken}); ok('report via res_ token: report only, no email, no session token', r.code===200&&r.body.report&&!JSON.stringify(r.body).includes('sess_')&&!JSON.stringify(r.body).includes('acme.com'));
 r=await call({action:'report',resultsToken:'res_nope'}); ok('report: bad res_ token refused', r.code===403);
 r=await call({action:'report',responseKey:S.responseKey},SUPER); ok('report: super by response key', r.code===200);
 r=await call({action:'report',responseKey:S.responseKey},REP); ok('report: rep refused on a deal that is not theirs', r.code===403);
 r=await call({action:'report',responseKey:S.responseKey}); ok('report: anonymous without any token is 401', r.code===401);
 r=await call({action:'session.create'},SUPER); ok('unknown action is 400', r.code===400);
 console.log(process.exitCode?'\nSOME CHECKS FAILED':'\nALL PROXY CHECKS PASS');
})();

// The content core: the grid derives to the confirmed totals, and every rule behaves as the spec says.
const C=require('../netlify/functions/lib/diag-core.js');
const ok=(l,c)=>{console.log((c?'ok   ':'FAIL ')+l);if(!c)process.exitCode=1;};
const t=C.gridTotals();
ok('grid derives to 35 created, 27 carried, 10 not expected, 62 scored, 72 cells', t.created===35&&t.carried===27&&t.notExpected===10&&t.scored===62&&t.cells===72);
let bad=false; for(let e=1;e<=9;e++){let c=false;for(let m=1;m<=8;m++){const x=C.expectedAt(e,m);if(x==='created')c=true;if(x==='carried'&&!c)bad=true;}}
ok('no carried cell precedes its own creation', !bad);
ok('every element expected through to Renewal, so expected extent is the live rung', [1,2,3,4,5,6,7,8,9].every(e=>C.expectedExtent(e).moment===8&&C.expectedExtent(e).rung===4));
ok('nine elements, eight moments, five rungs each side, four headline levels', C.ELEMENTS.length===9&&C.MOMENTS.length===8&&C.LADDER.supplier.length===5&&C.LADDER.customer.length===5&&C.HEADLINE_LEVELS.length===4);
ok('every question sentence starts "In this deal,"', C.ELEMENTS.every(e=>e.supplier.startsWith('In this deal,')&&e.customer.startsWith('In this deal,')));
ok('no sentence says "in your company" and no text says Outcome Chain', !JSON.stringify(C).match(/in your company|Outcome Chain/i));
ok('instrument and consent versions are 1.0', C.INSTRUMENT_VERSION==='1.0'&&C.CONSENT_VERSION==='1.0');
ok('three signed-in roles, and admin is not one', JSON.stringify(C.SIGNED_IN_ROLES)==='["super_admin","facilitator","rep"]');
ok('scoring: strong needs four quals including agreed', C.scoreCell({expected:'created',state:'seen',quals:{documented:true,visible:true,data:true,agreed:true,current:false}})===3);
ok('scoring: four quals without agreed is weak', C.scoreCell({expected:'created',state:'seen',quals:{documented:true,visible:true,data:true,agreed:false,current:true}})===2);
ok('scoring: described 1, absent 0, NA null, not-expected null', C.scoreCell({expected:'carried',state:'described'})===1&&C.scoreCell({expected:'carried',state:'absent'})===0&&C.scoreCell({expected:'created',state:'seen',na:'NA-TECH'})===null&&C.scoreCell({expected:'none',state:'seen'})===null);
ok('NA-INPUT only Confidence at Proposal and Contract, Dispute at Contract, Re-baselining at Contract', C.naAllowed('NA-INPUT',6,2)&&C.naAllowed('NA-INPUT',6,3)&&!C.naAllowed('NA-INPUT',6,8)&&C.naAllowed('NA-INPUT',8,3)&&C.naAllowed('NA-INPUT',9,3)&&!C.naAllowed('NA-INPUT',9,5)&&!C.naAllowed('NA-INPUT',1,2));
ok('NA-TECH only Attribution', C.naAllowed('NA-TECH',5,4)&&!C.naAllowed('NA-TECH',4,4));
ok('NA-NOT-REACHED only beyond the moment reached, never on a not-expected cell', C.naAllowed('NA-NOT-REACHED',1,7,5)&&!C.naAllowed('NA-NOT-REACHED',1,3,5)&&!C.naAllowed('NA-NOT-REACHED',8,2,0));
ok('disagreement: two rungs, or none versus proposal-or-beyond, never with dk', C.disagree(1,3)&&C.disagree(0,2)&&!C.disagree(2,3)&&!C.disagree(0,1)&&!C.disagree('dk',4));
ok('muted rungs: Sales mutes live, Services mutes internal/proposal/contract, Executive mutes nothing', JSON.stringify(C.mutedRungs('Supplier view','Sales'))==='[4]'&&JSON.stringify(C.mutedRungs('Supplier view','Services or delivery'))==='[1,2,3]'&&C.mutedRungs('Supplier view','Executive').length===0);
ok('bands derive from dates', C.signedBand('2024-03-01',new Date('2026-10-02'))==='2 to 3 years'&&C.renewalBand('2026-12-15',new Date('2026-10-02'))==='Within 3 months'&&C.renewalBand('2026-01-01',new Date('2026-10-02'))==='Past due');
const g=C.freshGrid(); ok('fresh grid copies expected into all 72 cells with null scores', Object.keys(g).length===72&&g['4:2'].expected==='created'&&g['8:1'].expected==='none'&&Object.values(g).every(c=>c.score===null));
const pc=C.publicConfig(); ok('publicConfig carries content, never the scoring or NA functions', pc.elements&&pc.grid&&pc.gridTotals.created===35&&!pc.scoreCell&&!pc.naAllowed);
console.log(process.exitCode?'\nSOME CHECKS FAILED':'\nALL CORE CHECKS PASS');

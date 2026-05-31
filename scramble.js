// scramble.js — WCA scramble generation (17 official events, Magic removed)
'use strict';

const EVENTS = {
  '333':   { name:'3×3×3',          gen:()=>sc333(20)    },
  '222':   { name:'2×2×2',          gen:()=>sc222(9)     },
  '444':   { name:'4×4×4',          gen:()=>sc444()      },
  '555':   { name:'5×5×5',          gen:()=>sc555()      },
  '666':   { name:'6×6×6',          gen:()=>sc666()      },
  '777':   { name:'7×7×7',          gen:()=>sc777()      },
  '333oh': { name:'3×3 One-Handed', gen:()=>sc333(20)    },
  '333fm': { name:'Fewest Moves',   gen:()=>scFMC()      },
  '333bf': { name:'3×3 Blind',      gen:()=>sc333(20)    },
  '444bf': { name:'4×4 Blind',      gen:()=>sc444()      },
  '555bf': { name:'5×5 Blind',      gen:()=>sc555()      },
  'minx':  { name:'Megaminx',       gen:()=>scMinx()     },
  'pyram': { name:'Pyraminx',       gen:()=>scPyram()    },
  'clock': { name:'Clock',          gen:()=>scClock()    },
  'skewb': { name:'Skewb',          gen:()=>scSkewb()    },
  'sq1':   { name:'Square-1',       gen:()=>scSq1()      },
  'mminx': { name:'Kilominx',       gen:()=>scMinx()     },
};

function generateScramble(code) { return EVENTS[code]?.gen() || sc333(20); }
function getEventName(code)     { return EVENTS[code]?.name || code; }

const rnd = n  => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

function sc333(len) {
  const F=['U','D','F','B','L','R'], M=['','\'','2'], AX={U:0,D:0,F:1,B:1,L:2,R:2};
  const out=[]; let la=-1, pa=-1;
  while(out.length<len){
    const f=F[rnd(6)]; const a=AX[f];
    if(a===la) continue;
    if(a===pa && out.length>=2) continue;
    out.push(f+M[rnd(3)]); pa=la; la=a;
  }
  return out.join(' ');
}
function sc222(len){
  const F=['U','F','R'],M=['','\'','2'],out=[];let l='';
  while(out.length<len){const f=F[rnd(3)];if(f===l)continue;out.push(f+M[rnd(3)]);l=f;}
  return out.join(' ');
}
function scBig(outer,inner,mods,len){
  const AX={};
  outer.forEach((f,i)=>AX[f]=Math.floor(i/2));
  inner.forEach((f,i)=>AX[f]=Math.floor(i/2));
  const pool=[...outer,...inner];const out=[];let la=-1;
  while(out.length<len){const f=pool[rnd(pool.length)];const a=AX[f];if(a===la)continue;out.push(f+mods[rnd(3)]);la=a;}
  return out.join(' ');
}
function sc444(){return scBig(['U','D','F','B','L','R'],['Uw','Dw','Fw','Bw','Lw','Rw'],['','\'','2'],40);}
function sc555(){return scBig(['U','D','F','B','L','R'],['Uw','Dw','Fw','Bw','Lw','Rw'],['','\'','2'],60);}
function sc666(){
  const all=['U','D','F','B','L','R','2Uw','2Dw','2Fw','2Bw','2Lw','2Rw','3Uw','3Dw','3Fw','3Bw','3Lw','3Rw'];
  const AX={};
  ['U','D','2Uw','2Dw','3Uw','3Dw'].forEach(m=>AX[m]=0);
  ['F','B','2Fw','2Bw','3Fw','3Bw'].forEach(m=>AX[m]=1);
  ['L','R','2Lw','2Rw','3Lw','3Rw'].forEach(m=>AX[m]=2);
  const out=[];let la=-1;
  while(out.length<80){const f=all[rnd(all.length)];const a=AX[f];if(a===la)continue;out.push(f+['','\'','2'][rnd(3)]);la=a;}
  return out.join(' ');
}
function sc777(){
  const all=['U','D','F','B','L','R','2Uw','2Dw','2Fw','2Bw','2Lw','2Rw','3Uw','3Dw','3Fw','3Bw','3Lw','3Rw'];
  const AX={};
  ['U','D','2Uw','2Dw','3Uw','3Dw'].forEach(m=>AX[m]=0);
  ['F','B','2Fw','2Bw','3Fw','3Bw'].forEach(m=>AX[m]=1);
  ['L','R','2Lw','2Rw','3Lw','3Rw'].forEach(m=>AX[m]=2);
  const out=[];let la=-1;
  while(out.length<100){const f=all[rnd(all.length)];const a=AX[f];if(a===la)continue;out.push(f+['','\'','2'][rnd(3)]);la=a;}
  return out.join(' ');
}
function scMinx(){
  const rows=[];
  for(let i=0;i<7;i++) rows.push(`${pick(['R++','R--'])} ${pick(['U++','U--'])} ${pick(['R++','R--'])} ${pick(['U++','U--'])} ${pick(['R++','R--'])} ${pick(['U++','U--'])} ${pick(['D++','D--'])}`);
  rows.push(pick(['U','U\'']));
  return rows.join('\n');
}
function scPyram(){
  const F=['U','L','R','B'],T=['u','l','r','b'],M=['','\''],out=[];let l='';
  while(out.length<9){const f=F[rnd(4)];if(f===l)continue;out.push(f+M[rnd(2)]);l=f;}
  T.forEach(t=>{if(rnd(2))out.push(t+M[rnd(2)]);});
  return out.join(' ');
}
function scClock(){
  const pins=['UR','DR','DL','UL','U','R','D','L','ALL'],out=[];
  for(const p of pins){const n=rnd(12)+1;out.push(`${p}${rnd(2)?n+'+':n+'-'}`);}
  out.push('y2');
  for(const p of pins.slice(0,8)){const n=rnd(12)+1;out.push(`${p}${rnd(2)?n+'+':n+'-'}`);}
  return out.join(' ');
}
function scSkewb(){
  const M=['R','L','U','B'],Mo=['','\''],out=[];let l='';
  while(out.length<9){const m=M[rnd(4)];if(m===l)continue;out.push(m+Mo[rnd(2)]);l=m;}
  return out.join(' ');
}
function scSq1(){
  const out=[];
  for(let i=0;i<9;i++){out.push(`(${rnd(13)-6},${rnd(13)-6})`);if(i<8)out.push('/');}
  return out.join(' ');
}
function scFMC(){ return "R' U' F "+sc333(20)+" R' U' F"; }

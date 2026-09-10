
import express from "express";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));
app.use(express.json());

const symbols = JSON.parse(fs.readFileSync("./symbols.json","utf8"));

const sleep = ms => new Promise(r=>setTimeout(r,ms));

function sma(arr, len){
  if(!arr || arr.length < len) return null;
  const v = arr.slice(-len).filter(Number.isFinite);
  if(v.length < len) return null;
  return v.reduce((a,b)=>a+b,0)/len;
}
function ema(arr, len){
  if(!arr || arr.length===0) return null;
  const k = 2/(len+1);
  let e = arr.find(Number.isFinite);
  for(const x of arr){
    if(Number.isFinite(x)) e = x*k + e*(1-k);
  }
  return e;
}
function rsi(closes, len=14){
  if(!closes || closes.length < len+1) return null;
  let gains=0, losses=0;
  for(let i=closes.length-len;i<closes.length;i++){
    const d=closes[i]-closes[i-1];
    if(d>0) gains+=d; else losses-=d;
  }
  if(losses===0) return 100;
  const rs=(gains/len)/(losses/len);
  return 100-(100/(1+rs));
}
function momentum(closes, len=10){
  if(!closes || closes.length<len+1) return null;
  const a=closes[closes.length-1], b=closes[closes.length-1-len];
  return b ? ((a/b)-1)*100 : null;
}
function trueRange(h,l,cPrev){
  return Math.max(h-l, Math.abs(h-cPrev), Math.abs(l-cPrev));
}
function adx(high, low, close, len=14){
  if(!high || high.length < len*2+2) return null;
  const tr=[], pdm=[], ndm=[];
  for(let i=1;i<high.length;i++){
    const up=high[i]-high[i-1];
    const dn=low[i-1]-low[i];
    pdm.push(up>dn && up>0 ? up : 0);
    ndm.push(dn>up && dn>0 ? dn : 0);
    tr.push(trueRange(high[i],low[i],close[i-1]));
  }
  const take=a=>a.slice(-len).reduce((x,y)=>x+y,0);
  const trn=take(tr); if(!trn) return null;
  const pdi=100*take(pdm)/trn, ndi=100*take(ndm)/trn;
  const dx=(pdi+ndi) ? 100*Math.abs(pdi-ndi)/(pdi+ndi) : 0;
  return dx;
}
function pct(a,b){ return (Number.isFinite(a)&&Number.isFinite(b)&&b!==0) ? ((a-b)/b)*100 : null; }

async function chart(symbol, interval="15m", range="5d"){
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol+".IS")}?interval=${interval}&range=${range}&includePrePost=false&events=div%2Csplits`;
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}});
  if(!r.ok) throw new Error("HTTP "+r.status);
  const j=await r.json();
  const result=j?.chart?.result?.[0];
  if(!result) throw new Error("Veri yok");
  const q=result.indicators?.quote?.[0] || {};
  const ts=result.timestamp || [];
  const rows=[];
  for(let i=0;i<ts.length;i++){
    const o=q.open?.[i], h=q.high?.[i], l=q.low?.[i], c=q.close?.[i], v=q.volume?.[i];
    if([o,h,l,c].every(Number.isFinite)) rows.push({t:ts[i]*1000,o,h,l,c,v:Number.isFinite(v)?v:0});
  }
  return {rows, meta:result.meta||{}};
}

function evaluate(symbol, intraday, daily){
  const rows=intraday.rows;
  const drows=daily.rows;
  if(rows.length<25 || drows.length<25) return null;

  const closes=rows.map(x=>x.c), highs=rows.map(x=>x.h), lows=rows.map(x=>x.l), vols=rows.map(x=>x.v);
  const dcloses=drows.map(x=>x.c);
  const last=rows.at(-1);
  const prevDaily=drows.length>=2 ? drows.at(-2).c : intraday.meta.chartPreviousClose;
  const dayPct=pct(last.c,prevDaily);

  const volAvg=sma(vols.slice(0,-1),20);
  const volRatio=volAvg ? last.v/volAvg : null;
  const rr=rsi(closes,14);
  const rrPrev=rsi(closes.slice(0,-1),14);
  const mom=momentum(closes,10);
  const momPrev=momentum(closes.slice(0,-1),10);
  const ax=adx(highs,lows,closes,14);

  const ema9=ema(closes,9), ema21=ema(closes,21);
  const ema9Prev=ema(closes.slice(0,-1),9), ema21Prev=ema(closes.slice(0,-1),21);
  const newTrend=(ema9>ema21 && ema9Prev<=ema21Prev) || (last.c>ema21 && rows.at(-2).c<=ema21Prev);
  const trendUp=ema9>ema21 && last.c>ema21;
  const rsiCross=rr>=50 && rrPrev<50;
  const momCross=mom>0 && momPrev<=0;

  const recent=rows.slice(-6);
  const buyBars=recent.filter(x=>x.c>x.o).length;
  const buyPressure=(buyBars/recent.length)*100;

  let score=0;
  if(volRatio!=null) score += Math.min(30, Math.max(0,(volRatio-1)*30));
  if(newTrend) score+=25; else if(trendUp) score+=15;
  if(momCross) score+=15; else if(mom>0) score+=8;
  if(rsiCross) score+=10; else if(rr>=50 && rr<=65) score+=7;
  if(buyPressure>=67) score+=10; else if(buyPressure>=50) score+=5;
  if(ax>=20) score+=10; else if(ax>=15) score+=5;
  score=Math.round(Math.min(100,score));

  let state="İZLE";
  if(score>=75 && (dayPct??0) < 5) state="GÜÇLÜ YENİ YÜKSELİŞ";
  else if(score>=60 && (dayPct??0) < 5) state="YENİ YÜKSELİŞ";
  else if(score>=70) state="GÜÇLÜ AL";
  if(mom<0 && rr<50) state="ZAYIFLAMA";

  return {
    symbol,
    price:+last.c.toFixed(2),
    dayPct:dayPct==null?null:+dayPct.toFixed(2),
    volume:last.v,
    volumeRatio:volRatio==null?null:+volRatio.toFixed(2),
    rsi:rr==null?null:+rr.toFixed(1),
    momentum:mom==null?null:+mom.toFixed(2),
    adx:ax==null?null:+ax.toFixed(1),
    buyPressure:+buyPressure.toFixed(0),
    trend:trendUp?"YUKARI":"AŞAĞI",
    score,
    state,
    newTrend,
    rsiCross,
    momCross,
    updatedAt:last.t
  };
}

async function scanOne(symbol){
  try{
    const [i,d]=await Promise.all([chart(symbol,"15m","5d"),chart(symbol,"1d","3mo")]);
    return evaluate(symbol,i,d);
  }catch(e){
    return {symbol,error:e.message};
  }
}

let cache={time:0,data:[],scanning:false};
async function runScan(){
  if(cache.scanning) return;
  cache.scanning=true;
  const out=[];
  const batch=8;
  for(let i=0;i<symbols.length;i+=batch){
    const part=await Promise.all(symbols.slice(i,i+batch).map(scanOne));
    out.push(...part.filter(x=>x && !x.error));
    await sleep(250);
  }
  cache={time:Date.now(),data:out,scanning:false};
}
setInterval(()=>runScan().catch(()=>{}), 60_000);
runScan().catch(()=>{});

app.get("/api/scan", async (req,res)=>{
  if(Date.now()-cache.time>90_000 && !cache.scanning) runScan().catch(()=>{});
  const data=cache.data;
  const newRise=[...data].filter(x=>["GÜÇLÜ YENİ YÜKSELİŞ","YENİ YÜKSELİŞ"].includes(x.state)).sort((a,b)=>b.score-a.score);
  const volume=[...data].filter(x=>(x.volumeRatio??0)>=1.5).sort((a,b)=>(b.volumeRatio??0)-(a.volumeRatio??0));
  const strong=[...data].filter(x=>x.score>=70).sort((a,b)=>b.score-a.score);
  const gainers=[...data].filter(x=>(x.dayPct??0)>0).sort((a,b)=>b.dayPct-a.dayPct);
  const losers=[...data].filter(x=>(x.dayPct??0)<0).sort((a,b)=>a.dayPct-b.dayPct);
  res.json({updatedAt:cache.time,scanning:cache.scanning,total:data.length,newRise,volume,strong,gainers,losers});
});

app.listen(PORT,()=>console.log(`BIST tarayıcı http://localhost:${PORT}`));

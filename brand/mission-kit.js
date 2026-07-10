/* ═══════════════════════════════════════════════════════════════════════════
   NEVERMISS BRAND KIT — one self-contained include that gives any dashboard the
   full cinematic layer: living backdrop, boot sequence, brand gate, depth
   physics + mouse-light, ambient sound design, "moment" cinematics, and a small
   instrument library (area charts, tapering funnels, MRR flight path).

   Usage — before this script:
     <script>window.BRAND={title:"MISSION CONTROL",subtitle:"NEVERMISS",
       assets:"assets/",video:"bg-command.mp4",plate:"bg-command.jpg",
       emblem:"emblem.jpg",gate:false,boot:true,accent:"#38D392"};</script>
     <script src="/brand/mission-kit.js"></script>
   Everything is additive + defensive — it never touches your data or handlers.
   Window API: Brand.moment(title,sub,kind) · Brand.area(el,vals,opts) ·
   Brand.funnel(el,steps) · Brand.flight(el,series,goal) · Brand.sfx(name) ·
   Brand.channelPlate(name)
═══════════════════════════════════════════════════════════════════════════ */
(function(){
  const C = Object.assign({
    title:"MISSION CONTROL", subtitle:"NEVERMISS", assets:"assets/",
    video:null, plate:null, emblem:null, accent:"#38D392", gate:false, boot:true, sound:true, backdrop:true, depth:true,
  }, window.BRAND||{});
  const A = (f)=> f ? (C.assets.replace(/\/?$/,"/") + f) : null;
  const $ = (s,r=document)=>r.querySelector(s);
  const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
  const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const P = new URLSearchParams(location.search);

  /* ---------- styles ---------- */
  const css = `
  :root{--bk-accent:${C.accent};--bk-ink:#F2F6F4}
  .bk-back{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
  .bk-back video,.bk-back img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55}
  .bk-wash{position:fixed;inset:0;z-index:0;pointer-events:none;
    background:linear-gradient(180deg,rgba(6,10,8,.80),rgba(6,10,8,.93) 55%,rgba(6,10,8,.985)),
      radial-gradient(120% 90% at 50% 6%,transparent 52%,rgba(0,0,0,.55))}
  .bk-scan{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.4;
    background:repeating-linear-gradient(0deg,transparent 0 2px,rgba(255,255,255,.008) 2px 3px)}
  /* depth + mouse light on panels */
  .bk-lit{position:relative;transform-style:preserve-3d;transition:transform .18s ease-out}
  .bk-lit::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .3s;
    background:radial-gradient(220px circle at var(--bkx,50%) var(--bky,50%),rgba(56,211,146,.10),transparent 60%);z-index:1}
  .bk-lit:hover::after{opacity:1}
  /* boot */
  #bk-boot{position:fixed;inset:0;z-index:9000;background:#050807;display:grid;place-items:center;transition:opacity .6s}
  #bk-boot .b-emb{width:82px;height:82px;border-radius:16px;background-size:cover;background-position:center;
    box-shadow:0 0 0 1px rgba(56,211,146,.25),0 20px 60px rgba(0,0,0,.6);opacity:0;transform:scale(.86);animation:bkEmb 1s .1s cubic-bezier(.2,.8,.2,1) forwards}
  #bk-boot .b-t{font:600 13px/1.6 var(--bk-mono,"JetBrains Mono",monospace);letter-spacing:.42em;color:#8FA39B;margin-top:22px;white-space:nowrap;overflow:hidden}
  #bk-boot .b-bar{width:150px;height:2px;background:rgba(255,255,255,.08);border-radius:2px;margin-top:20px;overflow:hidden}
  #bk-boot .b-bar i{display:block;height:100%;width:0;background:var(--bk-accent);box-shadow:0 0 10px var(--bk-accent);animation:bkBar 1.5s .25s ease-out forwards}
  #bk-boot .b-sk{position:absolute;bottom:26px;font:500 11px var(--bk-mono,monospace);letter-spacing:.2em;color:#43554E;cursor:pointer}
  @keyframes bkEmb{to{opacity:1;transform:scale(1)}}
  @keyframes bkBar{to{width:100%}}
  /* gate */
  #bk-gate{position:fixed;inset:0;z-index:8500;background:#050807;display:grid;place-items:center;text-align:center}
  #bk-gate .g-emb{width:96px;height:96px;border-radius:20px;background-size:cover;background-position:center;box-shadow:0 0 0 1px rgba(56,211,146,.22),0 24px 70px rgba(0,0,0,.6)}
  #bk-gate h4{font:700 20px/1 var(--bk-disp,"Space Grotesk",sans-serif);letter-spacing:.3em;margin:26px 0 6px;color:#F2F6F4}
  #bk-gate p{font:500 11px var(--bk-mono,monospace);letter-spacing:.3em;color:#5F726B;margin:0 0 26px}
  #bk-gate .g-row{display:flex;gap:8px;justify-content:center}
  #bk-gate input{background:#0A100D;border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;font:500 14px var(--bk-mono,monospace);letter-spacing:.2em;padding:11px 14px;width:190px;text-align:center}
  #bk-gate button{background:var(--bk-accent);color:#052015;border:0;border-radius:10px;font:700 13px var(--bk-disp,sans-serif);padding:0 18px;cursor:pointer}
  #bk-gate .g-err{color:#F2A29A;font:500 11px var(--bk-mono,monospace);height:14px;margin-top:12px;letter-spacing:.1em}
  /* moment cinematic */
  #bk-moment{position:fixed;inset:0;z-index:9500;display:none;place-items:center;background:radial-gradient(circle at 50% 45%,rgba(56,211,146,.10),rgba(4,7,5,.86) 60%);backdrop-filter:blur(6px)}
  #bk-moment.on{display:grid;animation:bkFade .4s}
  #bk-moment .m-card{text-align:center;transform:scale(.7);opacity:0;animation:bkSlam .6s cubic-bezier(.15,1.3,.4,1) .05s forwards}
  #bk-moment .m-ring{position:absolute;width:200px;height:200px;border-radius:50%;border:2px solid var(--bk-accent);opacity:.9;animation:bkRing 1.1s ease-out .1s forwards}
  #bk-moment .m-kind{font:700 12px var(--bk-mono,monospace);letter-spacing:.5em;color:var(--bk-accent)}
  #bk-moment .m-title{font:800 clamp(34px,7vw,72px)/1 var(--bk-disp,sans-serif);color:#fff;margin:14px 0;text-shadow:0 0 60px rgba(56,211,146,.5)}
  #bk-moment .m-sub{font:500 18px var(--bk-sans,sans-serif);color:#A8B8B1}
  @keyframes bkFade{from{opacity:0}} @keyframes bkSlam{to{transform:scale(1);opacity:1}}
  @keyframes bkRing{to{width:640px;height:640px;opacity:0}}
  /* sound toggle */
  #bk-snd{position:fixed;left:16px;bottom:14px;z-index:60;font:500 11px var(--bk-mono,monospace);letter-spacing:.14em;color:#5F726B;
    background:rgba(10,16,13,.7);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:5px 11px;cursor:pointer;backdrop-filter:blur(8px)}
  #bk-snd.on{color:var(--bk-accent);border-color:rgba(56,211,146,.4)}
  /* instruments */
  .bk-area{width:100%;display:block}
  .bk-cross{position:absolute;background:rgba(10,16,13,.94);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 9px;font:600 11px var(--bk-mono,monospace);color:#F2F6F4;pointer-events:none;transform:translate(-50%,-130%);white-space:nowrap;z-index:5;box-shadow:0 8px 24px rgba(0,0,0,.5)}
  @media(prefers-reduced-motion:reduce){#bk-boot .b-emb,#bk-boot .b-bar i,#bk-moment .m-card,#bk-moment .m-ring{animation-duration:.001s!important}}
  /* ── family polish — cohesive touches across every NeverMiss surface.
     :where() keeps specificity 0 so a dashboard's own rules always win. ── */
  ::selection{background:color-mix(in srgb,var(--bk-accent) 30%,transparent);color:#fff}
  :where(a,button,[role="button"],input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--bk-accent);outline-offset:2px;border-radius:6px}
  html{scroll-behavior:smooth}
  *::-webkit-scrollbar{width:11px;height:11px}
  *::-webkit-scrollbar-thumb{background:rgba(120,145,138,.26);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
  *::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--bk-accent) 55%,rgba(120,145,138,.4));background-clip:padding-box}
  *::-webkit-scrollbar-track{background:transparent}
  @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  `;
  document.head.appendChild(el("style",null,css));

  /* ---------- backdrop ---------- */
  function backdrop(){
    const b = el("div","bk-back");
    if(C.video && !reduce){
      const v=el("video");v.autoplay=v.muted=v.loop=v.playsInline=true;v.setAttribute("muted","");v.setAttribute("playsinline","");
      v.src=A(C.video); if(C.plate)v.poster=A(C.plate);
      v.onerror=()=>{ if(C.plate){b.innerHTML="";const i=el("img");i.src=A(C.plate);b.appendChild(i);} };
      b.appendChild(v);
    } else if(C.plate){ const i=el("img");i.src=A(C.plate);b.appendChild(i); }
    document.body.prepend(el("div","bk-scan"));
    document.body.prepend(el("div","bk-wash"));
    document.body.prepend(b);
  }

  /* ---------- depth physics + mouse light ---------- */
  function depth(){
    const sel=".card,.stat,.col,.deal";
    let raf=0,pending=null;
    function apply(e){
      const t=e.target.closest(sel); if(!t)return;
      t.classList.add("bk-lit");
      const r=t.getBoundingClientRect();
      const px=(e.clientX-r.left)/r.width, py=(e.clientY-r.top)/r.height;
      t.style.setProperty("--bkx",(px*100)+"%"); t.style.setProperty("--bky",(py*100)+"%");
      if(!reduce && t.matches(".card,.stat")){
        const rx=(py-.5)*-3.2, ry=(px-.5)*3.2;
        t.style.transform=`perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
      }
    }
    document.addEventListener("pointermove",e=>{pending=e;if(raf)return;raf=requestAnimationFrame(()=>{raf=0;if(pending)apply(pending);});},{passive:true});
    document.addEventListener("pointerout",e=>{const t=e.target.closest(sel);if(t&&t.matches(".card,.stat"))t.style.transform="";},{passive:true});
  }

  /* ---------- ambient sound (synthesized, no files) ---------- */
  let AC=null, sndOn=localStorage.getItem("bk-snd")==="1";
  function ctx(){ if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch{AC=null}} return AC; }
  function tone(freq,dur,type="sine",gain=.05,slideTo){
    if(!sndOn)return; const a=ctx(); if(!a)return; if(a.state==="suspended")a.resume();
    const o=a.createOscillator(),g=a.createGain(); o.type=type; o.frequency.value=freq;
    if(slideTo)o.frequency.exponentialRampToValueAtTime(slideTo,a.currentTime+dur);
    g.gain.value=gain; g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime+dur);
  }
  const SFX={click:()=>tone(680,.05,"triangle",.03),tick:()=>tone(1200,.03,"square",.015),
    demo:()=>{tone(660,.12,"sine",.05);setTimeout(()=>tone(990,.16,"sine",.05),90);},
    close:()=>{tone(180,.5,"sine",.09,90);setTimeout(()=>tone(360,.5,"sine",.05),40);setTimeout(()=>tone(540,.6,"triangle",.04),120);},
    lead:()=>tone(880,.1,"triangle",.04),error:()=>tone(160,.2,"sawtooth",.04)};
  function sndToggle(){ sndOn=!sndOn; localStorage.setItem("bk-snd",sndOn?"1":"0"); paintSnd(); if(sndOn)SFX.click(); }
  function paintSnd(){ const b=$("#bk-snd"); if(b){b.classList.toggle("on",sndOn); b.textContent=(sndOn?"◉":"◎")+" SOUND";} }

  /* ---------- moment cinematic ---------- */
  function moment(title,sub,kind="closed won"){
    let m=$("#bk-moment"); if(!m){m=el("div");m.id="bk-moment";document.body.appendChild(m);}
    m.innerHTML=`<div class="m-ring"></div><div class="m-card"><div class="m-kind">${kind.toUpperCase()}</div><div class="m-title">${title||""}</div><div class="m-sub">${sub||""}</div></div>`;
    m.classList.add("on"); SFX.close();
    // confetti-lite: a few emerald shards
    for(let i=0;i<30;i++){const s=el("div");s.style.cssText=`position:fixed;left:${50+(Math.random()-.5)*40}vw;top:44vh;width:7px;height:7px;z-index:9600;border-radius:1px;background:${["#38D392","#D9A946","#F2F6F4"][i%3]}`;document.body.appendChild(s);
      s.animate([{transform:"translate(0,0) rotate(0)",opacity:1},{transform:`translate(${(Math.random()-.5)*60}vw,${40+Math.random()*40}vh) rotate(${Math.random()*720}deg)`,opacity:0}],{duration:1400+Math.random()*1200,easing:"cubic-bezier(.2,.6,.3,1)"}).onfinish=()=>s.remove();}
    clearTimeout(moment._t); moment._t=setTimeout(()=>m.classList.remove("on"),2900);
  }

  /* ---------- instruments ---------- */
  function smooth(pts){ // catmull-rom → bezier path
    if(pts.length<2)return "";
    let d=`M${pts[0][0]},${pts[0][1]}`;
    for(let i=0;i<pts.length-1;i++){const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
      const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6,c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
      d+=`C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;}
    return d;
  }
  const uid=()=>"g"+Math.random().toString(36).slice(2,7);
  function area(container,values,opts={}){
    const w=opts.w||600,h=opts.h||120,pad=opts.pad||6,ac=opts.color||C.accent,mx=Math.max(...values,1),mn=Math.min(...values,0);
    const rng=(mx-mn)||1, X=i=>pad+i/(values.length-1)*(w-pad*2), Y=v=>h-pad-((v-mn)/rng)*(h-pad*2);
    const pts=values.map((v,i)=>[X(i),Y(v)]); const line=smooth(pts); const id=uid();
    const fill=`${line} L${X(values.length-1)},${h} L${X(0)},${h} Z`;
    container.style.position="relative";
    container.innerHTML=`<svg class="bk-area" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${ac}" stop-opacity=".28"/><stop offset="1" stop-color="${ac}" stop-opacity="0"/></linearGradient></defs>
      <path d="${fill}" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${ac}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
      <circle cx="${X(values.length-1)}" cy="${Y(values[values.length-1])}" r="2.6" fill="${ac}"/>
      <line class="bk-vline" x1="0" y1="0" x2="0" y2="${h}" stroke="${ac}" stroke-width="1" opacity="0" vector-effect="non-scaling-stroke"/>
      <circle class="bk-vdot" r="3.2" fill="#fff" opacity="0"/></svg>`;
    const svg=container.firstElementChild, vline=svg.querySelector(".bk-vline"), vdot=svg.querySelector(".bk-vdot");
    const tip=el("div","bk-cross");tip.style.opacity="0";container.appendChild(tip);
    svg.addEventListener("pointermove",e=>{const r=svg.getBoundingClientRect();const rel=(e.clientX-r.left)/r.width;
      const i=Math.max(0,Math.min(values.length-1,Math.round(rel*(values.length-1))));
      const gx=X(i);vline.setAttribute("x1",gx);vline.setAttribute("x2",gx);vline.setAttribute("opacity",".4");
      vdot.setAttribute("cx",gx);vdot.setAttribute("cy",Y(values[i]));vdot.setAttribute("opacity","1");
      tip.style.opacity="1";tip.style.left=(gx/w*r.width)+"px";tip.style.top=(Y(values[i])/h*r.height)+"px";
      tip.textContent=(opts.fmt?opts.fmt(values[i],i):values[i]);},{passive:true});
    svg.addEventListener("pointerleave",()=>{vline.setAttribute("opacity","0");vdot.setAttribute("opacity","0");tip.style.opacity="0";});
  }
  function flight(container,series,goal){ // MRR trajectory + goal line + projection cone
    const w=760,h=230,pad=30,vals=series.concat(goal?[goal]:[]),mx=Math.max(...vals,1)*1.1;
    const X=i=>pad+i/(Math.max(series.length-1,1))*(w-pad*2), Y=v=>h-pad-(v/mx)*(h-pad*2);
    const pts=series.map((v,i)=>[X(i),Y(v)]); const line=smooth(pts); const id=uid();
    const last=series[series.length-1]||0, slope=series.length>1?(series[series.length-1]-series[0])/(series.length-1):0;
    const projEnd=last+slope*Math.round(series.length*.5), px=w-pad+40;
    container.innerHTML=`<svg class="bk-area" viewBox="0 0 ${w} ${h}" style="height:230px" preserveAspectRatio="none">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.accent}" stop-opacity=".3"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></linearGradient></defs>
      ${goal?`<line x1="${pad}" y1="${Y(goal)}" x2="${w-pad}" y2="${Y(goal)}" stroke="#D9A946" stroke-dasharray="4 5" stroke-width="1" opacity=".7"/><text x="${w-pad}" y="${Y(goal)-6}" fill="#D9A946" font-size="10" text-anchor="end" font-family="var(--bk-mono,monospace)">GOAL</text>`:""}
      <path d="${line} L${X(series.length-1)},${h-pad} L${pad},${h-pad} Z" fill="url(#${id})"/>
      <path d="${line}" fill="none" stroke="${C.accent}" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <path d="M${X(series.length-1)},${Y(last)} L${px},${Y(projEnd*1.12)} L${px},${Y(projEnd*.88)} Z" fill="${C.accent}" opacity=".08"/>
      <line x1="${X(series.length-1)}" y1="${Y(last)}" x2="${px}" y2="${Y(projEnd)}" stroke="${C.accent}" stroke-dasharray="3 4" stroke-width="1.4" opacity=".5"/>
      <circle cx="${X(series.length-1)}" cy="${Y(last)}" r="3.4" fill="#fff"/></svg>`;
  }

  /* ---------- boot + gate ---------- */
  function runBoot(done){
    if(!C.boot || P.get("boot")==="0" || sessionStorage.getItem("bk-booted")){done();return;}
    sessionStorage.setItem("bk-booted","1");
    const b=el("div");b.id="bk-boot";
    b.innerHTML=`<div style="text-align:center">
      <div class="b-emb" style="background-image:url('${A(C.emblem)||""}')"></div>
      <div class="b-t"></div><div class="b-bar"><i></i></div></div><div class="b-sk">CLICK TO SKIP</div>`;
    document.body.appendChild(b);
    const t=b.querySelector(".b-t"), full=`${C.title} // ${C.subtitle}`; let i=0;
    const typ=setInterval(()=>{t.textContent=full.slice(0,++i);SFX.tick();if(i>=full.length)clearInterval(typ);},34);
    const fin=()=>{clearInterval(typ);b.style.opacity="0";setTimeout(()=>b.remove(),600);done();};
    b.querySelector(".b-sk").onclick=fin; b.onclick=fin;
    setTimeout(fin,1900);
  }
  function runGate(done){
    if(!C.gate){done();return;}
    const need = typeof C.gate==="string" ? C.gate : null;
    const stored = sessionStorage.getItem("bk-gate");
    if(need && stored===need){done();return;}
    const g=el("div");g.id="bk-gate";
    g.innerHTML=`<div><div class="g-emb" style="background-image:url('${A(C.emblem)||""}')"></div>
      <h4>${C.subtitle}</h4><p>${C.title}</p>
      <div class="g-row"><input id="bk-gp" type="${need?"password":"hidden"}" placeholder="PASSCODE" autofocus><button id="bk-ge">ENTER</button></div>
      <div class="g-err" id="bk-gerr"></div></div>`;
    document.body.appendChild(g);
    const go=()=>{const v=$("#bk-gp").value;
      if(need && v!==need){$("#bk-gerr").textContent="ACCESS DENIED";SFX.error();return;}
      sessionStorage.setItem("bk-gate",need||"1");SFX.click();g.style.transition="opacity .5s";g.style.opacity="0";setTimeout(()=>g.remove(),500);done();};
    $("#bk-ge").onclick=go; $("#bk-gp").addEventListener("keydown",e=>{if(e.key==="Enter")go()});
    if(!need)$("#bk-gp").style.display="none";
  }

  /* ---------- global click sfx ---------- */
  document.addEventListener("click",e=>{ if(e.target.closest("button,.chip,.tap button,.deal"))SFX.click(); },{passive:true});

  /* ---------- expose ---------- */
  window.Brand={moment,area,flight,sfx:(n)=>SFX[n]&&SFX[n](),channelPlate:(n)=>{document.body.dataset.plate=n||"";},config:C,
    funnel:(container,steps)=>{ // tapering funnel: steps=[{label,value},...]
      const w=600,mx=Math.max(...steps.map(s=>s.value),1),rowH=34;
      container.innerHTML=steps.map((s,i)=>{const wpct=Math.max(6,s.value/mx*100),prev=i?steps[i-1].value:s.value,cv=prev?Math.round(s.value/prev*100):100;
        return `<div style="display:flex;align-items:center;gap:12px;margin:5px 0">
          <div style="width:92px;font-size:12px;color:#A8B8B1">${s.label}</div>
          <div style="flex:1;height:26px;position:relative;display:flex;justify-content:center">
            <div style="width:${wpct}%;height:100%;background:linear-gradient(90deg,rgba(56,211,146,.34),rgba(56,211,146,.12));border-radius:5px;clip-path:polygon(0 0,100% 0,${94}% 100%,${6}% 100%);display:flex;align-items:center;justify-content:center;font:700 12px var(--bk-mono,monospace);color:#F2F6F4">${s.value}</div></div>
          <div style="width:46px;text-align:right;font:600 12px var(--bk-mono,monospace);color:#D9A946">${i?cv+"%":"—"}</div></div>`;}).join("");
    }};

  /* ---------- init sequence ---------- */
  function init(){
    document.documentElement.style.setProperty("--bk-accent",C.accent);
    if(C.backdrop)backdrop(); if(C.depth)depth();
    const snd=el("div");snd.id="bk-snd";snd.onclick=sndToggle;document.body.appendChild(snd);paintSnd();
    runGate(()=>runBoot(()=>{ document.dispatchEvent(new CustomEvent("brand:ready")); }));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init); else init();
})();

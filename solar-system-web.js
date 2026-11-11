'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const canvas = $('#sky'), ctx = canvas.getContext('2d');
  const phone = window.matchMedia('(max-width: 760px)');
  const kakaoBrowser = /KAKAOTALK/i.test(navigator.userAgent || '');
  const openedAt = performance.now();
  let showInfo = true;
  const state = {ms: Date.now(), live: true, playing: true, speed: 1, mode: phone.matches ? 1 : 0, lat: 35.08, lon: 128.89, version: 0};
  const MIN = Date.parse('1900-01-01T00:00:00+09:00'), MAX = Date.parse('2050-12-31T23:59:59+09:00');
  const rad = x => x * Math.PI / 180;
  const timeFormat = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
  const clockFormat = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Seoul', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
  let worker, busy = false, calculationFailed = false, snapshot = null, lastRequest = -Infinity, lastFrame = performance.now(), lastInfo = 0;
  let width = 500, height = 420, lastInfoHTML = '', lastTime = '';
  let pageReady = document.readyState === 'complete', firstPaint = false;
  let pendingSize = null, currentDpr = 1, sizeChangedAt = performance.now();
  if(!pageReady) window.addEventListener('load', () => { pageReady=true; sizeChangedAt=performance.now(); }, {once:true});
  function usableViewportHeight(innerHeight, visualHeight) {
    const heights=[innerHeight,visualHeight].filter(v=>Number.isFinite(v)&&v>0);
    return heights.length ? Math.floor(Math.min(...heights)) : null;
  }
  function syncKakaoViewport() {
    if(!kakaoBrowser || !phone.matches)return;
    const h=usableViewportHeight(window.innerHeight,window.visualViewport?.height);
    if(h!==null) $('main').style.height=h+'px';
    sizeChangedAt=performance.now();
  }
  if(kakaoBrowser){
    // Kakao's native bars can finish opening after the document load event.
    // Track the real visible area instead of trusting provisional svh values.
    window.addEventListener('resize',syncKakaoViewport);
    window.visualViewport?.addEventListener('resize',syncKakaoViewport);
    window.addEventListener('pageshow',syncKakaoViewport);
    syncKakaoViewport();
  }
  function error(message) { $('#error').textContent = message; $('#error').hidden = !message; }
  try {
    const workerURL = URL.createObjectURL(new Blob([window.SolarWorkerSource], {type:'text/javascript'}));
    worker = new Worker(workerURL);
    URL.revokeObjectURL(workerURL);
    worker.onmessage = ({data}) => {
      busy = false;
      if (data.id !== state.version) { lastRequest = -Infinity; return; }
      if (data.error) { calculationFailed = true; error('천문 계산 오류: ' + data.error); return; }
      snapshot = {...data, received: performance.now()};
      if (calculationFailed) { error(''); calculationFailed = false; }
    };
    worker.onerror = () => { busy = false; error('천문 계산 파일을 불러오지 못했습니다. 파일을 직접 열지 말고 HTTP 서버 또는 GitHub Pages에서 실행해 주세요.'); };
  } catch (_) { error('웹 작업자를 시작할 수 없습니다. HTTP 서버 또는 GitHub Pages에서 실행해 주세요.'); }
  function invalidate() { state.version++; snapshot = null; lastRequest = -Infinity; lastInfoHTML = ''; }
  function setTime(ms) {
    state.ms = Math.min(MAX, Math.max(MIN, ms));
    if (state.ms !== ms) { state.playing = false; error('지원 시각 범위는 1900년부터 2050년까지입니다.'); }
  }
  function controls() {
    if (phone.matches && state.mode === 0) state.mode = 1;
    if (phone.matches && state.speed === 86400) { state.speed = 1; invalidate(); }
    $('.stage').classList.toggle('info-hidden', !showInfo);
    $('#toggle-info').textContent = showInfo ? '정보 감추기' : '정보 보기';
    $('#toggle-info').setAttribute('aria-expanded', String(showInfo));
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.mode === state.mode)));
    document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === state.speed)));
    $('#pause').textContent = state.playing ? '일시정지' : '재생';
    $('#now').classList.toggle('selected', state.live);
    $('#status').textContent = state.live ? '실시간' : state.playing ? state.speed.toLocaleString() + '배속' : '일시정지';
    $('#status').classList.toggle('paused', !state.playing);
    $('.stage').classList.toggle('combined', state.mode === 0);
  }
  function pause() { state.live = false; state.playing = !state.playing; invalidate(); controls(); }
  function now() { state.live = state.playing = true; state.speed = 1; state.ms = Date.now(); error(''); invalidate(); controls(); }
  function step(seconds) { state.live = false; setTime(state.ms + seconds * 1000); invalidate(); controls(); }
  function mode(value) { state.mode = value; controls(); lastInfoHTML = ''; }
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => mode(+b.dataset.mode)));
  document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => step(+b.dataset.step)));
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
    state.live = false; state.speed = +b.dataset.speed; invalidate(); controls();
  }));
  $('#pause').addEventListener('click', pause); $('#now').addEventListener('click', now);
  function toggleInfo() { showInfo = !showInfo; controls(); }
  $('#toggle-info').addEventListener('click', toggleInfo);
  // A click also covers a normal touch tap, without toggling twice.
  canvas.addEventListener('click', () => { if (phone.matches) toggleInfo(); });
  phone.addEventListener('change', () => { controls(); lastInfoHTML = ''; });
  let lastArrow = 0;
  document.addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,select') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ' && event.target.closest('button')) return;
    const actions = {' ':pause, Home:now, '1':()=>mode(0), '2':()=>mode(1), '3':()=>mode(2)};
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (!event.repeat || performance.now() - lastArrow > 70) { step(event.key === 'ArrowLeft' ? -3600 : 3600); lastArrow = performance.now(); }
    } else if (actions[event.key]) { event.preventDefault(); if (!event.repeat) actions[event.key](); }
  });
  let locationRevision = 0;
  function location(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) { error('위도는 -90~90, 경도는 -180~180 사이로 입력해 주세요.'); return; }
    locationRevision++;
    state.lat = lat; state.lon = lon;
    error('');
    $('#latitude').value = lat.toFixed(4); $('#longitude').value = lon.toFixed(4);
    invalidate();
    try { localStorage.setItem('solar-web-location', JSON.stringify([lat,lon])); } catch (_) { /* Storage may be disabled. */ }
  }
  $('#location-form').addEventListener('submit', event => { event.preventDefault(); location(+$('#latitude').value, +$('#longitude').value); });
  function locateDevice() {
    if (!navigator.geolocation) { error('이 브라우저에서는 위치 조회를 지원하지 않습니다. 좌표를 직접 입력해 주세요.'); return; }
    const button = $('#locate'), revision = locationRevision;
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '위치 확인 중…';
    const finish = () => { button.disabled = false; button.textContent = '내 위치'; };
    navigator.geolocation.getCurrentPosition(p => {
      finish();
      // Keep a manually entered location if it changed while permission was pending.
      if (revision === locationRevision) location(p.coords.latitude, p.coords.longitude);
    }, failure => {
      finish();
      if (revision !== locationRevision) return;
      const reason = failure.code === 1 ? '위치 권한이 허용되지 않았습니다.' :
        failure.code === 3 ? '위치 확인 시간이 초과되었습니다.' : '기기의 위치를 확인하지 못했습니다.';
      error(reason + ' 기존 관측 좌표를 유지합니다. 권한을 확인한 뒤 내 위치를 다시 누르거나 좌표를 직접 입력해 주세요.');
    }, {enableHighAccuracy:true, timeout:20000, maximumAge:0});
  }
  $('#locate').addEventListener('click', locateDevice);
  try { const saved = JSON.parse(localStorage.getItem('solar-web-location')); if (Array.isArray(saved) && saved.length === 2) location(...saved); } catch (_) { /* Use default Busan coordinates. */ }
  // Request one fresh, high-accuracy device fix on phones, in either orientation.
  if (/Android|iPhone|iPod/i.test(navigator.userAgent)) locateDevice();
  new ResizeObserver(entries => {
    const box = entries[0].contentRect;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const previous = pendingSize || {width,height,dpr:currentDpr};
    if(previous.width===box.width && previous.height===box.height && previous.dpr===dpr)return;
    // Assigning canvas.width/height clears its pixels. Defer that operation
    // until the animation frame can redraw immediately, with no blank frame.
    pendingSize={width:box.width,height:box.height,dpr};
    sizeChangedAt=performance.now();
  }).observe(canvas.parentElement);
  function lerp(a,b,t) { return a + (b-a)*t; }
  function angle(a,b,t) { return a + ((b-a+540)%360-180)*t; }
  function interpolated(now) {
    if (!snapshot) return null;
    const interval = state.playing ? state.speed * 100 : 0;
    const t = interval ? Math.min(1, Math.max(0,(state.ms-snapshot.ms)/interval)) : 0;
    const out = {};
    for (const key of ['Sun','Moon','earth','moon']) {
      out[key] = {};
      for (const field of Object.keys(snapshot.current[key])) {
        const a = snapshot.current[key][field], b = snapshot.future[key][field];
        out[key][field] = ['az','lon'].includes(field) ? angle(a,b,t) : lerp(a,b,t);
      }
    }
    out.phase = angle(snapshot.current.phase, snapshot.future.phase,t);
    out.fraction = lerp(snapshot.current.fraction,snapshot.future.fraction,t);
    return out;
  }
  const tooltip = document.createElement('div');
  tooltip.className = 'body-tooltip info';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  let targets = [], pointer = null, tooltipBlocks = {};
  function updateTooltip() {
    const rect = canvas.getBoundingClientRect();
    const target = !phone.matches && pointer && targets.slice().reverse().find(t =>
      Math.hypot(pointer.x - rect.left - t.x, pointer.y - rect.top - t.y) <= Math.max(t.r, 12));
    const html = target && (target.text || tooltipBlocks[target.key]);
    tooltip.hidden = !html;
    canvas.style.cursor = target ? 'pointer' : '';
    if (!html) return;
    if (tooltip.innerHTML !== html) tooltip.innerHTML = html;
    const box = tooltip.getBoundingClientRect();
    let x = pointer.x + 18, y = pointer.y + 12;
    if (x + box.width > window.innerWidth - 8) x = pointer.x - box.width - 18;
    tooltip.style.left = Math.max(8, x) + 'px';
    tooltip.style.top = Math.max(8, Math.min(y, window.innerHeight - box.height - 8)) + 'px';
  }
  canvas.addEventListener('pointermove', event => { pointer = {x:event.clientX,y:event.clientY}; updateTooltip(); });
  canvas.addEventListener('pointerleave', () => { pointer = null; updateTooltip(); });
  function info(data) {
    const degree = n => n.toFixed(4) + '<small>°</small>';
    const event = ms => ms === null ? '오늘 없음' : clockFormat.format(new Date(ms));
    const day = [
      [['태양의 방향각',degree(data.Sun.az)],['태양의 고도각',degree(data.Sun.alt)],['일출 시각',event(snapshot.times.Sun.rise)],['일몰 시각',event(snapshot.times.Sun.set)]],
      [['달의 방향각',degree(data.Moon.az)],['달의 고도각',degree(data.Moon.alt)],['월출 시각',event(snapshot.times.Moon.rise)],['월몰 시각',event(snapshot.times.Moon.set)]]
    ];
    const orbit = [
      [['지구의 황경',degree(data.earth.lon)],['지구의 황위',degree(data.earth.lat)],['지구–태양 거리',data.earth.distance.toFixed(4)+' <small>AU</small>'],['태양의 적위',degree(data.earth.dec)]],
      [['달의 황경',degree(data.moon.lon)],['달의 황위',degree(data.moon.lat)],['지구–달 거리',Math.round(data.moon.distance).toLocaleString()+' <small>km</small>'],['달의 적위',degree(data.moon.dec)]]
    ];
    const block = (title, rows) => '<h2>'+title+'</h2><dl>'+rows.map(([label,value]) => '<div class="datum"><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('')+'</dl>';
    tooltipBlocks = {sun: block('태양의 하루',day[0]), moon: block('달의 하루',day[1]), earth: block('지구의 공전',orbit[0]), orbitalMoon: block('달의 공전',orbit[1])};
    const html = state.mode === 0 ? [block('태양의 하루',day[0])+block('달의 하루',day[1]),block('지구의 공전',orbit[0])+block('달의 공전',orbit[1])] : state.mode === 1 ? [block('SUN / 태양',day[0]),block('MOON / 달',day[1])] : [block('EARTH / 지구',orbit[0]),block('MOON / 달',orbit[1])];
    const joined = html.join('|');
    if (joined !== lastInfoHTML) { $('#left-info').innerHTML = html[0]; $('#right-info').innerHTML = html[1]; lastInfoHTML = joined; }
  }
  function line(points,color,dashed=false) {
    ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.strokeStyle=color; ctx.lineWidth=1; ctx.setLineDash(dashed?[3,5]:[]); ctx.stroke(); ctx.setLineDash([]);
  }
  function label(text,x,y,color='#7790ac',align='center',size=10) {
    ctx.font = `${size}px "Malgun Gothic", system-ui, sans-serif`; ctx.fillStyle=color; ctx.textAlign=align; ctx.fillText(text,x,y);
  }
  function sun(x,y,r,below=false) {
    if (below) { ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle='#cdaa65';ctx.stroke();return; }
    const glow=ctx.createRadialGradient(x,y,r*.5,x,y,r*2.8);glow.addColorStop(0,'#f3c86280');glow.addColorStop(1,'#e3a85200');ctx.fillStyle=glow;ctx.fillRect(x-r*3,y-r*3,r*6,r*6);
    const g=ctx.createRadialGradient(x-r*.3,y-r*.3,1,x,y,r);g.addColorStop(0,'#fff6cb');g.addColorStop(.65,'#f9d37c');g.addColorStop(1,'#d99a3e');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  // Supplied photographs, shared by the daily and orbital views.
  const earthPhoto = document.createElement('img'); earthPhoto.src = 'earth200.png';
  const moonPhoto = document.createElement('img'); moonPhoto.src = 'moon200.png';
  let assetsReady = !earthPhoto.decode && !document.fonts;
  if(!assetsReady) Promise.all([
    earthPhoto.decode ? earthPhoto.decode().catch(()=>{}) : Promise.resolve(),
    moonPhoto.decode ? moonPhoto.decode().catch(()=>{}) : Promise.resolve(),
    document.fonts ? document.fonts.ready : Promise.resolve()
  ]).then(()=>{assetsReady=true;sizeChangedAt=performance.now();});
  let moonKey='',moonImage;

  function moon(x,y,r,phase,below=false,rotation=0) {
    if(below){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle='#a4bad3';ctx.stroke();return;}
    const key=Math.round(phase*2)+":"+(moonPhoto.complete&&moonPhoto.naturalWidth>0);
    if(key!==moonKey){
      moonKey=key;moonImage=document.createElement('canvas');moonImage.width=moonImage.height=80;
      const c=moonImage.getContext('2d'),img=c.createImageData(80,80),p=rad(phase);
      for(let j=0;j<80;j++)for(let i=0;i<80;i++){
        const nx=(i-39.5)/39.5,ny=(j-39.5)/39.5,z2=1-nx*nx-ny*ny;if(z2<0)continue;
        const nz=Math.sqrt(z2),light=Math.max(0,nx*Math.sin(p)-nz*Math.cos(p));
        const texture= .9+.06*Math.sin(i*.5)*Math.sin(j*.27)+.04*Math.sin(i*.17+j*.38);
        const shade=(25+205*Math.sqrt(light))*texture,k=(j*80+i)*4;
        img.data[k]=shade;img.data[k+1]=shade*1.015;img.data[k+2]=shade*1.04;img.data[k+3]=255;
      }c.putImageData(img,0,0);
      if(moonPhoto.complete&&moonPhoto.naturalWidth>0){
        const texture=document.createElement('canvas');texture.width=texture.height=80;
        const tc=texture.getContext('2d');tc.drawImage(moonPhoto,0,0,80,80);
        const photo=tc.getImageData(0,0,80,80);
        for(let k=0;k<img.data.length;k+=4){
          const light=img.data[k]/230;
          for(let channel=0;channel<3;channel++)img.data[k+channel]=photo.data[k+channel]*light;
          img.data[k+3]=Math.min(img.data[k+3],photo.data[k+3]);
        }
        c.putImageData(img,0,0);
      }
    }
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(rotation);
    ctx.drawImage(moonImage,-r,-r,r*2,r*2);
    ctx.restore();
  }
  function earth(x,y,r) {
    if(earthPhoto.complete&&earthPhoto.naturalWidth>0){
      ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
      ctx.drawImage(earthPhoto,x-r,y-r,r*2,r*2);ctx.restore();return;
    }
    ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();
    const g=ctx.createRadialGradient(-r*.4,-r*.4,0,0,0,r);g.addColorStop(0,'#509ebc');g.addColorStop(1,'#12314f');ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);
    ctx.fillStyle='#80bba1';ctx.beginPath();ctx.moveTo(-r*.85,-r*.55);ctx.lineTo(-r*.2,-r*.7);ctx.lineTo(r*.15,-r*.2);ctx.lineTo(-r*.2,r*.08);ctx.lineTo(-r*.1,r*.55);ctx.lineTo(-r*.5,r*.75);ctx.lineTo(-r*.65,r*.1);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.ellipse(r*.6,r*.15,r*.3,r*.4,-.5,0,Math.PI*2);ctx.fill();ctx.restore();ctx.strokeStyle='#92d5dc50';ctx.beginPath();ctx.arc(x,y,r+1,0,Math.PI*2);ctx.stroke();
  }
  function diagramFrame(box, orbital=false, earthLongitude=null) {
    // Fit the panel while keeping labels and the outer Moon orbit inside it.
    const extent = orbital ? 1.3 : 1.12;
    let r = Math.max(1, Math.min((box.w / 2 - 22) / extent,
      (box.h / 2 - 24) / extent));
    if(phone.matches){
      if(orbital && earthLongitude!==null){
        // Reserve space where the Moon actually is, instead of a full outer ring.
        const t=rad(earthLongitude), lunarExtent=.23*1.055;
        const ex=Math.max(1.017,1.017*Math.abs(Math.cos(t))+lunarExtent);
        const ey=Math.max(1.017,1.017*Math.abs(Math.sin(t))+lunarExtent);
        r=Math.max(1,Math.min((box.w/2-34)/ex,(box.h/2-22)/ey));
      }else if(!orbital){
        r=Math.max(1,Math.min((box.w/2-20)/1.1,(box.h/2-10)/1.1));
      }
    }
    return {r, middle: box.y + box.h / 2};
  }
  function moonHorizonRotation(data) {
    // Resolve the direction of sunlight into the Moon's local right/up sky basis.
    // This includes the parallactic rotation as the Moon crosses the sky.
    const deltaAz=rad(data.Sun.az-data.Moon.az);
    const sunAlt=rad(data.Sun.alt), moonAlt=rad(data.Moon.alt);
    const right=Math.cos(sunAlt)*Math.sin(deltaAz);
    const up=Math.sin(sunAlt)*Math.cos(moonAlt)
      -Math.cos(sunAlt)*Math.sin(moonAlt)*Math.cos(deltaAz);
    if(Math.hypot(right,up)<1e-8) return 0; // Limb angle is undefined at exact alignment.
    const limb=Math.atan2(-up,right); // Canvas y points down.
    const textureSide=Math.sin(rad(data.phase))>=0?0:Math.PI;
    return Math.atan2(Math.sin(limb-textureSide),Math.cos(limb-textureSide));
  }
  function daily(data,box) {
    const {x,y,w,h}=box,{r,middle:cy}=diagramFrame(box),cx=x+w/2;
    const tilt=rad(8);
    // Keep the horizon center at the same fixed y as the orbital Sun.
    const facingSouth=state.lat>=data.Sun.dec,direction=facingSouth?-1:1;
    const project=(az,alt)=>[
      cx+direction*r*Math.cos(rad(alt))*Math.sin(rad(az)),
      cy-r*Math.sin(rad(alt))*Math.cos(tilt)-direction*r*Math.sin(tilt)*Math.cos(rad(alt))*Math.cos(rad(az))
    ];
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const horizon=[];for(let i=0;i<=120;i++)horizon.push(project(i*3,0));
    ctx.beginPath();horizon.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.fillStyle='#2b655b12';ctx.fill();line(horizon,'#55d6b0');
    for(const [body,color] of [['Sun','#ffd166'],['Moon','#a9d8ff']]){
      const dec=rad(data[body].dec),lat=rad(state.lat),up=[],down=[];
      let segment=[],prev=null;
      for(let i=0;i<=180;i++){
        const hour=rad(i*2),east=-Math.cos(dec)*Math.sin(hour),north=Math.cos(lat)*Math.sin(dec)-Math.sin(lat)*Math.cos(dec)*Math.cos(hour),vertical=Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(hour);
        const alt=Math.asin(Math.max(-1,Math.min(1,vertical)))*180/Math.PI,az=Math.atan2(east,north)*180/Math.PI,p=project(az,alt),visible=alt>=0;
        if(prev!==null&&prev!==visible){segment.push(p);(prev?up:down).push(segment);segment=[p];}else segment.push(p);prev=visible;
      }(prev?up:down).push(segment);down.forEach(p=>line(p,color,true));up.forEach(p=>line(p,color));
    }
    for(const [az,text]of[[90,'동'],[270,'서'],[0,'북'],[180,'남']]){const p=project(az,0),dx=p[0]-cx,dy=p[1]-cy,d=Math.hypot(dx,dy);label(text,p[0]+13*dx/d,p[1]+13*dy/d+4);}
    const sp=project(data.Sun.az,data.Sun.alt),mp=project(data.Moon.az,data.Moon.alt);
    targets.push({key:'sun',x:sp[0],y:sp[1],r:Math.max(8,r*.09)}, {key:'moon',x:mp[0],y:mp[1],r:Math.max(8,r*.085)});
    line([[cx,cy],sp],'#e7bc4830');line([[cx,cy],mp],'#cbdcf330');
    sun(...sp,Math.max(8,r*.09),data.Sun.alt<0);moon(...mp,Math.max(8,r*.085),renderPhase(data),data.Moon.alt<0,moonHorizonRotation(data));
    targets.push({key:'observer',text:`관찰자(위도 ${state.lat.toFixed(4)}°, 경도 ${state.lon.toFixed(4)}°)<br>${facingSouth?'남쪽':'북쪽'}을 향해 서서 관찰함`,x:cx,y:cy,r:20});
    ctx.fillStyle='#a9c5cf';ctx.beginPath();ctx.arc(cx,cy-9,3,0,Math.PI*2);ctx.fill();line([[cx,cy-5],[cx,cy+6]],'#a9c5cf');line([[cx-4,cy+12],[cx,cy+6],[cx+4,cy+12]],'#a9c5cf');
  }
  function renderPhase(data) {
    const p=Math.acos(Math.max(-1,Math.min(1,1-2*data.fraction)))*180/Math.PI;
    return data.phase<=180?p:360-p;
  }
  function orbitalLightAngle(data) {
    // Actual distances, not the exaggerated on-screen lunar orbit.
    const e=rad(data.earth.lon),m=rad(data.moon.lon);
    const d=data.moon.distance/149597870.7;
    return Math.atan2(data.earth.distance*Math.sin(e)+d*Math.sin(m),
      -data.earth.distance*Math.cos(e)-d*Math.cos(m));
  }
  function orbit(data,box) {
    const {x,y,w,h}=box,{r,middle:cy}=diagramFrame(box,true,data.earth.lon),cx=x+w/2;
    const points=[];for(let i=0;i<=180;i++){const t=i*Math.PI/90,d=r*(1-.0167**2)/(1+.0167*Math.cos(t));points.push([cx+d*Math.cos(t),cy-d*Math.sin(t)]);}line(points,'#55d6b0');
    const theta=rad(data.earth.lon),re=r*(1-.0167**2)/(1+.0167*Math.cos(theta));
    const ex=cx+re*Math.cos(theta),ey=cy-re*Math.sin(theta),mr=r*.23;
    const mp=[];for(let i=0;i<=90;i++){const t=i*Math.PI/45,d=mr*(1-.0549**2)/(1+.0549*Math.cos(t));mp.push([ex+d*Math.cos(t),ey-d*Math.sin(t)]);}line(mp,'#a9d8ff');
    const m=rad(data.moon.lon),md=mr*(1-.0549**2)/(1+.0549*Math.cos(m));
    targets.push({key:'orbitalSun',text:'태양',x:cx,y:cy,r:Math.max(10,r*.11)}, {key:'earth',x:ex,y:ey,r:Math.max(6,r*.065)}, {key:'orbitalMoon',x:ex+md*Math.cos(m),y:ey-md*Math.sin(m),r:Math.max(4,r*.04)});
    line([[cx,cy],[ex,ey]],'#558a7f35');sun(cx,cy,Math.max(10,r*.11));earth(ex,ey,Math.max(8,r*.075));moon(ex+md*Math.cos(m),ey-md*Math.sin(m),Math.max(7,r*.055),90,false,orbitalLightAngle(data));
    // Heliocentric longitude is 180° at the March equinox.
    for(const [name,t] of [['춘분',Math.PI],['하지',3*Math.PI/2],['추분',0],['동지',Math.PI/2]]){
      const d=r*(1-.0167**2)/(1+.0167*Math.cos(t)), px=cx+d*Math.cos(t),py=cy-d*Math.sin(t);
      ctx.fillStyle='#a9e6cb';ctx.beginPath();ctx.arc(px,py,2,0,Math.PI*2);ctx.fill();
      label(name,px+14*Math.cos(t),py-14*Math.sin(t)+3,'#a9e6cb',Math.cos(t)>.5?'left':Math.cos(t)<-.5?'right':'center',10);
    }
    // Phase landmarks rotate with the geocentric Sun direction. These are
    // longitude-difference definitions, not the Moon's instantaneous location.
    const sunLongitude=theta+Math.PI;
    for(const [name,offset] of [['삭',0],['상현',90],['보름',180],['하현',270]]){
      const t=sunLongitude+rad(offset),d=mr*(1-.0549**2)/(1+.0549*Math.cos(t));
      const px=ex+d*Math.cos(t),py=ey-d*Math.sin(t);
      ctx.fillStyle='#b9cde2';ctx.beginPath();ctx.arc(px,py,1.5,0,Math.PI*2);ctx.fill();
      label(name,px+8*Math.cos(t),py-8*Math.sin(t)+3,'#b9cde2',Math.cos(t)>.4?'left':Math.cos(t)<-.4?'right':'center',9);
    }
  }
  function desktopPanels() {
    const half = {x:0,y:0,w:width/2,h:height};
    const extent = Math.max(diagramFrame(half).r*1.12, diagramFrame(half,true).r*1.3);
    const distance = Math.min(width/4, extent + 24);
    return [{...half,x:width/2-distance-width/4}, {...half,x:width/2+distance-width/4}];
  }
  let lastInfoSpacing = '';
  function positionDesktopInfo() {
    if (phone.matches) return;
    const panels = state.mode === 0 ? desktopPanels() : [{x:0,y:0,w:width,h:height}];
    const leftPanel = panels[0], rightPanel = panels[panels.length-1];
    const leftEdge = leftPanel.x+leftPanel.w/2-diagramFrame(leftPanel,state.mode===2).r*(state.mode===2?1.3:1.12);
    const rightEdge = rightPanel.x+rightPanel.w/2+diagramFrame(rightPanel,state.mode!==1).r*(state.mode===1?1.12:1.3);
    const left = Math.max(0,leftEdge-26), right = Math.min(0,rightEdge-width+26);
    const spacing = left+','+right;
    if (spacing !== lastInfoSpacing) {
      $('.stage').style.setProperty('--info-left-shift',left+'px');
      $('.stage').style.setProperty('--info-right-shift',right+'px');
      lastInfoSpacing = spacing;
    }
  }
  function draw(data) {
    if(!data)return;
    targets = [];
    positionDesktopInfo();
    ctx.clearRect(0,0,width,height);
    // Deterministic, static star field; no visual jitter between frames.
    for(let i=0;i<45;i++){const x=((i*137.508)%997)/997*width,y=((i*i*61.31)%991)/991*height;ctx.fillStyle=i%4?'#92b8db20':'#bed8ee40';ctx.fillRect(x,y,1,1);}
    if(state.mode===0){
      if(window.matchMedia('(max-width: 760px)').matches){
        daily(data,{x:0,y:0,w:width,h:height/2});
        orbit(data,{x:0,y:height/2,w:width,h:height/2});
      }else{
        const panels = desktopPanels();
        daily(data,panels[0]);
        orbit(data,panels[1]);
      }
    }else(state.mode===1?daily:orbit)(data,{x:0,y:0,w:width,h:height});
  }
  document.addEventListener('visibilitychange', () => { lastFrame=performance.now();lastRequest=-Infinity; });
  function frame(now) {
    const elapsed=now-lastFrame;lastFrame=now;
    if(state.live) state.ms=Date.now();else if(state.playing)setTime(state.ms+elapsed*state.speed);
    if(worker&&!busy&&now-lastRequest>=100){
      busy=true;lastRequest=now;
      worker.postMessage({id:state.version,ms:state.ms,lat:state.lat,lon:state.lon,lead:state.playing?state.speed*100:0});
    }
    const data=interpolated(now);
    // Populate text before drawing, including the first frame and mode changes.
    if(now-lastInfo>100 || !lastInfoHTML){
      const mobile=window.matchMedia('(max-width: 760px)').matches;
      const text=timeFormat.format(new Date(state.ms))+(mobile?'\n':'  ')+`관찰자 위치 : 위도 ${state.lat.toFixed(4)}°, 경도 ${state.lon.toFixed(4)}°`;if(text!==lastTime){$('#time').textContent=text;$('#time').dateTime=new Date(state.ms).toISOString();lastTime=text;}
      if(data)info(data);lastInfo=now;
    }
    // Reveal only the fully rendered first frame, after layout has settled.
    // Later resizes clear and repaint in this same frame rather than flashing.
    const initialLayoutReady = now-sizeChangedAt >= (kakaoBrowser?600:350)
      && (!kakaoBrowser || now-openedAt>=1500);
    if(pageReady && assetsReady && data && (firstPaint || initialLayoutReady)){
      if(pendingSize){
        width=pendingSize.width;height=pendingSize.height;currentDpr=pendingSize.dpr;
        const pw=Math.round(width*currentDpr),ph=Math.round(height*currentDpr);
        if(canvas.width!==pw)canvas.width=pw;
        if(canvas.height!==ph)canvas.height=ph;
        // Keep CSS from stretching the old bitmap between a layout change
        // and this redraw. Change display and backing sizes atomically.
        canvas.style.width=width+'px';canvas.style.height=height+'px';
        ctx.setTransform(currentDpr,0,0,currentDpr,0,0);
        pendingSize=null;
      }
      draw(data);
      canvas.style.visibility='visible';firstPaint=true;
    }
    updateTooltip();
    requestAnimationFrame(frame);
  }
  controls();requestAnimationFrame(frame);
})();
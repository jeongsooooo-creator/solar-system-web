// Functional smoke checks; no npm dependencies or browser installation required.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function workerContext() {
  const env = {console, Date, Math, Map};
  env.self = env;
  vm.createContext(env);
  env.importScripts = name => vm.runInContext(read(name), env);
  return env;
}
const worker = workerContext();
let result;
worker.postMessage = value => { result = value; };
vm.runInContext(read('astronomy-worker.js'), worker);
for (const date of ['2026-11-01T12:00:00+09:00', '1900-01-01T00:00:00+09:00', '2050-12-31T23:59:59+09:00']) {
  for (const lat of [35.08, 90, -90]) {
    worker.onmessage({data:{id:1, ms:Date.parse(date), lat, lon:128.89, lead:8640000}});
    assert(!result.error, result.error);
    assert(result.current.Sun.az >= 0 && result.current.Sun.az <= 360);
    assert(result.current.moon.distance > 300000 && result.current.moon.distance < 450000);
    assert(result.current.earth.distance > .98 && result.current.earth.distance < 1.02);
    for (const body of ['Sun', 'Moon']) for (const field of ['rise', 'set']) {
      const event = result.times[body][field];
      if (event !== null) {
        const start = Date.parse(date.slice(0,10) + 'T00:00:00+09:00');
        assert(event >= start && event < start + 86400000);
      }
    }
  }
}
console.log('PASS worker: positions, distances, date limits, polar regions, KST daily events');

// Exercise real controller and drawing code with minimal DOM/canvas adapters.
const gradient = {addColorStop(){}};
const context = new Proxy({createRadialGradient:()=>gradient, createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})}, {get:(object,key)=>key in object ? object[key] : ()=>{}});
class Element {
  constructor(dataset={}) { this.dataset=dataset; this.events={}; this.attributes={}; this.textContent=''; this.innerHTML=''; this.value=''; this.hidden=true; this.tagName='DIV'; this.style={setProperty(){}}; this.classList={toggle(){}}; }
  addEventListener(type, handler) { this.events[type]=handler; }
  setAttribute(key, value) { this.attributes[key]=value; }
  getContext() { return context; }
  appendChild() {}
  getBoundingClientRect() { return {left:0,top:0,width:200,height:100}; }
  closest(selector) { return selector.split(',').includes(this.tagName.toLowerCase()) ? this : null; }
  click() { this.events.click?.({target:this}); }
}
const ids=['sky','error','pause','now','status','latitude','longitude','location-form','locate','time','left-info','right-info','toggle-info'];
const elements = Object.fromEntries(ids.map(id=>['#'+id,new Element()]));
elements['.stage']=new Element();
elements['#sky'].parentElement={parentElement:{clientWidth:1200}};
const modes=[0,1,2].map(mode=>new Element({mode:String(mode)}));
const steps=[-86400,-3600,-600,-60,60,600,3600,86400].map(step=>new Element({step:String(step)}));
const speeds=[1,10,60,600,3600,86400].map(speed=>new Element({speed:String(speed)}));
const groups={'[data-mode]':modes,'[data-step]':steps,'[data-speed]':speeds};
const documentEvents={};
const document={readyState:'complete',querySelector:s=>elements[s], querySelectorAll:s=>groups[s], createElement:()=>new Element(), addEventListener:(type,handler)=>documentEvents[type]=handler};
document.body=new Element();
const store=new Map();
let frame, resize, now=1000, blob;
class FakeWorker {
  constructor() {
    this.env=workerContext();
    this.env.postMessage=data=>this.onmessage({data});
    vm.runInContext(blob, this.env);
  }
  postMessage(data) { this.env.onmessage({data}); }
}
const env={console, document, Date, Math, Map, Intl, Uint8ClampedArray, Number, String, JSON, navigator:{},
  localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
  performance:{now:()=>now}, requestAnimationFrame:callback=>frame=callback,
  Worker:FakeWorker, Blob:class{constructor(parts){blob=parts.join('');}}, URL:{createObjectURL:()=>'',revokeObjectURL(){}},
  ResizeObserver:class{constructor(callback){this.callback=callback;resize=callback;}observe(){this.callback([{contentRect:{width:600,height:420}}]);}}
};
const phoneMedia={matches:false,addEventListener(type,handler){this.change=handler;}};
env.matchMedia=()=>phoneMedia;
env.window=env;
vm.createContext(env);
vm.runInContext(read('solar-system-worker.bundle.js'),env);
vm.runInContext(read('solar-system-web.js').replace('  controls();requestAnimationFrame(frame);', '  window.geometryForTest = diagramFrame; window.phaseForTest=renderPhase; window.lightForTest=orbitalLightAngle; controls();requestAnimationFrame(frame);'),env);
const tick=(ms=120)=>{now+=ms;frame(now);};
let diagramDraws=0;
context.clearRect=()=>{
 diagramDraws++;
 assert(elements['#left-info'].innerHTML,'Information must be populated before the first diagram');
 assert(elements['#time'].textContent,'Time must be populated before the first diagram');
};
tick();
assert.equal(diagramDraws,0,'Do not draw before the initial layout settles');
tick();assert.equal(diagramDraws,0);
tick();assert(diagramDraws>0,'Draw once dimensions have remained stable');
let backingResets=0,backingWidth=elements['#sky'].width,backingHeight=elements['#sky'].height;
Object.defineProperty(elements['#sky'],'width',{get:()=>backingWidth,set:value=>{backingWidth=value;backingResets++;}});
Object.defineProperty(elements['#sky'],'height',{get:()=>backingHeight,set:value=>{backingHeight=value;backingResets++;}});
resize([{contentRect:{width:600,height:420}}]);tick();
assert.equal(backingResets,0,'An unchanged resize must not clear the canvas');
resize([{contentRect:{width:600,height:400}}]);
assert.equal(backingResets,0,'ResizeObserver must leave the visible drawing intact');
assert.equal(elements['#sky'].style.height,'420px','Keep the old display size until repaint');
const beforeResizeDraw=diagramDraws;tick();
assert.equal(backingResets,1);
assert.equal(elements['#sky'].style.height,'400px','Commit display and bitmap dimensions together');
assert(diagramDraws>beforeResizeDraw,'A changed backing size must redraw in the same frame');
assert(elements['#left-info'].innerHTML.includes('일출 시각'));
assert(elements['#right-info'].innerHTML.includes('지구–달 거리'));
assert(elements['#error'].hidden);
elements['#pause'].click();tick();
assert.equal(elements['#pause'].textContent,'재생');
const paused=elements['#time'].textContent;tick(2000);assert.equal(elements['#time'].textContent,paused);
steps[6].click();tick();
assert.notEqual(elements['#time'].textContent,paused);
modes[1].click();tick();assert(!elements['#left-info'].innerHTML.includes('지구의 황경'));
modes[2].click();tick();assert(elements['#left-info'].innerHTML.includes('지구의 황경'));
speeds[5].click();elements['#pause'].click();tick(2000);
assert.equal(elements['#status'].textContent,'86,400배속');
const key=key=>documentEvents.keydown({key,target:new Element(),preventDefault(){}});
key('1');tick();assert.equal(modes[0].attributes['aria-pressed'],'true');
key(' ');tick();assert.equal(elements['#status'].textContent,'일시정지');
key('Home');tick();assert.equal(elements['#status'].textContent,'실시간');
elements['#latitude'].value='90';elements['#longitude'].value='0';elements['#location-form'].events.submit({preventDefault(){}});tick();assert(elements['#error'].hidden);
assert(store.has('solar-web-location'));
console.log('PASS controller: generated worker bundle, all views, pause/resume, steps, speed, keyboard, location, drawing');
console.log('Browser visual layout and real FPS require a browser check.');


const small = env.geometryForTest({x:0,y:0,w:360,h:420},true);
const large = env.geometryForTest({x:0,y:0,w:760,h:620},true);
assert(large.r > small.r);
for(const box of [{x:0,y:0,w:280,h:320},{x:0,y:320,w:400,h:400},{x:0,y:0,w:1000,h:700}]) {
 const g = env.geometryForTest(box,true);
 assert(g.r*1.3 <= box.w/2-22+1e-6);
 assert(g.r*1.3 <= box.h/2-24+1e-6);
 assert.equal(g.middle,box.y+box.h/2);
}
console.log('PASS geometry: larger panels enlarge orbits within label and Moon margins');

phoneMedia.matches=true;phoneMedia.change();tick();
assert.equal(modes[1].attributes['aria-pressed'],'true');
key('1');tick();assert.equal(modes[1].attributes['aria-pressed'],'true');
modes[2].click();tick();assert.equal(modes[2].attributes['aria-pressed'],'true');
elements['#toggle-info'].click();assert.equal(elements['#toggle-info'].attributes['aria-expanded'],'false');
elements['#toggle-info'].click();assert.equal(elements['#toggle-info'].attributes['aria-expanded'],'true');
console.log('PASS phone: individual modes only, info visibility toggle');

const panel={x:0,y:0,w:360,h:420};
const visibleOrbit=env.geometryForTest(panel,true).r;
elements['#sky'].click();
assert.equal(elements['#toggle-info'].attributes['aria-expanded'],'false');
const hiddenOrbit=env.geometryForTest(panel,true).r;
assert.equal(hiddenOrbit,visibleOrbit,'Information toggles must preserve the orbit scale');
elements['#sky'].click();assert.equal(elements['#toggle-info'].attributes['aria-expanded'],'true');
phoneMedia.matches=false;phoneMedia.change();elements['#sky'].click();
assert.equal(elements['#toggle-info'].attributes['aria-expanded'],'true');
console.log('PASS mobile orbit tap: synced info toggle and available-space radius; desktop unaffected');

for(const [phase,fraction,expected] of [[0,0,0],[90,.5,90],[180,1,180],[270,.5,270]]) {
 assert(Math.abs(env.phaseForTest({phase,fraction})-expected)<1e-8);
}
const seasons=worker.Astronomy.Seasons(2026);
for(const [key,expected] of [['mar_equinox',180],['jun_solstice',270],['sep_equinox',0],['dec_solstice',90]]) {
 worker.onmessage({data:{id:3,ms:seasons[key].date.getTime(),lat:35.08,lon:128.89}});
 const error=((result.current.earth.lon-expected+540)%360)-180;
 assert(Math.abs(error)<.1,`${key}: ${result.current.earth.lon}`);
}
assert(!read('solar-system-web.js').includes('계산하고 있습니다'));
console.log('PASS science: actual 2026 equinox/solstice longitudes and new/quarter/full phase rendering');
for(const earthLon of [0,90,180,270])for(const moonLon of [0,90,180,270]){
 const a=env.lightForTest({earth:{lon:earthLon,distance:1},moon:{lon:moonLon,distance:384400}});
 const towardEarthSun=Math.atan2(Math.sin(earthLon*Math.PI/180),-Math.cos(earthLon*Math.PI/180));
 const error=Math.atan2(Math.sin(a-towardEarthSun),Math.cos(a-towardEarthSun));
 assert(Math.abs(error)<.003,'Actual Moon–Sun direction must stay within 0.18 degrees of Earth–Sun direction');
 const dx=-Math.cos(earthLon*Math.PI/180)-384400/149597870.7*Math.cos(moonLon*Math.PI/180);
 const dy=Math.sin(earthLon*Math.PI/180)+384400/149597870.7*Math.sin(moonLon*Math.PI/180);
 assert(Math.cos(a)*dx+Math.sin(a)*dy>0);
}
console.log('PASS orbital lighting: Sun-facing half disk, actual AU/km distance ratio, all quadrants');
for(const [w,h] of [[280,240],[304,300],[344,390],[374,480]]) {
 const g=env.geometryForTest({x:0,y:0,w,h},true);
 assert(g.r*1.3+22<=w/2+1e-6);
 assert(g.r*1.3+24<=h/2+1e-6);
}
assert(!read('solar-system-web.js').includes("label('점선은 지평선 아래의 경로"));
console.log('PASS compact phone geometry and removed diagram captions');
phoneMedia.matches=true;
for(const [w,h] of [[304,224],[344,300],[374,420]]){
 const box={x:0,y:0,w,h},before=env.geometryForTest(box,true).r;
 for(let lon=0;lon<360;lon+=15){
  const after=env.geometryForTest(box,true,lon).r,t=lon*Math.PI/180;
  const ex=Math.max(1.017,1.017*Math.abs(Math.cos(t))+.23*1.055);
  const ey=Math.max(1.017,1.017*Math.abs(Math.sin(t))+.23*1.055);
  assert(after>=before*.9);
  assert(after*ex+34<=w/2+1e-6);
  assert(after*ey+22<=h/2+1e-6);
 }
}
assert(env.geometryForTest({x:0,y:0,w:304,h:224},true,40).r > env.geometryForTest({x:0,y:0,w:304,h:224},true).r*1.2);
console.log('PASS enlarged mobile orbit: all seasonal positions fit with labels');
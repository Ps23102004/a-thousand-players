// Original layered synthesis: no remote samples or audio downloads.
let audioCtx=null,master=null,soundEnabled=false;
const noiseBuffers=new WeakMap();
export function setSoundEnabled(enabled){soundEnabled=!!enabled}
export function initAudio(){
 if(typeof window!=='undefined'&&!audioCtx){
  const Context=window.AudioContext||window.webkitAudioContext;
  if(Context){audioCtx=new Context();const compressor=audioCtx.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=16;compressor.ratio.value=5;compressor.attack.value=.003;compressor.release.value=.16;master=audioCtx.createGain();master.gain.value=.66;master.connect(compressor);compressor.connect(audioCtx.destination)}
 }
 return {play:playSound};
}
export function playSound(type,options={}){
 if(!soundEnabled)return;initAudio();if(!audioCtx)return;
 if(audioCtx.state==='suspended')audioCtx.resume();
 synthesizeSound(audioCtx,master||audioCtx.destination,type,options);
}
/** Also renders into OfflineAudioContext for PCM verification. All nodes are short lived. */
export function synthesizeSound(ctx,output,type,{pan=0,volume=1,heavy=false}={}){
 const now=ctx.currentTime,bus=ctx.createGain();bus.gain.value=Math.max(0,Math.min(1,volume));
 const stereo=ctx.createStereoPanner();stereo.pan.value=Math.max(-.8,Math.min(.8,pan));bus.connect(stereo);stereo.connect(output);
 const tone=(freq,end,duration,gain,shape='sine',delay=0)=>{
  const o=ctx.createOscillator(),g=ctx.createGain(),t=now+delay;o.type=shape;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.003);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  o.connect(g);g.connect(bus);o.start(t);o.stop(t+duration+.01);
 };
 const noise=(duration,gain,freq,end=freq,filterType='bandpass',delay=0)=>{
  let buffer=noiseBuffers.get(ctx);if(!buffer){buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;noiseBuffers.set(ctx,buffer)}
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain(),t=now+delay;source.buffer=buffer;
  filter.type=filterType;filter.Q.value=.8;filter.frequency.setValueAtTime(freq,t);filter.frequency.exponentialRampToValueAtTime(end,t+duration);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+Math.min(.035,duration*.25));g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  source.connect(filter);filter.connect(g);g.connect(bus);source.start(t,Math.random()*.5,duration);source.stop(t+duration+.01);
 };
 if(type==='hit'||type==='punch'){
  tone(175,48,.16,.48);noise(.055,.65,2200,900);noise(.10,.22,480,250,'lowpass');
 }else if(type==='kick'){
  tone(115,32,.25,.65);noise(.09,.85,1500,500);noise(.18,.38,650,180,'lowpass');tone(220,65,.11,.15,'triangle',.012);
 }else if(type==='body'){
  tone(105,38,.20,.56);noise(.12,.62,650,180,'lowpass');noise(.045,.22,1300,600);
 }else if(type==='slam'||type==='cart_smash'){
  tone(85,24,.42,.72);noise(.32,.85,950,180,'lowpass');noise(.10,.32,1800,600,'bandpass',.025);
 }else if(type==='block'){
  noise(.07,.6,1100,450);tone(280,110,.11,.21,'triangle');
 }else if(type==='parry'){
  tone(1180,930,.23,.19);tone(2360,1880,.17,.12);noise(.035,.35,3500,1800);
 }else if(type==='whoosh'){
  noise(heavy?.25:.15,heavy?.34:.24,heavy?450:1100,heavy?1600:2500);
 }else if(type==='step'){
  noise(.065,.20,450,140,'lowpass');tone(90,46,.07,.075);
 }else if(type==='cheer'||type==='gasp'){
  noise(type==='cheer'?1.25:.45,.20,1100,650);noise(.8,.10,420,700,'bandpass',.06);
  // Layer quiet vowel-like tones under the crowd wash.
  for(const f of [145,182,220])tone(f,f*1.08,.75,.023,'triangle',.04);
 }
 // Disconnect the per-event output when sources have finished (no retained audio graph).
 const cleanup=ctx.createConstantSource();cleanup.offset.value=0;cleanup.connect(bus);cleanup.start(now);cleanup.stop(now+1.6);cleanup.onended=()=>{bus.disconnect();stereo.disconnect()};
}

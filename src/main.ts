import './style.css';
import { GameEngine } from './game/engine';
import { SKINS } from './data/skins';
import { loadProfile, saveProfile } from './services/storage';
import { LocalLeaderboardService, CONTINENTS, type Continent, type Period, type LeaderboardEntry } from './services/leaderboard';
import { DemoAdProvider, getDisplayAdConfig, mountDisplayAd, type AdPlacement, type DisplayAdStatus } from './services/ads';
import { icon } from './icons';
import { carSvg } from './car';

const $ = <T extends HTMLElement = HTMLElement>(q: string) => document.querySelector<T>(q)!;
const profile = loadProfile();
const boards = new LocalLeaderboardService();
let selected = SKINS.find(s => s.id === profile.selectedSkin) || SKINS[0];
let preview = selected;
let runId = '';
let lastScore = 0;
let continued = false;
let starting = false;
let view: 'play' | 'leaderboard' = 'play';
let scope: 'worldwide' | 'continent' = 'worldwide';
let period: Period = 'all';
let boardRequest = 0;
let toastTimer: ReturnType<typeof setTimeout>;
let adResolve: ((result: boolean) => void) | undefined;
let adTimer: ReturnType<typeof setInterval> | undefined;
let displayAdCleanup: (()=>void)|undefined;
let displayAdConsent=false;
const displayAdConfig=getDisplayAdConfig();

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" aria-label="Drunken Joyride home"><span class="brand-mark">${icon('car',29)}</span><span>DRUNKEN<span class="brand-light">JOYRiDE<span class="brand-dot">.</span></span></span></a>
    <nav aria-label="Main navigation"><button class="nav-button active" id="nav-play">${icon('road',17)} Drive</button><button class="nav-button" id="nav-garage">${icon('car',18)} Garage</button><button class="nav-button" id="nav-board">${icon('trophy',18)} Leaderboards</button></nav>
    <div class="header-tools"><span class="arcade-badge">ENDLESS ARCADE</span><button class="icon-button" id="sound" aria-label="Toggle sound"></button><button class="icon-button" id="help" aria-label="How to play">${icon('help')}</button></div>
  </header>
  <main>
    <section class="page-intro"><div><div class="eyebrow"><span class="tiny-line"></span> AFTER HOURS. ALL GAS.</div><h1>Bad decisions.<br><span>Great reflexes.</span></h1></div><div class="intro-side"><span class="route-tag">A2 &nbsp; / &nbsp; THE NETHERLANDS</span><p>Traffic. Roadworks. Questionable steering.<br>How long can you hold it together?</p></div></section>
    <section class="banner-slot" id="banner" aria-label="Advertisement">
      <div class="ad-rail"><span class="ad-label">ADVERTISEMENT</span><span id="ad-status">NOT CONNECTED</span></div>
      <div id="display-ad"></div>
      <div class="ad-placeholder" id="ad-placeholder"><div class="ad-placeholder-mark">${icon('spark',24)}</div><div><strong>This space keeps the wheels turning.</strong><span id="ad-description">Reserved for a real sponsor. No ad network connected yet.</span></div><button class="secondary small" id="ad-connect">Ad setup ${icon('arrow',15)}</button></div>
    </section>
    <div id="play-view">
      <div class="play-layout">
        <section class="game-section" aria-label="Drunken Joyride game">
          <div class="game-bar"><span><span class="live-dot"></span> LIVE RUN <span class="bar-divider">/</span> A2 AFTER DARK</span><span id="pace">LEVEL 01</span></div>
          <div class="drive-shell" id="drive-shell">
            <canvas id="game" tabindex="0" aria-label="Game area. Left and right arrows or A and D to steer. P to pause."></canvas>
            <div class="game-hud" hidden id="hud"><div><span>OBSTACLES CLEARED</span><strong id="live-score">0</strong></div><div class="distance-readout"><span>DISTANCE</span><strong id="distance">0 <small>m</small></strong></div><button class="icon-button" id="pause" aria-label="Pause game">${icon('pause')}</button></div>
            <div class="game-overlay" id="ready"><div class="takeoff-tag">NO BRAKES. JUST REFLEXES.</div><h2>Own the night.<br>Dodge the chaos.</h2><p>Three lanes. One questionable ride.<br>Keep clear of traffic and roadworks.</p><button class="primary" id="start">Hit the road ${icon('arrow')}</button><span class="start-hint">ARROWS / A &amp; D TO STEER <span>·</span> SPACE TO START</span></div>
            <div class="game-overlay pause-overlay" id="paused" hidden><span class="takeoff-tag">PULL OVER FOR A SECOND</span><h2>Engine idling.</h2><p>Your run is safe right here.</p><button class="primary" id="resume">Keep driving ${icon('play')}</button></div>
            <div class="game-bottom-label"><span>DRUNKEN JOYRIDE</span><span>ALL SKILL. NO BRAKES.</span></div>
          </div>
          <div class="steering-controls" aria-label="Touch steering"><button id="steer-left" aria-label="Steer left"><span>←</span> LEFT</button><span>${icon('steer',25)}<small>STEER</small></span><button id="steer-right" aria-label="Steer right">RIGHT <span>→</span></button></div>
          <div class="controls-strip"><span><kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> to steer</span><span><kbd>P</kbd> to pause</span></div>
        </section>
        <aside class="sidebar">
          <section class="best-card"><div class="best-icon">${icon('trophy',25)}</div><div><span class="eyebrow">YOUR BEST RUN</span><strong id="best">0 <small>cleared</small></strong></div><span class="small-note">BEAT<br>YOURSELF.</span></section>
          <section class="garage-card" id="garage"><div class="section-heading"><div><span class="eyebrow">CHOOSE YOUR BAD IDEA</span><h2>The garage<span>.</span></h2></div><span id="collection-count" class="count-pill"></span></div><div class="car-grid" id="skins"></div><div class="selected-car" id="car-detail"></div></section>
          <section class="tip-card"><span class="tip-icon">${icon('gauge',23)}</span><div><h3>The road doesn't get easier.</h3><p>Faster traffic. Bigger roadblocks. Less room for mistakes. Stay sharp and find the open lane.</p></div></section>
          <button class="leaderboard-link" id="quick-board"><span>${icon('globe')} See who owns the night</span>${icon('arrow')}</button>
          <button class="remove-trigger garage-remove">${icon('shield',16)} Remove ads · preview</button>
        </aside>
      </div>
    </div>
    <section class="leaderboard-view" id="leaderboard-view" hidden>
      <div class="board-heading"><div><span class="eyebrow">THE NIGHT SHIFT</span><h2>Legends of the fast lane.</h2><p>Ten runs worth chasing. Put your name on the asphalt.</p></div><button class="secondary" id="back-play">Back to game ${icon('arrow')}</button></div>
      <div class="board-toolbar"><div class="tabs" aria-label="Leaderboard region"><button data-scope="worldwide" class="active">Worldwide</button><button data-scope="continent">Continent</button></div><label class="continent-select">Continent<select id="board-continent"></select></label></div>
      <div class="period-tabs" aria-label="Leaderboard time period"><button data-period="all" class="active">All time</button><button data-period="daily">Daily</button><button data-period="weekly">Weekly</button><button data-period="monthly">Monthly</button></div>
      <p class="demo-notice">${icon('help',16)} Local demo · Sample drivers + runs on this browser. No shared backend connected.</p>
      <div id="board-table"></div><p class="board-footnote">Daily, weekly and monthly boards use UTC. Weeks start on Monday.</p>
    </section>
  </main>
  <footer><span>A fictional arcade trip. Made for one more run.</span><span class="footer-brand">DRUNKEN JOYRIDE <span class="orange-dot"></span> AFTER HOURS ARCADE</span><button class="text-button" id="about">About &amp; ads</button></footer>
  <dialog id="over-dialog" class="over-dialog" aria-label="Run over"><button class="dialog-x" id="close-over" aria-label="Close game over">${icon('close')}</button><div class="over-layout"><section><span class="eyebrow" id="over-eyebrow">THAT'LL LEAVE A MARK</span><h2>Wrecked.<br>Run it back?</h2><p class="over-subtitle">The road won this round.</p><div class="score-pair"><div><span>THIS RUN</span><strong id="final-score">0</strong></div><div><span>PERSONAL BEST</span><strong id="final-best">0</strong></div></div><p class="unlock-notice" id="unlock-notice" hidden></p><button class="primary full" id="restart">One more run ${icon('restart')}</button><button class="secondary full" id="continue">${icon('wrench',17)} Repair &amp; continue · demo</button><span class="fine-print">One repair per run. Reward ad is a demo.</span><button class="text-button remove-trigger">Remove ads · preview</button></section><section class="over-board"><div class="section-heading"><div><span class="eyebrow">WORLDWIDE · ALL TIME</span><h3>Top 10 drivers</h3></div>${icon('trophy',23)}</div><form id="score-form"><div class="name-row"><label>Your driver name<input id="driver-name" maxlength="20" placeholder="e.g. Midnight Racer" required autocomplete="nickname"></label><label>Continent<select id="driver-continent"></select></label></div><button class="secondary full" type="submit" id="submit-score">Save my run ${icon('arrow',17)}</button><p id="submit-status" class="fine-print" role="status"></p></form><p class="fine-print demo-caption">LOCAL DEMO · samples are marked</p><div id="over-table" class="over-table"></div><button class="text-button" id="over-all-boards">Explore all leaderboards ${icon('arrow',16)}</button></section></div></dialog>
  <dialog id="info-dialog" class="info-dialog" aria-label="Game information"><button class="dialog-x" data-close="info-dialog" aria-label="Close information">${icon('close')}</button><div id="info-content"></div></dialog>
  <dialog id="ad-dialog" class="info-dialog ad-dialog" aria-label="Simulated reward advertisement"><span class="eyebrow">AD PROVIDER PREVIEW</span><div class="demo-ad-art">${carSvg(SKINS[0],100)}<span>Pit stop.<br>Big comeback.</span></div><h2 id="ad-heading">Rewarded ad demo</h2><p>This is a simulated reward placement. No real video ad is connected and no money is charged.</p><button class="primary full" id="ad-complete" disabled>Complete demo</button><button class="text-button" id="ad-cancel">Cancel · no reward</button></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;

function persist() { saveProfile(profile); }
function notify(message: string) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').hidden=false; toastTimer=setTimeout(()=>$('#toast').hidden=true,4000); }
function updateProfileUI() {
  $('#best').innerHTML=`${profile.best} <small>cleared</small>`;
  $('#sound').innerHTML=icon(profile.sound ? 'sound':'mute');
  $('#sound').setAttribute('aria-label', profile.sound ? 'Mute sound' : 'Enable sound');
  $('#sound').setAttribute('aria-pressed',String(profile.sound));
  $('#banner').hidden=profile.adsRemoved;
  if(profile.adsRemoved){displayAdCleanup?.();displayAdCleanup=undefined;}
  document.querySelectorAll('.remove-trigger').forEach(el=>el.textContent=profile.adsRemoved?'Ad-free preview enabled':'Remove ads · preview');
}
function unlocked(id: string) { return profile.unlockedSkins.includes(id); }
function renderSkins() {
  $('#collection-count').textContent=`${SKINS.filter(s=>unlocked(s.id)).length} / ${SKINS.length}`;
  $('#skins').innerHTML=SKINS.map(s=>`<button class="skin ${preview.id===s.id?'selected':''} ${!unlocked(s.id)?'locked':''}" data-skin="${s.id}" aria-label="${s.name}, ${unlocked(s.id)?'unlocked':`unlock at ${s.unlockScore} points`}" aria-pressed="${preview.id===s.id}"><span class="skin-state">${selected.id===s.id?icon('check',12):!unlocked(s.id)?icon('lock',11):''}</span>${carSvg(s,55)}<span class="skin-name">${s.name}</span></button>`).join('');
  const active=unlocked(preview.id);
  $('#car-detail').innerHTML=`<div><strong>${preview.name}</strong><span>${active ? (selected.id===preview.id?'Ready to rule the road.':'A new look for your next run.'):`Reach ${preview.unlockScore} points or complete a reward demo.`}</span></div>${active ? `<span class="selected-label">${icon('check',14)} Selected</span>` : `<button class="reward-button" id="unlock-skin">${icon('play',14)} Unlock · demo</button>`}`;
}
const engine = new GameEngine($('#game'), {skin:selected,sound:profile.sound,onScore:score=>{
  $('#live-score').textContent=String(score);
},onGameOver:finishRun,onStateChange:status=>{
  $('#ready').hidden=status!=='ready'; $('#paused').hidden=status!=='paused'; $('#hud').hidden=status==='ready'||status==='over';
  document.body.classList.toggle('in-run',status==='playing');
}});
const ads = new DemoAdProvider(runAdDemo,{adsDisabled:profile.adsRemoved});

function runAdDemo(placement: AdPlacement): Promise<boolean> {
  pauseGame();
  return new Promise(resolve=>{
    if(adResolve) { resolve(false);return; }
    adResolve=resolve; const rewarded=placement==='rewarded'; let seconds=3;
    $('#ad-heading').textContent=rewarded?'Rewarded ad demo':'Between-runs ad demo';
    const complete=$<HTMLButtonElement>('#ad-complete'); complete.disabled=true;complete.textContent=`Demo ready in ${seconds}…`;
    $('#ad-cancel').textContent=rewarded?'Cancel · no reward':'Skip demo';
    $<HTMLDialogElement>('#ad-dialog').showModal();
    adTimer=setInterval(()=>{seconds--;complete.textContent=seconds>0?`Demo ready in ${seconds}…`:rewarded?'Complete demo & claim reward':'Back to the sky';if(seconds<=0){clearInterval(adTimer);complete.disabled=false;}},1000);
  });
}
function closeAd(complete: boolean) { clearInterval(adTimer);$<HTMLDialogElement>('#ad-dialog').close();const resolve=adResolve;adResolve=undefined;resolve?.(complete); }
$('#ad-complete').onclick=()=>closeAd(true);
$('#ad-cancel').onclick=()=>closeAd(false);
$('#ad-dialog').addEventListener('cancel',e=>{e.preventDefault();closeAd(false);});

async function startRun() {
  if(starting || adResolve) return; starting=true;
  const old=engine.getSnapshot().status;
  $<HTMLDialogElement>('#over-dialog').close();
  if(old==='over') await ads.interstitial();
  // Run IDs deduplicate local submissions; they are not security credentials.
  runId=globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`; continued=false;lastScore=0;
  $('#submit-status').textContent='';$<HTMLButtonElement>('#submit-score').disabled=false;
  setView('play'); engine.start();starting=false;
  $('#drive-shell').scrollIntoView({behavior:'instant',block:'center'});
  $('#game').focus({preventScroll:true});
}
function finishRun(score: number) {
  lastScore=score; const oldBest=profile.best;
  profile.best=Math.max(profile.best,score);
  const newly=SKINS.filter(s=>score>=s.unlockScore&&!unlocked(s.id));
  profile.unlockedSkins.push(...newly.map(s=>s.id));persist();updateProfileUI();renderSkins();
  $('#final-score').textContent=String(score);$('#final-best').textContent=String(profile.best);
  $('#over-eyebrow').textContent=score>oldBest?'YOUR NEW PERSONAL BEST!':"THAT'LL LEAVE A MARK";
  $('#unlock-notice').hidden=!newly.length;$('#unlock-notice').textContent=`New ride unlocked: ${newly.map(s=>s.name).join(', ')}!`;
  $('#continue').hidden=continued;
  $<HTMLButtonElement>('#submit-score').disabled=false;$('#submit-status').textContent='';
  void loadOverBoard();$<HTMLDialogElement>('#over-dialog').showModal();
}
function pauseGame() { if(engine.getSnapshot().status==='playing') engine.pause(); }
$('#start').onclick=()=>void startRun();$('#restart').onclick=()=>void startRun();
$('#pause').onclick=pauseGame;$('#resume').onclick=()=>{engine.resume();$('#game').focus({preventScroll:true});};
$('#continue').onclick=async()=>{
  const button=$<HTMLButtonElement>('#continue');button.disabled=true;
  if(await ads.rewarded('repair-run')) { continued=true;$<HTMLDialogElement>('#over-dialog').close();engine.revive();notify('Repair complete. Keep driving when you are ready.'); }
  button.disabled=false;
};
$('#close-over').onclick=()=>{$<HTMLDialogElement>('#over-dialog').close();showReadyAfterOver();};
function showReadyAfterOver() {
  $('#ready').hidden=false;$('#ready h2').innerHTML='Back for<br>more chaos?';
}
$('#over-dialog').addEventListener('cancel',()=>showReadyAfterOver());

// Discrete lane controls are shared by keyboard, road taps, swipes and touch buttons.
function steer(direction: -1 | 1) {
  if(view!=='play'||document.querySelector('dialog[open]'))return;
  if(engine.getSnapshot().status==='playing')engine.steer(direction);
  $('#game').focus({preventScroll:true});
}
let pointerStart: {x:number;y:number}|null=null;
$('#drive-shell').addEventListener('pointerdown',e=>{
  if((e.target as HTMLElement).closest('button')||document.querySelector('dialog[open]'))return;
  e.preventDefault();pointerStart={x:e.clientX,y:e.clientY};
});
$('#drive-shell').addEventListener('pointerup',e=>{
  if(!pointerStart)return;const origin=pointerStart;pointerStart=null;
  if((e.target as HTMLElement).closest('button')||view!=='play'||document.querySelector('dialog[open]'))return;
  const status=engine.getSnapshot().status;
  if(status==='ready'||status==='over'){void startRun();return;}
  if(status!=='playing')return;
  const bounds=$('#game').getBoundingClientRect();const delta=e.clientX-origin.x;
  steer(Math.abs(delta)>24?(delta<0?-1:1):(e.clientX<bounds.left+bounds.width/2?-1:1));
});
$('#drive-shell').addEventListener('pointercancel',()=>pointerStart=null);
$('#steer-left').onpointerdown=e=>{e.preventDefault();steer(-1);};
$('#steer-right').onpointerdown=e=>{e.preventDefault();steer(1);};
$('#steer-left').onclick=e=>{if(e.detail===0)steer(-1);};
$('#steer-right').onclick=e=>{if(e.detail===0)steer(1);};
document.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).closest('input,select,textarea,button,a')||document.querySelector('dialog[open]')||view!=='play')return;
  if(['ArrowLeft','ArrowRight','KeyA','KeyD','Space','KeyP','Escape'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='ArrowLeft'||e.code==='KeyA')steer(-1);
  if(e.code==='ArrowRight'||e.code==='KeyD')steer(1);
  if(e.code==='Space'){const status=engine.getSnapshot().status;if(status==='ready'||status==='over')void startRun();}
  if(e.code==='KeyP'||e.code==='Escape'){const status=engine.getSnapshot().status;if(status==='playing')engine.pause();else if(status==='paused')engine.resume();}
});

document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
window.addEventListener('blur',pauseGame);
setInterval(()=>{const snapshot=engine.getSnapshot();$('#pace').textContent=`LEVEL ${String(snapshot.difficulty.level).padStart(2,'0')}`;$('#distance').innerHTML=`${Math.floor(snapshot.distance/10)} <small>m</small>`;},250);

$('#skins').onclick=e=>{
  const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-skin]');if(!button)return;
  if(engine.getSnapshot().status==='playing'||engine.getSnapshot().status==='paused'){notify('Choose your car before the next run.');return;}
  preview=SKINS.find(s=>s.id===button.dataset.skin)!;
  if(unlocked(preview.id)){selected=preview;profile.selectedSkin=selected.id;persist();engine.setSkin(selected);}
  renderSkins();
};
$('#car-detail').onclick=async e=>{
  if(!(e.target as HTMLElement).closest('#unlock-skin'))return;
  if(engine.getSnapshot().status==='playing'||engine.getSnapshot().status==='paused'){notify('Choose your car before the next run.');return;}
  const skin=preview; const button=$<HTMLButtonElement>('#unlock-skin');button.disabled=true;
  if(await ads.rewarded(`unlock-${skin.id}`)){if(!unlocked(skin.id))profile.unlockedSkins.push(skin.id);selected=skin;preview=skin;profile.selectedSkin=skin.id;persist();engine.setSkin(skin);notify(`${skin.name} is ready to roll!`);}
  renderSkins();
};
function setView(next: typeof view) {
  if(next!=='play')pauseGame();view=next;
  $('#play-view').hidden=next!=='play';$('#leaderboard-view').hidden=next!=='leaderboard';
  if(next==='play'&&engine.getSnapshot().status==='over')showReadyAfterOver();
  $('#nav-play').classList.toggle('active',next==='play');$('#nav-board').classList.toggle('active',next==='leaderboard');
  if(next==='leaderboard')void loadBoard();
}
$('#nav-play').onclick=()=>setView('play');$('.brand').onclick=e=>{e.preventDefault();setView('play');};
$('#nav-garage').onclick=()=>{setView('play');pauseGame();$('#garage').scrollIntoView({behavior:'smooth',block:'center'});$('#skins button').focus({preventScroll:true});};
for(const id of ['nav-board','quick-board','over-all-boards'])$('#'+id).onclick=()=>{$<HTMLDialogElement>('#over-dialog').close();setView('leaderboard');window.scrollTo({top:0,behavior:'smooth'});};
$('#back-play').onclick=()=>setView('play');

// Names are always placed through textContent, never interpolated into markup.
function table(entries: LeaderboardEntry[], compact=false): HTMLElement {
  const wrapper=document.createElement('div');wrapper.className=`score-table ${compact?'compact':''}`;
  const head=document.createElement('div');head.className='score-row table-head';head.innerHTML='<span>RANK</span><span>DRIVER</span><span>SCORE</span>';wrapper.append(head);
  if(!entries.length){const empty=document.createElement('p');empty.className='empty-board';empty.textContent='Open road. Be the first driver on this board.';wrapper.append(empty);}
  entries.forEach((entry,i)=>{const row=document.createElement('div');row.className=`score-row ${entry.source==='local'?'your-row':''}`;
    const rank=document.createElement('span');rank.className='rank';rank.textContent=String(i+1).padStart(2,'0');
    const driver=document.createElement('span');driver.className='driver';const name=document.createElement('strong');name.textContent=entry.name;const detail=document.createElement('small');detail.textContent=entry.source==='demo'?`${compact?'Sample driver':entry.continent+' · Sample driver'}`:`${compact?'On this browser':entry.continent+' · On this browser'}`;driver.append(name,detail);
    const score=document.createElement('strong');score.className='row-score';score.textContent=String(entry.score);row.append(rank,driver,score);wrapper.append(row);
  });return wrapper;
}
async function loadBoard(){const request=++boardRequest;try{const rows=await boards.list({scope,continent:$<HTMLSelectElement>('#board-continent').value as Continent,period});if(request===boardRequest)$('#board-table').replaceChildren(table(rows));}catch{notify('Could not load the leaderboard. Please try again.');}}
async function loadOverBoard(){try{$('#over-table').replaceChildren(table(await boards.list({scope:'worldwide',period:'all'}),true));}catch{$('#over-table').textContent='Leaderboard unavailable.';}}
document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope as typeof scope;document.querySelectorAll('[data-scope]').forEach(x=>x.classList.toggle('active',x===b));$('.continent-select').classList.toggle('enabled',scope==='continent');void loadBoard();});
document.querySelectorAll<HTMLButtonElement>('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period as Period;document.querySelectorAll('[data-period]').forEach(x=>x.classList.toggle('active',x===b));void loadBoard();});
for(const id of ['driver-continent','board-continent']){const select=$<HTMLSelectElement>('#'+id);CONTINENTS.forEach(c=>{const option=document.createElement('option');option.value=c;option.textContent=c;select.append(option);});select.value=profile.continent;}
$('#board-continent').onchange=()=>void loadBoard();$<HTMLInputElement>('#driver-name').value=profile.name;
$('#score-form').onsubmit=async e=>{e.preventDefault();const button=$<HTMLButtonElement>('#submit-score');button.disabled=true;try{
  profile.name=$<HTMLInputElement>('#driver-name').value.trim();profile.continent=$<HTMLSelectElement>('#driver-continent').value as Continent;
  if(!profile.name){notify('Enter a driver name first.');button.disabled=false;return;}persist();
  await boards.submit({name:profile.name,score:lastScore,continent:profile.continent,runId});
  $('#submit-status').textContent='Run saved on this browser. Nicely driven!';await loadOverBoard();
}catch{button.disabled=false;$('#submit-status').textContent='Could not save. Please try again.';}};

function info(content: string){pauseGame();$('#info-content').innerHTML=content;$<HTMLDialogElement>('#info-dialog').showModal();}
$('#help').onclick=()=>info(`<span class="eyebrow">CRASH COURSE</span><h2>Keep it between the lines.</h2><p>Use <kbd>←</kbd> / <kbd>→</kbd> or <kbd>A</kbd> / <kbd>D</kbd> to change lanes. On a phone, tap the left/right buttons, tap a side of the road, or swipe across the road.</p><p>Your car sways a little. Stay sharp: dodge random cars, cones and roadwork barricades. Clear an obstacle row to score a point. A crash ends your run.</p><p>Press <kbd>SPACE</kbd> to start or restart. Use <kbd>P</kbd> or <kbd>ESC</kbd> to pause. Leaving the tab also pauses the game.</p><p>Pick your car in the garage before starting. Unlock eight rides with score milestones or an optional reward demo. Speed rises, obstacles grow and the open lane gets tighter as you go.</p>`);
$('#sound').onclick=()=>{profile.sound=!profile.sound;persist();engine.setSound(profile.sound);updateProfileUI();if(engine.getSnapshot().status==='playing')$('#game').focus({preventScroll:true});};
document.querySelectorAll('.remove-trigger').forEach(b=>b.addEventListener('click',()=>info(`<span class="eyebrow">MORE ROAD, FEWER INTERRUPTIONS</span><h2>Drive ad-free.</h2><p>This is a purchase-flow placeholder. No payment is collected. Try the ad-free experience on this browser: it hides the banner and between-run demos. Optional rewarded demos remain available.</p><button class="primary full" id="toggle-ads">${profile.adsRemoved?'Restore ad demo placements':'Enable ad-free preview'}</button><span class="fine-print">Preview only · no charge · no real purchase</span>`)));
$('#info-content').addEventListener('click',e=>{if((e.target as HTMLElement).closest('#toggle-ads')){profile.adsRemoved=!profile.adsRemoved;ads.setAdsDisabled(profile.adsRemoved);persist();updateProfileUI();refreshDisplayAd();$<HTMLDialogElement>('#info-dialog').close();notify(profile.adsRemoved?'Ad-free preview enabled.':'Demo ad placements restored.');}});
$('#about').onclick=()=>info(`<span class="eyebrow">AFTER HOURS ARCADE</span><h2>Drunken Joyride.</h2><p>An endless, fictional arcade drive with unpredictable steering, random traffic and roadworks on a Dutch midnight highway.</p><p>Your record, cars and submitted runs stay on this browser. Leaderboards mix labelled samples with local scores.</p><p>The top advertisement slot supports a configurable display-ad network. Until real publisher and slot IDs are configured, it earns no revenue. Rewarded videos, interstitials and remove-ads purchases are still clearly labelled demos.</p><button class="secondary full" id="open-ad-setup">View advertisement setup</button>`);

document.querySelectorAll<HTMLElement>('[data-close]').forEach(b=>b.onclick=()=>$<HTMLDialogElement>('#'+b.dataset.close).close());
function displayStatus(status: DisplayAdStatus) {
  $('#ad-status').textContent=status==='active'?'LIVE AD':status==='loading'?'LOADING AD':'NO AD AVAILABLE';
  $('#ad-placeholder').hidden=status!=='unavailable';
  $('#display-ad').hidden=status==='unavailable';
  $('#ad-description').textContent=status==='loading'?'Contacting the advertising provider…':'No ad filled this placement. Your game stays ready to play.';
}
function refreshDisplayAd() {
  displayAdCleanup?.();displayAdCleanup=undefined;
  if(profile.adsRemoved)return;
  if(!displayAdConfig){$('#ad-status').textContent='NOT CONNECTED';$('#ad-description').textContent='Reserved for a real sponsor. No ad network connected yet.';$('#ad-placeholder').hidden=false;return;}
  if(!displayAdConsent){$('#ad-status').textContent='CONSENT REQUIRED';$('#ad-description').textContent='An ad provider is configured. Review your advertising preferences.';$('#ad-placeholder').hidden=false;return;}
  $('#display-ad').hidden=false;
  displayAdCleanup=mountDisplayAd($('#display-ad'),displayAdConfig,{consent:true,onStatus:displayStatus});
}
function showAdSetup(){
  info(displayAdConfig
    ? `<span class="eyebrow">ADVERTISEMENT SETTINGS</span><h2>Keep the wheels turning.</h2><p>A Google AdSense publisher and display slot are configured. Display ads request content from Google and may use cookies or other storage. The live operator must also configure a certified consent platform where required.</p><p>You can allow this browser to request display ads, or keep playing without loading the ad provider. This choice lasts for this page visit.</p><button class="primary full" id="allow-display-ads">Allow display ads</button><button class="secondary full" id="decline-display-ads">Continue without display ads</button>`
    : `<span class="eyebrow">REVENUE STARTS WITH A REAL PROVIDER</span><h2>The ad space is ready.</h2><p>This is a reserved banner placement, not a paid advertisement. No income is generated yet.</p><p>To activate display ads, configure an approved AdSense publisher ID and display-slot ID using <code>VITE_ADSENSE_CLIENT</code> and <code>VITE_ADSENSE_SLOT</code>, then rebuild the app. The README explains account approval, consent and deployment configuration.</p><p>Rewarded videos and between-run ads remain demos until a production provider is integrated.</p>`);
}
$('#ad-connect').onclick=showAdSetup;
$('#info-content').addEventListener('click',e=>{
  const target=e.target as HTMLElement;
  if(target.closest('#open-ad-setup')){$<HTMLDialogElement>('#info-dialog').close();showAdSetup();}
  if(target.closest('#allow-display-ads')){displayAdConsent=true;$<HTMLDialogElement>('#info-dialog').close();refreshDisplayAd();}
  if(target.closest('#decline-display-ads')){displayAdConsent=false;displayAdCleanup?.();displayAdCleanup=undefined;$('#display-ad').hidden=true;$('#ad-status').textContent='ADS DECLINED';$('#ad-placeholder').hidden=false;$('#ad-description').textContent='Display ads are off for this visit.';$<HTMLDialogElement>('#info-dialog').close();}
});

updateProfileUI();renderSkins();refreshDisplayAd();


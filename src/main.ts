import './style.css';
import { GameEngine } from './game/engine';
import { SKINS } from './data/skins';
import { loadProfile, saveProfile } from './services/storage';
import { LocalLeaderboardService, CONTINENTS, type Continent, type Period, type LeaderboardEntry } from './services/leaderboard';
import { DemoAdProvider, type AdPlacement } from './services/ads';
import { icon } from './icons';
import { birdSvg } from './bird';

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

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" aria-label="Flappy Nederland home"><span class="brand-mark">${birdSvg(SKINS[0],36)}</span><span>flappy<span class="brand-light">nederland</span><span class="flag"><i></i><i></i><i></i></span></span></a>
    <nav aria-label="Main navigation"><button class="nav-button active" id="nav-play">${icon('play',17)} Play</button><button class="nav-button" id="nav-birds">${icon('bird',18)} The aviary</button><button class="nav-button" id="nav-board">${icon('trophy',18)} Leaderboards</button></nav>
    <div class="header-tools"><button class="icon-button" id="sound" aria-label="Toggle sound"></button><button class="icon-button" id="help" aria-label="How to play">${icon('help')}</button></div>
  </header>
  <main>
    <section class="page-intro"><div><div class="eyebrow"><span class="tiny-line"></span> SMALL BIRD. BIG ADVENTURE.</div><h1>Flappy <span>Nederland.</span></h1></div><p>A little courage. A lot of flapping.<br>How far will you fly?</p></section>
    <div id="play-view">
      <div class="play-layout">
        <section class="game-section" aria-label="Flappy Nederland game">
          <div class="game-bar"><span><span class="live-dot"></span> THE NETHERLANDS <span class="bar-divider">/</span> ENDLESS FLIGHT</span><span id="pace">LEVEL 01</span></div>
          <div class="flight-shell" id="flight-shell">
            <canvas id="game" tabindex="0" aria-label="Game area. Space, click or tap to flap. P to pause."></canvas>
            <div class="game-hud" hidden id="hud"><div><span>SCORE</span><strong id="live-score">0</strong></div><button class="icon-button" id="pause" aria-label="Pause game">${icon('pause')}</button></div>
            <div class="game-overlay" id="ready"><div class="takeoff-tag">GROETJES UIT NEDERLAND</div><h2>Ready for<br>takeoff?</h2><p>Find your rhythm.<br>Make it past the pipes.</p><button class="primary" id="start">Let's fly ${icon('arrow')}</button><span class="start-hint">TAP, CLICK OR PRESS <kbd>SPACE</kbd></span></div>
            <div class="game-overlay pause-overlay" id="paused" hidden><span class="takeoff-tag">TAKE A BREATHER</span><h2>Flight paused.</h2><p>Your adventure can wait.</p><button class="primary" id="resume">Keep flying ${icon('play')}</button></div>
            <div class="game-bottom-label">52°07′ N &nbsp; 05°17′ E <span>THE SKY'S THE LIMIT</span></div>
          </div>
          <div class="controls-strip"><span><kbd>SPACE</kbd> or tap to flap</span><span><kbd>P</kbd> to pause</span><span class="desktop-only">One pipe. One point.</span></div>
        </section>
        <aside class="sidebar">
          <section class="best-card"><div class="best-icon">${icon('trophy',24)}</div><div><span class="eyebrow">YOUR PERSONAL BEST</span><strong id="best">0 <small>pipes</small></strong></div><span class="small-note">A new high<br>is calling.</span></section>
          <section class="aviary-card" id="aviary"><div class="section-heading"><div><span class="eyebrow">PICK YOUR CO-PILOT</span><h2>The aviary</h2></div><span id="collection-count" class="count-pill"></span></div><div class="bird-grid" id="skins"></div><div class="selected-bird" id="bird-detail"></div></section>
          <section class="tip-card"><span class="tip-icon">${icon('spark',21)}</span><div><h3>Easy to flap. Hard to master.</h3><p>The further you fly, the faster it gets. Bigger pipes. Smaller gaps. Bigger bragging rights.</p></div></section>
          <button class="leaderboard-link" id="quick-board"><span>${icon('globe')} A little friendly competition</span>${icon('arrow')}</button>
        </aside>
      </div>
    </div>
    <section class="leaderboard-view" id="leaderboard-view" hidden>
      <div class="board-heading"><div><span class="eyebrow">THE HIGH FLYERS</span><h2>A place in the sky.</h2><p>Ten flights worth chasing. Make yours the next one.</p></div><button class="secondary" id="back-play">Back to game ${icon('arrow')}</button></div>
      <div class="board-toolbar"><div class="tabs" aria-label="Leaderboard region"><button data-scope="worldwide" class="active">Worldwide</button><button data-scope="continent">Continent</button></div><label class="continent-select">Continent<select id="board-continent"></select></label></div>
      <div class="period-tabs" aria-label="Leaderboard time period"><button data-period="all" class="active">All time</button><button data-period="daily">Daily</button><button data-period="weekly">Weekly</button><button data-period="monthly">Monthly</button></div>
      <p class="demo-notice">${icon('help',16)} Local demo · Sample pilots + scores on this browser. A shared global backend is not connected.</p>
      <div id="board-table"></div><p class="board-footnote">Daily, weekly and monthly boards use UTC. Weeks start on Monday.</p>
    </section>
    <div class="banner-slot" id="banner"><span class="ad-label">AD SPACE · DEMO</span><span>A small space that keeps us flying.</span><button class="text-button remove-trigger">Remove ads ${icon('arrow',15)}</button></div>
  </main>
  <footer><span>Made for the joy of one more try.</span><span class="footer-brand">FLAPPY NEDERLAND <span class="orange-dot"></span> EST. 2026</span><button class="text-button" id="about">About this demo</button></footer>
  <dialog id="over-dialog" class="over-dialog"><button class="dialog-x" id="close-over" aria-label="Close game over">${icon('close')}</button><div class="over-layout"><section><span class="eyebrow" id="over-eyebrow">A GOOD DAY TO TRY AGAIN</span><h2>Oeps.<br>Another flight?</h2><p class="over-subtitle">Every great flyer starts somewhere.</p><div class="score-pair"><div><span>THIS FLIGHT</span><strong id="final-score">0</strong></div><div><span>PERSONAL BEST</span><strong id="final-best">0</strong></div></div><p class="unlock-notice" id="unlock-notice" hidden></p><button class="primary full" id="restart">One more try ${icon('restart')}</button><button class="secondary full" id="continue">${icon('play',17)} Continue · reward demo</button><span class="fine-print">One extra life per flight. No real ads.</span><button class="text-button remove-trigger">Remove ads · preview</button></section><section class="over-board"><div class="section-heading"><div><span class="eyebrow">WORLDWIDE · ALL TIME</span><h3>Top 10 flights</h3></div>${icon('trophy',23)}</div><form id="score-form"><div class="name-row"><label>Your pilot name<input id="pilot-name" maxlength="20" placeholder="e.g. Flying Dutchman" required autocomplete="nickname"></label><label>Continent<select id="pilot-continent"></select></label></div><button class="secondary full" type="submit" id="submit-score">Add my flight ${icon('arrow',17)}</button><p id="submit-status" class="fine-print" role="status"></p></form><p class="fine-print demo-caption">LOCAL DEMO · samples are marked</p><div id="over-table" class="over-table"></div><button class="text-button" id="over-all-boards">Explore all leaderboards ${icon('arrow',16)}</button></section></div></dialog>
  <dialog id="info-dialog" class="info-dialog"><button class="dialog-x" data-close="info-dialog" aria-label="Close information">${icon('close')}</button><div id="info-content"></div></dialog>
  <dialog id="ad-dialog" class="info-dialog ad-dialog"><span class="eyebrow">AD PROVIDER PREVIEW</span><div class="demo-ad-art">${birdSvg(SKINS[0],100)}<span>A little pause.<br>A little possibility.</span></div><h2 id="ad-heading">Rewarded ad demo</h2><p>This is a simulated ad placement. No ad network is connected and no money is charged.</p><button class="primary full" id="ad-complete" disabled>Complete demo</button><button class="text-button" id="ad-cancel">Cancel · no reward</button></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;

function persist() { saveProfile(profile); }
function notify(message: string) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').hidden=false; toastTimer=setTimeout(()=>$('#toast').hidden=true,4000); }
function updateProfileUI() {
  $('#best').innerHTML=`${profile.best} <small>pipes</small>`;
  $('#sound').innerHTML=icon(profile.sound ? 'sound':'mute');
  $('#sound').setAttribute('aria-label', profile.sound ? 'Mute sound' : 'Enable sound');
  $('#sound').setAttribute('aria-pressed',String(profile.sound));
  $('#banner').hidden=profile.adsRemoved;
  document.querySelectorAll('.remove-trigger').forEach(el=>el.textContent=profile.adsRemoved?'Ad-free preview enabled':'Remove ads · preview');
}
function unlocked(id: string) { return profile.unlockedSkins.includes(id); }
function renderSkins() {
  $('#collection-count').textContent=`${SKINS.filter(s=>unlocked(s.id)).length} / ${SKINS.length}`;
  $('#skins').innerHTML=SKINS.map(s=>`<button class="skin ${preview.id===s.id?'selected':''} ${!unlocked(s.id)?'locked':''}" data-skin="${s.id}" aria-label="${s.name}, ${unlocked(s.id)?'unlocked':`unlock at ${s.unlockScore} points`}" aria-pressed="${preview.id===s.id}"><span class="skin-state">${selected.id===s.id?icon('check',12):!unlocked(s.id)?icon('lock',11):''}</span>${birdSvg(s,55)}<span class="skin-name">${s.name}</span></button>`).join('');
  const active=unlocked(preview.id);
  $('#bird-detail').innerHTML=`<div><strong>${preview.name}</strong><span>${active ? (selected.id===preview.id?'Your next adventure starts here.':'A new look for your next flight.'):`Reach ${preview.unlockScore} points or complete a reward demo.`}</span></div>${active ? `<span class="selected-label">${icon('check',14)} Selected</span>` : `<button class="reward-button" id="unlock-skin">${icon('play',14)} Unlock · demo</button>`}`;
}
const engine = new GameEngine($('#game'), {skin:selected,sound:profile.sound,onScore:score=>{
  $('#live-score').textContent=String(score);
},onGameOver:finishFlight,onStateChange:status=>{
  $('#ready').hidden=status!=='ready'; $('#paused').hidden=status!=='paused'; $('#hud').hidden=status==='ready'||status==='over';
  document.body.classList.toggle('in-flight',status==='playing');
}});
const ads = new DemoAdProvider(runAdDemo,{adsDisabled:profile.adsRemoved});

function runAdDemo(placement: AdPlacement): Promise<boolean> {
  pauseGame();
  return new Promise(resolve=>{
    if(adResolve) { resolve(false);return; }
    adResolve=resolve; const rewarded=placement==='rewarded'; let seconds=3;
    $('#ad-heading').textContent=rewarded?'Rewarded ad demo':'Between-flights ad demo';
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

async function startFlight() {
  if(starting || adResolve) return; starting=true;
  const old=engine.getSnapshot().status;
  $<HTMLDialogElement>('#over-dialog').close();
  if(old==='over') await ads.interstitial();
  // Run IDs deduplicate local submissions; they are not security credentials.
  runId=globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`; continued=false;lastScore=0;
  $('#submit-status').textContent='';$<HTMLButtonElement>('#submit-score').disabled=false;
  setView('play'); engine.start();starting=false;
  $('#flight-shell').scrollIntoView({behavior:'instant',block:'center'});
  $('#game').focus({preventScroll:true});
}
function finishFlight(score: number) {
  lastScore=score; const oldBest=profile.best;
  profile.best=Math.max(profile.best,score);
  const newly=SKINS.filter(s=>score>=s.unlockScore&&!unlocked(s.id));
  profile.unlockedSkins.push(...newly.map(s=>s.id));persist();updateProfileUI();renderSkins();
  $('#final-score').textContent=String(score);$('#final-best').textContent=String(profile.best);
  $('#over-eyebrow').textContent=score>oldBest?'YOUR NEW PERSONAL BEST!':'A GOOD DAY TO TRY AGAIN';
  $('#unlock-notice').hidden=!newly.length;$('#unlock-notice').textContent=`New co-pilot unlocked: ${newly.map(s=>s.name).join(', ')}!`;
  $('#continue').hidden=continued;
  $<HTMLButtonElement>('#submit-score').disabled=false;$('#submit-status').textContent='';
  void loadOverBoard();$<HTMLDialogElement>('#over-dialog').showModal();
}
function pauseGame() { if(engine.getSnapshot().status==='playing') engine.pause(); }
$('#start').onclick=()=>void startFlight();$('#restart').onclick=()=>void startFlight();
$('#pause').onclick=pauseGame;$('#resume').onclick=()=>{engine.resume();$('#game').focus({preventScroll:true});};
$('#continue').onclick=async()=>{
  const button=$<HTMLButtonElement>('#continue');button.disabled=true;
  if(await ads.rewarded('continue-flight')) { continued=true;$<HTMLDialogElement>('#over-dialog').close();engine.revive();notify('Extra life ready. Keep flying when you are ready.'); }
  button.disabled=false;
};
$('#close-over').onclick=()=>{$<HTMLDialogElement>('#over-dialog').close();showReadyAfterOver();};
function showReadyAfterOver() {
  $('#ready').hidden=false;$('#ready h2').innerHTML='One more<br>adventure?';
}
$('#over-dialog').addEventListener('cancel',()=>showReadyAfterOver());

$('#flight-shell').addEventListener('pointerdown',e=>{
  if((e.target as HTMLElement).closest('button')||view!=='play'||document.querySelector('dialog[open]')) return;
  e.preventDefault();const status=engine.getSnapshot().status;
  if(status==='ready'||status==='over') void startFlight();else if(status==='playing') engine.flap();
});
document.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).closest('input,select,textarea,button,a')||document.querySelector('dialog[open]')||view!=='play')return;
  if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();if(e.repeat)return;const status=engine.getSnapshot().status;if(status==='ready'||status==='over')void startFlight();else if(status==='playing')engine.flap();}
  if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();const status=engine.getSnapshot().status;if(status==='playing')engine.pause();else if(status==='paused')engine.resume();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
window.addEventListener('blur',pauseGame);
setInterval(()=>{const d=engine.getSnapshot().difficulty;$('#pace').textContent=`LEVEL ${String(d.level).padStart(2,'0')}`;},500);

$('#skins').onclick=e=>{
  const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-skin]');if(!button)return;
  if(engine.getSnapshot().status==='playing'||engine.getSnapshot().status==='paused'){notify('Choose your co-pilot before the next flight.');return;}
  preview=SKINS.find(s=>s.id===button.dataset.skin)!;
  if(unlocked(preview.id)){selected=preview;profile.selectedSkin=selected.id;persist();engine.setSkin(selected);}
  renderSkins();
};
$('#bird-detail').onclick=async e=>{
  if(!(e.target as HTMLElement).closest('#unlock-skin'))return;
  if(engine.getSnapshot().status==='playing'||engine.getSnapshot().status==='paused'){notify('Choose your co-pilot before the next flight.');return;}
  const skin=preview; const button=$<HTMLButtonElement>('#unlock-skin');button.disabled=true;
  if(await ads.rewarded(`unlock-${skin.id}`)){if(!unlocked(skin.id))profile.unlockedSkins.push(skin.id);selected=skin;preview=skin;profile.selectedSkin=skin.id;persist();engine.setSkin(skin);notify(`${skin.name} is ready to fly!`);}
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
$('#nav-birds').onclick=()=>{setView('play');pauseGame();$('#aviary').scrollIntoView({behavior:'smooth',block:'center'});$('#skins button').focus({preventScroll:true});};
for(const id of ['nav-board','quick-board','over-all-boards'])$('#'+id).onclick=()=>{$<HTMLDialogElement>('#over-dialog').close();setView('leaderboard');window.scrollTo({top:0,behavior:'smooth'});};
$('#back-play').onclick=()=>setView('play');

// Names are always placed through textContent, never interpolated into markup.
function table(entries: LeaderboardEntry[], compact=false): HTMLElement {
  const wrapper=document.createElement('div');wrapper.className=`score-table ${compact?'compact':''}`;
  const head=document.createElement('div');head.className='score-row table-head';head.innerHTML='<span>RANK</span><span>PILOT</span><span>SCORE</span>';wrapper.append(head);
  if(!entries.length){const empty=document.createElement('p');empty.className='empty-board';empty.textContent='Clear skies. Be the first pilot on this board.';wrapper.append(empty);}
  entries.forEach((entry,i)=>{const row=document.createElement('div');row.className=`score-row ${entry.source==='local'?'your-row':''}`;
    const rank=document.createElement('span');rank.className='rank';rank.textContent=String(i+1).padStart(2,'0');
    const pilot=document.createElement('span');pilot.className='pilot';const name=document.createElement('strong');name.textContent=entry.name;const detail=document.createElement('small');detail.textContent=entry.source==='demo'?`${compact?'Sample pilot':entry.continent+' · Sample pilot'}`:`${compact?'On this browser':entry.continent+' · On this browser'}`;pilot.append(name,detail);
    const score=document.createElement('strong');score.className='row-score';score.textContent=String(entry.score);row.append(rank,pilot,score);wrapper.append(row);
  });return wrapper;
}
async function loadBoard(){const request=++boardRequest;try{const rows=await boards.list({scope,continent:$<HTMLSelectElement>('#board-continent').value as Continent,period});if(request===boardRequest)$('#board-table').replaceChildren(table(rows));}catch{notify('Could not load the leaderboard. Please try again.');}}
async function loadOverBoard(){try{$('#over-table').replaceChildren(table(await boards.list({scope:'worldwide',period:'all'}),true));}catch{$('#over-table').textContent='Leaderboard unavailable.';}}
document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope as typeof scope;document.querySelectorAll('[data-scope]').forEach(x=>x.classList.toggle('active',x===b));$('.continent-select').classList.toggle('enabled',scope==='continent');void loadBoard();});
document.querySelectorAll<HTMLButtonElement>('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period as Period;document.querySelectorAll('[data-period]').forEach(x=>x.classList.toggle('active',x===b));void loadBoard();});
for(const id of ['pilot-continent','board-continent']){const select=$<HTMLSelectElement>('#'+id);CONTINENTS.forEach(c=>{const option=document.createElement('option');option.value=c;option.textContent=c;select.append(option);});select.value=profile.continent;}
$('#board-continent').onchange=()=>void loadBoard();$<HTMLInputElement>('#pilot-name').value=profile.name;
$('#score-form').onsubmit=async e=>{e.preventDefault();const button=$<HTMLButtonElement>('#submit-score');button.disabled=true;try{
  profile.name=$<HTMLInputElement>('#pilot-name').value.trim();profile.continent=$<HTMLSelectElement>('#pilot-continent').value as Continent;
  if(!profile.name){notify('Enter a pilot name first.');button.disabled=false;return;}persist();
  await boards.submit({name:profile.name,score:lastScore,continent:profile.continent,runId});
  $('#submit-status').textContent='Flight saved on this browser. Nicely flown!';await loadOverBoard();
}catch{button.disabled=false;$('#submit-status').textContent='Could not save. Please try again.';}};

function info(content: string){pauseGame();$('#info-content').innerHTML=content;$<HTMLDialogElement>('#info-dialog').showModal();}
$('#help').onclick=()=>info(`<span class="eyebrow">FLIGHT SCHOOL</span><h2>A little flap goes a long way.</h2><p>Tap the sky, click, or press <kbd>SPACE</kbd> to flap upward. Gravity handles the rest. Fly through each gap for one point. Touch a pipe or the ground and your flight is over.</p><p>Press <kbd>P</kbd> or <kbd>ESC</kbd> to pause. We also pause when you leave this tab. Use Keep flying to resume.</p><p>Choose a bird in the aviary before takeoff. Reach score milestones to unlock more birds, or try an optional reward demo.</p><p>The sky gets faster, pipes grow wider, and gaps get tighter the further you go. Good luck, little bird.</p>`);
$('#sound').onclick=()=>{profile.sound=!profile.sound;persist();engine.setSound(profile.sound);updateProfileUI();if(engine.getSnapshot().status==='playing')$('#game').focus({preventScroll:true});};
document.querySelectorAll('.remove-trigger').forEach(b=>b.addEventListener('click',()=>info(`<span class="eyebrow">MORE SKY, FEWER INTERRUPTIONS</span><h2>Fly ad-free.</h2><p>This is a purchase-flow placeholder. No payment is collected. Try the ad-free experience on this browser: it hides the banner and between-flight demos. Optional rewarded demos remain available.</p><button class="primary full" id="toggle-ads">${profile.adsRemoved?'Restore ad demo placements':'Enable ad-free preview'}</button><span class="fine-print">Preview only · no charge · no real purchase</span>`)));
$('#info-content').addEventListener('click',e=>{if((e.target as HTMLElement).closest('#toggle-ads')){profile.adsRemoved=!profile.adsRemoved;ads.setAdsDisabled(profile.adsRemoved);persist();updateProfileUI();$<HTMLDialogElement>('#info-dialog').close();notify(profile.adsRemoved?'Ad-free preview enabled.':'Demo ad placements restored.');}});
$('#about').onclick=()=>info(`<span class="eyebrow">A SMALL GAME WITH DUTCH SOUL</span><h2>Welkom, pilot.</h2><p>Flappy Nederland is a complete browser game with a soft spot for windmills, tulips and the colour orange.</p><p>Your best, birds and submitted scores stay on this browser. Leaderboards mix clearly marked sample pilots with local runs; they are not a live worldwide ranking.</p><p>All ad and purchase placements are demos. No ad network, payment provider or tracking script is connected. Clearing browser data resets your collection.</p>`);
document.querySelectorAll<HTMLElement>('[data-close]').forEach(b=>b.onclick=()=>$<HTMLDialogElement>('#'+b.dataset.close).close());
updateProfileUI();renderSkins();

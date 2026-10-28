import './style.css';
import { GameEngine } from './game/engine';
import { SKINS } from './data/skins';
import { loadProfile, saveProfile } from './services/storage';
import { LocalLeaderboardService, CONTINENTS, type Continent, type Period, type LeaderboardEntry } from './services/leaderboard';
import { DemoAdProvider, getDisplayAdConfig, mountDisplayAd, type AdPlacement, type DisplayAdStatus } from './services/ads';
import { icon } from './icons';
import { carSvg } from './car';
import { UPGRADE_DEFINITIONS, upgradeCost, upgradeEffects, type UpgradeId } from './data/upgrades';
import { creditRun, purchaseUpgrade } from './services/economy';

const $ = <T extends HTMLElement = HTMLElement>(q: string) => document.querySelector<T>(q)!;
const profile = loadProfile();
const boards = new LocalLeaderboardService();
let selected = SKINS.find(s => s.id === profile.selectedSkin) || SKINS[0];
let preview = selected;
let runId = '';
let lastScore = 0;
let continued = false;
let starting = false;
let view: 'play' | 'leaderboard' | 'garage' = 'play';
let scope: 'worldwide' | 'continent' = 'worldwide';
let period: Period = 'all';
let boardRequest = 0;
let toastTimer: ReturnType<typeof setTimeout>;
let adResolve: ((result: boolean) => void) | undefined;
let adTimer: ReturnType<typeof setInterval> | undefined;
let displayAdCleanup: (()=>void)|undefined;
let displayAdConsent=false;
// The native build is an offline game; display ads belong to the hosted website.
const displayAdConfig=['http:','https:'].includes(location.protocol)?getDisplayAdConfig():null;
let peakCombo=1;
let lastNearMisses=0;
let riskTimer: ReturnType<typeof setTimeout>;

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" aria-label="Drunken Joyride home"><span class="brand-mark">${icon('car',29)}</span><span>DRUNKEN<span class="brand-light">JOYRiDE<span class="brand-dot">.</span></span></span></a>
    <nav aria-label="Main navigation"><button class="nav-button active" id="nav-play">${icon('road',17)} Drive</button><button class="nav-button" id="nav-garage">${icon('car',18)} Garage</button><button class="nav-button" id="nav-board">${icon('trophy',18)} Leaderboards</button></nav>
    <div class="header-tools"><button class="wallet-pill" id="open-wallet" aria-label="Open upgrade garage"><span>PTS</span><strong id="wallet-balance">0</strong></button><span class="arcade-badge">NIGHT SHIFT · V2.2</span><button class="icon-button" id="sound" aria-label="Toggle sound"></button><button class="icon-button" id="help" aria-label="How to play">${icon('help')}</button></div>
  </header>
  <main>
    <section class="page-intro"><div><div class="eyebrow"><span class="tiny-line"></span> AFTER HOURS. ALL GAS.</div><h1>Bad decisions.<br><span>Great reflexes.</span></h1></div><div class="intro-side"><span class="route-tag">A2 &nbsp; / &nbsp; THE NETHERLANDS</span><p>Cut tighter gaps. Chain bigger combos.<br>Speed is the easy part.</p></div></section>
    <section class="banner-slot" id="banner" aria-label="Advertisement">
      <div class="ad-rail"><span class="ad-label">ADVERTISEMENT</span><span id="ad-status">NOT CONNECTED</span></div>
      <div id="display-ad"></div>
      <div class="ad-placeholder" id="ad-placeholder"><div class="ad-placeholder-mark">${icon('spark',24)}</div><div><strong>This space keeps the wheels turning.</strong><span id="ad-description">Reserved for a real sponsor. No ad network connected yet.</span></div><button class="secondary small" id="ad-connect">Ad setup ${icon('arrow',15)}</button></div>
    </section>
    <div id="play-view">
      <div class="play-layout">
        <section class="game-section" aria-label="Drunken Joyride game">
          <div class="game-bar"><span><span class="live-dot"></span> LIVE RUN <span class="bar-divider">/</span> A2 AFTER DARK</span><span id="pace">CITY RUN · LV 01</span></div>
          <div class="drive-shell" id="drive-shell">
            <canvas id="game" tabindex="0" aria-label="Game area. Left and right arrows or A and D to steer. P to pause."></canvas>
            <div class="game-hud" hidden id="hud"><div><span>SCORE <b id="combo">×1</b></span><strong id="live-score">0</strong></div><div class="speed-readout"><strong id="speed">0</strong><span>KM/H</span></div><div class="distance-readout"><span>DISTANCE</span><strong id="distance">0 <small>m</small></strong></div><button class="icon-button" id="pause" aria-label="Pause game">${icon('pause')}</button></div>
            <div class="risk-callout" id="risk-callout" hidden>NEAR MISS</div><div class="game-overlay" id="ready"><div class="takeoff-tag">NO BRAKES. JUST REFLEXES.</div><h2>Thread the gap.<br>Own the night.</h2><p>Hold to steer. Cut gaps. Chain near misses.<br>Boost harder. Risk everything.</p><button class="primary" id="start">Hit the road ${icon('arrow')}</button><span class="start-hint">HOLD ARROWS / A &amp; D <span>·</span> SPACE TO BOOST</span></div>
            <div class="game-overlay pause-overlay" id="paused" hidden><span class="takeoff-tag">PULL OVER FOR A SECOND</span><h2>Engine idling.</h2><p>Your run is safe right here.</p><button class="primary" id="resume">Keep driving ${icon('play')}</button></div>
            <div class="game-bottom-label"><span>DRUNKEN JOYRIDE</span><span>ALL SKILL. NO BRAKES.</span></div>
          </div>
          <div class="steering-controls" aria-label="Touch steering"><button id="steer-left" aria-label="Steer left"><span>←</span> LEFT</button><button class="boost-control" id="boost" aria-label="Activate boost"><span>${icon('spark',23)} BOOST</span><span class="boost-track"><i id="boost-fill"></i></span><small id="boost-caption">SPACE / SHIFT</small></button><button id="steer-right" aria-label="Steer right">RIGHT <span>→</span></button></div>
          <div class="controls-strip"><span><kbd>←</kbd><kbd>→</kbd> HOLD TO STEER</span><span><kbd>SPACE</kbd> BOOST</span><span><kbd>P</kbd> PAUSE</span></div>
        </section>
        <aside class="sidebar">
          <section class="best-card"><div class="best-icon">${icon('trophy',25)}</div><div><span class="eyebrow">YOUR BEST RUN</span><strong id="best">0 <small>points</small></strong></div><span class="small-note">BEAT<br>YOURSELF.</span></section>
          <section class="bank-card"><span class="eyebrow">DRIVE. BANK. UPGRADE. REPEAT.</span><div class="bank-total"><strong id="wallet-side">0</strong><span>spendable points</span></div><p id="upgrade-ready">Earn points on the road. Build a better ride.</p><button class="primary full" id="open-workshop">Tune your ride ${icon('wrench',17)}</button><div class="active-tuning" id="active-tuning"></div></section>
          <section class="contracts-card"><div class="section-heading"><div><span class="eyebrow">MAKE THIS RUN COUNT</span><h3>Night contracts</h3></div><span class="count-pill" id="contract-count">0 / 3</span></div><div class="contract" id="contract-near"><div><strong>Needlework</strong><span>3 near misses</span></div><span class="contract-progress" id="near-progress">0 / 3</span></div><div class="contract" id="contract-distance"><div><strong>Long way home</strong><span>Drive 400 metres</span></div><span class="contract-progress" id="distance-progress">0 / 400</span></div><div class="contract" id="contract-combo"><div><strong>Risk collector</strong><span>Reach a ×4 combo</span></div><span class="contract-progress" id="combo-progress">×1 / ×4</span></div><p>Close passes build combo and recharge boost. A boost makes you faster, not invincible.</p></section>
          <button class="leaderboard-link" id="quick-board"><span>${icon('globe')} See who owns the night</span>${icon('arrow')}</button>
          <button class="remove-trigger garage-remove">${icon('shield',16)} Remove ads · preview</button>
        </aside>
      </div>
    </div>

    <section id="garage-view" class="garage-view" hidden>
      <div class="workshop-heading"><div><span class="eyebrow">EVERY RUN BUILDS YOUR NEXT ONE</span><h2>Earn it. Tune it.<br><span>Go again.</span></h2><p>Permanent upgrades for every car. Better runs pay for better upgrades.</p></div><div class="garage-balance"><span>AVAILABLE TO SPEND</span><strong id="garage-wallet">0</strong><small>POINTS</small></div></div>
      <div class="garage-toolbar"><p id="tuning-status">Tuning activates on your next run. Spending points never lowers your best score.</p><button class="secondary" id="garage-back">Back to the road ${icon('arrow',17)}</button></div>
      <section id="workshop" class="workshop" aria-label="Permanent car upgrades"><div class="section-heading"><div><span class="eyebrow">THE WORKSHOP</span><h3>Small investments. Bigger nights.</h3></div><span id="upgrade-total" class="count-pill">0 upgrades</span></div><div id="upgrade-grid" class="upgrade-grid"></div></section>
      <div class="garage-bottom"><section class="garage-card" id="garage"><div class="section-heading"><div><span class="eyebrow">CHOOSE YOUR BAD IDEA</span><h2>The garage<span>.</span></h2></div><span id="collection-count" class="count-pill"></span></div><div class="car-grid" id="skins"></div><div class="selected-car" id="car-detail"></div></section><section class="economy-explainer"><span class="eyebrow">HOW THE LOOP WORKS</span><h3>Every point has a job.</h3><ol><li><strong>Drive and earn.</strong><span>Overtakes, close passes and combos bank points as you play.</span></li><li><strong>Spend in the workshop.</strong><span>Choose more speed, tighter control, stronger nitro or more points per overtake.</span></li><li><strong>Go further, earn faster.</strong><span>Upgrades stay unlocked for every future run. Each next level costs more.</span></li></ol><div class="lifetime-stat"><span>TOTAL POINTS EARNED</span><strong id="lifetime-earned">0</strong></div></section></div>
    </section>
    <section class="leaderboard-view" id="leaderboard-view" hidden>
      <div class="board-heading"><div><span class="eyebrow">THE NIGHT SHIFT</span><h2>Legends of the fast lane.</h2><p>Ten runs worth chasing. Put your name on the asphalt.</p></div><button class="secondary" id="back-play">Back to game ${icon('arrow')}</button></div>
      <div class="board-toolbar"><div class="tabs" aria-label="Leaderboard region"><button data-scope="worldwide" class="active">Worldwide</button><button data-scope="continent">Continent</button></div><label class="continent-select">Continent<select id="board-continent"></select></label></div>
      <div class="period-tabs" aria-label="Leaderboard time period"><button data-period="all" class="active">All time</button><button data-period="daily">Daily</button><button data-period="weekly">Weekly</button><button data-period="monthly">Monthly</button></div>
      <p class="demo-notice">${icon('help',16)} Local demo · Sample drivers + runs on this browser. No shared backend connected.</p>
      <div id="board-table"></div><p class="board-footnote">Daily, weekly and monthly boards use UTC. Weeks start on Monday.</p>
    </section>
  </main>
  <footer><span>A fictional arcade trip. Made for one more run.</span><span class="footer-brand">DRUNKEN JOYRIDE <span class="orange-dot"></span> AFTER HOURS ARCADE</span><button class="text-button" id="about">About &amp; ads</button></footer>
  <dialog id="over-dialog" class="over-dialog" aria-label="Run over"><button class="dialog-x" id="close-over" aria-label="Close game over">${icon('close')}</button><div class="over-layout"><section><span class="eyebrow" id="over-eyebrow">THAT'LL LEAVE A MARK</span><h2>Wrecked.<br>Run it back?</h2><p class="over-subtitle">The road won this round.</p><div class="score-pair"><div><span>THIS RUN</span><strong id="final-score">0</strong></div><div><span>PERSONAL BEST</span><strong id="final-best">0</strong></div></div><div class="run-stats"><div><strong id="final-distance">0m</strong><span>DISTANCE</span></div><div><strong id="final-near">0</strong><span>NEAR MISSES</span></div><div><strong id="final-combo">×1</strong><span>PEAK COMBO</span></div></div><p class="run-verdict" id="run-verdict">Keep it close. Keep it clean.</p><div class="banked-summary"><span>POINTS BANKED THIS RUN</span><strong id="run-banked">+0</strong><small>Ready to invest in permanent upgrades.</small></div><button class="secondary full workshop-from-over" id="over-workshop">Spend points on upgrades ${icon('wrench',17)}</button><p class="unlock-notice" id="unlock-notice" hidden></p><button class="primary full" id="restart">One more run ${icon('restart')}</button><button class="secondary full" id="continue">${icon('wrench',17)} Repair &amp; continue · demo</button><span class="fine-print">One repair per run. Reward ad is a demo.</span><button class="text-button remove-trigger">Remove ads · preview</button></section><section class="over-board"><div class="section-heading"><div><span class="eyebrow">WORLDWIDE · ALL TIME</span><h3>Top 10 drivers</h3></div>${icon('trophy',23)}</div><form id="score-form"><div class="name-row"><label>Your driver name<input id="driver-name" maxlength="20" placeholder="e.g. Midnight Racer" required autocomplete="nickname"></label><label>Continent<select id="driver-continent"></select></label></div><button class="secondary full" type="submit" id="submit-score">Save my run ${icon('arrow',17)}</button><p id="submit-status" class="fine-print" role="status"></p></form><p class="fine-print demo-caption">LOCAL DEMO · samples are marked</p><div id="over-table" class="over-table"></div><button class="text-button" id="over-all-boards">Explore all leaderboards ${icon('arrow',16)}</button></section></div></dialog>
  <dialog id="info-dialog" class="info-dialog" aria-label="Game information"><button class="dialog-x" data-close="info-dialog" aria-label="Close information">${icon('close')}</button><div id="info-content"></div></dialog>
  <dialog id="ad-dialog" class="info-dialog ad-dialog" aria-label="Simulated reward advertisement"><span class="eyebrow">AD PROVIDER PREVIEW</span><div class="demo-ad-art">${carSvg(SKINS[0],100)}<span>Pit stop.<br>Big comeback.</span></div><h2 id="ad-heading">Rewarded ad demo</h2><p>This is a simulated reward placement. No real video ad is connected and no money is charged.</p><button class="primary full" id="ad-complete" disabled>Complete demo</button><button class="text-button" id="ad-cancel">Cancel · no reward</button></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;

function persist() { saveProfile(profile); }
function notify(message: string) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').hidden=false; toastTimer=setTimeout(()=>$('#toast').hidden=true,4000); }
function updateProfileUI() {
  $('#best').innerHTML=`${profile.best} <small>points</small>`;
  updateWalletUI();
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
const engine = new GameEngine($('#game'), {skin:selected,sound:profile.sound,upgrades:profile.upgrades,onScore:score=>{
  $('#live-score').textContent=String(score);
  if(runId&&creditRun(profile,runId,score)>0){persist();updateWalletUI();if(view==='garage')renderUpgrades();}
},onGameOver:finishRun,onStateChange:status=>{
  $('#ready').hidden=status!=='ready'; $('#paused').hidden=status!=='paused'; $('#hud').hidden=status==='ready'||status==='over';
  document.body.classList.toggle('in-run',status==='playing');
  if(status!=='playing')clearControls();
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
    adTimer=setInterval(()=>{seconds--;complete.textContent=seconds>0?`Demo ready in ${seconds}…`:rewarded?'Complete demo & claim reward':'Back to the road';if(seconds<=0){clearInterval(adTimer);complete.disabled=false;}},1000);
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
  setView('play'); peakCombo=1;lastNearMisses=0;clearTimeout(riskTimer);$('#risk-callout').hidden=true;clearControls();engine.setUpgrades(profile.upgrades);engine.setSkin(selected);engine.start();starting=false;updateTelemetry();
  $('#drive-shell').scrollIntoView({behavior:'instant',block:'center'});
  $('#game').focus({preventScroll:true});
}
function finishRun(score: number) {
  updateTelemetry();
  const snapshot=engine.getSnapshot();
  $('#final-distance').textContent=Math.floor(snapshot.distance/10)+'m';
  $('#final-near').textContent=String(snapshot.nearMisses);
  $('#final-combo').textContent='×'+peakCombo;
  const completed=[snapshot.nearMisses>=3,snapshot.distance>=4000,peakCombo>=4].filter(Boolean).length;
  $('#run-verdict').textContent=completed===3?'NIGHT SHIFT COMPLETE · 3/3 CONTRACTS':completed>0?`${completed}/3 CONTRACTS COMPLETE · RUN IT BACK`:snapshot.distance>1200?'GOOD PACE. NOW CHASE THE NEAR MISSES.':'THE NIGHT DOES NOT GIVE SECOND CHANCES.';
  const paidNow=creditRun(profile,runId,score);if(paidNow>0)persist();
  $('#run-banked').textContent='+'+score.toLocaleString();
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

// Input state is continuous; release/cancel/blur always neutralises the steering.
const heldKeys=new Set<string>();
let touchSteering: -1|0|1=0;
let roadPointer: number|null=null;
function gameHasInput(){return view==='play'&&!document.querySelector('dialog[open]')&&engine.getSnapshot().status==='playing';}
function updateSteering(){
  const left=heldKeys.has('ArrowLeft')||heldKeys.has('KeyA');
  const right=heldKeys.has('ArrowRight')||heldKeys.has('KeyD');
  engine.setSteering(touchSteering||((Number(right)-Number(left)) as -1|0|1));
}
function clearControls(){heldKeys.clear();touchSteering=0;roadPointer=null;engine.setSteering(0);engine.setTargetX(null);}
function activateBoost(){
  if(!gameHasInput())return;
  if(!engine.boost())notify('Boost needs 35 charge. Pass traffic closely to refill.');
  $('#game').focus({preventScroll:true});
}
$('#boost').onclick=activateBoost;
function targetPointer(e:PointerEvent){
  const bounds=$('#game').getBoundingClientRect();
  engine.setTargetX((e.clientX-bounds.left)/bounds.width);
}
$('#drive-shell').addEventListener('pointerdown',e=>{
  if((e.target as HTMLElement).closest('button')||document.querySelector('dialog[open]'))return;
  e.preventDefault();roadPointer=e.pointerId;$('#drive-shell').setPointerCapture(e.pointerId);
  if(gameHasInput()){targetPointer(e);$('#game').focus({preventScroll:true});}
});
$('#drive-shell').addEventListener('pointermove',e=>{if(roadPointer===e.pointerId&&gameHasInput())targetPointer(e);});
$('#drive-shell').addEventListener('pointerup',e=>{
  if(roadPointer!==e.pointerId)return;
  roadPointer=null;engine.setTargetX(null);
  if((e.target as HTMLElement).closest('button')||view!=='play'||document.querySelector('dialog[open]'))return;
  const status=engine.getSnapshot().status;
  if(status==='ready'||status==='over')void startRun();
});
$('#drive-shell').addEventListener('pointercancel',()=>{roadPointer=null;engine.setTargetX(null);});
for(const [id,direction] of [['steer-left',-1],['steer-right',1]] as const){
  const button=$('#'+id);
  button.onpointerdown=e=>{e.preventDefault();if(!gameHasInput())return;touchSteering=direction;button.setPointerCapture(e.pointerId);updateSteering();$('#game').focus({preventScroll:true});};
  button.onpointerup=()=>{touchSteering=0;updateSteering();};
  button.onpointercancel=()=>{touchSteering=0;updateSteering();};
  button.onlostpointercapture=()=>{touchSteering=0;updateSteering();};
  // Keyboard activation of a focused touch button gives one short steering pulse.
  button.onclick=e=>{if(e.detail!==0||!gameHasInput())return;engine.steer(direction);$('#game').focus({preventScroll:true});};
}
document.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).closest('input,select,textarea,button,a')||document.querySelector('dialog[open]')||view!=='play')return;
  if(['ArrowLeft','ArrowRight','KeyA','KeyD','Space','ShiftLeft','ShiftRight','KeyP','Escape'].includes(e.code))e.preventDefault();
  if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)){if(gameHasInput()){heldKeys.add(e.code);updateSteering();}return;}
  if(e.repeat)return;
  if(e.code==='Space'){const status=engine.getSnapshot().status;if(status==='ready'||status==='over')void startRun();else if(status==='playing')activateBoost();}
  if(e.code==='ShiftLeft'||e.code==='ShiftRight')activateBoost();
  if(e.code==='KeyP'||e.code==='Escape'){const status=engine.getSnapshot().status;if(status==='playing')engine.pause();else if(status==='paused')engine.resume();}
});
document.addEventListener('keyup',e=>{heldKeys.delete(e.code);updateSteering();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});
window.addEventListener('blur',pauseGame);
function updateTelemetry(){
  const snapshot=engine.getSnapshot();
  peakCombo=Math.max(peakCombo,snapshot.combo);
  $('#pace').textContent=snapshot.sector+' · LV '+String(snapshot.difficulty.level).padStart(2,'0');
  $('#distance').innerHTML=`${Math.floor(snapshot.distance/10)} <small>m</small>`;
  $('#speed').textContent=String(Math.round(snapshot.speedKph));
  $('#combo').textContent='×'+snapshot.combo;
  $('#combo').classList.toggle('hot',snapshot.combo>1);
  $('#boost-fill').style.width=snapshot.boostCharge+'%';
  $('#boost-caption').textContent=snapshot.boostActive?'BOOST ACTIVE':Math.floor(snapshot.boostCharge)+'% · SPACE / SHIFT';
  $<HTMLButtonElement>('#boost').disabled=snapshot.status!=='playing'||snapshot.boostCharge<35||snapshot.boostActive;
  $('#boost').classList.toggle('boosting',snapshot.boostActive);
  if(snapshot.nearMisses>lastNearMisses&&snapshot.status==='playing'){
    clearTimeout(riskTimer);$('#risk-callout').textContent='NEAR MISS · ×'+snapshot.combo;$('#risk-callout').hidden=false;
    riskTimer=setTimeout(()=>$('#risk-callout').hidden=true,1100);
  }
  lastNearMisses=snapshot.nearMisses;
  const goals=[snapshot.nearMisses>=3,snapshot.distance>=4000,peakCombo>=4];
  $('#near-progress').textContent=Math.min(3,snapshot.nearMisses)+' / 3';
  $('#distance-progress').textContent=Math.min(400,Math.floor(snapshot.distance/10))+' / 400';
  $('#combo-progress').textContent='×'+Math.min(4,peakCombo)+' / ×4';
  ['near','distance','combo'].forEach((key,i)=>$('#contract-'+key).classList.toggle('complete',goals[i]));
  $('#contract-count').textContent=goals.filter(Boolean).length+' / 3';
}
setInterval(updateTelemetry,100);

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
  $('#play-view').hidden=next!=='play';$('#leaderboard-view').hidden=next!=='leaderboard';$('#garage-view').hidden=next!=='garage';
  if(next==='garage')renderUpgrades();
  if(next==='play'&&engine.getSnapshot().status==='over')showReadyAfterOver();
  if(next==='play')$('#game').focus({preventScroll:true});
  $('#nav-play').classList.toggle('active',next==='play');$('#nav-board').classList.toggle('active',next==='leaderboard');$('#nav-garage').classList.toggle('active',next==='garage');
  if(next==='leaderboard')void loadBoard();
}
$('#nav-play').onclick=()=>setView('play');$('.brand').onclick=e=>{e.preventDefault();setView('play');};
function openGarage(){$<HTMLDialogElement>('#over-dialog').close();setView('garage');window.scrollTo({top:0,behavior:'smooth'});}
$('#nav-garage').onclick=openGarage;
$('#open-wallet').onclick=openGarage;
$('#open-workshop').onclick=openGarage;
$('#over-workshop').onclick=openGarage;
$('#garage-back').onclick=()=>setView('play');
for(const id of ['nav-board','quick-board','over-all-boards'])$('#'+id).onclick=()=>{$<HTMLDialogElement>('#over-dialog').close();setView('leaderboard');window.scrollTo({top:0,behavior:'smooth'});};
$('#back-play').onclick=()=>setView('play');


const formatPoints=(value:number)=>value.toLocaleString();
const upgradeIcons:Record<UpgradeId,string>={engine:'gauge',handling:'steer',nitro:'spark',magnet:'trophy'};
function effectLabel(id:UpgradeId,level:number):string{
  const levels={...profile.upgrades,[id]:level};const effect=upgradeEffects(levels);
  if(id==='engine')return '+'+Math.round((effect.speedMultiplier-1)*100)+'% road speed';
  if(id==='handling')return '+'+Math.round((effect.steeringMultiplier-1)*100)+'% steering · '+Math.round((1-effect.swayMultiplier)*100)+'% less sway';
  if(id==='nitro')return (1.7*effect.boostDurationMultiplier).toFixed(1)+'s boost · +'+Math.round((effect.boostRechargeMultiplier-1)*100)+'% recharge';
  return '×'+effect.scoreMultiplier.toFixed(2)+' points per reward';
}
function updateWalletUI(){
  const balance=formatPoints(profile.wallet);
  $('#wallet-balance').textContent=balance;$('#wallet-side').textContent=balance;$('#garage-wallet').textContent=balance;
  $('#lifetime-earned').textContent=formatPoints(profile.lifetimeEarned);
  const affordable=UPGRADE_DEFINITIONS.filter(item=>upgradeCost(item.id,profile.upgrades[item.id])<=profile.wallet).length;
  $('#upgrade-ready').textContent=affordable?`${affordable} upgrades affordable. Put your points to work.`:'Keep driving. Every banked point gets you closer to your next upgrade.';
  const effects=upgradeEffects(profile.upgrades);
  $('#active-tuning').innerHTML=`<span>NEXT RUN</span><strong>+${Math.round((effects.speedMultiplier-1)*100)}% speed</strong><strong>×${effects.scoreMultiplier.toFixed(2)} points</strong>`;
}
function renderUpgrades(){
  updateWalletUI();
  $('#tuning-status').textContent=engine.getSnapshot().status==='paused'?'Your current run is paused. Purchases activate on the NEXT run; return to resume this one.':'Tuning activates on your next run. Spending points never lowers your best score.';
  $('#upgrade-total').textContent=Object.values(profile.upgrades).reduce((sum,level)=>sum+level,0)+' upgrade levels';
  $('#upgrade-grid').innerHTML=UPGRADE_DEFINITIONS.map(item=>{
    const level=profile.upgrades[item.id],cost=upgradeCost(item.id,level),canBuy=profile.wallet>=cost&&cost<Number.MAX_SAFE_INTEGER;
    const description=item.id==='engine'?'More speed means more road and more scoring opportunities.':item.id==='handling'?'Tighter steering, faster response and less drunken sway.':item.id==='nitro'?'Longer boosts and faster charge from every source.':'Multiply every score reward. More points to reinvest.';
    return `<article class="upgrade-card"><div class="upgrade-card-top"><span class="upgrade-icon">${icon(upgradeIcons[item.id],25)}</span><span class="upgrade-level">LEVEL ${level}</span></div><h3>${item.name}</h3><p>${description}</p><div class="upgrade-effect"><span>CURRENT</span><strong>${effectLabel(item.id,level)}</strong><span>NEXT LEVEL</span><strong>${effectLabel(item.id,level+1)}</strong></div><button class="upgrade-buy ${canBuy?'affordable':''}" data-upgrade="${item.id}" ${canBuy?'':'disabled'} aria-label="Upgrade ${item.name} for ${cost} points"><span>${canBuy?'Upgrade':'Need '+formatPoints(Math.max(0,cost-profile.wallet))+' more'}</span><strong>${formatPoints(cost)} <small>PTS</small></strong></button></article>`;
  }).join('');
}
$('#upgrade-grid').onclick=e=>{
  const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-upgrade]');if(!button)return;
  const id=button.dataset.upgrade as UpgradeId;const result=purchaseUpgrade(profile,id);
  if(!result.ok){notify(result.reason==='insufficient'?'Not enough banked points yet.':'This upgrade cannot be purchased.');renderUpgrades();return;}
  persist();engine.setUpgrades(profile.upgrades);renderUpgrades();
  notify(UPGRADE_DEFINITIONS.find(item=>item.id===id)!.name+' upgraded to level '+result.level+'. Active next run.');
};

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
$('#help').onclick=()=>info(`<span class="eyebrow">CRASH COURSE · NIGHT SHIFT</span><h2>Close counts.<br>Contact doesn't.</h2><p><strong>Hold</strong> <kbd>←</kbd> / <kbd>→</kbd> or <kbd>A</kbd> / <kbd>D</kbd> to steer freely across the road. On a phone, hold the left/right controls or drag your car's target across the road.</p><p>Pass close to traffic to earn <strong>near misses</strong>. They grow your combo up to ×5 and refill boost. Combo fades when you stop taking risks. Watch traffic indicators: other drivers can change lanes.</p><p>Press <kbd>SPACE</kbd> or <kbd>SHIFT</kbd>, or tap BOOST, to spend 35 charge on a burst of speed. Boost adds speed and scoring potential; it never makes you invincible.</p><p>City streets, canal expressways, tunnels and roadworks change the rhythm. Trucks, narrowing gaps and denser traffic demand real steering. Clear the three night contracts for a complete run.</p><p>Press <kbd>SPACE</kbd> to start/restart; <kbd>P</kbd> or <kbd>ESC</kbd> pauses. One optional rewarded repair is available per run. Car skins stay cosmetic. Permanent workshop upgrades improve speed, handling, nitro and point earnings for every car.</p>`);
$('#sound').onclick=()=>{profile.sound=!profile.sound;persist();engine.setSound(profile.sound);updateProfileUI();if(engine.getSnapshot().status==='playing')$('#game').focus({preventScroll:true});};
document.querySelectorAll('.remove-trigger').forEach(b=>b.addEventListener('click',()=>info(`<span class="eyebrow">MORE ROAD, FEWER INTERRUPTIONS</span><h2>Drive ad-free.</h2><p>This is a purchase-flow placeholder. No payment is collected. Try the ad-free experience on this browser: it hides the banner and between-run demos. Optional rewarded demos remain available.</p><button class="primary full" id="toggle-ads">${profile.adsRemoved?'Restore ad demo placements':'Enable ad-free preview'}</button><span class="fine-print">Preview only · no charge · no real purchase</span>`)));
$('#info-content').addEventListener('click',e=>{if((e.target as HTMLElement).closest('#toggle-ads')){profile.adsRemoved=!profile.adsRemoved;ads.setAdsDisabled(profile.adsRemoved);persist();updateProfileUI();refreshDisplayAd();$<HTMLDialogElement>('#info-dialog').close();notify(profile.adsRemoved?'Ad-free preview enabled.':'Demo ad placements restored.');}});
$('#about').onclick=()=>info(`<span class="eyebrow">AFTER HOURS ARCADE</span><h2>Drunken Joyride.</h2><p>An endless, fictional arcade drive with unpredictable steering, random traffic and roadworks on a Dutch midnight highway. Bank points while driving, then reinvest them in permanent garage upgrades to go faster and earn more.</p><p>Your record, cars and submitted runs stay on this browser. Leaderboards mix labelled samples with local scores.</p><p>The top advertisement slot supports a configurable display-ad network. Until real publisher and slot IDs are configured, it earns no revenue. Rewarded videos, interstitials and remove-ads purchases are still clearly labelled demos.</p><button class="secondary full" id="open-ad-setup">View advertisement setup</button>`);

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

updateProfileUI();renderSkins();renderUpgrades();refreshDisplayAd();


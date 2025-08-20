// River Ranger — E. coli Invaders (dashboard embed) v6.2
// - Click-to-start, high-score table, time bonus per level
// - Level 5 (purple boss): faster fire cadence + 30 HP, double big shots
// - Shooter limiting: only 1–3 invaders fire per volley (grid/random), up to 2 in boss trio

(function(){
  const canvas = document.getElementById('ecoliGame');
  const ctx = canvas.getContext('2d');

  const startOverlay = document.getElementById('gameStart');
  const startBtn = document.getElementById('gameStartBtn');

  const overlay = document.getElementById('gameOverlay');
  const overlayTitle = document.getElementById('gameOverlayTitle');
  const finalScore = document.getElementById('gameFinalScore');
  const victoryMsg = document.getElementById('gameVictoryMsg');
  const celebrate = document.getElementById('gameCelebrate');

  const initialsInput = document.getElementById('gameInitials');
  const saveScoreBtn = document.getElementById('gameSaveScore');
  const restartBtn = document.getElementById('gameRestart');
  const toast = document.getElementById('gameToast');

  const hud = {
    score: document.getElementById('gameScore'),
    lives: document.getElementById('gameLives'),
    level: document.getElementById('gameLevel'),
    hsBody: document.getElementById('gameHsBody')
  };

  const W = canvas.width, H = canvas.height;

  function loadHighScores(){ try{ return JSON.parse(localStorage.getItem('ecoli_invaders_highscores')||'[]'); }catch(e){ return []; } }
  function saveHighScores(list){ localStorage.setItem('ecoli_invaders_highscores', JSON.stringify(list)); }
  function addHighScore(initials, score){
    const list = loadHighScores();
    list.push({ initials, score, when: new Date().toISOString().slice(0,10) });
    list.sort((a,b)=>b.score - a.score);
    saveHighScores(list.slice(0,10));
    renderHighScores();
  }
  function renderHighScores(){
    const list = loadHighScores();
    hud.hsBody.innerHTML = '';
    list.forEach((r,i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td><td>${r.initials}</td><td>${r.score}</td><td>${r.when}</td>`;
      hud.hsBody.appendChild(tr);
    });
  }
  renderHighScores();

  const MAX_LEVEL = 5;
  const state = {
    running: false,
    score: 0,
    lives: 3,
    level: 1,
    mode: 'grid',
    player: { x: W/2, y: H-40, w: 40, h: 14, speed: 5, cooldown: 0, fireRate: 0.12 },
    bullets: [],
    enemies: [],
    enemyDir: 1,
    enemySpeed: 1.0,
    enemyStepDown: 16,
    enemyCooldown: 2.0,
    enemyCooldownMin: 1.0,
    enemyCooldownMax: 1.6,
    enemyBullets: [],
    levelStartMs: null
  };

  function setModeForLevel(lvl){
    if(lvl===1 || lvl===2){ state.mode='grid'; }
    else if(lvl===3){ state.mode='bossTrio'; }
    else if(lvl===4){ state.mode='randomSwarm'; }
    else { state.mode='megaBoss'; }
  }
  function setFireCadenceForMode(){
    if(state.mode==='grid'){
      state.enemyCooldownMin = 1.1; state.enemyCooldownMax = 1.7;
    } else if(state.mode==='randomSwarm'){
      state.enemyCooldownMin = 1.0; state.enemyCooldownMax = 1.6;
    } else if(state.mode==='bossTrio'){
      state.enemyCooldownMin = 0.9; state.enemyCooldownMax = 1.3;
    } else if(state.mode==='megaBoss'){
      state.enemyCooldownMin = 0.45; state.enemyCooldownMax = 0.80;
    }
  }
  function nextEnemyCooldown(){
    const levelFactor = Math.max(0.8, 1.0 - (state.level-1)*0.05);
    const min = state.enemyCooldownMin * levelFactor;
    const max = state.enemyCooldownMax * levelFactor;
    return min + Math.random()*(max-min);
  }

  function resetLevel(level=1){
    state.level = level;
    setModeForLevel(level);
    state.bullets = [];
    state.enemyBullets = [];
    state.enemies = [];
    state.enemyDir = 1;
    state.enemySpeed = 0.8 + 0.2*level;
    setFireCadenceForMode();
    state.enemyCooldown = nextEnemyCooldown();
    state.player.x = W/2;
    state.player.cooldown = 0;

    if(state.mode==='grid'){
      const rows = (level===1)?5:6;
      const cols = 10;
      const x0 = 80, y0 = 60, dx = 55, dy = 40;
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          state.enemies.push({ x: x0 + c*dx, y: y0 + r*dy, w: 30, h: 22, alive:true, boss:false, hp:1, bonusUntil:0, vx:0, vy:0, randTimer:0 });
        }
      }
    } else if(state.mode==='bossTrio'){
      const y = 120;
      const positions = [W*0.25, W*0.5, W*0.75];
      for(const x of positions){
        state.enemies.push({ x, y, w: 90, h: 66, alive:true, boss:true, hp:10, bonusUntil:0, vx:1.2*(Math.random()<0.5?-1:1), vy:0, randTimer:0 });
      }
    } else if(state.mode==='randomSwarm'){
      const count = 30;
      for(let i=0;i<count;i++){
        state.enemies.push({ 
          x: 80+Math.random()*(W-160), y: 60+Math.random()*120,
          w: 30, h: 22, alive:true, boss:false, hp:1, bonusUntil:0,
          vx:(Math.random()*2-1)*1.6, vy: 0.20 + Math.random()*0.30, randTimer: 1.1 + Math.random()*1.1
        });
      }
    } else if(state.mode==='megaBoss'){
      state.enemies.push({ x: W/2, y: 120, w: 110, h: 80, alive:true, boss:true, hp:30, color:'#7c3aed', vx:1.2, vy:0 });
    }

    state.levelStartMs = performance.now();
    hideOverlay();
    state.running = true;
    draw();
    updateHUD();
  }

  function showOverlay(victory=false){
    state.running = false;
    overlayTitle.textContent = victory ? 'Campaign Complete!' : 'Game Over';
    finalScore.textContent = state.score;
    victoryMsg.style.display = victory ? 'block' : 'none';
    celebrate.classList.toggle('show', victory);
    overlay.classList.remove('hidden');
    initialsInput.value = '';
    initialsInput.focus();
  }
  function hideOverlay(){ overlay.classList.add('hidden'); }
  function showStart(){ startOverlay.classList.remove('hidden'); state.running=false; }
  function hideStart(){ startOverlay.classList.add('hidden'); }

  startBtn.addEventListener('click', ()=>{ hideStart(); state.score=0; state.lives=3; resetLevel(1); });
  saveScoreBtn.addEventListener('click', ()=>{
    const txt = (initialsInput.value || '').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3) || 'EBC';
    addHighScore(txt, state.score);
    showToast('Saved!');
  });
  restartBtn.addEventListener('click', ()=>{
    overlay.classList.add('hidden');
    state.score=0; state.lives=3; resetLevel(1);
  });

  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(()=>toast.classList.remove('show'), 1800);
  }

  function gameOver(){ showOverlay(false); }

  let keys = {};
  window.addEventListener('keydown', (e)=>{
    const k = e.code ? e.code.toLowerCase() : e.key.toLowerCase();
    keys[k] = true;
    const inInput = document.activeElement && document.activeElement.tagName==='INPUT';
    const overlaysHidden = overlay.classList.contains('hidden') && startOverlay.classList.contains('hidden');
    if(k==='space' && overlaysHidden && !inInput){ e.preventDefault(); }
    if(k==='keyr' && overlaysHidden && !inInput){ state.score=0; state.lives=3; resetLevel(1); }
  });
  window.addEventListener('keyup', (e)=>{ const k = e.code ? e.code.toLowerCase() : e.key.toLowerCase(); keys[k]=false; });

  function shoot(){
    if(!state.running) return;
    if(state.player.cooldown>0) return;
    state.player.cooldown = state.player.fireRate;
    state.bullets.push({ x: state.player.x, y: state.player.y-10, vx:0, vy:-9, w:4, h:8 });
  }

  function applyLevelTimeBonus(){
    const end = performance.now();
    const ms = end - (state.levelStartMs || end);
    const sec = ms / 1000;
    const bonus = Math.max(0, Math.floor(10000 / Math.max(1e-3, sec)));
    state.score += bonus;
    showToast(`Level ${state.level} time: ${sec.toFixed(3)}s  •  Bonus +${bonus}`);
  }

  function levelAdvance(){
    applyLevelTimeBonus();
    if(state.level>=MAX_LEVEL){ showOverlay(true); return; }
    resetLevel(state.level+1);
  }

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function step(){
    if(state.running){
      if(keys['space']) shoot();

      if(keys['arrowleft'] || keys['keya']) state.player.x -= state.player.speed;
      if(keys['arrowright'] || keys['keyd']) state.player.x += state.player.speed;
      state.player.x = Math.max(30, Math.min(W-30, state.player.x));
      if(state.player.cooldown>0) state.player.cooldown -= 1/60;

      const alive = state.enemies.filter(e=>e.alive);

      if(state.mode==='grid'){
        const now = performance.now();
        for(const e of alive){ if(!e.boss && e.bonusUntil<=now && Math.random()<0.0008){ e.bonusUntil = now + 2500; } }
        if(alive.length===1 && !alive[0].boss){
          const b = alive[0]; b.boss=true; b.hp=10; b.w*=3; b.h*=3;
          state.enemySpeed *= 1.2;
        }
        let hitEdge=false;
        const speedFactor = Math.max(1.0, 1.0 + (1 - alive.length / Math.max(1,state.enemies.length)) * 2.0);
        const v = state.enemySpeed * speedFactor * state.enemyDir;
        if(alive.length===1 && alive[0].boss){
          const e = alive[0];
          e.x += v + Math.sin(Date.now()/200)*0.7;
          if(e.x < 30){ e.x=30; state.enemyDir=1; }
          if(e.x > W-30){ e.x=W-30; state.enemyDir=-1; }
          if(!e.dropTimer) e.dropTimer = 6 + Math.random()*2.5;
          e.dropTimer -= 1/60;
          if(e.dropTimer<=0){ e.y += 30; e.dropTimer = 6 + Math.random()*2.5; }
        } else {
          for(const e of alive){ e.x += v; if(e.x<30||e.x>W-30) hitEdge=true; }
          if(hitEdge){ state.enemyDir*=-1; for(const e of alive){ e.y += state.enemyStepDown; } }
        }
      } else if(state.mode==='bossTrio'){
        for(const e of alive){
          e.x += e.vx;
          if(e.x<50){ e.x=50; e.vx=Math.abs(e.vx); }
          if(e.x>W-50){ e.x=W-50; e.vx=-Math.abs(e.vx); }
        }
        if(!state.dropTimer) state.dropTimer = 5 + Math.random()*3;
        state.dropTimer -= 1/60;
        if(state.dropTimer<=0){ for(const e of alive){ e.y += 24; } state.dropTimer = 5 + Math.random()*3; }
      } else if(state.mode==='randomSwarm'){
        for(const e of alive){
          e.x += e.vx; e.y += e.vy;
          e.randTimer -= 1/60;
          if(e.x<30 || e.x>W-30) e.vx *= -1;
          if(e.y<40) e.y = 40;
          if(e.randTimer<=0){
            e.vx = (Math.random()*2-1)*1.6;
            e.vy = 0.20 + Math.random()*0.30;
            e.randTimer = 1.1 + Math.random()*1.1;
          }
        }
      } else if(state.mode==='megaBoss'){
        const e = alive[0];
        if(e){
          e.x += (e.vx||1.2);
          if(e.x<70){ e.x=70; e.vx=Math.abs(e.vx||1.2); }
          if(e.x>W-70){ e.x=W-70; e.vx=-Math.abs(e.vx||1.2); }
        }
      }

      state.enemyCooldown -= 1/60;
      if(state.enemyCooldown<=0 && alive.length){
        state.enemyCooldown = nextEnemyCooldown();
        let candidates = [];
        if(state.mode==='bossTrio'){
          candidates = alive.slice();
          candidates.sort(()=>Math.random()-0.5);
          candidates = candidates.slice(0, Math.min(2, candidates.length));
        } else if(state.mode==='megaBoss'){
          candidates = [alive[0]];
        } else {
          const columns={};
          for(const e of alive){ const c=Math.round((e.x-80)/55); if(!columns[c]||e.y>columns[c].y) columns[c]=e; }
          candidates = Object.values(columns);
          candidates.sort(()=>Math.random()-0.5);
          const k = 1 + Math.floor(Math.random()*3);
          candidates = candidates.slice(0, Math.min(k, candidates.length));
        }

        candidates.forEach(s=>{
          if(state.mode==='megaBoss'){
            const offs = [-24, 24];
            offs.forEach(dx=> state.enemyBullets.push({ x: s.x+dx, y: s.y+10, vx: 0, vy: 5.2, w:12, h:24 }));
          } else {
            const vy = 4 + 0.3*state.level + (s.boss?1.2:0);
            state.enemyBullets.push({ x: s.x, y: s.y+10, vx:0, vy, w:4, h:8 });
          }
        });
      }

      state.bullets.forEach(b=>{ b.y += b.vy; });
      state.enemyBullets.forEach(b=>{ b.y += b.vy; });

      for(const b of state.bullets){
        for(const e of alive){
          if(e.alive && Math.abs(b.x - e.x) < (e.w/2) && Math.abs(b.y - e.y) < (e.h/2)){
            b.y = -9999;
            if(state.mode==='megaBoss' && e===alive[0]){
              e.hp -= 1; state.score += 8; if(e.hp<=0){ e.alive=false; state.score += 300; levelAdvance(); }
            } else if(e.boss){
              e.hp -= 1; state.score += 6; if(e.hp<=0){ e.alive=false; state.score += 200; }
            } else {
              const isBonus = e.bonusUntil > performance.now(); e.alive = false; state.score += isBonus?20:10;
            }
            break;
          }
        }
      }
      state.bullets = state.bullets.filter(b=>b.y>-20 && b.y<H+20);
      state.enemyBullets = state.enemyBullets.filter(b=>b.y>-20 && b.y<H+20);

      for(const b of state.enemyBullets){
        const halfW = (b.w||4)/2, halfH = (b.h||8)/2;
        if(Math.abs(b.x - state.player.x) < (halfW+14) && Math.abs(b.y - state.player.y) < (halfH+10)){
          b.y = H+9999; state.lives -= 1; if(state.lives<=0){ gameOver(); }
        }
      }

      for(const e of alive){ if(e.y + e.h/2 >= state.player.y-8){ state.lives=0; gameOver(); break; } }

      const remaining = state.enemies.filter(e=>e.alive).length;
      if(remaining===0){ levelAdvance(); }
    }

    draw();
    updateHUD();
    requestAnimationFrame(step);
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle = 'rgba(2,6,23,0.05)'; ctx.lineWidth = 1;
    for(let x=20;x<W;x+=20){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=20;y<H;y+=20){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    const now = performance.now();
    for(const e of state.enemies){
      if(!e.alive) continue;
      let fill='#57CC99', stroke='#0b3551', glow=false;
      if(state.mode==='megaBoss'){ fill=e.color||'#7c3aed'; stroke='#4c1d95'; }
      else if(e.boss){ fill='#ef4444'; stroke='#b91c1c'; }
      else { if(e.bonusUntil>now){ fill='#f59e0b'; glow=true; } }
      drawEcoli(e.x, e.y, e.w, e.h, fill, stroke, glow);
    }

    const p = state.player;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#22577A'; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
    ctx.fillStyle = '#38A3A5'; ctx.fillRect(-4, -p.h/2 - 6, 8, 6); ctx.restore();

    ctx.fillStyle = '#0b3551'; state.bullets.forEach(b=>{ ctx.fillRect(b.x-2, b.y-6, 4, 8); });
    state.enemyBullets.forEach(b=>{
      ctx.fillStyle = '#ef4444';
      const w = b.w||4, h=b.h||8;
      ctx.fillRect(b.x-w/2, b.y-h/2, w, h);
    });
  }

  function drawEcoli(cx, cy, w, h, fill, stroke, glow=false){
    ctx.save(); ctx.translate(cx, cy);
    if(glow || fill==='#ef4444' || fill==='#7c3aed'){
      ctx.beginPath(); ctx.arc(0,0, Math.max(w,h)/2 + (glow?6:10), 0, Math.PI*2);
      ctx.fillStyle = glow ? 'rgba(245,158,11,0.18)' : (fill==='#7c3aed' ? 'rgba(168,85,247,0.18)' : 'rgba(239,68,68,0.15)');
      ctx.fill();
    }
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
    roundRect(ctx, -w/2, -h/2, w, h, Math.min(10, h/2)); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#22577A';
    for(let i=0;i<4;i++){ ctx.beginPath(); const a=(i/4)*Math.PI*2;
      ctx.moveTo(Math.cos(a)*(w/2), Math.sin(a)*(h/2));
      ctx.quadraticCurveTo(Math.cos(a)*((w/2)+8), Math.sin(a)*((h/2)+8), Math.cos(a)*((w/2)+16), Math.sin(a)*((h/2)+16));
      ctx.stroke(); }
    ctx.restore();
  }
  function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

  function updateHUD(){ hud.score.textContent=state.score; hud.lives.textContent=state.lives; hud.level.textContent=`${state.level} / ${MAX_LEVEL}`; }

  showStart();
  requestAnimationFrame(step);
})();
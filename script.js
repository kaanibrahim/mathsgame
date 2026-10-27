(() => {
  'use strict';

  const TOTAL = 20;          // number of problems
  const PENALTY = 2;         // seconds added per wrong answer
  const ADVANCE_DELAY = 180; // ms to show the typed answer before moving on
  const STORE_KEY = 'calc20.best';
  const PLAYER_KEY = 'calc20.player';

  // Set these to the project URL and public anon key from Supabase.
  const SUPABASE_URL = 'https://aexomguzzykytrtmarul.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_0ETZw7CZouZH0ZSkuTO6jQ_ZqrGTwJl';

  const $ = (sel) => document.querySelector(sel);
  const els = {
    list: $('#problems'),
    win: $('#problems-window'),
    progress: $('#progress'),
    timer: $('#timer'),
    countdown: $('#countdown'),
    bestTitle: $('#best-title'),
    resTime: $('#res-time'),
    resDetail: $('#res-detail'),
    resNew: $('#res-new'),
    resBest: $('#res-best'),
    mistakes: $('#mistakes'),
    mistakesTitle: $('#mistakes-title'),
    keypad: $('#keypad'),
    leaderboard: $('#leaderboard-list'),
    leaderboardStatus: $('#leaderboard-status'),
    scoreForm: $('#score-form'),
    playerName: $('#player-name'),
    submitScore: $('#submit-score'),
    scoreStatus: $('#score-status'),
  };

  const supabase = SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
  let problems = [];
  let index = 0;
  let input = '';
  let startTime = 0;
  let tickId = null;
  let countdownId = null;
  let locked = false;
  let finalScore = null;

  /* ---------- Helpers ---------- */

  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1).padStart(4, '0');
    return `${m}:${s}`;
  }

  function loadBest() {
    try {
      const v = parseFloat(localStorage.getItem(STORE_KEY));
      return Number.isFinite(v) ? v : null;
    } catch { return null; }
  }

  function saveBest(v) {
    try { localStorage.setItem(STORE_KEY, String(v)); } catch { /* storage unavailable */ }
  }

  function setState(s) { document.body.dataset.state = s; }
  const getState = () => document.body.dataset.state;

  /* ---------- Problem generation ---------- */

  function makeProblem() {
    const op = ['+', '−', '×'][rand(0, 2)];
    let a, b, ans;
    if (op === '+') {
      a = rand(1, 9); b = rand(1, 9); ans = a + b;
    } else if (op === '−') {
      b = rand(1, 9); ans = rand(1, 9); a = b + ans;   // never negative
    } else {
      a = rand(2, 9); b = rand(2, 9); ans = a * b;
    }
    return { a, b, op, ans, given: null };
  }

  function makeSet() {
    const out = [];
    while (out.length < TOTAL) {
      const p = makeProblem();
      const prev = out[out.length - 1];
      if (prev && prev.a === p.a && prev.b === p.b && prev.op === p.op) continue;
      out.push(p);
    }
    return out;
  }

  /* ---------- Rendering ---------- */

  function renderList() {
    els.list.innerHTML = '';
    problems.forEach((p) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="q">${p.a} ${p.op} ${p.b} =</span><span class="a"></span>`;
      els.list.appendChild(li);
    });
  }

  // Scroll so the current problem sits in the middle of the top screen.
  function positionList() {
    const li = els.list.children[Math.min(index, TOTAL - 1)];
    if (!li) return;
    const y = els.win.clientHeight / 2 - (li.offsetTop + li.offsetHeight / 2);
    els.list.style.transform = `translateY(${y}px)`;
  }

  function markCurrent() {
    const li = els.list.children[index];
    if (li) li.classList.add('current');
    els.progress.textContent = `${index + 1} / ${TOTAL}`;
  }

  function updateInputView() {
    const li = els.list.children[index];
    if (li) li.querySelector('.a').textContent = input;
  }

  function updateTimer() {
    els.timer.textContent = formatTime((performance.now() - startTime) / 1000);
  }

  function showBestOnTitle() {
    const best = loadBest();
    els.bestTitle.textContent = best !== null ? `Best: ${formatTime(best)}` : '';
  }

  async function loadLeaderboard() {
    if (!supabase) {
      els.leaderboardStatus.textContent = 'Connect Supabase to load scores.';
      return;
    }

    els.leaderboardStatus.textContent = 'Loading scores…';
    const { data, error } = await supabase
      .from('leaderboard')
      .select('name, score_seconds, updated_at')
      .order('score_seconds', { ascending: true })
      .order('updated_at', { ascending: true })
      .limit(10);

    if (error) {
      els.leaderboardStatus.textContent = 'Could not load scores. Check the Supabase setup.';
      return;
    }

    els.leaderboard.replaceChildren();
    data.forEach((entry) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const time = document.createElement('span');
      name.textContent = entry.name;
      time.textContent = formatTime(Number(entry.score_seconds));
      item.append(name, time);
      els.leaderboard.appendChild(item);
    });
    els.leaderboardStatus.textContent = data.length ? '' : 'No scores yet — set the first one!';
  }

  async function saveScore(event) {
    event.preventDefault();
    if (!supabase || finalScore === null) return;

    const name = els.playerName.value.trim();
    if (!name || name.length > 20 || /[\u0000-\u001f\u007f]/.test(name)) {
      els.scoreStatus.textContent = 'Enter a name of 1–20 characters.';
      return;
    }

    els.submitScore.disabled = true;
    els.scoreStatus.textContent = 'Saving score…';
    const { error } = await supabase.rpc('submit_score', {
      p_name: name,
      p_time_seconds: Number(finalScore.toFixed(1)),
    });
    els.submitScore.disabled = false;

    if (error) {
      els.scoreStatus.textContent = 'Could not save your score. Check the Supabase setup and try again.';
      return;
    }

    try { localStorage.setItem(PLAYER_KEY, name); } catch { /* storage unavailable */ }
    els.scoreStatus.textContent = 'Score submitted. Your fastest time is kept!';
    await loadLeaderboard();
  }

  /* ---------- Game flow ---------- */

  function startCountdown() {
    clearTimeout(countdownId);
    setState('countdown');
    let n = 3;
    const show = () => {
      els.countdown.textContent = n;
      // restart the pop animation
      els.countdown.style.animation = 'none';
      void els.countdown.offsetWidth;
      els.countdown.style.animation = '';
    };
    show();
    const step = () => {
      n -= 1;
      if (n > 0) { show(); countdownId = setTimeout(step, 700); }
      else startGame();
    };
    countdownId = setTimeout(step, 700);
  }

  function startGame() {
    problems = makeSet();
    index = 0;
    input = '';
    locked = false;
    renderList();
    setState('play');
    markCurrent();
    updateInputView();
    els.list.style.transition = 'none';
    positionList();
    void els.list.offsetHeight;
    els.list.style.transition = '';
    startTime = performance.now();
    updateTimer();
    clearInterval(tickId);
    tickId = setInterval(updateTimer, 100);
  }

  function pressDigit(d) {
    if (getState() !== 'play' || locked) return;
    if (input.length >= 3) return;
    input += d;
    updateInputView();
    const needed = String(problems[index].ans).length;
    if (input.length >= needed) {
      locked = true;
      setTimeout(submit, ADVANCE_DELAY);
    }
  }

  function pressBack() {
    if (getState() !== 'play' || locked) return;
    input = input.slice(0, -1);
    updateInputView();
  }

  function pressEnter() {
    if (getState() !== 'play' || locked || input === '') return;
    locked = true;
    submit();
  }

  function submit() {
    const p = problems[index];
    p.given = Number(input);
    const li = els.list.children[index];
    li.classList.remove('current');
    li.classList.add(p.given === p.ans ? 'right' : 'wrong');

    index += 1;
    input = '';

    if (index >= TOTAL) {
      finish();
      return;
    }
    markCurrent();
    updateInputView();
    positionList();
    locked = false;
  }

  function finish() {
    clearInterval(tickId);
    const raw = (performance.now() - startTime) / 1000;
    els.timer.textContent = formatTime(raw);

    const wrong = problems.filter((p) => p.given !== p.ans);
    const correct = TOTAL - wrong.length;
    const final = raw + wrong.length * PENALTY;
    finalScore = final;

    const prevBest = loadBest();
    const isNew = prevBest === null || final < prevBest;
    if (isNew) saveBest(final);

    els.resTime.textContent = formatTime(final);
    els.resDetail.textContent = wrong.length
      ? `${correct}/${TOTAL} correct · ${formatTime(raw)} + ${wrong.length * PENALTY}s penalty`
      : `${correct}/${TOTAL} correct`;
    els.resNew.hidden = !isNew;
    els.resBest.textContent = !isNew && prevBest !== null ? `Best: ${formatTime(prevBest)}` : '';
    els.scoreForm.reset();
    els.scoreStatus.textContent = '';
    els.submitScore.disabled = !supabase;
    try { els.playerName.value = localStorage.getItem(PLAYER_KEY) || ''; } catch { /* storage unavailable */ }

    els.mistakes.innerHTML = '';
    if (wrong.length === 0) {
      els.mistakesTitle.textContent = 'Mistakes';
      els.mistakes.innerHTML = '<li class="perfect">Perfect — no mistakes!</li>';
    } else {
      els.mistakesTitle.textContent = `Mistakes (${wrong.length})`;
      wrong.forEach((p) => {
        const li = document.createElement('li');
        li.innerHTML =
          `<span>${p.a} ${p.op} ${p.b} = <strong>${p.ans}</strong></span>` +
          `<span class="yours">you: ${p.given}</span>`;
        els.mistakes.appendChild(li);
      });
    }

    // brief pause so the last answer is visible before results appear
    setTimeout(() => setState('results'), 450);
  }

  function quitToMenu() {
    clearInterval(tickId);
    clearTimeout(countdownId);
    locked = false;
    showBestOnTitle();
    setState('title');
  }

  /* ---------- Input wiring ---------- */

  // pointerdown feels instant on touch screens (no click delay)
  els.keypad.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button[data-key]');
    if (!btn) return;
    e.preventDefault();
    const key = btn.dataset.key;
    if (key === 'back') pressBack();
    else if (key === 'enter') pressEnter();
    else pressDigit(key);
  });

  function flashKey(key) {
    const btn = els.keypad.querySelector(`[data-key="${key}"]`);
    if (!btn) return;
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 90);
  }

  document.addEventListener('keydown', (e) => {
    const state = getState();
    if (state === 'play') {
      if (/^[0-9]$/.test(e.key)) { pressDigit(e.key); flashKey(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); pressBack(); flashKey('back'); }
      else if (e.key === 'Enter') { pressEnter(); flashKey('enter'); }
      else if (e.key === 'Escape') quitToMenu();
    } else if ((state === 'title' || state === 'results')
      && !e.target.closest('input, button')
      && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      startCountdown();
    }
  });

  $('#start').addEventListener('click', startCountdown);
  $('#again').addEventListener('click', startCountdown);
  $('#menu').addEventListener('click', quitToMenu);
  $('#quit').addEventListener('click', quitToMenu);
  els.scoreForm.addEventListener('submit', saveScore);
  window.addEventListener('resize', () => { if (getState() === 'play') positionList(); });

  loadLeaderboard();
  showBestOnTitle();
})();

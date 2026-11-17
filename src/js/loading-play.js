/* Asset-free waiting game. Its score never changes the player's saved game. */
(function (root) {
  'use strict';
  const doc = root.document;
  const STAR = ['000001100000','000001100000','000011110000','111111111111','011111111110','001111111100','000111111000','000111111000','001111111100','001110011100','011100001110','011000000110'];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function create(host) {
    if (!host) return null;
    host.innerHTML = '<div class="load-play-heading"><h3>接住小星光</h3><output class="load-play-score" aria-label="小游戏收集数量">0 颗</output></div>' +
      '<p class="load-play-hint" id="loading-play-hint">左右移动接星星，越落越快，试试你的反应！</p>' +
      '<div class="load-play-stage"><canvas class="load-play-board" width="600" height="360" tabindex="0" data-gesture-surface aria-label="接星光小游戏，用左右方向键移动小盒子" aria-describedby="loading-play-hint"></canvas></div>' +
      '<div class="load-play-controls"><button type="button" data-play-left aria-label="向左移动小盒子"><span aria-hidden="true">←</span></button>' +
      '<p class="load-play-feedback" aria-live="polite">漏接也没关系</p><button type="button" data-play-right aria-label="向右移动小盒子"><span aria-hidden="true">→</span></button></div>';
    const canvas = host.querySelector('canvas'), ctx = canvas.getContext('2d');
    if (!ctx) { host.hidden = true; return null; }
    const scoreEl = host.querySelector('.load-play-score'), feedback = host.querySelector('.load-play-feedback');
    let enabled = false, disposed = false, frame = 0, previous = 0, spawnIn = .45, played = 0;
    let lane = 1, boxX = 150, width = 300, height = 180, score = 0, pulse = 0, sparkle = 0;
    let pressed = false, pointerId = null, drawnAt = 0, lastLane = -1;
    const stars = [], particles = [], position = n => width * (2 * n + 1) / 6;
    const randLane = () => { let n = Math.floor(Math.random() * 3); if (n === lastLane) n = (n + 1) % 3; lastLane = n; return n; };
    const reduced = root.matchMedia?.('(prefers-reduced-motion: reduce)');
    function resize() {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const oldW = width, oldH = height;
      width = Math.max(150, canvas.clientWidth || bounds.width); height = Math.max(100, canvas.clientHeight || bounds.height);
      const density = Math.min(2, root.devicePixelRatio || 1);
      canvas.width = Math.round(width * density); canvas.height = Math.round(height * density);
      ctx.setTransform(density, 0, 0, density, 0, 0); ctx.imageSmoothingEnabled = false;
      boxX *= width / oldW;
      for (const star of stars) star.y *= height / oldH;
      draw();
    }
    function starShape(x, y, unit, fill) {
      ctx.fillStyle = '#82683f';
      for (let j = 0; j < STAR.length; j++) for (let i = 0; i < 12; i++) if (STAR[j][i] === '1') ctx.fillRect(Math.round(x + (i - 6) * unit), Math.round(y + (j - 6) * unit), unit, unit);
      ctx.fillStyle = fill; ctx.fillRect(Math.round(x - 3 * unit), Math.round(y - 2 * unit), 6 * unit, 4 * unit);
      ctx.fillRect(Math.round(x - unit), Math.round(y - 4 * unit), 2 * unit, 8 * unit);
      ctx.fillStyle = '#fff6c9'; ctx.fillRect(Math.round(x - unit), Math.round(y - 3 * unit), unit, 2 * unit);
    }
    function draw() {
      ctx.clearRect(0, 0, width, height);
      const ground = height - 31;
      ctx.fillStyle = '#e5dcc1';
      for (let n = 1; n < 3; n++) for (let y = 12; y < ground - 18; y += 14) ctx.fillRect(Math.round(width * n / 3), y, 1, 3);
      ctx.fillStyle = '#ddd5b5'; ctx.fillRect(12, height - 12, width - 24, 2);
      ctx.fillStyle = '#f7f0d9'; ctx.fillRect(12, height - 10, width - 24, 4);
      for (const star of stars) {
        const x = position(star.lane);
        if (!reduced?.matches) { ctx.fillStyle = '#c8b98b'; ctx.fillRect(Math.round(x), Math.round(star.y - 22), 2, 4); }
        starShape(x, star.y, 2, star.gold ? '#edb44c' : '#f4ce72');
      }
      const x = Math.round(boxX), y = Math.round(ground + (pulse > 0 && !reduced?.matches ? -2 : 0));
      ctx.fillStyle = '#c9bd99'; ctx.fillRect(x - 22, height - 11, 44, 3);
      ctx.fillStyle = '#485b42'; ctx.fillRect(x - 24, y - 6, 48, 8); ctx.fillRect(x - 20, y + 2, 40, 17);
      ctx.fillStyle = pulse > 0 ? '#b2c985' : '#90a575'; ctx.fillRect(x - 20, y - 3, 40, 5); ctx.fillRect(x - 17, y + 3, 34, 13);
      ctx.fillStyle = '#3b4f38'; ctx.fillRect(x - 7, y + 6, 3, 3); ctx.fillRect(x + 5, y + 6, 3, 3); ctx.fillRect(x - 2, y + 11, 5, 2);
      ctx.fillStyle = '#e6bc6c'; ctx.fillRect(x - 13, y + 9, 3, 2); ctx.fillRect(x + 12, y + 9, 3, 2);
      for (const p of particles) { ctx.globalAlpha = clamp(p.life, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3); }
      ctx.globalAlpha = 1;
      if (sparkle > 0) { ctx.fillStyle = '#697e52'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+1', x, ground - 20 - (1 - sparkle) * 12); }
    }
    function catchStar(star) {
      score++; pulse = .22; sparkle = 1; scoreEl.textContent = score + ' 颗';
      feedback.textContent = score % 5 === 0 ? ['攒起一点好心情', '又收集到一小束光', '今晚也会亮晶晶'][Math.floor(score / 5 - 1) % 3] : '接住了，亮晶晶！';
      if (!reduced?.matches) for (let i = 0; i < 6; i++) particles.push({ x: position(star.lane), y: height - 38, dx: (i - 2.5) * 21, dy: -25 - (i % 3) * 10, life: 1, color: i % 2 ? '#9caf73' : '#d7ad52' });
    }
    function tick(time) {
      frame = 0;
      if (!enabled || disposed || doc.hidden) return;
      if (time - drawnAt < 15) { frame = root.requestAnimationFrame(tick); return; }
      const dt = previous ? Math.min(.07, Math.max(0, (time - previous) / 1000)) : 0;
      previous = drawnAt = time; played += dt;
      // A reaction game from the start: 1.65s to catch, then 0.72s at 20s.
      // Use board-relative travel time so phones and desktops play at the same pace.
      const difficulty = clamp(played / 20, 0, 1);
      const fallSeconds = 1.65 - difficulty * .93;
      boxX += (position(lane) - boxX) * Math.min(1, dt * 40); spawnIn -= dt;
      if (spawnIn <= 0 && stars.length < 4) { stars.push({ lane: randLane(), y: -15, gold: score > 0 && score % 5 === 4 }); spawnIn = .82 - difficulty * .42; }
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i]; s.y += dt * (height - 22) / fallSeconds;
        if (s.y >= height - 37) { if (Math.abs(position(s.lane) - boxX) <= 31) catchStar(s); stars.splice(i, 1); }
      }
      for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.dx * dt; p.y += p.dy * dt; p.life -= dt * 2; if (p.life <= 0) particles.splice(i, 1); }
      pulse = Math.max(0, pulse - dt); sparkle = Math.max(0, sparkle - dt * 1.5); draw(); frame = root.requestAnimationFrame(tick);
    }
    function select(n) {
      if (!enabled) return;
      lane = clamp(n, 0, 2);
      canvas.setAttribute('aria-label', '接星光小游戏，小盒子在' + ['左边', '中间', '右边'][lane] + '，已接住 ' + score + ' 颗。用左右方向键移动');
    }
    function point(event) {
      const r = canvas.getBoundingClientRect(), rotated = !!canvas.closest('#app.is-rotated');
      const ratio = rotated ? (event.clientY - r.top) / r.height : (event.clientX - r.left) / r.width;
      if (Number.isFinite(ratio)) select(Math.floor(clamp(ratio, 0, .9999) * 3));
    }
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault(); canvas.focus({ preventScroll: true }); pressed = true; pointerId = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId); point(event);
    });
    canvas.addEventListener('pointermove', event => { if (pressed && event.pointerId === pointerId || event.pointerType === 'mouse') point(event); });
    function release() { pressed = false; pointerId = null; }
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); select(lane + (['ArrowLeft', 'a', 'A'].includes(event.key) ? -1 : 1)); }
    });
    host.querySelector('[data-play-left]').onclick = () => select(lane - 1);
    host.querySelector('[data-play-right]').onclick = () => select(lane + 1);
    function suspend() { root.cancelAnimationFrame(frame); frame = 0; previous = drawnAt = 0; release(); }
    function resume() { if (enabled && !disposed && !doc.hidden && !frame) frame = root.requestAnimationFrame(tick); }
    function visibility() { if (doc.hidden) suspend(); else resume(); }
    const observer = typeof root.ResizeObserver === 'function' ? new root.ResizeObserver(resize) : null;
    observer?.observe(canvas); root.addEventListener('resize', resize); doc.addEventListener('visibilitychange', visibility); resize();
    return {
      start() { if (disposed) return; enabled = true; resize(); resume(); },
      stop() { enabled = false; suspend(); },
      destroy() { enabled = false; disposed = true; suspend(); observer?.disconnect(); root.removeEventListener('resize', resize); doc.removeEventListener('visibilitychange', visibility); }
    };
  }
  root.GameLoadingPlay = { create };
})(window);

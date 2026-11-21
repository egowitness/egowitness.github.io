/* EgoWitness project page. Plain JS, no dependencies. Data loads only when a section comes into view. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cache = {};
  const getJSON = url => (cache[url] = cache[url] || fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); }));
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const whenVisible = (el, fn, margin = '400px') => {
    if (!el) return;
    if (!('IntersectionObserver' in window)) return fn();
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margin });
    io.observe(el);
  };

  const WEARERS = ['A1_JAKE', 'A2_ALICE', 'A3_TASHA', 'A4_LUCIA', 'A5_KATRINA', 'A6_SHURE'];
  const DAYS = ['DAY1', 'DAY2', 'DAY3', 'DAY4', 'DAY5', 'DAY6', 'DAY7'];
  const H0 = 9, H1 = 24;
  const prettyWearer = w => w.replace('_', ' ');
  const ROOM_COLORS = ['#EFC09B', '#B8CFA4', '#C8B4D2', '#E4D6B7', '#A8C5D9', '#A6CCAE', '#E8C4BF', '#D9E3EC', '#F6E8CA', '#DCAFBC', '#C9D6E0', '#E2B66F', '#DBE4D4', '#E8DDE9', '#F3D9C6', '#B4A79F', '#CCD5DA'];
  const roomColor = (() => { const m = {}; let i = 0; return r => (m[r] = m[r] || ROOM_COLORS[i++ % ROOM_COLORS.length]); })();

  /* ---------- Clips data ---------- */
  let clipsP = null;
  const loadClips = () => (clipsP = clipsP || getJSON('data/clips.json').then(normClips).catch(() => null));
  function normClips(d) {
    const pick = (files, re) => (Array.isArray(files) ? files.find(f => re.test(f)) : null);
    const list = (d.clips || d).map(c => {
      const f = c.files || [];
      return {
        id: c.id || c.clip_id,
        wearer: c.wearer,
        day: c.day,
        start: c.start || c.start_time || '',
        duration: +(c.duration || c.duration_s || 8),
        kind: c.kind || 'realtime',
        rate: +(c.playback_rate || 1),
        cues: (c.cues || c.rooms || []).map(x => ({ t: +x.t, room: x.room })),
        objects: c.categories || [].concat(c.landmark_categories || [], c.movable_categories || []),
        mp4: c.mp4 || f.mp4 || pick(f, /\.mp4$/),
        webm: c.webm || f.webm || pick(f, /\.webm$/),
        poster: c.poster || f.poster || pick(f, /_poster\.webp$/) || pick(f, /_poster\.jpe?g$/),
        thumb: c.thumb || f.thumb || pick(f, /_thumb\./),
      };
    });
    const byId = Object.fromEntries(list.map(c => [c.id, c]));
    const hero = d.hero || {};
    const tiles = (hero.tiles || []).slice().sort((a, b) => a.row - b.row || a.col - b.col);
    return { list, byId, hero: { file: hero.file, webm: hero.webm, poster: hero.poster, cols: (hero.grid || [4, 3])[0], rows: (hero.grid || [4, 3])[1], tiles }, base: d.base || 'media/clips/' };
  }
  const hourOf = s => { const p = String(s).split(':').map(Number); return p[0] + (p[1] || 0) / 60 + (p[2] || 0) / 3600; };
  const roomAt = (c, t) => { let r = c.cues.length ? c.cues[0].room : ''; for (const x of c.cues) if (x.t <= t + 1e-6) r = x.room; return r; };

  /* ---------- Player ---------- */
  function buildPlayer(host, c, base, autoplay) {
    host.innerHTML = '';
    const vbox = h('div', { class: 'vbox' });
    const poster = c.poster ? base + c.poster : '';
    if (poster) vbox.append(h('img', { src: poster, alt: '', width: 480, height: 480, decoding: 'async' }));
    const room = h('div', { class: 'val' }, roomAt(c, 0) || 'Unknown');
    const strip = h('div', { class: 'roomstrip', 'aria-hidden': 'true' });
    const dur = c.duration || 12;
    c.cues.forEach((x, i) => {
      const t1 = i + 1 < c.cues.length ? c.cues[i + 1].t : dur;
      strip.append(h('i', { style: `width:${Math.max(0, (t1 - x.t) / dur * 100)}%;background:${roomColor(x.room)}`, title: x.room }));
    });
    const head = h('span', { class: 'head' }); strip.append(head);
    const start = () => {
      const v = h('video', { muted: true, playsinline: true, loop: true, controls: true, preload: 'auto', poster: poster || null, width: 480, height: 480 });
      v.muted = true;
      if (c.webm) v.append(h('source', { src: base + c.webm, type: 'video/webm; codecs="vp9"' }));
      if (c.mp4) v.append(h('source', { src: base + c.mp4, type: 'video/mp4' }));
      v.addEventListener('timeupdate', () => {
        const t = v.currentTime; const r = roomAt(c, t);
        if (room.textContent !== r) room.textContent = r;
        head.style.left = `${Math.min(100, t / (v.duration || dur) * 100)}%`;
      });
      vbox.innerHTML = ''; vbox.append(v);
      v.play().catch(() => {});
      document.dispatchEvent(new CustomEvent('ew:play', { detail: v }));
    };
    if (autoplay) start();
    else vbox.append(h('button', { class: 'play', type: 'button', 'aria-label': 'Play clip', onclick: start }, h('span', { html: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M7 4v16l13-8z"/></svg>' })));
    const info = h('div', { class: 'info' },
      h('h4', {}, `${prettyWearer(c.wearer)}, ${c.day}`),
      h('div', { class: 'meta' }, c.kind === 'timelapse'
        ? `${c.start ? c.start + ', ' : ''}${Math.round(dur * c.rate)} s shown as a ${c.rate}× time-lapse of annotated frames`
        : `${c.start ? c.start + ', ' : ''}${Math.round(dur)} s clip`),
      h('div', { class: 'roomnow' }, h('div', {}, h('div', { class: 'lbl' }, "Wearer's room now"), room)),
      strip,
      h('p', { class: 'small', style: 'margin:2px 0 14px' }, 'Room intervals across this clip.'),
      c.objects.length ? h('div', {}, h('div', { class: 'small', style: 'margin-bottom:6px' }, 'Annotated objects in view'), h('div', { class: 'chips' }, c.objects.map(x => h('span', { class: 'chip' }, x)))) : null);
    host.append(vbox, info);
  }
  // Only one clip plays at a time.
  document.addEventListener('ew:play', e => { $$('video').forEach(v => { if (v !== e.detail && v.id !== 'wallVideo' && !v.paused) v.pause(); }); });

  /* ---------- Modal ---------- */
  const modal = $('#modal'), modalBody = $('#modalBody'), modalPanel = $('#modalPanel');
  let lastFocus = null;
  function openModal(build, cls = '') {
    lastFocus = document.activeElement;
    modalPanel.className = 'panel ' + cls;
    modalBody.innerHTML = ''; build(modalBody);
    modal.classList.add('open'); document.body.style.overflow = 'hidden';
    $('.x', modal).focus();
  }
  function closeModal() {
    $$('video', modal).forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
    modal.classList.remove('open'); document.body.style.overflow = ''; modalBody.innerHTML = '';
    if (lastFocus) lastFocus.focus();
  }
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

  /* ---------- Hero wall ---------- */
  function initWall() {
    const frame = $('#wall'), grid = $('#wallGrid'), toggle = $('#motionToggle');
    let video = null, hero = null, base = 'media/clips/';
    // Paused state is what the toggle shows: data saver and reduced motion start paused (poster only).
    const animateIntro = document.documentElement.classList.contains('intro-on');
    let paused = saveData || (reduceMotion && !animateIntro);
    const setLabel = () => { toggle.textContent = paused ? 'Play animation' : 'Pause animation'; toggle.setAttribute('aria-pressed', paused ? 'true' : 'false'); };
    const attach = () => {
      if (video || !hero || !hero.file) return video;
      video = h('video', { id: 'wallVideo', muted: true, loop: true, playsinline: true, preload: 'auto', poster: hero.poster ? base + hero.poster : null, 'aria-hidden': 'true' });
      video.muted = true;
      if (hero.webm) video.append(h('source', { src: base + hero.webm, type: 'video/webm; codecs="vp9"' }));
      video.append(h('source', { src: base + hero.file, type: 'video/mp4' }));
      video.addEventListener('playing', () => { const p = $('img.poster', frame); if (p) p.style.opacity = 0; }, { once: true });
      $('#zoomer').append(video);
      return video;
    };
    let opening = null, revealTimer, loadTimer, autoIntroObserver;
    // Start downloading the opening clip right away, in parallel with the clip list, so it is ready when the wall scrolls in.
    const makeOpening = () => h('video', { src: 'assets/intro/wall-opening.mp4?v=3', poster: 'assets/intro/wall-opening.webp?v=2',
      muted: true, playsinline: true, preload: 'auto', 'aria-hidden': 'true' });
    let preOpening = (animateIntro && !paused) ? makeOpening() : null;
    if (preOpening) { preOpening.muted = true; preOpening.load(); }
    let inView = !('IntersectionObserver' in window);
    const play = () => { const v = attach(); if (v) v.play().catch(() => {}); };
    const reveal = (delay = 0) => {
      autoIntroObserver?.disconnect();
      clearTimeout(loadTimer);
      clearTimeout(revealTimer);
      if (opening) {
        opening.pause();
        opening.remove();
        opening = null;
      }
      frame.classList.add('intro-done');
      if (!paused && inView) play();
      if (delay) revealTimer = setTimeout(() => frame.classList.add('show-logo'), delay);
      else frame.classList.add('show-logo');
    };
    const startIntro = () => {
      if (opening) return;
      autoIntroObserver?.disconnect();
      clearTimeout(revealTimer);
      document.documentElement.classList.add('intro-on');
      frame.classList.remove('intro-done', 'show-logo');
      if (video) { video.pause(); video.currentTime = 0; }
      const clip = preOpening || makeOpening();
      preOpening = null;
      opening = clip;
      clip.muted = true;
      $('#openingLayer').append(clip);
      clip.onended = () => { if (opening === clip) reveal(280); };
      clip.onerror = () => { if (opening === clip) reveal(); };
      clip.onplaying = () => { if (opening === clip) clearTimeout(loadTimer); };
      loadTimer = setTimeout(() => { if (opening === clip) reveal(); }, 6500);
      clip.play().catch(() => { if (opening === clip) reveal(); });
    };
    $('#introReplay').addEventListener('click', () => { paused = false; setLabel(); startIntro(); });
    frame.addEventListener('click', () => { if (!frame.classList.contains('intro-done')) reveal(); });
    setLabel();
    toggle.addEventListener('click', () => {
      paused = !paused;
      setLabel();
      if (!frame.classList.contains('intro-done')) reveal();
      if (paused) video?.pause(); else play();
    });
    // Pause the mosaic when it scrolls out of view.
    if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => {
      inView = e.isIntersecting;
      if (!frame.classList.contains('intro-done')) return;
      if (inView && !paused) play(); else video?.pause();
    })).observe(frame);
    loadClips().then(d => {
      if (!d || !d.hero.file) { reveal(); return; }
      hero = d.hero; base = d.base;
      frame.style.aspectRatio = `${hero.cols}/${hero.rows}`;
      grid.style.gridTemplateColumns = `repeat(${hero.cols},1fr)`;
      grid.style.gridTemplateRows = `repeat(${hero.rows},1fr)`;
      hero.tiles.forEach(tl => {
        const c = d.byId[tl.clip]; if (!c) return;
        const tip = `${prettyWearer(c.wearer)}, ${c.day}${c.cues.length ? ', ' + c.cues[0].room : ''}`;
        grid.append(h('button', { type: 'button', 'aria-label': `Play clip: ${tip}`, style: `grid-column:${tl.col + 1};grid-row:${tl.row + 1}`,
          onclick: () => openModal(b => { const p = h('div', { class: 'player', style: 'margin-top:8px' }); b.append(p); buildPlayer(p, c, d.base, true); }) },
          h('span', { class: 'tip' }, tip)));
      });
      if (frame.classList.contains('intro-done') || !animateIntro || paused) reveal();
      else if ('IntersectionObserver' in window) {
        autoIntroObserver = new IntersectionObserver(entries => {
          if (entries.some(e => e.intersectionRatio >= 0.4)) startIntro();
        }, { threshold: 0.4 });
        autoIntroObserver.observe(frame);
      } else startIntro();
    });
  }

  /* ---------- Day1-7 timeline ---------- */
  function initTimeline() {
    const tl = $('#timeline'), axis = $('#tlAxis'), player = $('#tlPlayer');
    Promise.all([loadClips(), getJSON('data/coverage.json').catch(() => null)]).then(([d, cov]) => {
      if (!d) { $('.tl-box').hidden = true; return; }
      cov = cov || (d && d.coverage) || {};
      tl.append(h('div'));
      DAYS.forEach(day => tl.append(h('div', { class: 'dayh' }, day.replace('DAY', 'Day '))));
      const markers = [];
      WEARERS.forEach(w => {
        const [code, name] = w.split('_');
        tl.append(h('div', { class: 'who' }, code, h('small', {}, name.charAt(0) + name.slice(1).toLowerCase())));
        DAYS.forEach(day => {
          const cell = h('div', { class: 'cell' });
          const spans = (cov[w] && cov[w][day]) || [];
          spans.forEach(([a, b]) => {
            const x0 = Math.max(H0, a), x1 = Math.min(H1, b); if (x1 <= x0) return;
            cell.append(h('span', { class: 'span', style: `left:${(x0 - H0) / (H1 - H0) * 100}%;width:${(x1 - x0) / (H1 - H0) * 100}%` }));
          });
          (d ? d.list.filter(c => c.wearer === w && c.day === day) : []).forEach(c => {
            const x = (Math.min(H1, Math.max(H0, hourOf(c.start))) - H0) / (H1 - H0) * 100;
            const label = `${prettyWearer(w)}, ${day}, ${c.start}${c.cues.length ? ', ' + c.cues[0].room : ''}`;
            const b = h('button', { class: 'mk', type: 'button', style: `left:${x}%`, 'aria-label': `Play clip: ${label}`, title: label, onclick: () => select(c, b, true) });
            markers.push([c, b]); cell.append(b);
          });
          tl.append(cell);
        });
      });
      axis.append(h('div'));
      DAYS.forEach(() => axis.append(h('div', {}, h('span', {}, '9'), h('span', {}, '12'), h('span', {}, '15'), h('span', {}, '18'), h('span', {}, '21'), h('span', {}, '24'))));
      function select(c, btn, play) {
        markers.forEach(([, b]) => b.classList.toggle('on', b === btn));
        buildPlayer(player, c, d.base, play);
      }
      if (d && markers.length) select(markers[0][0], markers[0][1], false);
    });
  }

  /* ---------- Room tours ---------- */
  function initTours() {
    const tabs = $('#tourTabs'), frame = $('#tourFrame');
    getJSON('data/rooms.json').then(d => {
      const list = (d.tours || d.videos || d).map(t => ({ ...t, file: t.file || t.mp4 || `${t.id}.mp4`, poster: t.poster || `${t.id}_poster.jpg` }));
      const base = d.base || 'media/rooms/';
      if (!list.length) throw new Error('no tours');
      const label = t => `${prettyWearer(t.wearer)}, ${t.day}`;
      const meta = h('div', { class: 'tour-meta' });
      frame.after(meta);
      list.forEach((t, i) => tabs.append(h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': i === 0 ? 'true' : 'false',
        onclick: e => { $$('.tab', tabs).forEach(x => x.setAttribute('aria-selected', 'false')); e.currentTarget.setAttribute('aria-selected', 'true'); show(t, true); } },
        h('b', {}, `Tour ${i + 1}`), label(t))));
      function show(t, play) {
        frame.innerHTML = '';
        const poster = t.poster ? base + t.poster : null;
        const start = () => {
          const v = h('video', { muted: true, playsinline: true, controls: true, loop: true, preload: 'auto', poster, width: 1280, height: 720 });
          v.muted = true;
          if (t.webm) v.append(h('source', { src: base + t.webm, type: 'video/webm; codecs="vp9"' }));
          v.append(h('source', { src: base + (t.file || t.mp4), type: 'video/mp4' }));
          // Slow fast time-lapses down on the page so head motion stays comfortable.
          const rate = t.speed > 15 ? 0.5 : 1;
          v.defaultPlaybackRate = rate; v.addEventListener('loadedmetadata', () => { v.playbackRate = rate; });
          frame.innerHTML = ''; frame.append(v); v.play().catch(() => {});
          document.dispatchEvent(new CustomEvent('ew:play', { detail: v }));
        };
        if (poster) frame.append(h('img', { src: poster, alt: `Room tour: ${label(t)}`, width: 1280, height: 720, loading: 'lazy', decoding: 'async' }));
        if (play) start();
        else frame.append(h('button', { class: 'play', type: 'button', 'aria-label': `Play room tour: ${label(t)}`, onclick: start }, h('span', { html: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M7 4v16l13-8z"/></svg>' })));
        meta.textContent = `${label(t)}, ${t.start}${t.end ? ' to ' + t.end : ''}, played at ${t.speed > 15 ? t.speed / 2 : t.speed}×${t.transitions ? `, ${t.transitions} room changes` : ''}.`;
      }
      show(list[0], false);
    }).catch(() => { $('#tours').hidden = true; });
  }

  /* ---------- S3 zoom ---------- */
  function initZoom() {
    const grid = $('#zgrid'), cols = 4, rows = 3;
    const open = (r, c) => openModal(b => {
      const img = h('img', { src: `assets/fig/rooms_tiles/r${r}c${c}.webp`, alt: `Enlarged room observations, region ${r * cols + c + 1} of ${rows * cols}`, width: 1050, height: 1127 });
      const prev = h('button', { class: 'ctl', type: 'button', onclick: () => step(-1) }, '← Previous');
      const next = h('button', { class: 'ctl', type: 'button', onclick: () => step(1) }, 'Next →');
      const lab = h('span', {}, `Region ${r * cols + c + 1} of ${rows * cols}`);
      let k = r * cols + c;
      function step(dk) {
        k = (k + dk + rows * cols) % (rows * cols);
        img.src = `assets/fig/rooms_tiles/r${Math.floor(k / cols)}c${k % cols}.webp`;
        lab.textContent = `Region ${k + 1} of ${rows * cols}`;
      }
      b.append(img, h('div', { class: 'znav' }, prev, lab, next));
    }, 'zoompanel');
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      grid.append(h('button', { type: 'button', 'aria-label': `Enlarge region ${r * cols + c + 1}`, onclick: () => open(r, c) }));
  }

  /* ---------- Trace viewer ---------- */
  const tracePaths = {
    question: 'M20 11a8 8 0 0 1-8 8H7l-4 2 1-6a8 8 0 1 1 16-4Z M9 10h6 M9 13h4',
    image: 'M3 4h18v16H3z M3 16l5-5 4 4 3-3 6 6 M15 8h1',
    video: 'M3 5h13v14H3z M16 10l5-3v10l-5-3z',
    memory: 'M3 6l9-4 9 4-9 4z M3 11l9 4 9-4 M3 16l9 4 9-4',
    topology: 'M3 3h5v5H3z M16 3h5v5h-5z M16 16h5v5h-5z M8 5.5h8 M5.5 8v10.5H16',
    timeline: 'M12 3a9 9 0 1 0 .01 0z M12 6v6l4 2',
    answer: 'M3 12l6 6L21 6',
  };
  function traceIcon(name) {
    if (name === 'agent') return h('img', {class:'trace-icon', src:'assets/logos/egowitness-glasses.webp', alt:'', width:20, height:20});
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('class','trace-icon');
    svg.setAttribute('aria-hidden','true');
    const path = document.createElementNS(svg.namespaceURI,'path');
    for (const [key,value] of Object.entries({d:tracePaths[name] || tracePaths.question, fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round'})) path.setAttribute(key,value);
    svg.append(path);
    return svg;
  }
  const MODEL_LOGO = { 'Gemini 4 Argon': 'gemini-color', 'Claude Opus 5.5': 'claude-color', 'GPT-6.1 Sol': 'openai', 'Qwen3.8-27B': 'qwen-color', 'InternVL3.5-8B': 'internlm-color', 'VideoLLaMA3-7B': 'alibaba-color', 'VideoChat-Flash-7B': 'internlm-color', 'EgoClue': 'egowitness-glasses' };
  function initTraces() {
    const tabs = $('#traceTabs'), view = $('#traceView');
    getJSON('data/traces.json').then(d => {
      const list = d.items || d.traces || d; const base = d.base || 'media/traces/';
      const first = list.find(t => t.ability === 'Q03') || list[0];
      let pauseActive = () => {};
      document.addEventListener('visibilitychange', () => { if (document.hidden) pauseActive(); });
      if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) pauseActive();
      }).observe(view);
      list.forEach(t => tabs.append(h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': t === first ? 'true' : 'false', onclick: e => { $$('.tab', tabs).forEach(x => x.setAttribute('aria-selected', 'false')); e.currentTarget.setAttribute('aria-selected', 'true'); show(t); } }, h('b', {}, t.subtype || t.ability), t.ability_name || t.name)));
      show(first);
      function show(t) {
        pauseActive();
        view.innerHTML = '';
        const gold = t.gold;
        const refs = t.refs || t.references || [];
        const models = Array.isArray(t.models) ? t.models : Object.entries(t.models || {}).map(([name, choice]) => ({ name, choice, correct: choice === gold }));
        const order = { proprietary: 0, open: 1 };
        models.sort((a, b) => (order[a.group] ?? 2) - (order[b.group] ?? 2));
        const ego = t.egoclue || { choice: t.egoclue_answer || t.final_answer };
        const options = t.options_display || t.options;
        const choices = Object.entries(options).map(([k, v]) => h('li', {'data-key':k}, h('b', {}, k), h('span', {}, v)));
        const compare = h('details', {class:'answers compare'}, h('summary', {}, 'Compare model answers'));
        compare.addEventListener('toggle', () => {
          if (compare.open && !compare.querySelector('.ans')) compare.append(
            ...models.map(m => ans(m.name, m.choice, m.correct ?? m.choice === gold)),
            ans('EgoClue', ego.choice, ego.correct ?? ego.choice === gold, true));
        });
        const q = h('div', { class: 'qcard' },
          h('div', { class: 'qtype chat-by' }, traceIcon('question'), 'Question', h('span', {}, t.subtype || t.ability)),
          h('div', { class: 'q' }, t.question_display || t.question),
          refs.length ? h('div', { class: 'refs' }, refs.map(r => h('figure', {}, h('img', { src: base + r.file, alt: r.label || 'Reference image', loading: 'lazy', width: 96, height: 96 }), h('figcaption', {}, r.label || '')))) : null,
          h('ul', {class:'opts'}, choices), compare);
        const messages = t.steps.flatMap(s => s.tool.toLowerCase() === 'answer'
          ? [{kind:'final', step:s}] : [{kind:'call', step:s}, {kind:'reply', step:s}]);
        const log = h('ol', {class:'chat-log', tabindex:0, 'aria-label':'Recorded conversation'});
        const status = h('span', {class:'chat-count',role:'status'});
        const play = h('button', {class:'ctl primary', type:'button', onclick:togglePlay});
        const next = h('button', {class:'ctl',type:'button',onclick:() => { pause(); append(); }}, 'Next');
        const all = h('button', {class:'ctl',type:'button',onclick:() => {
          pause();
          while (cursor < messages.length) append(false);
          log.scrollTop = log.scrollHeight;
        }}, 'Show full trace');
        const panel = h('div', {class:'chat-panel'},
          h('header', {class:'chat-title'}, h('strong',{},traceIcon('agent'),'EgoClue'),status),
          log, h('div',{class:'trace-ctl'},play,next,all));
        view.append(h('div',{class:'trace'},q,panel));
        let cursor = 0, timer = null, playing = false;
        function controls() {
          const done = cursor === messages.length;
          play.textContent = playing ? 'Pause' : done ? 'Replay trace' : cursor <= 1 ? 'Play step by step' : 'Resume';
          all.disabled = next.disabled = done;
          status.textContent = `${cursor} / ${messages.length} messages`;
        }
        function pause() {
          clearTimeout(timer); timer = null; playing = false; controls();
        }
        pauseActive = pause;
        function append(follow = true) {
          if (cursor >= messages.length) return;
          const {kind, step} = messages[cursor++];
          const tool = step.tool.toLowerCase();
          const isCall = kind === 'call', final = kind === 'final';
          const head = h('div', {class:'chat-by'}, traceIcon(isCall ? 'agent' : tool),
            isCall ? 'EgoClue' : final ? 'EgoClue answer' : step.tool,
            h('span',{},isCall ? `calls ${step.tool}` : final ? 'Final' : 'Tool result'));
          const text = final ? `${ego.choice} — ${options[ego.choice] ?? step.observation}` : isCall ? step.args : step.observation;
          const bubble = h('li',{class:`chat-msg ${kind}`, 'data-tool':tool},head,h('p',{},text));
          if (!isCall && step.frames?.length) bubble.append(h('div',{class:'chat-frames'},
            step.frames.map(f => h('figure',{},h('img',{src:base+(f.file || f),alt:f.label || 'Evidence frame',loading:'lazy',decoding:'async',width:112,height:112}),
              f.label ? h('figcaption',{},f.label) : null))));
          if (!isCall && step.reasoning) bubble.append(h('details',{class:'chat-note'},h('summary',{},'Step notes'),h('p',{},step.reasoning)));
          if (final) choices.forEach(li => li.classList.toggle('gold', li.dataset.key === gold));
          log.append(bubble);
          if (follow) log.scrollTop = log.scrollHeight;
          if (cursor === messages.length) pause(); else controls();
        }
        function advance() {
          append();
          if (playing) timer = setTimeout(advance, messages[cursor-1].kind === 'reply' ? 3300 : 1800);
        }
        function togglePlay() {
          if (playing) { pause(); return; }
          if (cursor === messages.length) {
            log.replaceChildren(); cursor = 0;
            choices.forEach(li => li.classList.remove('gold'));
            compare.open = false;
          }
          playing = true; advance();
        }
        append();
      }
      function ans(m, pick, ok, ours) {
        return h('div', { class: 'ans' + (ours ? ' egoclue' : '') },
          MODEL_LOGO[m] ? h('img', { src: `assets/logos/${MODEL_LOGO[m]}.webp`, alt: '', width: 18, height: 18 }) : h('span'),
          h('span', {}, m), h('span', { class: 'pick ' + (ok ? 'right' : 'wrong') }, `${pick || 'none'} ${ok ? '✓' : '✗'}`));
      }
    }).catch(e => { console.error(e); $('#traces').hidden = true; tabs.hidden = true; view.hidden = true; });
  }

  /* ---------- Results chart ---------- */
  const GROUPS = { open: ['Direct open-weight VLMs', 'var(--g-open)', '#9FB4C4'], proprietary: ['Direct proprietary VLMs', 'var(--g-proprietary)', '#3F5F78'], prompted: ['Prompted tool controllers', 'var(--g-prompted)', '#9B7FA0'], egoclue: ['EgoClue (ours)', 'var(--g-egoclue)', '#C96E4E'], synthesis: ['EgoClue (ours)', 'var(--g-egoclue)', '#C96E4E'] };
  function initChart() {
    getJSON('data/results.json').then(d => {
      const rows = d.rows.filter(r => r.group !== 'baseline');
      const base = Object.fromEntries(d.rows.filter(r => r.group === 'baseline').map(r => [r.name, r]));
      const chart = $('#chart'), tip = $('#tip'), legend = $('#chartLegend'), tableWrap = $('#tableWrap');
      legend.innerHTML = ['open', 'proprietary', 'prompted', 'egoclue'].map(g => `<span><i class="sw" style="background:${GROUPS[g][2]}"></i>${GROUPS[g][0]}</span>`).join('') + '<span><i class="ref ref-u"></i>Uniform random</span><span><i class="ref ref-r"></i>Public-text ridge</span>';
      let metric = 'micro';
      const val = (r, m) => (m === 'micro' ? r.micro : m === 'cross' ? r.cross : r.abilities[+m]);
      const label = m => (m === 'micro' ? 'Week-long Micro' : m === 'cross' ? 'Cross-environment Micro' : d.abilities[+m]);
      function draw() {
        const W = Math.max(320, chart.clientWidth), narrow = W < 560;
        const nameW = narrow ? 128 : 190, rowH = 22, gapG = 16, padT = 36, padR = 46;
        const order = ['open', 'proprietary', 'prompted', 'egoclue', 'synthesis'];
        let y = padT; const items = [];
        order.forEach((g, gi) => {
          const rs = rows.filter(r => r.group === g); if (!rs.length) return;
          if (gi && g !== 'synthesis') y += gapG;
          rs.forEach(r => { items.push({ r, y }); y += rowH; });
        });
        const H = y + 26, x0 = nameW + 8, x1 = W - padR, sx = v => x0 + (x1 - x0) * v / 100;
        let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="presentation">`;
        for (let v = 0; v <= 100; v += 20) s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${padT - 6}" y2="${H - 22}" stroke="#E8E1DA" stroke-width="1"/><text x="${sx(v)}" y="${H - 6}" font-size="11.5" fill="#6B625E" text-anchor="middle">${v}</text>`;
        const refU = val(base['Uniform random, expected'] || { micro: null, cross: null, abilities: [] }, metric);
        const refR = val(base['Public-text ridge'] || { micro: null, cross: null, abilities: [] }, metric);
        // Two baselines, drawn and labelled separately. The lower one is labelled on its left, the higher on its right.
        const refs = [{ v: refU, name: 'Random', color: '#A9A29C', dash: '2 3' }, { v: refR, name: 'Text ridge', color: '#6B625E', dash: '6 3' }].filter(r => r.v != null);
        const lo = refs.length === 2 && refs[1].v < refs[0].v ? 1 : 0;
        refs.forEach((r, i) => {
          const x = sx(r.v), left = refs.length === 2 ? i === lo : false;
          s += `<line x1="${x}" x2="${x}" y1="${padT - 6}" y2="${H - 22}" stroke="${r.color}" stroke-width="1.5" stroke-dasharray="${r.dash}"/>`;
          s += `<text x="${left ? x - 4 : x + 4}" y="${padT - 10}" font-size="11" fill="${r.color}" text-anchor="${left ? 'end' : 'start'}">${r.name} ${r.v.toFixed(2)}</text>`;
        });
        items.forEach(({ r, y }, i) => {
          const v = val(r, metric), g = GROUPS[r.group], ours = r.group === 'egoclue' || r.group === 'synthesis';
          const nm = narrow ? r.name.replace('EgoClue-', 'EgoClue ').replace(' (base)', ' base') : r.name;
          const logo = r.logo ? `<image href="assets/logos/${r.logo}.webp" x="${nameW - 16}" y="${y + 3}" width="14" height="14"/>` : '';
          s += `<g class="bar" data-i="${i}"><rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"/>`;
          s += `<text x="${nameW - 22}" y="${y + 15}" font-size="${narrow ? 11.5 : 13}" fill="#302B2C" text-anchor="end" font-weight="${ours ? 700 : 400}">${esc(nm)}</text>${logo}`;
          if (v != null) {
            const w = Math.max(2, sx(v) - x0), bh = 14, by = y + 4;
            s += `<path d="M${x0} ${by}h${w - 4}a4 4 0 0 1 4 4v${bh - 8}a4 4 0 0 1-4 4h-${w - 4}z" fill="${g[2]}"/>`;
            s += `<text x="${sx(v) + 5}" y="${y + 15}" font-size="12" fill="#4A4342" font-weight="${ours ? 700 : 500}">${v.toFixed(2)}</text>`;
          }
          s += '</g>';
        });
        s += '</svg>';
        chart.innerHTML = s;
        $$('.bar', chart).forEach(gEl => {
          const it = items[+gEl.dataset.i];
          gEl.addEventListener('mousemove', e => {
            const r = it.r, v = val(r, metric);
            tip.innerHTML = `<b>${esc(r.name)}</b><br>${GROUPS[r.group][0]}<br>${label(metric)}: <b>${v == null ? 'n/a' : v.toFixed(2) + '%'}</b>${metric === 'micro' && r.cross != null ? `<br>Cross-env. Micro: ${r.cross.toFixed(2)}%` : ''}`;
            const box = chart.parentElement.getBoundingClientRect();
            let x = e.clientX - box.left + 14, yy = e.clientY - box.top + 12;
            if (x + 240 > box.width) x = e.clientX - box.left - 250;
            tip.style.left = x + 'px'; tip.style.top = yy + 'px'; tip.style.opacity = 1;
          });
          gEl.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
        });
      }
      function table() {
        const cols = ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Macro', 'Micro', 'Cross-env.'];
        let s = `<table class="res"><thead><tr><th>System</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
        let g0 = null;
        d.rows.forEach(r => {
          if (r.group !== g0) { g0 = r.group; s += `<tr class="grp"><td colspan="${cols.length + 1}">${r.group === 'baseline' ? 'Baselines' : GROUPS[r.group][0]}</td></tr>`; }
          const f = v => (v == null ? '&ndash;' : v.toFixed(2));
          s += `<tr class="${r.group === 'egoclue' || r.group === 'synthesis' ? 'ours' : ''}"><td>${esc(r.name)}</td>${r.abilities.map(f).map(x => `<td>${x}</td>`).join('')}<td>${f(r.macro)}</td><td>${f(r.micro)}</td><td>${f(r.cross)}</td></tr>`;
        });
        tableWrap.innerHTML = s + '</tbody></table>';
      }
      $$('.seg[data-metric]').forEach(b => b.addEventListener('click', () => {
        metric = b.dataset.metric;
        $$('.seg[data-metric]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        draw();
      }));
      $('#tableToggle').addEventListener('click', e => {
        const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
        e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on && !tableWrap.innerHTML) table();
        tableWrap.hidden = !on; chart.hidden = on; legend.hidden = on;
      });
      draw();
      let rt = null; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 120); });
    });
  }

  /* ---------- Nav, BibTeX ---------- */
  function initNav() {
    const links = $$('.navlink'); const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { links.forEach(a => a.classList.remove('active')); const a = map.get(e.target.id); if (a) a.classList.add('active'); } }), { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((a, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }
  $('#copyBib').addEventListener('click', e => {
    const txt = $('#bibText').textContent, btn = e.currentTarget;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1500); }).catch(() => {});
  });

  initNav();
  initWall();
  initZoom();
  whenVisible($('#annotations'), initTimeline);
  whenVisible($('#annotations'), initTours);
  whenVisible($('#traces'), initTraces);
  whenVisible($('#results'), initChart);
})();

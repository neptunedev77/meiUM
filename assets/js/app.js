/* =====================================================================
   meiUM — comportamento comum a todas as páginas.
   - <body data-view="home">                      → lista de UCs
   - <body data-view="uc" data-uc="daa">          → temas de uma UC
   - <body data-view="topic" data-uc data-topic>  → tema com sub-páginas (<article class="page">)
   data-root aponta para a raiz do site (".", ".." ...), para os links funcionarem
   tanto em file:// como no Vercel.
   Os textos da interface vêm de i18n.js (PT/EN); o conteúdo está nas páginas.
   ===================================================================== */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const body = document.body;
  const html = document.documentElement;
  const ROOT = (body.dataset.root || '.').replace(/\/$/, '');
  const url = p => `${ROOT}/${p}`;
  const CAT = window.CATALOG;
  const uc = CAT.ucs.find(u => u.id === body.dataset.uc);
  const topic = uc && uc.topics.find(t => t.id === body.dataset.topic);
  if (uc) html.style.setProperty('--hue', uc.hue);

  /* ---------- preferências guardadas no browser ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('meium:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('meium:' + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } }
  };

  /* ---------- idioma da interface ---------- */
  const LANG = store.get('lang', 'pt') === 'en' ? 'en' : 'pt';
  const D = window.I18N || { pt: {} };
  const t = (k, ...a) => { const s = (D[LANG] || {})[k] ?? (D.pt || {})[k] ?? k; return typeof s === 'function' ? s(...a) : s; };
  /* nomes do catálogo: em inglês usa os campos *_en / en quando existem */
  const tName = x => (LANG === 'en' && x.en) || x.title || x.name;
  const tDesc = x => (LANG === 'en' && x.desc_en) || x.desc;
  const tTag = () => (LANG === 'en' && CAT.site.tagline_en) || CAT.site.tagline;
  const uiLang = el => { if (LANG === 'en') el.lang = 'en'; return el; };

  /* ---------- tema, tamanho do texto e complementos ---------- */
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
  const THEME_LBL = { auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' };
  const FS = [0.9, 1, 1.1, 1.2, 1.3];
  function applyTheme(v) {
    if (v === 'light' || v === 'dark') html.dataset.theme = v;
    else delete html.dataset.theme;
  }
  const applyFont = f => html.style.setProperty('--fs', f);
  const applyExtra = on => html.classList.toggle('hide-extra', !on);
  applyTheme(store.get('theme', 'auto'));
  applyFont(store.get('fontScale', 1));
  applyExtra(store.get('showExtra', true));

  /* ferramentas da barra: idioma, tema e ⚙ (tamanho do texto, complementos).
     "up" abre o painel para cima, "left" alinha-o à esquerda. */
  function tools(opts = {}) {
    const w = uiLang(document.createElement('div'));
    w.className = 'tools' + (opts.up ? ' up' : '') + (opts.left ? ' left' : '');
    w.innerHTML = `
      <span class="lang-seg" role="group" aria-label="${t('language')}">
        <button type="button" data-lang="pt" lang="pt" title="Português">PT</button><button type="button" data-lang="en" lang="en" title="English">EN</button>
      </span>
      <button type="button" class="icon-btn" data-a="theme"></button>
      <span class="more">
        <button type="button" class="icon-btn" data-a="more" aria-haspopup="dialog" aria-expanded="false" title="${t('moreSettings')}" aria-label="${t('moreSettings')}">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2.2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)"/></svg>
        </button>
        <div class="set-panel" role="dialog" aria-label="${t('moreSettings')}" hidden>
          <div class="set-row"><span class="set-lbl">${t('textSize')}</span>
            <span class="seg"><button type="button" class="btn sm" data-fs="-1" aria-label="${t('smaller')}">A−</button><span class="set-val" data-fsv></span><button type="button" class="btn sm" data-fs="1" aria-label="${t('larger')}">A+</button></span></div>
          <div class="set-row"><label class="set-check"><input type="checkbox" data-extra> ${t('showExtra')}</label>
            <p class="set-hint">${t('showExtraHint')}</p></div>
        </div>
      </span>`;
    const theme = $('[data-a="theme"]', w), more = $('[data-a="more"]', w), panel = $('.set-panel', w);
    const paint = () => {
      $$('[data-lang]', w).forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === LANG));
      const th = store.get('theme', 'auto');
      theme.textContent = THEME_ICON[th]; theme.title = t(THEME_LBL[th]); theme.setAttribute('aria-label', t(THEME_LBL[th]));
      $('[data-fsv]', w).textContent = Math.round(store.get('fontScale', 1) * 100) + '%';
      $('[data-extra]', w).checked = store.get('showExtra', true);
    };
    const open = o => { panel.hidden = !o; more.setAttribute('aria-expanded', o); };
    more.addEventListener('click', e => { e.stopPropagation(); open(panel.hidden); });
    document.addEventListener('click', e => { if (!$('.more', w).contains(e.target)) open(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
    theme.addEventListener('click', () => {
      const v = THEMES[(THEMES.indexOf(store.get('theme', 'auto')) + 1) % THEMES.length];
      store.set('theme', v); applyTheme(v); document.dispatchEvent(new CustomEvent('meium:prefs'));
    });
    w.addEventListener('click', e => {
      const l = e.target.closest('[data-lang]'), f = e.target.closest('[data-fs]');
      if (l && l.dataset.lang !== LANG) { store.set('lang', l.dataset.lang); location.reload(); }
      if (f) {
        const i = Math.max(0, Math.min(FS.length - 1, FS.indexOf(store.get('fontScale', 1)) + +f.dataset.fs));
        store.set('fontScale', FS[i]); applyFont(FS[i]); document.dispatchEvent(new CustomEvent('meium:prefs'));
      }
    });
    $('[data-extra]', w).addEventListener('change', e => { store.set('showExtra', e.target.checked); applyExtra(e.target.checked); document.dispatchEvent(new CustomEvent('meium:prefs')); });
    /* várias barras na mesma página (lateral + topo mobile) ficam sincronizadas */
    document.addEventListener('meium:prefs', paint);
    paint();
    return w;
  }

  /* a etiqueta "complemento" das páginas acompanha o idioma da interface */
  function localizeTags() { if (LANG === 'en') $$('.xtag').forEach(x => { x.textContent = t('extraTag'); }); }

  /* =====================================================================
     Vistas de índice
     ===================================================================== */
  function siteBar(crumbs) {
    const bar = uiLang(document.createElement('header'));
    bar.className = 'sitebar';
    bar.innerHTML = `<div style="display:flex;flex-direction:column;gap:2px;min-width:0">
        <a class="logo" href="${url('index.html')}">mei<span>UM</span></a>
        ${crumbs ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>` : ''}</div>`;
    bar.appendChild(tools());
    return bar;
  }
  function siteFoot() {
    const f = uiLang(document.createElement('footer'));
    f.className = 'sitefoot';
    f.innerHTML = `<span>${esc(tTag())}</span><span>${t('footNote')}</span>`;
    return f;
  }

  function renderHome(root) {
    uiLang(root);
    const nTopics = CAT.ucs.reduce((s, u) => s + u.topics.filter(x => x.status === 'ready').length, 0);
    const cards = CAT.ucs.map(u => {
      const ready = u.topics.filter(x => x.status === 'ready').length;
      return `<a class="uc-card" style="--h:${u.hue}" href="${url(u.id + '/index.html')}">
        <span class="code-l">${esc(u.code)} · ${esc(u.year)}</span>
        <b>${esc(tName(u))}</b>
        <p>${esc(tDesc(u))}</p>
        <span class="uc-foot"><span class="pill p-acc">${t('topicsReady', ready, u.topics.length)}</span><span class="uc-go">${t('open')} <span aria-hidden="true">→</span></span></span></a>`;
    }).join('');
    root.innerHTML = `
      <section class="hero home-hero">
        <p class="eyebrow">${t('heroEyebrow')}</p>
        <h1>${t('heroTitle')}</h1>
        <p class="lede">${t('heroLede')}</p>
        <div class="meta"><span class="pill p-acc">${t('schoolYear', esc(CAT.site.year))}</span><span class="pill p-mid">${t('ucCount', CAT.ucs.length, nTopics)}</span></div>
        <a class="btn scroll-cue" href="#ucs">${t('seeUCs')} <span class="arr" aria-hidden="true">↓</span></a>
      </section>
      <h2 id="ucs" style="margin-bottom:14px;scroll-margin-top:16px">${t('ucs')} <span class="muted small" style="font-family:var(--f-mono);font-weight:500">${esc(CAT.site.year)}</span></h2>
      <div class="uc-grid">${cards}
        <div class="uc-card placeholder"><span class="code-l">${t('soon')}</span><p>${t('moreUCsSoon')}</p></div>
      </div>`;
    root.before(siteBar(''));
    root.after(siteFoot());
  }

  function renderUC(root) {
    uiLang(root);
    const sub = x => LANG === 'en' ? x.title : x.en;      /* a outra língua, por baixo */
    const rows = uc.topics.map(x => {
      if (x.status !== 'ready') {
        return `<div class="topic soon"><span class="tn">${x.id}</span>
          <div><b>${esc(tName(x))}</b><span class="te">${esc(sub(x))}</span></div>
          <div class="tr"><span class="pill p-mid">${t('inPrep')}</span></div></div>`;
      }
      return `<a class="topic" href="${url(`${uc.id}/${x.file}`)}"><span class="tn">${x.id}</span>
        <div><b>${esc(tName(x))}</b><span class="te">${esc(sub(x))}</span></div>
        <div class="tr"><span class="pill p-acc">${t('openTopic')}</span></div></a>`;
    }).join('');
    root.innerHTML = `
      <section class="hero">
        <p class="eyebrow">${esc(uc.code)} · ${esc(uc.year)}</p>
        <h1>${esc(tName(uc))}<span class="en">${esc(LANG === 'en' ? uc.name : uc.en)}</span></h1>
        <p class="lede">${esc(tDesc(uc))}</p>
        <div class="meta"><span class="pill p-acc">${t('nTopics', uc.topics.length)}</span>${uc.staff ? `<span class="small muted">${t('staff')}: ${esc(uc.staff)}</span>` : ''}</div>
      </section>
      <h2 style="margin-bottom:14px">${t('topics')}</h2>
      <div class="topics">${rows}</div>`;
    root.before(siteBar(`<a href="${url('index.html')}">${t('home')}</a><span>/</span><span>${esc(uc.code)}</span>`));
    root.after(siteFoot());
  }

  /* =====================================================================
     Vista de tema
     ===================================================================== */
  function renderTopic() {
    const pages = $$('article.page');
    const tIdx = uc.topics.indexOf(topic);

    /* --- barra lateral --- */
    const nav = uiLang($('#nav'));
    const subLinks = pages.map(a => `<a class="sublink" href="#${a.dataset.page}" data-p="${a.dataset.page}" lang="pt">
        <span class="num">${esc(a.dataset.num || '')}</span><span>${esc(a.dataset.title)}</span></a>`).join('');
    const topicLinks = uc.topics.map(x => {
      if (x === topic) {
        return `<span class="tlink cur"><span class="num">${x.id}</span><span>${esc(tName(x))}</span></span>
          <div class="subs">${subLinks}</div>`;
      }
      if (x.status !== 'ready') return `<span class="tlink soon" title="${t('inPrep')}"><span class="num">${x.id}</span><span>${esc(tName(x))}</span><span class="bo">${t('soonShort')}</span></span>`;
      return `<a class="tlink" href="${url(uc.id + '/' + x.file)}"><span class="num">${x.id}</span><span>${esc(tName(x))}</span></a>`;
    }).join('');
    nav.innerHTML = `
      <div class="nav-top"><a class="home-link" href="${url('index.html')}">${t('allUCs')}</a></div>
      <a class="brand" href="${url(uc.id + '/index.html')}"><span class="k">${esc(uc.code)} · ${esc(uc.year)}</span><b>${esc(tName(uc))}</b></a>
      <div class="navgroup"><h6>${t('topics')}</h6>${topicLinks}</div>
      <div class="navfoot"><span>${t('keysHint')} <kbd>←</kbd> <kbd>→</kbd></span></div>`;
    $('.nav-top', nav).appendChild(tools({ left: true }));

    /* --- barra superior (mobile) + gaveta --- */
    const top = uiLang(document.createElement('div'));
    top.className = 'topbar';
    top.innerHTML = `<button class="btn sm" id="menuBtn" aria-label="${t('openIndex')}" aria-expanded="false">☰</button>
      <div class="tt"><small>${esc(uc.code)} · ${t('topicN', topic.id)}</small><b id="topTitle" lang="pt"></b></div>`;
    top.appendChild(tools());
    $('.app').before(top);
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);
    const setDrawer = open => { body.classList.toggle('nav-open', open); $('#menuBtn').setAttribute('aria-expanded', open); };
    $('#menuBtn').addEventListener('click', () => setDrawer(!body.classList.contains('nav-open')));
    scrim.addEventListener('click', () => setDrawer(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });

    /* --- cabeçalho automático e paginação em cada sub-página --- */
    const prevTopic = uc.topics.slice(0, tIdx).reverse().find(x => x.status === 'ready');
    const nextTopic = uc.topics.slice(tIdx + 1).find(x => x.status === 'ready');
    pages.forEach((a, i) => {
      const ph = $('.ph', a);
      if (ph && !$('.eyebrow', ph)) {
        ph.insertAdjacentHTML('afterbegin', `<p class="eyebrow">${t('topicN', topic.id)} · ${esc(topic.en)}${a.dataset.num ? ' · ' + esc(a.dataset.num) : ''}</p>`);
      }
      const pv = pages[i - 1], nx = pages[i + 1];
      const L = (href, small, title, cls, tl) => `<a class="${cls}" href="${href}"><small>${small}</small><span${tl ? ` lang="${tl}"` : ''}>${esc(title)}</span></a>`;
      let h = '';
      if (pv) h += L('#' + pv.dataset.page, t('prev'), pv.dataset.title, 'pv', 'pt');
      else if (prevTopic) h += L(url(uc.id + '/' + prevTopic.file), t('prevTopic'), tName(prevTopic), 'pv');
      if (nx) h += L('#' + nx.dataset.page, t('next'), nx.dataset.title, 'nx', 'pt');
      else if (nextTopic) h += L(url(uc.id + '/' + nextTopic.file), t('nextTopic'), tName(nextTopic), 'nx');
      else h += L(url(uc.id + '/index.html'), t('endTopic'), t('backTo', uc.code), 'nx');
      a.insertAdjacentHTML('beforeend', `<nav class="pager"${LANG === 'en' ? ' lang="en"' : ''} aria-label="${t('pagination')}">${h}</nav>`);
    });

    /* --- conteúdo ainda só em português --- */
    if (LANG === 'en' && t('onlyPT')) {
      $('#main').insertAdjacentHTML('afterbegin', `<p class="lang-note" lang="en" role="note">${t('onlyPT')}</p>`);
    }

    /* --- mapa do tema: cartões gerados a partir das sub-páginas --- */
    $$('[data-map]').forEach(m => {
      m.classList.add('map');
      m.innerHTML = pages.filter(a => !a.contains(m)).map(a => `<a href="#${a.dataset.page}" data-p="${a.dataset.page}">
        <span class="num">${esc(a.dataset.num || '')}</span><b>${esc(a.dataset.title)}</b>
        <span class="d">${esc(a.dataset.desc || '')}</span></a>`).join('');
    });

    /* --- encaminhamento por #hash --- */
    let current = null;
    function show(id, scroll) {
      const el = pages.find(a => a.dataset.page === id) || pages[0];
      current = el;
      pages.forEach(a => { a.hidden = a !== el; });
      $$('.sublink').forEach(l => l.setAttribute('aria-current', l.dataset.p === el.dataset.page ? 'page' : 'false'));
      $('#topTitle').textContent = el.dataset.title;
      document.title = `${el.dataset.title} · ${tName(topic)} · ${uc.code}`;
      if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
      setDrawer(false);
      document.dispatchEvent(new CustomEvent('meium:page', { detail: el }));
    }
    window.addEventListener('hashchange', () => show(location.hash.slice(1), true));
    document.addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target.closest('input,textarea,select,[contenteditable]')) return;
      const i = pages.indexOf(current);
      if (e.key === 'ArrowRight' && pages[i + 1]) location.hash = pages[i + 1].dataset.page;
      if (e.key === 'ArrowLeft' && pages[i - 1]) location.hash = pages[i - 1].dataset.page;
    });

    show(location.hash.slice(1), false);
  }

  /* =====================================================================
     Componentes de conteúdo
     ===================================================================== */

  /* --- blocos de código: <pre><code class="language-python"> --- */
  const KW = {
    python: /\b(import|from|as|def|return|for|in|if|elif|else|while|print|True|False|None|lambda|with|class|and|or|not|is|try|except|pass|yield)\b/,
    bash: /\b(conda|pip|python|wsl|jupyter|deactivate|cd|source|export|ansible-playbook|ansible-vault|ansible|apt-get|useradd|mkdir|chmod|chown|echo|sudo|ssh)\b/,
    yaml: /\b(true|false|yes|no|present|absent|latest|restarted|started|stopped)\b/
  };
  function highlight(src, lang) {
    const kw = KW[lang] || KW.python;
    /* grupo extra: opções da linha de comando (bash) ou chaves (yaml) */
    const flag = lang === 'bash' ? String.raw`(\s--?[\w-]+)` : lang === 'yaml' ? String.raw`(^[ \t]*-?[ \t]*[\w.]+(?=:))` : '(?!)';
    const re = new RegExp(String.raw`(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|` + kw.source + String.raw`|(\b\d+(?:\.\d+)?\b)|` + flag + String.raw`|(\b[A-Za-z_]\w*(?=\())`, 'gm');
    let out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : m[4] ? 'n' : m[5] ? 'a' : 'f';
      out += `<span class="t-${cls}">${esc(m[0])}</span>`;
      last = re.lastIndex;
      if (m[0] === '') re.lastIndex++;
    }
    return out + esc(src.slice(last));
  }
  function enhanceCode() {
    $$('pre > code[class*="language-"]').forEach(code => {
      const pre = code.parentElement;
      if (pre.parentElement.classList.contains('code')) return;
      const lang = (code.className.match(/language-(\w+)/) || [])[1] || 'text';
      const raw = code.textContent.replace(/^\n/, '').replace(/\s+$/, '');
      code.innerHTML = lang === 'text' ? esc(raw) : highlight(raw, lang);
      const wrap = document.createElement('div');
      wrap.className = 'code';
      const label = pre.dataset.title || { python: 'Python', bash: 'Terminal', yaml: 'YAML' }[lang] || lang;
      wrap.innerHTML = `<div class="cap"><span>${esc(label)}</span><button class="cp" type="button">${t('copy')}</button></div>`;
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
      $('.cp', wrap).addEventListener('click', async e => {
        try { await navigator.clipboard.writeText(raw); e.target.textContent = t('copied'); }
        catch { e.target.textContent = t('copyFail'); }
        setTimeout(() => { e.target.textContent = t('copy'); }, 1400);
      });
    });
  }

  /* --- perguntas de escolha múltipla ---
     <div class="quiz"><p class="qq">…</p><div class="opts"><button data-ok>certa</button><button>errada</button></div><p class="why">…</p></div> */
  function enhanceQuizzes() {
    $$('.quiz').forEach((q, qi) => {
      $$('.opts > button', q).forEach((b, i) => {
        b.classList.add('opt'); b.type = 'button'; b.dataset.l = 'ABCDEFG'[i];
        b.addEventListener('click', () => {
          if (q.classList.contains('answered')) return;
          q.classList.add('answered');
          b.classList.add(b.hasAttribute('data-ok') ? 'ok' : 'no');
          $$('.opts > button', q).forEach(o => { o.disabled = true; if (o.hasAttribute('data-ok')) o.classList.add('ok'); });
          updateScore(q.closest('[data-quizset]'));
        });
      });
    });
    $$('[data-quizset]').forEach(s => {
      $$('.quiz .qq', s).forEach((p, i) => p.insertAdjacentHTML('afterbegin', `<span class="qn">Q${i + 1}</span>`));
      const bar = document.createElement('div');
      bar.className = 'row';
      bar.innerHTML = `<span class="quiz-score"></span><button class="btn sm" type="button">${t('restart')}</button>`;
      s.appendChild(bar);
      $('button', bar).addEventListener('click', () => {
        $$('.quiz', s).forEach(q => { q.classList.remove('answered'); $$('.opt', q).forEach(o => { o.disabled = false; o.classList.remove('ok', 'no'); }); });
        updateScore(s);
      });
      updateScore(s);
    });
  }
  function updateScore(s) {
    if (!s) return;
    const qs = $$('.quiz', s), ans = qs.filter(q => q.classList.contains('answered'));
    const ok = ans.filter(q => !$('.opt.no', q)).length;
    $('.quiz-score', s).textContent = ans.length ? t('score', ok, ans.length, qs.length) : t('nQuestions', qs.length);
  }

  /* --- classificação: <div class="classify" data-options="A,B,C"><div class="ci" data-answer="A" data-why="…">texto</div>…</div> --- */
  function enhanceClassify() {
    $$('.classify').forEach(c => {
      const opts = c.dataset.options.split(',').map(s => s.trim());
      $$('.ci', c).forEach(item => {
        const text = item.innerHTML;
        item.innerHTML = `<span class="ct">${text}</span><span class="seg">${opts.map(o => `<button type="button" class="btn" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</span>
          <span class="cw"></span>`;
        $$('.seg .btn', item).forEach(b => b.addEventListener('click', () => {
          if (item.classList.contains('done')) return;
          const ok = b.dataset.o === item.dataset.answer;
          b.classList.add(ok ? 'ok' : 'no');
          if (!ok) $$('.seg .btn', item).find(x => x.dataset.o === item.dataset.answer).classList.add('ok');
          item.classList.add('done');
          $('.cw', item).innerHTML = (ok ? '✓ ' : '✗ ') + (item.dataset.why || '');
        }));
      });
    });
  }

  /* --- fórmulas: KaTeX com \( … \) e \[ … \] --- */
  function renderMath() {
    if (typeof window.renderMathInElement !== 'function') return;
    window.renderMathInElement(document.body, {
      delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
      throwOnError: false
    });
  }

  /* --- widgets: <div data-widget="nome"> → window.MEIUM_WIDGETS.nome(el) --- */
  function mountWidgets() {
    const W = window.MEIUM_WIDGETS || {};
    $$('[data-widget]').forEach(el => {
      const fn = W[el.dataset.widget];
      if (fn) { try { fn(el); } catch (err) { el.textContent = t('widgetError'); console.error(err); } }
    });
  }

  /* ---------- arranque ---------- */
  const view = body.dataset.view;
  if (view === 'home') renderHome($('#main'));
  else if (view === 'uc' && uc) renderUC($('#main'));
  if (view === 'topic' && uc && topic) {
    enhanceCode();
    enhanceQuizzes();
    enhanceClassify();
    mountWidgets();
    renderTopic();
    localizeTags();
    if (document.readyState === 'complete') renderMath();
    else window.addEventListener('load', renderMath);
  }
})();

/* =====================================================================
   meiUM — comportamento comum a todas as páginas.
   - <body data-view="home">                      → lista de UCs
   - <body data-view="uc" data-uc="daa">          → temas de uma UC
   - <body data-view="topic" data-uc data-topic>  → tema com sub-páginas (<article class="page">)
   data-root aponta para a raiz do site (".", ".." ...), para os links funcionarem
   tanto em file:// como no Vercel.
   ===================================================================== */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const body = document.body;
  const ROOT = (body.dataset.root || '.').replace(/\/$/, '');
  const url = p => `${ROOT}/${p}`;
  const CAT = window.CATALOG;
  const uc = CAT.ucs.find(u => u.id === body.dataset.uc);
  const topic = uc && uc.topics.find(t => t.id === body.dataset.topic);
  if (uc) document.documentElement.style.setProperty('--hue', uc.hue);

  /* ---------- preferência de tema guardada no browser ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('meium:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('meium:' + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } }
  };

  /* ---------- tema claro/escuro ---------- */
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LBL = { auto: '◐ Automático', light: '☀ Claro', dark: '☾ Escuro' };
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  function themeButton() {
    const b = document.createElement('button');
    b.className = 'btn sm theme-btn';
    const paint = () => { b.textContent = THEME_LBL[store.get('theme', 'auto')]; };
    b.addEventListener('click', () => {
      const t = THEMES[(THEMES.indexOf(store.get('theme', 'auto')) + 1) % THEMES.length];
      store.set('theme', t); applyTheme(t); paint();
      document.dispatchEvent(new CustomEvent('meium:theme'));
    });
    paint();
    return b;
  }
  applyTheme(store.get('theme', 'auto'));

  /* =====================================================================
     Vistas de índice
     ===================================================================== */
  function siteBar(crumbs) {
    const bar = document.createElement('header');
    bar.className = 'sitebar';
    bar.innerHTML = `<div style="display:flex;flex-direction:column;gap:2px;min-width:0">
        <a class="logo" href="${url('index.html')}">mei<span>UM</span></a>
        ${crumbs ? `<nav class="crumbs" aria-label="Localização">${crumbs}</nav>` : ''}</div>`;
    bar.appendChild(themeButton());
    return bar;
  }
  function siteFoot() {
    const f = document.createElement('footer');
    f.className = 'sitefoot';
    f.innerHTML = `<span>${esc(CAT.site.tagline)}</span><span>Apontamentos pessoais baseados nos materiais das UCs.</span>`;
    return f;
  }

  function renderHome(root) {
    const cards = CAT.ucs.map(u => {
      const ready = u.topics.filter(t => t.status === 'ready').length;
      return `<a class="uc-card" style="--h:${u.hue}" href="${url(u.id + '/index.html')}">
        <span class="code-l">${esc(u.code)} · ${esc(u.year)}</span>
        <b>${esc(u.name)}</b>
        <p>${esc(u.desc)}</p>
        <span class="pill p-acc">${ready} de ${u.topics.length} temas disponíveis</span></a>`;
    }).join('');
    root.innerHTML = `
      <section class="hero">
        <p class="eyebrow">Mestrado em Engenharia Informática · UMinho</p>
        <h1>Apontamentos para estudar, não só para ler.</h1>
        <p class="lede">Resumos organizados por unidade curricular e por tema, com fórmulas, intuição, exemplos interativos e perguntas de revisão.</p>
      </section>
      <h2 style="margin-bottom:14px">Unidades curriculares</h2>
      <div class="uc-grid">${cards}
        <div class="uc-card placeholder"><span class="code-l">Em breve</span><p>Novas UCs serão acrescentadas ao longo do mestrado.</p></div>
      </div>`;
    root.before(siteBar(''));
    root.after(siteFoot());
  }

  function renderUC(root) {
    const rows = uc.topics.map(t => {
      if (t.status !== 'ready') {
        return `<div class="topic soon"><span class="tn">${t.id}</span>
          <div><b>${esc(t.title)}</b><span class="te">${esc(t.en)}</span></div>
          <div class="tr"><span class="pill p-mid">em preparação</span></div></div>`;
      }
      return `<a class="topic" href="${url(`${uc.id}/${t.file}`)}"><span class="tn">${t.id}</span>
        <div><b>${esc(t.title)}</b><span class="te">${esc(t.en)}</span></div>
        <div class="tr"><span class="pill p-acc">abrir →</span></div></a>`;
    }).join('');
    root.innerHTML = `
      <section class="hero">
        <p class="eyebrow">${esc(uc.code)} · ${esc(uc.year)}</p>
        <h1>${esc(uc.name)}<span class="en">${esc(uc.en)}</span></h1>
        <p class="lede">${esc(uc.desc)}</p>
        <div class="meta"><span class="pill p-acc">${uc.topics.length} temas</span>${uc.staff ? `<span class="small muted">Docentes: ${esc(uc.staff)}</span>` : ''}</div>
      </section>
      <h2 style="margin-bottom:14px">Temas</h2>
      <div class="topics">${rows}</div>`;
    root.before(siteBar(`<a href="${url('index.html')}">Início</a><span>/</span><span>${esc(uc.code)}</span>`));
    root.after(siteFoot());
  }

  /* =====================================================================
     Vista de tema
     ===================================================================== */
  function renderTopic() {
    const pages = $$('article.page');
    const tIdx = uc.topics.indexOf(topic);

    /* --- barra lateral --- */
    const nav = $('#nav');
    const subLinks = pages.map(a => `<a class="sublink" href="#${a.dataset.page}" data-p="${a.dataset.page}">
        <span class="num">${esc(a.dataset.num || '')}</span><span>${esc(a.dataset.title)}</span></a>`).join('');
    const topicLinks = uc.topics.map(t => {
      if (t === topic) {
        return `<span class="tlink cur"><span class="num">${t.id}</span><span>${esc(t.title)}</span></span>
          <div class="subs">${subLinks}</div>`;
      }
      if (t.status !== 'ready') return `<span class="tlink soon" title="Em preparação"><span class="num">${t.id}</span><span>${esc(t.title)}</span><span class="bo">breve</span></span>`;
      return `<a class="tlink" href="${url(uc.id + '/' + t.file)}"><span class="num">${t.id}</span><span>${esc(t.title)}</span></a>`;
    }).join('');
    nav.innerHTML = `
      <a class="home-link" href="${url('index.html')}">← meiUM · todas as UCs</a>
      <a class="brand" href="${url(uc.id + '/index.html')}"><span class="k">${esc(uc.code)} · ${esc(uc.year)}</span><b>${esc(uc.name)}</b></a>
      <div class="navgroup"><h6>Temas</h6>${topicLinks}</div>
      <div class="navfoot"><span>Navegar entre sub-páginas: <kbd>←</kbd> <kbd>→</kbd></span></div>`;
    $('.navfoot', nav).appendChild(themeButton());

    /* --- barra superior (mobile) + gaveta --- */
    const top = document.createElement('div');
    top.className = 'topbar';
    top.innerHTML = `<button class="btn sm" id="menuBtn" aria-label="Abrir índice" aria-expanded="false">☰</button>
      <div class="tt"><small>${esc(uc.code)} · Tema ${topic.id}</small><b id="topTitle"></b></div>`;
    $('.app').before(top);
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);
    const setDrawer = open => { body.classList.toggle('nav-open', open); $('#menuBtn').setAttribute('aria-expanded', open); };
    $('#menuBtn').addEventListener('click', () => setDrawer(!body.classList.contains('nav-open')));
    scrim.addEventListener('click', () => setDrawer(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });

    /* --- cabeçalho automático e paginação em cada sub-página --- */
    const prevTopic = uc.topics.slice(0, tIdx).reverse().find(t => t.status === 'ready');
    const nextTopic = uc.topics.slice(tIdx + 1).find(t => t.status === 'ready');
    pages.forEach((a, i) => {
      const ph = $('.ph', a);
      if (ph && !$('.eyebrow', ph)) {
        ph.insertAdjacentHTML('afterbegin', `<p class="eyebrow">Tema ${topic.id} · ${esc(topic.en)}${a.dataset.num ? ' · ' + esc(a.dataset.num) : ''}</p>`);
      }
      const pv = pages[i - 1], nx = pages[i + 1];
      const L = (href, small, title, cls) => `<a class="${cls}" href="${href}"><small>${small}</small><span>${esc(title)}</span></a>`;
      let html = '';
      if (pv) html += L('#' + pv.dataset.page, '← Anterior', pv.dataset.title, 'pv');
      else if (prevTopic) html += L(url(uc.id + '/' + prevTopic.file), '← Tema anterior', prevTopic.title, 'pv');
      if (nx) html += L('#' + nx.dataset.page, 'Seguinte →', nx.dataset.title, 'nx');
      else if (nextTopic) html += L(url(uc.id + '/' + nextTopic.file), 'Próximo tema →', nextTopic.title, 'nx');
      else html += L(url(uc.id + '/index.html'), 'Fim do tema →', 'Voltar aos temas de ' + uc.code, 'nx');
      a.insertAdjacentHTML('beforeend', `<nav class="pager" aria-label="Paginação">${html}</nav>`);
    });

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
      document.title = `${el.dataset.title} · ${topic.title} · ${uc.code}`;
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
    bash: /\b(conda|pip|python|wsl|jupyter|deactivate|cd|source|export)\b/
  };
  function highlight(src, lang) {
    const kw = KW[lang] || KW.python;
    const flag = lang === 'bash' ? String.raw`(\s--?[\w-]+)` : '(?!)';
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
      const label = pre.dataset.title || { python: 'Python', bash: 'Terminal' }[lang] || lang;
      wrap.innerHTML = `<div class="cap"><span>${esc(label)}</span><button class="cp" type="button">Copiar</button></div>`;
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
      $('.cp', wrap).addEventListener('click', async e => {
        try { await navigator.clipboard.writeText(raw); e.target.textContent = 'Copiado ✓'; }
        catch { e.target.textContent = 'Indisponível'; }
        setTimeout(() => { e.target.textContent = 'Copiar'; }, 1400);
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
      bar.innerHTML = `<span class="quiz-score"></span><button class="btn sm" type="button">↺ Recomeçar</button>`;
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
    $('.quiz-score', s).textContent = ans.length ? `${ok} certas em ${ans.length} respondidas (de ${qs.length})` : `${qs.length} perguntas`;
  }

  /* --- classificação: <div class="classify" data-options="A,B,C"><div class="ci" data-answer="A" data-why="…">texto</div>…</div> --- */
  function enhanceClassify() {
    $$('.classify').forEach(c => {
      const opts = c.dataset.options.split(',').map(s => s.trim());
      $$('.ci', c).forEach(item => {
        const text = item.innerHTML;
        item.innerHTML = `<span class="ct">${text}</span><span class="seg">${opts.map(o => `<button type="button" class="btn">${esc(o)}</button>`).join('')}</span>
          <span class="cw"></span>`;
        $$('.seg .btn', item).forEach(b => b.addEventListener('click', () => {
          if (item.classList.contains('done')) return;
          const ok = b.textContent === item.dataset.answer;
          b.classList.add(ok ? 'ok' : 'no');
          if (!ok) $$('.seg .btn', item).find(x => x.textContent === item.dataset.answer).classList.add('ok');
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
      if (fn) { try { fn(el); } catch (err) { el.textContent = 'Erro ao carregar o exemplo interativo.'; console.error(err); } }
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
    if (document.readyState === 'complete') renderMath();
    else window.addEventListener('load', renderMath);
  }
})();

/* =====================================================================
   meiUM — exemplos interativos reutilizáveis.
   Uso no HTML:  <div class="widget" data-widget="stats" data-values="1,4,5,4,8"></div>
   Cada widget é uma função (el) => void registada em window.MEIUM_WIDGETS.
   Os gráficos são SVG com viewBox (escala sozinho) e cores das variáveis CSS
   (funcionam no tema claro e escuro).
   ===================================================================== */
(() => {
  'use strict';
  const W = window.MEIUM_WIDGETS = window.MEIUM_WIDGETS || {};

  /* ---------- utilidades ---------- */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parseNums = s => String(s).split(/[\s,;]+/).filter(t => t !== '').map(Number).filter(Number.isFinite);
  const fmt = (x, d = 2) => {
    if (!Number.isFinite(x)) return '—';
    const r = Math.round(x * 10 ** d) / 10 ** d;
    return (Object.is(r, -0) ? 0 : r).toString();
  };
  const sum = a => a.reduce((s, v) => s + v, 0);
  const mean = a => sum(a) / a.length;
  const sorted = a => [...a].sort((x, y) => x - y);
  function median(a) {
    const s = sorted(a), n = s.length, m = Math.floor(n / 2);
    return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function modes(a) {
    const c = new Map();
    a.forEach(v => c.set(v, (c.get(v) || 0) + 1));
    const max = Math.max(...c.values());
    if (max === 1 && a.length > 1) return { values: [], max };
    return { values: [...c].filter(([, k]) => k === max).map(([v]) => v).sort((x, y) => x - y), max, counts: c };
  }
  const varPop = a => { const m = mean(a); return sum(a.map(v => (v - m) ** 2)) / a.length; };
  const varSam = a => { const m = mean(a); return sum(a.map(v => (v - m) ** 2)) / (a.length - 1); };
  /* quantil com interpolação linear (o mesmo que numpy.percentile por omissão) */
  function quantile(a, q) {
    const s = sorted(a), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (pos - lo) * (s[hi] - s[lo]);
  }
  function niceTicks(lo, hi, n = 6) {
    const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), e = raw / mag;
    const step = (e < 1.5 ? 1 : e < 3 ? 2 : e < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  const scale = (d0, d1, r0, r1) => v => r0 + (v - d0) * (r1 - r0) / ((d1 - d0) || 1);
  /* função de erro (Abramowitz & Stegun 7.1.26) e distribuição normal padrão */
  function erf(x) {
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
  const phi = (x, m = 0, s = 1) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  function invPhi(p) { let lo = -8, hi = 8; for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (Phi(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
  /* gerador pseudo-aleatório com semente (exemplos reprodutíveis) */
  function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function gauss(r) { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  const head = (el, title, hint) => `<div class="w-head"><span class="lbl-mono">Experimenta</span><h3>${esc(el.dataset.title || title)}</h3></div>${hint ? `<p class="w-hint">${hint}</p>` : ''}`;
  const kpi = (dt, dd, hl) => `<div class="kpi${hl ? ' hl' : ''}"><dt>${dt}</dt><dd>${dd}</dd></div>`;
  function axisX(ticks, sx, y, label = v => fmt(v)) {
    return `<line class="ax" x1="${sx(ticks[0])}" x2="${sx(ticks[ticks.length - 1])}" y1="${y}" y2="${y}"/>` +
      ticks.map(t => `<line class="ax" x1="${sx(t)}" x2="${sx(t)}" y1="${y}" y2="${y + 5}"/><text x="${sx(t)}" y="${y + 18}" text-anchor="middle">${label(t)}</text>`).join('');
  }

  /* =====================================================================
     stats — média, mediana, moda, variância e desvio padrão de uma lista
     data-values="…"   data-outlier="false" para esconder o botão de outlier
     ===================================================================== */
  W.stats = el => {
    const initial = el.dataset.values || '1, 4, 5, 4, 8';
    el.innerHTML = head(el, 'Medidas descritivas de uma lista de valores', 'Edita os valores (separados por vírgulas ou espaços). O gráfico mostra cada valor como um ponto, a média, a mediana e a faixa μ ± σ.') + `
      <div class="row">
        <label class="f grow">Valores<input type="text" inputmode="decimal" value="${esc(initial)}"></label>
        ${el.dataset.outlier === 'false' ? '' : '<button type="button" class="btn" data-a="out">+ Acrescentar outlier</button>'}
        <button type="button" class="btn" data-a="reset">↺ Repor</button>
      </div>
      <svg class="w-svg" viewBox="0 0 640 175" role="img" aria-label="Gráfico de pontos dos valores"></svg>
      <div class="legend"><span><i style="background:var(--accent)"></i>média μ</span><span><i style="background:var(--s2)"></i>mediana</span><span><i style="background:var(--accent);opacity:.25;height:10px"></i>μ ± σ</span><span><i class="dot" style="background:var(--bad)"></i>a mais de 1σ da média</span></div>
      <dl class="kpis"></dl>
      <p class="w-out"></p>
      <details class="ans"><summary>Ver o cálculo da variância passo a passo</summary><div class="tw"></div></details>`;
    const inp = el.querySelector('input'), svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out'), steps = el.querySelector('details .tw');

    function draw() {
      const a = parseNums(inp.value);
      if (a.length < 2) { kp.innerHTML = ''; svg.innerHTML = ''; out.textContent = 'Introduz pelo menos dois valores.'; steps.innerHTML = ''; return; }
      const m = mean(a), md = median(a), mo = modes(a), v = varPop(a), sd = Math.sqrt(v), vs = varSam(a);
      const lo0 = Math.min(...a, m - sd), hi0 = Math.max(...a, m + sd), pad = (hi0 - lo0) * 0.06 || 1;
      const ticks = niceTicks(lo0 - pad, hi0 + pad);
      const sx = scale(Math.min(ticks[0], lo0 - pad), Math.max(ticks[ticks.length - 1], hi0 + pad), 24, 616);
      const base = 128, stack = new Map();
      const dots = a.map(x => {
        const k = stack.get(x) || 0; stack.set(x, k + 1);
        const far = Math.abs(x - m) > sd + 1e-12;
        return `<circle cx="${sx(x)}" cy="${base - 8 - k * 13}" r="5.5" style="fill:${far ? 'var(--bad)' : 'var(--s1)'};stroke:var(--card);stroke-width:1.5"><title>${fmt(x, 4)}</title></circle>`;
      }).join('');
      const close = Math.abs(sx(m) - sx(md)) < 70;
      svg.innerHTML = `
        <rect x="${sx(m - sd)}" y="34" width="${Math.max(1, sx(m + sd) - sx(m - sd))}" height="${base - 34}" style="fill:var(--accent);opacity:.13"/>
        <line x1="${sx(m)}" x2="${sx(m)}" y1="30" y2="${base}" style="stroke:var(--accent);stroke-width:2.5"/>
        <line x1="${sx(md)}" x2="${sx(md)}" y1="${close ? 12 : 30}" y2="${base}" style="stroke:var(--s2);stroke-width:2;stroke-dasharray:5 4"/>
        <text class="lab" x="${sx(m)}" y="24" text-anchor="middle" style="fill:var(--accent)">μ = ${fmt(m)}</text>
        <text class="lab" x="${sx(md)}" y="${close ? 8 : 24}" text-anchor="${close ? (sx(md) < sx(m) ? 'end' : 'start') : 'middle'}" style="fill:var(--s2)">mediana = ${fmt(md)}</text>
        ${axisX(ticks, sx, base + 4)}${dots}`;
      kp.innerHTML = kpi('n', a.length) + kpi('média μ', fmt(m), 1) + kpi('mediana', fmt(md)) +
        kpi('moda', mo.values.length ? mo.values.map(x => fmt(x)).join(', ') : 'nenhuma') +
        kpi('variância σ²', fmt(v)) + kpi('desvio σ', fmt(sd), 1) + kpi('s² (amostral)', fmt(vs));
      const far = a.filter(x => Math.abs(x - m) > sd + 1e-12);
      out.innerHTML = `Intervalo μ ± σ = [${fmt(m - sd)}, ${fmt(m + sd)}]. ` +
        (far.length ? `Valores a mais de um desvio padrão da média (<b>invulgares</b>, no critério dos slides): <b>${far.map(x => fmt(x)).join(', ')}</b>.` : 'Nenhum valor está a mais de um desvio padrão da média.') +
        (Math.abs(m - md) > sd * 0.5 ? ` A média está bastante afastada da mediana: sinal de que há valores extremos a puxá-la.` : '');
      const rows = a.map(x => `<tr><td class="num">${fmt(x, 4)}</td><td class="num">${fmt(x - m, 3)}</td><td class="num">${fmt((x - m) ** 2, 3)}</td></tr>`).join('');
      steps.innerHTML = `<table><thead><tr><th class="num">xᵢ</th><th class="num">xᵢ − μ</th><th class="num">(xᵢ − μ)²</th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><td class="num">Σ = ${fmt(sum(a), 3)}</td><td class="num">Σ = ${fmt(sum(a.map(x => x - m)), 3)}</td><td class="num">Σ = ${fmt(v * a.length, 3)}</td></tr>
        <tr><td colspan="3">μ = ${fmt(sum(a), 3)} / ${a.length} = ${fmt(m, 3)} · σ² = ${fmt(v * a.length, 3)} / ${a.length} = <b>${fmt(v, 3)}</b> · σ = √${fmt(v, 3)} = <b>${fmt(sd, 3)}</b></td></tr></tfoot></table>`;
    }
    inp.addEventListener('input', draw);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'reset') inp.value = initial;
      if (b.dataset.a === 'out') { const a = parseNums(inp.value); const mx = Math.max(...a, 1); inp.value = [...a, Math.round(mx * 10)].join(', '); }
      draw();
    });
    draw();
  };

  /* =====================================================================
     normal — área sob a curva normal: intervalo μ ± kσ ou percentil
     ===================================================================== */
  W.normal = el => {
    el.innerHTML = head(el, 'Área sob a distribuição normal', 'A probabilidade de um valor cair num intervalo é a área sob a curva nesse intervalo. Escolhe o modo e arrasta o cursor.') + `
      <div class="row">
        <span class="seg"><button type="button" class="btn sm on" data-m="range">Intervalo μ ± kσ</button><button type="button" class="btn sm" data-m="pct">Percentil</button></span>
        <span class="seg" data-q></span>
      </div>
      <label class="f"><span data-lbl></span><input type="range"></label>
      <svg class="w-svg" viewBox="0 0 640 240" role="img" aria-label="Curva normal com área sombreada"></svg>
      <p class="w-out"></p>`;
    const svg = el.querySelector('svg'), rg = el.querySelector('input'), out = el.querySelector('.w-out'), lbl = el.querySelector('[data-lbl]'), quick = el.querySelector('[data-q]');
    let mode = 'range';
    const sx = scale(-4, 4, 20, 620), sy = scale(0, 0.42, 200, 16);
    const curve = Array.from({ length: 161 }, (_, i) => -4 + i * 0.05).map(x => `${sx(x).toFixed(1)},${sy(phi(x)).toFixed(1)}`).join(' L');
    function setMode(m) {
      mode = m;
      el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      if (m === 'range') { Object.assign(rg, { min: 0.1, max: 3.5, step: 0.05 }); rg.value = 1; quick.innerHTML = [1, 2, 3].map(k => `<button type="button" class="btn sm" data-v="${k}">k = ${k}</button>`).join(''); }
      else { Object.assign(rg, { min: 1, max: 99, step: 1 }); rg.value = 75; quick.innerHTML = [25, 50, 75, 99].map(p => `<button type="button" class="btn sm" data-v="${p}">P${p}</button>`).join(''); }
      draw();
    }
    function draw() {
      const v = +rg.value;
      let a, b, area, txt;
      if (mode === 'range') {
        a = -v; b = v; area = Phi(v) - Phi(-v);
        lbl.innerHTML = `k = <b>${fmt(v)}</b>`;
        txt = `Cerca de <b>${fmt(area * 100)}%</b> dos valores ficam entre μ − ${fmt(v)}σ e μ + ${fmt(v)}σ; os restantes ${fmt(100 - area * 100)}% ficam fora (metade de cada lado).`;
      } else {
        a = -4; b = invPhi(v / 100); area = v / 100;
        lbl.innerHTML = `percentil <b>${v}</b>`;
        txt = `O percentil ${v} está em <b>μ ${b < 0 ? '−' : '+'} ${fmt(Math.abs(b), 3)}σ</b>: ${v}% dos valores ficam abaixo deste ponto.` +
          (v === 25 || v === 75 ? ' (É o quartil ' + (v === 25 ? 'Q1' : 'Q3') + ', a ±0.6745σ, como na figura dos slides.)' : '') + (v === 50 ? ' É a mediana, que numa normal coincide com a média.' : '');
      }
      const xs = []; for (let x = Math.max(a, -4); x <= Math.min(b, 4) + 1e-9; x += 0.02) xs.push(x);
      const fillPath = xs.length ? `M${sx(xs[0])},${sy(0)} ` + xs.map(x => `L${sx(x).toFixed(1)},${sy(phi(x)).toFixed(1)}`).join(' ') + ` L${sx(xs[xs.length - 1])},${sy(0)} Z` : '';
      const ticks = [-3, -2, -1, 0, 1, 2, 3];
      svg.innerHTML = `<path d="${fillPath}" style="fill:var(--accent);opacity:.3"/>
        <path d="M${curve}" style="fill:none;stroke:var(--ink);stroke-width:2"/>
        ${ticks.map(t => `<line class="ax" x1="${sx(t)}" x2="${sx(t)}" y1="${sy(0)}" y2="${sy(phi(t))}" style="stroke-dasharray:3 3"/>`).join('')}
        <line class="ax" x1="20" x2="620" y1="${sy(0)}" y2="${sy(0)}"/>
        ${ticks.map(t => `<text x="${sx(t)}" y="${sy(0) + 18}" text-anchor="middle">${t === 0 ? 'μ' : (t > 0 ? '+' : '−') + Math.abs(t) + 'σ'}</text>`).join('')}
        <text class="lab" x="${sx(mode === 'range' ? 0 : Math.max(-2.6, b - 0.9))}" y="${sy(0.2)}" text-anchor="middle" style="font-size:15px">${fmt(area * 100, 1)}%</text>
        ${mode === 'pct' ? `<line x1="${sx(b)}" x2="${sx(b)}" y1="${sy(0)}" y2="${sy(0.4)}" style="stroke:var(--accent);stroke-width:2"/>` : ''}`;
      out.innerHTML = txt;
    }
    el.addEventListener('click', e => {
      const m = e.target.closest('[data-m]'); if (m) return setMode(m.dataset.m);
      const q = e.target.closest('[data-v]'); if (q) { rg.value = q.dataset.v; draw(); }
    });
    rg.addEventListener('input', draw);
    setMode('range');
  };

  /* =====================================================================
     pmf — função massa de probabilidade binomial vs. curva normal
     ===================================================================== */
  W.pmf = el => {
    el.innerHTML = head(el, 'Massa de probabilidade (discreta) vs. densidade (contínua)', 'Barras: P[X = k] de uma variável discreta (binomial: nº de sucessos em n tentativas com probabilidade p). Curva: a densidade normal com a mesma média e variância.') + `
      <div class="row">
        <label class="f grow"><span>n (tentativas) = <b data-n></b></span><input type="range" min="1" max="40" step="1" value="${el.dataset.n || 6}" data-i="n"></label>
        <label class="f grow"><span>p (prob. de sucesso) = <b data-p></b></span><input type="range" min="0.05" max="0.95" step="0.05" value="${el.dataset.p || 0.5}" data-i="p"></label>
      </div>
      <svg class="w-svg" viewBox="0 0 640 240" role="img" aria-label="Barras da distribuição binomial com curva normal"></svg>
      <div class="legend"><span><i style="background:var(--s1);height:10px"></i>PMF binomial P[X = k]</span><span><i style="background:var(--ink)"></i>PDF normal</span></div>
      <p class="w-out"></p>`;
    const svg = el.querySelector('svg'), out = el.querySelector('.w-out');
    const nI = el.querySelector('[data-i="n"]'), pI = el.querySelector('[data-i="p"]');
    function draw() {
      const n = +nI.value, p = +pI.value;
      el.querySelector('[data-n]').textContent = n; el.querySelector('[data-p]').textContent = fmt(p);
      const P = [Math.pow(1 - p, n)];
      for (let k = 0; k < n; k++) P.push(P[k] * (n - k) / (k + 1) * p / (1 - p));
      const mu = n * p, sd = Math.sqrt(n * p * (1 - p));
      const ymax = Math.max(...P, phi(mu, mu, sd)) * 1.12;
      const sx = scale(-0.5, n + 0.5, 46, 620), sy = scale(0, ymax, 205, 12), bw = Math.max(2, (sx(1) - sx(0)) * 0.9);
      const yt = niceTicks(0, ymax, 4);
      const bars = P.map((v, k) => `<rect x="${sx(k) - bw / 2}" y="${sy(v)}" width="${bw}" height="${sy(0) - sy(v)}" style="fill:var(--s1);opacity:.75"><title>P[X=${k}] = ${fmt(v, 4)}</title></rect>`).join('');
      const pts = []; for (let x = -0.5; x <= n + 0.5; x += (n + 1) / 200) pts.push(`${sx(x).toFixed(1)},${sy(phi(x, mu, sd)).toFixed(1)}`);
      const every = n > 24 ? 5 : n > 12 ? 2 : 1;
      svg.innerHTML = yt.map(t => `<line class="ax" x1="46" x2="620" y1="${sy(t)}" y2="${sy(t)}" style="opacity:.6"/><text x="40" y="${sy(t) + 4}" text-anchor="end">${fmt(t, 2)}</text>`).join('') +
        bars + `<path d="M${pts.join(' L')}" style="fill:none;stroke:var(--ink);stroke-width:2"/>` +
        P.map((_, k) => k % every ? '' : `<text x="${sx(k)}" y="${sy(0) + 16}" text-anchor="middle">${k}</text>`).join('') +
        `<text x="333" y="238" text-anchor="middle">k</text>`;
      const kmax = P.indexOf(Math.max(...P));
      out.innerHTML = `Valor mais provável: k = <b>${kmax}</b>, com P[X = ${kmax}] = <b>${fmt(P[kmax], 4)}</b>. A soma de todas as barras é ${fmt(sum(P), 6)}. A PMF só tem valor nos inteiros; a PDF é contínua e a probabilidade vem da área.`;
    }
    nI.addEventListener('input', draw); pI.addEventListener('input', draw);
    draw();
  };

  /* =====================================================================
     boxplot — quartis, IQR, limites de 1.5·IQR e outliers
     ===================================================================== */
  W.boxplot = el => {
    const initial = el.dataset.values || '820, 850, 870, 900, 910, 930, 950, 980, 1000, 1050, 1100, 1200, 1750';
    el.innerHTML = head(el, 'Quartis, IQR e caixa de bigodes', 'Edita os valores. A caixa vai de Q1 a Q3 (50% centrais dos dados); os bigodes vão até ao valor mais extremo dentro de Q1 − 1.5·IQR e Q3 + 1.5·IQR.') + `
      <div class="row"><label class="f grow">Valores<input type="text" inputmode="decimal" value="${esc(initial)}"></label><button type="button" class="btn" data-a="reset">↺ Repor</button></div>
      <svg class="w-svg" viewBox="0 0 640 170" role="img" aria-label="Caixa de bigodes"></svg>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const inp = el.querySelector('input'), svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    function draw() {
      const a = parseNums(inp.value);
      if (a.length < 4) { svg.innerHTML = ''; kp.innerHTML = ''; out.textContent = 'Introduz pelo menos quatro valores.'; return; }
      const s = sorted(a), q1 = quantile(s, .25), q2 = quantile(s, .5), q3 = quantile(s, .75), iqr = q3 - q1;
      const lf = q1 - 1.5 * iqr, hf = q3 + 1.5 * iqr;
      const inside = s.filter(v => v >= lf && v <= hf), outl = s.filter(v => v < lf || v > hf);
      const wl = Math.min(...inside), wh = Math.max(...inside);
      const lo = Math.min(s[0], lf), hi = Math.max(s[s.length - 1], hf), pad = (hi - lo) * 0.04 || 1;
      const ticks = niceTicks(lo - pad, hi + pad, 7);
      const sx = scale(Math.min(ticks[0], lo - pad), Math.max(ticks[ticks.length - 1], hi + pad), 20, 620);
      const stack = new Map();
      const strip = s.map(v => { const k = stack.get(v) || 0; stack.set(v, k + 1); const o = v < lf || v > hf; return `<circle cx="${sx(v)}" cy="${30 - k * 9}" r="4" style="fill:${o ? 'var(--bad)' : 'var(--s1)'};opacity:.85"><title>${fmt(v, 4)}</title></circle>`; }).join('');
      const y0 = 62, y1 = 112, ym = (y0 + y1) / 2;
      svg.innerHTML = `
        ${[lf, hf].map((f, i) => `<line x1="${sx(f)}" x2="${sx(f)}" y1="44" y2="${y1 + 8}" style="stroke:var(--muted);stroke-dasharray:4 4"/><text x="${sx(f)}" y="${y1 + 4}" text-anchor="${i ? 'end' : 'start'}" dx="${i ? -4 : 4}" class="sm">${i ? 'Q3 + 1.5·IQR' : 'Q1 − 1.5·IQR'}</text>`).join('')}
        <line x1="${sx(wl)}" x2="${sx(q1)}" y1="${ym}" y2="${ym}" style="stroke:var(--ink);stroke-width:1.5"/>
        <line x1="${sx(q3)}" x2="${sx(wh)}" y1="${ym}" y2="${ym}" style="stroke:var(--ink);stroke-width:1.5"/>
        <line x1="${sx(wl)}" x2="${sx(wl)}" y1="${ym - 10}" y2="${ym + 10}" style="stroke:var(--ink);stroke-width:1.5"/>
        <line x1="${sx(wh)}" x2="${sx(wh)}" y1="${ym - 10}" y2="${ym + 10}" style="stroke:var(--ink);stroke-width:1.5"/>
        <rect x="${sx(q1)}" y="${y0}" width="${Math.max(1, sx(q3) - sx(q1))}" height="${y1 - y0}" style="fill:var(--accent-soft);stroke:var(--accent);stroke-width:2" rx="3"/>
        <line x1="${sx(q2)}" x2="${sx(q2)}" y1="${y0}" y2="${y1}" style="stroke:var(--s2);stroke-width:3"/>
        ${outl.map(v => `<circle cx="${sx(v)}" cy="${ym}" r="5" style="fill:var(--bad)"/>`).join('')}
        <text class="lab" x="${sx(q1)}" y="${y0 - 6}" text-anchor="middle">Q1</text><text class="lab" x="${sx(q3)}" y="${y0 - 6}" text-anchor="middle">Q3</text>
        ${strip}${axisX(ticks, sx, 132)}`;
      kp.innerHTML = kpi('n', s.length) + kpi('Q1 (P25)', fmt(q1)) + kpi('mediana (P50)', fmt(q2), 1) + kpi('Q3 (P75)', fmt(q3)) + kpi('IQR', fmt(iqr), 1) +
        kpi('limite inf.', fmt(lf)) + kpi('limite sup.', fmt(hf));
      out.innerHTML = outl.length ? `Valores fora dos limites (tratados como <b>outliers</b>): <b>${outl.map(v => fmt(v)).join(', ')}</b>. Repara que o IQR quase não muda com eles: depende só dos 50% centrais.`
        : 'Nenhum valor fora de [Q1 − 1.5·IQR, Q3 + 1.5·IQR].';
    }
    inp.addEventListener('input', draw);
    el.querySelector('[data-a]').addEventListener('click', () => { inp.value = initial; draw(); });
    draw();
  };

  /* =====================================================================
     correlation — dispersão X/Y, covariância vs. correlação
     ===================================================================== */
  W.correlation = el => {
    const N = 70, r0 = rng(11), z1 = [], z2 = [];
    for (let i = 0; i < N; i++) { z1.push(gauss(r0)); z2.push(gauss(r0)); }
    const PRE = [['Forte +', .95], ['Fraca +', .4], ['Nenhuma', 0], ['Fraca −', -.4], ['Moderada −', -.7], ['Forte −', -.95]];
    el.innerHTML = head(el, 'Covariância vs. correlação', 'Ajusta a relação entre X e Y. Depois muda a escala de Y (como passar de metros para centímetros): a covariância muda, a correlação não.') + `
      <div class="seg">${PRE.map(([l, v]) => `<button type="button" class="btn sm" data-r="${v}">${l}</button>`).join('')}</div>
      <div class="row">
        <label class="f grow"><span>força da relação = <b data-rv></b></span><input type="range" min="-1" max="1" step="0.05" value="0.8"></label>
        <span class="seg" aria-label="Escala de Y"><span class="lbl-mono muted" style="align-self:center;margin-right:4px">Escala de Y</span>${[1, 10, 100].map(u => `<button type="button" class="btn sm${u === 1 ? ' on' : ''}" data-u="${u}">×${u}</button>`).join('')}</span>
      </div>
      <svg class="w-svg" viewBox="0 0 640 300" role="img" aria-label="Gráfico de dispersão"></svg>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), rg = el.querySelector('input'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    let u = 1;
    function label(r) {
      const a = Math.abs(r), sg = r > 0 ? 'positiva' : 'negativa';
      if (a >= 0.999) return `perfeita ${sg}`;
      if (a >= 0.7) return `forte ${sg}`;
      if (a >= 0.4) return `moderada ${sg}`;
      if (a >= 0.1) return `fraca ${sg}`;
      return 'praticamente nenhuma';
    }
    function draw() {
      const t = +rg.value;
      el.querySelector('[data-rv]').textContent = fmt(t);
      const xs = z1, ys = z1.map((z, i) => (t * z + Math.sqrt(Math.max(0, 1 - t * t)) * z2[i]) * u);
      const mx = mean(xs), my = mean(ys);
      const cov = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / N;
      const sxv = Math.sqrt(varPop(xs)), syv = Math.sqrt(varPop(ys)), r = cov / (sxv * syv);
      const X = scale(-3.4, 3.4, 52, 620), ylim = 3.6 * u, Y = scale(-ylim, ylim, 280, 14);
      const yt = niceTicks(-ylim, ylim, 6), xt = niceTicks(-3, 3, 6);
      /* reta de mínimos quadrados (|declive| ≤ ~1 em unidades de σ, por isso cabe no gráfico) */
      const b = cov / (sxv * sxv), c = my - b * mx, la = -3.3, lb = 3.3;
      svg.innerHTML = yt.map(v => `<line class="ax" x1="52" x2="620" y1="${Y(v)}" y2="${Y(v)}" style="opacity:.5"/><text x="46" y="${Y(v) + 4}" text-anchor="end">${fmt(v, 1)}</text>`).join('') +
        xt.map(v => `<text x="${X(v)}" y="296" text-anchor="middle">${fmt(v, 1)}</text>`).join('') +
        `<line x1="${X(mx)}" x2="${X(mx)}" y1="14" y2="280" style="stroke:var(--muted);stroke-dasharray:3 4"/><line x1="52" x2="620" y1="${Y(my)}" y2="${Y(my)}" style="stroke:var(--muted);stroke-dasharray:3 4"/>` +
        (Number.isFinite(b) && Math.abs(t) > 0.02 ? `<line x1="${X(la)}" x2="${X(lb)}" y1="${Y(b * la + c)}" y2="${Y(b * lb + c)}" style="stroke:var(--s2);stroke-width:2"/>` : '') +
        xs.map((x, i) => { const q = (x - mx) * (ys[i] - my) >= 0; return `<circle cx="${X(x)}" cy="${Y(ys[i])}" r="4.5" style="fill:${q ? 'var(--s1)' : 'var(--s5)'};opacity:.8"/>`; }).join('');
      kp.innerHTML = kpi('Cov(X, Y)', fmt(cov, u === 100 ? 1 : 3), 1) + kpi('σ<sub>X</sub>', fmt(sxv)) + kpi('σ<sub>Y</sub>', fmt(syv)) + kpi('correlação r', fmt(r, 3), 1);
      out.innerHTML = `Correlação <b>${label(r)}</b>. Pontos azuis: (xᵢ − x̄)(yᵢ − ȳ) &gt; 0 (puxam a covariância para cima); rosa: produto negativo (puxam para baixo).` +
        (u > 1 ? ` Com Y ×${u}, a covariância ficou ${u}× maior, mas r manteve-se: r divide pela escala (σ<sub>X</sub>·σ<sub>Y</sub>).` : '');
    }
    el.addEventListener('click', e => {
      const p = e.target.closest('[data-r]'); if (p) { rg.value = p.dataset.r; draw(); }
      const s = e.target.closest('[data-u]'); if (s) { u = +s.dataset.u; el.querySelectorAll('[data-u]').forEach(x => x.classList.toggle('on', x === s)); draw(); }
    });
    rg.addEventListener('input', draw);
    draw();
  };
})();

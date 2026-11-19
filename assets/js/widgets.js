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
        (far.length ? `Valores a mais de um desvio padrão da média (<b>invulgares</b>, pelo critério de 1σ): <b>${[...new Set(far)].sort((p, q) => p - q).map(x => { const c = far.filter(y => y === x).length; return fmt(x) + (c > 1 ? ` (×${c})` : ''); }).join(', ')}</b>.` : 'Nenhum valor está a mais de um desvio padrão da média.') +
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
          (v === 25 || v === 75 ? ' (É o quartil ' + (v === 25 ? 'Q1' : 'Q3') + ', a ±0.6745σ da média.)' : '') + (v === 50 ? ' É a mediana, que numa normal coincide com a média.' : '');
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

  /* =====================================================================
     confusion — matriz de confusão (linhas = previsto,
     colunas = real) e métricas derivadas.  data-values="TP,FP,FN,TN"
     ===================================================================== */
  W.confusion = el => {
    const initial = (el.dataset.values || '40,15,10,135').split(',').map(Number);
    const PRE = [['Exemplo do rastreio', initial.join(',')],['Classe rara: diz sempre "negativo"', '0,0,10,990'], ['Diz "positivo" a quase tudo', '10,90,0,900']];
    const cell = (k, cls, name) => `<label class="c ${cls}"><span>${name}</span><input type="number" min="0" step="1" data-k="${k}"></label>`;
    el.innerHTML = head(el, 'Matriz de confusão e métricas', 'Altera as quatro contagens, ou escolhe um cenário, e vê como cada métrica reage.') + `
      <div class="seg">${PRE.map(([l, v]) => `<button type="button" class="btn sm" data-pre="${v}">${esc(l)}</button>`).join('')}</div>
      <div class="cm-wrap">
        <div class="cm">
          <span></span><span class="h">Real: positivo</span><span class="h">Real: negativo</span>
          <span class="h v">Previsto: positivo</span>${cell('tp', 'ok', 'TP')}${cell('fp', 'err', 'FP · erro tipo I')}
          <span class="h v">Previsto: negativo</span>${cell('fn', 'err', 'FN · erro tipo II')}${cell('tn', 'ok', 'TN')}
        </div>
        <dl class="kpis"></dl>
      </div>
      <p class="w-out"></p>`;
    const inp = k => el.querySelector(`[data-k="${k}"]`), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const set = v => ['tp', 'fp', 'fn', 'tn'].forEach((k, i) => { inp(k).value = v[i]; });
    const div = (a, b) => b ? a / b : NaN;
    function draw() {
      const [tp, fp, fn, tn] = ['tp', 'fp', 'fn', 'tn'].map(k => Math.max(0, +inp(k).value || 0));
      const n = tp + fp + fn + tn;
      const acc = div(tp + tn, n), prec = div(tp, tp + fp), rec = div(tp, tp + fn), spec = div(tn, tn + fp), f1 = div(2 * prec * rec, prec + rec);
      const f = x => fmt(x, 3);
      kp.innerHTML = kpi('Accuracy', f(acc), 1) + kpi('Precision', f(prec), 1) + kpi('Recall (sensibilidade)', f(rec), 1) + kpi('Especificidade', f(spec)) + kpi('F1', f(f1));
      let msg = `Accuracy = (${tp} + ${tn}) / ${n} = <b>${f(acc)}</b> · Precision = ${tp} / (${tp} + ${fp}) = <b>${f(prec)}</b> · Recall = ${tp} / (${tp} + ${fn}) = <b>${f(rec)}</b>.`;
      if (acc > 0.9 && (rec < 0.5 || !Number.isFinite(rec) || rec === 0)) msg += ' <b>Accuracy alta, recall baixo:</b> com uma classe rara, acertar nos negativos chega para uma accuracy enganadora.';
      else if (rec > 0.9 && prec < 0.5) msg += ' <b>Recall alto, precision baixa:</b> o modelo apanha quase todos os positivos, mas à custa de muitos falsos alarmes.';
      if (!Number.isFinite(prec)) msg += ' A precision não está definida (o modelo nunca prevê positivo); o sklearn devolve 0 com um aviso.';
      msg += `<br><span class="small muted">No sklearn, <code>confusion_matrix(y_test, predictions)</code> mostra [[TN, FP], [FN, TP]] = [[${tn}, ${fp}], [${fn}, ${tp}]].</span>`;
      out.innerHTML = msg;
    }
    el.addEventListener('input', draw);
    el.addEventListener('click', e => { const b = e.target.closest('[data-pre]'); if (b) { set(b.dataset.pre.split(',').map(Number)); draw(); } });
    set(initial); draw();
  };

  /* =====================================================================
     roc — duas classes com pontuações normais; limiar → ponto na curva ROC
     ===================================================================== */
  W.roc = el => {
    el.innerHTML = head(el, 'Limiar de decisão e curva ROC', 'O modelo dá uma pontuação a cada item; acima do limiar, classifica-o como positivo. Mexe no limiar e na separação entre as classes.') + `
      <div class="row">
        <label class="f grow"><span>limiar = <b data-tv></b></span><input type="range" min="-3" max="5" step="0.05" value="0.6" data-i="t"></label>
        <label class="f grow"><span>separação entre classes = <b data-dv></b></span><input type="range" min="0" max="3.5" step="0.1" value="1.2" data-i="d"></label>
      </div>
      <svg class="w-svg" viewBox="0 0 640 270" role="img" aria-label="Distribuições das pontuações e curva ROC"></svg>
      <div class="legend"><span><i style="background:var(--s1)"></i>negativos reais</span><span><i style="background:var(--s2)"></i>positivos reais</span><span><i style="background:var(--good);opacity:.5;height:10px"></i>TP</span><span><i style="background:var(--bad);opacity:.45;height:10px"></i>FP</span></div>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const tI = el.querySelector('[data-i="t"]'), dI = el.querySelector('[data-i="d"]');
    function draw() {
      const t = +tI.value, d = +dI.value;
      el.querySelector('[data-tv]').textContent = fmt(t); el.querySelector('[data-dv]').textContent = fmt(d, 1);
      const X = scale(-4, 6.5, 14, 330), Y = scale(0, 0.42, 232, 20);
      const curve = (m, from = -4, to = 6.5) => { const p = []; for (let x = from; x <= to + 1e-9; x += 0.05) p.push(`${X(x).toFixed(1)},${Y(phi(x, m)).toFixed(1)}`); return p; };
      const area = m => { const p = curve(m, Math.min(Math.max(t, -4), 6.5)); return p.length ? `M${X(Math.max(t, -4))},${Y(0)} L${p.join(' L')} L${X(6.5)},${Y(0)} Z` : ''; };
      const fpr = 1 - Phi(t), tpr = 1 - Phi(t - d), auc = Phi(d / Math.SQRT2);
      const RX = scale(0, 1, 392, 620), RY = scale(0, 1, 232, 20);
      const rp = []; for (let s = 7; s >= -5; s -= 0.08) rp.push(`${RX(1 - Phi(s)).toFixed(1)},${RY(1 - Phi(s - d)).toFixed(1)}`);
      svg.innerHTML = `
        <path d="${area(0)}" style="fill:var(--bad);opacity:.35"/><path d="${area(d)}" style="fill:var(--good);opacity:.4"/>
        <path d="M${curve(0).join(' L')}" style="fill:none;stroke:var(--s1);stroke-width:2"/>
        <path d="M${curve(d).join(' L')}" style="fill:none;stroke:var(--s2);stroke-width:2"/>
        <line class="ax" x1="14" x2="330" y1="${Y(0)}" y2="${Y(0)}"/>
        <line x1="${X(t)}" x2="${X(t)}" y1="14" y2="${Y(0)}" style="stroke:var(--ink);stroke-width:2;stroke-dasharray:5 4"/>
        <text x="${X(t)}" y="12" text-anchor="middle" class="lab">limiar</text>
        <text x="${X(t) - 6}" y="${Y(0) + 18}" text-anchor="end">← negativo</text><text x="${X(t) + 6}" y="${Y(0) + 18}">positivo →</text>
        <path d="M${RX(0)},${RY(0)} L${rp.join(' L')} L${RX(1)},${RY(0)} Z" style="fill:var(--accent);opacity:.12"/>
        <rect x="${RX(0)}" y="${RY(1)}" width="${RX(1) - RX(0)}" height="${RY(0) - RY(1)}" style="fill:none;stroke:var(--rule)"/>
        <line x1="${RX(0)}" y1="${RY(0)}" x2="${RX(1)}" y2="${RY(1)}" style="stroke:var(--muted);stroke-dasharray:4 4"/>
        <path d="M${rp.join(' L')}" style="fill:none;stroke:var(--accent);stroke-width:2.5"/>
        <circle cx="${RX(fpr)}" cy="${RY(tpr)}" r="6" style="fill:var(--ink);stroke:var(--card);stroke-width:2"/>
        <text x="${(RX(0) + RX(1)) / 2}" y="252" text-anchor="middle">FPR (taxa de falsos positivos)</text>
        <text x="380" y="${(RY(0) + RY(1)) / 2}" text-anchor="middle" transform="rotate(-90 380 ${(RY(0) + RY(1)) / 2})">TPR (recall)</text>
        <text x="${RX(0.62)}" y="${RY(0.2)}" text-anchor="middle" class="lab">AUC = ${fmt(auc, 3)}</text>
        <text x="${RX(0)}" y="246" text-anchor="middle">0</text><text x="${RX(1)}" y="246" text-anchor="middle">1</text>`;
      kp.innerHTML = kpi('TPR = recall', fmt(tpr, 3), 1) + kpi('FPR', fmt(fpr, 3), 1) + kpi('AUC', fmt(auc, 3));
      out.innerHTML = `Com este limiar, o modelo apanha <b>${fmt(tpr * 100, 1)}%</b> dos positivos e marca erradamente <b>${fmt(fpr * 100, 1)}%</b> dos negativos. Baixar o limiar aumenta os dois (o ponto sobe e anda para a direita). ` +
        (d < 0.15 ? 'Sem separação, o modelo não distingue as classes: a curva cola-se à diagonal (AUC ≈ 0.5).' : `A AUC (${fmt(auc, 3)}) não depende do limiar: mede quão bem as pontuações <b>ordenam</b> positivos acima de negativos.`);
    }
    tI.addEventListener('input', draw); dI.addEventListener('input', draw);
    draw();
  };

  /* =====================================================================
     fscore — F1 / Fβ como média harmónica de precision e recall
     ===================================================================== */
  W.fscore = el => {
    el.innerHTML = head(el, 'F1 e Fβ', 'A F1 é uma média harmónica: fica perto do <em>menor</em> dos dois valores. O β decide qual pesa mais.') + `
      <div class="row">
        <label class="f grow"><span>precision = <b data-pv></b></span><input type="range" min="0.01" max="1" step="0.01" value="0.9" data-i="p"></label>
        <label class="f grow"><span>recall = <b data-rv></b></span><input type="range" min="0.01" max="1" step="0.01" value="0.3" data-i="r"></label>
        <label class="f grow"><span>β = <b data-bv></b></span><input type="range" min="0.25" max="4" step="0.25" value="0.5" data-i="b"></label>
      </div>
      <svg class="w-svg" viewBox="0 0 640 190" role="img" aria-label="Comparação de médias"></svg>
      <p class="w-out"></p>`;
    const svg = el.querySelector('svg'), out = el.querySelector('.w-out');
    const I = k => el.querySelector(`[data-i="${k}"]`);
    function draw() {
      const p = +I('p').value, r = +I('r').value, b = +I('b').value;
      el.querySelector('[data-pv]').textContent = fmt(p); el.querySelector('[data-rv]').textContent = fmt(r); el.querySelector('[data-bv]').textContent = fmt(b);
      const f1 = 2 * p * r / (p + r), fb = (1 + b * b) * p * r / (b * b * p + r);
      const rows = [['Precision', p, 'var(--s1)'], ['Recall', r, 'var(--s2)'], ['Média aritmética', (p + r) / 2, 'var(--muted)'], ['F1', f1, 'var(--accent)'], [`Fβ (β = ${fmt(b)})`, fb, 'var(--s3)']];
      const X = scale(0, 1, 150, 600);
      svg.innerHTML = rows.map(([l, v, c], i) => `<text x="142" y="${24 + i * 34}" text-anchor="end" class="${i > 2 ? 'lab' : ''}">${l}</text>
        <rect x="150" y="${10 + i * 34}" width="${X(v) - 150}" height="20" rx="3" style="fill:${c};opacity:${i === 2 ? .45 : .85}"/>
        <text x="${X(v) + 6}" y="${24 + i * 34}">${fmt(v, 3)}</text>`).join('') + `<line class="ax" x1="150" x2="150" y1="6" y2="182"/>`;
      out.innerHTML = `A média aritmética daria ${fmt((p + r) / 2, 3)}, mas a F1 é <b>${fmt(f1, 3)}</b>: um valor baixo em qualquer um dos dois arrasta-a para baixo. ` +
        (b > 1 ? `Com β = ${fmt(b)} &gt; 1 o recall pesa mais, e Fβ aproxima-se do recall.` : b < 1 ? `Com β = ${fmt(b)} &lt; 1 o recall pesa menos, e Fβ aproxima-se da precision.` : 'Com β = 1, Fβ = F1.');
    }
    ['p', 'r', 'b'].forEach(k => I(k).addEventListener('input', draw));
    draw();
  };

  /* =====================================================================
     regerr — MAE, MSE e RMSE a partir de uma lista de erros
     ===================================================================== */
  W.regerr = el => {
    const initial = el.dataset.values || '1, -1, 3, 3';
    el.innerHTML = head(el, 'MAE, MSE e RMSE', 'Escreve os erros (real − previsto) ou usa os modelos A e B do exemplo. Repara no que acontece quando o erro está concentrado num só ponto.') + `
      <div class="row">
        <label class="f grow">Erros<input type="text" inputmode="decimal" value="${esc(initial)}"></label>
        <span class="seg"><button type="button" class="btn sm" data-pre="1, -1, 3, 3">Exemplo A</button><button type="button" class="btn sm" data-pre="0, 0, 0, 10">Exemplo B</button></span>
      </div>
      <div class="two"><div class="tw"></div><div style="display:flex;flex-direction:column;gap:12px"><dl class="kpis"></dl><p class="w-out"></p></div></div>`;
    const inp = el.querySelector('input'), tw = el.querySelector('.tw'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    function draw() {
      const e = parseNums(inp.value);
      if (!e.length) { tw.innerHTML = ''; kp.innerHTML = ''; out.textContent = 'Introduz pelo menos um erro.'; return; }
      const mae = mean(e.map(Math.abs)), mse = mean(e.map(x => x * x)), rmse = Math.sqrt(mse);
      tw.innerHTML = `<table><thead><tr><th class="num">#</th><th class="num">erro</th><th class="num">|erro|</th><th class="num">erro²</th></tr></thead><tbody>
        ${e.map((x, i) => `<tr><td class="num">${i + 1}</td><td class="num">${fmt(x, 3)}</td><td class="num">${fmt(Math.abs(x), 3)}</td><td class="num">${fmt(x * x, 3)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>média</td><td></td><td class="num">${fmt(mae, 3)}</td><td class="num">${fmt(mse, 3)}</td></tr></tfoot></table>`;
      kp.innerHTML = kpi('MAE', fmt(mae, 3), 1) + kpi('MSE', fmt(mse, 3)) + kpi('RMSE', fmt(rmse, 3), 1) + kpi('RMSE / MAE', fmt(rmse / mae, 2));
      out.innerHTML = `RMSE = √${fmt(mse, 3)} = ${fmt(rmse, 3)}. ` + (rmse / mae > 1.6 ? 'O RMSE está bem acima do MAE: há poucos erros grandes a dominar (o quadrado amplifica-os).' : 'RMSE próximo do MAE: os erros têm tamanhos parecidos.');
    }
    inp.addEventListener('input', draw);
    el.addEventListener('click', e => { const b = e.target.closest('[data-pre]'); if (b) { inp.value = b.dataset.pre; draw(); } });
    draw();
  };

  /* =====================================================================
     kfold — partição em k folds (como KFold sem shuffle) e leave-one-out
     ===================================================================== */
  W.kfold = el => {
    const N = +(el.dataset.n || 20);
    el.innerHTML = head(el, 'Hold-out, k-fold e leave-one-out', `Cada círculo é uma observação (N = ${N}). Em cada iteração, o fold destacado é o teste e o resto é treino.`) + `
      <div class="row">
        <label class="f grow"><span>k = <b data-kv></b></span><input type="range" min="2" max="${N}" step="1" value="5"></label>
        <span class="seg"><button type="button" class="btn sm" data-k="5">k = 5</button><button type="button" class="btn sm" data-k="10">k = 10</button><button type="button" class="btn sm" data-k="${N}">LOOCV (k = N)</button></span>
      </div>
      <svg class="w-svg" role="img" aria-label="Divisão em folds"></svg>
      <div class="legend"><span><i class="dot" style="background:var(--accent)"></i>teste</span><span><i class="dot" style="background:var(--rule)"></i>treino</span></div>
      <dl class="kpis"></dl>`;
    const svg = el.querySelector('svg'), rg = el.querySelector('input'), kp = el.querySelector('.kpis');
    function draw() {
      const k = +rg.value;
      el.querySelector('[data-kv]').textContent = k;
      /* tamanhos como no sklearn: os primeiros N % k folds têm mais um elemento */
      const sizes = Array.from({ length: k }, (_, i) => Math.floor(N / k) + (i < N % k ? 1 : 0));
      const starts = sizes.map((_, i) => sum(sizes.slice(0, i)));
      const rowH = k > 12 ? 16 : 24, r = Math.min(9, rowH / 2 - 2), x0 = 112, dx = (620 - x0) / N;
      const rows = [{ lbl: 'Hold-out 75/25', a: Math.round(N * 0.75), b: N, ho: true }, ...sizes.map((s, i) => ({ lbl: k === N ? `Iteração ${i + 1}/N` : `Iteração ${i + 1}`, a: starts[i], b: starts[i] + s }))];
      const H = 14 + rows.length * rowH + 14;
      svg.setAttribute('viewBox', `0 0 640 ${H}`);
      svg.innerHTML = rows.map((rw, j) => {
        const y = 14 + j * rowH + rowH / 2 + (j ? 10 : 0);
        return `<text x="${x0 - 10}" y="${y + 4}" text-anchor="end" class="${rw.ho ? 'lab' : ''}">${rw.lbl}</text>` +
          Array.from({ length: N }, (_, i) => `<circle cx="${x0 + dx * (i + .5)}" cy="${y}" r="${r}" style="fill:${i >= rw.a && i < rw.b ? 'var(--accent)' : 'var(--rule)'}"/>`).join('');
      }).join('') + `<line class="ax" x1="20" x2="620" y1="${14 + rowH + 5}" y2="${14 + rowH + 5}" style="stroke-dasharray:3 4"/>`;
      svg.setAttribute('viewBox', `0 0 640 ${H + 10}`);
      kp.innerHTML = kpi('modelos treinados', k, 1) + kpi('treino / iteração', sizes.length && N - sizes[0] === N - sizes[sizes.length - 1] ? N - sizes[0] : `${N - sizes[0]}–${N - sizes[sizes.length - 1]}`) +
        kpi('teste / iteração', sizes[0] === sizes[sizes.length - 1] ? sizes[0] : `${sizes[sizes.length - 1]}–${sizes[0]}`) + kpi('vezes que cada ponto é teste', 1, 1);
    }
    rg.addEventListener('input', draw);
    el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { rg.value = b.dataset.k; draw(); } });
    draw();
  };

  /* ---------- utilidades extra (integração numérica numa grelha) ---------- */
  function moments(xs, f) {
    const dx = xs[1] - xs[0], m0 = sum(f) * dx;
    const mu = sum(xs.map((x, i) => x * f[i])) * dx / m0;
    const c = k => sum(xs.map((x, i) => (x - mu) ** k * f[i])) * dx / m0;
    const v = c(2);
    let acc = 0, med = xs[0];
    for (let i = 0; i < xs.length; i++) { acc += f[i] * dx / m0; if (acc >= 0.5) { med = xs[i]; break; } }
    const mode = xs[f.indexOf(Math.max(...f))];
    return { mean: mu, sd: Math.sqrt(v), skew: c(3) / v ** 1.5, kurt: c(4) / v ** 2 - 3, median: med, mode };
  }
  const readJSON = el => { const s = el.querySelector('script[type="application/json"]'); return s ? JSON.parse(s.textContent) : {}; };
  const col = c => c && c.startsWith('--') ? `var(${c})` : `var(--${c || 's1'})`;

  /* =====================================================================
     heatmap — matriz de correlação.  <script type="application/json">{labels, matrix}</script>
     ===================================================================== */
  W.heatmap = el => {
    const { labels, matrix } = readJSON(el);
    el.innerHTML = head(el, 'Matriz de correlação', 'Cada célula é a correlação entre duas variáveis, de −1 (azul) a 1 (vermelho). Passa o rato ou toca numa célula.') + `
      <div class="hm-wrap"><table class="hm"><thead><tr><th></th>${labels.map((_, j) => `<th>${j + 1}</th>`).join('')}</tr></thead><tbody>
      ${matrix.map((row, i) => `<tr><th>${i + 1} · ${esc(labels[i])}</th>${row.map((v, j) => {
        const p = Math.round(Math.abs(v) * 80);
        const bg = `color-mix(in oklab, ${v >= 0 ? 'var(--bad)' : 'var(--s1)'} ${p}%, var(--card))`;
        return `<td data-i="${i}" data-j="${j}" style="background:${bg};${p > 50 ? 'color:#fff' : ''}" tabindex="0">${fmt(v, 2)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="w-out">Escolhe uma célula.</p>`;
    const out = el.querySelector('.w-out');
    const pick = td => {
      const i = +td.dataset.i, j = +td.dataset.j, v = matrix[i][j], a = Math.abs(v);
      if (i === j) { out.innerHTML = `<b>${esc(labels[i])}</b> com ela própria: r = 1 (a diagonal é sempre 1).`; return; }
      const f = a >= 0.7 ? 'forte' : a >= 0.4 ? 'moderada' : a >= 0.1 ? 'fraca' : 'praticamente nula';
      out.innerHTML = `<b>${esc(labels[i])}</b> × <b>${esc(labels[j])}</b>: r = <b>${fmt(v, 2)}</b> — correlação ${f}${a >= 0.1 ? (v > 0 ? ' positiva (sobem juntas)' : ' negativa (quando uma sobe, a outra desce)') : ''}.`;
    };
    el.querySelectorAll('td[data-i]').forEach(td => { td.addEventListener('mouseenter', () => pick(td)); td.addEventListener('click', () => pick(td)); td.addEventListener('focus', () => pick(td)); });
  };

  /* =====================================================================
     shape — assimetria (skew-normal) e curtose (normal generalizada)
     ===================================================================== */
  W.shape = el => {
    el.innerHTML = head(el, 'Forma da distribuição: assimetria e curtose', 'Escolhe o que queres explorar e arrasta o cursor.') + `
      <div class="seg"><button type="button" class="btn sm on" data-m="skew">Assimetria</button><button type="button" class="btn sm" data-m="kurt">Curtose</button></div>
      <label class="f"><span data-lbl></span><input type="range"></label>
      <svg class="w-svg" viewBox="0 0 640 240" role="img" aria-label="Curva de densidade"></svg>
      <div class="legend" data-leg></div>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), rg = el.querySelector('input'), lbl = el.querySelector('[data-lbl]'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out'), leg = el.querySelector('[data-leg]');
    let mode = 'skew';
    const xs = Array.from({ length: 601 }, (_, i) => -6 + i * 0.02);
    function set(m) {
      mode = m;
      el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      if (m === 'skew') { Object.assign(rg, { min: -8, max: 8, step: 0.5 }); rg.value = 4; }
      else { Object.assign(rg, { min: 0.8, max: 8, step: 0.1 }); rg.value = 1; }
      draw();
    }
    function draw() {
      const v = +rg.value;
      let f, m;
      if (mode === 'skew') {
        f = xs.map(x => 2 * phi(x) * Phi(v * x));
        m = moments(xs, f);
        lbl.innerHTML = `parâmetro de forma α = <b>${fmt(v, 1)}</b>`;
      } else {
        const raw = xs.map(x => Math.exp(-(Math.abs(x) ** v)));
        const s = moments(xs, raw).sd;
        f = xs.map(x => Math.exp(-(Math.abs(x * s) ** v)));
        m = moments(xs, f);
        lbl.innerHTML = `forma β = <b>${fmt(v, 1)}</b> (β = 2 é a normal)`;
      }
      const ymax = Math.max(...f, 0.42) * 1.08;
      const X = scale(-4.5, 4.5, 16, 624), Y = scale(0, ymax, 205, 22);
      const vis = xs.map((x, i) => [x, f[i]]).filter(([x]) => x >= -4.5 && x <= 4.5);
      const path = 'M' + vis.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' L');
      const area = path + ` L${X(4.5)},${Y(0)} L${X(-4.5)},${Y(0)} Z`;
      const vline = (x, c, dash, t, ty) => `<line x1="${X(x)}" x2="${X(x)}" y1="${Y(0)}" y2="34" style="stroke:${c};stroke-width:2;${dash ? 'stroke-dasharray:' + dash : ''}"/><text x="${X(x)}" y="${ty}" text-anchor="middle" class="lab" style="fill:${c}">${t}</text>`;
      const ref = mode === 'kurt' ? `<path d="M${vis.map(([x]) => `${X(x).toFixed(1)},${Y(phi(x)).toFixed(1)}`).join(' L')}" style="fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:5 4"/>` : '';
      svg.innerHTML = `<path d="${area}" style="fill:var(--accent);opacity:.15"/>${ref}<path d="${path}" style="fill:none;stroke:var(--accent);stroke-width:2.5"/>
        <line class="ax" x1="16" x2="624" y1="${Y(0)}" y2="${Y(0)}"/>` +
        (mode === 'skew' ? vline(m.mode, 'var(--s3)', '2 3', 'moda', 14) + vline(m.median, 'var(--s2)', '6 4', 'mediana', 28) + vline(m.mean, 'var(--ink)', '', 'média', 14) : '');
      leg.innerHTML = mode === 'skew'
        ? '<span><i style="background:var(--ink)"></i>média</span><span><i style="background:var(--s2)"></i>mediana</span><span><i style="background:var(--s3)"></i>moda</span>'
        : '<span><i style="background:var(--accent)"></i>distribuição (variância 1)</span><span><i style="background:var(--muted)"></i>normal de referência</span>';
      if (mode === 'skew') {
        kp.innerHTML = kpi('assimetria (skew)', fmt(m.skew, 2), 1) + kpi('média', fmt(m.mean, 2)) + kpi('mediana', fmt(m.median, 2)) + kpi('moda', fmt(m.mode, 2));
        out.innerHTML = Math.abs(m.skew) < 0.05 ? '<b>Simétrica</b>: média, mediana e moda coincidem.'
          : m.skew > 0 ? '<b>Assimetria positiva</b> (cauda longa à direita): moda &lt; mediana &lt; média. Os valores altos raros puxam a média para a direita.'
          : '<b>Assimetria negativa</b> (cauda longa à esquerda): média &lt; mediana &lt; moda.';
      } else {
        kp.innerHTML = kpi('curtose (excesso)', fmt(m.kurt, 2), 1);
        out.innerHTML = Math.abs(m.kurt) < 0.05 ? '<b>Mesocúrtica</b> (como a normal): curtose ≈ 0.'
          : m.kurt > 0 ? '<b>Leptocúrtica</b> (curtose &gt; 0): pico mais alto e caudas mais pesadas do que a normal — mais valores extremos.'
          : '<b>Platicúrtica</b> (curtose &lt; 0): mais achatada, caudas leves — poucos valores extremos.';
      }
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) set(b.dataset.m); });
    rg.addEventListener('input', draw);
    set('skew');
  };

  /* =====================================================================
     scale — Min-Max vs. standardização (z-score)
     ===================================================================== */
  W.scale = el => {
    const initial = el.dataset.values || '127, 100, 101, 113, 118, 70, 162';
    el.innerHTML = head(el, 'Normalização Min-Max vs. standardização', 'Edita os valores e compara as duas escalas. Experimenta acrescentar um outlier.') + `
      <div class="row"><label class="f grow">Valores<input type="text" inputmode="decimal" value="${esc(initial)}"></label>
        <button type="button" class="btn" data-a="out">+ Outlier</button><button type="button" class="btn" data-a="reset">↺ Repor</button></div>
      <div class="two"><div class="tw"></div><div style="display:flex;flex-direction:column;gap:12px"><dl class="kpis"></dl><p class="w-out"></p></div></div>`;
    const inp = el.querySelector('input'), tw = el.querySelector('.tw'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    function draw() {
      const a = parseNums(inp.value);
      if (a.length < 2) { tw.innerHTML = ''; kp.innerHTML = ''; out.textContent = 'Introduz pelo menos dois valores.'; return; }
      const mn = Math.min(...a), mx = Math.max(...a), m = mean(a), sd = Math.sqrt(varPop(a));
      tw.innerHTML = `<table><thead><tr><th class="num">x</th><th class="num">Min-Max</th><th class="num">z-score</th></tr></thead><tbody>
        ${a.map(x => `<tr><td class="num">${fmt(x, 3)}</td><td class="num">${fmt((x - mn) / ((mx - mn) || 1), 3)}</td><td class="num">${fmt((x - m) / (sd || 1), 3)}</td></tr>`).join('')}</tbody></table>`;
      kp.innerHTML = kpi('mín', fmt(mn)) + kpi('máx', fmt(mx)) + kpi('média μ', fmt(m)) + kpi('desvio σ', fmt(sd));
      const mm = a.map(x => (x - mn) / ((mx - mn) || 1)).sort((p, q) => p - q);
      out.innerHTML = `Min-Max põe tudo em [0, 1]; o z-score centra em 0 com desvio 1. ` +
        (mm.length > 2 && mm[mm.length - 2] < 0.4 ? '<b>Com o outlier, quase todos os valores Min-Max ficam esmagados perto de 0</b> — o z-score sofre menos.' : '');
    }
    inp.addEventListener('input', draw);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'reset') inp.value = initial;
      else { const a = parseNums(inp.value); inp.value = [...a, Math.round(Math.max(...a) * 5)].join(', '); }
      draw();
    });
    draw();
  };

  /* =====================================================================
     linfit — ajustar uma reta à mão vs. mínimos quadrados
     ===================================================================== */
  W.linfit = el => {
    const r = rng(5), xs = Array.from({ length: 14 }, (_, i) => 1 + i * 0.7), ys = xs.map(x => 1.5 * x + 4 + gauss(r) * 2.2);
    const mx = mean(xs), my = mean(ys);
    const b1 = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sum(xs.map(x => (x - mx) ** 2)), b0 = my - b1 * mx;
    const mse = (w, b) => mean(xs.map((x, i) => (ys[i] - (w * x + b)) ** 2));
    el.innerHTML = head(el, 'Encontra a melhor reta', 'Ajusta o declive e a ordenada na origem. As linhas vermelhas são os erros (resíduos); a regressão linear escolhe a reta que minimiza a média dos seus quadrados (MSE).') + `
      <div class="row">
        <label class="f grow"><span>declive β₁ = <b data-wv></b></span><input type="range" min="-1" max="4" step="0.05" value="0.4" data-i="w"></label>
        <label class="f grow"><span>ordenada na origem β₀ = <b data-bv></b></span><input type="range" min="-6" max="20" step="0.25" value="12" data-i="b"></label>
        <button type="button" class="btn primary" data-a="fit">Mínimos quadrados</button>
      </div>
      <svg class="w-svg" viewBox="0 0 640 260" role="img" aria-label="Pontos e reta ajustada"></svg>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out'), wI = el.querySelector('[data-i="w"]'), bI = el.querySelector('[data-i="b"]');
    const X = scale(0, 11, 44, 624), Y = scale(0, 25, 236, 14);
    function draw() {
      const w = +wI.value, b = +bI.value;
      el.querySelector('[data-wv]').textContent = fmt(w); el.querySelector('[data-bv]').textContent = fmt(b);
      const yt = niceTicks(0, 25, 5);
      svg.innerHTML = yt.map(t => `<line class="ax" x1="44" x2="624" y1="${Y(t)}" y2="${Y(t)}" style="opacity:.5"/><text x="38" y="${Y(t) + 4}" text-anchor="end">${t}</text>`).join('') +
        xs.map((x, i) => `<line x1="${X(x)}" x2="${X(x)}" y1="${Y(ys[i])}" y2="${Y(w * x + b)}" style="stroke:var(--bad);stroke-width:1.5;opacity:.8"/>`).join('') +
        `<line x1="${X(0)}" x2="${X(11)}" y1="${Y(b)}" y2="${Y(w * 11 + b)}" style="stroke:var(--accent);stroke-width:2.5"/>` +
        xs.map((x, i) => `<circle cx="${X(x)}" cy="${Y(ys[i])}" r="5" style="fill:var(--s1);stroke:var(--card);stroke-width:1.5"/>`).join('');
      const cur = mse(w, b), best = mse(b1, b0);
      kp.innerHTML = kpi('MSE desta reta', fmt(cur, 2), 1) + kpi('MSE mínimo possível', fmt(best, 2)) + kpi('solução ótima', `ŷ = ${fmt(b0, 2)} + ${fmt(b1, 2)}x`);
      out.innerHTML = cur - best < 0.01 ? '<b>Encontraste o mínimo</b>: é esta a reta que a regressão linear devolve.' : `Estás ${fmt(cur / best, 1)}× acima do erro mínimo.`;
    }
    wI.addEventListener('input', draw); bI.addEventListener('input', draw);
    el.querySelector('[data-a="fit"]').addEventListener('click', () => { wI.value = b1.toFixed(2); bI.value = b0.toFixed(2); draw(); });
    draw();
  };

  /* =====================================================================
     sigmoid — regressão logística com uma feature, limiar e fronteira
     ===================================================================== */
  W.sigmoid = el => {
    const r = rng(21), pts = Array.from({ length: 36 }, () => { const x = r() * 10; return { x, y: r() < 1 / (1 + Math.exp(-1.3 * (x - 5.2))) ? 1 : 0, j: (r() - 0.5) * 0.06 }; });
    const sig = z => 1 / (1 + Math.exp(-z));
    el.innerHTML = head(el, 'Da reta à probabilidade', 'A regressão logística calcula z = w·x + b e passa-o pela sigmoide, obtendo uma probabilidade entre 0 e 1. Acima do limiar, a previsão é a classe 1.') + `
      <div class="row">
        <label class="f grow"><span>peso w = <b data-wv></b></span><input type="range" min="0" max="4" step="0.05" value="0.6" data-i="w"></label>
        <label class="f grow"><span>viés b = <b data-bv></b></span><input type="range" min="-16" max="2" step="0.25" value="-3" data-i="b"></label>
        <label class="f grow"><span>limiar = <b data-tv></b></span><input type="range" min="0.05" max="0.95" step="0.05" value="0.5" data-i="t"></label>
        <button type="button" class="btn primary" data-a="fit">Ajustar aos dados</button>
      </div>
      <svg class="w-svg" viewBox="0 0 640 250" role="img" aria-label="Curva sigmoide"></svg>
      <div class="legend"><span><i class="dot" style="background:var(--s1)"></i>classe 0</span><span><i class="dot" style="background:var(--s2)"></i>classe 1</span><span><i style="background:var(--accent)"></i>P(classe 1)</span><span><i style="background:var(--ink)"></i>fronteira de decisão</span></div>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const I = k => el.querySelector(`[data-i="${k}"]`);
    const X = scale(0, 10, 40, 624), Y = scale(0, 1, 222, 18);
    function draw() {
      const w = +I('w').value, b = +I('b').value, t = +I('t').value;
      el.querySelector('[data-wv]').textContent = fmt(w); el.querySelector('[data-bv]').textContent = fmt(b); el.querySelector('[data-tv]').textContent = fmt(t);
      const curve = Array.from({ length: 201 }, (_, i) => i * 0.05).map(x => `${X(x).toFixed(1)},${Y(sig(w * x + b)).toFixed(1)}`).join(' L');
      const xb = w > 0 ? (Math.log(t / (1 - t)) - b) / w : NaN;
      let ok = 0, ll = 0;
      pts.forEach(p => { const q = sig(w * p.x + b); ok += ((q >= t ? 1 : 0) === p.y); ll -= p.y ? Math.log(Math.max(q, 1e-9)) : Math.log(Math.max(1 - q, 1e-9)); });
      svg.innerHTML = [0, 0.5, 1].map(v => `<line class="ax" x1="40" x2="624" y1="${Y(v)}" y2="${Y(v)}" style="opacity:.5"/><text x="34" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join('') +
        `<line x1="40" x2="624" y1="${Y(t)}" y2="${Y(t)}" style="stroke:var(--muted);stroke-dasharray:4 4"/>` +
        (Number.isFinite(xb) && xb >= 0 && xb <= 10 ? `<rect x="${X(xb)}" y="18" width="${624 - X(xb)}" height="204" style="fill:var(--s2);opacity:.07"/><line x1="${X(xb)}" x2="${X(xb)}" y1="14" y2="222" style="stroke:var(--ink);stroke-width:2"/><text x="${X(xb) + 6}" y="30" class="lab">prevê classe 1 →</text>` : '') +
        `<path d="M${curve}" style="fill:none;stroke:var(--accent);stroke-width:2.5"/>` +
        pts.map(p => `<circle cx="${X(p.x)}" cy="${Y(p.y + p.j)}" r="5" style="fill:${p.y ? 'var(--s2)' : 'var(--s1)'};opacity:.85"/>`).join('') +
        `<text x="332" y="246" text-anchor="middle">x (feature)</text>`;
      kp.innerHTML = kpi('fronteira x*', Number.isFinite(xb) ? fmt(xb, 2) : '—', 1) + kpi('accuracy', fmt(ok / pts.length, 3), 1) + kpi('log-loss médio', fmt(ll / pts.length, 3));
      out.innerHTML = `P(classe 1 | x) = σ(${fmt(w)}·x ${b < 0 ? '−' : '+'} ${fmt(Math.abs(b))}). A fronteira é o x onde a probabilidade cruza o limiar ${fmt(t)}. O treino escolhe w e b que minimizam o <b>log-loss</b>, não a accuracy.`;
    }
    ['w', 'b', 't'].forEach(k => I(k).addEventListener('input', draw));
    el.querySelector('[data-a="fit"]').addEventListener('click', () => {
      let w = 0.1, b = 0;
      for (let it = 0; it < 4000; it++) { let gw = 0, gb = 0; pts.forEach(p => { const e = sig(w * p.x + b) - p.y; gw += e * p.x; gb += e; }); w -= 0.02 * gw / pts.length; b -= 0.2 * gb / pts.length; }
      I('w').value = Math.min(4, w).toFixed(2); I('b').value = Math.max(-16, b).toFixed(2); I('t').value = 0.5; draw();
    });
    draw();
  };

  /* =====================================================================
     lines — curvas pré-calculadas (afinação de hiperparâmetros, caminhos)
     <script type="application/json">{xlabel, ylabel, x:[...], series:[{name,color,y:[...]}], best, notes:{i:"..."}}</script>
     ===================================================================== */
  W.lines = el => {
    const c = readJSON(el), n = c.x.length;
    el.innerHTML = head(el, c.title || 'Curva', c.hint || '') + `
      <label class="f"><span>${esc(c.xlabel)} = <b data-xv></b></span><input type="range" min="0" max="${n - 1}" step="1" value="${c.start ?? c.best ?? 0}"></label>
      <svg class="w-svg" viewBox="0 0 640 270" role="img" aria-label="${esc(c.title || 'Curva')}"></svg>
      <div class="legend">${c.series.map(s => `<span><i style="background:${col(s.color)}"></i>${esc(s.name)}</span>`).join('')}</div>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), rg = el.querySelector('input'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const all = c.series.flatMap(s => s.y);
    const lo = c.ymin ?? Math.min(...all), hi = c.ymax ?? Math.max(...all), pad = (hi - lo) * 0.08 || 0.01;
    const X = scale(0, n - 1, 56, 620), Y = scale(lo - pad, hi + pad, 232, 16), yt = niceTicks(lo - pad, hi + pad, 5);
    const every = Math.ceil(n / 9);
    function draw() {
      const k = +rg.value;
      el.querySelector('[data-xv]').textContent = c.x[k];
      svg.innerHTML = yt.map(t => `<line class="ax" x1="56" x2="620" y1="${Y(t)}" y2="${Y(t)}" style="opacity:.5"/><text x="50" y="${Y(t) + 4}" text-anchor="end">${fmt(t, 3)}</text>`).join('') +
        c.x.map((v, i) => i % every && i !== n - 1 ? '' : `<text x="${X(i)}" y="250" text-anchor="middle">${esc(v)}</text>`).join('') +
        `<text x="338" y="267" text-anchor="middle">${esc(c.xlabel)}</text>` +
        (c.best != null ? `<line x1="${X(c.best)}" x2="${X(c.best)}" y1="16" y2="232" style="stroke:var(--good);stroke-dasharray:3 4"/>` : '') +
        `<line x1="${X(k)}" x2="${X(k)}" y1="16" y2="232" style="stroke:var(--ink);stroke-width:1.5;opacity:.6"/>` +
        c.series.map(s => `<path d="M${s.y.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' L')}" style="fill:none;stroke:${col(s.color)};stroke-width:2.2"/>` +
          s.y.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === k ? 6 : 3.5}" style="fill:${col(s.color)};stroke:var(--card);stroke-width:1.5"/>`).join('')).join('');
      kp.innerHTML = kpi(esc(c.xlabel), esc(c.x[k]), 1) + c.series.map(s => kpi(esc(s.name), fmt(s.y[k], c.digits ?? 3))).join('') + (c.extra ? c.extra.map(e => kpi(esc(e.name), esc(e.v[k]))).join('') : '');
      out.innerHTML = (c.notes && c.notes[k]) || c.note || '';
    }
    rg.addEventListener('input', draw);
    draw();
  };

  /* =====================================================================
     encoding — comparar codificações de uma variável categórica
     ===================================================================== */
  W.encoding = el => {
    const dv = el.dataset.values || 'Low, Very_High, High, Medium, None, Low', dord = el.dataset.order || 'None, Low, Medium, High, Very_High';
    const M = [['map', 'Mapa ordinal'], ['label', 'LabelEncoder'], ['onehot', 'One-Hot'], ['binary', 'Binário'], ['fact', 'Factorize']];
    el.innerHTML = head(el, 'Codificar uma variável categórica', 'Escolhe o método e vê que colunas numéricas resultam. Podes editar os valores.') + `
      <div class="row"><label class="f grow">Valores da coluna<input type="text" data-i="v" value="${esc(dv)}"></label>
        <label class="f grow">Ordem (só para o mapa ordinal)<input type="text" data-i="o" value="${esc(dord)}"></label></div>
      <div class="seg">${M.map(([k, l], i) => `<button type="button" class="btn sm${i ? '' : ' on'}" data-m="${k}">${l}</button>`).join('')}</div>
      <div class="tw"></div><p class="w-out"></p>`;
    const tw = el.querySelector('.tw'), out = el.querySelector('.w-out');
    const split = s => s.split(',').map(t => t.trim()).filter(Boolean);
    let m = 'map';
    const NOTE = {
      map: 'Tu defines a ordem: ideal para variáveis <b>ordinais</b> (None &lt; Low &lt; … ). Uma só coluna.',
      label: 'Números atribuídos por <b>ordem alfabética</b> (High = 0, Low = 1…), não pelo significado. Uma só coluna, mas cria uma ordem artificial.',
      onehot: 'Uma coluna binária por categoria (colunas por ordem alfabética, como o <code>pd.get_dummies</code>). Sem ordem artificial, mas com muitas categorias gera muitas colunas.',
      binary: 'Cada categoria recebe um inteiro (ordem de aparecimento, a começar em 1) escrito em binário: ⌈log₂(k+1)⌉ colunas em vez de k. Compromisso entre os dois anteriores.',
      fact: 'Números por <b>ordem de aparecimento</b> nos dados (<code>pd.factorize(...)[0] + 1</code>). Rápido, mas a ordem é arbitrária.'
    };
    function draw() {
      const vals = split(el.querySelector('[data-i="v"]').value), ord = split(el.querySelector('[data-i="o"]').value);
      const uniq = [...new Set(vals)], alpha = [...uniq].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      let cols, rows;
      if (m === 'map') { cols = ['código']; rows = vals.map(v => [ord.indexOf(v) >= 0 ? ord.indexOf(v) : '?']); }
      else if (m === 'label') { cols = ['código']; rows = vals.map(v => [alpha.indexOf(v)]); }
      else if (m === 'fact') { cols = ['código']; rows = vals.map(v => [uniq.indexOf(v) + 1]); }
      else if (m === 'onehot') { cols = alpha; rows = vals.map(v => alpha.map(a => +(a === v))); }
      else { const nb = Math.max(1, Math.ceil(Math.log2(uniq.length + 1))); cols = Array.from({ length: nb }, (_, i) => `bit_${i}`); rows = vals.map(v => (uniq.indexOf(v) + 1).toString(2).padStart(nb, '0').split('').map(Number)); }
      tw.innerHTML = `<table><thead><tr><th>valor</th>${cols.map(c2 => `<th class="num">${esc(c2)}</th>`).join('')}</tr></thead><tbody>
        ${vals.map((v, i) => `<tr><td>${esc(v)}</td>${rows[i].map(x => `<td class="num">${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      out.innerHTML = `${NOTE[m]} <b>${cols.length}</b> coluna(s) para ${uniq.length} categorias.`;
    }
    el.addEventListener('input', draw);
    el.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; m = b.dataset.m; el.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    draw();
  };

  /* =====================================================================
     voting — hard vs. soft voting com três modelos
     ===================================================================== */
  W.voting = el => {
    const init = (el.dataset.values || '0.9,0.45,0.4').split(',').map(Number);
    el.innerHTML = head(el, 'Hard voting vs. soft voting', 'Cada modelo dá a probabilidade de a amostra ser da classe 1. No hard voting cada modelo vota numa classe; no soft voting faz-se a média das probabilidades.') + `
      <div class="vt">${init.map((v, i) => `<label class="f"><span>Modelo ${i + 1}: P(classe 1) = <b data-v="${i}"></b> → vota <b data-c="${i}"></b></span><input type="range" min="0" max="1" step="0.05" value="${v}" data-i="${i}"></label>`).join('')}</div>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    function draw() {
      const p = [0, 1, 2].map(i => +el.querySelector(`[data-i="${i}"]`).value);
      p.forEach((v, i) => { el.querySelector(`[data-v="${i}"]`).textContent = fmt(v); el.querySelector(`[data-c="${i}"]`).textContent = v >= 0.5 ? '1' : '0'; });
      const votes = p.filter(v => v >= 0.5).length, hard = votes >= 2 ? 1 : 0, avg = mean(p), soft = avg >= 0.5 ? 1 : 0;
      kp.innerHTML = kpi('votos na classe 1', `${votes} de 3`) + kpi('hard voting', `classe ${hard}`, 1) + kpi('média das probabilidades', fmt(avg, 3)) + kpi('soft voting', `classe ${soft}`, 1);
      out.innerHTML = hard === soft ? 'Os dois métodos concordam.' : `<b>Discordam!</b> ${hard ? 'A maioria vota 1, mas' : 'A maioria vota 0, mas'} ${soft ? 'um modelo muito confiante na classe 1 puxa a média para cima' : 'a confiança média na classe 1 fica abaixo de 0.5'}. O soft voting tem em conta <b>quão seguro</b> está cada modelo.`;
    }
    el.addEventListener('input', draw);
    draw();
  };

  /* =====================================================================
     bootstrap — amostragem com reposição (base do bagging)
     ===================================================================== */
  W.bootstrap = el => {
    const N = +(el.dataset.n || 10), L = 'ABCDEFGHIJKLMNOPQRST'.slice(0, N).split('');
    let r = rng(3);
    el.innerHTML = head(el, 'Amostras bootstrap', `Cada árvore do bagging treina com uma amostra de ${N} elementos tirados <b>com reposição</b> dos ${N} originais: uns repetem-se, outros ficam de fora (out-of-bag).`) + `
      <div class="row"><button type="button" class="btn primary" data-a="new">Novas amostras</button></div>
      <div class="bs"></div><dl class="kpis"></dl><p class="w-out"></p>`;
    const bs = el.querySelector('.bs'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const chip = (l, cls) => `<span class="chip ${cls || ''}">${l}</span>`;
    function draw() {
      const samples = [0, 1, 2].map(() => Array.from({ length: N }, () => L[Math.floor(r() * N)]).sort());
      bs.innerHTML = `<div class="bs-row"><span class="lbl-mono">Original</span>${L.map(l => chip(l)).join('')}</div>` +
        samples.map((s, i) => { const oob = L.filter(l => !s.includes(l)); return `<div class="bs-row"><span class="lbl-mono">Árvore ${i + 1}</span>${s.map((l, j) => chip(l, s.indexOf(l) !== j ? 'rep' : 'in')).join('')}<span class="small muted">fora: ${oob.join(', ') || '—'}</span></div>`; }).join('');
      const fr = samples.map(s => new Set(s).size / N);
      kp.innerHTML = kpi('elementos distintos (média)', fmt(mean(fr) * 100, 0) + '%', 1) + kpi('teoria (N grande)', '≈ 63.2%');
      out.innerHTML = 'Em média, cada amostra contém cerca de 63% dos elementos originais (1 − 1/e). Como cada árvore vê dados ligeiramente diferentes, os seus erros são diferentes — e a média das previsões é mais estável do que cada árvore sozinha.';
    }
    el.querySelector('[data-a="new"]').addEventListener('click', draw);
    draw();
  };

  /* =====================================================================
     cloudstack — quem gere cada camada: on-premises, IaaS, PaaS, SaaS
     ===================================================================== */
  W.cloudstack = el => {
    const LAYERS = ['Aplicações', 'Segurança', 'Bases de dados', 'Sistema operativo', 'Virtualização', 'Servidores', 'Armazenamento', 'Rede', 'Data centers'];
    const M = {
      onprem: { l: 'On-premises', n: 9, txt: 'Tudo é teu: comprar e ligar o hardware, virtualizar, instalar o SO, manter as bases de dados e a aplicação.', ex: 'O servidor na cave da empresa' },
      iaas: { l: 'IaaS', n: 4, txt: 'O fornecedor dá-te máquinas virtuais, discos e rede. Tu instalas e geres o sistema operativo e tudo o que está por cima.', ex: 'Amazon EC2, Google Compute Engine, Amazon S3, OpenStack' },
      paas: { l: 'PaaS', n: 1, txt: 'Entregas o código da aplicação; a plataforma trata de onde e como corre (SO, runtime, escala).', ex: 'Google App Engine' },
      saas: { l: 'SaaS', n: 0, txt: 'Usas um software pronto, através de uma API, de um cliente ou do browser. Só configuras e usas.', ex: 'Gmail, Salesforce, Amazon DynamoDB, Amazon SageMaker' }
    };
    el.innerHTML = head(el, 'Quem gere o quê?', 'Escolhe o modelo. As camadas a cor são geridas por ti (cliente); as cinzentas pelo fornecedor de cloud.') + `
      <div class="seg">${Object.entries(M).map(([k, v], i) => `<button type="button" class="btn sm${i === 1 ? ' on' : ''}" data-m="${k}">${v.l}</button>`).join('')}</div>
      <div class="cs-wrap"><div class="cs-stack"></div><div style="display:flex;flex-direction:column;gap:10px"><dl class="kpis"></dl><p class="w-out"></p></div></div>`;
    const st = el.querySelector('.cs-stack'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    function draw(k) {
      const m = M[k];
      el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === k));
      st.innerHTML = LAYERS.map((l, i) => `<div class="cs-layer ${i < m.n ? 'me' : 'prov'}">${l}<span>${i < m.n ? 'tu' : 'fornecedor'}</span></div>`).join('');
      kp.innerHTML = kpi('geres tu', `${m.n} de 9`, 1) + kpi('o fornecedor gere', `${9 - m.n} de 9`);
      out.innerHTML = `${m.txt}<br><span class="small muted">Exemplos: ${m.ex}.</span>`;
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) draw(b.dataset.m); });
    draw('iaas');
  };

  /* =====================================================================
     arch — arquiteturas distribuídas; clicar num nó simula a sua falha
     ===================================================================== */
  W.arch = el => {
    const A = {
      cs: { l: 'Cliente-servidor', nodes: [['c', 'Cliente', 320, 40, 0], ['s', 'Servidor', 320, 200, 1]], edges: [['c', 's']],
        scale: 'Nenhuma (um só servidor)', spof: 'O servidor', ex: 'A Web (HTTP)', txt: 'A funcionalidade e os dados estão no servidor; o <b>stub</b> no cliente esconde os detalhes do protocolo.' },
      proxy: { l: 'Proxy-servidor', nodes: [['c', 'Cliente', 320, 30, 0], ['p', 'Proxy', 320, 118, 1], ['s1', 'Servidor 1', 170, 210, 0], ['s2', 'Servidor 2', 320, 210, 0], ['s3', 'Servidor n', 470, 210, 0]], edges: [['c', 'p'], ['p', 's1'], ['p', 's2'], ['p', 's3']],
        scale: 'Boa: o proxy distribui por vários servidores', spof: 'O proxy', ex: 'MongoDB (mongos)', txt: 'O <b>proxy</b> torna os servidores transparentes para o cliente: ideal para replicação e sharding transparentes. Mas concentra todo o tráfego.' },
      mw: { l: 'Manager-worker', nodes: [['c', 'Cliente', 150, 40, 0], ['m', 'Manager (metadados)', 470, 40, 1], ['w1', 'Worker 1', 190, 210, 0], ['w2', 'Worker 2', 340, 210, 0], ['w3', 'Worker n', 490, 210, 0]], edges: [['c', 'm'], ['c', 'w1'], ['c', 'w2'], ['c', 'w3'], ['m', 'w1', 1], ['m', 'w2', 1], ['m', 'w3', 1]],
        scale: 'Boa: os dados passam diretamente pelos workers', spof: 'O manager', ex: 'HDFS, Lustre', txt: 'O <b>manager</b> sabe onde está cada ficheiro (metadados); os <b>workers</b> guardam o conteúdo. O cliente pergunta ao manager e fala diretamente com os workers.' },
      group: { l: 'Grupo de servidores', nodes: [['c', 'Cliente', 320, 30, 0], ['s1', 'Servidor 1', 170, 190, 0], ['s2', 'Servidor 2', 320, 215, 0], ['s3', 'Servidor n', 470, 190, 0]], edges: [['c', 's1'], ['c', 's2'], ['c', 's3'], ['s1', 's2', 1], ['s2', 's3', 1], ['s1', 's3', 1]],
        scale: 'Limitada: coordenar todos custa mais quanto mais servidores', spof: 'Nenhum', ex: 'ZooKeeper', txt: 'Todos os servidores atendem pedidos e um <b>protocolo de sincronização</b> mantém o estado consistente entre eles.' },
      bus: { l: 'Bus', nodes: [['p1', 'Produtor A', 110, 60, 0], ['p2', 'Produtor B', 110, 190, 0], ['b', 'Bus', 320, 125, 1], ['k1', 'Consumidor X', 530, 60, 0], ['k2', 'Consumidor Y', 530, 190, 0]], edges: [['p1', 'b'], ['p2', 'b'], ['b', 'k1'], ['b', 'k2']],
        scale: 'Alta e flexível: produtores e consumidores entram e saem', spof: 'O bus (se não for distribuído)', ex: 'Apache Kafka', txt: 'O <b>bus</b> encaminha mensagens: os participantes publicam e consomem sem se conhecerem. Desacopla produtores de consumidores.' },
      tier: { l: 'Multi-camada', nodes: [['c', 'Cliente', 320, 25, 0], ['w', 'Servidor web', 320, 95, 1], ['a', 'Servidor aplicacional', 320, 165, 1], ['d', 'Base de dados', 320, 235, 1]], edges: [['c', 'w'], ['w', 'a'], ['a', 'd']],
        scale: 'Cada camada escala de forma independente', spof: 'Qualquer camada com um só servidor', ex: 'Web + app + base de dados', txt: 'Cada servidor é <b>cliente da camada seguinte</b> (cliente-servidor encadeado). Ex.: o servidor aplicacional usa um driver de base de dados (o stub) e fala SQL.' }
    };
    el.innerHTML = head(el, 'Arquiteturas distribuídas', 'Escolhe uma arquitetura e <b>clica num nó para o deitar abaixo</b>. Os nós a tracejado vermelho são pontos únicos de falha.') + `
      <div class="seg">${Object.entries(A).map(([k, v], i) => `<button type="button" class="btn sm${i ? '' : ' on'}" data-k="${k}">${v.l}</button>`).join('')}</div>
      <svg class="w-svg" viewBox="0 0 640 260" role="img" aria-label="Diagrama da arquitetura"></svg>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    let cur = 'cs', down = new Set();
    function draw() {
      const a = A[cur], pos = Object.fromEntries(a.nodes.map(n => [n[0], n]));
      svg.innerHTML = a.edges.map(([x, y, dash]) => { const p = pos[x], q = pos[y], off = down.has(x) || down.has(y);
        return `<line x1="${p[2]}" y1="${p[3]}" x2="${q[2]}" y2="${q[3]}" style="stroke:${off ? 'var(--bad)' : 'var(--muted)'};stroke-width:1.6;${dash ? 'stroke-dasharray:5 4;' : ''}opacity:${off ? .35 : .9}"/>`; }).join('') +
        a.nodes.map(([id, l, x, y, crit]) => { const w = Math.max(96, l.length * 7.4 + 22), d = down.has(id);
          return `<g data-n="${id}" style="cursor:pointer"><rect x="${x - w / 2}" y="${y - 17}" width="${w}" height="34" rx="8" style="fill:${d ? 'var(--bad-bg)' : id === 'c' ? 'var(--card-2)' : 'var(--accent-soft)'};stroke:${d || crit ? 'var(--bad)' : 'var(--accent)'};stroke-width:${crit ? 2 : 1.5};${crit && !d ? 'stroke-dasharray:5 3' : ''}"/>
            <text x="${x}" y="${y + 4}" text-anchor="middle" class="lab" style="${d ? 'text-decoration:line-through;fill:var(--bad)' : ''}">${d ? '✕ ' : ''}${l}</text></g>`; }).join('');
      kp.innerHTML = kpi('escalabilidade', a.scale) + kpi('ponto único de falha', a.spof, 1) + kpi('exemplo', a.ex);
      let msg = a.txt;
      if (down.size) {
        const crit = a.nodes.filter(n => down.has(n[0]) && n[4]);
        const srv = a.nodes.filter(n => n[0] !== 'c' && !n[0].startsWith('p') && !n[0].startsWith('k'));
        if (down.has('c')) msg = 'O cliente falhou: o serviço continua de pé para os restantes clientes.';
        else if (crit.length) msg = `<b>Serviço indisponível.</b> ${crit.map(n => n[1]).join(', ')} era um ponto único de falha (e de contenção). Solução típica: torná-lo também um grupo de servidores replicados.`;
        else if (cur === 'group' && srv.every(n => down.has(n[0]))) msg = '<b>Todos os servidores falharam</b>: não sobra ninguém para atender.';
        else msg = `<b>O serviço continua</b>: os restantes nós assumem o trabalho${cur === 'group' ? ' e mantêm o estado sincronizado' : cur === 'bus' ? '; os outros participantes não são afetados' : ' (desde que os dados estejam replicados)'}.`;
        msg += ' <span class="small muted">Clica de novo para recuperar o nó.</span>';
      }
      out.innerHTML = msg;
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (b) { cur = b.dataset.k; down = new Set(); el.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b)); draw(); return; }
      const g = e.target.closest('[data-n]'); if (g) { const id = g.dataset.n; down.has(id) ? down.delete(id) : down.add(id); draw(); }
    });
    draw();
  };

  /* =====================================================================
     idempotency — correr um playbook Ansible várias vezes
     ===================================================================== */
  W.idempotency = el => {
    const TASKS = [['pkg', 'Instalar nginx (apt)'], ['user', 'Criar utilizador deployer (user)'], ['conf', 'Copiar nginx.conf (template)'], ['svc', 'Garantir nginx a correr (service)']];
    const fresh = () => ({ web1: {}, web2: { pkg: 1, user: 1, conf: 1, svc: 1 } });
    let hosts = fresh(), tpl = 1, runs = 0;
    el.innerHTML = head(el, 'Idempotência: correr o mesmo playbook duas vezes', 'O web1 é uma máquina nova; o web2 já está configurado. Corre o playbook, volta a correr, e depois altera o template.') + `
      <div class="row"><button type="button" class="btn primary" data-a="run">▶ ansible-playbook site.yml</button>
        <button type="button" class="btn" data-a="tpl">Alterar o template</button><button type="button" class="btn" data-a="reset">↺ Repor</button></div>
      <div class="term" aria-live="polite"></div><p class="w-out"></p>`;
    const term = el.querySelector('.term'), out = el.querySelector('.w-out');
    term.innerHTML = '<span class="muted">$ à espera…</span>';
    function run() {
      runs++;
      const rec = {}; let log = `<b>PLAY [webservers]</b> — execução ${runs}\n`;
      const notified = new Set();
      TASKS.forEach(([k, name]) => {
        log += `\n<b>TASK [${name}]</b>\n`;
        Object.entries(hosts).forEach(([h, s]) => {
          rec[h] = rec[h] || { ok: 0, changed: 0 };
          const want = k === 'conf' ? tpl : 1;
          if (s[k] === want) { rec[h].ok++; log += `<span class="ok">ok: [${h}]</span>\n`; }
          else { s[k] = want; rec[h].changed++; rec[h].ok++; if (k === 'conf') notified.add(h); log += `<span class="chg">changed: [${h}]</span>\n`; }
        });
      });
      if (notified.size) { log += `\n<b>RUNNING HANDLER [restart nginx]</b>\n` + [...notified].map(h => `<span class="chg">changed: [${h}]</span>\n`).join(''); notified.forEach(h => { rec[h].ok++; rec[h].changed++; }); }
      log += '\n<b>PLAY RECAP</b>\n' + Object.entries(rec).map(([h, r]) => `${h.padEnd(6)} : ok=${r.ok}  <span class="${r.changed ? 'chg' : 'ok'}">changed=${r.changed}</span>`).join('\n');
      term.innerHTML = log;
      const tot = Object.values(rec).reduce((a, r) => a + r.changed, 0);
      out.innerHTML = tot === 0 ? '<b>Nada mudou</b>: o estado já era o desejado, por isso nenhuma tarefa fez alterações. Correr de novo é seguro — é isto a idempotência.'
        : notified.size ? 'Só a tarefa do template mudou (nos hosts onde o ficheiro estava diferente), e isso <b>notificou o handler</b> que reinicia o nginx. As outras tarefas ficaram "ok".'
        : 'Cada tarefa só faz alterações onde o estado atual difere do desejado: o web1 foi configurado de raiz, o web2 já estava certo.';
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'run') run();
      if (b.dataset.a === 'tpl') { tpl++; out.innerHTML = 'O template mudou no repositório. Corre o playbook para aplicar a alteração.'; }
      if (b.dataset.a === 'reset') { hosts = fresh(); tpl = 1; runs = 0; term.innerHTML = '<span class="muted">$ à espera…</span>'; out.innerHTML = ''; }
    });
  };

  /* =====================================================================
     overcommit — quantas VMs cabem num servidor
     ===================================================================== */
  W.overcommit = el => {
    const SIZES = { s: ['pequena', 2, 4], m: ['média', 4, 16], l: ['grande', 8, 32] };
    let vms = ['m', 'm', 's'];
    el.innerHTML = head(el, 'Partilhar um servidor entre VMs', 'Um servidor com 16 núcleos e 64 GB de RAM. Acrescenta VMs e ajusta quanto da sua capacidade elas usam realmente.') + `
      <div class="row">${Object.entries(SIZES).map(([k, [n, c, r]]) => `<button type="button" class="btn sm" data-add="${k}">+ VM ${n} (${c} vCPU, ${r} GB)</button>`).join('')}<button type="button" class="btn sm" data-a="pop">− Remover</button></div>
      <label class="f"><span>utilização média das VMs = <b data-uv></b></span><input type="range" min="10" max="100" step="5" value="40"></label>
      <div class="oc-bars"></div><div class="oc-vms"></div><p class="w-out"></p>`;
    const bars = el.querySelector('.oc-bars'), list = el.querySelector('.oc-vms'), out = el.querySelector('.w-out'), rg = el.querySelector('input');
    const CORES = 16, RAM = 64;
    const bar = (label, v, cap, unit) => { const p = v / cap; return `<div class="oc-bar"><span>${label}</span><div class="oc-track"><div style="width:${Math.min(100, p * 100)}%;background:${p > 1 ? 'var(--bad)' : p > 0.85 ? 'var(--warn)' : 'var(--accent)'}"></div>${p > 1 ? `<i style="left:${100 / p}%"></i>` : ''}</div><b>${fmt(v, 1)} / ${cap} ${unit} (${fmt(p * 100, 0)}%)</b></div>`; };
    function draw() {
      const u = +rg.value / 100;
      el.querySelector('[data-uv]').textContent = rg.value + '%';
      const vcpu = vms.reduce((s, k) => s + SIZES[k][1], 0), ram = vms.reduce((s, k) => s + SIZES[k][2], 0), demand = vcpu * u;
      bars.innerHTML = bar('vCPUs atribuídos', vcpu, CORES, 'núcleos') + bar('CPU realmente pedido', demand, CORES, 'núcleos') + bar('RAM atribuída', ram, RAM, 'GB');
      list.innerHTML = vms.map((k, i) => `<span class="chip in" title="VM ${SIZES[k][0]}" style="width:auto;padding:0 8px">VM${i + 1}·${SIZES[k][1]}c</span>`).join('') || '<span class="muted small">Sem VMs.</span>';
      const r = vcpu / CORES;
      let msg = `Rácio vCPU:núcleo = <b>${fmt(r, 2)}:1</b>. `;
      if (ram > RAM) msg += '<b>A RAM não chega</b>: a memória atribuída excede a física — o host passa a fazer swapping e todas as VMs ficam lentas. ';
      if (demand > CORES) msg += '<b>CPU saturado</b>: as VMs pedem mais tempo de CPU do que existe; o time slicing reparte o que há e todas abrandam.';
      else if (r > 1) msg += 'Há <b>overcommit de CPU</b>, mas como as VMs não usam tudo ao mesmo tempo, o time slicing ainda dá conta. Sobe a utilização para ver o limite.';
      else if (ram <= RAM) msg += 'Tudo cabe nos recursos físicos.';
      out.innerHTML = msg;
    }
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-add]'); if (a) { vms.push(a.dataset.add); draw(); }
      if (e.target.closest('[data-a="pop"]')) { vms.pop(); draw(); }
    });
    rg.addEventListener('input', draw);
    draw();
  };

  /* =====================================================================
     playout — VoIP: atraso de reprodução fixo vs. adaptativo (EWMA)
     10 talk spurts de 8 pacotes (um a cada 20 ms); a congestão sobe e desce aos poucos
     ===================================================================== */
  W.playout = el => {
    const r = prng(11), g = gaussGen(r);
    const BASE = [40, 40, 55, 80, 110, 130, 110, 80, 55, 40], N = 8;   /* atraso base de cada spurt, ms */
    const pk = [];
    BASE.forEach((b, s) => { for (let i = 0; i < N; i++) pk.push({ s, d: Math.max(5, b + 8 * Math.abs(g()) + (r() < 0.04 ? 60 * r() : 0)) }); });
    const calm = p => BASE[p.s] <= 55;
    let mode = 'fixed', q = 130, K = 4;
    el.innerHTML = head(el, 'Quando reproduzir cada pacote?', 'Dez talk spurts de 8 pacotes de voz (um a cada 20 ms). A meio da chamada, a rede congestiona aos poucos e depois recupera. Cada ponto é o atraso de rede de um pacote; a linha é o atraso de reprodução. Pontos acima da linha chegam tarde e perdem-se.') + `
      <div class="row"><span class="lang-seg" role="group" aria-label="Estratégia"><button type="button" data-m="fixed">Atraso fixo q</button><button type="button" data-m="adapt">Adaptativo (EWMA)</button></span></div>
      <label class="f" data-fq><span>q = <b data-qv></b> ms</span><input type="range" min="40" max="300" step="10" value="130" data-i="q"></label>
      <label class="f" data-fk><span>K = <b data-kv></b> (margem em desvios)</span><input type="range" min="0" max="8" step="1" value="4" data-i="k"></label>
      <svg class="w-svg" viewBox="0 0 640 260" role="img" aria-label="Atraso de rede de cada pacote e atraso de reprodução"></svg>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const X = scale(0, pk.length - 1, 46, 624), Y = scale(0, 260, 236, 12);
    function schedule() {
      if (mode === 'fixed') return pk.map(() => q);
      /* em cada pacote: di = 0.9·di−1 + 0.1·(ri − ti) e vi = 0.9·vi−1 + 0.1·|ri − ti − di|;
         no 1.º pacote de cada spurt fixa-se o atraso t + di + K·vi para o spurt inteiro */
      let d = null, v = 15, cur = 0, last = -1;
      return pk.map(p => {
        d = d === null ? p.d : 0.9 * d + 0.1 * p.d;
        v = 0.9 * v + 0.1 * Math.abs(p.d - d);
        if (p.s !== last) { cur = d + K * v; last = p.s; }
        return cur;
      });
    }
    function draw() {
      el.querySelectorAll('[data-m]').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === mode));
      el.querySelector('[data-fq]').hidden = mode !== 'fixed'; el.querySelector('[data-fk]').hidden = mode !== 'adapt';
      el.querySelector('[data-qv]').textContent = q; el.querySelector('[data-kv]').textContent = K;
      const sch = schedule();
      const late = pk.map((p, i) => p.d > sch[i]);
      const nLate = late.filter(Boolean).length, avg = sch.reduce((a, b) => a + b, 0) / sch.length;
      const ci = pk.map((p, i) => (calm(p) ? i : -1)).filter(i => i >= 0), avgCalm = ci.reduce((a, i) => a + sch[i], 0) / ci.length;
      const grid = [0, 50, 100, 150, 200, 250].map(v => `<line class="ax" x1="46" x2="624" y1="${Y(v)}" y2="${Y(v)}" style="opacity:.35"/><text x="40" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join('');
      const seps = BASE.slice(1).map((_, s) => { const x = (X((s + 1) * N - 1) + X((s + 1) * N)) / 2; return `<line x1="${x}" x2="${x}" y1="12" y2="236" style="stroke:var(--rule);stroke-dasharray:3 4"/>`; }).join('');
      const line = `<path d="M${sch.map((v, i) => `${X(i).toFixed(1)},${Y(Math.min(v, 258)).toFixed(1)}`).join(' L')}" style="fill:none;stroke:var(--accent);stroke-width:2.2"/>`;
      const dots = pk.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(Math.min(p.d, 258)).toFixed(1)}" r="3" style="fill:${late[i] ? 'var(--bad)' : 'var(--ink-2)'}"/>`).join('');
      svg.innerHTML = grid + seps + line + dots + `<text x="${X(0)}" y="254">calma</text><text x="${X(5 * N)}" y="254" text-anchor="middle">congestão</text><text x="${X(pk.length - 1)}" y="254" text-anchor="end">calma</text><text x="8" y="12">ms</text>`;
      kp.innerHTML = kpi('perdidos por atraso', `${nLate} de ${pk.length} (${fmt(100 * nLate / pk.length, 0)}%)`, true) + kpi('atraso médio', fmt(avg, 0) + ' ms') + kpi('atraso nas fases calmas', fmt(avgCalm, 0) + ' ms');
      let msg;
      if (mode === 'fixed') {
        msg = nLate > 4 ? `Com q = ${q} ms, <b>${nLate} pacotes chegam tarde</b> na fase congestionada: "um pacote atrasado é um pacote perdido".` : `Quase sem perdas, mas <b>todos</b> os pacotes esperam ${q} ms, mesmo quando a rede está calma e chegam em ≈ 45 ms.`;
        msg += ' Um q fixo tem de escolher entre servir a fase calma ou a congestionada.';
      } else {
        msg = `No início de cada talk spurt, o recetor marca a reprodução para t + d + K·v, com d e v estimados por EWMA (α = β = 0.1). Nas fases calmas o atraso desce (≈ ${fmt(avgCalm, 0)} ms) e sobe quando a rede piora.`;
        msg += K <= 1 ? ' Com uma margem K pequena, perdem-se muitos pacotes.' : nLate ? ' As perdas que restam são no início da congestão: a média reage com algum atraso.' : '';
      }
      out.innerHTML = msg;
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { mode = b.dataset.m; draw(); } });
    el.querySelector('[data-i="q"]').addEventListener('input', e => { q = +e.target.value; draw(); });
    el.querySelector('[data-i="k"]').addEventListener('input', e => { K = +e.target.value; draw(); });
    draw();
  };

  /* =====================================================================
     fec — recuperar perdas em VoIP: FEC por XOR vs. interleaving
     ===================================================================== */
  W.fec = el => {
    let mode = 'xor', lost = new Set([1]);
    el.innerHTML = head(el, 'Perder pacotes de voz sem retransmitir', 'Clica num pacote para o perder (ou recuperar). Quatro chunks de 20 ms de áudio, A a D, cada um dividido em quatro unidades de 5 ms.') + `
      <div class="row"><span class="lang-seg" role="group" aria-label="Técnica"><button type="button" data-m="xor">FEC simples (XOR)</button><button type="button" data-m="int">Interleaving</button></span></div>
      <div class="fec-pk"></div><div class="fec-out"></div><p class="w-out"></p>`;
    const pkb = el.querySelector('.fec-pk'), ob = el.querySelector('.fec-out'), out = el.querySelector('.w-out');
    const CH = ['A', 'B', 'C', 'D'];
    function draw() {
      el.querySelectorAll('[data-m]').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === mode));
      const n = mode === 'xor' ? 5 : 4;
      [...lost].forEach(i => { if (i >= n) lost.delete(i); });
      /* conteúdo de cada pacote: lista de [chunk, unidade] */
      const content = i => mode === 'xor'
        ? (i < 4 ? [0, 1, 2, 3].map(u => [i, u]) : 'xor')
        : [0, 1, 2, 3].map(c => [c, i]);
      pkb.innerHTML = '<span class="lbl-mono">pacotes enviados</span><div class="fec-row">' + Array.from({ length: n }, (_, i) => {
        const c = content(i);
        return `<button type="button" class="fec-p${lost.has(i) ? ' lost' : ''}" data-p="${i}" aria-pressed="${lost.has(i)}"><b>P${i + 1}</b><span>${c === 'xor' ? 'A⊕B⊕C⊕D' : c.map(([ch, u]) => CH[ch] + (u + 1)).join(' ')}</span></button>`;
      }).join('') + '</div>';
      /* o que o recetor consegue reproduzir */
      const have = CH.map(() => [true, true, true, true]);
      for (let i = 0; i < n; i++) if (lost.has(i)) { const c = content(i); if (c !== 'xor') c.forEach(([ch, u]) => { have[ch][u] = false; }); }
      let recovered = null;
      if (mode === 'xor') {
        const lostData = [...lost].filter(i => i < 4);
        if (lostData.length === 1 && !lost.has(4)) { recovered = lostData[0]; have[recovered] = [true, true, true, true]; }
      }
      ob.innerHTML = '<span class="lbl-mono">áudio reproduzido</span><div class="fec-row">' + CH.map((c, ch) => `<div class="fec-c"><b>${c}</b><span>${have[ch].map((h, u) => `<i class="${h ? (recovered === ch ? 'rec' : 'ok') : 'miss'}" title="${c}${u + 1}"></i>`).join('')}</span></div>`).join('') + '</div>';
      const nl = lost.size;
      let msg;
      if (mode === 'xor') {
        if (!nl) msg = 'Sem perdas. Custo do FEC: 5 pacotes para 4 chunks, ou seja, <b>+1/n = +25% de largura de banda</b>.';
        else if (recovered !== null) msg = `P${recovered + 1} perdeu-se, mas <b>foi reconstruído</b>: ${CH[recovered]} = P5 ⊕ os outros três. O preço é ter de esperar pelo grupo inteiro antes de reproduzir: mais atraso.`;
        else if (nl === 1) msg = 'Perdeu-se só o pacote de redundância: o áudio está completo.';
        else msg = '<b>Duas perdas no mesmo grupo</b>: o XOR só recupera uma. Os chunks em falta ficam com 20 ms de silêncio cada.';
      } else {
        msg = !nl ? 'Cada pacote leva uma unidade de 5 ms de <b>cada</b> chunk. Não há redundância: a largura de banda não aumenta.'
          : `Perderam-se ${nl} pacote(s), mas cada chunk só perdeu ${nl} unidade(s) de 5 ms: pequenos buracos, fáceis de disfarçar, em vez de 20 ms seguidos de silêncio. O preço: só se pode reproduzir A depois de chegarem os quatro pacotes, o que dá mais atraso.`;
      }
      out.innerHTML = msg;
    }
    el.addEventListener('click', e => {
      const m = e.target.closest('[data-m]'); if (m) { mode = m.dataset.m; draw(); return; }
      const b = e.target.closest('[data-p]'); if (b) { const i = +b.dataset.p; lost.has(i) ? lost.delete(i) : lost.add(i); draw(); }
    });
    draw();
  };

  /* =====================================================================
     rtcp — repartir a largura de banda de controlo (5% da sessão)
     ===================================================================== */
  W.rtcp = el => {
    el.innerHTML = head(el, 'Largura de banda do RTCP', 'O RTCP limita-se a 5% da largura de banda da sessão: 25% disso para os emissores e 75% para os recetores, divididos igualmente.') + `
      <div class="row">
        <label class="f grow"><span>débito da sessão = <b data-bv></b> kbps</span><input type="range" min="50" max="8000" step="50" value="2000" data-i="b"></label>
        <label class="f grow"><span>recetores R = <b data-rv></b></span><input type="range" min="1" max="200" step="1" value="10" data-i="r"></label>
        <label class="f grow"><span>tamanho médio de um pacote RTCP = <b data-sv></b> bytes</span><input type="range" min="50" max="300" step="10" value="100" data-i="s"></label>
      </div>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const kp = el.querySelector('.kpis'), out = el.querySelector('.w-out'), I = k => +el.querySelector(`[data-i="${k}"]`).value;
    function draw() {
      const B = I('b'), R = I('r'), S = I('s');
      el.querySelector('[data-bv]').textContent = B; el.querySelector('[data-rv]').textContent = R; el.querySelector('[data-sv]').textContent = S;
      const tot = 0.05 * B, snd = 0.25 * tot, per = 0.75 * tot / R, T = S * 8 / (per * 1000);
      kp.innerHTML = kpi('RTCP total', fmt(tot, 1) + ' kbps') + kpi('emissor', fmt(snd, 1) + ' kbps') + kpi('cada recetor', fmt(per, 2) + ' kbps', true) + kpi('1 relatório a cada', T < 1 ? fmt(T * 1000, 0) + ' ms' : fmt(T, 1) + ' s');
      out.innerHTML = `Cada recetor envia relatórios a ${fmt(per, 2)} kbps: com pacotes de ${S} bytes (${S * 8} bits), um relatório a cada ${S * 8} / ${fmt(per * 1000, 0)} bps ≈ <b>${T < 1 ? fmt(T * 1000, 0) + ' ms' : fmt(T, 1) + ' s'}</b>. ${R >= 50 ? 'Com muitos recetores, cada um reporta raramente: é assim que o controlo não cresce com o tamanho da conferência.' : 'Aumenta R e vê o intervalo entre relatórios crescer.'}`;
    }
    el.querySelectorAll('input').forEach(i => i.addEventListener('input', draw));
    draw();
  };

  /* =====================================================================
     clustering — utilitários comuns aos widgets kmeans e dbscan
     ===================================================================== */
  const prng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gaussGen = r => () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const CLU = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--accent)'];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

  /* =====================================================================
     kmeans — K-means e K-medoids passo a passo, com outliers opcionais
     ===================================================================== */
  W.kmeans = el => {
    const r = prng(7), g = gaussGen(r);
    const BLOBS = [[-6, -5], [0, 1.5], [-4, 6], [4, 6]];
    const base = BLOBS.flatMap(c => Array.from({ length: 30 }, () => [c[0] + 1.3 * g(), c[1] + 1.3 * g()]));
    const OUT = [[13, -6], [13.5, -5], [12.5, -7], [14, -6.5], [13, -4.8]];
    let k = 4, method = 'means', outliers = false, P = [], C = [], lab = [], it = 0, done = false, seed = 1;
    el.innerHTML = head(el, 'K-means e K-medoids passo a passo', 'Cada passo faz duas coisas: atribui cada ponto ao centro mais próximo e recalcula os centros. Experimenta acrescentar outliers e trocar de método.') + `
      <div class="row">
        <span class="lang-seg" role="group" aria-label="Método"><button type="button" data-m="means">K-means</button><button type="button" data-m="medoids">K-medoids</button></span>
        <label class="set-check"><input type="checkbox" data-out> 5 outliers</label>
      </div>
      <label class="f"><span>k = <b data-kv></b></span><input type="range" min="2" max="6" step="1" value="4"></label>
      <div class="row"><button type="button" class="btn sm" data-a="step">Um passo</button><button type="button" class="btn sm" data-a="run">Até convergir</button><button type="button" class="btn sm" data-a="init">Recomeçar</button></div>
      <svg class="w-svg" viewBox="0 0 640 300" role="img" aria-label="Pontos coloridos pelo cluster e centros dos clusters"></svg>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out'), rg = el.querySelector('input[type=range]');
    const X = scale(-11, 16, 20, 620), Y = scale(-10, 11, 286, 14);
    const cost = () => P.reduce((s, q, i) => s + (method === 'means' ? d2(q, C[lab[i]]) : Math.sqrt(d2(q, C[lab[i]]))), 0);
    /* como o n_init do scikit-learn: das 10 inicializações, fica a que converge para o menor custo */
    function start(s) {
      const rr = prng(s * 97 + k), idx = [];
      while (idx.length < k) { const i = Math.floor(rr() * P.length); if (!idx.includes(i)) idx.push(i); }
      C = idx.map(i => P[i].slice()); it = 0; done = false; assign();
    }
    function init() {
      P = outliers ? base.concat(OUT) : base.slice();
      let best = null;
      for (let t = 0; t < 10; t++) {
        const s = seed * 10 + t;
        start(s); let n = 0; while (!done && n++ < 100) update();
        const c = cost();
        if (!best || c < best[1]) best = [s, c];
      }
      start(best[0]);
    }
    function assign() { lab = P.map(q => C.reduce((b, c, j) => (d2(q, c) < d2(q, C[b]) ? j : b), 0)); }
    function update() {
      const nc = C.map((c, j) => {
        const m = P.filter((_, i) => lab[i] === j);
        if (!m.length) return c;
        if (method === 'means') return [m.reduce((s, q) => s + q[0], 0) / m.length, m.reduce((s, q) => s + q[1], 0) / m.length];
        /* medoide: o ponto do cluster com menor soma de distâncias aos outros */
        return m.reduce((b, q) => { const sq = m.reduce((s, o) => s + Math.sqrt(d2(q, o)), 0); return sq < b[1] ? [q, sq] : b; }, [m[0], Infinity])[0].slice();
      });
      const moved = nc.some((c, j) => d2(c, C[j]) > 1e-9);
      C = nc; assign(); it++;
      if (!moved) done = true;
    }
    function draw() {
      el.querySelector('[data-kv]').textContent = k;
      el.querySelectorAll('[data-m]').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === method));
      const pts = P.map((q, i) => `<circle cx="${X(q[0]).toFixed(1)}" cy="${Y(q[1]).toFixed(1)}" r="${i >= base.length ? 4.5 : 3.2}" style="fill:${CLU[lab[i]]};opacity:.75${i >= base.length ? ';stroke:var(--ink);stroke-width:1' : ''}"/>`).join('');
      const cen = C.map((c, j) => method === 'means'
        ? `<g transform="translate(${X(c[0]).toFixed(1)},${Y(c[1]).toFixed(1)})"><path d="M-8 -8L8 8M-8 8L8 -8" style="stroke:var(--ink);stroke-width:4"/><path d="M-8 -8L8 8M-8 8L8 -8" style="stroke:${CLU[j]};stroke-width:2.2"/></g>`
        : `<rect x="${(X(c[0]) - 7).toFixed(1)}" y="${(Y(c[1]) - 7).toFixed(1)}" width="14" height="14" style="fill:${CLU[j]};stroke:var(--ink);stroke-width:2"/>`).join('');
      svg.innerHTML = pts + cen;
      const sizes = C.map((_, j) => lab.filter(l => l === j).length);
      kp.innerHTML = kpi('iterações', it) + kpi(method === 'means' ? 'inércia (Σ d²)' : 'Σ distâncias', fmt(cost(), 1), true) + kpi('tamanhos', sizes.join(' · '));
      let msg = done ? '<b>Convergiu</b>: os centros já não mudam.' : 'Ainda não convergiu.';
      msg += method === 'means' ? ' Os centros (✕) são <b>médias</b>: não têm de ser pontos dos dados.' : ' Os centros (■) são <b>medoides</b>: pontos reais dos dados.';
      if (outliers && done) {
        const oc = lab.slice(base.length), own = oc.every(l => lab.slice(0, base.length).every(m => m !== l));
        msg += own ? ' Os outliers ficaram com <b>um cluster só para eles</b>, e dois grupos reais tiveram de partilhar um centro.' : ' Os outliers foram absorvidos pelo cluster mais próximo, sem deslocar muito o centro.';
      }
      if (done && k !== 4) msg += ` Os dados têm 4 grupos, mas o algoritmo cria sempre os ${k} que lhe pedires.`;
      out.innerHTML = msg;
    }
    el.addEventListener('click', e => {
      const m = e.target.closest('[data-m]'); if (m) { method = m.dataset.m; init(); draw(); return; }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'step' && !done) update();
      if (a.dataset.a === 'run') { let n = 0; while (!done && n++ < 100) update(); }
      if (a.dataset.a === 'init') { seed++; init(); }
      draw();
    });
    el.querySelector('[data-out]').addEventListener('change', e => { outliers = e.target.checked; init(); let n = 0; while (!done && n++ < 100) update(); draw(); });
    rg.addEventListener('input', () => { k = +rg.value; init(); draw(); });
    init(); draw();
  };

  /* =====================================================================
     dbscan — duas luas com ruído; ε e min_samples ajustáveis
     ===================================================================== */
  W.dbscan = el => {
    const r = prng(42), g = gaussGen(r);
    const P = [];
    for (let i = 0; i < 150; i++) { const t = Math.PI * r(); P.push([Math.cos(t) + 0.07 * g(), Math.sin(t) + 0.07 * g()]); }
    for (let i = 0; i < 150; i++) { const t = Math.PI * r(); P.push([1 - Math.cos(t) + 0.07 * g(), 0.5 - Math.sin(t) + 0.07 * g()]); }
    for (let i = 0; i < 12; i++) P.push([-1.5 + 4 * r(), -1 + 2.5 * r()]);
    let eps = 0.2, ms = 5, algo = 'db';
    el.innerHTML = head(el, 'DBSCAN vs. K-means em formas não convexas', 'Duas luas encaixadas e 12 pontos de ruído. Um ponto é <b>core</b> se tiver pelo menos min_samples pontos (incluindo ele próprio) a uma distância ≤ ε.') + `
      <div class="row"><span class="lang-seg" role="group" aria-label="Algoritmo"><button type="button" data-g="db">DBSCAN</button><button type="button" data-g="km">K-means (k = 2)</button></span></div>
      <div class="row">
        <label class="f grow"><span>ε = <b data-ev></b></span><input type="range" min="0.05" max="0.5" step="0.01" value="0.2" data-i="eps"></label>
        <label class="f grow"><span>min_samples = <b data-mv></b></span><input type="range" min="2" max="15" step="1" value="5" data-i="ms"></label>
      </div>
      <svg class="w-svg" viewBox="0 0 640 300" role="img" aria-label="Pontos coloridos por cluster; ruído marcado com cruzes"></svg>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const X = scale(-1.6, 2.6, 20, 620), Y = scale(-1.1, 1.5, 286, 14);
    function dbscan() {
      const n = P.length, e2 = eps * eps;
      const nb = P.map(p => P.reduce((a, q, j) => (d2(p, q) <= e2 ? (a.push(j), a) : a), []));
      const core = nb.map(a => a.length >= ms), lab = Array(n).fill(-1);
      let c = 0;
      for (let i = 0; i < n; i++) {
        if (!core[i] || lab[i] !== -1) continue;
        const stack = [i]; lab[i] = c;
        while (stack.length) {
          const j = stack.pop();
          if (!core[j]) continue;
          nb[j].forEach(q => { if (lab[q] === -1) { lab[q] = c; stack.push(q); } });
        }
        c++;
      }
      return { lab, core, nc: c };
    }
    function kmeans2() {
      let C = [P[0].slice(), P[200].slice()], lab = [];
      for (let t = 0; t < 50; t++) {
        lab = P.map(q => (d2(q, C[0]) <= d2(q, C[1]) ? 0 : 1));
        C = [0, 1].map(j => { const m = P.filter((_, i) => lab[i] === j); return [m.reduce((s, q) => s + q[0], 0) / m.length, m.reduce((s, q) => s + q[1], 0) / m.length]; });
      }
      return { lab, core: P.map(() => false), nc: 2 };
    }
    function draw() {
      el.querySelector('[data-ev]').textContent = fmt(eps, 2); el.querySelector('[data-mv]').textContent = ms;
      el.querySelectorAll('[data-g]').forEach(b => b.setAttribute('aria-pressed', b.dataset.g === algo));
      el.querySelectorAll('[data-i]').forEach(i => { i.disabled = algo !== 'db'; });
      const R = algo === 'db' ? dbscan() : kmeans2();
      const noise = R.lab.filter(l => l === -1).length;
      svg.innerHTML = P.map((q, i) => {
        const x = X(q[0]).toFixed(1), y = Y(q[1]).toFixed(1);
        if (R.lab[i] === -1) return `<path d="M${x - 3.5} ${y - 3.5}l7 7m0 -7l-7 7" style="stroke:var(--ink-2);stroke-width:1.6"/>`;
        return `<circle cx="${x}" cy="${y}" r="${R.core[i] || algo === 'km' ? 3.4 : 2.2}" style="fill:${CLU[R.lab[i] % CLU.length]};opacity:${R.core[i] || algo === 'km' ? .85 : .5}"/>`;
      }).join('') + (algo === 'db' ? `<circle cx="${X(-1.2)}" cy="${Y(1.25)}" r="${(X(eps) - X(0)).toFixed(1)}" style="fill:none;stroke:var(--ink-2);stroke-dasharray:3 3"/><text x="${X(-1.2) + (X(eps) - X(0)) + 6}" y="${Y(1.25) + 4}">raio ε</text>` : '');
      kp.innerHTML = kpi('clusters', R.nc, true) + kpi('ruído', algo === 'db' ? noise : '—') + kpi('pontos core', algo === 'db' ? R.core.filter(Boolean).length : '—');
      let msg;
      if (algo === 'km') msg = 'O K-means corta o plano ao meio com uma reta: cada lua fica <b>partida em duas</b>, e o ruído é sempre atribuído a algum cluster. Para ele, um cluster é uma "bola" à volta de uma média.';
      else if (R.nc === 2 && noise <= 15) msg = '<b>As duas luas foram separadas</b> e os pontos isolados ficaram como ruído (✕). O DBSCAN descobriu o número de clusters sozinho.';
      else if (R.nc > 2) msg = `ε pequeno demais para esta densidade: cada lua partiu-se em <b>${R.nc} clusters</b> e muitos pontos ficaram como ruído.`;
      else if (R.nc === 1) msg = 'ε grande demais: as vizinhanças tocam-se e <b>as duas luas fundiram-se</b> num só cluster.';
      else msg = 'Quase tudo é ruído: com este ε ninguém tem vizinhos suficientes para ser core.';
      out.innerHTML = msg;
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) { algo = b.dataset.g; draw(); } });
    el.querySelector('[data-i="eps"]').addEventListener('input', e => { eps = +e.target.value; draw(); });
    el.querySelector('[data-i="ms"]').addEventListener('input', e => { ms = +e.target.value; draw(); });
    draw();
  };

  /* =====================================================================
     gd — descida do gradiente numa perda L(w) = ½(w1² + k·w2²)
     k grande = features em escalas muito diferentes (vale estreito)
     ===================================================================== */
  W.gd = el => {
    const LRS = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1];
    const STEPS = 80;
    let opt = 'sgd', norm = false;
    el.innerHTML = head(el, 'Descida do gradiente: learning rate, otimizador e escala', 'Cada ponto é um passo do treino, a partir do mesmo início. Sem normalização, uma feature tem uma escala muito maior do que a outra e a perda fica um vale estreito e comprido.') + `
      <div class="row">
        <span class="lang-seg" role="group" aria-label="Otimizador"><button type="button" data-o="sgd">SGD</button><button type="button" data-o="mom">SGD + momentum</button><button type="button" data-o="adam">Adam</button></span>
        <label class="set-check"><input type="checkbox" data-norm> features normalizadas</label>
      </div>
      <label class="f"><span>learning rate = <b data-lv></b></span><input type="range" min="0" max="6" step="1" value="4"></label>
      <svg class="w-svg" viewBox="0 0 640 280" role="img" aria-label="Trajetória da descida do gradiente sobre as curvas de nível da perda"></svg>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out'), rg = el.querySelector('input[type=range]');
    const X = scale(-5, 5, 20, 620), Y = scale(-3, 3, 266, 14);
    function path(k, lr) {
      let w = [-4.5, 2.2], v = [0, 0], m = [0, 0], s2 = [0, 0];
      const pts = [w.slice()], L = q => 0.5 * (q[0] * q[0] + k * q[1] * q[1]);
      let reached = null, diverged = false;
      for (let t = 1; t <= STEPS; t++) {
        const g = [w[0], k * w[1]];
        if (opt === 'sgd') w = [w[0] - lr * g[0], w[1] - lr * g[1]];
        else if (opt === 'mom') { v = [0.9 * v[0] + g[0], 0.9 * v[1] + g[1]]; w = [w[0] - lr * v[0], w[1] - lr * v[1]]; }
        else {
          m = m.map((x, i) => 0.9 * x + 0.1 * g[i]); s2 = s2.map((x, i) => 0.999 * x + 0.001 * g[i] * g[i]);
          w = w.map((x, i) => x - lr * (m[i] / (1 - 0.9 ** t)) / (Math.sqrt(s2[i] / (1 - 0.999 ** t)) + 1e-8));
        }
        pts.push(w.slice());
        if (!isFinite(L(w)) || Math.abs(w[0]) > 1e3 || Math.abs(w[1]) > 1e3) { diverged = true; break; }
        if (reached === null && L(w) < 0.01) reached = t;
      }
      return { pts, loss: L(w), reached, diverged };
    }
    function draw() {
      const lr = LRS[+rg.value], k = norm ? 1.5 : 25;
      el.querySelector('[data-lv]').textContent = lr;
      el.querySelectorAll('[data-o]').forEach(b => b.setAttribute('aria-pressed', b.dataset.o === opt));
      const r = path(k, lr);
      const sx = (X(1) - X(0)), sy = (Y(0) - Y(1));
      const rings = [0.05, 0.3, 1, 2.5, 5, 9, 14].map(c => `<ellipse cx="${X(0)}" cy="${Y(0)}" rx="${Math.sqrt(2 * c) * sx}" ry="${Math.sqrt(2 * c / k) * sy}" style="fill:none;stroke:var(--rule);stroke-width:1"/>`).join('');
      const clip = q => [Math.max(-5.4, Math.min(5.4, q[0])), Math.max(-3.4, Math.min(3.4, q[1]))];
      const line = r.pts.map(q => { const c = clip(q); return `${X(c[0]).toFixed(1)},${Y(c[1]).toFixed(1)}`; }).join(' ');
      svg.innerHTML = `<defs><clipPath id="gdclip"><rect x="20" y="14" width="600" height="252"/></clipPath></defs><g clip-path="url(#gdclip)">${rings}
        <polyline points="${line}" style="fill:none;stroke:var(--accent);stroke-width:1.6;opacity:.85"/>
        ${r.pts.map(q => { const c = clip(q); return `<circle cx="${X(c[0]).toFixed(1)}" cy="${Y(c[1]).toFixed(1)}" r="2.4" style="fill:var(--accent)"/>`; }).join('')}</g>
        <circle cx="${X(0)}" cy="${Y(0)}" r="5" style="fill:none;stroke:var(--good);stroke-width:2"/><text x="${X(0) + 9}" y="${Y(0) - 8}">mínimo</text>
        <circle cx="${X(-4.5)}" cy="${Y(2.2)}" r="4" style="fill:var(--warn)"/><text x="${X(-4.5) + 8}" y="${Y(2.2) - 8}">início</text>`;
      kp.innerHTML = kpi('perda final', r.diverged ? '∞' : fmt(r.loss, 4), true) + kpi('passos até perda < 0.01', r.reached ?? '—') + kpi('passos', r.pts.length - 1);
      let msg;
      if (r.diverged) msg = `<b>Divergiu.</b> O learning rate é demasiado alto para a direção mais inclinada: cada passo salta para o outro lado do vale e mais longe. ${norm ? '' : 'Normalizar as features permite usar um learning rate maior sem divergir.'}`;
      else if (!r.reached) msg = `<b>Não chegou ao mínimo em ${STEPS} passos.</b> ${lr <= 0.01 ? 'O learning rate é tão pequeno que o treino quase não sai do sítio: seriam precisas muitas mais épocas.' : opt === 'adam' ? 'No Adam cada passo tem um tamanho próximo do learning rate: com um valor alto, oscila à volta do mínimo sem assentar.' : 'Avança depressa na direção inclinada mas arrasta-se ao longo do vale.'}`;
      else msg = `Chegou perto do mínimo em <b>${r.reached} passos</b>.`;
      if (!norm && opt === 'sgd' && !r.diverged) msg += ' Com features em escalas muito diferentes, o mesmo learning rate é grande demais numa direção e pequeno demais na outra.';
      if (opt === 'adam') msg += ' O Adam adapta o passo a cada parâmetro (divide pela magnitude típica do gradiente), por isso é muito menos sensível à escala.';
      out.innerHTML = msg;
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) { opt = b.dataset.o; draw(); } });
    el.querySelector('[data-norm]').addEventListener('change', e => { norm = e.target.checked; draw(); });
    rg.addEventListener('input', draw);
    draw();
  };

  /* =====================================================================
     shapley — valores de Shapley exatos num modelo de 3 features binárias
     v(S) = previsão média quando só se conhecem as features de S
     (as outras valem 0 ou 1 com probabilidade 1/2, independentes)
     ===================================================================== */
  W.shapley = el => {
    const F = [
      { k: 'A', name: 'tumor grande' },
      { k: 'B', name: 'contorno irregular' },
      { k: 'C', name: 'textura alta' }
    ];
    const f = (a, b, c) => 0.05 + 0.30 * a + 0.20 * b + 0.05 * c + 0.30 * a * b;
    const x = [1, 1, 0];
    el.innerHTML = head(el, 'Calcular valores de Shapley à mão', 'Modelo de risco: P(maligno) = 0.05 + 0.30·A + 0.20·B + 0.05·C + 0.30·A·B. O último termo é uma interação: tumor grande <i>e</i> contorno irregular juntos pesam mais. Escolhe o doente.') + `
      <div class="row">${F.map((d, i) => `<span class="sh-pick"><span>${d.k}: ${d.name}</span><span class="lang-seg" role="group" aria-label="${d.name}"><button type="button" data-f="${i}" data-v="0">não</button><button type="button" data-f="${i}" data-v="1">sim</button></span></span>`).join('')}</div>
      <div class="tw"><table class="sh-tab"></table></div>
      <div class="sh-wf"></div><p class="w-out"></p>`;
    const tab = el.querySelector('.sh-tab'), wf = el.querySelector('.sh-wf'), out = el.querySelector('.w-out');
    /* média de f quando as features fora de S são desconhecidas (0 ou 1, prob. 1/2) */
    const v = S => {
      let sum = 0;
      for (let m = 0; m < 8; m++) sum += f(...[0, 1, 2].map(i => (S.includes(i) ? x[i] : (m >> i) & 1)));
      return sum / 8;
    };
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const p3 = n => fmt(n, 3), sg = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n), 3);
    function draw() {
      el.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', x[+b.dataset.f] === +b.dataset.v));
      const phi = [0, 0, 0];
      const rows = perms.map(o => {
        const S = [], m = [0, 0, 0];
        o.forEach(i => { const before = v(S); S.push(i); m[i] = v(S) - before; phi[i] += m[i] / 6; });
        return `<tr><td class="mono">${o.map(i => F[i].k).join(' → ')}</td>${m.map(c => `<td class="num">${sg(c)}</td>`).join('')}</tr>`;
      }).join('');
      const base = v([]), fx = f(...x);
      tab.innerHTML = `<thead><tr><th>Ordem de chegada</th>${F.map(d => `<th class="num">${d.k}</th>`).join('')}</tr></thead><tbody>${rows}
        <tr class="sh-tot"><td><b>Média = φ</b></td>${phi.map(c => `<td class="num"><b>${sg(c)}</b></td>`).join('')}</tr></tbody>`;
      /* waterfall: da previsão média até à previsão deste doente */
      const MAX = 0.9;
      let acc = base;
      const bar = (lbl, from, to, cls) => {
        const l = Math.min(from, to) / MAX * 100, w = Math.max(Math.abs(to - from) / MAX * 100, 0.4);
        return `<div class="sh-row"><span>${lbl}</span><div class="sh-track"><i class="${cls}" style="left:${l}%;width:${w}%"></i></div><b>${cls === 'base' || cls === 'fx' ? p3(to) : sg(to - from)}</b></div>`;
      };
      wf.innerHTML = bar('E[f(X)], a média', 0, base, 'base') +
        F.map((d, i) => { const from = acc; acc += phi[i]; return bar(`${d.k} = ${x[i] ? 'sim' : 'não'}`, from, acc, phi[i] >= 0 ? 'up' : 'down'); }).join('') +
        bar('f(x), este doente', 0, fx, 'fx');
      const total = base + phi.reduce((a, b) => a + b, 0);
      out.innerHTML = `Soma: ${p3(base)} ${phi.map(sg).join(' ')} = <b>${p3(total)}</b>, exatamente a previsão f(x) = ${p3(fx)}. ` +
        (x[0] && x[1] ? 'A interação A·B foi <b>repartida entre A e B</b>: o contributo de cada uma depende de a outra já ser conhecida, e o Shapley faz a média das ordens.'
          : 'Repara que o contributo marginal de uma feature muda com a ordem quando há interação: o Shapley resolve isso fazendo a média de todas as ordens.');
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { x[+b.dataset.f] = +b.dataset.v; draw(); } });
    draw();
  };

  /* =====================================================================
     k8s — um Deployment a manter o estado desejado (self-healing e scheduling)
     cada nó aguenta 3 Pods; o controlador faz uma correção de cada vez
     ===================================================================== */
  W.k8s = el => {
    const CAP = 3;
    let nodes = [true, true, true], pods = [], desired = 3, seq = 0, timer = null, msg = '';
    el.innerHTML = head(el, 'Um Deployment a manter o estado desejado', 'Pede um número de réplicas, clica num Pod para o matar ou desliga um nó. Cada nó aguenta no máximo 3 Pods.') + `
      <div class="row">
        <label class="f grow"><span>réplicas desejadas = <b data-dv></b></span><input type="range" min="0" max="10" step="1" value="3"></label>
        <label class="set-check"><input type="checkbox" data-ctl checked> controladores ativos</label>
      </div>
      <div class="k8s-nodes"></div><dl class="kpis"></dl><p class="w-out"></p>`;
    const box = el.querySelector('.k8s-nodes'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const rg = el.querySelector('input[type=range]'), ctl = el.querySelector('[data-ctl]');
    const count = i => pods.filter(p => p.node === i).length;
    /* Scheduler: o nó ligado com menos Pods e com espaço */
    const pickNode = () => nodes.map((up, i) => ({ up, i, n: count(i) })).filter(x => x.up && x.n < CAP).sort((a, b) => a.n - b.n)[0];
    function step() {
      timer = null;
      if (!el.isConnected || !ctl.checked) return;
      if (pods.length > desired) {
        const p = pods[pods.length - 1]; pods.pop();
        msg = `Há Pods a mais: o ReplicaSet removeu o <b>pod-${p.id}</b>.`;
      } else if (pods.length < desired) {
        const n = pickNode();
        if (!n) { draw(); return; }
        pods.push({ id: ++seq, node: n.i });
        msg = `Faltam Pods: o ReplicaSet pediu um novo e o Scheduler colocou o <b>pod-${seq}</b> no <b>nó ${n.i + 1}</b>, o que tem menos carga.`;
      }
      draw();
    }
    function draw() {
      el.querySelector('[data-dv]').textContent = desired;
      box.innerHTML = nodes.map((up, i) => `<div class="k8s-node${up ? '' : ' down'}">
        <div class="k8s-nh"><b>Nó ${i + 1}</b><button type="button" class="btn sm" data-node="${i}">${up ? 'Desligar' : 'Ligar'}</button></div>
        <div class="k8s-pods">${pods.filter(p => p.node === i).map(p => `<button type="button" class="chip in" data-pod="${p.id}" title="Matar este Pod" aria-label="Matar o pod-${p.id}">pod-${p.id}</button>`).join('') || `<span class="muted small">${up ? 'sem Pods' : 'indisponível'}</span>`}</div></div>`).join('');
      const pending = Math.max(0, desired - pods.length), stuck = pending > 0 && !pickNode();
      kp.innerHTML = kpi('desejado', desired, true) + kpi('a correr', pods.length) + kpi('por colocar', ctl.checked ? pending : '—');
      let text = msg;
      if (!ctl.checked) text = pods.length === desired ? 'Controladores parados. Mata um Pod: ninguém vai corrigir a diferença.' : `Controladores parados: o estado real (${pods.length}) já não coincide com o desejado (${desired}) e <b>ninguém o corrige</b>. Volta a ativá-los.`;
      else if (stuck) text = `Faltam ${pending} Pod(s), mas <b>nenhum nó tem espaço</b>: ficam em estado <i>Pending</i> até haver capacidade. Liga um nó ou baixa as réplicas.`;
      else if (pods.length === desired && !timer && !msg) text = 'Estado real igual ao desejado: não há nada a corrigir.';
      out.innerHTML = text;
      if (ctl.checked && pods.length !== desired && !stuck && !timer) timer = setTimeout(step, 700);
    }
    el.addEventListener('click', e => {
      const p = e.target.closest('[data-pod]');
      if (p) { pods = pods.filter(x => x.id !== +p.dataset.pod); msg = `O <b>pod-${p.dataset.pod}</b> morreu.`; draw(); return; }
      const n = e.target.closest('[data-node]');
      if (n) {
        const i = +n.dataset.node, lost = count(i);
        nodes[i] = !nodes[i];
        if (!nodes[i]) { pods = pods.filter(x => x.node !== i); msg = `O nó ${i + 1} falhou e perderam-se ${lost} Pod(s).`; } else msg = `O nó ${i + 1} voltou a estar disponível.`;
        draw();
      }
    });
    rg.addEventListener('input', () => { desired = +rg.value; msg = ''; draw(); });
    ctl.addEventListener('change', () => { msg = ''; draw(); });
    draw();
  };

  /* =====================================================================
     p2pdist — tempo mínimo para distribuir um ficheiro: cliente-servidor vs. P2P
     unidades: F/u = 1 hora; u_s = k·u; d_min ≥ u_s (não limita)
     ===================================================================== */
  W.p2pdist = el => {
    el.innerHTML = head(el, 'Distribuir um ficheiro a N peers', 'Cada peer faz upload a uma taxa u, e enviar o ficheiro uma vez a essa taxa demora 1 hora (F/u = 1 h). O servidor faz upload k vezes mais depressa. A taxa de download dos peers não é o gargalo.') + `
      <div class="row">
        <label class="f grow"><span>N (peers) = <b data-nv></b></span><input type="range" min="1" max="40" step="1" value="30" data-i="n"></label>
        <label class="f grow"><span>upload do servidor u<sub>s</sub> = <b data-kv></b>·u</span><input type="range" min="1" max="20" step="1" value="10" data-i="k"></label>
      </div>
      <svg class="w-svg" viewBox="0 0 640 260" role="img" aria-label="Tempo de distribuição em função de N"></svg>
      <div class="legend"><span><i style="background:var(--s2)"></i>cliente-servidor</span><span><i style="background:var(--accent)"></i>P2P</span></div>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const I = k => el.querySelector(`[data-i="${k}"]`);
    const cs = (n, k) => n / k, p2p = (n, k) => Math.max(1 / k, n / (k + n));
    function draw() {
      const n = +I('n').value, k = +I('k').value;
      el.querySelector('[data-nv]').textContent = n; el.querySelector('[data-kv]').textContent = k;
      const ymax = Math.max(cs(40, k), 1.2) * 1.05;
      const X = scale(0, 40, 50, 620), Y = scale(0, ymax, 228, 14), yt = niceTicks(0, ymax, 5);
      const line = (f, c) => `<path d="M${Array.from({ length: 81 }, (_, i) => { const x = Math.max(0.5, i / 2); return `${X(x).toFixed(1)},${Y(f(x, k)).toFixed(1)}`; }).join(' L')}" style="fill:none;stroke:${c};stroke-width:2.5"/>`;
      svg.innerHTML = yt.map(v => `<line class="ax" x1="50" x2="620" y1="${Y(v)}" y2="${Y(v)}" style="opacity:.5"/><text x="44" y="${Y(v) + 4}" text-anchor="end">${fmt(v, 1)} h</text>`).join('') +
        [0, 5, 10, 15, 20, 25, 30, 35, 40].map(v => `<text x="${X(v)}" y="246" text-anchor="middle">${v}</text>`).join('') +
        `<text x="335" y="259" text-anchor="middle">N</text>` + line(cs, 'var(--s2)') + line(p2p, 'var(--accent)') +
        `<line x1="${X(n)}" x2="${X(n)}" y1="14" y2="228" style="stroke:var(--ink);stroke-dasharray:3 4;opacity:.6"/>` +
        `<circle cx="${X(n)}" cy="${Y(cs(n, k))}" r="5" style="fill:var(--s2)"/><circle cx="${X(n)}" cy="${Y(p2p(n, k))}" r="5" style="fill:var(--accent)"/>`;
      kp.innerHTML = kpi('cliente-servidor', fmt(cs(n, k), 2) + ' h', 1) + kpi('P2P', fmt(p2p(n, k), 2) + ' h', 1) + kpi('ganho', fmt(cs(n, k) / p2p(n, k), 1) + '×');
      out.innerHTML = `Cliente-servidor: o servidor envia N cópias, N·F/u<sub>s</sub> = ${n}/${k} = <b>${fmt(cs(n, k), 2)} h</b> — cresce linearmente com N. P2P: max{F/u<sub>s</sub>, N·F/(u<sub>s</sub> + N·u)} = <b>${fmt(p2p(n, k), 2)} h</b> — nunca passa de 1 h, porque cada peer novo traz também capacidade de upload.`;
    }
    ['n', 'k'].forEach(k => I(k).addEventListener('input', draw));
    draw();
  };

  /* =====================================================================
     dash — streaming com taxa fixa vs. adaptativa (DASH)
     ===================================================================== */
  W.dash = el => {
    const RATES = [0.5, 1, 2.5, 5, 8], CH = 2, TOTAL = 60, BUF = 20;
    const TRACES = {
      var: [[0, 6], [20, 2.5], [40, 1], [55, 4], [75, 8], [100, 3], [130, 3]],
      flat: [[0, 6], [130, 6]]
    };
    let mode = 'dash', trace = 'var';
    el.innerHTML = head(el, 'DASH: escolher a qualidade chunk a chunk', 'O vídeo está dividido em chunks de 2 s, codificados a 0.5, 1, 2.5, 5 e 8 Mbps. A largura de banda muda com o tempo. Compara uma taxa fixa com a adaptação do DASH.') + `
      <div class="row"><span class="seg">${[['dash', 'Adaptativa (DASH)'], ['f5', 'Fixa 5 Mbps'], ['f1', 'Fixa 1 Mbps']].map(([k, l], i) => `<button type="button" class="btn sm${i ? '' : ' on'}" data-m="${k}">${l}</button>`).join('')}</span>
        <span class="seg">${[['var', 'Rede variável'], ['flat', 'Rede estável']].map(([k, l], i) => `<button type="button" class="btn sm${i ? '' : ' on'}" data-t="${k}">${l}</button>`).join('')}</span></div>
      <svg class="w-svg" viewBox="0 0 640 300" role="img" aria-label="Largura de banda, qualidade escolhida e buffer"></svg>
      <div class="legend"><span><i style="background:var(--s1)"></i>largura de banda</span><span><i style="background:var(--accent)"></i>qualidade pedida</span><span><i style="background:var(--s3)"></i>buffer (s)</span><span><i class="dot" style="background:var(--bad)"></i>paragem</span></div>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const bwAt = t => { const tr = TRACES[trace]; let v = tr[0][1]; tr.forEach(([s, b]) => { if (t >= s) v = b; }); return v; };
    function simulate() {
      let t = 0, buf = 0, stall = 0, stalls = 0, last = null, prev = null, switches = 0; const log = [];
      for (let i = 0; i < TOTAL; i++) {
        let r = mode === 'f5' ? 5 : mode === 'f1' ? 1 : (last === null ? RATES[0] : RATES.filter(x => x <= 0.8 * last).pop() || RATES[0]);
        if (prev !== null && r !== prev) switches++;
        const bw = bwAt(t), dl = r * CH / bw;
        if (i > 0) { if (buf < dl) { stall += dl - buf; stalls++; log.push({ t: t + buf, s: dl - buf, buf: 0 }); buf = 0; } else buf -= dl; }
        log.push({ t, r, bw, buf });
        t += dl; buf += CH; last = bw; prev = r;
        log.push({ t, buf });
        if (buf > BUF) { t += buf - BUF; buf = BUF; log.push({ t, buf }); }
      }
      return { log, stall, stalls, switches, t, avg: mean(log.filter(x => x.r).map(x => x.r)) };
    }
    function draw() {
      el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
      el.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === trace));
      const s = simulate(), T = Math.max(130, s.t);
      const X = scale(0, T, 50, 620), Y = scale(0, 9, 150, 12), YB = scale(0, BUF, 278, 186);
      const bwPath = [], tr = TRACES[trace];
      tr.forEach(([st, b], i) => { const en = i < tr.length - 1 ? tr[i + 1][0] : T; bwPath.push(`${X(st)},${Y(b)}`, `${X(Math.min(en, T))},${Y(b)}`); });
      const req = s.log.filter(x => x.r);
      const rPath = req.map((x, i) => `${X(x.t)},${Y(x.r)} ${X(i < req.length - 1 ? req[i + 1].t : s.t)},${Y(x.r)}`).join(' ');
      const bPath = s.log.map(x => `${X(x.t).toFixed(1)},${YB(x.buf).toFixed(1)}`).join(' L');
      svg.innerHTML = [0, 2.5, 5, 8].map(v => `<line class="ax" x1="50" x2="620" y1="${Y(v)}" y2="${Y(v)}" style="opacity:.45"/><text x="44" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join('') +
        `<text x="10" y="80" transform="rotate(-90 10 80)" text-anchor="middle">Mbps</text>` +
        [0, 10, 20].map(v => `<line class="ax" x1="50" x2="620" y1="${YB(v)}" y2="${YB(v)}" style="opacity:.45"/><text x="44" y="${YB(v) + 4}" text-anchor="end">${v}</text>`).join('') +
        `<text x="10" y="232" transform="rotate(-90 10 232)" text-anchor="middle">buffer (s)</text>` +
        [0, 30, 60, 90, 120].map(v => `<text x="${X(v)}" y="296" text-anchor="middle">${v} s</text>`).join('') +
        `<polyline points="${bwPath.join(' ')}" style="fill:none;stroke:var(--s1);stroke-width:2;stroke-dasharray:6 4"/>` +
        `<polyline points="${rPath}" style="fill:none;stroke:var(--accent);stroke-width:2.5"/>` +
        `<path d="M${bPath}" style="fill:none;stroke:var(--s3);stroke-width:2"/>` +
        s.log.filter(x => x.s).map(x => `<rect x="${X(x.t)}" y="186" width="${Math.max(3, X(x.t + x.s) - X(x.t))}" height="92" style="fill:var(--bad);opacity:.35"/>`).join('');
      kp.innerHTML = kpi('qualidade média', fmt(s.avg, 2) + ' Mbps', 1) + kpi('paragens', s.stalls, 1) + kpi('tempo parado', fmt(s.stall, 1) + ' s') + kpi('mudanças de qualidade', s.switches);
      out.innerHTML = mode === 'dash' ? 'O cliente mede o débito de cada chunk e pede o seguinte à maior taxa que cabe (com margem). A qualidade acompanha a rede e o buffer raramente esvazia.'
        : s.stalls ? `Com a taxa fixa, quando a rede desce abaixo de ${mode === 'f5' ? 5 : 1} Mbps os chunks demoram mais a chegar do que a tocar: o buffer esvazia e o vídeo <b>para</b>.`
        : `A taxa fixa nunca para nesta rede — mas ${mode === 'f1' ? 'desperdiça largura de banda: a qualidade fica baixa mesmo quando havia rede para mais' : 'só porque a rede é sempre suficiente'}.`;
    }
    el.addEventListener('click', e => {
      const m = e.target.closest('[data-m]'), t = e.target.closest('[data-t]');
      if (m) { mode = m.dataset.m; draw(); } if (t) { trace = t.dataset.t; draw(); }
    });
    draw();
  };

  /* =====================================================================
     mcast — cópias por ligação: unicast vs. multicast
     ===================================================================== */
  W.mcast = el => {
    const N = { S: [30, 150, 'h'], R1: [100, 150], R2: [190, 70], R3: [320, 70], R4: [400, 150], R5: [190, 230], R6: [320, 230], R7: [470, 220], R8: [580, 220], R9: [500, 85], R10: [605, 40],
      G1: [190, 290, 'h'], G2: [470, 20, 'h'], G3: [610, 285, 'h'], G4: [620, 110, 'h'] };
    const E = [['S', 'R1'], ['R1', 'R2'], ['R1', 'R5'], ['R2', 'R3'], ['R5', 'R6'], ['R3', 'R4'], ['R6', 'R4'], ['R4', 'R9'], ['R4', 'R7'], ['R7', 'R8'], ['R9', 'R10'], ['R5', 'G1'], ['R9', 'G2'], ['R8', 'G3'], ['R10', 'G4']];
    const adj = {}; E.forEach(([a, b]) => { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); });
    const par = { S: null }, q = ['S'];
    while (q.length) { const x = q.shift(); (adj[x] || []).forEach(y => { if (!(y in par)) { par[y] = x; q.push(y); } }); }
    const path = g => { const p = []; let x = g; while (par[x]) { p.push([par[x], x]); x = par[x]; } return p; };
    const key = (a, b) => [a, b].sort().join('-');
    let mode = 'multi', on = new Set(['G1', 'G2', 'G3']);
    el.innerHTML = head(el, 'Unicast vs. multicast: quantas cópias?', 'A fonte S envia o mesmo fluxo a vários recetores. Ativa ou desativa recetores e compara o número de cópias que atravessa cada ligação.') + `
      <div class="row"><span class="seg"><button type="button" class="btn sm" data-m="uni">Vários unicast</button><button type="button" class="btn sm on" data-m="multi">Multicast</button></span>
        <span class="seg">${['G1', 'G2', 'G3', 'G4'].map(g => `<button type="button" class="btn sm" data-g="${g}">${g}</button>`).join('')}</span></div>
      <svg class="w-svg" viewBox="0 0 640 305" role="img" aria-label="Rede com fonte, routers e recetores"></svg>
      <dl class="kpis"></dl><p class="w-out"></p>`;
    const svg = el.querySelector('svg'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    function draw() {
      el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
      el.querySelectorAll('[data-g]').forEach(b => b.classList.toggle('on', on.has(b.dataset.g)));
      const cnt = {};
      [...on].forEach(g => path(g).forEach(([a, b]) => { const k = key(a, b); cnt[k] = mode === 'uni' ? (cnt[k] || 0) + 1 : 1; }));
      const total = Object.values(cnt).reduce((s, v) => s + v, 0), src = cnt[key('S', 'R1')] || 0;
      const dup = mode === 'multi' ? Object.keys(N).filter(r => r.startsWith('R') && (adj[r] || []).filter(y => par[y] === r && cnt[key(r, y)]).length > 1) : [];
      svg.innerHTML = E.map(([a, b]) => { const c = cnt[key(a, b)] || 0, p = N[a], q2 = N[b], mx = (p[0] + q2[0]) / 2, my = (p[1] + q2[1]) / 2;
        return `<line x1="${p[0]}" y1="${p[1]}" x2="${q2[0]}" y2="${q2[1]}" style="stroke:${c ? 'var(--accent)' : 'var(--rule)'};stroke-width:${c ? 1.5 + c * 1.6 : 1.5}"/>` +
          (c ? `<circle cx="${mx}" cy="${my}" r="10" style="fill:var(--card);stroke:var(--accent)"/><text x="${mx}" y="${my + 4}" text-anchor="middle" class="lab" style="font-size:11px">${c}</text>` : ''); }).join('') +
        Object.entries(N).map(([id, [x, y, h]]) => h
          ? `<rect x="${x - 17}" y="${y - 12}" width="34" height="24" rx="4" style="fill:${id === 'S' ? 'var(--s2)' : on.has(id) ? 'var(--good-bg)' : 'var(--card-2)'};stroke:${id === 'S' ? 'var(--s2)' : on.has(id) ? 'var(--good)' : 'var(--rule)'}"/><text x="${x}" y="${y + 4}" text-anchor="middle" class="lab" style="${id === 'S' ? 'fill:#fff' : ''}">${id}</text>`
          : `<circle cx="${x}" cy="${y}" r="16" style="fill:${dup.includes(id) ? 'var(--warn-bg)' : 'var(--accent-soft)'};stroke:${dup.includes(id) ? 'var(--warn)' : 'var(--accent)'}"/><text x="${x}" y="${y + 4}" text-anchor="middle" class="lab" style="font-size:10.5px">${id}</text>`).join('');
      kp.innerHTML = kpi('recetores', on.size) + kpi('cópias na ligação da fonte', src, 1) + kpi('transmissões no total', total, 1) + (mode === 'multi' ? kpi('routers que duplicam', dup.length) : '');
      out.innerHTML = mode === 'uni'
        ? `A fonte tem de conhecer os ${on.size} recetores e enviar <b>${on.size} cópias iguais</b>; as ligações partilhadas pelos caminhos levam várias cópias do mesmo pacote.`
        : `A fonte envia <b>uma só cópia</b> para o endereço do grupo. Os routers a laranja duplicam o pacote onde a árvore se ramifica, e cada ligação leva no máximo uma cópia. G4 só recebe se aderir ao grupo.`;
    }
    el.addEventListener('click', e => {
      const m = e.target.closest('[data-m]'), g = e.target.closest('[data-g]');
      if (m) mode = m.dataset.m; if (g) { const id = g.dataset.g; on.has(id) ? on.delete(id) : on.add(id); }
      if (m || g) draw();
    });
    draw();
  };

  /* =====================================================================
     digit — tamanho de imagem, áudio e vídeo digitalizados
     ===================================================================== */
  W.digit = el => {
    el.innerHTML = head(el, 'Quantos bits?', 'Escolhe o tipo de media e os parâmetros da digitalização.') + `
      <div class="seg"><button type="button" class="btn sm on" data-m="img">Imagem</button><button type="button" class="btn sm" data-m="aud">Áudio</button><button type="button" class="btn sm" data-m="vid">Vídeo</button></div>
      <div class="row" data-ctl></div><dl class="kpis"></dl><p class="w-out"></p>`;
    const ctl = el.querySelector('[data-ctl]'), kp = el.querySelector('.kpis'), out = el.querySelector('.w-out');
    const sel = (k, l, opts, v) => `<label class="f grow">${l}<select data-k="${k}">${opts.map(([val, txt]) => `<option value="${val}"${val == v ? ' selected' : ''}>${txt}</option>`).join('')}</select></label>`;
    const num = (k, l, v, min, max) => `<label class="f grow">${l}<input type="number" data-k="${k}" value="${v}" min="${min}" max="${max}"></label>`;
    const RES = [['640x480', '640 × 480'], ['1280x720', '1280 × 720 (HD)'], ['1920x1080', '1920 × 1080 (Full HD)'], ['3840x2160', '3840 × 2160 (4K)'], ['7680x4320', '7680 × 4320 (8K)']];
    const size = b => b >= 8e9 ? fmt(b / 8e9, 2) + ' GB' : b >= 8e6 ? fmt(b / 8e6, 2) + ' MB' : fmt(b / 8e3, 1) + ' kB';
    let m = 'img';
    const CTL = {
      img: sel('res', 'Resolução', RES, '1920x1080') + sel('bpp', 'Bits por pixel', [[1, '1 (preto e branco)'], [4, '4 (16 cores)'], [8, '8 (256 cores)'], [24, '24 (true color, RGB 8+8+8)']], 24),
      aud: sel('sr', 'Amostras por segundo', [[8000, '8 kHz (telefone)'], [44100, '44.1 kHz (CD)'], [48000, '48 kHz']], 44100) + sel('bits', 'Bits por amostra', [[8, '8'], [16, '16'], [24, '24']], 16) + sel('ch', 'Canais', [[1, 'mono'], [2, 'estéreo']], 2) + num('dur', 'Duração (s)', 180, 1, 7200),
      vid: sel('res', 'Resolução', RES, '1920x1080') + sel('fps', 'Imagens por segundo', [[24, '24'], [30, '30'], [60, '60']], 24) + sel('bpp', 'Bits por pixel', [[24, '24']], 24)
    };
    function render() { ctl.innerHTML = CTL[m]; el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m)); draw(); }
    function draw() {
      const v = k => { const e = el.querySelector(`[data-k="${k}"]`); return e ? e.value : null; };
      if (m === 'img') {
        const [w, h] = v('res').split('x').map(Number), bits = w * h * +v('bpp');
        kp.innerHTML = kpi('pixels', fmt(w * h / 1e6, 2) + ' MP') + kpi('cores possíveis', (2 ** +v('bpp')).toLocaleString('pt-PT')) + kpi('tamanho sem compressão', size(bits), 1);
        out.innerHTML = `${w} × ${h} pixels × ${v('bpp')} bits = ${fmt(bits / 1e6, 1)} Mbit. Mais pixels ou mais bits por pixel = mais qualidade, mas ficheiro maior.`;
      } else if (m === 'aud') {
        const rate = +v('sr') * +v('bits') * +v('ch'), bits = rate * +v('dur');
        kp.innerHTML = kpi('débito', fmt(rate / 1e3, 1) + ' kbps', 1) + kpi('tamanho sem compressão', size(bits), 1) + kpi('níveis por amostra', (2 ** +v('bits')).toLocaleString('pt-PT'));
        out.innerHTML = `${(+v('sr')).toLocaleString('pt-PT')} amostras/s × ${v('bits')} bits × ${v('ch')} canal(is) = ${fmt(rate / 1e3, 1)} kbps — é o débito de um WAV. Um MP3 comprime para cerca de 128–320 kbps.`;
      } else {
        const [w, h] = v('res').split('x').map(Number), rate = w * h * 24 * +v('fps');
        kp.innerHTML = kpi('débito sem compressão', fmt(rate / 1e6, 0) + ' Mbps', 1) + kpi('1 minuto sem compressão', size(rate * 60)) + kpi('fator para caber em 5 Mbps', fmt(rate / 5e6, 0) + '×', 1);
        out.innerHTML = `Sem compressão, o vídeo é inviável na Internet. A codificação espacial (dentro de cada imagem) e temporal (só as diferenças entre imagens) reduz o débito para alguns Mbps (MPEG-4: 64 kbps a 12 Mbps).`;
      }
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { m = b.dataset.m; render(); } });
    el.addEventListener('input', draw); el.addEventListener('change', draw);
    render();
  };
})();

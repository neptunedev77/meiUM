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
})();

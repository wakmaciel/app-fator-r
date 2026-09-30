/* ==========================================================================
   app.js — Interface e roteamento das abas
   Depende de calc.js e storage.js (carregados antes deste arquivo no HTML).
   ========================================================================== */

let STATE = defaultState();
let ACTIVE_TAB = 'inicio';
let ACTIVE_MONTH_KEY = null; // mês "em foco" na aba Mês
let INICIO_MONTH_KEY = null; // mês escolhido pra ver o resumo na aba Início
let chartRef = null;
let backupMsg = '';

function persist() {
  saveState(STATE);
  // backup automático no Google Drive (se estiver ativado nos Ajustes)
  if (typeof driveScheduleBackup === 'function') driveScheduleBackup(() => STATE);
}

function isLightMode() {
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
}

function ensureActiveMonth() {
  if (!STATE.months.find(m => m.key === ACTIVE_MONTH_KEY)) {
    ACTIVE_MONTH_KEY = STATE.months[STATE.months.length - 1].key;
  }
}

function ensureInicioMonth() {
  if (!STATE.months.find(m => m.key === INICIO_MONTH_KEY)) {
    INICIO_MONTH_KEY = STATE.months[STATE.months.length - 1].key;
  }
}

/* ============================== TABS / NAV ============================== */
const TABS = [
  { id: 'inicio', label: 'Início', icon: '<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9"/>' },
  { id: 'lancar', label: 'Mês', icon: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
  { id: 'projecao', label: 'Projeção', icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' },
  { id: 'historico', label: 'Histórico', icon: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>' },
  { id: 'ajustes', label: 'Ajustes', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>' },
];

function renderTabbar() {
  const bar = document.getElementById('tabbar');
  bar.innerHTML = TABS.map(t => `
    <button class="tab-btn ${ACTIVE_TAB === t.id ? 'active' : ''}" data-tab="${t.id}">
      <svg viewBox="0 0 24 24">${t.icon}</svg>
      <span>${t.label}</span>
    </button>`).join('');
  bar.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { ACTIVE_TAB = b.dataset.tab; renderAll(); }));
}

function setTopbar(title, sub, actionsHTML) {
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-sub').textContent = sub;
  document.getElementById('topbar-actions').innerHTML = actionsHTML || '';
}

function goTo(tab, monthKey) {
  ACTIVE_TAB = tab;
  if (monthKey) { ACTIVE_MONTH_KEY = monthKey; INICIO_MONTH_KEY = monthKey; }
  renderAll();
}

/* ============================== SHEET (modal de ação) ============================== */
function openSheet(innerHTML) {
  const overlay = document.getElementById('sheet-overlay');
  overlay.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet">${innerHTML}</div>`;
  overlay.classList.add('open');
  overlay.querySelector('.sheet-backdrop').addEventListener('click', closeSheet);
}
function closeSheet() {
  const overlay = document.getElementById('sheet-overlay');
  overlay.classList.remove('open');
  overlay.innerHTML = '';
}

function openAddMenu() {
  openSheet(`
    <div class="sheet-title">O que você quer fazer?</div>
    <button class="btn btn-primary sheet-action" id="sheet-nova-despesa">💰 Nova despesa</button>
    <button class="btn btn-secondary sheet-action" id="sheet-novo-mes">📅 Lançar novo mês</button>
    <button class="btn btn-ghost sheet-action" id="sheet-cancelar">Cancelar</button>
  `);
  document.getElementById('sheet-nova-despesa').addEventListener('click', openNovaDespesaSheet);
  document.getElementById('sheet-novo-mes').addEventListener('click', criarNovoMes);
  document.getElementById('sheet-cancelar').addEventListener('click', closeSheet);
}

function openNovaDespesaSheet(monthKeyPref) {
  ensureActiveMonth();
  const defaultKey = monthKeyPref || ACTIVE_MONTH_KEY;
  const options = STATE.months.slice().reverse().map(mm => `<option value="${mm.key}" ${mm.key === defaultKey ? 'selected' : ''}>${monthLabel(mm.key)}</option>`).join('');
  const catOptions = CATEGORIAS_DESPESA.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  openSheet(`
    <div class="sheet-title">Nova despesa</div>
    <div class="field"><label>Mês</label><select id="nd-mes">${options}</select></div>
    <div class="field"><label>Categoria</label><select id="nd-cat">${catOptions}</select></div>
    <div class="field"><label>Descrição</label><input type="text" id="nd-desc" placeholder="Ex: assinatura Cypress Cloud"></div>
    <div class="field"><label>Valor</label><input type="text" inputmode="decimal" id="nd-valor" placeholder="20,00"></div>
    <button class="btn btn-primary sheet-action" id="nd-confirmar">Adicionar despesa</button>
    <button class="btn btn-ghost sheet-action" id="sheet-cancelar">Cancelar</button>
  `);
  document.getElementById('sheet-cancelar').addEventListener('click', closeSheet);
  document.getElementById('nd-valor').focus();
  document.getElementById('nd-confirmar').addEventListener('click', () => {
    const valor = parseBRNumber(document.getElementById('nd-valor').value);
    if (!valor || valor <= 0) { document.getElementById('nd-valor').focus(); return; }
    const mesKey = document.getElementById('nd-mes').value;
    const categoria = document.getElementById('nd-cat').value;
    const descricao = document.getElementById('nd-desc').value.trim();
    const m = STATE.months.find(mm => mm.key === mesKey);
    if (!Array.isArray(m.despesas)) m.despesas = [];
    m.despesas.push({ id: 'd' + Date.now(), categoria, descricao, valor });
    persist();
    closeSheet();
    ACTIVE_MONTH_KEY = mesKey;
    renderAll();
  });
}

function criarNovoMes() {
  const last = STATE.months[STATE.months.length - 1];
  const nk = nextKey(last.key);
  if (STATE.months.find(mm => mm.key === nk)) {
    ACTIVE_MONTH_KEY = nk;
  } else {
    STATE.months.push(mkMonth(nk, last.regime, 0, 0));
    sortMonths(STATE.months);
    ACTIVE_MONTH_KEY = nk;
    persist();
  }
  closeSheet();
  goTo('lancar', nk);
}

/* ============================== TAB: INÍCIO ============================== */

/* Sparkline em SVG puro (sem Chart.js) pros mini-gráficos dos KPIs.
   Só visualização: recebe a série pronta e desenha linha + área. */
function sparklineSVG(values, color) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const nums = values.map(v => (isFinite(v) ? v : 0));
  const min = Math.min(...nums), max = Math.max(...nums);
  const range = (max - min) || 1;
  const W = 100, H = 30, P = 3;
  const pts = nums.map((v, i) => [
    P + (i / (nums.length - 1)) * (W - 2 * P),
    P + (1 - (v - min) / range) * (H - 2 * P),
  ].map(n => +n.toFixed(1)));
  const line = pts.map(p => p.join(',')).join(' ');
  const area = `M${pts[0][0]},${H} L${pts.map(p => p.join(',')).join(' L')} L${pts[pts.length - 1][0]},${H} Z`;
  return `<svg class="kpi-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="${hexToRgba(color, 0.14)}"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/* Medidor do hero: arco de 240° com a meta escrita no centro.
   Mesma escala do gaugeSVG antigo (0 a 60%), só muda a apresentação. */
function heroGaugeSVG(fatorR, meta, anexo) {
  const cx = 100, cy = 92, r = 76, sw = 13, scaleMax = 0.6;
  const pt = (rad, ang) => { const a = ang * Math.PI / 180; return [(cx + rad * Math.cos(a)).toFixed(1), (cy - rad * Math.sin(a)).toFixed(1)]; };
  // escala varre 240° no sentido horário: 210° = 0% … -30° = 60%
  const [x1, y1] = pt(r, 210);
  const [x2, y2] = pt(r, -30);
  const arc = `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`;
  const pct = Math.max(0, Math.min(100, (fatorR / scaleMax) * 100)); // fração do arco preenchida (pathLength=100)
  const angMeta = 210 - Math.max(0, Math.min(1, meta / scaleMax)) * 240;
  const [mx1, my1] = pt(r - 11, angMeta);
  const [mx2, my2] = pt(r + 9, angMeta);
  const color = anexo === 'III' ? 'var(--primary)' : 'var(--danger)';
  const dentro = fatorR >= meta - 1e-9;
  return `<svg viewBox="0 0 200 142" aria-hidden="true">
    <path d="${arc}" stroke="var(--gauge-track)" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
    ${pct > 0.5 ? `<path d="${arc}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round"
      pathLength="100" stroke-dasharray="${pct.toFixed(1)} 100"/>` : ''}
    <line x1="${mx1}" y1="${my1}" x2="${mx2}" y2="${my2}" stroke="var(--gauge-tick)" stroke-width="2"/>
    <text x="${cx}" y="80" text-anchor="middle" fill="var(--text-dim)" font-size="13" font-weight="500">Meta</text>
    <text x="${cx}" y="106" text-anchor="middle" fill="var(${dentro ? '--success' : '--danger'})" font-size="22" font-weight="700">≥ ${fmtPct(meta)}</text>
  </svg>`;
}

/* Sheet pra escolher o mês em foco — usado no topo da Home e da aba Mês.
   A escolha vale pras duas abas (INICIO_MONTH_KEY e ACTIVE_MONTH_KEY andam juntos). */
function openMonthPickerSheet() {
  const all = computeAll(STATE);
  const selKey = ACTIVE_TAB === 'lancar' ? ACTIVE_MONTH_KEY : INICIO_MONTH_KEY;
  const items = STATE.months.map((mm, i) => {
    const right = mm.regime === 'MEI'
      ? '<span class="chip">MEI</span>'
      : `${fmtPct(all[i].fatorR)} <span class="badge ${all[i].anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${all[i].anexo}</span>`;
    return `<button class="mp-item ${mm.key === selKey ? 'sel' : ''}" data-mk="${mm.key}">
      <span>${monthLabel(mm.key)}</span><span class="r">${right}</span>
    </button>`;
  }).reverse().join('');
  openSheet(`
    <div class="sheet-title">${ACTIVE_TAB === 'lancar' ? 'Editar qual mês?' : 'Ver resumo de qual mês?'}</div>
    <div class="mp-list">${items}</div>
    <button class="btn btn-ghost sheet-action" id="sheet-cancelar">Cancelar</button>
  `);
  document.getElementById('sheet-cancelar').addEventListener('click', closeSheet);
  document.querySelectorAll('.mp-item').forEach(el => el.addEventListener('click', () => {
    INICIO_MONTH_KEY = el.dataset.mk;
    ACTIVE_MONTH_KEY = el.dataset.mk;
    closeSheet();
    renderAll();
  }));
}

function renderInicio() {
  ensureInicioMonth();
  const all = computeAll(STATE);
  const selIdx = STATE.months.findIndex(m => m.key === INICIO_MONTH_KEY);
  const sel = STATE.months[selIdx];
  const selC = all[selIdx];

  const year = sel.key.slice(0, 4);
  const yearIdxs = STATE.months.map((m, i) => i).filter(i => STATE.months[i].key.slice(0, 4) === year);
  const sum = f => yearIdxs.reduce((s, i) => s + f(STATE.months[i], all[i]), 0);
  const totFat = sum(m => m.faturamento);
  const totPL = sum(m => m.proLabore);
  const totLucro = sum((m, c) => c.lucroDistribuido);
  const totImp = sum((m, c) => c.dasUsado + c.inss + c.despesasMes);

  const nomeEmpresa = STATE.empresa?.nome ? STATE.empresa.nome + ' • ' : '';
  setTopbar('Fator R', `${nomeEmpresa}${monthLabel(sel.key)}`, `
    <button class="icon-btn" id="btn-pick-month" aria-label="Escolher mês do resumo">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
    </button>`);

  const isME = sel.regime === 'ME';
  const proj = isME ? projectNextMonth(STATE.months, selIdx, STATE.params) : null;

  /* ---------- hero: Fator R do mês + medidor com a meta ---------- */
  const dentro = selC.fatorR >= STATE.params.fatorRMeta - 1e-9;
  const heroHTML = isME ? `
    <div class="card hero">
      <div class="hero-grid">
        <div class="hero-left">
          <div class="hero-label">Fator R oficial</div>
          <div class="hero-value">${fmtPct(selC.fatorR)}</div>
          <span class="badge ${selC.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${selC.anexo}</span>
        </div>
        <div class="hero-gauge">
          ${heroGaugeSVG(selC.fatorR, STATE.params.fatorRMeta, selC.anexo)}
          <div class="hero-status ${dentro ? 'ok' : 'bad'}">${dentro ? 'Dentro da meta ✅' : 'Abaixo da meta ⚠️'}</div>
        </div>
      </div>
      <div class="hero-next">
        <div class="l">Formando agora<span>vale para ${monthLabel(nextKey(sel.key))}</span></div>
        <div class="r">
          <span class="v ${proj.anexoProjetado === 'III' ? 'ok' : 'bad'}">${fmtPct(proj.fatorR)}</span>
          <span class="badge ${proj.anexoProjetado === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${proj.anexoProjetado}</span>
        </div>
      </div>
    </div>` : `
    <div class="card hero" style="text-align:center;">
      <div class="hero-label">Fator R</div>
      <div style="padding:14px 0 4px;"><span class="badge badge-mei">MEI — sem Fator R</span></div>
    </div>`;

  /* ---------- auditoria da janela de 12 meses ----------
     A dúvida mais comum é "por que o Fator R quase não se move quando eu
     lanço o mês?". A resposta é a regra do PGDAS-D: o número deste mês vem
     dos 12 meses ANTERIORES. Este card abre a janela inteira, mês a mês, pra
     dar pra conferir de onde saiu cada real da conta. */
  const janelaHTML = isME ? (() => {
    const byKey = {};
    STATE.months.forEach(mm => { byKey[mm.key] = mm; });
    const keys = selC.janelaKeys || [];
    const periodo = keys.length ? `${monthLabel(keys[0])} a ${monthLabel(keys[keys.length - 1])}` : '—';
    const linhas = keys.map(k => {
      const mm = byKey[k];
      const f = mm ? mm.faturamento : 0;
      const pl = mm ? mm.proLabore : 0;
      return `<tr>
        <td>${monthLabel(k)}${mm ? '' : ' *'}</td>
        <td>${fmtBRL(f)}</td>
        <td class="${pl === 0 ? 'audit-zero' : ''}">${fmtBRL(pl)}</td>
      </tr>`;
    }).join('');
    const faltando = keys.some(k => !byKey[k]);
    const parcial = keys.length > 0 && keys.length < 12;
    return `
    <div class="card">
      <details class="audit">
        <summary>De onde saíram esses ${fmtPct(selC.fatorR)}</summary>
        <div class="audit-body">
          ${keys.length ? `
            <div class="row"><div class="l">Janela usada (12 meses anteriores)</div><div class="v dim">${periodo}</div></div>
            <div class="row"><div class="l">Faturamento somado na janela</div><div class="v dim">${fmtBRL(selC.janelaSf)}</div></div>
            <div class="row"><div class="l">Pró-labore somado na janela</div><div class="v dim">${fmtBRL(selC.janelaSp)}</div></div>
          ` : `
            <div class="row"><div class="l">Meses anteriores lançados</div><div class="v dim">nenhum</div></div>
            <div class="row"><div class="l">Faturamento do próprio mês</div><div class="v dim">${fmtBRL(sel.faturamento)}</div></div>
            <div class="row"><div class="l">Pró-labore do próprio mês</div><div class="v dim">${fmtBRL(sel.proLabore)}</div></div>
          `}
          <div class="divider"></div>
          <div class="row big"><div class="l">Fator R = pró-labore ÷ faturamento</div><div class="v">${fmtPct(selC.fatorR)}</div></div>
          <div class="row"><div class="l">RBT12 usado p/ achar a faixa da tabela</div><div class="v dim">${fmtBRL(selC.rbt12)}</div></div>
          ${keys.length ? `<table class="audit-tbl">
            <thead><tr><th>Mês</th><th>Faturamento</th><th>Pró-labore</th></tr></thead>
            <tbody>${linhas}</tbody>
            <tfoot><tr><td>Total</td><td>${fmtBRL(selC.janelaSf)}</td><td>${fmtBRL(selC.janelaSp)}</td></tr></tfoot>
          </table>` : ''}
          ${faltando ? `<div class="note">* mês sem lançamento — entra na janela como R$ 0,00.</div>` : ''}
          ${parcial ? `<div class="note">Só ${keys.length} ${keys.length === 1 ? 'mês lançado' : 'meses lançados'} antes de ${monthLabel(sel.key)}: pela regra de início de atividade (LC 123/2006, art. 18 §3º), o RBT12 acima é a média desses meses anualizada. O Fator R em si não muda com isso — a anualização se cancela na divisão.</div>` : ''}
          ${keys.length
            ? `<div class="note"><strong>${monthLabel(sel.key)} não entra nesta conta.</strong> É assim no PGDAS-D: o Fator R de um mês é decidido pelos 12 meses anteriores a ele. Por isso o número acima quase não se mexe quando você lança o mês — o que você digita hoje aparece no <strong>Formando agora</strong> e vale para ${monthLabel(nextKey(sel.key))}.</div>`
            : `<div class="note"><strong>Primeiro mês lançado.</strong> Sem meses anteriores, a regra de início de atividade (art. 18 §2º) manda usar o faturamento e o pró-labore do próprio mês × 12. A partir de ${monthLabel(nextKey(sel.key))} o Fator R passa a olhar só para os meses anteriores.</div>`}
        </div>
      </details>
    </div>` ;
  })() : '';

  /* ---------- atalho pra aba Projeção: o valor fixo que evita os saltos ----------
     Mesma base e mesmas premissas da aba Projeção (planoAtual), pra os dois
     números nunca discordarem. */
  const { plano } = planoAtual();
  const nivelHTML = plano && (plano.fatProj > 0 || plano.linhas.some(l => l.faturamento > 0)) ? (() => {
    const pior = plano.linhas.reduce((a, l) => (l.minimo > a.minimo ? l : a), plano.linhas[0]);
    const temSalto = pior.minimo > plano.nivel + 0.5;
    const ultimo = plano.linhas[plano.linhas.length - 1].key;
    const f = plano.falhaRitmo;
    return `
    <button class="card proj-mini" id="btn-ir-projecao">
      <div class="proj-mini-body">
        <div class="hero-label">Pró-labore nivelado</div>
        <div class="proj-mini-v">${fmtBRL(plano.nivel)}<span>/mês</span></div>
        <div class="proj-mini-s">${f
          ? `Tirando o que você vem tirando (<strong>${fmtBRL(plano.plRitmo)}</strong>/mês), o Fator R cai para <strong class="proj-ruim">${fmtPct(f.fatorR)}</strong> em ${monthLabel(f.key)} e ${monthLabel(f.anexoEm)} vai para o Anexo V.`
          : temSalto
          ? `Só o mínimo daria um mês de <strong class="proj-pico">${fmtBRL(pior.minimo)}</strong> em ${monthLabel(pior.key)}. Nivelando, nenhum mês pesa até ${monthLabel(ultimo)}.`
          : `Mantém o Fator R na meta até ${monthLabel(ultimo)} sem nenhum mês pesado.`}
          ${plano.reforcoBase ? ` ${monthLabel(plano.baseKey)} precisa de um reforço de <strong>${fmtBRL(plano.reforcoBase)}</strong>.` : ''}</div>
      </div>
      <span class="proj-mini-go">›</span>
    </button>`;
  })() : '';

  /* ---------- KPIs do mês, com o total do ano / mínimo como contexto ---------- */
  const N = Math.min(12, selIdx + 1);
  const mSlice = STATE.months.slice(selIdx + 1 - N, selIdx + 1);
  const cSlice = all.slice(selIdx + 1 - N, selIdx + 1);
  const light = isLightMode();
  const cores = {
    fat: light ? '#0369A1' : '#38BDF8',
    pl: light ? '#7C3AED' : '#A78BFA',
    lucro: light ? '#15803D' : '#34D399',
    imp: light ? '#E11D48' : '#FB7185',
  };
  const impMes = selC.dasUsado + selC.inss + selC.despesasMes;

  const kpi = (label, valor, valClass, sub, cor, icone, serie) => `
    <div class="kpi">
      <div class="kpi-head">
        <div class="label">${label}</div>
        <div class="kpi-icon" style="background:${hexToRgba(cor, 0.14)};">
          <svg viewBox="0 0 24 24" style="stroke:${cor};">${icone}</svg>
        </div>
      </div>
      <div class="value ${valClass}">${valor}</div>
      <div class="kpi-sub">${sub}</div>
      ${sparklineSVG(serie, cor)}
    </div>`;

  const kpisHTML = `
    <div class="kpi-grid">
      ${kpi('Faturamento', fmtBRL(sel.faturamento), 'chart-revenue',
        `Ano: <strong>${fmtBRL(totFat)}</strong>`, cores.fat,
        '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M14.5 9.3c-.5-.8-1.4-1.3-2.5-1.3-1.7 0-3 .9-3 2s1.2 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.1 0-2-.5-2.5-1.3"/>',
        mSlice.map(m => m.faturamento))}
      ${kpi('Pró-labore', fmtBRL(sel.proLabore), '',
        proj ? `Mínimo: <strong>${fmtBRL(proj.proLaboreMinimo)}</strong>` : `Ano: <strong>${fmtBRL(totPL)}</strong>`, cores.pl,
        '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5"/>',
        mSlice.map(m => m.proLabore))}
      ${kpi('Lucro distribuído', fmtBRL(selC.lucroDistribuido), 'success',
        sel.faturamento > 0 ? `% do faturamento: <strong>${fmtPct(selC.lucroDistribuido / sel.faturamento)}</strong>` : `Ano: <strong>${fmtBRL(totLucro)}</strong>`, cores.lucro,
        '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M16 3.9A9 9 0 0 1 20.1 8H16z"/>',
        cSlice.map(c => c.lucroDistribuido))}
      ${kpi('Impostos + despesas', fmtBRL(impMes), 'danger',
        sel.faturamento > 0 ? `% do faturamento: <strong>${fmtPct(impMes / sel.faturamento)}</strong>` : `Ano: <strong>${fmtBRL(totImp)}</strong>`, cores.imp,
        '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
        cSlice.map(c => c.dasUsado + c.inss + c.despesasMes))}
    </div>`;

  /* ---------- card de insight (mesmas regras e textos do aviso de antes) ---------- */
  let insightHTML = '';
  if (isME) {
    const metaPct = fmtPct(STATE.params.fatorRMeta);
    let variant, icone, titulo, msg, showBadges = true;
    if (proj.sf <= 0) {
      variant = 'info';
      icone = '📋';
      titulo = 'Sem faturamento lançado ainda';
      msg = `Lance o faturamento e o pró-labore deste mês para ver a projeção do Fator R e quanto retirar para continuar no Anexo III.`;
      showBadges = false;
    } else if (proj.folga < -0.005) {
      variant = 'danger';
      icone = '⚠️';
      titulo = 'Risco de cair no Anexo V';
      msg = `Você lançou <strong>${fmtBRL(proj.proLaboreMes)}</strong> de pró-labore neste mês, mas o mínimo para manter o Fator R ≥ ${metaPct} é <strong>${fmtBRL(proj.proLaboreMinimo)}</strong> — faltam <strong>${fmtBRL(-proj.folga)}</strong>. Sem esse ajuste, o mês que vem cai no Anexo V.`;
    } else if (proj.folga < 0.01) {
      variant = 'success';
      icone = '✅';
      titulo = 'No ponto certo';
      msg = `Você está retirando exatamente o mínimo (<strong>${fmtBRL(proj.proLaboreMinimo)}</strong>) para manter o Anexo III no mês que vem — sem pagar INSS além do necessário.`;
    } else {
      // Sugestão de economia: só a parte do pró-labore que dá pra cortar sem
      // furar a meta do Fator R E sem ficar abaixo de 1 salário mínimo (piso
      // legal usual de contribuição do sócio).
      const reduzivel = Math.max(0, proj.proLaboreMes - Math.max(proj.proLaboreMinimo, STATE.params.salarioMinimo));
      // INSS incide só até o teto — a economia real é a diferença entre as bases
      const baseAtual = Math.min(proj.proLaboreMes, STATE.params.tetoInss);
      const baseNova = Math.min(proj.proLaboreMes - reduzivel, STATE.params.tetoInss);
      const economiaInss = Math.max(0, baseAtual - baseNova) * STATE.params.aliqInss;
      variant = 'success';
      icone = '✅';
      titulo = 'Dentro da meta — com sobra';
      msg = `O mínimo de pró-labore para manter o Anexo III no mês que vem é <strong>${fmtBRL(proj.proLaboreMinimo)}</strong>. Você lançou <strong>${fmtBRL(proj.proLaboreMes)}</strong> neste mês — <strong>${fmtBRL(proj.excedenteMes)}</strong> acima do mínimo.` +
        (reduzivel > 0.005
          ? ` Se quiser pagar menos INSS, até <strong>${fmtBRL(reduzivel)}</strong> dessa sobra pode virar lucro distribuído (mantendo pelo menos 1 salário mínimo de pró-labore) — economia estimada de <strong>${fmtBRL(economiaInss)}</strong> de INSS.`
          : '');
    }
    const icoClass = { success: 'ok', warning: 'warn', danger: 'bad', info: 'info' }[variant];
    insightHTML = `
    <div class="alert alert-${variant}">
      <div class="insight-head">
        <div class="insight-ico ${icoClass}">${icone}</div>
        <div>
          <div class="alert-title">${titulo}</div>
          <div class="alert-body">${msg}</div>
        </div>
      </div>
      ${showBadges ? `
      <div class="insight-foot">
        <div class="insight-stat"><div class="l">Anexo vigente (usado no DAS)</div><div class="v"><span class="badge ${selC.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${selC.anexo}</span></div></div>
        <div class="insight-stat"><div class="l">Projeção p/ o mês que vem</div><div class="v"><span class="badge ${proj.anexoProjetado === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${proj.anexoProjetado}</span></div></div>
        <button class="btn btn-primary" id="btn-ir-lancar">Ajustar pró-labore →</button>
      </div>` : `<button class="btn btn-secondary" id="btn-ir-lancar">Ajustar pró-labore deste mês →</button>`}
    </div>`;
  } else {
    insightHTML = `
    <div class="alert alert-info">
      <div class="insight-head">
        <div class="insight-ico info">📌</div>
        <div>
          <div class="alert-title">Você está como MEI</div>
          <div class="alert-body">Enquanto MEI não existe Fator R nem Anexo III/V — só o DAS-MEI fixo. Quando migrar para ME, troque o regime do mês na aba Mês: a partir dali o pró-labore passa a contar para o Fator R.</div>
        </div>
      </div>
    </div>`;
  }

  document.getElementById('content').innerHTML = `
    ${heroHTML}
    ${nivelHTML}
    ${janelaHTML}
    ${kpisHTML}

    <div class="card">
      <div class="panel-head">
        <div class="panel-title">Desempenho (12 meses)</div>
        <button class="link-btn" id="btn-ver-historico">Ver histórico →</button>
      </div>
      <div class="chart-legend">
        <span class="item"><span class="legend-swatch" style="background:${cores.pl};"></span>Fator R</span>
        <span class="item"><span class="legend-swatch dashed"></span>Meta</span>
        ${isME ? `<span class="badge ${selC.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${selC.anexo}</span>` : ''}
      </div>
      <div class="chart-box"><canvas id="chart-inicio"></canvas></div>
    </div>

    ${insightHTML}

    <div class="note">Cálculos de Fator R, RBT12 e DAS seguem a metodologia oficial do PGDAS-D. Confirme sempre os valores de imposto com seu contador.</div>
  `;

  document.getElementById('btn-pick-month').addEventListener('click', openMonthPickerSheet);
  document.getElementById('btn-ver-historico').addEventListener('click', () => goTo('historico'));
  const btnProj = document.getElementById('btn-ir-projecao');
  if (btnProj) btnProj.addEventListener('click', () => goTo('projecao'));
  const btnLancar = document.getElementById('btn-ir-lancar');
  if (btnLancar) btnLancar.addEventListener('click', () => goTo('lancar', sel.key));

  const ctx = document.getElementById('chart-inicio');
  if (typeof Chart === 'undefined') {
    if (ctx) ctx.replaceWith(Object.assign(document.createElement('div'), {
      className: 'note',
      textContent: 'Não foi possível carregar a biblioteca de gráficos (Chart.js) — verifique sua conexão. O resto do app funciona normalmente.',
    }));
    return;
  }
  if (chartRef) chartRef.destroy();
  const tickColor = light ? '#5B5478' : '#6F5FA0';
  const gridColor = light ? 'rgba(40,20,80,0.10)' : '#241A4D';
  const metaColor = light ? '#15803D' : '#34D399';
  const metaPctVal = +(STATE.params.fatorRMeta * 100).toFixed(2);
  chartRef = new Chart(ctx, {
    type: 'line',
    data: {
      labels: mSlice.map(m => monthLabel(m.key)),
      datasets: [
        { label: 'Fator R', data: cSlice.map(c => +(c.fatorR * 100).toFixed(2)), borderColor: cores.pl, backgroundColor: hexToRgba(cores.pl, 0.12), fill: true, tension: .35, pointRadius: 3, borderWidth: 2.5 },
        { label: 'Meta', data: mSlice.map(() => metaPctVal), borderColor: metaColor, borderDash: [6, 5], pointRadius: 0, borderWidth: 2, fill: false },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
        y: { beginAtZero: true, ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 5, callback: v => v + '%' }, grid: { color: gridColor } }
      }
    }
  });
}

/* ============================== DESPESAS (lista inline, usada na aba Lançar) ============================== */
function renderDespesasInline(m) {
  const total = despesasTotal(m);
  const porCategoria = {};
  (m.despesas || []).forEach(d => { porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + (Number(d.valor) || 0); });
  const catEntries = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const catRows = catEntries.map(([catId, valor], i) => {
    const idx = CATEGORIAS_DESPESA.findIndex(c => c.id === catId);
    const color = CHART_PALETTE[(idx >= 0 ? idx : i) % CHART_PALETTE.length];
    const label = (CATEGORIAS_DESPESA.find(c => c.id === catId) || { label: catId }).label;
    const pct = total ? (valor / total) * 100 : 0;
    return `<div class="cat-row">
      <div class="cat-row-top"><span>${esc(label)}</span><span>${fmtBRL(valor)}</span></div>
      <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct.toFixed(1)}%;background:${color};"></div></div>
    </div>`;
  }).join('');

  const itemRows = (m.despesas || []).slice().reverse().map(d => {
    const idx = CATEGORIAS_DESPESA.findIndex(c => c.id === d.categoria);
    const color = CHART_PALETTE[(idx >= 0 ? idx : 0) % CHART_PALETTE.length];
    const label = (CATEGORIAS_DESPESA.find(c => c.id === d.categoria) || { label: 'Outros' }).label;
    return `<div class="expense-row" data-id="${d.id}">
      <div class="expense-info">
        <span class="chip" style="background:${hexToRgba(color, 0.18)};color:${color};">${esc(label)}</span>
        <div class="expense-desc">${esc(d.descricao) || '(sem descrição)'}</div>
      </div>
      <div class="expense-right">
        <div class="v">${fmtBRL(d.valor)}</div>
        <button class="x-btn" data-del-desp="${d.id}">✕</button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="row" style="font-weight:600;"><div class="l">Total de despesas</div><div class="v danger">${fmtBRL(total)}</div></div>
    ${catRows ? `<div class="divider"></div>${catRows}` : ''}
    <div class="divider"></div>
    <div class="expense-list">${itemRows || '<div class="empty" style="padding:16px 0;">Nenhuma despesa lançada neste mês ainda.</div>'}</div>
    <button class="btn btn-ghost" id="btn-add-despesa-inline">+ Adicionar despesa neste mês</button>
  `;
}

function wireDespesasInline(m, rerender) {
  const btn = document.getElementById('btn-add-despesa-inline');
  if (btn) btn.addEventListener('click', () => openNovaDespesaSheet(m.key));
  document.querySelectorAll('[data-del-desp]').forEach(el => el.addEventListener('click', () => {
    m.despesas = (m.despesas || []).filter(d => d.id !== el.dataset.delDesp);
    persist();
    rerender();
  }));
}

/* ============================== TAB: LANÇAR ============================== */
function renderLancar() {
  ensureActiveMonth();
  const idx = STATE.months.findIndex(m => m.key === ACTIVE_MONTH_KEY);
  const m = STATE.months[idx];
  const c = computeMonth(STATE.months, idx, STATE.params);
  const proj = m.regime === 'ME' ? projectNextMonth(STATE.months, idx, STATE.params) : null;

  setTopbar('Mês', monthLabelExt(m.key), `
    <button class="icon-btn" id="btn-pick-month" aria-label="Escolher mês">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
    </button>`);

  document.getElementById('content').innerHTML = `
    <h2 class="section-title">Regime</h2>
    <div class="card tight">
      <div class="seg">
        <button data-regime="MEI" class="${m.regime === 'MEI' ? 'on' : ''}">MEI</button>
        <button data-regime="ME" class="${m.regime === 'ME' ? 'on' : ''}">ME / Simples</button>
      </div>
      <div class="note">MEI não tem Fator R nem pró-labore — só paga o DAS-MEI fixo.</div>
    </div>

    <h2 class="section-title">Dados do mês</h2>
    <div class="card">
      <div class="field">
        <label>Faturamento do mês</label>
        <input type="text" inputmode="decimal" id="f-fat" value="${numToInputMoney(m.faturamento)}" placeholder="0,00">
        ${m.faturamento === 0 ? '<div class="hint hint-ok">Mês sem faturamento — gravado como <strong>R$ 0,00</strong> e contando assim no RBT12 dos próximos meses.</div>' : ''}
      </div>
      ${m.regime === 'ME' ? `
        <div class="field">
          <label>Pró-labore retirado</label>
          <input type="text" inputmode="decimal" id="f-pl" value="${numToInputMoney(m.proLabore)}" placeholder="0,00">
          <div class="hint ${proj && proj.folga < -0.005 ? 'hint-danger' : 'hint-ok'}">
            ${proj ? `Mínimo p/ manter Anexo III no mês que vem: <strong>${fmtBRL(proj.proLaboreMinimo)}</strong>${proj.folga < -0.005 ? ` — faltam <strong>${fmtBRL(-proj.folga)}</strong>` : ''}` : ''}
          </div>
          ${m.proLabore === 0 ? '<div class="hint hint-ok">Mês sem retirada — gravado como <strong>R$ 0,00</strong> e contando assim na folha de 12 meses.</div>' : ''}
        </div>
        <div class="field">
          <label>DAS informado pelo contador (em branco = usar estimativa)</label>
          <input type="text" inputmode="decimal" id="f-das" value="${numToInputMoney(m.dasPago)}" placeholder="${fmtBRL(c.dasEstimado)} (estimado)">
        </div>
      ` : `
        <div class="field">
          <label>DAS-MEI pago (em branco = usar o valor padrão)</label>
          <input type="text" inputmode="decimal" id="f-das" value="${numToInputMoney(m.dasPago)}" placeholder="${fmtBRL(STATE.params.dasMei)} (padrão)">
        </div>
      `}
    </div>

    <h2 class="section-title">Resultado calculado</h2>
    <div class="card">
      ${m.regime === 'ME' ? `
        <div class="row"><div class="l">RBT12 (12 meses anteriores)</div><div class="v dim">${fmtBRL(c.rbt12)}</div></div>
        <div class="row"><div class="l">Folha pró-labore (12m anteriores)</div><div class="v dim">${fmtBRL(c.folha12)}</div></div>
        <div class="row"><div class="l">Fator R oficial (define o DAS deste mês)</div><div class="v">${fmtPct(c.fatorR)}</div></div>
        <div class="row"><div class="l">Anexo aplicável este mês</div><div class="v"><span class="badge ${c.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${c.anexo}</span></div></div>
        <div class="row"><div class="l">DAS usado no cálculo</div><div class="v">${fmtBRL(c.dasUsado)}</div></div>
        <div class="row"><div class="l">INSS sobre pró-labore (11%)</div><div class="v">${fmtBRL(c.inss)}</div></div>
        <div class="divider"></div>
        <div class="row"><div class="l">Projeção Fator R p/ o mês que vem</div><div class="v">${proj ? fmtPct(proj.fatorR) : '—'}</div></div>
        <div class="row"><div class="l">Anexo projetado p/ o mês que vem</div><div class="v">${proj ? `<span class="badge ${proj.anexoProjetado === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${proj.anexoProjetado}</span>` : '—'}</div></div>
      ` : `
        <div class="row"><div class="l">DAS-MEI usado</div><div class="v">${fmtBRL(c.dasUsado)}</div></div>
      `}
      <div class="row"><div class="l">Despesas</div><div class="v dim">${fmtBRL(c.despesasMes)}</div></div>
      <div class="divider"></div>
      <div class="row big"><div class="l">Total de saídas</div><div class="v">${fmtBRL(c.totalSaida)}</div></div>
      <div class="row big"><div class="l">Lucro disponível</div><div class="v ${c.lucroDisponivel < 0 ? 'danger' : 'success'}">${fmtBRL(c.lucroDisponivel)}</div></div>
    </div>

    <h2 class="section-title">Despesas deste mês</h2>
    <div class="card">${renderDespesasInline(m)}</div>

    <h2 class="section-title">Distribuição de lucro</h2>
    <div class="card">
      <div class="field">
        <label>Lucro distribuído este mês (em branco = distribuir tudo)</label>
        <input type="text" inputmode="decimal" id="f-dist" value="${numToInputMoney(m.lucroDistribuidoOverride)}" placeholder="${fmtBRL(Math.max(c.lucroDisponivel, 0))} (automático)">
      </div>
      <div class="row"><div class="l">Saldo retido em caixa</div><div class="v">${fmtBRL(c.saldoCaixa)}</div></div>
    </div>

    <h2 class="section-title">Zona de risco</h2>
    <div class="card">
      <button class="btn btn-danger" id="btn-delete-month">🗑️ Excluir ${monthLabel(m.key)}</button>
      <div class="note">Remove este mês e todas as despesas lançadas nele — útil se você lançou um mês errado por engano. Não pode ser desfeito.</div>
    </div>
  `;

  document.getElementById('btn-pick-month').addEventListener('click', openMonthPickerSheet);
  document.querySelectorAll('[data-regime]').forEach(b => b.addEventListener('click', () => {
    m.regime = b.dataset.regime;
    if (m.regime === 'MEI') m.proLabore = 0;
    persist(); renderLancar();
  }));

  wireDespesasInline(m, renderLancar);

  const bindNum = (id, field, allowNull) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const raw = el.value;
      if (allowNull && raw.trim() === '') { m[field] = null; }
      else { const v = parseBRNumber(raw); m[field] = isNaN(v) ? 0 : v; }
      persist();
      renderLancar();
    });
  };
  bindNum('f-fat', 'faturamento', false);
  bindNum('f-pl', 'proLabore', false);
  bindNum('f-das', 'dasPago', true);
  bindNum('f-dist', 'lucroDistribuidoOverride', true);

  document.getElementById('btn-delete-month').addEventListener('click', () => {
    if (STATE.months.length <= 1) {
      alert('Não é possível excluir o único mês cadastrado. Lance outro mês antes de remover este.');
      return;
    }
    if (!confirm(`Excluir ${monthLabel(m.key)}? Isso remove o faturamento, pró-labore e despesas lançados nele. Não pode ser desfeito.`)) return;
    STATE.months = STATE.months.filter(mm => mm.key !== m.key);
    if (INICIO_MONTH_KEY === m.key) INICIO_MONTH_KEY = null;
    ACTIVE_MONTH_KEY = STATE.months[STATE.months.length - 1].key;
    persist();
    goTo('historico');
  });
}

/* ============================== TAB: PROJEÇÃO ==============================
   Responde "com o que eu venho tirando, o Fator R aguenta os próximos 12
   meses?" e "quanto tirar pra não levar susto?". Tudo em cima dos meses
   lançados: o histórico entra com os valores reais e o mês que já tem
   pró-labore lançado fica com o valor real — só os meses em aberto são
   simulados. */
let PROJ_CENARIO = 'ritmo';

/* Base da projeção = último mês com algo lançado. Mês criado em branco lá na
   frente não pode virar "histórico com R$ 0,00" — ele fica em aberto na simulação. */
function baseProjecaoIdx() {
  for (let i = STATE.months.length - 1; i >= 0; i--) {
    const m = STATE.months[i];
    if ((Number(m.faturamento) || 0) > 0 || (Number(m.proLabore) || 0) > 0) return i;
  }
  return STATE.months.length - 1;
}

function planoAtual() {
  const idx = baseProjecaoIdx();
  if (STATE.months[idx].regime !== 'ME') return { base: STATE.months[idx], plano: null };
  return { base: STATE.months[idx], plano: planoProLabore(STATE.months, idx, STATE.params, STATE.params.fatProjecao, STATE.params.plPretendido) };
}

function renderProjecao() {
  const { base, plano: p } = planoAtual();
  setTopbar('Projeção', `Próximos 12 meses • a partir de ${monthLabel(base.key)}`);

  if (!p) {
    document.getElementById('content').innerHTML = `
      <div class="alert alert-info">
        <div class="insight-head">
          <div class="insight-ico info">📌</div>
          <div>
            <div class="alert-title">Projeção é só para ME</div>
            <div class="alert-body">O último mês lançado (${monthLabel(base.key)}) está como MEI, que não tem Fator R. Quando migrar para ME, a projeção dos próximos 12 meses aparece aqui.</div>
          </div>
        </div>
      </div>`;
    return;
  }

  const L = p.linhas;
  const metaPct = fmtPct(p.meta);
  const ultimo = L[L.length - 1].key;
  // primeiro mês em que o nível vale: pula os já lançados e o reforço do mês base
  const inicioNivel = (L.find((l, i) => !l.real && !(i === 0 && p.reforcoBase)) || L[0]).key;
  const listaMeses = ks => ks.map(monthLabel).join(', ').replace(/, ([^,]*)$/, ' e $1');

  const premissaHTML = `
    <h2 class="section-title">Premissas</h2>
    <div class="card">
      <div class="field">
        <label>Pró-labore que pretende tirar por mês</label>
        <input type="text" inputmode="decimal" id="pj-pl" value="${p.ritmoAuto ? '' : numToInputMoney(p.plRitmo)}" placeholder="${numToInputMoney(p.ritmoMedio)} (média)">
        <div class="hint">${p.ritmoAuto
          ? (p.ritmoMeses.length ? `Em branco = média do que você tirou em ${listaMeses(p.ritmoMeses)}.` : 'Em branco = 1 salário mínimo.')
          : 'Valor digitado por você. Apague para voltar à média dos últimos meses.'}</div>
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>Quanto você espera faturar por mês</label>
        <input type="text" inputmode="decimal" id="pj-fat" value="${p.fatAuto ? '' : numToInputMoney(p.fatProj)}" placeholder="${numToInputMoney(p.fatMedio)} (média)">
        <div class="hint">${p.fatAuto
          ? (p.mesesMedia ? `Em branco = média dos ${p.mesesMedia} ${p.mesesMedia === 1 ? 'mês' : 'meses'} com faturamento nos últimos 12.` : 'Nenhum faturamento lançado ainda — digite quanto espera faturar.')
          : 'Valor digitado por você. Apague para voltar à média automática.'}</div>
      </div>
      <div class="note">Meses já lançados sempre usam os valores reais — faturamento e pró-labore.</div>
    </div>`;

  if (p.fatProj <= 0 && L.every(l => l.faturamento <= 0)) {
    document.getElementById('content').innerHTML = premissaHTML;
    wireProjecao();
    return;
  }

  /* ---------- 1. o que acontece se continuar como está ---------- */
  const f = p.falhaRitmo;
  const ritmoHTML = `
    <div class="card proj-hero">
      <div class="hero-label">Se continuar tirando</div>
      <div class="proj-value">${fmtBRL(p.plRitmo)}<span>/mês</span></div>
      <div class="proj-sub">${p.ritmoAuto && p.ritmoMeses.length ? `Média do que você tirou em <strong>${listaMeses(p.ritmoMeses)}</strong>.` : 'Valor que você digitou nas premissas.'}${p.temReal ? ' Meses com pró-labore já lançado entram com o valor real.' : ''}</div>
      <div class="proj-status ${f ? 'bad' : 'ok'}">${f
        ? `⚠️ Em <strong>${monthLabel(f.key)}</strong> o Fator R cai para <strong>${fmtPct(f.fatorR)}</strong> — ${monthLabel(f.anexoEm)} vai para o <strong>Anexo V</strong>.`
        : `✅ O Fator R fica em ${metaPct} ou mais em todos os meses até ${monthLabel(ultimo)}.`}</div>
    </div>`;

  /* ---------- 2. o valor fixo que evita os saltos ---------- */
  const abaixoMeta = key => L.filter(l => l[key] < p.meta - 1e-9).length;
  const picoRitmo = Math.max(...L.map(l => l.ritmo));
  const nivelHTML = `
    <div class="card">
      <div class="hero-label">Pró-labore nivelado</div>
      <div class="proj-value">${fmtBRL(p.nivel)}<span>/mês</span></div>
      <div class="proj-sub">Retirando esse valor nos meses em aberto de <strong>${monthLabel(inicioNivel)} a ${monthLabel(ultimo)}</strong>, o Fator R não fica abaixo de ${metaPct} em nenhum mês — e nenhum mês fica pesado.</div>
      ${p.reforcoBase ? `<div class="proj-reforco">⚠️ <strong>${monthLabel(L[0].key)}</strong> precisa de <strong>${fmtBRL(p.reforcoBase)}</strong>: a conta já está abaixo da meta e esse reforço é para o mês que vem não cair no Anexo V.</div>` : ''}
      <table class="audit-tbl proj-cmp">
        <thead><tr><th>R$</th><th>Seu ritmo</th><th>Só o mínimo</th><th>Nivelado</th></tr></thead>
        <tbody>
          <tr><td>Maior mês</td><td>${numToInputMoney(picoRitmo)}</td><td class="${p.picoMinimo > p.picoNivelado + 0.5 ? 'proj-pico' : ''}">${numToInputMoney(p.picoMinimo)}</td><td>${numToInputMoney(p.picoNivelado)}</td></tr>
          <tr><td>12 meses</td><td>${numToInputMoney(p.totalRitmo)}</td><td>${numToInputMoney(p.totalMinimo)}</td><td>${numToInputMoney(p.totalNivelado)}</td></tr>
          <tr><td>Meses &lt; ${metaPct}</td><td class="${abaixoMeta('fatorRRitmo') ? 'proj-ruim' : ''}">${abaixoMeta('fatorRRitmo')}</td><td>${abaixoMeta('fatorRMinimo')}</td><td>${abaixoMeta('fatorRNivelado')}</td></tr>
        </tbody>
      </table>
    </div>`;

  /* ---------- 3. por que o mínimo dá saltos (com o mês real que causa o salto) ---------- */
  const pior = L.reduce((a, l) => (l.minimo > a.minimo ? l : a), L[0]);
  const temSalto = pior.minimo > p.nivel + 0.5;
  const porqueHTML = `
    <div class="card">
      <div class="panel-title" style="margin-bottom:8px;">Por que o mínimo dá saltos?</div>
      <div class="proj-text">O Fator R soma sempre os <strong>últimos 12 meses</strong>. Todo mês entra um mês novo e <strong>sai o mais antigo</strong>. Um pró-labore alto segura a conta por 12 meses — quando ele sai, deixa um buraco quase do mesmo tamanho.</div>
      ${temSalto && pior.sai ? `
        <div class="proj-text">No seu caso: em <strong>${monthLabel(pior.key)}</strong> sai da conta <strong>${monthLabel(pior.sai.key)}</strong>, quando você tirou <span class="n">${fmtBRL(pior.sai.proLabore)}</span>. Quem vai tirando só o mínimo até lá precisa repor de uma vez: <span class="n proj-pico">${fmtBRL(pior.minimo)}</span> naquele mês.</div>
      ` : `
        <div class="proj-text">Nos próximos 12 meses nenhum mês pesado sai da conta — tirar o mínimo não vai dar susto agora. Mesmo assim, ficar perto de ${metaPct} do faturamento de cada mês evita que o salto apareça mais pra frente.</div>
      `}
      <div class="proj-regra">
        <div class="l">Regra de bolso depois desse período</div>
        <div class="v">${metaPct} do faturamento de cada mês <span>≈ ${fmtBRL(p.sustentavel)}/mês</span></div>
      </div>
    </div>`;

  /* ---------- 4. mês a mês, um cenário por vez ---------- */
  const CEN = {
    ritmo: { label: 'Seu ritmo', pl: 'ritmo', fr: 'fatorRRitmo' },
    nivelado: { label: 'Nivelado', pl: 'nivelado', fr: 'fatorRNivelado' },
    minimo: { label: 'Só o mínimo', pl: 'minimo', fr: 'fatorRMinimo' },
  };
  if (!CEN[PROJ_CENARIO]) PROJ_CENARIO = 'ritmo';
  const cen = CEN[PROJ_CENARIO];
  const linhas = L.map(l => {
    const ruim = l[cen.fr] < p.meta - 1e-9;
    const pico = !l.real && l[cen.pl] > p.nivel + 0.5;
    return `
    <tr>
      <td>${monthLabel(l.key)}${l.fatEstimado ? ' *' : ''}
        ${l.sai ? `<div class="proj-sai ${l.sai.proLabore > p.nivel + 0.5 ? 'pesado' : ''}">sai ${monthLabel(l.sai.key)} · ${numToInputMoney(l.sai.proLabore)}</div>` : ''}</td>
      <td class="${pico ? 'proj-pico' : ''}">${numToInputMoney(l[cen.pl])}<div class="proj-fr">${l.real ? '<span class="proj-real">lançado</span>' : 'simulado'}</div></td>
      <td class="${ruim ? 'proj-ruim' : ''}">${fmtPct(l[cen.fr])}<div class="proj-fr">${ruim ? '→ Anexo V' : 'Anexo III'}</div></td>
    </tr>`;
  }).join('');
  const temEstimado = L.some(l => l.fatEstimado);

  /* ---------- 5. a janela real de hoje: o que está na conta e quando sai ---------- */
  const janelaHTML = `
    <div class="card">
      <details class="audit">
        <summary>Seus últimos 12 meses lançados</summary>
        <table class="audit-tbl proj-tbl">
          <thead><tr><th>Mês</th><th>Faturam.</th><th>Pró-labore</th><th>Sai em</th></tr></thead>
          <tbody>${p.janelaReal.map(j => `
            <tr>
              <td>${monthLabel(j.key)}${j.lancado ? '' : ' †'}</td>
              <td>${numToInputMoney(j.faturamento)}</td>
              <td class="${j.proLabore > p.nivel + 0.5 ? 'proj-pico' : j.proLabore === 0 ? 'audit-zero' : ''}">${numToInputMoney(j.proLabore)}</td>
              <td>${monthLabel(j.saiEm)}</td>
            </tr>`).join('')}</tbody>
        </table>
        <div class="note">É isso que a projeção usa como ponto de partida. "Sai em" é o mês em que aquele lançamento deixa a conta de 12 meses — um pró-labore alto (em laranja) faz falta a partir dali.${p.janelaReal.some(j => !j.lancado) ? ' † mês sem lançamento, conta como R$ 0,00.' : ''}</div>
      </details>
    </div>`;

  document.getElementById('content').innerHTML = `
    ${ritmoHTML}
    ${nivelHTML}

    <div class="card">
      <div class="panel-head"><div class="panel-title">Mês a mês</div></div>
      <div class="seg" style="margin-bottom:12px;">
        ${Object.entries(CEN).map(([id, c]) => `<button data-cen="${id}" class="${id === PROJ_CENARIO ? 'on' : ''}">${c.label}</button>`).join('')}
      </div>
      <div class="chart-legend">
        <span class="item"><span class="legend-swatch" id="pj-sw-real"></span>Lançado</span>
        <span class="item"><span class="legend-swatch" id="pj-sw-sim"></span>Simulado</span>
        <span class="item"><span class="legend-swatch" id="pj-sw-fr"></span>Fator R</span>
        <span class="item"><span class="legend-swatch dashed"></span>Meta</span>
      </div>
      <div class="chart-box"><canvas id="chart-projecao"></canvas></div>
      <table class="audit-tbl proj-tbl">
        <thead><tr><th>Mês</th><th>Pró-labore</th><th>Fator R</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="note">Valores em R$. O Fator R de cada linha é o que fica para o mês seguinte. "Sai" é o mês que deixa a conta de 12 meses naquele momento.${temEstimado ? ` * faturamento estimado em ${fmtBRL(p.fatProj)} (mês ainda sem faturamento lançado).` : ''}${PROJ_CENARIO !== 'ritmo' ? ` Nenhum mês simulado fica abaixo de 1 salário mínimo (${fmtBRL(p.piso)}).` : ''}</div>
    </div>

    ${janelaHTML}
    ${porqueHTML}
    ${premissaHTML}

    <div class="note">Projeção para planejamento, usando a mesma regra do PGDAS-D (12 meses anteriores). Confirme sempre com seu contador.</div>
  `;

  wireProjecao();
  document.querySelectorAll('[data-cen]').forEach(b => b.addEventListener('click', () => {
    PROJ_CENARIO = b.dataset.cen;
    renderProjecao();
  }));

  const ctx = document.getElementById('chart-projecao');
  const light = isLightMode();
  const corReal = light ? '#0369A1' : '#38BDF8';
  const corSim = light ? '#7C3AED' : '#A78BFA';
  const corRuim = light ? '#E11D48' : '#FB7185';
  const corFr = light ? '#15803D' : '#34D399';
  document.getElementById('pj-sw-real').style.background = corReal;
  document.getElementById('pj-sw-sim').style.background = corSim;
  document.getElementById('pj-sw-fr').style.background = corFr;
  if (typeof Chart === 'undefined') {
    if (ctx) ctx.parentElement.remove();
    return;
  }
  if (chartRef) chartRef.destroy();
  const tickColor = light ? '#5B5478' : '#6F5FA0';
  const gridColor = light ? 'rgba(40,20,80,0.10)' : '#241A4D';
  const ruim = l => l[cen.fr] < p.meta - 1e-9;
  chartRef = new Chart(ctx, {
    data: {
      labels: L.map(l => monthLabel(l.key)),
      datasets: [
        { type: 'line', label: 'Fator R', yAxisID: 'fr', data: L.map(l => +(l[cen.fr] * 100).toFixed(2)), borderColor: corFr, borderWidth: 2, pointRadius: 3,
          pointBackgroundColor: L.map(l => (ruim(l) ? corRuim : corFr)), pointBorderColor: L.map(l => (ruim(l) ? corRuim : corFr)), tension: .3, fill: false },
        { type: 'line', label: 'Meta', yAxisID: 'fr', data: L.map(() => +(p.meta * 100).toFixed(2)), borderColor: corFr, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
        { type: 'bar', label: 'Pró-labore', yAxisID: 'y', data: L.map(l => +l[cen.pl].toFixed(2)), backgroundColor: L.map(l => hexToRgba(l.real ? corReal : corSim, l.real ? 0.85 : 0.5)), borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => (c.dataset.yAxisID === 'fr' ? `${c.dataset.label}: ${c.parsed.y.toFixed(1).replace('.', ',')}%` : `${c.dataset.label}: ${fmtBRL(c.parsed.y)}`) } } },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, position: 'left', ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 5, callback: v => (v >= 1000 ? (v / 1000).toLocaleString('pt-BR') + 'k' : v) }, grid: { color: gridColor } },
        fr: { beginAtZero: true, position: 'right', ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 5, callback: v => v + '%' }, grid: { display: false } },
      },
    },
  });
}

function wireProjecao() {
  const bindPremissa = (id, field) => document.getElementById(id).addEventListener('change', e => {
    const raw = e.target.value.trim();
    const v = parseBRNumber(raw);
    STATE.params[field] = raw === '' || isNaN(v) ? null : v;
    persist();
    renderProjecao();
  });
  bindPremissa('pj-fat', 'fatProjecao');
  bindPremissa('pj-pl', 'plPretendido');
}

/* ============================== TAB: HISTÓRICO ============================== */
function renderHistorico() {
  setTopbar('Histórico', `${STATE.months.length} ${STATE.months.length === 1 ? 'mês' : 'meses'} registrados`);
  const all = computeAll(STATE);
  const rows = STATE.months.map((m, i) => {
    const c = all[i];
    const badge = m.regime === 'MEI' ? `<span class="badge badge-mei">MEI</span>` :
      `<span class="badge ${c.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${c.anexo}</span>`;
    return `<div class="month-list-item" data-key="${m.key}">
      <div>
        <div class="mk">${monthLabel(m.key)}</div>
        <div class="mv">Faturamento: ${fmtBRL(m.faturamento)}</div>
        ${m.regime === 'ME' ? `<div class="mv dim-small ${m.proLabore === 0 ? 'zero' : ''}">Pró-labore: ${fmtBRL(m.proLabore)}</div>` : ''}
        <div class="mv dim-small ${c.lucroDisponivel < 0 ? 'neg' : ''}">Lucro: ${fmtBRL(c.lucroDisponivel)}</div>
      </div>
      <div class="right">
        ${badge}
        <div class="mv">${m.regime === 'ME' ? fmtPct(c.fatorR) : ''}</div>
      </div>
    </div>`;
  }).reverse().join('');

  document.getElementById('content').innerHTML = `
    <h2 class="section-title">Todos os meses</h2>
    <div class="card tight">${rows || '<div class="empty">Nenhum mês cadastrado ainda. Toque no + para lançar o primeiro.</div>'}</div>
    <div class="note">Toque em um mês para abrir e editar na aba Mês.</div>
  `;
  document.querySelectorAll('.month-list-item').forEach(el => el.addEventListener('click', () => {
    goTo('lancar', el.dataset.key);
  }));
}

/* ============================== BACKUP NO GOOGLE DRIVE (card dos Ajustes) ============================== */
function driveCardHTML() {
  if (typeof driveStatus !== 'function') {
    return `<div class="note" style="margin-top:0;">Backup no Google Drive indisponível (o módulo não carregou).</div>`;
  }
  const st = driveStatus();
  const last = st.lastBackup ? new Date(st.lastBackup).toLocaleString('pt-BR') : null;
  if (!st.enabled) {
    return `
      <div class="note" style="margin-top:0;">Conecte sua conta Google e o app salva automaticamente um arquivo <strong>fator-r-backup.json</strong> no seu Drive alguns segundos depois de cada alteração — meses, despesas e parâmetros.</div>
      <button class="btn btn-primary" id="btn-drive-on">Conectar ao Google Drive</button>
    `;
  }
  return `
    <div class="row"><div class="l">Backup automático</div><div class="v"><span class="badge badge-iii">Ativado</span></div></div>
    <div class="row"><div class="l">Último backup</div><div class="v dim">${st.busy ? 'enviando…' : (last || 'ainda não feito')}</div></div>
    ${st.error ? `<div class="note" style="color:var(--danger);">Última tentativa falhou: ${esc(st.error)} Toque em "Fazer backup agora" para tentar de novo (pode pedir login).</div>` : ''}
    <button class="btn btn-secondary" id="btn-drive-now" ${st.busy ? 'disabled' : ''}>Fazer backup agora</button>
    <button class="btn btn-secondary" id="btn-drive-restore" style="margin-top:8px;">Restaurar do Drive</button>
    <button class="btn btn-ghost" id="btn-drive-off" style="margin-top:8px;">Desativar backup automático</button>
  `;
}

function wireDriveCard() {
  const btnOn = document.getElementById('btn-drive-on');
  if (btnOn) btnOn.addEventListener('click', async () => {
    btnOn.disabled = true;
    try {
      await driveConnect(() => STATE);
    } catch (e) {
      alert('Não foi possível conectar ao Google Drive: ' + e.message);
      btnOn.disabled = false;
    }
    updateDriveCard();
  });

  const btnNow = document.getElementById('btn-drive-now');
  // interactive=true: se a sessão do Google expirou, pode reabrir o login
  if (btnNow) btnNow.addEventListener('click', () => driveRunBackup(() => STATE, true));

  const btnOff = document.getElementById('btn-drive-off');
  if (btnOff) btnOff.addEventListener('click', () => {
    if (!confirm('Desativar o backup automático? O arquivo já salvo continua no seu Drive.')) return;
    driveDisconnect();
    updateDriveCard();
  });

  const btnRestore = document.getElementById('btn-drive-restore');
  if (btnRestore) btnRestore.addEventListener('click', async () => {
    if (!confirm('Substituir os dados DESTE aparelho pelo backup salvo no Drive? Faça isso ao trocar de aparelho ou recuperar dados. Não pode ser desfeito.')) return;
    try {
      const parsed = await driveRestore();
      if (!Array.isArray(parsed.months) || !parsed.params) throw new Error('O arquivo no Drive não parece um backup válido do Fator R.');
      parsed.months.forEach(m => { if (!Array.isArray(m.despesas)) m.despesas = []; });
      delete parsed.loans;
      if (!parsed.empresa) parsed.empresa = { nome: '' };
      sortMonths(parsed.months);
      STATE = parsed;
      ACTIVE_MONTH_KEY = STATE.months[STATE.months.length - 1]?.key || null;
      saveState(STATE);
      backupMsg = 'Backup restaurado do Google Drive.';
      ACTIVE_TAB = 'inicio';
      renderAll();
    } catch (e) {
      alert('Falha ao restaurar: ' + e.message);
    }
  });
}

function updateDriveCard() {
  const box = document.getElementById('drive-card');
  if (!box) return;
  box.innerHTML = driveCardHTML();
  wireDriveCard();
}

/* ============================== TAB: AJUSTES ============================== */
function renderAjustes() {
  setTopbar('Ajustes', 'Empresa, parâmetros e backup');
  const p = STATE.params;
  const years = yearsAvailable(STATE);
  const yearOptions = years.map(y => `<option value="${y}">${y}</option>`).join('');

  document.getElementById('content').innerHTML = `
    <h2 class="section-title">Dados da empresa</h2>
    <div class="card">
      <div class="field"><label>Nome da empresa</label><input type="text" id="e-nome" value="${esc(STATE.empresa?.nome || '')}" placeholder="Ex: Sua Empresa LTDA"></div>
      <div class="field"><label>CNPJ</label><input type="text" inputmode="numeric" id="e-cnpj" value="${esc(formatCNPJ(STATE.empresa?.cnpj || ''))}" placeholder="00.000.000/0000-00" maxlength="18"></div>
    </div>

    <h2 class="section-title">Parâmetros gerais</h2>
    <div class="card">
      <div class="field"><label>Salário mínimo nacional</label><input type="text" inputmode="decimal" id="p-sal" value="${numToInputMoney(p.salarioMinimo)}" placeholder="20,00"></div>
      <div class="field"><label>Teto do INSS</label><input type="text" inputmode="decimal" id="p-teto" value="${numToInputMoney(p.tetoInss)}" placeholder="20,00"></div>
      <div class="field"><label>Alíquota INSS sobre pró-labore (%)</label><input type="text" inputmode="decimal" id="p-aliqinss" value="${numToInput(parseFloat((p.aliqInss * 100).toFixed(2)))}" placeholder="20,00"></div>
      <div class="field"><label>Meta do Fator R (%)</label><input type="text" inputmode="decimal" id="p-meta" value="${numToInput(parseFloat((p.fatorRMeta * 100).toFixed(2)))}" placeholder="20,00"></div>
      <div class="field">
        <label>Atividade do MEI (preenche o DAS-MEI padrão)</label>
        <select id="p-atividade-mei">
          <option value="" ${!p.atividadeMei ? 'selected' : ''}>— selecionar —</option>
          <option value="comercio" ${p.atividadeMei === 'comercio' ? 'selected' : ''}>Comércio / Indústria (R$82,05)</option>
          <option value="servico" ${p.atividadeMei === 'servico' ? 'selected' : ''}>Serviço (R$86,05)</option>
          <option value="misto" ${p.atividadeMei === 'misto' ? 'selected' : ''}>Comércio e Serviço (R$87,05)</option>
        </select>
      </div>
      <div class="field"><label>DAS-MEI fixo</label><input type="text" inputmode="decimal" id="p-dasmei" value="${numToInputMoney(p.dasMei)}" placeholder="20,00"></div>
      <div class="note" style="margin-top:0;">Honorários contábeis não são mais um valor fixo aqui — lance-os como despesa (categoria "Contabilidade") sempre que pagar, assim o valor acompanha quando o preço do seu contador mudar.</div>
    </div>

    <h2 class="section-title">Fechamento anual</h2>
    <div class="card">
      <div class="note" style="margin-top:0;">Exporte uma planilha (.csv) com todos os meses de um ano — faturamento, pró-labore, DAS, INSS, despesas, lucro e Fator R já calculados. Boa pra guardar no fim do ano ou mandar pro contador.</div>
      ${years.length ? `
        <div class="field"><label>Ano</label><select id="sel-ano-export">${yearOptions}</select></div>
        <button class="btn btn-secondary" id="btn-export-csv">Exportar ano (.csv)</button>
      ` : `<div class="note">Lance pelo menos um mês para poder exportar.</div>`}
    </div>

    <h2 class="section-title">Backup automático no Google Drive</h2>
    <div class="card" id="drive-card">${driveCardHTML()}</div>

    <h2 class="section-title">Backup de dados</h2>
    <div class="card">
      <div class="note" style="margin-top:0;">Seus dados ficam salvos só neste navegador. Exporte um backup de vez em quando para não perder nada se limpar o cache ou trocar de aparelho.</div>
      <button class="btn btn-secondary" id="btn-export">Exportar backup completo (.json)</button>
      <label class="btn btn-ghost" for="file-import" style="display:block;text-align:center;margin-top:8px;">Importar backup</label>
      <input type="file" id="file-import" accept="application/json" style="display:none;">
      ${backupMsg ? `<div class="note" style="color:var(--primary);">${esc(backupMsg)}</div>` : ''}
    </div>

    <h2 class="section-title">Zona de risco</h2>
    <div class="card">
      <button class="btn btn-danger" id="btn-clear">Apagar todos os dados</button>
      <div class="note">Remove todos os meses e despesas lançados e recomeça do zero. Não pode ser desfeito — exporte um backup antes, se quiser guardar algo.</div>
    </div>
  `;

  document.getElementById('e-nome').addEventListener('change', e => {
    STATE.empresa = STATE.empresa || {};
    STATE.empresa.nome = e.target.value;
    persist();
  });

  const cnpjEl = document.getElementById('e-cnpj');
  cnpjEl.addEventListener('input', e => {
    const pos = e.target.selectionStart;
    const before = e.target.value.length;
    e.target.value = formatCNPJ(e.target.value);
    const diff = e.target.value.length - before;
    e.target.setSelectionRange(pos + diff, pos + diff);
  });
  cnpjEl.addEventListener('change', e => {
    STATE.empresa = STATE.empresa || {};
    STATE.empresa.cnpj = formatCNPJ(e.target.value);
    persist();
  });

  // kind: 'money' = reais (reformata com 2 decimais ao salvar) • 'pct' = percentual
  const bindParam = (id, field, kind) => document.getElementById(id).addEventListener('change', e => {
    const v = parseBRNumber(e.target.value) || 0;
    p[field] = kind === 'pct' ? v / 100 : v;
    if (kind === 'money') e.target.value = numToInputMoney(v);
    persist();
  });
  bindParam('p-sal', 'salarioMinimo', 'money');
  bindParam('p-teto', 'tetoInss', 'money');
  bindParam('p-aliqinss', 'aliqInss', 'pct');
  bindParam('p-meta', 'fatorRMeta', 'pct');
  bindParam('p-dasmei', 'dasMei', 'money');

  document.getElementById('p-atividade-mei').addEventListener('change', e => {
    p.atividadeMei = e.target.value;
    const v = DAS_MEI_POR_ATIVIDADE[e.target.value];
    if (v) p.dasMei = v;
    persist(); renderAjustes();
  });

  const btnCsv = document.getElementById('btn-export-csv');
  if (btnCsv) btnCsv.addEventListener('click', () => {
    const year = document.getElementById('sel-ano-export').value;
    exportYearCSV(STATE, year);
  });

  wireDriveCard();

  document.getElementById('btn-export').addEventListener('click', () => exportBackup(STATE));
  document.getElementById('file-import').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    importBackup(file, (parsed) => {
      STATE = parsed;
      ACTIVE_MONTH_KEY = STATE.months[STATE.months.length - 1]?.key || null;
      backupMsg = 'Backup importado com sucesso.';
      persist();
      ACTIVE_TAB = 'inicio';
      renderAll();
    }, (err) => {
      backupMsg = 'Erro ao importar: ' + err.message;
      renderAjustes();
    });
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Apagar TODOS os dados lançados e recomeçar do zero? Isso não pode ser desfeito.')) return;
    STATE = defaultState();
    ACTIVE_MONTH_KEY = STATE.months[STATE.months.length - 1].key;
    persist(); ACTIVE_TAB = 'inicio'; renderAll();
  });
}

/* ============================== ROTEADOR ============================== */
function renderAll() {
  renderTabbar();
  if (ACTIVE_TAB === 'inicio') renderInicio();
  else if (ACTIVE_TAB === 'lancar') renderLancar();
  else if (ACTIVE_TAB === 'projecao') renderProjecao();
  else if (ACTIVE_TAB === 'historico') renderHistorico();
  else if (ACTIVE_TAB === 'ajustes') renderAjustes();
}

(function init() {
  STATE = loadState();
  ACTIVE_MONTH_KEY = STATE.months[STATE.months.length - 1]?.key || null;
  renderAll();
  document.getElementById('fab-add').addEventListener('click', openAddMenu);
  // atualiza o card do Drive quando um backup começa/termina/falha
  document.addEventListener('drive-status', () => { if (ACTIVE_TAB === 'ajustes') updateDriveCard(); });
  // se acabou de voltar do login do Google (fluxo redirect do PWA), já faz o 1º backup
  if (typeof driveAfterInit === 'function') driveAfterInit(() => STATE);
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => renderAll());
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // updateViaCache: 'none' garante que o sw.js nunca venha do cache HTTP
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
        reg.update().catch(() => {});
        // PWA aberto pela tela inicial costuma só "resumir" da memória, sem novo load;
        // checa atualização sempre que o app volta a ficar visível
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      }).catch(() => {});
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
})();

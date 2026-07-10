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

/* Sheet pra escolher o mês do resumo (substitui o antigo <select> no topo da Home) */
function openMonthPickerSheet() {
  const all = computeAll(STATE);
  const items = STATE.months.map((mm, i) => {
    const right = mm.regime === 'MEI'
      ? '<span class="chip">MEI</span>'
      : `${fmtPct(all[i].fatorR)} <span class="badge ${all[i].anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${all[i].anexo}</span>`;
    return `<button class="mp-item ${mm.key === INICIO_MONTH_KEY ? 'sel' : ''}" data-mk="${mm.key}">
      <span>${monthLabel(mm.key)}</span><span class="r">${right}</span>
    </button>`;
  }).reverse().join('');
  openSheet(`
    <div class="sheet-title">Ver resumo de qual mês?</div>
    <div class="mp-list">${items}</div>
    <button class="btn btn-ghost sheet-action" id="sheet-cancelar">Cancelar</button>
  `);
  document.getElementById('sheet-cancelar').addEventListener('click', closeSheet);
  document.querySelectorAll('.mp-item').forEach(el => el.addEventListener('click', () => {
    INICIO_MONTH_KEY = el.dataset.mk;
    ACTIVE_MONTH_KEY = el.dataset.mk;
    closeSheet();
    renderInicio();
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
          <div class="hero-label">Fator R</div>
          <div class="hero-value">${fmtPct(selC.fatorR)}</div>
          <span class="badge ${selC.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${selC.anexo}</span>
        </div>
        <div class="hero-gauge">
          ${heroGaugeSVG(selC.fatorR, STATE.params.fatorRMeta, selC.anexo)}
          <div class="hero-status ${dentro ? 'ok' : 'bad'}">${dentro ? 'Dentro da meta ✅' : 'Abaixo da meta ⚠️'}</div>
        </div>
      </div>
    </div>` : `
    <div class="card hero" style="text-align:center;">
      <div class="hero-label">Fator R</div>
      <div style="padding:14px 0 4px;"><span class="badge badge-mei">MEI — sem Fator R</span></div>
    </div>`;

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
  const loansTotal = loansTotalAtivo(STATE.loans, m.key);
  const c = computeMonth(STATE.months, idx, STATE.params, loansTotal);
  const proj = m.regime === 'ME' ? projectNextMonth(STATE.months, idx, STATE.params) : null;

  setTopbar('Mês', monthLabelExt(m.key));

  const options = STATE.months.map(mm => `<option value="${mm.key}" ${mm.key === m.key ? 'selected' : ''}>${monthLabel(mm.key)} ${mm.regime === 'MEI' ? '(MEI)' : ''}</option>`).join('');

  document.getElementById('content').innerHTML = `
    <h2 class="section-title">Selecionar mês</h2>
    <div class="card tight">
      <select id="sel-month">${options}</select>
    </div>

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
        <input type="text" inputmode="decimal" id="f-fat" value="${numToInputMoneyBlankZero(m.faturamento)}" placeholder="20,00">
      </div>
      ${m.regime === 'ME' ? `
        <div class="field">
          <label>Pró-labore retirado</label>
          <input type="text" inputmode="decimal" id="f-pl" value="${numToInputMoneyBlankZero(m.proLabore)}" placeholder="20,00">
          <div class="hint ${proj && proj.folga < -0.005 ? 'hint-danger' : 'hint-ok'}">
            ${proj ? `Mínimo p/ manter Anexo III no mês que vem: <strong>${fmtBRL(proj.proLaboreMinimo)}</strong>${proj.folga < -0.005 ? ` — faltam <strong>${fmtBRL(-proj.folga)}</strong>` : ''}` : ''}
          </div>
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
      <div class="row"><div class="l">Parcela(s) de empréstimo</div><div class="v dim">${fmtBRL(loansTotal)}</div></div>
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

  document.getElementById('sel-month').addEventListener('change', e => { ACTIVE_MONTH_KEY = e.target.value; INICIO_MONTH_KEY = e.target.value; renderLancar(); });
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
        <div class="mv">${fmtBRL(m.faturamento)}</div>
        ${c.despesasMes ? `<div class="mv dim-small">Despesas: ${fmtBRL(c.despesasMes)}</div>` : ''}
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
      <div class="note" style="margin-top:0;">Conecte sua conta Google e o app salva automaticamente um arquivo <strong>fator-r-backup.json</strong> no seu Drive alguns segundos depois de cada alteração — meses, despesas, empréstimos e parâmetros.</div>
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
      if (!Array.isArray(parsed.loans)) parsed.loans = [];
      if (!parsed.empresa) parsed.empresa = { nome: '' };
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

    <h2 class="section-title">Empréstimos</h2>
    <div id="loans-list">
      ${STATE.loans.map(l => {
        const restantes = Math.max((l.nParcelas || 0) - (l.parcelasPagas || 0), 0);
        const saldo = restantes * (l.valorParcela || 0);
        return `<div class="loan-card" data-id="${l.id}">
          <div class="top"><span class="name">${esc(l.nome) || 'Empréstimo'}</span><button class="x-btn" data-del="${l.id}">✕</button></div>
          <div class="field"><label>Nome</label><input type="text" data-loan="${l.id}" data-field="nome" value="${esc(l.nome)}"></div>
          <div class="two-col">
            <div class="field"><label>Nº parcelas</label><input type="number" step="1" data-loan="${l.id}" data-field="nParcelas" value="${l.nParcelas || 0}"></div>
            <div class="field"><label>Valor da parcela</label><input type="text" inputmode="decimal" data-loan="${l.id}" data-field="valorParcela" value="${numToInputMoneyBlankZero(l.valorParcela)}" placeholder="20,00"></div>
          </div>
          <div class="two-col">
            <div class="field"><label>Parcelas pagas</label><input type="number" step="1" data-loan="${l.id}" data-field="parcelasPagas" value="${l.parcelasPagas || 0}"></div>
            <div class="field"><label>Mês de início</label><input type="month" data-loan="${l.id}" data-field="mesInicio" value="${l.mesInicio || ''}"></div>
          </div>
          <div class="row"><div class="l">Saldo devedor estimado</div><div class="v dim">${fmtBRL(saldo)} (${restantes} restantes)</div></div>
        </div>`;
      }).join('') || '<div class="card empty">Nenhum empréstimo cadastrado.</div>'}
    </div>
    <button class="btn btn-ghost" id="btn-add-loan">+ Adicionar empréstimo</button>

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
      <div class="note">Remove todos os meses, despesas e empréstimos lançados e recomeça do zero. Não pode ser desfeito — exporte um backup antes, se quiser guardar algo.</div>
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

  document.querySelectorAll('[data-loan]').forEach(el => el.addEventListener('change', () => {
    const loan = STATE.loans.find(l => l.id === el.dataset.loan);
    const f = el.dataset.field;
    if (f === 'nome' || f === 'mesInicio') loan[f] = el.value;
    else if (f === 'nParcelas' || f === 'parcelasPagas') loan[f] = parseInt(el.value, 10) || 0;
    else { loan[f] = parseBRNumber(el.value) || 0; el.value = numToInputMoneyBlankZero(loan[f]); }
    persist();
  }));
  document.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', () => {
    STATE.loans = STATE.loans.filter(l => l.id !== el.dataset.del);
    persist(); renderAjustes();
  }));
  document.getElementById('btn-add-loan').addEventListener('click', () => {
    STATE.loans.push({ id: 'l' + Date.now(), nome: 'Novo empréstimo', valorContratado: 0, nParcelas: 1, valorParcela: 0, parcelasPagas: 0, mesInicio: '' });
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

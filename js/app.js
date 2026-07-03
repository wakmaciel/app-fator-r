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

function setTopbar(title, sub) {
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-sub').textContent = sub;
}

function goTo(tab, monthKey) {
  ACTIVE_TAB = tab;
  if (monthKey) ACTIVE_MONTH_KEY = monthKey;
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
  setTopbar('Fator R', `${nomeEmpresa}Painel • ${monthLabelExt(sel.key)}`);

  const isME = sel.regime === 'ME';
  let alertHTML = '';
  if (isME) {
    const proj = projectNextMonth(STATE.months, selIdx, STATE.params);
    const metaPct = fmtPct(STATE.params.fatorRMeta);
    let variant, titulo, msg, showBadges = true;
    if (proj.sf <= 0) {
      variant = 'info';
      titulo = '📋 Sem faturamento lançado ainda';
      msg = `Lance o faturamento e o pró-labore deste mês para ver a projeção do Fator R e quanto retirar para continuar no Anexo III.`;
      showBadges = false;
    } else if (proj.folga < -0.005) {
      variant = 'danger';
      titulo = '⚠️ Risco de cair no Anexo V';
      msg = `Você lançou <strong>${fmtBRL(proj.proLaboreMes)}</strong> de pró-labore neste mês, mas o mínimo para manter o Fator R ≥ ${metaPct} é <strong>${fmtBRL(proj.proLaboreMinimo)}</strong> — faltam <strong>${fmtBRL(-proj.folga)}</strong>. Sem esse ajuste, o mês que vem cai no Anexo V.`;
    } else if (proj.folga < 0.01) {
      variant = 'success';
      titulo = '✅ No ponto certo';
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
      titulo = '✅ Dentro da meta — com sobra';
      msg = `O mínimo de pró-labore para manter o Anexo III no mês que vem é <strong>${fmtBRL(proj.proLaboreMinimo)}</strong>. Você lançou <strong>${fmtBRL(proj.proLaboreMes)}</strong> neste mês — <strong>${fmtBRL(proj.excedenteMes)}</strong> acima do mínimo.` +
        (reduzivel > 0.005
          ? ` Se quiser pagar menos INSS, até <strong>${fmtBRL(reduzivel)}</strong> dessa sobra pode virar lucro distribuído (mantendo pelo menos 1 salário mínimo de pró-labore) — economia estimada de <strong>${fmtBRL(economiaInss)}</strong> de INSS.`
          : '');
    }
    alertHTML = `
    <div class="alert alert-${variant}">
      <div class="alert-title">${titulo}</div>
      <div class="alert-body">${msg}</div>
      ${showBadges ? `
      <div class="alert-rows">
        <div class="row"><div class="l">Anexo vigente neste mês (usado no DAS)</div><div class="v"><span class="badge ${selC.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${selC.anexo}</span></div></div>
        <div class="row"><div class="l">Projeção para o mês que vem</div><div class="v"><span class="badge ${proj.anexoProjetado === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${proj.anexoProjetado}</span></div></div>
      </div>` : ''}
      <button class="btn btn-secondary" id="btn-ir-lancar">Ajustar pró-labore deste mês →</button>
    </div>`;
  } else {
    alertHTML = `
    <div class="alert alert-info">
      <div class="alert-title">📌 Você está como MEI</div>
      <div class="alert-body">Enquanto MEI não existe Fator R nem Anexo III/V — só o DAS-MEI fixo. Quando migrar para ME, troque o regime do mês na aba Mês: a partir dali o pró-labore passa a contar para o Fator R.</div>
    </div>`;
  }

  const monthOptions = STATE.months.slice().reverse().map(mm => `<option value="${mm.key}" ${mm.key === sel.key ? 'selected' : ''}>${monthLabel(mm.key)} ${mm.regime === 'MEI' ? '(MEI)' : ''}</option>`).join('');

  document.getElementById('content').innerHTML = `
    <h2 class="section-title">Resumo de ${year}</h2>
    <div class="card tight">
      <select id="sel-month-inicio">${monthOptions}</select>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Faturamento</div><div class="value chart-revenue">${fmtBRL(totFat)}</div></div>
      <div class="kpi"><div class="label">Pró-labore</div><div class="value">${fmtBRL(totPL)}</div></div>
      <div class="kpi"><div class="label">Lucro distribuído</div><div class="value success">${fmtBRL(totLucro)}</div></div>
      <div class="kpi"><div class="label">Impostos + despesas</div><div class="value danger">${fmtBRL(totImp)}</div></div>
    </div>

    ${alertHTML}

    <h2 class="section-title">Fator R — ${monthLabel(sel.key)}</h2>
    <div class="card" style="text-align:center;">
      ${isME ? `
        <div id="gauge-wrap">
          ${gaugeSVG(selC.fatorR, STATE.params.fatorRMeta, selC.anexo)}
          <div class="gauge-pct">${fmtPct(selC.fatorR)}</div>
          <div class="gauge-sub">
            <span class="badge ${selC.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${selC.anexo}</span>
          </div>
        </div>
      ` : `
        <div style="padding:18px 0;">
          <span class="badge badge-mei">MEI — sem Fator R</span>
        </div>
      `}
    </div>

    <h2 class="section-title">Faturamento × Lucro disponível</h2>
    <div class="card">
      <canvas id="chart-inicio" height="170"></canvas>
    </div>

    <div class="note">Cálculos de Fator R, RBT12 e DAS seguem a metodologia oficial do PGDAS-D. Confirme sempre os valores de imposto com seu contador.</div>
  `;

  document.getElementById('sel-month-inicio').addEventListener('change', e => {
    INICIO_MONTH_KEY = e.target.value;
    renderInicio();
  });

  const btnLancar = document.getElementById('btn-ir-lancar');
  if (btnLancar) btnLancar.addEventListener('click', () => goTo('lancar', sel.key));

  const N = Math.min(8, selIdx + 1);
  const slice = STATE.months.slice(0, selIdx + 1).slice(-N);
  const sliceC = all.slice(0, selIdx + 1).slice(-N);
  const ctx = document.getElementById('chart-inicio');
  if (typeof Chart === 'undefined') {
    if (ctx) ctx.replaceWith(Object.assign(document.createElement('div'), {
      className: 'note',
      textContent: 'Não foi possível carregar a biblioteca de gráficos (Chart.js) — verifique sua conexão. O resto do app funciona normalmente.',
    }));
    return;
  }
  if (chartRef) chartRef.destroy();
  const light = isLightMode();
  const revenueColor = light ? '#0369A1' : '#38BDF8';
  const revenueFill = light ? 'rgba(3,105,161,0.10)' : 'rgba(56,189,248,0.12)';
  const profitColor = light ? '#15803D' : '#34D399';
  const profitFill = light ? 'rgba(21,128,61,0.10)' : 'rgba(52,211,153,0.12)';
  const tickColor = light ? '#5B5478' : '#6F5FA0';
  const legendColor = light ? '#5B5478' : '#B0A0DE';
  const gridColor = light ? 'rgba(40,20,80,0.10)' : '#241A4D';
  chartRef = new Chart(ctx, {
    type: 'line',
    data: {
      labels: slice.map(m => monthLabel(m.key)),
      datasets: [
        { label: 'Faturamento', data: sliceC.map((c, i) => slice[i].faturamento), borderColor: revenueColor, backgroundColor: revenueFill, fill: true, tension: .3, pointRadius: 3 },
        { label: 'Lucro disp.', data: sliceC.map(c => c.lucroDisponivel), borderColor: profitColor, backgroundColor: profitFill, fill: true, tension: .3, pointRadius: 3 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: legendColor, font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } }
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

  document.getElementById('sel-month').addEventListener('change', e => { ACTIVE_MONTH_KEY = e.target.value; renderLancar(); });
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
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
})();

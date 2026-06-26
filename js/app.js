/* ==========================================================================
   app.js — Interface e roteamento das abas
   Depende de calc.js e storage.js (carregados antes deste arquivo no HTML).
   ========================================================================== */

let STATE = defaultState();
let ACTIVE_TAB = 'inicio';
let ACTIVE_MONTH_KEY = null; // compartilhada entre as abas Lançar e Despesas
let chartRef = null;
let backupMsg = '';

function persist() { saveState(STATE); }

function ensureActiveMonth() {
  if (!STATE.months.find(m => m.key === ACTIVE_MONTH_KEY)) {
    ACTIVE_MONTH_KEY = STATE.months[STATE.months.length - 1].key;
  }
}

/* ============================== TABS / NAV ============================== */
const TABS = [
  { id: 'inicio', label: 'Início', icon: '<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9"/>' },
  { id: 'lancar', label: 'Lançar', icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>' },
  { id: 'despesas', label: 'Despesas', icon: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6"/>' },
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

/* ============================== TAB: INÍCIO ============================== */
function renderInicio() {
  ensureActiveMonth();
  const all = computeAll(STATE);
  const lastIdx = STATE.months.length - 1;
  const last = STATE.months[lastIdx];
  const lastC = all[lastIdx];

  const year = last.key.slice(0, 4);
  const yearIdxs = STATE.months.map((m, i) => i).filter(i => STATE.months[i].key.slice(0, 4) === year);
  const sum = f => yearIdxs.reduce((s, i) => s + f(STATE.months[i], all[i]), 0);
  const totFat = sum(m => m.faturamento);
  const totPL = sum(m => m.proLabore);
  const totLucro = sum((m, c) => c.lucroDistribuido);
  const totImp = sum((m, c) => c.dasUsado + c.inss + c.contador + c.despesasMes);

  const nomeEmpresa = STATE.empresa?.nome ? STATE.empresa.nome + ' • ' : '';
  setTopbar('Fator R', `${nomeEmpresa}Painel • ${monthLabelExt(last.key)}`);

  const isME = last.regime === 'ME';
  let alertHTML = '';
  if (isME) {
    const proj = projectNextMonth(STATE.months, lastIdx, STATE.params);
    const margemPP = proj.fatorR - STATE.params.fatorRMeta;
    let variant = 'success', titulo = '✅ Tranquilo por enquanto', msg = '';
    if (proj.folga < 0) {
      variant = 'danger';
      titulo = '⚠️ Risco de cair no Anexo V';
      msg = `Faltam <strong>${fmtBRL(-proj.folga)}</strong> de pró-labore neste mês para manter o Fator R ≥ 28% e seguir no Anexo III no mês que vem. Mínimo recomendado este mês: <strong>${fmtBRL(proj.proLaboreMinimo)}</strong>.`;
    } else if (margemPP < 0.03) {
      variant = 'warning';
      titulo = '🟡 Margem pequena';
      msg = `Você está dentro da meta, mas com folga de apenas <strong>${fmtBRL(proj.folga)}</strong>. Evite reduzir o pró-labore nos próximos meses para não cair no Anexo V.`;
    } else {
      msg = `Fator R projetado em <strong>${fmtPct(proj.fatorR)}</strong>, com folga de <strong>${fmtBRL(proj.folga)}</strong> acima do mínimo necessário para continuar no Anexo III no mês que vem.`;
    }
    alertHTML = `
    <div class="alert alert-${variant}">
      <div class="alert-title">${titulo}</div>
      <div class="alert-body">${msg}</div>
      <div class="alert-rows">
        <div class="row"><div class="l">Anexo vigente neste mês (usado no DAS)</div><div class="v"><span class="badge ${lastC.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${lastC.anexo}</span></div></div>
        <div class="row"><div class="l">Projeção para o mês que vem</div><div class="v"><span class="badge ${proj.anexoProjetado === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${proj.anexoProjetado}</span></div></div>
      </div>
      <button class="btn btn-secondary" id="btn-ir-lancar">Ajustar pró-labore deste mês →</button>
    </div>`;
  } else {
    alertHTML = `
    <div class="alert alert-info">
      <div class="alert-title">📌 Você está como MEI</div>
      <div class="alert-body">Enquanto MEI não existe Fator R nem Anexo III/V — só o DAS-MEI fixo. Quando migrar para ME, lembre-se de trocar o regime do mês na aba Lançar: a partir dali o pró-labore passa a contar para o Fator R.</div>
    </div>`;
  }

  document.getElementById('content').innerHTML = `
    <h2 class="section-title">Resumo de ${year}</h2>
    <div class="kpi-grid">
      <div class="kpi"><div class="label">Faturamento</div><div class="value">${fmtBRL(totFat)}</div></div>
      <div class="kpi"><div class="label">Pró-labore</div><div class="value">${fmtBRL(totPL)}</div></div>
      <div class="kpi"><div class="label">Lucro distribuído</div><div class="value primary">${fmtBRL(totLucro)}</div></div>
      <div class="kpi"><div class="label">Impostos + despesas</div><div class="value danger">${fmtBRL(totImp)}</div></div>
    </div>

    ${alertHTML}

    <h2 class="section-title">Fator R — ${monthLabel(last.key)}</h2>
    <div class="card" style="text-align:center;">
      ${isME ? `
        <div id="gauge-wrap">
          ${gaugeSVG(lastC.fatorR, STATE.params.fatorRMeta, lastC.anexo)}
          <div class="gauge-pct">${fmtPct(lastC.fatorR)}</div>
          <div class="gauge-sub">
            <span class="badge ${lastC.anexo === 'III' ? 'badge-iii' : 'badge-v'}">Anexo ${lastC.anexo}</span>
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

  const btnLancar = document.getElementById('btn-ir-lancar');
  if (btnLancar) btnLancar.addEventListener('click', () => goTo('lancar', last.key));

  const N = Math.min(8, STATE.months.length);
  const slice = STATE.months.slice(-N);
  const sliceC = all.slice(-N);
  const ctx = document.getElementById('chart-inicio');
  if (typeof Chart === 'undefined') {
    if (ctx) ctx.replaceWith(Object.assign(document.createElement('div'), {
      className: 'note',
      textContent: 'Não foi possível carregar a biblioteca de gráficos (Chart.js) — verifique sua conexão. O resto do app funciona normalmente.',
    }));
    return;
  }
  if (chartRef) chartRef.destroy();
  chartRef = new Chart(ctx, {
    type: 'line',
    data: {
      labels: slice.map(m => monthLabel(m.key)),
      datasets: [
        { label: 'Faturamento', data: sliceC.map((c, i) => slice[i].faturamento), borderColor: '#9C8CF5', backgroundColor: 'transparent', tension: .3, pointRadius: 3 },
        { label: 'Lucro disp.', data: sliceC.map(c => c.lucroDisponivel), borderColor: '#A78BFA', backgroundColor: 'transparent', tension: .3, pointRadius: 3 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#B0A0DE', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#6F5FA0', font: { size: 10 } }, grid: { color: '#241A4D' } },
        y: { ticks: { color: '#6F5FA0', font: { size: 10 } }, grid: { color: '#241A4D' } }
      }
    }
  });
}

/* ============================== TAB: LANÇAR ============================== */
function renderLancar() {
  ensureActiveMonth();
  const idx = STATE.months.findIndex(m => m.key === ACTIVE_MONTH_KEY);
  const m = STATE.months[idx];
  const loansTotal = loansTotalAtivo(STATE.loans, m.key);
  const c = computeMonth(STATE.months, idx, STATE.params, loansTotal);
  const proj = m.regime === 'ME' ? projectNextMonth(STATE.months, idx, STATE.params) : null;
  const isLast = idx === STATE.months.length - 1;
  const despMes = despesasTotal(m);

  setTopbar('Lançar mês', monthLabelExt(m.key));

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
        <input type="number" inputmode="decimal" id="f-fat" value="${m.faturamento}">
      </div>
      ${m.regime === 'ME' ? `
        <div class="field">
          <label>Pró-labore retirado</label>
          <input type="number" inputmode="decimal" id="f-pl" value="${m.proLabore}">
          <div class="hint ${proj && proj.folga < 0 ? 'hint-danger' : 'hint-ok'}">
            ${proj ? `Mínimo p/ manter Anexo III no mês que vem: <strong>${fmtBRL(proj.proLaboreMinimo)}</strong>` : ''}
          </div>
        </div>
        <div class="field">
          <label>DAS informado pelo contador (em branco = usar estimativa)</label>
          <input type="number" inputmode="decimal" id="f-das" value="${m.dasPago ?? ''}" placeholder="${fmtBRL(c.dasEstimado)} (estimado)">
        </div>
      ` : `
        <div class="field">
          <label>DAS-MEI pago (em branco = usar o valor padrão)</label>
          <input type="number" inputmode="decimal" id="f-das" value="${m.dasPago ?? ''}" placeholder="${fmtBRL(STATE.params.dasMei)} (padrão)">
        </div>
      `}
      <div class="row clickable" id="row-despesas">
        <div class="l">Despesas lançadas este mês (${(m.despesas || []).length} ${(m.despesas || []).length === 1 ? 'item' : 'itens'})</div>
        <div class="v">${fmtBRL(despMes)} ›</div>
      </div>
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
      <div class="row"><div class="l">Honorários contábeis</div><div class="v dim">${fmtBRL(c.contador)}</div></div>
      <div class="row"><div class="l">Parcela(s) de empréstimo</div><div class="v dim">${fmtBRL(loansTotal)}</div></div>
      <div class="row"><div class="l">Despesas</div><div class="v dim">${fmtBRL(despMes)}</div></div>
      <div class="divider"></div>
      <div class="row big"><div class="l">Total de saídas</div><div class="v">${fmtBRL(c.totalSaida)}</div></div>
      <div class="row big"><div class="l">Lucro disponível</div><div class="v ${c.lucroDisponivel < 0 ? 'danger' : 'primary'}">${fmtBRL(c.lucroDisponivel)}</div></div>
    </div>

    <h2 class="section-title">Distribuição de lucro</h2>
    <div class="card">
      <div class="field">
        <label>Lucro distribuído este mês (em branco = distribuir tudo)</label>
        <input type="number" inputmode="decimal" id="f-dist" value="${m.lucroDistribuidoOverride ?? ''}" placeholder="${fmtBRL(Math.max(c.lucroDisponivel, 0))} (automático)">
      </div>
      <div class="row"><div class="l">Saldo retido em caixa</div><div class="v">${fmtBRL(c.saldoCaixa)}</div></div>
    </div>

    ${isLast ? `<button class="btn btn-secondary" id="btn-next-month">+ Adicionar ${monthLabel(nextKey(m.key))}</button>` : ''}
  `;

  document.getElementById('sel-month').addEventListener('change', e => { ACTIVE_MONTH_KEY = e.target.value; renderLancar(); });
  document.querySelectorAll('[data-regime]').forEach(b => b.addEventListener('click', () => {
    m.regime = b.dataset.regime;
    if (m.regime === 'MEI') m.proLabore = 0;
    persist(); renderLancar();
  }));

  const rowDesp = document.getElementById('row-despesas');
  if (rowDesp) rowDesp.addEventListener('click', () => goTo('despesas', m.key));

  const bindNum = (id, field, allowNull) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const raw = el.value;
      if (allowNull && raw === '') { m[field] = null; }
      else { m[field] = raw === '' ? 0 : parseFloat(raw); }
      persist();
      renderLancar();
    });
  };
  bindNum('f-fat', 'faturamento', false);
  bindNum('f-pl', 'proLabore', false);
  bindNum('f-das', 'dasPago', true);
  bindNum('f-dist', 'lucroDistribuidoOverride', true);

  const nextBtn = document.getElementById('btn-next-month');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const nk = nextKey(m.key);
    const newMonth = mkMonth(nk, m.regime, 0, 0);
    STATE.months.push(newMonth);
    ACTIVE_MONTH_KEY = nk;
    persist();
    renderLancar();
  });
}

/* ============================== TAB: DESPESAS ============================== */
function renderDespesas() {
  ensureActiveMonth();
  const idx = STATE.months.findIndex(m => m.key === ACTIVE_MONTH_KEY);
  const m = STATE.months[idx];
  const total = despesasTotal(m);

  setTopbar('Despesas', monthLabelExt(m.key));

  const options = STATE.months.map(mm => `<option value="${mm.key}" ${mm.key === m.key ? 'selected' : ''}>${monthLabel(mm.key)}</option>`).join('');

  const porCategoria = {};
  (m.despesas || []).forEach(d => { porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + (Number(d.valor) || 0); });
  const catRows = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([catId, valor]) => {
    const label = (CATEGORIAS_DESPESA.find(c => c.id === catId) || { label: catId }).label;
    const pct = total ? (valor / total) * 100 : 0;
    return `<div class="cat-row">
      <div class="cat-row-top"><span>${esc(label)}</span><span>${fmtBRL(valor)}</span></div>
      <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
    </div>`;
  }).join('');

  const itemRows = (m.despesas || []).slice().reverse().map(d => {
    const label = (CATEGORIAS_DESPESA.find(c => c.id === d.categoria) || { label: 'Outros' }).label;
    return `<div class="expense-row" data-id="${d.id}">
      <div class="expense-info">
        <span class="chip">${esc(label)}</span>
        <div class="expense-desc">${esc(d.descricao) || '(sem descrição)'}</div>
      </div>
      <div class="expense-right">
        <div class="v">${fmtBRL(d.valor)}</div>
        <button class="x-btn" data-del="${d.id}">✕</button>
      </div>
    </div>`;
  }).join('');

  const catOptions = CATEGORIAS_DESPESA.map(c => `<option value="${c.id}">${c.label}</option>`).join('');

  document.getElementById('content').innerHTML = `
    <h2 class="section-title">Selecionar mês</h2>
    <div class="card tight">
      <select id="sel-month-desp">${options}</select>
    </div>

    <div class="kpi-grid" style="grid-template-columns:1fr;">
      <div class="kpi"><div class="label">Total de despesas em ${monthLabel(m.key)}</div><div class="value danger">${fmtBRL(total)}</div></div>
    </div>

    ${catRows ? `<h2 class="section-title">Por categoria</h2><div class="card">${catRows}</div>` : ''}

    <h2 class="section-title">Nova despesa</h2>
    <div class="card">
      <div class="field">
        <label>Categoria</label>
        <select id="d-cat">${catOptions}</select>
      </div>
      <div class="field">
        <label>Descrição</label>
        <input type="text" id="d-desc" placeholder="Ex: assinatura Cypress Cloud">
      </div>
      <div class="field">
        <label>Valor</label>
        <input type="number" inputmode="decimal" id="d-valor" placeholder="0,00">
      </div>
      <button class="btn btn-primary" id="btn-add-despesa">+ Adicionar despesa</button>
    </div>

    <h2 class="section-title">Lançamentos do mês</h2>
    <div class="card tight">${itemRows || '<div class="empty">Nenhuma despesa lançada neste mês.</div>'}</div>
  `;

  document.getElementById('sel-month-desp').addEventListener('change', e => { ACTIVE_MONTH_KEY = e.target.value; renderDespesas(); });

  document.getElementById('btn-add-despesa').addEventListener('click', () => {
    const valor = parseFloat(document.getElementById('d-valor').value);
    if (!valor || valor <= 0) { document.getElementById('d-valor').focus(); return; }
    const categoria = document.getElementById('d-cat').value;
    const descricao = document.getElementById('d-desc').value.trim();
    if (!Array.isArray(m.despesas)) m.despesas = [];
    m.despesas.push({ id: 'd' + Date.now(), categoria, descricao, valor });
    persist();
    renderDespesas();
  });

  document.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', () => {
    m.despesas = (m.despesas || []).filter(d => d.id !== el.dataset.del);
    persist();
    renderDespesas();
  }));
}

/* ============================== TAB: HISTÓRICO ============================== */
function renderHistorico() {
  setTopbar('Histórico', `${STATE.months.length} meses desde a abertura`);
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
    <div class="card tight">${rows || '<div class="empty">Nenhum mês cadastrado ainda.</div>'}</div>
    <div class="note">Toque em um mês para abrir e editar na aba Lançar.</div>
  `;
  document.querySelectorAll('.month-list-item').forEach(el => el.addEventListener('click', () => {
    goTo('lancar', el.dataset.key);
  }));
}

/* ============================== TAB: AJUSTES ============================== */
function renderAjustes() {
  setTopbar('Ajustes', 'Empresa, parâmetros e backup');
  const p = STATE.params;
  document.getElementById('content').innerHTML = `
    <h2 class="section-title">Dados da empresa</h2>
    <div class="card">
      <div class="field"><label>Nome da empresa</label><input type="text" id="e-nome" value="${esc(STATE.empresa?.nome || '')}" placeholder="Ex: Sua Empresa LTDA"></div>
    </div>

    <h2 class="section-title">Parâmetros gerais</h2>
    <div class="card">
      <div class="field"><label>Salário mínimo nacional</label><input type="number" id="p-sal" value="${p.salarioMinimo}"></div>
      <div class="field"><label>Teto do INSS</label><input type="number" id="p-teto" value="${p.tetoInss}"></div>
      <div class="field"><label>Alíquota INSS sobre pró-labore (%)</label><input type="number" id="p-aliqinss" value="${(p.aliqInss * 100).toFixed(2)}"></div>
      <div class="field"><label>Meta do Fator R (%)</label><input type="number" id="p-meta" value="${(p.fatorRMeta * 100).toFixed(2)}"></div>
      <div class="field"><label>Honorários contábeis (mensal)</label><input type="number" id="p-contador" value="${p.honorarioContador}"></div>
      <div class="field">
        <label>Atividade do MEI (preenche o DAS-MEI padrão)</label>
        <select id="p-atividade-mei">
          <option value="">— selecionar —</option>
          <option value="comercio">Comércio / Indústria (R$82,05)</option>
          <option value="servico">Serviço (R$86,05)</option>
          <option value="misto">Comércio e Serviço (R$87,05)</option>
        </select>
      </div>
      <div class="field"><label>DAS-MEI fixo</label><input type="number" id="p-dasmei" value="${p.dasMei}"></div>
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
            <div class="field"><label>Nº parcelas</label><input type="number" data-loan="${l.id}" data-field="nParcelas" value="${l.nParcelas || 0}"></div>
            <div class="field"><label>Valor da parcela</label><input type="number" data-loan="${l.id}" data-field="valorParcela" value="${l.valorParcela || 0}"></div>
          </div>
          <div class="two-col">
            <div class="field"><label>Parcelas pagas</label><input type="number" data-loan="${l.id}" data-field="parcelasPagas" value="${l.parcelasPagas || 0}"></div>
            <div class="field"><label>Mês de início</label><input type="month" data-loan="${l.id}" data-field="mesInicio" value="${l.mesInicio || ''}"></div>
          </div>
          <div class="row"><div class="l">Saldo devedor estimado</div><div class="v dim">${fmtBRL(saldo)} (${restantes} restantes)</div></div>
        </div>`;
      }).join('') || '<div class="card empty">Nenhum empréstimo cadastrado.</div>'}
    </div>
    <button class="btn btn-ghost" id="btn-add-loan">+ Adicionar empréstimo</button>

    <h2 class="section-title">Backup de dados</h2>
    <div class="card">
      <div class="note" style="margin-top:0;">Seus dados ficam salvos só neste navegador. Exporte um backup de vez em quando para não perder nada se limpar o cache ou trocar de aparelho.</div>
      <button class="btn btn-secondary" id="btn-export">Exportar backup (.json)</button>
      <label class="btn btn-ghost" for="file-import" style="display:block;text-align:center;margin-top:8px;">Importar backup</label>
      <input type="file" id="file-import" accept="application/json" style="display:none;">
      ${backupMsg ? `<div class="note" style="color:var(--primary);">${esc(backupMsg)}</div>` : ''}
    </div>

    <h2 class="section-title">Dados de exemplo</h2>
    <div class="card">
      <button class="btn btn-danger" id="btn-reset">Restaurar dados de exemplo</button>
      <div class="note">Isso substitui faturamento, pró-labore, despesas e empréstimos pelos dados de exemplo. Não pode ser desfeito — exporte um backup antes, se quiser guardar o que já lançou.</div>
    </div>
  `;

  document.getElementById('e-nome').addEventListener('change', e => {
    STATE.empresa = STATE.empresa || {};
    STATE.empresa.nome = e.target.value;
    persist();
  });

  const bindParam = (id, field, isPct) => document.getElementById(id).addEventListener('change', e => {
    const v = parseFloat(e.target.value) || 0;
    p[field] = isPct ? v / 100 : v;
    persist();
  });
  bindParam('p-sal', 'salarioMinimo', false);
  bindParam('p-teto', 'tetoInss', false);
  bindParam('p-aliqinss', 'aliqInss', true);
  bindParam('p-meta', 'fatorRMeta', true);
  bindParam('p-contador', 'honorarioContador', false);
  bindParam('p-dasmei', 'dasMei', false);

  document.getElementById('p-atividade-mei').addEventListener('change', e => {
    const v = DAS_MEI_POR_ATIVIDADE[e.target.value];
    if (v) { p.dasMei = v; persist(); renderAjustes(); }
  });

  document.querySelectorAll('[data-loan]').forEach(el => el.addEventListener('change', () => {
    const loan = STATE.loans.find(l => l.id === el.dataset.loan);
    const f = el.dataset.field;
    loan[f] = (f === 'nome' || f === 'mesInicio') ? el.value : (parseFloat(el.value) || 0);
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

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Restaurar todos os dados de exemplo? Isso substitui o que você já lançou.')) return;
    const seed = defaultState();
    STATE.months = seed.months;
    STATE.params = seed.params;
    STATE.loans = seed.loans;
    ACTIVE_MONTH_KEY = STATE.months[STATE.months.length - 1].key;
    persist(); ACTIVE_TAB = 'inicio'; renderAll();
  });
}

/* ============================== ROTEADOR ============================== */
function renderAll() {
  renderTabbar();
  if (ACTIVE_TAB === 'inicio') renderInicio();
  else if (ACTIVE_TAB === 'lancar') renderLancar();
  else if (ACTIVE_TAB === 'despesas') renderDespesas();
  else if (ACTIVE_TAB === 'historico') renderHistorico();
  else if (ACTIVE_TAB === 'ajustes') renderAjustes();
}

(function init() {
  STATE = loadState();
  ACTIVE_MONTH_KEY = STATE.months[STATE.months.length - 1]?.key || null;
  renderAll();
})();

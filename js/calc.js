/* ==========================================================================
   calc.js — Motor de cálculo do Fator R / Simples Nacional
   Nenhuma função aqui toca o DOM. Só matemática e regras de negócio.
   Isso facilita testar e conferir os números separadamente da interface.
   ========================================================================== */

/* Tabelas oficiais do Simples Nacional (LC 123/2006 + LC 155/2016), vigentes
   em 2026. Cada linha: [piso da faixa (RBT12), alíquota nominal, parcela a deduzir] */
const ANEXO3 = [
  [0, 0.06, 0],
  [180000.01, 0.112, 9360],
  [360000.01, 0.135, 17640],
  [720000.01, 0.16, 35640],
  [1800000.01, 0.21, 125640],
  [3600000.01, 0.33, 648000],
];

const ANEXO5 = [
  [0, 0.155, 0],
  [180000.01, 0.18, 4500],
  [360000.01, 0.195, 9900],
  [720000.01, 0.205, 17100],
  [1800000.01, 0.23, 62100],
  [3600000.01, 0.305, 540000],
];

const MES_ABR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MES_EXT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const CATEGORIAS_DESPESA = [
  { id: 'estrutura', label: 'Aluguel / Estrutura' },
  { id: 'software', label: 'Software / Ferramentas' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'fornecedores', label: 'Fornecedores / Insumos' },
  { id: 'impostos', label: 'Impostos diversos' },
  { id: 'bancarias', label: 'Taxas bancárias' },
  { id: 'outros', label: 'Outros' },
];

/* Valores de referência 2026 (Receita Federal / INSS):
   salário mínimo R$1.621,00 • teto INSS R$8.475,55 • DAS-MEI serviços R$86,05 */
const PARAMS_PADRAO = {
  salarioMinimo: 1621.00,
  tetoInss: 8475.55,
  aliqInss: 0.11,
  fatorRMeta: 0.28,
  honorarioContador: 149.90,
  dasMei: 86.05,
};

function mkMonth(key, regime, faturamento, proLabore, dasPago) {
  return {
    key, regime, faturamento, proLabore,
    dasPago: dasPago ?? null,
    despesas: [],
    lucroDistribuidoOverride: null,
  };
}

/* ---------- utilitários de formatação / datas ---------- */
const fmtBRL = n => (isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = n => ((isFinite(n) ? n : 0) * 100).toFixed(1).replace('.', ',') + '%';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function monthLabel(key) {
  if (key === 'sim') return 'Simulação';
  const [y, m] = key.split('-').map(Number);
  return MES_ABR[m - 1] + '/' + String(y).slice(2);
}
function monthLabelExt(key) {
  if (key === 'sim') return 'Simulação';
  const [y, m] = key.split('-').map(Number);
  return MES_EXT[m - 1] + ' / ' + y;
}
function nextKey(key) {
  let [y, m] = key.split('-').map(Number);
  m += 1; if (m > 12) { m = 1; y += 1; }
  return y + '-' + String(m).padStart(2, '0');
}

function bracketLookup(table, rbt12) {
  let row = table[0];
  for (const r of table) { if (rbt12 >= r[0]) row = r; else break; }
  return row;
}

function despesasTotal(month) {
  return (month.despesas || []).reduce((s, d) => s + (Number(d.valor) || 0), 0);
}

/* ---------- empréstimos ---------- */
function loansTotalAtivo(loans, monthKey) {
  return loans.filter(l => {
    if (monthKey && l.mesInicio && monthKey !== 'sim' && monthKey < l.mesInicio) return false;
    return (l.parcelasPagas || 0) < (l.nParcelas || 0);
  }).reduce((s, l) => s + (Number(l.valorParcela) || 0), 0);
}

/* ---------- janela de 12 meses ANTERIORES ao mês idx ----------
   Esta é a regra oficial do PGDAS-D: o Fator R e a faixa de alíquota de UM MÊS
   usam o RBT12/folha12 acumulados nos 12 meses ANTERIORES a ele (sem contar o
   próprio mês). Por isso o resultado deste mês é definido pelo que já aconteceu
   antes — e o que você lança HOJE só vai pesar no enquadramento do MÊS QUE VEM. */
function computeMonth(months, idx, params, loansTotal) {
  const m = months[idx];
  const preceding = idx;
  let rbt12, folha12;
  if (preceding === 0) {
    rbt12 = m.faturamento * 12; folha12 = m.proLabore * 12;
  } else if (preceding <= 11) {
    let sf = 0, sp = 0;
    for (let i = 0; i < idx; i++) { sf += months[i].faturamento; sp += months[i].proLabore; }
    rbt12 = (sf / preceding) * 12; folha12 = (sp / preceding) * 12;
  } else {
    let sf = 0, sp = 0;
    for (let i = idx - 12; i < idx; i++) { sf += months[i].faturamento; sp += months[i].proLabore; }
    rbt12 = sf; folha12 = sp;
  }
  const fatorR = rbt12 ? folha12 / rbt12 : 0;
  const anexo = fatorR >= params.fatorRMeta ? 'III' : 'V';

  let dasEstimado = 0, aliqEf = 0, aliqNom = 0, pd = 0;
  if (m.regime === 'ME') {
    const table = anexo === 'III' ? ANEXO3 : ANEXO5;
    const row = bracketLookup(table, rbt12);
    aliqNom = row[1]; pd = row[2];
    aliqEf = rbt12 ? (rbt12 * aliqNom - pd) / rbt12 : 0;
    dasEstimado = m.faturamento * aliqEf;
  }
  const dasUsado = m.regime === 'MEI' ? (m.dasPago ?? params.dasMei) : (m.dasPago ?? dasEstimado);
  const inss = m.regime === 'ME' ? Math.min(m.proLabore, params.tetoInss) * params.aliqInss : 0;
  const contador = params.honorarioContador;
  const despesasMes = despesasTotal(m);
  const totalSaida = m.proLabore + dasUsado + inss + contador + loansTotal + despesasMes;
  const lucroDisponivel = m.faturamento - totalSaida;
  const lucroDistribuido = (m.lucroDistribuidoOverride != null) ? m.lucroDistribuidoOverride : Math.max(lucroDisponivel, 0);
  const saldoCaixa = lucroDisponivel - lucroDistribuido;

  return {
    rbt12, folha12, fatorR, anexo, aliqNom, pd, aliqEf, dasEstimado, dasUsado, inss, contador,
    despesasMes, totalSaida, lucroDisponivel, lucroDistribuido, saldoCaixa,
  };
}

function computeAll(state) {
  return state.months.map((m, idx) => {
    const loansTotal = loansTotalAtivo(state.loans, m.key);
    return computeMonth(state.months, idx, state.params, loansTotal);
  });
}

/* ---------- projeção para o MÊS QUE VEM ----------
   Aqui SIM o mês atual (idx) entra na conta — porque é ele que vai compor a
   janela de 12 meses usada para decidir o Anexo do mês seguinte.
   fatorR = soma(pró-labore) / soma(faturamento) na janela — o fator de
   anualização sempre se cancela nessa razão, então nem precisamos dele aqui.
   A partir disso, isolamos o pró-labore mínimo que falta lançar ESTE mês para
   a janela bater 28% e o próximo mês continuar (ou voltar a) Anexo III. */
function projectNextMonth(months, idx, params) {
  const windowSize = Math.min(idx + 1, 12);
  const startIdx = Math.max(0, idx - windowSize + 1);
  let sf = 0, sp = 0, spOutros = 0;
  for (let i = startIdx; i <= idx; i++) {
    sf += months[i].faturamento;
    sp += months[i].proLabore;
    if (i !== idx) spOutros += months[i].proLabore;
  }
  const fatorR = sf ? sp / sf : 0;
  const anexoProjetado = fatorR >= params.fatorRMeta ? 'III' : 'V';
  const proLaboreMinimo = Math.max(0, params.fatorRMeta * sf - spOutros);
  const folga = sp - params.fatorRMeta * sf; // >0 = margem em R$ acima do mínimo
  return { sf, sp, fatorR, anexoProjetado, proLaboreMinimo, folga, windowSize };
}

/* ---------- gauge SVG (semicírculo do Fator R) ---------- */
function gaugeSVG(fatorR, meta, anexo) {
  const cx = 120, cy = 118, r = 96, scaleMax = 0.6;
  const pt = (rad, ang) => { const a = ang * Math.PI / 180; return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)]; };
  const angFor = v => { const t = Math.max(0, Math.min(1, v / scaleMax)); return 180 - t * 180; };
  const [tx1, ty1] = pt(r - 13, angFor(meta));
  const [tx2, ty2] = pt(r + 9, angFor(meta));
  const pct = Math.max(0, Math.min(100, (fatorR / scaleMax) * 100));
  const color = anexo === 'III' ? 'var(--primary)' : 'var(--danger)';
  return `<svg viewBox="0 0 240 132" width="240" height="132">
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="#2C2058" stroke-width="15" fill="none" stroke-linecap="round"/>
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="${color}" stroke-width="15" fill="none"
          stroke-linecap="round" pathLength="100" stroke-dasharray="${pct} 100"/>
    <line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke="#9F8FD6" stroke-width="2"/>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="#6F5FA0" font-size="10" font-family="Inter">meta 28%</text>
  </svg>`;
}

/* DAS-MEI por tipo de atividade — referência 2026 (5% do salário mínimo + ISS/ICMS fixos) */
const DAS_MEI_POR_ATIVIDADE = {
  comercio: 82.05,
  servico: 86.05,
  misto: 87.05,
};

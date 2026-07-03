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
  { id: 'contabilidade', label: 'Contabilidade' },
  { id: 'estrutura', label: 'Aluguel / Estrutura' },
  { id: 'software', label: 'Software / Ferramentas' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'fornecedores', label: 'Fornecedores / Insumos' },
  { id: 'impostos', label: 'Impostos diversos' },
  { id: 'bancarias', label: 'Taxas bancárias' },
  { id: 'outros', label: 'Outros' },
];

/* Valores de referência 2026 (Receita Federal / INSS):
   salário mínimo R$1.621,00 • teto INSS R$8.475,55 • DAS-MEI serviços R$86,05
   Honorários contábeis NÃO entram mais aqui — lance como despesa do mês
   (categoria "Contabilidade"), assim o valor acompanha quando você troca de
   contador ou o preço muda, sem precisar editar um parâmetro fixo. */
const PARAMS_PADRAO = {
  salarioMinimo: 1621.00,
  tetoInss: 8475.55,
  aliqInss: 0.11,
  fatorRMeta: 0.28,
  dasMei: 86.05,
  atividadeMei: '', // '', 'comercio', 'servico' ou 'misto' — só pra lembrar a escolha no seletor
};

/* Paleta usada nos gráficos e nas categorias de despesa — propositalmente
   variada (não só roxo), o roxo fica reservado pra identidade do app
   (Anexo III, botões principais). */
const CHART_PALETTE = ['#38BDF8', '#34D399', '#FBBF24', '#FB7185', '#A78BFA', '#F472B6', '#60A5FA', '#FB923C'];

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Aceita tanto "1500,50" quanto "1500.50" quanto "1.500,50" — pensado pro
   teclado decimal do celular, que no Brasil costuma usar vírgula. */
function parseBRNumber(input) {
  if (input == null) return NaN;
  let s = String(input).trim();
  if (s === '') return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  return parseFloat(s);
}

/* Mostra o número já com vírgula (o jeito que a pessoa vai digitar de volta). */
function numToInput(n) {
  if (n === null || n === undefined || isNaN(n)) return '';
  return String(n).replace('.', ',');
}
/* Igual acima, mas mostra o campo vazio (com o placeholder "20,00" de exemplo)
   quando o valor é zero — assim não fica um "0" cru parecendo um valor real. */
function numToInputBlankZero(n) {
  if (!n) return '';
  return numToInput(n);
}

/* Para campos de DINHEIRO: sempre com 2 casas decimais e separador de milhar
   no padrão brasileiro (1621 → "1.621,00"). parseBRNumber lê de volta sem perda. */
function numToInputMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function numToInputMoneyBlankZero(n) {
  if (!n) return '';
  return numToInputMoney(n);
}

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

/* Aplica a máscara 00.000.000/0000-00 enquanto a pessoa digita o CNPJ. */
function formatCNPJ(value) {
  const d = String(value || '').replace(/\D/g, '').slice(0, 14);
  let out = d;
  if (d.length > 2) out = d.slice(0, 2) + '.' + d.slice(2);
  if (d.length > 5) out = out.slice(0, 6) + '.' + out.slice(6);
  if (d.length > 8) out = out.slice(0, 10) + '/' + out.slice(10);
  if (d.length > 12) out = out.slice(0, 15) + '-' + out.slice(15);
  return out;
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
  const anexo = fatorR >= params.fatorRMeta - 1e-9 ? 'III' : 'V';

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
  const despesasMes = despesasTotal(m);
  const totalSaida = m.proLabore + dasUsado + inss + loansTotal + despesasMes;
  const lucroDisponivel = m.faturamento - totalSaida;
  const lucroDistribuido = (m.lucroDistribuidoOverride != null) ? m.lucroDistribuidoOverride : Math.max(lucroDisponivel, 0);
  const saldoCaixa = lucroDisponivel - lucroDistribuido;

  return {
    rbt12, folha12, fatorR, anexo, aliqNom, pd, aliqEf, dasEstimado, dasUsado, inss,
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
  const anexoProjetado = fatorR >= params.fatorRMeta - 1e-9 ? 'III' : 'V';
  const proLaboreMinimo = Math.max(0, params.fatorRMeta * sf - spOutros);
  const folga = sp - params.fatorRMeta * sf; // >0 = margem em R$ acima do mínimo (na janela toda)
  /* O que o usuário vê no aviso é sempre em relação ao MÊS ATUAL:
     proLaboreMes  = o que foi lançado neste mês
     excedenteMes  = quanto do pró-labore DESTE mês está acima do mínimo — é o
     máximo que daria pra converter em lucro distribuído sem perder a meta.
     (Matematicamente = min(folga, proLaboreMes), já que o mínimo é clampado em 0.) */
  const proLaboreMes = months[idx].proLabore;
  const excedenteMes = Math.max(0, proLaboreMes - proLaboreMinimo);
  return { sf, sp, fatorR, anexoProjetado, proLaboreMinimo, folga, windowSize, proLaboreMes, excedenteMes };
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
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="var(--gauge-track)" stroke-width="15" fill="none" stroke-linecap="round"/>
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="${color}" stroke-width="15" fill="none"
          stroke-linecap="round" pathLength="100" stroke-dasharray="${pct} 100"/>
    <line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke="var(--gauge-tick)" stroke-width="2"/>
  </svg>`;
}

/* DAS-MEI por tipo de atividade — referência 2026 (5% do salário mínimo + ISS/ICMS fixos) */
const DAS_MEI_POR_ATIVIDADE = {
  comercio: 82.05,
  servico: 86.05,
  misto: 87.05,
};

/* ---------- fechamento anual em CSV ----------
   Uma linha por mês do ano escolhido, já com Fator R e Anexo calculados.
   Pensado pra abrir no Excel/Sheets no fim do ano (ou mandar pro contador). */
function buildYearCSV(state, year) {
  const idxs = state.months.map((m, i) => i).filter(i => state.months[i].key.startsWith(year + '-'));
  const header = ['Mês', 'Regime', 'Faturamento', 'Pró-labore', 'DAS', 'INSS', 'Despesas', 'Total saídas', 'Lucro disponível', 'Lucro distribuído', 'Fator R', 'Anexo'];
  const lines = [header.join(';')];
  idxs.forEach(i => {
    const m = state.months[i];
    const loansTotal = loansTotalAtivo(state.loans, m.key);
    const c = computeMonth(state.months, i, state.params, loansTotal);
    const row = [
      monthLabelExt(m.key),
      m.regime,
      c2(m.faturamento), c2(m.proLabore), c2(c.dasUsado), c2(c.inss), c2(c.despesasMes),
      c2(c.totalSaida), c2(c.lucroDisponivel), c2(c.lucroDistribuido),
      m.regime === 'ME' ? (c.fatorR * 100).toFixed(2).replace('.', ',') + '%' : '—',
      m.regime === 'ME' ? c.anexo : 'MEI',
    ];
    lines.push(row.join(';'));
  });
  return lines.join('\n');
}
function c2(n) { return (isFinite(n) ? n : 0).toFixed(2).replace('.', ','); }

function yearsAvailable(state) {
  const set = new Set(state.months.map(m => m.key.slice(0, 4)));
  return Array.from(set).sort();
}

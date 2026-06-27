/* ==========================================================================
   tests/calc.test.js — testes de fumaça do motor de cálculo (js/calc.js)
   Sem dependências: roda com `node tests/calc.test.js`.
   Não substitui a conferência com seu contador — só garante que a lógica
   de Fator R / Anexo III-V não quebrou depois de uma alteração no código.
   ========================================================================== */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'calc.js'), 'utf8'),
  ctx,
  { filename: 'calc.js' }
);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✔ ${name}`);
  } catch (e) {
    console.error(`✘ ${name}`);
    console.error('  ' + e.message);
    process.exitCode = 1;
  }
}

vm.runInContext(`
  globalThis.__months = [
    mkMonth('2025-05', 'MEI', 580.65, 0),
    mkMonth('2025-06', 'MEI', 6000, 0),
    mkMonth('2025-07', 'MEI', 6000, 0),
    mkMonth('2025-08', 'MEI', 6000, 0),
    mkMonth('2025-09', 'MEI', 9000, 0),
    mkMonth('2025-10', 'MEI', 9937.49, 0),
    mkMonth('2025-11', 'MEI', 10089.27, 0),
    mkMonth('2025-12', 'MEI', 9571.43, 0),
    mkMonth('2026-01', 'ME', 9000, 0),
    mkMonth('2026-02', 'ME', 0, 9266),
    mkMonth('2026-03', 'ME', 0, 9266),
    mkMonth('2026-04', 'ME', 9100.01, 2756.96),
    mkMonth('2026-05', 'ME', 9000, 2520, 540.00),
  ];
  globalThis.__params = JSON.parse(JSON.stringify(PARAMS_PADRAO));
`, ctx);

const { __months: months, __params: params } = ctx;
const get = (name) => vm.runInContext(name, ctx);

test('bracketLookup pega a faixa certa do Anexo III', () => {
  const ANEXO3 = get('ANEXO3');
  const bracketLookup = get('bracketLookup');
  assert.strictEqual(JSON.stringify(bracketLookup(ANEXO3, 300000)), JSON.stringify([180000.01, 0.112, 9360]));
  assert.strictEqual(JSON.stringify(bracketLookup(ANEXO3, 100000)), JSON.stringify([0, 0.06, 0]));
});

test('Fator R do mês usa só os 12 meses ANTERIORES (sem contar o próprio mês)', () => {
  const computeMonth = get('computeMonth');
  const idx = months.length - 1; // 2026-05
  const c = computeMonth(months, idx, params, 0);
  // janela: jun/25..abr/26 (12 meses antes de maio/26)
  assert.ok(c.fatorR > 0.27 && c.fatorR < 0.29, `fatorR fora do esperado: ${c.fatorR}`);
  assert.strictEqual(c.anexo, 'III');
});

test('projectNextMonth: pró-labore mínimo zera a folga exatamente', () => {
  const projectNextMonth = get('projectNextMonth');
  const idx = months.length - 1;
  const proj = projectNextMonth(months, idx, params);
  const copy = JSON.parse(JSON.stringify(months));
  copy[idx].proLabore = proj.proLaboreMinimo;
  const proj2 = projectNextMonth(copy, idx, params);
  assert.ok(Math.abs(proj2.folga) < 0.001, `folga deveria ser ~0, veio ${proj2.folga}`);
  assert.strictEqual(proj2.anexoProjetado, 'III');
});

test('projectNextMonth: pró-labore zerado empurra a projeção pro Anexo V', () => {
  const projectNextMonth = get('projectNextMonth');
  const idx = months.length - 1;
  const copy = JSON.parse(JSON.stringify(months));
  copy[idx].proLabore = 0;
  const proj = projectNextMonth(copy, idx, params);
  assert.ok(proj.folga < 0, 'folga deveria ser negativa quando o pró-labore é zerado');
  assert.strictEqual(proj.anexoProjetado, 'V');
});

test('despesasTotal soma corretamente os itens lançados', () => {
  const despesasTotal = get('despesasTotal');
  const m = { despesas: [{ valor: 100 }, { valor: 50.5 }, { valor: 0 }] };
  assert.strictEqual(despesasTotal(m), 150.5);
});

test('MEI usa o DAS-MEI fixo, não a tabela de Anexo III/V', () => {
  const computeMonth = get('computeMonth');
  const c = computeMonth(months, 1, params, 0); // 2025-06, MEI
  assert.strictEqual(c.dasUsado, params.dasMei);
});

test('honorários contábeis não entram mais automaticamente no total de saídas', () => {
  const computeMonth = get('computeMonth');
  const idx = months.length - 1;
  const c = computeMonth(months, idx, params, 0);
  const esperado = months[idx].proLabore + c.dasUsado + c.inss + 0 /* loansTotal */ + c.despesasMes;
  assert.ok(Math.abs(c.totalSaida - esperado) < 0.001, `totalSaida não bate sem contador fixo: ${c.totalSaida} vs ${esperado}`);
});

test('parseBRNumber entende vírgula, ponto e formato BR completo', () => {
  const parseBRNumber = get('parseBRNumber');
  assert.strictEqual(parseBRNumber('1500,5'), 1500.5);
  assert.strictEqual(parseBRNumber('1500.5'), 1500.5);
  assert.strictEqual(parseBRNumber('1.500,50'), 1500.50);
  assert.strictEqual(parseBRNumber('1500'), 1500);
  assert.ok(isNaN(parseBRNumber('')));
});

test('buildYearCSV gera uma linha por mês do ano pedido', () => {
  const buildYearCSV = get('buildYearCSV');
  const csv = buildYearCSV({ months, params, loans: [] }, '2026');
  const linhas = csv.trim().split('\n');
  // 1 cabeçalho + 5 meses de 2026 no fixture (jan a mai)
  assert.strictEqual(linhas.length, 1 + 5);
  assert.ok(linhas[0].startsWith('Mês;Regime;Faturamento'));
});

test('formatCNPJ aplica a máscara 00.000.000/0000-00 progressivamente', () => {
  const formatCNPJ = get('formatCNPJ');
  assert.strictEqual(formatCNPJ('123'), '12.3');
  assert.strictEqual(formatCNPJ('12345678901234'), '12.345.678/9012-34');
  assert.strictEqual(formatCNPJ('12.345.678/9012-34'), '12.345.678/9012-34'); // já formatado, idempotente
  assert.strictEqual(formatCNPJ(''), '');
});

test('exatamente 28% de Fator R não cai para Anexo V por arredondamento de ponto flutuante', () => {
  const projectNextMonth = get('projectNextMonth');
  const idx = months.length - 1;
  const copy = JSON.parse(JSON.stringify(months));
  copy[idx].proLabore = 0; // zera pra calcular o mínimo exato a partir do histórico
  const proj0 = projectNextMonth(copy, idx, params);
  copy[idx].proLabore = proj0.proLaboreMinimo; // exatamente o mínimo, sem nenhuma sobra
  const proj = projectNextMonth(copy, idx, params);
  assert.strictEqual(proj.anexoProjetado, 'III', `28% exato não deveria virar Anexo V (fatorR=${proj.fatorR})`);
  assert.ok(proj.folga >= -0.005, `folga não deveria aparentar déficit num match exato (folga=${proj.folga})`);
});

console.log(`\n${passed} teste(s) passaram.`);

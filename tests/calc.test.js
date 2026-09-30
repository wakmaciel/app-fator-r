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
  const c = computeMonth(months, idx, params);
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
  const c = computeMonth(months, 1, params); // 2025-06, MEI
  assert.strictEqual(c.dasUsado, params.dasMei);
});

test('total de saídas = pró-labore + DAS + INSS + despesas (sem contador fixo nem empréstimo)', () => {
  const computeMonth = get('computeMonth');
  const idx = months.length - 1;
  const c = computeMonth(months, idx, params);
  const esperado = months[idx].proLabore + c.dasUsado + c.inss + c.despesasMes;
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
  const csv = buildYearCSV({ months, params }, '2026');
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

test('projectNextMonth expõe o pró-labore do MÊS e o excedente real (bug do aviso da tela inicial)', () => {
  const projectNextMonth = get('projectNextMonth');
  const idx = months.length - 1; // 2026-05, proLabore = 2520
  const proj = projectNextMonth(months, idx, params);
  assert.strictEqual(proj.proLaboreMes, months[idx].proLabore, 'proLaboreMes deve ser o pró-labore lançado no próprio mês');
  const esperado = Math.max(0, months[idx].proLabore - proj.proLaboreMinimo);
  assert.ok(Math.abs(proj.excedenteMes - esperado) < 0.001, `excedenteMes errado: ${proj.excedenteMes} vs ${esperado}`);
  // quando o mínimo é clampado em 0, o excedente NUNCA pode passar do pró-labore do mês
  assert.ok(proj.excedenteMes <= months[idx].proLabore + 0.001, 'excedente não pode ser maior que o pró-labore do mês');
});

test('numToInputMoney formata dinheiro com 2 decimais no padrão BR', () => {
  const numToInputMoney = get('numToInputMoney');
  const numToInputMoneyBlankZero = get('numToInputMoneyBlankZero');
  const parseBRNumber = get('parseBRNumber');
  assert.strictEqual(numToInputMoney(1621), '1.621,00');
  assert.strictEqual(numToInputMoney(86.05), '86,05');
  assert.strictEqual(numToInputMoney(0), '0,00');
  assert.strictEqual(numToInputMoney(null), '');
  assert.strictEqual(numToInputMoneyBlankZero(0), '');
  // ida e volta sem perda: o que o campo mostra, parseBRNumber lê de volta
  assert.strictEqual(parseBRNumber(numToInputMoney(8475.55)), 8475.55);
});

test('a janela de 12 meses segue o CALENDÁRIO, não a posição no array', () => {
  const computeMonth = get('computeMonth');
  const mkMonth = get('mkMonth');
  // 14 meses contíguos a partir de 2025-12: para o último (2027-01) a janela
  // tem que ser 2026-01..2026-12
  const seq = [];
  for (let ano = 2025, mes = 12, i = 0; i < 14; i++) {
    seq.push(mkMonth(ano + '-' + String(mes).padStart(2, '0'), 'ME', 10000, 3000));
    mes++; if (mes > 12) { mes = 1; ano++; }
  }
  const c = computeMonth(seq, seq.length - 1, params);
  assert.strictEqual(c.janelaMeses, 12);
  assert.strictEqual(c.janelaKeys[0], '2026-01');
  assert.strictEqual(c.janelaKeys[11], '2026-12');
});

test('mês apagado no meio não desloca a janela (antes ela esticava pra 13 meses)', () => {
  const computeMonth = get('computeMonth');
  const mkMonth = get('mkMonth');
  const cheio = [];
  for (let ano = 2025, mes = 1, i = 0; i < 13; i++) {
    cheio.push(mkMonth(ano + '-' + String(mes).padStart(2, '0'), 'ME', 10000, 3000));
    mes++; if (mes > 12) { mes = 1; ano++; }
  }
  // apaga 2025-06: a janela de 2026-01 continua sendo 2025-01..2025-12, com
  // junho valendo zero — e não estica até 2024-12 pra "completar" 12 posições.
  const comBuraco = cheio.filter(m => m.key !== '2025-06');
  const c = computeMonth(comBuraco, comBuraco.length - 1, params);
  assert.strictEqual(c.janelaKeys[0], '2025-01');
  assert.strictEqual(c.janelaKeys.length, 12);
  assert.strictEqual(c.janelaSf, 11 * 10000, 'o mês ausente soma zero, não puxa outro mês pra dentro');
  assert.strictEqual(c.janelaSp, 11 * 3000);
});

test('meses fora de ordem no array não bagunçam o cálculo', () => {
  const computeMonth = get('computeMonth');
  const sortMonths = get('sortMonths');
  const ordenado = sortMonths(JSON.parse(JSON.stringify(months)));
  const embaralhado = JSON.parse(JSON.stringify(months));
  [embaralhado[3], embaralhado[7]] = [embaralhado[7], embaralhado[3]];
  const a = computeMonth(ordenado, ordenado.findIndex(m => m.key === '2026-05'), params);
  const b = computeMonth(embaralhado, embaralhado.findIndex(m => m.key === '2026-05'), params);
  assert.ok(Math.abs(a.fatorR - b.fatorR) < 1e-12, `fatorR mudou com o array fora de ordem: ${a.fatorR} vs ${b.fatorR}`);
});

test('pró-labore zero é valor válido: não muda o Fator R oficial do mês, muda a projeção', () => {
  const computeMonth = get('computeMonth');
  const projectNextMonth = get('projectNextMonth');
  const idx = months.length - 1;
  const copy = JSON.parse(JSON.stringify(months));
  copy[idx].proLabore = 0;
  const zerado = computeMonth(copy, idx, params);
  const orig = computeMonth(months, idx, params);
  assert.ok(Math.abs(zerado.fatorR - orig.fatorR) < 1e-12, 'o pró-labore do próprio mês não entra no Fator R oficial dele');
  assert.ok(projectNextMonth(copy, idx, params).fatorR < projectNextMonth(months, idx, params).fatorR,
    'zerar o pró-labore do mês tem que derrubar a projeção do mês seguinte');
});

test('prevKey é o inverso de nextKey e vira o ano certo', () => {
  const prevKey = get('prevKey'), nextKey = get('nextKey');
  assert.strictEqual(prevKey('2026-01'), '2025-12');
  assert.strictEqual(nextKey('2025-12'), '2026-01');
  assert.strictEqual(prevKey(nextKey('2026-07')), '2026-07');
});

test('computeMonth expõe a janela para auditoria na tela', () => {
  const computeMonth = get('computeMonth');
  const c = computeMonth(months, months.length - 1, params);
  assert.ok(Array.isArray(c.janelaKeys) && c.janelaKeys.length === c.janelaMeses);
  assert.ok(Math.abs(c.janelaSp / c.janelaSf - c.fatorR) < 1e-12, 'a razão da janela tem que bater com o Fator R mostrado');
});

/* Cenário da aba Projeção: fev e mar/26 com pró-labore alto, depois só o
   salário mínimo. Quando fev/mar saem da janela (um ano depois), o "só o
   mínimo" dá um salto; o nivelado não. */
function mesesProjecao() {
  const mkMonth = get('mkMonth');
  const copy = JSON.parse(JSON.stringify(months));
  copy.push(mkMonth('2026-06', 'ME', 10000, 1621), mkMonth('2026-07', 'ME', 11000, 1621),
    mkMonth('2026-08', 'ME', 10500, 1621), mkMonth('2026-09', 'ME', 10000, 0));
  return copy;
}

test('planoProLabore: mês base bate com o mínimo da Home (com piso de 1 salário mínimo)', () => {
  const planoProLabore = get('planoProLabore'), projectNextMonth = get('projectNextMonth');
  const ms = mesesProjecao();
  const idx = ms.length - 1;
  const p = planoProLabore(ms, idx, params, null);
  const home = projectNextMonth(ms, idx, params);
  assert.ok(Math.abs(p.linhas[0].minimo - Math.max(params.salarioMinimo, home.proLaboreMinimo)) < 0.01);
});

test('planoProLabore: nenhuma regra deixa o Fator R abaixo da meta nem o pró-labore abaixo do piso', () => {
  const planoProLabore = get('planoProLabore');
  const ms = mesesProjecao();
  const p = planoProLabore(ms, ms.length - 1, params, null);
  assert.strictEqual(p.linhas.length, 12);
  p.linhas.forEach(l => {
    assert.ok(l.fatorRMinimo >= params.fatorRMeta - 1e-9, `${l.key} (mínimo) ficou em ${l.fatorRMinimo}`);
    assert.ok(l.fatorRNivelado >= params.fatorRMeta - 1e-9, `${l.key} (nivelado) ficou em ${l.fatorRNivelado}`);
    assert.ok(l.minimo >= params.salarioMinimo - 1e-9 && l.nivelado >= params.salarioMinimo - 1e-9);
  });
});

test('planoProLabore: pró-labore alto saindo da janela faz o mínimo saltar; o nivelado não', () => {
  const planoProLabore = get('planoProLabore');
  const ms = mesesProjecao();
  const p = planoProLabore(ms, ms.length - 1, params, null);
  const mar27 = p.linhas.find(l => l.key === '2027-03');
  assert.strictEqual(mar27.sai.key, '2026-03');
  assert.strictEqual(mar27.sai.proLabore, 9266);
  assert.ok(mar27.minimo > 9266, `o salto deveria repor o mês que saiu, veio ${mar27.minimo}`);
  assert.ok(p.picoNivelado < p.picoMinimo / 2, 'nivelar tem que tirar o pico');
  assert.ok(p.nivel >= p.sustentavel - 0.01, 'o nível nunca fica abaixo de meta × faturamento esperado');
  // o nível é o menor possível: algum mês depois do base fica exatamente na meta
  assert.ok(p.linhas.slice(1).some(l => Math.abs(l.fatorRNivelado - params.fatorRMeta) < 0.0005),
    'se nenhum mês encosta na meta, dava pra nivelar mais baixo');
});

test('planoProLabore: faturamento esperado maior pede nível maior', () => {
  const planoProLabore = get('planoProLabore');
  const ms = mesesProjecao();
  const auto = planoProLabore(ms, ms.length - 1, params, null);
  const alto = planoProLabore(ms, ms.length - 1, params, 15000);
  assert.ok(!alto.fatAuto && alto.fatProj === 15000);
  assert.ok(alto.nivel > auto.nivel);
});

console.log(`\n${passed} teste(s) passaram.`);

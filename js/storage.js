/* ==========================================================================
   storage.js — Persistência local (localStorage) + backup manual
   Este app roda fora do Claude (GitHub Pages / arquivo local), então os
   dados ficam só no localStorage do navegador. Por isso é importante poder
   exportar/importar um backup em JSON — ver Ajustes > Backup de dados.
   ========================================================================== */

const STORAGE_KEY = 'fatorr:state:v2';

function defaultState() {
  return {
    _v: 2,
    empresa: { nome: '' },
    params: JSON.parse(JSON.stringify(PARAMS_PADRAO)),
    months: [
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
    ],
    loans: [
      { id: 'l1', nome: 'Capital de Giro - Banco X', valorContratado: 20000, nParcelas: 24, valorParcela: 670, parcelasPagas: 3, mesInicio: '' }
    ],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // migração leve: garante que toda estrutura nova existe mesmo em dados antigos
    if (!parsed.empresa) parsed.empresa = { nome: '' };
    if (!parsed.params) parsed.params = JSON.parse(JSON.stringify(PARAMS_PADRAO));
    (parsed.months || []).forEach(m => {
      if (!Array.isArray(m.despesas)) {
        // dados antigos podiam ter um único campo numérico outrasDespesas
        const legacy = Number(m.outrasDespesas) || 0;
        m.despesas = legacy > 0 ? [{ id: 'leg' + m.key, categoria: 'outros', descricao: 'Despesas (migradas)', valor: legacy }] : [];
        delete m.outrasDespesas;
      }
    });
    if (!Array.isArray(parsed.loans)) parsed.loans = [];
    return parsed;
  } catch (e) {
    console.error('Falha ao carregar dados salvos, usando padrão.', e);
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Falha ao salvar', e);
    return false;
  }
}

function exportBackup(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `fator-r-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importBackup(file, onDone, onError) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.months) || !parsed.params) throw new Error('Arquivo não parece um backup válido do Fator R.');
      parsed.months.forEach(m => { if (!Array.isArray(m.despesas)) m.despesas = []; });
      if (!Array.isArray(parsed.loans)) parsed.loans = [];
      if (!parsed.empresa) parsed.empresa = { nome: '' };
      onDone(parsed);
    } catch (e) {
      onError(e);
    }
  };
  reader.onerror = () => onError(new Error('Não foi possível ler o arquivo.'));
  reader.readAsText(file);
}

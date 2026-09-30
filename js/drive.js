/* ==========================================================================
   drive.js — Backup automático no Google Drive
   Usa OAuth 2.0 no navegador (fluxo implícito: só access token, de ~1 hora).
   ⚠️ Só o client_id entra aqui — o client_secret NUNCA deve ir para o código
   de um app web público; ele não é necessário neste fluxo.

   Requisitos no Google Cloud Console (client OAuth do tipo "Aplicativo da Web"):
   - "Origens JavaScript autorizadas": a origem do app (ex. https://SEU-USUARIO.github.io)
   - "URIs de redirecionamento autorizados": a URL do app terminada em "/"
     (ex. https://SEU-USUARIO.github.io/app-fator-r/) — usada pelo PWA instalado
   - Google Drive API ATIVADA no projeto
   - Tela de consentimento "Em produção" (em "Teste" a autorização expira em 7 dias)

   Por que o token expira: sem servidor não existe refresh token, então a cada
   ~1 hora é preciso pedir outro ao Google. Quando dá, isso é feito sem
   interação (redirect com prompt=none ao abrir o app); quando não dá, o app
   avisa na tela inicial com um botão "Reconectar".
   ========================================================================== */

const DRIVE_CLIENT_ID = '1051475440050-jhs326hjnanlq69mtnmt0bahqo8rnk53.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'; // só arquivos criados pelo app
const DRIVE_FILENAME = 'fator-r-backup.json';
const DRIVE_CFG_KEY = 'fatorr:drive:v1';
// localStorage (não sessionStorage): no PWA do iOS a sessão é apagada toda vez
// que o app é fechado, e o token (válido por ~1 h) se perdia junto
const DRIVE_TOKEN_KEY = 'fatorr:drive:token';
const DRIVE_AUTH_KEY = 'fatorr:drive:auth'; // login por redirect em andamento (nonce + intenção)
const DRIVE_DEBOUNCE_MS = 4000;       // espera a pessoa parar de digitar antes de subir
const DRIVE_FETCH_TIMEOUT_MS = 30000; // requisição pendurada não pode travar o backup pra sempre
const DRIVE_POPUP_TIMEOUT_MS = 180000;
const DRIVE_SILENT_RETRY_MS = 30 * 60 * 1000; // renovação silenciosa: no máx. 1 tentativa a cada 30 min

let driveToken = null;       // { accessToken, expiresAt }
let driveTokenClient = null;
let driveTimer = null;
let driveBusy = false;
let drivePending = false;    // mudou algo enquanto um upload estava em andamento
let drivePendingKick = false; // acabou de voltar do login por redirect — fazer backup
let driveReturnIntent = null; // 'backup' | 'restore' — o que a pessoa pediu antes do redirect
let driveGetState = null;    // último getState recebido do app (pros gatilhos online/visibilidade)

/* Erro de autenticação: a pessoa precisa tocar em "Reconectar" (não é falha de rede). */
function driveAuthError(msg) {
  const e = new Error(msg || 'A sessão do Google expirou.');
  e.needsAuth = true;
  return e;
}

/* PWA instalado na tela de início (iOS/Android)? Nesse modo o popup de login
   do Google não funciona direito no iOS — usamos o fluxo por REDIRECT. */
function driveIsStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}

/* URL desta página, sem query/hash — precisa estar cadastrada como
   "URI de redirecionamento autorizado" no client OAuth do Google Cloud.
   O PWA instalado abre em .../index.html (start_url do manifest); removemos
   o sufixo pra sempre enviar a mesma URI cadastrada (terminada em "/"). */
function driveRedirectUri() {
  return location.origin + location.pathname.replace(/index\.html?$/, '');
}

function driveRandomNonce() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

/* Navega pro login do Google e volta com o token no hash da URL.
   silent=true usa prompt=none: se a conta Google ainda estiver logada neste
   app e a permissão já tiver sido dada, o Google devolve um token novo na hora,
   sem mostrar nada. O `state` leva um nonce aleatório — sem ele, qualquer link
   com "#access_token=..." poderia fazer o app mandar o backup pro Drive de outra pessoa. */
function driveRedirectAuth(opts) {
  const o = opts || {};
  const nonce = driveRandomNonce();
  try {
    localStorage.setItem(DRIVE_AUTH_KEY, JSON.stringify({ nonce, silent: !!o.silent, intent: o.intent || 'backup', at: Date.now() }));
  } catch (e) { /* sem storage não dá pra validar a volta — segue e a volta será ignorada */ }
  const params = new URLSearchParams({
    client_id: DRIVE_CLIENT_ID,
    redirect_uri: driveRedirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'true',
    state: 'fatorr-drive.' + nonce,
  });
  if (o.silent) params.set('prompt', 'none');
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

function driveCacheToken(token) {
  driveToken = token;
  try { localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(token)); } catch (e) { /* segue só em memória */ }
}
function driveDropToken() {
  driveToken = null;
  try { localStorage.removeItem(DRIVE_TOKEN_KEY); sessionStorage.removeItem(DRIVE_TOKEN_KEY); } catch (e) { /* sem storage */ }
}
function driveHasToken() {
  return !!(driveToken && Date.now() < driveToken.expiresAt - 60000);
}

/* O Google mostra a permissão do Drive como uma caixinha na tela de
   consentimento — se a pessoa não marcar, vem um token que não serve pro Drive. */
function driveScopeGranted(scopeStr) {
  if (scopeStr == null) return true; // resposta sem o campo: assume o pedido
  return String(scopeStr).split(/\s+/).indexOf(DRIVE_SCOPE) !== -1;
}
const DRIVE_MSG_SCOPE = 'A permissão do Google Drive não foi marcada. Toque em "Reconectar" e, na tela do Google, marque a caixa de acesso ao Google Drive.';

/* Roda no carregamento: se a URL tem uma resposta do Google no hash (volta do
   login por redirect), guarda o token (ou o erro) e limpa a URL. */
(function driveHandleRedirectReturn() {
  try {
    if (!location.hash) return;
    const h = new URLSearchParams(location.hash.slice(1));
    const state = h.get('state') || '';
    if (state.indexOf('fatorr-drive') !== 0) return;
    history.replaceState(null, '', location.pathname + location.search);

    let pend = null;
    try { pend = JSON.parse(localStorage.getItem(DRIVE_AUTH_KEY)); } catch (e) { /* sem registro */ }
    try { localStorage.removeItem(DRIVE_AUTH_KEY); } catch (e) { /* ok */ }
    if (!pend || state !== 'fatorr-drive.' + pend.nonce) return; // resposta que este app não pediu — ignora

    const c = driveCfg();
    const err = h.get('error');
    if (err) {
      if (pend.silent) {
        // prompt=none não rolou (sessão do Google saiu, etc.) — precisa de um toque
        c.needsAuth = true;
      } else if (err === 'access_denied') {
        c.error = 'Autorização cancelada na tela do Google.';
      } else {
        c.error = 'O Google recusou o login (' + err + ').';
      }
      saveDriveCfg(c);
      return;
    }
    if (!h.get('access_token')) return;
    if (!driveScopeGranted(h.get('scope'))) {
      c.needsAuth = true;
      c.error = DRIVE_MSG_SCOPE;
      saveDriveCfg(c);
      return;
    }
    driveCacheToken({
      accessToken: h.get('access_token'),
      expiresAt: Date.now() + (Number(h.get('expires_in')) || 3600) * 1000,
    });
    c.enabled = true;
    c.redirectOk = true; // a URI de redirect está cadastrada — renovação silenciosa é segura
    delete c.needsAuth;
    delete c.error;
    driveReturnIntent = pend.intent || 'backup';
    if (driveReturnIntent === 'backup') c.dirtyAt = c.dirtyAt || Date.now(); // backup a fazer
    saveDriveCfg(c);
    drivePendingKick = true;
  } catch (e) { /* hash inesperado — ignora */ }
})();

/* Reaproveita token ainda válido (ex.: app fechado e reaberto dentro da hora). */
(function driveLoadCachedToken() {
  if (driveToken) return;
  try {
    const cached = JSON.parse(localStorage.getItem(DRIVE_TOKEN_KEY) || sessionStorage.getItem(DRIVE_TOKEN_KEY));
    if (cached && cached.accessToken && Date.now() < cached.expiresAt - 60000) driveToken = cached;
  } catch (e) { /* sem cache */ }
})();

/* ---------- config persistida (localStorage) ---------- */
function driveCfg() {
  try { return JSON.parse(localStorage.getItem(DRIVE_CFG_KEY)) || {}; } catch (e) { return {}; }
}
function saveDriveCfg(cfg) {
  try { localStorage.setItem(DRIVE_CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* sem espaço — segue sem config */ }
}
function driveEnabled() { return !!driveCfg().enabled; }
function driveStatus() {
  const c = driveCfg();
  return {
    enabled: !!c.enabled,
    lastBackup: c.lastBackup || null,
    error: c.error || null,
    needsAuth: !!c.needsAuth,
    dirty: !!c.dirtyAt,           // tem alteração que ainda não chegou no Drive
    remoteFound: c.remoteFound || null, // backup achado no Drive antes de ligar este aparelho
    // PWA que ainda não conseguiu voltar de um login por redirect (se o Google
    // mostrar redirect_uri_mismatch, a URL do app não está cadastrada)
    redirectUnproven: driveIsStandalone() && !c.redirectOk,
    redirectUri: driveRedirectUri(),
    busy: driveBusy,
  };
}
function driveNotify() { document.dispatchEvent(new CustomEvent('drive-status')); }

/* ---------- autenticação ---------- */
function driveEnsureGis() {
  return new Promise((resolve, reject) => {
    if (window.google && google.accounts && google.accounts.oauth2) return resolve();
    let waited = 0;
    const iv = setInterval(() => {
      if (window.google && google.accounts && google.accounts.oauth2) { clearInterval(iv); resolve(); }
      else if ((waited += 200) > 8000) { clearInterval(iv); reject(new Error('Google Identity não carregou — verifique a conexão.')); }
    }, 200);
  });
}

/* Pede um access token.
   - Token ainda válido: usa o guardado.
   - Não interativo (backup agendado): não dá pra abrir login sem um toque da
     pessoa — falha com needsAuth e o app mostra o botão "Reconectar".
   - Interativo no PWA instalado: redirect pro Google (a página navega).
   - Interativo no navegador: popup do Google Identity Services. */
function driveGetToken(interactive, intent) {
  if (driveHasToken()) return Promise.resolve(driveToken.accessToken);
  if (!interactive) return Promise.reject(driveAuthError());

  if (driveIsStandalone()) {
    driveRedirectAuth({ intent });
    return new Promise(() => {}); // a página vai navegar — nunca resolve
  }

  return driveEnsureGis().then(() => new Promise((resolve, reject) => {
    // o GIS às vezes não chama nenhum callback (popup perdido) — sem isso o
    // backup ficava "enviando…" pra sempre
    const guard = setTimeout(() => reject(new Error('O login do Google não respondeu. Tente de novo.')), DRIVE_POPUP_TIMEOUT_MS);
    if (!driveTokenClient) {
      driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {},
      });
    }
    driveTokenClient.callback = (resp) => {
      clearTimeout(guard);
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      if (!google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) return reject(driveAuthError(DRIVE_MSG_SCOPE));
      driveCacheToken({
        accessToken: resp.access_token,
        expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
      });
      resolve(driveToken.accessToken);
    };
    driveTokenClient.error_callback = (err) => {
      clearTimeout(guard);
      const t = err && err.type;
      reject(new Error(t === 'popup_failed_to_open'
        ? 'O navegador bloqueou a janela de login do Google — libere pop-ups para este site.'
        : t === 'popup_closed' ? 'A janela de login do Google foi fechada antes de terminar.'
        : (err && err.message) || 'Autorização do Google cancelada ou bloqueada.'));
    };
    driveTokenClient.requestAccessToken({ prompt: '' });
  }));
}

/* Tenta renovar o token sem interação (redirect com prompt=none). Só quando:
   o backup está ligado, há alteração pendente, o redirect já funcionou antes
   neste aparelho (senão um redirect_uri não cadastrado deixaria a pessoa presa
   na tela de erro do Google) e não tentamos há pouco (evita loop). */
function driveMaybeSilentRenew() {
  const c = driveCfg();
  if (!c.enabled || !c.dirtyAt || !c.redirectOk || driveHasToken()) return false;
  if (navigator.onLine === false) return false;
  if (c.silentTriedAt && Date.now() - c.silentTriedAt < DRIVE_SILENT_RETRY_MS) return false;
  c.silentTriedAt = Date.now();
  saveDriveCfg(c);
  driveRedirectAuth({ silent: true, intent: 'backup' });
  return true;
}

/* ---------- chamadas à API do Drive ---------- */
async function driveFetch(url, opts) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), DRIVE_FETCH_TIMEOUT_MS) : null;
  try {
    return await fetch(url, Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {}));
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('O Google Drive demorou demais para responder.');
    throw new Error('Sem conexão com o Google Drive.');
  } finally {
    clearTimeout(t);
  }
}

/* Transforma uma resposta de erro da API num Error com a mensagem do Google
   (antes só aparecia "Drive respondeu 403", sem dizer o motivo). */
async function driveHttpError(r, what) {
  let reason = '', msg = '';
  try {
    const j = await r.json();
    const e = j && j.error;
    if (e) {
      msg = e.message || '';
      reason = (e.errors && e.errors[0] && e.errors[0].reason) || e.status || '';
    }
  } catch (e) { /* corpo não é JSON */ }

  if (r.status === 401) {
    driveDropToken(); // expirou ou foi revogado
    return driveAuthError();
  }
  if (r.status === 403 && /insufficient|SCOPE/i.test(reason + ' ' + msg)) {
    driveDropToken();
    return driveAuthError(DRIVE_MSG_SCOPE);
  }
  if (r.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|disabled/i.test(reason + ' ' + msg)) {
    return new Error('A Google Drive API está desativada no projeto do Google Cloud deste app.');
  }
  return new Error(`Falha ${what} (${r.status}${msg ? ': ' + msg : ''}).`);
}

async function driveFindFile(token) {
  const q = encodeURIComponent(`name='${DRIVE_FILENAME}' and trashed=false`);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) throw await driveHttpError(r, 'ao procurar o backup no Drive');
  const data = await r.json();
  return (data.files && data.files[0]) || null;
}

async function driveUpload(state, interactive) {
  const token = await driveGetToken(interactive, 'backup');
  const cfg = driveCfg();
  let fileId = cfg.fileId || null;
  if (!fileId) {
    const found = await driveFindFile(token);
    if (found) {
      // Já existe um backup no Drive e este aparelho ainda não está ligado a
      // ele (aparelho novo ou reinstalação). NÃO sobrescreve sozinho — um
      // aparelho vazio apagaria o backup bom. A pessoa escolhe nos Ajustes.
      const c = driveCfg();
      c.remoteFound = { id: found.id, modifiedTime: found.modifiedTime || null };
      saveDriveCfg(c);
      const e = new Error('Já existe um backup no seu Drive. Escolha nos Ajustes se quer restaurá-lo ou substituí-lo pelos dados deste aparelho.');
      e.remoteFound = true;
      throw e;
    }
  }
  const boundary = 'fatorr' + Date.now();
  const metadata = fileId ? {} : { name: DRIVE_FILENAME, mimeType: 'application/json' };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(state, null, 2),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const r = await driveFetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
  if (r.status === 404 && fileId) {
    // o arquivo foi apagado direto no Drive — esquece o id e cria de novo
    const c = driveCfg(); delete c.fileId; saveDriveCfg(c);
    return driveUpload(state, interactive);
  }
  if (!r.ok) throw await driveHttpError(r, 'no upload para o Drive');
  const data = await r.json();
  const c2 = driveCfg();
  c2.fileId = data.id || fileId;
  c2.lastBackup = new Date().toISOString();
  delete c2.remoteFound;
  saveDriveCfg(c2);
}

/* ---------- orquestração do backup automático ---------- */
/* Chamado a cada persist() do app: marca que há alteração pendente e agenda
   um upload alguns segundos depois, pra não subir a cada tecla digitada.
   A marca fica no localStorage — se o app fechar antes do upload (ou sem
   token), o backup é refeito na próxima abertura. */
function driveScheduleBackup(getState) {
  if (!driveEnabled()) return;
  driveGetState = getState;
  const c = driveCfg();
  c.dirtyAt = Date.now();
  saveDriveCfg(c);
  clearTimeout(driveTimer);
  driveTimer = setTimeout(() => { driveTimer = null; driveRunBackup(getState); }, DRIVE_DEBOUNCE_MS);
}

async function driveRunBackup(getState, interactive) {
  if (!driveEnabled()) return;
  driveGetState = getState;
  if (driveBusy) { drivePending = true; return; }
  driveBusy = true;
  driveNotify();
  const startedAt = Date.now();
  try {
    await driveUpload(getState(), interactive);
    const c = driveCfg();
    if (!c.dirtyAt || c.dirtyAt <= startedAt) delete c.dirtyAt; // nada mudou durante o upload
    delete c.error;
    delete c.needsAuth;
    delete c.silentTriedAt;
    saveDriveCfg(c);
  } catch (e) {
    const c = driveCfg();
    if (e.needsAuth) {
      c.needsAuth = true;
      if (e.message !== driveAuthError().message) c.error = e.message; else delete c.error;
    } else {
      c.error = e.message;
    }
    saveDriveCfg(c);
  } finally {
    driveBusy = false;
    driveNotify();
    if (drivePending) { drivePending = false; driveScheduleBackup(getState); }
  }
}

/* Botão "Reconectar": um toque da pessoa, então pode abrir o login. */
function driveReconnect(getState) {
  return driveRunBackup(getState, true);
}

async function driveConnect(getState) {
  await driveGetToken(true, 'backup'); // primeira vez: abre o consentimento do Google (popup ou redirect)
  const c = driveCfg();
  c.enabled = true;
  delete c.error;
  delete c.needsAuth;
  c.dirtyAt = c.dirtyAt || Date.now();
  saveDriveCfg(c);
  driveNotify();
  driveRunBackup(getState); // primeiro backup já na conexão
}

/* Já existe backup no Drive e a pessoa decidiu sobrescrever com os dados daqui. */
function driveOverwriteRemote(getState) {
  const c = driveCfg();
  if (c.remoteFound) c.fileId = c.remoteFound.id;
  delete c.remoteFound;
  c.dirtyAt = Date.now();
  saveDriveCfg(c);
  return driveRunBackup(getState, true);
}

/* Chamado pelo app.js depois que o estado carregou.
   - Voltou do login por redirect: faz o que a pessoa tinha pedido (backup
     ou restauração — nunca sobe os dados locais antes de uma restauração).
   - Ficou alteração sem backup da última vez: tenta agora (renovando o token
     sem interação, se preciso).
   onRestore: função do app que restaura do Drive (já confirmada antes do login). */
function driveAfterInit(getState, onRestore) {
  driveGetState = getState;
  if (drivePendingKick) {
    drivePendingKick = false;
    if (driveReturnIntent === 'restore' && typeof onRestore === 'function') onRestore();
    else driveRunBackup(getState);
    return;
  }
  const c = driveCfg();
  if (!c.enabled) return;
  if (c.remoteFound && !c.fileId) return; // esperando a pessoa escolher nos Ajustes
  if (c.dirtyAt || c.needsAuth) {
    if (driveHasToken()) driveRunBackup(getState);
    else if (!driveMaybeSilentRenew()) {
      if (c.dirtyAt && !c.needsAuth) { c.needsAuth = true; saveDriveCfg(c); driveNotify(); }
    }
  }
}

function driveDisconnect() {
  clearTimeout(driveTimer);
  drivePending = false;
  if (driveToken && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(driveToken.accessToken, () => {}); } catch (e) { /* token já expirado */ }
  }
  driveDropToken();
  saveDriveCfg({}); // mantém o arquivo no Drive; só para de sincronizar
  driveNotify();
}

/* Baixa o backup salvo no Drive (pra restaurar em outro aparelho).
   No PWA, se precisar de login, a página navega pro Google e a restauração
   continua sozinha na volta (via driveAfterInit/onRestore). */
async function driveRestore() {
  const token = await driveGetToken(true, 'restore');
  const cfg = driveCfg();
  let fileId = cfg.fileId || (cfg.remoteFound && cfg.remoteFound.id) || null;
  if (!fileId) {
    const found = await driveFindFile(token);
    if (!found) throw new Error('Nenhum backup encontrado no seu Drive.');
    fileId = found.id;
  }
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) throw await driveHttpError(r, 'ao baixar o backup');
  const data = await r.json();
  const c = driveCfg();
  c.fileId = fileId;
  delete c.remoteFound;
  delete c.dirtyAt; // os dados locais agora são iguais aos do Drive
  delete c.error;
  delete c.needsAuth;
  saveDriveCfg(c);
  return data;
}

/* ---------- gatilhos extras ---------- */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // o iOS congela o JS quando o app vai pro fundo: se havia upload agendado,
  // manda já em vez de esperar o debounce (que talvez nunca dispare)
  document.addEventListener('visibilitychange', () => {
    if (!driveGetState || !driveEnabled()) return;
    if (document.visibilityState === 'hidden') {
      if (driveTimer) { clearTimeout(driveTimer); driveTimer = null; driveRunBackup(driveGetState); }
    } else if (driveCfg().dirtyAt && driveHasToken() && !driveBusy) {
      driveRunBackup(driveGetState); // voltou pro app com backup pendente
    }
  });
  window.addEventListener('online', () => {
    if (driveGetState && driveEnabled() && driveCfg().dirtyAt && driveHasToken()) driveRunBackup(driveGetState);
  });
}

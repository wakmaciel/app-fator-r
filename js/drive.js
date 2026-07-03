/* ==========================================================================
   drive.js — Backup automático no Google Drive
   Usa o Google Identity Services (token no navegador, fluxo implícito).
   ⚠️ Só o client_id entra aqui — o client_secret NUNCA deve ir para o código
   de um app web público; ele não é necessário neste fluxo.
   Requisito no Google Cloud Console: a origem onde o app roda (ex.
   https://SEU-USUARIO.github.io) precisa estar em "Origens JavaScript
   autorizadas" do client OAuth.
   ========================================================================== */

const DRIVE_CLIENT_ID = '1051475440050-jhs326hjnanlq69mtnmt0bahqo8rnk53.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'; // só arquivos criados pelo app
const DRIVE_FILENAME = 'fator-r-backup.json';
const DRIVE_CFG_KEY = 'fatorr:drive:v1';
const DRIVE_TOKEN_KEY = 'fatorr:drive:token'; // cache de sessão (sobrevive ao redirect do login)
const DRIVE_DEBOUNCE_MS = 4000; // espera a pessoa parar de digitar antes de subir

let driveToken = null;       // { accessToken, expiresAt }
let driveTokenClient = null;
let driveTimer = null;
let driveBusy = false;
let drivePending = false;    // mudou algo enquanto um upload estava em andamento
let drivePendingKick = false; // acabou de voltar do login por redirect — fazer 1º backup

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

function driveRedirectAuth() {
  const params = new URLSearchParams({
    client_id: DRIVE_CLIENT_ID,
    redirect_uri: driveRedirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'true',
    state: 'fatorr-drive',
  });
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

function driveCacheToken(token) {
  driveToken = token;
  try { sessionStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(token)); } catch (e) { /* segue só em memória */ }
}

/* Roda no carregamento: se a URL tem um token do Google no hash (volta do
   login por redirect), guarda o token, ativa o backup e limpa a URL. */
(function driveHandleRedirectReturn() {
  try {
    if (!location.hash || location.hash.indexOf('access_token=') === -1) return;
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('state') !== 'fatorr-drive' || !h.get('access_token')) return;
    driveCacheToken({
      accessToken: h.get('access_token'),
      expiresAt: Date.now() + (Number(h.get('expires_in')) || 3600) * 1000,
    });
    const c = driveCfg();
    c.enabled = true;
    delete c.error;
    saveDriveCfg(c);
    drivePendingKick = true;
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) { /* hash inesperado — ignora */ }
})();

/* Reaproveita token ainda válido guardado na sessão (ex.: app reaberto). */
(function driveLoadCachedToken() {
  if (driveToken) return;
  try {
    const cached = JSON.parse(sessionStorage.getItem(DRIVE_TOKEN_KEY));
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
  return { enabled: !!c.enabled, lastBackup: c.lastBackup || null, error: c.error || null, busy: driveBusy };
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
   - Navegador comum: popup do Google Identity Services (renova sem popup se
     a sessão do Google estiver ativa).
   - PWA instalado (iOS/Android): popup não é confiável — se `interactive`,
     navega pro login do Google e volta com o token na URL (fluxo redirect);
     se não for interativo (backup agendado), falha com aviso pra pessoa
     reconectar por um toque nos Ajustes. */
function driveGetToken(interactive) {
  if (driveToken && Date.now() < driveToken.expiresAt - 60000) return Promise.resolve(driveToken.accessToken);

  if (driveIsStandalone()) {
    if (interactive) {
      driveRedirectAuth();
      return new Promise(() => {}); // a página vai navegar — nunca resolve
    }
    return Promise.reject(new Error('Sessão do Google expirou. Abra Ajustes e toque em "Fazer backup agora" para reconectar.'));
  }

  return driveEnsureGis().then(() => new Promise((resolve, reject) => {
    if (!driveTokenClient) {
      driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {},
      });
    }
    driveTokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      driveCacheToken({
        accessToken: resp.access_token,
        expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
      });
      resolve(driveToken.accessToken);
    };
    driveTokenClient.error_callback = (err) => reject(new Error((err && err.message) || 'Autorização do Google cancelada ou bloqueada.'));
    driveTokenClient.requestAccessToken({ prompt: '' });
  }));
}

/* ---------- chamadas à API do Drive ---------- */
/* Token recusado pelo Drive (expirou ou foi revogado): descarta o cache pra
   próxima tentativa interativa refazer o login, e devolve um erro amigável. */
function driveAuthExpired() {
  driveToken = null;
  try { sessionStorage.removeItem(DRIVE_TOKEN_KEY); } catch (e) { /* sem sessão */ }
  return new Error('Sessão do Google expirou. Toque em "Fazer backup agora" nos Ajustes para reconectar.');
}

async function driveFindFile(token) {
  const q = encodeURIComponent(`name='${DRIVE_FILENAME}' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (r.status === 401) throw driveAuthExpired();
  if (!r.ok) throw new Error('Drive respondeu ' + r.status + ' ao procurar o backup.');
  const data = await r.json();
  return (data.files && data.files[0]) || null;
}

async function driveUpload(state, interactive) {
  const token = await driveGetToken(interactive);
  const cfg = driveCfg();
  let fileId = cfg.fileId || null;
  if (!fileId) {
    const found = await driveFindFile(token);
    if (found) fileId = found.id;
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
  const r = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
  if (r.status === 401) throw driveAuthExpired();
  if (r.status === 404 && fileId) {
    // o arquivo foi apagado direto no Drive — esquece o id e cria de novo
    const c = driveCfg(); delete c.fileId; saveDriveCfg(c);
    return driveUpload(state, interactive);
  }
  if (!r.ok) throw new Error('Falha no upload para o Drive (' + r.status + ').');
  const data = await r.json();
  const c2 = driveCfg();
  c2.fileId = data.id || fileId;
  c2.lastBackup = new Date().toISOString();
  delete c2.error;
  saveDriveCfg(c2);
}

/* ---------- orquestração do backup automático ---------- */
/* Chamado a cada persist() do app: agenda um upload alguns segundos depois
   da última alteração, pra não subir a cada tecla digitada. */
function driveScheduleBackup(getState) {
  if (!driveEnabled()) return;
  clearTimeout(driveTimer);
  driveTimer = setTimeout(() => driveRunBackup(getState), DRIVE_DEBOUNCE_MS);
}

async function driveRunBackup(getState, interactive) {
  if (!driveEnabled()) return;
  if (driveBusy) { drivePending = true; return; }
  driveBusy = true;
  driveNotify();
  try {
    await driveUpload(getState(), interactive);
  } catch (e) {
    const c = driveCfg(); c.error = e.message; saveDriveCfg(c);
  } finally {
    driveBusy = false;
    driveNotify();
    if (drivePending) { drivePending = false; driveScheduleBackup(getState); }
  }
}

async function driveConnect(getState) {
  await driveGetToken(true); // primeira vez: abre o consentimento do Google (popup ou redirect)
  const c = driveCfg();
  c.enabled = true;
  delete c.error;
  saveDriveCfg(c);
  driveNotify();
  driveRunBackup(getState); // primeiro backup já na conexão
}

/* Chamado pelo app.js depois que o estado carregou: se acabamos de voltar
   do login por redirect, dispara o primeiro backup imediatamente. */
function driveAfterInit(getState) {
  if (drivePendingKick) {
    drivePendingKick = false;
    driveRunBackup(getState);
  }
}

function driveDisconnect() {
  clearTimeout(driveTimer);
  drivePending = false;
  if (driveToken && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(driveToken.accessToken, () => {}); } catch (e) { /* token já expirado */ }
  }
  driveToken = null;
  try { sessionStorage.removeItem(DRIVE_TOKEN_KEY); } catch (e) { /* sem sessão */ }
  saveDriveCfg({}); // mantém o arquivo no Drive; só para de sincronizar
  driveNotify();
}

/* Baixa o backup salvo no Drive (pra restaurar em outro aparelho). */
async function driveRestore() {
  const token = await driveGetToken(true);
  const cfg = driveCfg();
  let fileId = cfg.fileId || null;
  if (!fileId) {
    const found = await driveFindFile(token);
    if (!found) throw new Error('Nenhum backup encontrado no seu Drive.');
    fileId = found.id;
    cfg.fileId = fileId;
    saveDriveCfg(cfg);
  }
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (r.status === 401) throw driveAuthExpired();
  if (!r.ok) throw new Error('Falha ao baixar o backup (' + r.status + ').');
  return r.json();
}

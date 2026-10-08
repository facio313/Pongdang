// Installed only in pongdang-domain-auth. Registration uses the existing central
// account writer. Never log credentials, cookies, OAuth URLs or response bodies.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';
import { registerPongdangAccount, registrationInput, RegistrationError } from './pongdang-registration.mjs';

const ORIGIN = 'https://pongdang.site';
const SSO = 'https://bonifacio.work/sso';
const AUTHORIZE = `${SSO}/api/oidc/authorization`;
const CALLBACK = `${ORIGIN}/oauth2/callback`;
const CONTINUE = `${ORIGIN}/pongdang/auth/continue`;
const OAUTH = 'http://pongdang-oauth2:4180';
const SESSION = /^__Host-pongdang_session(?:_\d+)?$/;

function trusted(request, edgeSecret) {
  const supplied = Buffer.from(request.headers['x-portfolio-edge-secret'] ?? '');
  const expected = Buffer.from(edgeSecret);
  return expected.length >= 32 && supplied.length === expected.length
    && timingSafeEqual(supplied, expected)
    && request.headers['x-original-host'] === 'pongdang.site';
}

// Preserve the installed gate: signed OAuth identity AND the current central
// account/grants are required. A first-factor OK response is never authorization.
export async function authorizePongdang(request, response, { store, edgeSecret, normalizeUsername, refreshApplications, fetchAuth = fetch, audit = () => {} }) {
  const finish = (status, headers = {}) => response.writeHead(status, { 'Cache-Control': 'no-store', ...headers }).end();
  const denied = (reason) => { audit(reason); return finish(403); };
  if (!trusted(request, edgeSecret)) return finish(401);
  const auth = await fetchAuth(`${OAUTH}/oauth2/auth`, {
    headers: { Cookie: request.headers.cookie ?? '', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'pongdang.site' },
    redirect: 'manual', signal: AbortSignal.timeout(5000),
  });
  await auth.body?.cancel();
  if (auth.status === 403) return denied('oauth-session');
  if (auth.status !== 202) return finish(auth.status === 401 ? 401 : 503);
  const username = auth.headers.get('x-auth-request-preferred-username') ?? '';
  if (!username || normalizeUsername(username) !== username) return denied('username-claim');
  refreshApplications();
  const database = await store.read();
  const record = Object.hasOwn(database.users, username) ? database.users[username] : null;
  if (!record) return denied('unknown-account');
  if (record.disabled) return denied('disabled-account');
  if (record.email !== auth.headers.get('x-auth-request-email')) return denied('email-claim');
  const groups = (auth.headers.get('x-auth-request-groups') ?? '').split(',');
  if (groups.length !== record.groups.length || new Set(groups).size !== groups.length
    || record.groups.some((group) => !groups.includes(group))) return denied('groups-claim');
  if (!groups.includes('portfolio-v2') || (!groups.includes('chief-admin') && !groups.includes('access-pongdang'))) return denied('application-grant');
  return finish(200, {
    'Remote-User': username,
    'Remote-Email': record.email,
    'Remote-Groups': record.groups.join(','),
    'X-Pongdang-Grants': groups.includes('access-pongdang') ? record.groups.join(',') : `${record.groups.join(',')},access-pongdang`,
  });
}

class LoginError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
function unavailable() { throw new LoginError(503, 'SSO_LOGIN_UNAVAILABLE'); }
function redirect(response, base) {
  if (![302, 303].includes(response.status)) unavailable();
  const value = response.headers.get('location');
  if (!value || value.length > 8192) unavailable();
  const url = new URL(value, base);
  if (url.username || url.password || url.hash) unavailable();
  return url;
}

// Separate, short-lived cookie jars: no central SSO cookie ever reaches the
// browser or the OAuth proxy. All of this state dies with the single request.
class Cookies {
  values = new Map();
  capture(response) {
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 16 || cookies.join('').length > 32768) unavailable();
    for (const cookie of cookies) {
      const pair = cookie.split(';', 1)[0];
      const split = pair.indexOf('=');
      if (split < 1 || /[\r\n]/.test(cookie)) unavailable();
      const name = pair.slice(0, split);
      if (!pair.slice(split + 1) || /;\s*max-age=0(?:;|$)/i.test(cookie)) this.values.delete(name);
      else this.values.set(name, pair);
    }
    return cookies;
  }
  header() { return [...this.values.values()].join('; '); }
  clear() { this.values.clear(); }
}

async function smallJson(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) unavailable();
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 16384) unavailable();
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Complete the existing authorization-code + PKCE flow server-side. No token
 * minting, password store, permission fallback, cookie-domain rewrite or CORS. */
export async function completeInlineLogin(credentials, { fetchUpstream = fetch, authorize, signal }) {
  const oauth = new Cookies(), central = new Cookies();
  const oauthHeaders = () => ({ Host: 'pongdang.site', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'pongdang.site', Cookie: oauth.header() });
  const options = { redirect: 'manual', signal };
  try {
    const start = await fetchUpstream(`${OAUTH}/oauth2/start?rd=${encodeURIComponent(CONTINUE)}`, { ...options, headers: oauthHeaders() });
    oauth.capture(start);
    await start.body?.cancel();
    const authorization = redirect(start, ORIGIN);
    if (authorization.origin + authorization.pathname !== AUTHORIZE
      || authorization.searchParams.get('client_id') !== 'pongdang-site'
      || authorization.searchParams.get('redirect_uri') !== CALLBACK
      || authorization.searchParams.get('response_type') !== 'code'
      || authorization.searchParams.get('code_challenge_method') !== 'S256'
      || !authorization.searchParams.get('code_challenge')
      || !authorization.searchParams.get('state') || !authorization.searchParams.get('nonce')) unavailable();

    const login = await fetchUpstream(`${SSO}/api/firstfactor`, {
      ...options, method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: central.header() },
      body: JSON.stringify({ username: credentials.username, password: credentials.password, keepMeLoggedIn: false }),
    });
    credentials.password = '';
    central.capture(login);
    if (login.status === 401) { await login.body?.cancel(); throw new LoginError(401, 'SSO_INVALID_CREDENTIALS'); }
    if (login.status === 429) { await login.body?.cancel(); throw new LoginError(429, 'SSO_LOGIN_RATE_LIMITED'); }
    if (login.status !== 200) { await login.body?.cancel(); unavailable(); }
    if ((await smallJson(login)).status !== 'OK') unavailable();

    const consent = await fetchUpstream(authorization.href, { ...options, headers: { Cookie: central.header() } });
    central.capture(consent);
    await consent.body?.cancel();
    const callback = redirect(consent, SSO);
    if (callback.origin + callback.pathname !== CALLBACK) {
      // Do not waive a newly required second factor or explicit consent.
      if (callback.origin === new URL(SSO).origin && ['/sso', '/sso/'].includes(callback.pathname)) {
        throw new LoginError(409, 'SSO_ADDITIONAL_STEP_REQUIRED');
      }
      unavailable();
    }
    if (callback.searchParams.has('error')) throw new LoginError(403, 'SSO_GRANT_REQUIRED');
    if (!callback.searchParams.get('code')
      || callback.searchParams.get('state') !== authorization.searchParams.get('state')) unavailable();
    const exchanged = await fetchUpstream(`${OAUTH}${callback.pathname}${callback.search}`, { ...options, headers: oauthHeaders() });
    const cookies = oauth.capture(exchanged);
    await exchanged.body?.cancel();
    if (redirect(exchanged, ORIGIN).href !== CONTINUE) unavailable();
    const sessionCookies = cookies.filter(cookie => SESSION.test(cookie.slice(0, cookie.indexOf('='))));
    if (!sessionCookies.length || sessionCookies.some(cookie => !/;\s*secure(?:;|$)/i.test(cookie)
      || !/;\s*httponly(?:;|$)/i.test(cookie) || !/;\s*path=\/(?:;|$)/i.test(cookie)
      || /;\s*domain=/i.test(cookie))) unavailable();
    const status = await authorize(oauth.header());
    if (status === 403) throw new LoginError(403, 'SSO_GRANT_REQUIRED');
    if (status !== 200) unavailable();
    return sessionCookies;
  } finally {
    credentials.password = '';
    oauth.clear();
    central.clear();
  }
}

async function credentialsFrom(request, registration = false) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw new LoginError(413, 'LOGIN_BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new LoginError(400, 'INVALID_LOGIN_REQUEST'); }
  if (registration) return registrationInput(data);
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || Object.keys(data).some(key => !['username', 'password'].includes(key))
    || typeof data.username !== 'string' || !data.username.trim() || data.username.length > 255
    || /[\x00-\x1f\x7f]/.test(data.username)
    || typeof data.password !== 'string' || !data.password || data.password.length > 2048) {
    throw new LoginError(400, 'INVALID_LOGIN_REQUEST');
  }
  data.username = data.username.trim();
  return data;
}

export function createDomainServer(dependencies) {
  const { store, edgeSecret, refreshApplications, audit = () => {} } = dependencies;
  const attempts = new Map();
  let active = 0;
  let activeRegistrations = 0;
  let registrationWindow = { until: 0, count: 0 };
  const registrationAvailable = dependencies.registrationEnabled === true
    && typeof dependencies.hashPassword === 'function'
    && typeof dependencies.serializeUserDatabase === 'function'
    && typeof dependencies.groupsForAssignment === 'function'
    && typeof store.readVersioned === 'function' && typeof store.mutate === 'function';
  const send = (response, status, detail, cookies = [], authenticated = status === 200, extra = {}) => response.writeHead(status, {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...(cookies.length ? { 'Set-Cookie': cookies } : {}),
    ...(status === 429 ? { 'Retry-After': '60' } : {}),
  }).end(JSON.stringify({ authenticated, ...(detail ? { detail } : {}), ...extra }));
  const authorizedStatus = async (request, cookie) => {
    let status = 503;
    await authorizePongdang({ headers: { ...request.headers, cookie } }, {
      writeHead(value) { status = value; return this; }, end() {},
    }, dependencies);
    return status;
  };
  const server = createServer(async (request, response) => {
    let admitted = false;
    let registrationAdmitted = false;
    const controller = new AbortController();
    response.on('close', () => { if (!response.writableEnded) controller.abort(); });
    try {
      if (request.method === 'GET' && request.url === '/healthz') {
        refreshApplications();
        await store.read();
        response.writeHead(200).end('ok');
        return;
      }
      if (request.url === '/authz') { await authorizePongdang(request, response, dependencies); return; }
      if (!['/inline/state', '/inline/login', '/inline/logout', '/inline/register'].includes(request.url)) { send(response, 404, 'NOT_FOUND'); return; }
      if (!trusted(request, edgeSecret)) { send(response, 401, 'SSO_AUTHENTICATION_REQUIRED'); return; }
      if (request.url === '/inline/state' && request.method === 'GET') {
        const status = await authorizedStatus(request, request.headers.cookie ?? '');
        send(response, status, status === 401 ? 'SSO_AUTHENTICATION_REQUIRED' : status === 403 ? 'SSO_GRANT_REQUIRED' : undefined, [], status === 200, { registration_available: registrationAvailable });
        return;
      }
      if (!['/inline/login', '/inline/logout', '/inline/register'].includes(request.url) || request.method !== 'POST') { send(response, 405, 'METHOD_NOT_ALLOWED'); return; }
      if (request.headers.origin !== ORIGIN || request.headers['sec-fetch-site'] === 'cross-site') {
        send(response, 403, 'ORIGIN_NOT_ALLOWED'); return;
      }
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) { send(response, 415, 'JSON_REQUIRED'); return; }
      const ip = request.headers['x-real-ip'];
      if (typeof ip !== 'string' || !isIP(ip)) { send(response, 403, 'TRUSTED_CLIENT_IP_REQUIRED'); return; }
      if (request.url === '/inline/logout') {
        // Expire only this browser's host-scoped Pongdang session, including
        // chunked cookies. Central SSO and other applications keep their sessions.
        const names = new Set(['__Host-pongdang_session']);
        for (const pair of (request.headers.cookie ?? '').split(';')) {
          const name = pair.trim().split('=', 1)[0];
          if (SESSION.test(name)) names.add(name);
        }
        const cookies = [...names].map(name => `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax`);
        send(response, 200, undefined, cookies, false);
        audit('inline-logout-completed');
        return;
      }
      const now = Date.now();
      const registering = request.url === '/inline/register';
      if (registering && !registrationAvailable) { send(response, 503, 'SSO_REGISTRATION_UNAVAILABLE'); return; }
      if (registrationWindow.until <= now) registrationWindow = { until: now + 3600000, count: 0 };
      if (registering && (activeRegistrations >= 2 || registrationWindow.count >= 30)) {
        send(response, 429, 'SSO_REGISTRATION_RATE_LIMITED'); return;
      }
      for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
      const previous = attempts.get(ip);
      if (active >= 8 || (previous?.count ?? 0) >= 5 || (!previous && attempts.size >= 4096)) {
        send(response, 429, 'SSO_LOGIN_RATE_LIMITED'); return;
      }
      attempts.set(ip, { count: (previous?.count ?? 0) + 1, until: previous?.until ?? now + 60000 });
      active++; admitted = true;
      if (registering) {
        activeRegistrations++; registrationAdmitted = true;
        registrationWindow.count++;
        const input = await credentialsFrom(request, true);
        await registerPongdangAccount(input, {
          ...dependencies, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
        });
        send(response, 201, undefined, [], false, { registered: true });
        audit('inline-registration-completed');
        return;
      }
      const credentials = await credentialsFrom(request);
      const cookies = await completeInlineLogin(credentials, {
        fetchUpstream: dependencies.fetchUpstream,
        authorize: cookie => authorizedStatus(request, cookie),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
      });
      send(response, 200, undefined, cookies);
      audit('inline-login-completed');
    } catch (error) {
      const expected = error instanceof LoginError || error instanceof RegistrationError;
      const status = expected ? error.status : 503;
      const code = expected ? error.message : request.url === '/inline/register' ? 'SSO_REGISTRATION_UNAVAILABLE' : 'SSO_LOGIN_UNAVAILABLE';
      if (!response.headersSent && !response.destroyed) send(response, status, code);
      audit(code);
    } finally {
      controller.abort();
      if (admitted) active--;
      if (registrationAdmitted) activeRegistrations--;
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Existing central-store reader from the installed Bonifacio image, not a new
  // user database. Import only at runtime so the protocol can be tested offline.
  const { UserStore, normalizeUsername, refreshApplications, hashPassword, serializeUserDatabase, groupsForAssignment } = await import('./admin/lib.mjs');
  const store = new UserStore(process.env.USERS_DATABASE_PATH);
  const edgeSecret = readFileSync(process.env.ADMIN_EDGE_SECRET_FILE, 'utf8').trim();
  createDomainServer({ store, edgeSecret, normalizeUsername, refreshApplications,
    hashPassword, serializeUserDatabase, groupsForAssignment, registrationEnabled: process.env.PONGDANG_REGISTRATION_ENABLED === 'true',
    audit: reason => console.warn(`Pongdang authorization: ${reason}`),
  }).listen(4189, '0.0.0.0');
}

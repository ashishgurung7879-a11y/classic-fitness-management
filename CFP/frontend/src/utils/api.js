export function getApiBaseUrl() {
  const runtimeApiBaseUrl =
    window.CFPAppConfig?.getApiBaseUrl?.() ||
    window.CFP_CONFIG?.apiBaseUrl ||
    '';

  if (runtimeApiBaseUrl) {
    return runtimeApiBaseUrl;
  }

  const hostname = window.location.hostname;
  const localAppPorts = new Set(['5000', '8080', '4173']);
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '';

  if (window.location.protocol === 'file:') {
    return 'http://localhost:5000/api';
  }

  if (isLocalHost) {
    const currentPort = window.location.port || '';
    if (currentPort && currentPort !== '5000') {
      return 'http://localhost:5000/api';
    }
  }
if (isLocalHost) {
  return 'http://localhost:5000/api';
}

// Production backend
return 'https://classicfitnesspark.com/api';
}

export const API_URL = getApiBaseUrl();

export const TOKEN_KEYS = {
  member: 'cfp_token',
  admin: 'cfp_admin_token',
  trainer: 'cfp_trainer_token',
};

export const USER_KEYS = {
  member: 'cfp_user',
  admin: 'cfp_admin_user',
  trainer: 'cfp_trainer_user',
};

function resolveStorageKeys(role = 'member') {
  return {
    tokenKey: TOKEN_KEYS[role] || TOKEN_KEYS.member,
    userKey: USER_KEYS[role] || USER_KEYS.member,
  };
}

function buildFetchConfig(options, token) {
  const { body, headers = {}, ...rest } = options || {};
  const config = {
    cache: 'no-store',
    ...rest,
    headers: { ...headers },
  };

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const isStringBody = typeof body === 'string';
    if (isFormData || isStringBody) {
      config.body = body;
    } else {
      config.body = JSON.stringify(body);
      if (!config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
      }
    }
  }

  return config;
}

async function parseResponse(res) {
  const raw = await res.text();
  if (!raw) {
    return res.ok
      ? {}
      : { message: `Request failed (${res.status} ${res.statusText})` };
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

export async function api(endpoint, options = {}, tokenKey = TOKEN_KEYS.member) {
  const token = tokenKey ? localStorage.getItem(tokenKey) : '';
  const config = buildFetchConfig(options, token);

  try {
    const res = await fetch(API_URL + endpoint, config);
    const data = await parseResponse(res);

    if (res.status === 401 && tokenKey) {
      localStorage.removeItem(tokenKey);
      Object.values(USER_KEYS).forEach((candidateKey) => {
        if (tokenKey.replace('_token', '_user') === candidateKey) {
          localStorage.removeItem(candidateKey);
        }
      });
    }

    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { message: 'Cannot connect to server. Make sure the API is running and reachable.' },
    };
  }
}

export function setSession(role, token, user) {
  const { tokenKey, userKey } = resolveStorageKeys(role);
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(userKey, JSON.stringify(user));
}

export function clearSession(role) {
  const { tokenKey, userKey } = resolveStorageKeys(role);
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
}

export function getStoredUser(role) {
  const { userKey } = resolveStorageKeys(role);
  try {
    return JSON.parse(localStorage.getItem(userKey) || 'null');
  } catch {
    return null;
  }
}

export async function fileToDataUrl(file) {
  if (!file) return '';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export const publicApi = (ep, opts) => api(ep, opts, '');
export const memberApi = (ep, opts) => api(ep, opts, TOKEN_KEYS.member);
export const adminApi = (ep, opts) => api(ep, opts, TOKEN_KEYS.admin);
export const trainerApi = (ep, opts) => api(ep, opts, TOKEN_KEYS.trainer);

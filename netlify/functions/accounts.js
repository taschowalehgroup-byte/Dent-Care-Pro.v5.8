/**
 * DentCare Pro — Persistent Auth via Netlify Blobs
 *
 * Handles login with persistent user accounts stored in Blobs.
 * On first login attempt, seeds from the in-memory fallback list.
 *
 * Endpoints:
 *   POST /.netlify/functions/accounts/login          → { success, user }
 *   POST /.netlify/functions/accounts/register       → { success, user }   (admin only flow)
 *   POST /.netlify/functions/accounts/reset-password → { success }
 *
 * Required env vars (set in Netlify dashboard → Site config → Env vars):
 *   NETLIFY_SITE_ID      — your site ID (from Site configuration → General)
 *   NETLIFY_AUTH_TOKEN   — your personal access token
 */

const { getStore } = require('@netlify/blobs');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

// Seed users from passwords.json (matches your database/JSON/passwords.json)
const SEED_USERS = [
  { id: 1,  username: 'admin',        password: 'VS-18', role: 'admin',        doctor_id: null },
  { id: 2,  username: 'manager',      password: 'PV-25', role: 'manager',      doctor_id: null },
  { id: 3,  username: 'Doctor',       password: 'MX-31', role: 'doctor',       doctor_id: 1 },
  { id: 10, username: 'receptionist', password: 'FD-64', role: 'receptionist', doctor_id: null },
  { id: 12, username: 'DX-01',        password: 'AX-70', role: 'doctor',       doctor_id: null },
];

async function getDB(store) {
  try {
    const raw = await store.get('users', { type: 'json' });
    if (raw && raw.users && raw.users.length > 0) return raw;
    // First run: seed from static list
    const seeded = { users: SEED_USERS };
    await store.setJSON('users', seeded);
    return seeded;
  } catch(e) {
    return { users: SEED_USERS };
  }
}

async function saveDB(store, db) {
  await store.setJSON('users', db);
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  // ── Init Blobs store ───────────────────────────────────────────
  let store;
  try {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token  = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_TOKEN;
    const opts   = siteID && token ? { siteID, token } : {};
    store = getStore({ name: 'dentcare-accounts', ...opts });
  } catch(e) {
    console.error('getStore failed:', e.message);
    return json(500, { success: false, message: 'DB init failed: ' + e.message });
  }

  const path   = (event.path || '').replace(/.*\/accounts/, '').replace(/^\/+/, '');
  const method = event.httpMethod;

  // ── POST /login ────────────────────────────────────────────────
  if (method === 'POST' && path === 'login') {
    let body;
    try { body = JSON.parse(event.body); }
    catch(e) { return json(400, { success: false, message: 'Invalid JSON' }); }

    const { username, password } = body;
    if (!username || !password)
      return json(400, { success: false, message: 'Username and password required' });

    const db   = await getDB(store);
    const user = db.users.find(u => u.username === username && u.password === password);
    if (!user) return json(401, { success: false, message: 'Incorrect username or password' });

    const { password: _, ...safe } = user;
    return json(200, { success: true, message: 'Login successful', user: safe });
  }

  // ── POST /register (admin-created accounts) ────────────────────
  if (method === 'POST' && path === 'register') {
    let body;
    try { body = JSON.parse(event.body); }
    catch(e) { return json(400, { success: false, message: 'Invalid JSON' }); }

    const { username, password, role, doctor_id } = body;
    if (!username || !password)
      return json(400, { success: false, message: 'Username and password required' });

    const db = await getDB(store);
    if (db.users.find(u => u.username === username))
      return json(409, { success: false, message: 'Username already exists' });

    const newUser = {
      id: Math.max(...db.users.map(u => u.id || 0), 0) + 1,
      username,
      password,
      role: role || 'receptionist',
      doctor_id: doctor_id || null,
      created_at: new Date().toISOString(),
    };
    db.users.push(newUser);
    await saveDB(store, db);

    const { password: _, ...safe } = newUser;
    return json(201, { success: true, message: 'User created', user: safe });
  }

  // ── POST /reset-password ───────────────────────────────────────
  if (method === 'POST' && path === 'reset-password') {
    let body;
    try { body = JSON.parse(event.body); }
    catch(e) { return json(400, { success: false, message: 'Invalid JSON' }); }

    const { username, new_password } = body;
    if (!username || !new_password)
      return json(400, { success: false, message: 'Username and new_password required' });

    const db   = await getDB(store);
    const user = db.users.find(u => u.username === username);
    if (!user) return json(404, { success: false, message: 'User not found' });

    user.password = new_password;
    await saveDB(store, db);
    return json(200, { success: true });
  }

  return json(404, { success: false, message: 'Not found' });
};

// server.js
// 目的：AEプラグイン等から「操作ログ（ハッシュチェーン）」をリアルタイム受信し、自動審査。
// 承認された完成動画だけを公開照合に回す。従来のファイル照合UIも継続利用可能。
// Thunder Client / curl 両対応（multipart と 生バイナリ の両方に対応）

require("dotenv").config({ path: __dirname + '/.env' });



const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const mime = require('mime-types');

const app = express();
// ★ 修正点: 4000固定 ★
const PORT = 4000;

// ============== Middlewares ==============
app.use(cors());
app.use(express.json({ limit: '50mb' }));           // JSON（イベント送信用）
app.use(express.urlencoded({ extended: true }));     // 既存フォーム互換
app.use(express.static(path.join(__dirname, 'public')));

// アップロード済みファイルの公開パス（承認済みは /uploads/verified/... から配信）
const UPLOAD_DIR   = path.join(__dirname, 'uploads');
const PENDING_DIR  = path.join(UPLOAD_DIR, 'pending');   // 承認前
const VERIFIED_DIR = path.join(UPLOAD_DIR, 'verified');  // 承認後（公開）
const REJECTED_DIR = path.join(UPLOAD_DIR, 'rejected');  // 却下
for (const dir of [UPLOAD_DIR, PENDING_DIR, VERIFIED_DIR, REJECTED_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
app.use('/uploads', express.static(UPLOAD_DIR));    // /uploads/* を公開

// ============== DB 初期化 ==============
const db = new Database(path.join(__dirname, 'registry.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,
    user_id TEXT,
    project_name TEXT,
    status TEXT DEFAULT 'in_progress', -- in_progress / finished / approved / rejected / invalid
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    timestamp TEXT,
    event_type TEXT,      -- 例: composition.create / layer.add / effect.apply / render.start / render.finish など
    event_json TEXT,      -- 正規化済みJSON文字列
    prev_hash TEXT,
    hash TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    final_hash TEXT,      -- 完成動画のSHA-256
    final_filename TEXT,  -- サーバー保存ファイル名（null あり）
    status TEXT DEFAULT 'pending',   -- pending / approved / rejected
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ============== SQL 準備 ==============
const findApprovedByFinalHash = db.prepare(`
  SELECT o.*, s.user_id, s.project_name
  FROM outputs o
  JOIN sessions s ON s.session_id = o.session_id
  WHERE o.final_hash = ? AND o.status = 'approved'
`);
const insertSession = db.prepare(`
  INSERT INTO sessions (session_id, user_id, project_name, status)
  VALUES (@session_id, @user_id, @project_name, 'in_progress')
`);
const getSession = db.prepare(`SELECT * FROM sessions WHERE session_id = ?`);
const updateSessionStatus = db.prepare(`UPDATE sessions SET status = ? WHERE session_id = ?`);
const insertEvent = db.prepare(`
  INSERT INTO events (session_id, timestamp, event_type, event_json, prev_hash, hash)
  VALUES (@session_id, @timestamp, @event_type, @event_json, @prev_hash, @hash)
`);
const getLastEvent = db.prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY id DESC LIMIT 1`);
const getEventsBySession = db.prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY id ASC`);
const insertOutput = db.prepare(`
  INSERT INTO outputs (session_id, final_hash, final_filename, status)
  VALUES (@session_id, @final_hash, @final_filename, 'pending')
`);
const updateOutputStatus = db.prepare(`UPDATE outputs SET status = ? WHERE session_id = ?`);
const getOutputBySession = db.prepare(`SELECT * FROM outputs WHERE session_id = ?`);

// ============== Multer（multipart/form-data 用） ==============
const upload = multer({ storage: multer.memoryStorage() });

// ============== Utils ==============
function sha256(bufferOrString) {
  return crypto.createHash('sha256').update(bufferOrString).digest('hex');
}
function safeJSONStringify(obj) {
  const normalize = (o) => {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(normalize);
    const sorted = {};
    Object.keys(o).sort().forEach(k => { sorted[k] = normalize(o[k]); });
    return sorted;
  };
  return JSON.stringify(normalize(obj));
}
function genSessionId() {
  return (crypto.randomUUID ? crypto.randomUUID() : sha256(String(Math.random()) + Date.now())).replace(/-/g, '');
}

// ---- Supabase REST helper (approval record) ----
async function recordApprovalToSupabase({ final_hash, session_id, user_id, project_name, file_url }) {
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !svc) {
    console.warn('[supabase] skipped (no env SUPABASE_URL / SUPABASE_SERVICE_KEY)');
    return;
  }
  const endpoint = `${url}/rest/v1/approved_outputs`;
  const payload = [{ final_hash, session_id, user_id, project_name, file_url }];
  try {
    // Node 18+ has global fetch
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': svc,
        'Authorization': `Bearer ${svc}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('[supabase] insert failed:', res.status, txt);
    } else {
      console.log('[supabase] approval recorded');
    }
  } catch (e) {
    console.error('[supabase] error:', e);
  }
}

// ============== 0) 既存：ファイル照合API（第三者向け） ==============
app.post('/api/checkFile', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const h = sha256(req.file.buffer);
    const row = findApprovedByFinalHash.get(h);
    return res.json({ registered: !!row, record: row || null, hash: h });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/check/:hash', (req, res) => {
  try {
    const h = String(req.params.hash || '').trim();
    const row = findApprovedByFinalHash.get(h);
    return res.json({ registered: !!row, record: row || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============== 1) セッション開始 ==============
app.post('/api/log/start', (req, res) => {
  try {
    const { user_id, project_name } = req.body || {};
    const session_id = genSessionId();
    insertSession.run({ session_id, user_id: user_id || null, project_name: project_name || null });
    return res.json({ ok: true, session_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// ============== 2) イベント受信（ハッシュチェーン） ==============
app.post('/api/log/event', (req, res) => {
  try {
    const { session_id, timestamp, event, prev_hash, hash } = req.body || {};
    if (!session_id || !timestamp || !event || typeof prev_hash !== 'string' || !hash) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }
    const sess = getSession.get(session_id);
    if (!sess) return res.status(404).json({ ok: false, error: 'session_not_found' });

    const last = getLastEvent.get(session_id);
    const expectedPrev = last ? last.hash : '0';
    if (prev_hash !== expectedPrev) {
      updateSessionStatus.run('invalid', session_id);
      return res.status(400).json({ ok: false, error: 'prev_hash_mismatch', expectedPrev });
    }

    const event_json = safeJSONStringify(event);
    const serverHash = sha256(prev_hash + '|' + timestamp + '|' + event_json);
    if (serverHash !== hash) {
      updateSessionStatus.run('invalid', session_id);
      return res.status(400).json({ ok: false, error: 'hash_mismatch', serverHash });
    }

    insertEvent.run({
      session_id,
      timestamp,
      event_type: (event.type || 'unknown'),
      event_json,
      prev_hash,
      hash
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// ============== 3) 完了（最終動画の受領＋自動審査） ==============
const finishRawMiddleware = express.raw({ type: '*/*', limit: '2gb' });

// 3-A) multipart/form-data 版
app.post('/api/log/finish', multer({ storage: multer.memoryStorage() }).single('final_file'), async (req, res) => {
  try {
    const { session_id, final_hash } = req.body || {};
    if (!session_id) return res.status(400).json({ ok: false, error: 'session_id_required' });

    const sess = getSession.get(session_id);
    if (!sess) return res.status(404).json({ ok: false, error: 'session_not_found' });

    let fhash = String(final_hash || '').trim() || null;
    let storedFilename = null;

    if (req.file && req.file.buffer) {
      const ext = mime.extension(req.file.mimetype) || 'mp4';
      const tmpHash = sha256(req.file.buffer);
      fhash = fhash || tmpHash;
      storedFilename = `${fhash}.${ext}`;
      fs.writeFileSync(path.join(PENDING_DIR, storedFilename), req.file.buffer);
    }

    if (!fhash) return res.status(400).json({ ok: false, error: 'final_hash_or_file_required' });

    insertOutput.run({ session_id, final_hash: fhash, final_filename: storedFilename });
    updateSessionStatus.run('finished', session_id);

    const verdict = verifySessionAndOutput(session_id, fhash);
    if (verdict.ok) {
      updateOutputStatus.run('approved', session_id);
      updateSessionStatus.run('approved', session_id);
      if (storedFilename) {
        const src = path.join(PENDING_DIR, storedFilename);
        const dst = path.join(VERIFIED_DIR, storedFilename);
        if (fs.existsSync(src)) fs.renameSync(src, dst);
      }
      const file_url = storedFilename ? `/uploads/verified/${storedFilename}` : null;
      // Supabaseへ記録
      await recordApprovalToSupabase({
        final_hash: fhash,
        session_id,
        user_id: sess.user_id,
        project_name: sess.project_name,
        file_url
      });
      return res.json({ ok: true, status: 'approved', reason: verdict.reason, file: file_url });
    } else {
      updateOutputStatus.run('rejected', session_id);
      updateSessionStatus.run('rejected', session_id);
      if (storedFilename) {
        const src = path.join(PENDING_DIR, storedFilename);
        const dst = path.join(REJECTED_DIR, storedFilename);
        if (fs.existsSync(src)) fs.renameSync(src, dst);
      }
      return res.status(400).json({ ok: false, status: 'rejected', reason: verdict.reason });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// 3-B) 生バイナリ版
app.post(['/api/log/finish_raw', '/api/log/finish_raw/:sid'], finishRawMiddleware, async (req, res) => {
  try {
    const session_id = (req.query.session_id || req.params.sid || '').toString().trim();
    if (!session_id) return res.status(400).json({ ok: false, error: 'session_id_required' });

    const sess = getSession.get(session_id);
    if (!sess) return res.status(404).json({ ok: false, error: 'session_not_found' });

    const buf = req.body;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ ok: false, error: 'binary_body_required' });
    }

    const fhash = sha256(buf);
    const ext = mime.extension(req.headers['content-type'] || '') || 'mp4';
    const storedFilename = `${fhash}.${ext}`;
    fs.writeFileSync(path.join(PENDING_DIR, storedFilename), buf);

    insertOutput.run({ session_id, final_hash: fhash, final_filename: storedFilename });
    updateSessionStatus.run('finished', session_id);

    const verdict = verifySessionAndOutput(session_id, fhash);
    if (verdict.ok) {
      updateOutputStatus.run('approved', session_id);
      updateSessionStatus.run('approved', session_id);
      const src = path.join(PENDING_DIR, storedFilename);
      const dst = path.join(VERIFIED_DIR, storedFilename);
      if (fs.existsSync(src)) fs.renameSync(src, dst);

      const file_url = `/uploads/verified/${storedFilename}`;
      await recordApprovalToSupabase({
        final_hash: fhash,
        session_id,
        user_id: sess.user_id,
        project_name: sess.project_name,
        file_url
      });
      return res.json({ ok: true, status: 'approved', reason: verdict.reason, file: file_url });
    } else {
      updateOutputStatus.run('rejected', session_id);
      updateSessionStatus.run('rejected', session_id);
      const src = path.join(PENDING_DIR, storedFilename);
      const dst = path.join(REJECTED_DIR, storedFilename);
      if (fs.existsSync(src)) fs.renameSync(src, dst);
      return res.status(400).json({ ok: false, status: 'rejected', reason: verdict.reason });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// ============== 検証ロジック（共通） ==============
function verifySessionAndOutput(session_id, final_hash) {
  try {
    const sess = getSession.get(session_id);
    if (!sess) return { ok: false, reason: 'session_not_found' };
    if (sess.status === 'invalid') return { ok: false, reason: 'hash_chain_broken' };

    const events = getEventsBySession.all(session_id);
    let prev = '0';
    for (const ev of events) {
      const serverHash = sha256(ev.prev_hash + '|' + ev.timestamp + '|' + ev.event_json);
      if (ev.prev_hash !== prev) return { ok: false, reason: 'chain_prev_mismatch' };
      if (serverHash !== ev.hash) return { ok: false, reason: 'chain_hash_mismatch' };
      prev = ev.hash;
    }
    if (events.length === 0) return { ok: false, reason: 'no_events' };

    const hasRenderStart  = events.some(e => e.event_type === 'render.start');
    const renderFinishEvt = events.find(e => e.event_type === 'render.finish');
    if (!hasRenderStart || !renderFinishEvt) return { ok: false, reason: 'render_sequence_missing' };

    let finishInfo = {};
    try { finishInfo = JSON.parse(renderFinishEvt.event_json) || {}; } catch {}
    const outputHashFromLog = finishInfo.output_hash;
    if (!outputHashFromLog) return { ok: false, reason: 'render_finish_missing_output_hash' };

    if (String(outputHashFromLog).trim() !== String(final_hash).trim()) {
      return { ok: false, reason: 'final_hash_mismatch_with_log' };
    }
    return { ok: true, reason: 'verified' };
  } catch (e) {
    console.error('[verify] error:', e);
    return { ok: false, reason: 'verify_internal_error' };
  }
}

// --- My Approved Outputs ---
app.get("/api/my/approved", (req, res) => {
  try {
    const user_id = req.query.user_id; // 本来はJWTから取得するのが安全
    if (!user_id) return res.status(400).json({ error: "user_id required" });

    const rows = db.prepare(`
      SELECT o.*, s.project_name
      FROM outputs o
      JOIN sessions s ON s.session_id = o.session_id
      WHERE o.status = 'approved' AND s.user_id = ?
      ORDER BY o.created_at DESC
    `).all(user_id);

    res.json({ ok: true, outputs: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});


// ============== 応急：旧UI（必要なければ削除OK） ==============
app.get('/uploadPair.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'uploadPair.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('sendFile error:', err);
      res.status(404).send('Not found');
    }
  });
});

// ============== セッション参照（デバッグ補助） ==============
app.get('/api/session/:id', (req, res) => {
  const sess = getSession.get(req.params.id);
  if (!sess) return res.status(404).json({ error: 'session_not_found' });
  const events = getEventsBySession.all(req.params.id);
  const output = getOutputBySession.get(req.params.id);
  res.json({ session: sess, events, output });
});

// ヘルスチェック用
app.get('/health', (req, res) => {
  res.json({ ok: true });
});


// ============== 起動 ==============
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

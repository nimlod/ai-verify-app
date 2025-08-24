// logserver.js
// 目的：多数ユーザー向け。メール+パスワード認証、JWT、ユーザーごとの作品登録＆チェーンログ管理。

const express = require("express");
const sqlite3 = require("better-sqlite3");
const crypto = require("crypto");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.AUTHLOG_PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const SALT_ROUNDS = 10;

app.use(express.json());
app.use(cors());

// ===================== DB 初期化 =====================
const db = new sqlite3("logs.db");

// users
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`).run();

// projects（ユーザーごとの論理プロジェクトID＝作品ID）
db.prepare(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_key TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, project_key)
);
`).run();

// logs（チェーンログ本体）
db.prepare(`
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  project_id INTEGER,
  project_key TEXT,
  entry_index INTEGER,
  action TEXT,
  timestamp TEXT,
  hash TEXT,
  prev_hash TEXT
);
`).run();

// ===================== ユーティリティ =====================
function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makeToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers["authorization"] || "";
    const m = header.match(/^Bearer (.+)$/i);
    if (!m) {
      if (required) return res.status(401).json({ error: "missing_token" });
      req.user = null;
      return next();
    }
    try {
      const payload = jwt.verify(m[1], JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch (e) {
      if (required) return res.status(401).json({ error: "invalid_token" });
      req.user = null;
      return next();
    }
  };
}

// ===================== DB ステートメント =====================
const getProject = db.prepare(`
  SELECT * FROM projects WHERE user_id = ? AND project_key = ? LIMIT 1
`);
const createProject = db.prepare(`
  INSERT INTO projects (user_id, project_key) VALUES (?, ?)
`);
const getLastLog = db.prepare(`
  SELECT * FROM logs WHERE project_id = ? ORDER BY entry_index DESC LIMIT 1
`);
const getLogsByProject = db.prepare(`
  SELECT * FROM logs WHERE project_id = ? ORDER BY entry_index ASC
`);
const insertLog = db.prepare(`
  INSERT INTO logs (user_id, project_id, project_key, entry_index, action, timestamp, hash, prev_hash)
  VALUES (@user_id, @project_id, @project_key, @entry_index, @action, @timestamp, @hash, @prev_hash)
`);

// ===================== 認証API =====================
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }
    const exists = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (exists) return res.status(409).json({ error: "email_already_used" });

    const password_hash = await bcrypt.hash(password, 10);
    const info = db.prepare(
      `INSERT INTO users (email, password_hash) VALUES (?, ?)`
    ).run(email, password_hash);

    const user = { id: info.lastInsertRowid, email };
    const token = makeToken(user);
    res.json({ success: true, token, user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }
    const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    if (!user) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const token = makeToken(user);
    res.json({ success: true, token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  }
});

// 1) 作品登録（GENESIS）
app.post("/api/project/start", auth(true), (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId, title, description, tags, fileHash } = req.body || {};
    if (!projectId || !fileHash) {
      return res.status(400).json({ error: "projectId_and_fileHash_required" });
    }

    let project = getProject.get(userId, projectId);
    if (!project) {
      const info = createProject.run(userId, projectId);
      project = { id: info.lastInsertRowid, user_id: userId, project_key: projectId };

      const genesis = {
        user_id: userId,
        project_id: project.id,
        project_key: projectId,
        entry_index: 0,
        action: JSON.stringify({
          type: "GENESIS",
          title,
          description,
          tags,
          fileHash
        }),
        timestamp: new Date().toISOString(),
        prev_hash: "0"
      };
      genesis.hash = sha256((fileHash || "") + genesis.timestamp + genesis.prev_hash);

      insertLog.run(genesis);

      return res.json({
        success: true,
        message: "project created & genesis logged",
        projectId,
        meta: { title, description, tags }
      });
    } else {
      return res.status(409).json({ error: "project_already_exists" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  }
});

// 2) ログ追加
app.post("/api/log/append", auth(true), (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId, action } = req.body || {};
    if (!projectId || !action) {
      return res.status(400).json({ error: "projectId_and_action_required" });
    }
    const project = getProject.get(userId, projectId);
    if (!project) return res.status(404).json({ error: "project_not_found" });

    const last = getLastLog.get(project.id);
    if (!last) return res.status(400).json({ error: "genesis_missing" });

    const entry_index = last.entry_index + 1;
    const timestamp = new Date().toISOString();
    const prev_hash = last.hash;
    const hash = sha256(action + timestamp + prev_hash);

    insertLog.run({
      user_id: userId,
      project_id: project.id,
      project_key: projectId,
      entry_index,
      action,
      timestamp,
      hash,
      prev_hash
    });

    res.json({ success: true, projectId, entryIndex: entry_index });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  }
});

// 3) ログ取得
app.get("/api/logs/:projectId", auth(true), (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;
    const project = getProject.get(userId, projectId);
    if (!project) return res.status(404).json({ error: "project_not_found" });

    const rows = getLogsByProject.all(project.id);
    res.json({ projectId, logs: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  }
});

// 4) チェーン検証
app.get("/api/verify/:projectId", auth(true), (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;
    const project = getProject.get(userId, projectId);
    if (!project) return res.status(404).json({ error: "project_not_found" });

    const rows = getLogsByProject.all(project.id);
    if (rows.length === 0) return res.status(400).json({ valid: false, error: "no_logs" });

    let valid = true;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      const expectedHash = sha256(curr.action + curr.timestamp + curr.prev_hash);
      if (curr.prev_hash !== prev.hash || curr.hash !== expectedHash) {
        valid = false;
        break;
      }
    }
    res.json({ projectId, valid, count: rows.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Auth+Log Server running at http://localhost:${PORT}`);
});

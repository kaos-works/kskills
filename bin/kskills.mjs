#!/usr/bin/env node
// kskills — personal agent-skills installer (feature-parity with vercel-labs/skills).
// Single-file, zero-dependency. Node >= 18. Deliberate divergence: add defaults to
// GLOBAL scope (personal bootstrap); upstream defaults to project scope.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const VERSION = '0.2.0'
const DEFAULT_SOURCE = process.env.KSKILLS_SOURCE || 'kaos-works/kskills'
const KSKILLS_HOME = path.resolve(expand(process.env.KSKILLS_HOME || path.join(os.homedir(), '.kskills')))
const REPOS_DIR = path.join(KSKILLS_HOME, 'repos')
const LOCK_FILE = path.join(KSKILLS_HOME, 'installs.json')
const REGISTRIES_FILE = path.join(KSKILLS_HOME, 'registries.json')
const REGISTRY_CACHE_DIR = path.join(KSKILLS_HOME, 'registry-cache') // REPOS_DIR 밖 — update의 캐시 GC 대상 아님
const BUILTIN_REGISTRIES = {}
// Bare-command layer: a skill shipping `command.md` also gets a user-level
// omp native command (~/.omp/agent/commands/<base>.md, priority 100). The
// frontmatter `name` keeps the qualified address as the invocation name.
// (~/.codex/commands was dropped: omp 18.x does not load that user dir at
// runtime — measured 2026-09-04; project-dir codex commands still work.)
const OMP_COMMANDS_DIR = path.join(os.homedir(), '.omp', 'agent', 'commands')
// Cross-skill machine-local state convention root (~/.local/state/skills —
// also hosts shared caches (jira-meta, git-repo-sync registry, graph-wiki index)).
// The single credential .env lives at its root: one machine, one address,
// every skill reads it (`metadata.requires-env` declares the keys).
const STATE_SKILLS_DIR = path.join(os.homedir(), '.local', 'state', 'skills')
const ENV_FILE = path.join(STATE_SKILLS_DIR, '.env')

const DL_MAX_BYTES = Number(process.env.SKILLS_DOWNLOAD_MAX_BYTES || 10 * 1024 * 1024)
const EX_MAX_BYTES = Number(process.env.SKILLS_EXTRACT_MAX_BYTES || 25 * 1024 * 1024)
const EX_MAX_FILES = Number(process.env.SKILLS_EXTRACT_MAX_FILES || 1000)

const BASE_AGENT_TABLE = {
  'aider-desk': ['.aider-desk/skills', '~/.aider-desk/skills'],
  'amp': ['.agents/skills', '~/.config/agents/skills'],
  'replit': ['.agents/skills', '~/.config/agents/skills'],
  'universal': ['.agents/skills', '~/.config/agents/skills'],
  'antigravity': ['.agents/skills', '~/.gemini/antigravity/skills'],
  'antigravity-cli': ['.agents/skills', '~/.gemini/antigravity-cli/skills'],
  'astrbot': ['data/skills', '~/.astrbot/data/skills'],
  'autohand-code': ['.autohand/skills', '~/.autohand/skills'],
  'augment': ['.augment/skills', '~/.augment/skills'],
  'bob': ['.bob/skills', '~/.bob/skills'],
  'claude-code': ['.claude/skills', '~/.claude/skills'],
  'openclaw': ['skills', '~/.openclaw/skills'],
  'cline': ['.agents/skills', '~/.agents/skills'],
  'dexto': ['.agents/skills', '~/.agents/skills'],
  'kimi-code-cli': ['.agents/skills', '~/.agents/skills'],
  'loaf': ['.agents/skills', '~/.agents/skills'],
  'warp': ['.agents/skills', '~/.agents/skills'],
  'zed': ['.agents/skills', '~/.agents/skills'],
  'codearts-agent': ['.codeartsdoer/skills', '~/.codeartsdoer/skills'],
  'codebuddy': ['.codebuddy/skills', '~/.codebuddy/skills'],
  'codemaker': ['.codemaker/skills', '~/.codemaker/skills'],
  'codestudio': ['.codestudio/skills', '~/.codestudio/skills'],
  'codex': ['.agents/skills', '~/.codex/skills'],
  'command-code': ['.commandcode/skills', '~/.commandcode/skills'],
  'continue': ['.continue/skills', '~/.continue/skills'],
  'cortex': ['.cortex/skills', '~/.snowflake/cortex/skills'],
  'crush': ['.crush/skills', '~/.config/crush/skills'],
  'cursor': ['.agents/skills', '~/.cursor/skills'],
  'deepagents': ['.agents/skills', '~/.deepagents/agent/skills'],
  'devin': ['.devin/skills', '~/.config/devin/skills'],
  'droid': ['.factory/skills', '~/.factory/skills'],
  'eve': ['agent/skills', null],
  'firebender': ['.agents/skills', '~/.firebender/skills'],
  'forgecode': ['.forge/skills', '~/.forge/skills'],
  'gemini-cli': ['.agents/skills', '~/.gemini/skills'],
  'github-copilot': ['.agents/skills', '~/.copilot/skills'],
  'goose': ['.goose/skills', '~/.config/goose/skills'],
  'grok': ['.grok/skills', '~/.grok/skills'],
  'hermes-agent': ['.hermes/skills', '~/.hermes/skills'],
  'inference-sh': ['.inferencesh/skills', '~/.inferencesh/skills'],
  'jazz': ['.jazz/skills', '~/.jazz/skills'],
  'junie': ['.junie/skills', '~/.junie/skills'],
  'iflow-cli': ['.iflow/skills', '~/.iflow/skills'],
  'kilo': ['.kilocode/skills', '~/.kilocode/skills'],
  'kimchi': ['.kimchi/skills', '~/.config/kimchi/harness/skills'],
  'kiro-cli': ['.kiro/skills', '~/.kiro/skills'],
  'kode': ['.kode/skills', '~/.kode/skills'],
  'lingma': ['.lingma/skills', '~/.lingma/skills'],
  'mcpjam': ['.mcpjam/skills', '~/.mcpjam/skills'],
  'minimax-code': ['.minimax/skills', '~/.minimax/skills'],
  'mistral-vibe': ['.vibe/skills', '~/.vibe/skills'],
  'moxby': ['.moxby/skills', '~/.moxby/skills'],
  'mux': ['.mux/skills', '~/.mux/skills'],
  'opencode': ['.agents/skills', '~/.config/opencode/skills'],
  'openhands': ['.openhands/skills', '~/.openhands/skills'],
  'ona': ['.ona/skills', '~/.ona/skills'],
  'pi': ['.pi/skills', '~/.pi/agent/skills'],
  'posit-assistant': ['.posit/assistant/skills', '~/.posit/assistant/skills'],
  'qoder': ['.qoder/skills', '~/.qoder/skills'],
  'qoder-cn': ['.qoder/skills', '~/.qoder-cn/skills'],
  'qwen-code': ['.qwen/skills', '~/.qwen/skills'],
  'reasonix': ['.reasonix/skills', '~/.reasonix/skills'],
  'rovodev': ['.rovodev/skills', '~/.rovodev/skills'],
  'roo': ['.roo/skills', '~/.roo/skills'],
  'tabnine-cli': ['.tabnine/agent/skills', '~/.tabnine/agent/skills'],
  'terramind': ['.terramind/skills', '~/.terramind/skills'],
  'tinycloud': ['.tinycloud/skills', '~/.tinycloud/skills'],
  'trae': ['.trae/skills', '~/.trae/skills'],
  'trae-cn': ['.trae/skills', '~/.trae-cn/skills'],
  'windsurf': ['.windsurf/skills', '~/.codeium/windsurf/skills'],
  'zcode': ['.zcode/skills', '~/.zcode/skills'],
  'zencoder': ['.zencoder/skills', '~/.zencoder/skills'],
  'zenflow': ['.zencoder/skills', '~/.zencoder/skills'],
  'neovate': ['.neovate/skills', '~/.neovate/skills'],
  'pochi': ['.pochi/skills', '~/.pochi/skills'],
  'promptscript': ['.agents/skills', null],
  'adal': ['.adal/skills', '~/.adal/skills'],
}

// Agent dirs: [projectPath, globalPath|null]. 'agents' is a kskills alias for the
// shared ~/.agents/skills dir (cline/warp/zed family).
const AGENT_TABLE = {
  ...BASE_AGENT_TABLE,
  'agents': ['.agents/skills', '~/.agents/skills'],
}

// Default-install targets beyond the shared agents farm: market-share-leading
// harnesses (2026 order: Claude Code > Codex > Copilot CLI > Gemini CLI >
// Cursor > OpenCode > Amp) plus pi (opt-in daily-driver harness — not market-ranked).
// omp needs no entry: projectAll() feeds it from the farm on every mutation.
// A harness joins the default only when its binary is on PATH or, for desktop
// apps, its bundle exists — a skills-dir footprint is NOT proof of install
// (installSkill mkdirs it, so a dir-based check would self-perpetuate).
const MARKET_AGENTS = [
  ['claude-code', ['claude']],
  ['codex', ['codex']],
  ['github-copilot', ['copilot']],
  ['gemini-cli', ['gemini']],
  ['cursor', ['cursor-agent', 'cursor']],
  ['opencode', ['opencode']],
  ['amp', ['amp']],
  ['pi', ['pi']],
]

// Desktop-app harnesses (no PATH binary by default): the app bundle itself is
// the install proof. Bundle name per agent; roots overridable for tests.
const DESKTOP_APP_BUNDLES = { 'cursor': ['Cursor.app'] }
const APP_ROOTS = () => (process.env.KSKILLS_APPLICATIONS_DIRS ?? '/Applications:~/Applications')
  .split(':').filter(Boolean)

function hasBinary(names) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  return names.some(n => dirs.some(d => {
    const p = path.join(d, n)
    // accessSync 는 성공해도 undefined 를 반환 — boolean 으로 환원해 some 에 돌려준다
    try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile() } catch { return false }
  }))
}

function hasAppBundle(agent) {
  const bundles = DESKTOP_APP_BUNDLES[agent] ?? []
  return bundles.some(b => APP_ROOTS().some(r => fs.existsSync(path.join(expand(r), b))))
}

// Agents checked by default: the shared farm plus installed market leaders.
// KSKILLS_DEFAULT_AGENTS (comma-separated) overrides detection — CI/scripts
// pin the set; empty value forces farm-only (pre-change behavior).
function defaultAgents() {
  const pinned = (process.env.KSKILLS_DEFAULT_AGENTS ?? '').trim()
  if (pinned) return pinned.split(',').map(s => s.trim()).filter(Boolean)
  if (process.env.KSKILLS_DEFAULT_AGENTS === '') return ['agents']
  return ['agents', ...MARKET_AGENTS.filter(([a, bins]) => hasBinary(bins) || hasAppBundle(a)).map(([a]) => a)]
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '_template'])
// Agent Skills spec name: lowercase alnum segments joined by single hyphens,
// 1-64 chars (no leading/trailing/consecutive hyphens).
const SPEC_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
// Qualified identity name (cc-lib convention): `plugin:skill`. Display/matching
// only — install dir stays the normalized dirname.
const QUAL_NAME = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', LANG: 'C', GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -oBatchMode=yes' }
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
// --- engine/CLI split ------------------------------------------------------------
// Library consumers (kskills-app) import the command engine without a terminal:
// output is captured into a per-call sink and die() raises instead of exiting.
// CLI invocations (no active sink) keep the exact original behavior.
import { AsyncLocalStorage } from 'node:async_hooks'

class KskillsError extends Error {
  constructor(msg, code = 1) { super(String(msg)); this.name = 'KskillsError'; this.code = code }
}

const logContext = new AsyncLocalStorage()

function out(...args) {
  const line = args.length === 1 ? String(args[0]) : args.join(' ')
  const ctx = logContext.getStore()
  if (ctx) { ctx.events.push(line); ctx.onEvent?.(line); return }
  console.log(...args)
}

function die(msg, code = 1) {
  const ctx = logContext.getStore()
  if (ctx) throw new KskillsError(msg, code)
  process.stderr.write(`error: ${msg}\n`)
  process.exit(code)
}

function expand(p) {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
}

// Membership comparisons need filesystem identity, not string identity:
// resolve relative args and dereference symlinks (/tmp → /private/tmp on macOS).
function normPath(p) {
  const r = path.resolve(expand(String(p)))
  try { return fs.realpathSync(r) } catch { return r }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: GIT_ENV, timeout: 120_000, ...opts })
  const err = r.error ? String(r.error.message) : ''
  return { ok: r.status === 0 && !r.error, out: `${r.stdout || ''}${r.stderr || ''}${err}`, stdout: r.stdout || '' }
}

// scope: 'global' | 'project'. Returns absolute agent skill dirs for given ids.
// optional: skip agents with no path for this scope instead of dying.
function agentDirs(scope, ids, { optional = false } = {}) {
  const dirs = []
  for (const a of ids) {
    const t = AGENT_TABLE[a]
    if (!t) die(`unknown agent: ${a} (use -a '*' or run: kskills help)`)
    const p = scope === 'project' ? t[0] : t[1]
    if (!p) {
      if (optional) continue
      die(`agent ${a} is project-only (no global path)`)
    }
    dirs.push(scope === 'project' ? path.resolve(p) : expand(p))
  }
  return dirs
}

function readLock() {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) } catch { return [] }
}

function writeLock(records) {
  fs.mkdirSync(KSKILLS_HOME, { recursive: true })
  // process-unique tmp name: concurrent kskills runs must never consume each
  // other's staging file (fixed-name rename races crashed mid-install)
  const tmp = `${LOCK_FILE}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2))
  fs.renameSync(tmp, LOCK_FILE)
}

// Serialize read-modify-write lock mutations across concurrent processes.
// O_EXCL lockfile with bounded retry; a stale lock (holder crashed) breaks
// after 30s.
function withLockFile(fn) {
  const lock = LOCK_FILE + '.lock'
  fs.mkdirSync(KSKILLS_HOME, { recursive: true })
  const STALE_MS = 30_000
  const deadline = Date.now() + STALE_MS + 5_000 // wait PAST the stale threshold — a dead holder's lock must always break before we give up
  for (;;) {
    let fd
    try { fd = fs.openSync(lock, 'wx') } catch (e) {
      if (e.code !== 'EEXIST') throw e
      const st = fs.statSync(lock, { throwIfNoEntry: false })
      if (st && Date.now() - st.mtimeMs > STALE_MS) { try { fs.rmSync(lock, { force: true }) } catch { /* racing */ } }
      if (Date.now() > deadline) throw new Error('kskills lock timeout — another kskills process holds the lock')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
      continue
    }
    fs.closeSync(fd)
    try { return fn() } finally { try { fs.rmSync(lock, { force: true }) } catch { /* already gone */ } }
  }
}

function lockRecord(dir, skill) {
  return readLock().find(r => r.dir === dir && r.skill === skill)
}

function lockAdd(rec) {
  withLockFile(() => {
    const all = readLock().filter(r => !(r.dir === rec.dir && r.skill === rec.skill))
    all.push(rec)
    writeLock(all)
  })
}

function lockRemove(dir, skill) {
  withLockFile(() => writeLock(readLock().filter(r => !(r.dir === dir && r.skill === skill))))
}

// --- args -------------------------------------------------------------------

function parseArgs(argv) {
  const flags = { agent: [], skill: [] }
  const pos = []
  const VAL_FLAGS = { '-a': 'agent', '--agent': 'agent', '-s': 'skill', '--skill': 'skill' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') flags.help = true
    else if (a === '-v' || a === '--version') flags.version = true
    else if (a === '-l' || a === '--list') flags.list = true
    else if (a === '-g' || a === '--global') flags.global = true
    else if (a === '-p' || a === '--project') flags.project = true
    else if (a === '--copy') flags.copy = true
    else if (a === '--all') flags.all = true
    else if (a === '--broken') flags.broken = true
    else if (a === '--emit') flags.emit = true
    else if (a === '--load') flags.load = true
    else if (a === '--check') flags.check = true
    else if (a === '--refresh') flags.refresh = true
    else if (a === '--source') {
      const v = argv[++i]
      if (!v || (v.startsWith('-') && v.length > 1)) die(`missing value for ${a}`)
      flags.source = v
    }
    else if (a.startsWith('--source=')) flags.source = a.slice(9)
    else if (a === '--') { pos.push(...argv.slice(i + 1)); break }
    else if (a in VAL_FLAGS) {
      const v = argv[++i]
      if (!v || (v.startsWith('-') && v.length > 1)) die(`missing value for ${a}`)
      flags[VAL_FLAGS[a]].push(...v.split(',').filter(Boolean))
    }
    else if (a.startsWith('--agent=')) flags.agent.push(...a.slice(8).split(',').filter(Boolean))
    else if (a.startsWith('--skill=')) flags.skill.push(...a.slice(8).split(',').filter(Boolean))
    else if (a.startsWith('-') && a !== '-') die(`unknown option: ${a}`)
    else pos.push(a)
  }
  return { flags, pos }
}

// --- skill discovery --------------------------------------------------------

function parseFrontmatter(file) {
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return {} }
  return parseFrontmatterContent(text)
}

// Identity keys a skill answers to: frontmatter name plus its v1 address
// (normalized copies keep the address in a custom field).
function frontmatterKeys(file) {
  const fm = parseFrontmatter(file)
  return [fm.name, typeof fm.address === 'string' ? fm.address : ''].filter(Boolean)
}

// Discovery contract (mirrors vercel-labs/skills v1.5.23):
// 1. root SKILL.md          → single-skill source
// 2. priority containers    → root (depth 1), skills/ (+ .curated/.experimental/.system)
//                             and plugin skill dirs (from .claude-plugin manifests),
//                             each walked 3 deep; a dir with SKILL.md is a skill root
//                             and is not descended into
// 3. fallback               → if nothing found, full recursive walk to depth 5
// Duplicate skill names are dropped (first occurrence wins).
function pluginSkillDirs(root) {
  const dirs = []
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
  const add = (base, skills) => {
    for (const s of Array.isArray(skills) ? skills : []) {
      if (typeof s === 'string') dirs.push(path.dirname(path.join(base, s)))
    }
    dirs.push(path.join(base, 'skills'))
  }
  const marketplace = readJson(path.join(root, '.claude-plugin', 'marketplace.json'))
  if (marketplace) {
    const pluginRoot = path.join(root, marketplace.metadata?.pluginRoot ?? '')
    for (const p of marketplace.plugins ?? []) {
      if (typeof p?.source !== 'string' && p?.source !== undefined) continue
      add(path.join(pluginRoot, p?.source ?? ''), p?.skills)
    }
  }
  const plugin = readJson(path.join(root, '.claude-plugin', 'plugin.json'))
  if (plugin) add(root, plugin.skills)
  return dirs
}

function discoverSkills(root) {
  if (fs.existsSync(path.join(root, 'SKILL.md'))) return [root]

  const out = []
  const seenDirs = new Set()
  const seenNames = new Set()
  const tryAdd = (dir) => {
    if (seenDirs.has(dir) || !fs.existsSync(path.join(dir, 'SKILL.md'))) return false
    seenDirs.add(dir)
    const name = parseFrontmatter(path.join(dir, 'SKILL.md')).name || path.basename(dir)
    if (seenNames.has(name)) return true
    seenNames.add(name)
    out.push(dir)
    return true
  }
  const walkContainer = (dir, depth, maxDepth) => {
    let ents
    try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue
      const child = path.join(dir, e.name)
      if (tryAdd(child) || depth >= maxDepth) continue
      walkContainer(child, depth + 1, maxDepth)
    }
  }

  walkContainer(root, 1, 1) // direct children only
  for (const c of ['skills', 'skills/.curated', 'skills/.experimental', 'skills/.system'])
    walkContainer(path.join(root, c), 1, 3)
  for (const d of pluginSkillDirs(root)) walkContainer(d, 1, 3)

  if (!out.length) {
    const walkAll = (dir, depth) => {
      if (depth > 5) return
      tryAdd(dir)
      let ents
      try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of ents) {
        if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue
        walkAll(path.join(dir, e.name), depth + 1)
      }
    }
    walkAll(root, 0)
  }
  return out
}

function skillInfo(dir) {
  const fm = parseFrontmatter(path.join(dir, 'SKILL.md'))
  let base = path.basename(dir)
  let desc = fm.description || ''
  const raw = fm.name || ''
  const qual = QUAL_NAME.test(raw)
  // normalized strict-name copies keep their v1 address in a custom field;
  // identity (dedup, projections) always prefers the address
  // Prefer the explicit v1 address field; v1 sources carry the qualified
  // address in `name` itself — derive it so catalog emit (address/family)
  // covers both source shapes.
  const addr = (typeof fm.address === 'string' && QUAL_NAME.test(fm.address) ? fm.address : '')
    || (qual ? raw : '')
  // The install dir must be spec-valid. A non-spec dirname is a source-root
  // artifact (single-skill sources install the cache root, whose basename is
  // the internal cache id) — fall back to the authored name, qualified names
  // normalized to their dashed form.
  if (!SPEC_NAME.test(base)) {
    const n = addr || (qual ? raw.replace(/[^A-Za-z0-9-]/g, '-') : SPEC_NAME.test(raw) ? raw : '')
    if (n) base = n
  }
  const name = addr || ((SPEC_NAME.test(raw) || qual) && raw.length <= 64 ? raw : base)
  const meta = fm.metadata ?? ''
  const metaObj = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : null
  return {
    dir, name, base, address: addr, desc,
    mismatch: Boolean(raw) && raw !== base && !qual,
    internal: metaObj ? metaObj.internal === 'true' : /internal:\s*true/.test(String(meta)),
    requiresEnv: metaObj ? parseEnvList(metaObj['requires-env']) : null,
  }
}

// requires-env value: `[A, B]` bracketed or whitespace-separated — parse both
// forms up front so a source-validation fallback (brackets rejected) needs no
// CLI change. Only shell-identifier keys survive: the --load preamble emits
// them into shell guard lines verbatim.
function parseEnvList(v) {
  if (v == null) return null
  if (Array.isArray(v)) {
    const k = v.map(x => String(x).trim()).filter(x => /^[A-Za-z_][A-Za-z0-9_]*$/.test(x))
    return k.length ? k : null
  }
  const s = String(v).trim()
  if (!s) return null
  const inner = s.match(/^\[(.*)\]$/)
  const parts = (inner ? inner[1] : s).split(inner ? ',' : /\s+/)
  const keys = parts.map(x => x.replace(/^["']|["']$/g, '').trim())
    .filter(x => /^[A-Za-z_][A-Za-z0-9_]*$/.test(x))
  return keys.length ? keys : null
}

// --- source resolution --------------------------------------------------------

function gitId(url) {
  const clean = url.replace(/\.git$/, '')
  const parts = clean.split(/[/:]/).filter(Boolean)
  return parts.slice(-2).map(segEsc).join('__') || clean.replace(/[^A-Za-z0-9_.-]/g, '_')
}

// Escape '_' so owner/repo segments containing '__' cannot collide in cache ids.
const segEsc = (p) => p.replace(/_/g, '_u')

function withToken(url) {
  if (!GITHUB_TOKEN) return url
  return url.replace(/^https:\/\/github\.com\//, `https://x-access-token:${GITHUB_TOKEN}@github.com/`)
}

const redact = (s) => GITHUB_TOKEN ? s.replaceAll(GITHUB_TOKEN, '***') : s

async function fetchWithLimits(url, maxBytes, { fatal = true } = {}) {
  const fail = (msg) => { if (!fatal) throw new Error(msg); die(msg) } // recoverable callers (well-known candidates) try the next one
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
    if (!res.ok) fail(`download failed (${res.status}): ${url}`)
    // enforce the cap BEFORE and DURING transfer — never buffer past the limit
    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) fail(`download exceeds limit (${declared} > ${maxBytes} bytes): ${url}`)
    const reader = res.body.getReader()
    const chunks = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > maxBytes) {
        try { await reader.cancel() } catch { /* already closed */ }
        fail(`download exceeds limit (${total} > ${maxBytes} bytes): ${url}`)
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } catch (e) {
    if (e && e.message && /limit|status/.test(e.message)) fail(e.message)
    fail(`fetch failed: ${url} — ${redact(String(e.message || e))}`)
  } finally { clearTimeout(timer) }
}

async function wellKnownSource(host, { fatal = true } = {}) {
  const fail = (msg) => { if (!fatal) throw new Error(msg); die(msg) }
  const base = host.startsWith('http') ? host.replace(/\/$/, '') : `https://${host}`
  const buf = await fetchWithLimits(`${base}/.well-known/agent-skills/metadata.json`, 1024 * 1024, { fatal })
  let meta
  try { meta = JSON.parse(buf.toString('utf8')) } catch { fail(`invalid well-known metadata from ${base}`) }
  for (const s of meta.sources ?? []) {
    if (typeof s !== 'string') continue
    try {
      const src = await resolveSource(s, { fatal: false })
      // verify ACQUISITION, not just resolution — a candidate that resolves
      // but cannot be obtained (dead .git URL) must fall through to the next
      if (src.kind === 'github' || src.kind === 'git') obtainGit(src, { fatal: false })
      return src
    } catch { /* try next candidate */ }
  }
  fail(`well-known metadata at ${base} has no usable source`)
}

function registriesConfig() {
  let cfg = { default: null, registries: { ...BUILTIN_REGISTRIES } }
  try {
    const j = JSON.parse(fs.readFileSync(REGISTRIES_FILE, 'utf8'))
    if (j && typeof j.registries === 'object') cfg.registries = { ...BUILTIN_REGISTRIES, ...j.registries }
    if (j && typeof j.default === 'string') cfg.default = j.default
  } catch { /* 파일 없으면 내장 기본 */ }
  cfg.default ??= Object.keys(cfg.registries)[0] ?? null
  if (process.env.KSKILLS_REGISTRY) {
    if (cfg.default) cfg.registries[cfg.default] = process.env.KSKILLS_REGISTRY // env 는 default 의 URL 을 덮어쓴다 (기존 의미 유지)
    else { cfg.registries.default = process.env.KSKILLS_REGISTRY; cfg.default = 'default' }
  }
  if (cfg.default && !cfg.registries[cfg.default]) die(`registries.json: 알 수 없는 default '${cfg.default}' — 등록됨: ${Object.keys(cfg.registries).join(', ')}`)
  return cfg
}

// 문법: <skill>[@<registry>] — 두 형식만 있다: family:slug (bare, 콜론이 판별자)
// 와 skill@registry (@접미가 명시 신호). 그 외(선행 @ 포함)는 일반 해소
// 실패로 떨어진다. 콜론·@접미 없는 bare 단어를 열어주면 오타가 즉시 에러
// 대신 네트워크 왕복이 된다.
function parseRegistryExpr(src) {
  const m = String(src).match(/^([A-Za-z0-9_.:-]+?)(?:@([A-Za-z0-9_.-]+))?$/)
  if (!m) return null
  const [, skill, registry] = m
  if (!registry && !skill.includes(':')) return null
  return { skill, registry }
}

function registryLoad(name, { refresh = false } = {}) {
  const cfg = registriesConfig()
  const url = cfg.registries[name]
  if (!url) die(`알 수 없는 레지스트리: '${name}' — 등록됨: ${Object.keys(cfg.registries).join(', ')} (${REGISTRIES_FILE})`)
  const dir = path.join(REGISTRY_CACHE_DIR, name)
  const has = fs.existsSync(path.join(dir, '.git'))
  const st = fs.statSync(dir, { throwIfNoEntry: false })
  if (!has || refresh || !st || Date.now() - st.mtimeMs > 10 * 60_000) {
    const run = (args, cwd) => {
      const r = spawnSync('git', args, { encoding: 'utf8', timeout: 60_000, cwd })
      if (r.status !== 0) die(`레지스트리 가져오기 실패: git ${args[0]} (${name})\n${(r.stderr || '').trim().split('\n')[0]}`)
    }
    if (has) {
      // 캐시는 폐기 가능 — 발행 단일 리비전(force-push) 등 비-ff 원격은 폐기 후 재클론.
      const pull = spawnSync('git', ['pull', '--ff-only', url, 'HEAD'], { encoding: 'utf8', timeout: 60_000, cwd: dir })
      if (pull.status !== 0) {
        out(`! 레지스트리 캐시 비-ff (재클론): ${name} — ${(pull.stderr || '').trim().split('\n')[0]}`)
        fs.rmSync(dir, { recursive: true, force: true })
        fs.mkdirSync(path.dirname(dir), { recursive: true })
        run(['clone', '--depth', '1', url, dir])
      }
    } else {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(path.dirname(dir), { recursive: true })
      run(['clone', '--depth', '1', url, dir])
    }
    fs.utimesSync(dir, new Date(), new Date())
  }
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'registry.json'), 'utf8')) }
  catch { die(`registry.json 파싱 실패: ${path.join(dir, 'registry.json')} (${name})`) }
}

// 명시 레지스트리 우선, 없으면 default → 나머지 등록 순으로 찾는다.
function registryFindEntry(skill, registryName) {
  const cfg = registriesConfig()
  const order = registryName ? [registryName] : [cfg.default, ...Object.keys(cfg.registries).filter((r) => r !== cfg.default)]
  for (const r of order) {
    const e = registryLoad(r).entries.find((x) => x.name === skill)
    if (e) return { entry: e, registry: r }
  }
  // 대시 형식 → 콜론 표준형 유추 (name의 ':' 를 '-'로 정규화해 유일하게 일치할 때만).
  // 여러 후보가 겹치면 추측하지 않는다 — miss 로 돌려 정확명을 요구한다.
  const cands = []
  for (const r of order) for (const e of registryLoad(r).entries)
    if (e.name.replace(/:/g, '-') === skill) cands.push({ entry: e, registry: r })
  return cands.length === 1 ? cands[0] : null
}

function registryResolveEntry(skill, registryName) {
  const cfg = registriesConfig()
  const hit = registryFindEntry(skill, registryName)
  if (!hit) die(`registry 항목 없음: ${skill} (${registryName ? `@${registryName}` : `default '${cfg.default}'`}) — 'kskills registry'로 목록 확인`)
  return hit
}

async function resolveSource(src, { fatal = true } = {}) {
  // [@]<skill>[@<registry>] / family:slug — 콜론·@ 문법은 다른 expr 공간과 불가침
  const reg = parseRegistryExpr(src)
  if (reg) {
    const { entry, registry } = registryResolveEntry(reg.skill, reg.registry)
    const inner = await resolveSource(entry.source.url)
    return { ...inner, subpath: entry.source.subpath ?? inner.subpath, skills: entry.source.skill ? [entry.source.skill] : undefined, label: `${reg.skill}${reg.registry ? '@' + reg.registry : ''}`, registry }
  }
  // GitHub tree URL → repo + subpath filter
  let m = src.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/tree\/([^/]+)\/(.+?)(?:\/)?$/)
  if (m) return { kind: 'github', owner: m[1], repo: m[2].replace(/\.git$/, ''), id: `${segEsc(m[1])}__${segEsc(m[2].replace(/\.git$/, ''))}`, subpath: m[4], label: src }
  // GitHub repo URL → shorthand equivalent
  m = src.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/)
  if (m) return { kind: 'github', owner: m[1], repo: m[2], id: `${segEsc(m[1])}__${segEsc(m[2])}`, label: `${m[1]}/${m[2]}` }
  // host-only http(s) URL or bare domain → well-known discovery
  m = src.match(/^(https?:\/\/[^/]+)\/?$/)
  if (m && !/github\.com/.test(m[1])) return await wellKnownSource(m[1], { fatal })
  m = src.match(/^([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/i)
  if (m && !/github\.com/.test(src)) return await wellKnownSource(m[1], { fatal })
  // local path → .git suffix → ssh/file git URLs → http download vs git
  const abs = path.resolve(expand(src)) // ~/ paths expand uniformly across add/use
  if (fs.existsSync(abs)) return { kind: 'local', dir: abs, id: path.basename(abs), label: abs }
  if (/\.git$/.test(src)) return { kind: 'git', url: src, id: gitId(src), label: src }
  if (/^(ssh|file):\/\//.test(src) || /^git@/.test(src))
    return { kind: 'git', url: src, id: gitId(src), label: src }
  if (/^https?:\/\//.test(src)) return { kind: 'download', url: src, id: gitId(src), label: src }
  m = src.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (m) return { kind: 'github', owner: m[1], repo: m[2], id: `${segEsc(m[1])}__${segEsc(m[2])}`, label: `${m[1]}/${m[2]}` }
  // bare 단어(점 없음·존재하지 않는 경로) — 카탈로그 조회가 마지막 해소다.
  // 점 없는 단어는 도메인(well-known)·owner/repo와 겹치지 않는다.
  if (fatal && /^[A-Za-z0-9_-]+$/.test(src)) {
    const hit = registryResolveEntry(src, null)
    const inner = await resolveSource(hit.entry.source.url)
    return { ...inner, subpath: hit.entry.source.subpath ?? inner.subpath, skills: hit.entry.source.skill ? [hit.entry.source.skill] : undefined, label: src, registry: hit.registry }
  }
  const msg = `cannot resolve source: ${src} (not a URL, existing path, or owner/repo shorthand)`
  if (!fatal) throw new Error(msg) // recoverable callers (well-known candidates) try the next one
  die(msg)
}

// Clone into the cache, or refresh (git pull) an existing clone.
function obtainGit(src, { fatal = true, refresh = true, dest = null, depth = 0 } = {}) {
  const fail = (msg) => { if (!fatal) throw new Error(msg); die(msg) }
  const dir = dest ?? path.join(REPOS_DIR, src.id)
  if (!dest && fs.existsSync(path.join(dir, '.git'))) {
    if (!refresh) { out(`→ ${src.label ?? dir} (cache: ${dir}, 캐시 사용)`); return dir } // read-only scans skip the network
    const r = run('git', ['-C', dir, 'pull', '--ff-only'])
    if (!r.ok) out(`  ! pull failed in ${dir}, using existing clone\n${redact(r.out.trim())}`)
    else out(`→ ${src.label ?? dir} (cache: ${dir}, ${/Already up to date/.test(r.stdout) ? '최신' : '갱신됨'})`)
    return dir
  }
  fs.mkdirSync(REPOS_DIR, { recursive: true })
  const https = `https://github.com/${src.owner}/${src.repo}.git`
  const shallow = depth ? ['--depth', String(depth)] : [] // ephemeral scans fetch the tip only
  const attempts = src.kind === 'github'
    ? [
        ['git', ['clone', ...shallow, withToken(https), dir]],
        ['gh', ['repo', 'clone', `${src.owner}/${src.repo}`, dir]],
        ['git', ['clone', ...shallow, `git@github.com:${src.owner}/${src.repo}.git`, dir]],
      ]
    : [['git', ['clone', ...shallow, src.url, dir]]]
  let last = ''
  for (const [cmd, args] of attempts) {
    const r = run(cmd, args, { timeout: 300_000 })
    if (r.ok) { out(`→ cloned ${src.label} → ${dir}`); return dir }
    last = `$ ${cmd} ${args.join(' ')}\n${r.out.trim()}`
    fs.rmSync(dir, { recursive: true, force: true })
  }
  fail(`clone failed for ${src.label}:\n${redact(last)}`)
}

// Direct download: single SKILL.md or archive (tar/tar.gz/tgz/zip via system tar).
// Returns { root } — downloads land in a temp dir; install copies from there.
async function obtainDownload(src, { fatal = true } = {}) {
  const fail = (msg) => { if (!fatal) throw new Error(msg); die(msg) }
  const buf = await fetchWithLimits(src.url, DL_MAX_BYTES, { fatal })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kskills-dl-'))
  // cleanup owned AT CREATION: internal die paths (failed fetch/extraction)
  // never return, so caller-side hooks can't cover them
  process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* best effort */ } })
  if (buf.subarray(0, 4).toString('latin1') === '---\r' || /^---\n/.test(buf.subarray(0, 4).toString('utf8'))) {
    const fm = parseFrontmatterContent(buf.toString('utf8'))
    const name = /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fm.name || '') ? fm.name : 'skill'
    const dir = path.join(tmp, name)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), buf)
    return { root: tmp, temp: tmp }
  }
  const isZip = buf.subarray(0, 2).toString('latin1') === 'PK'
  const isGzip = buf[0] === 0x1f && buf[1] === 0x8b
  const isTar = buf.subarray(257, 262).toString('latin1') === 'ustar'
  if (!isZip && !isGzip && !isTar) return null // not an artifact — caller falls back to git
  const file = path.join(tmp, 'dl' + (isZip ? '.zip' : isGzip ? '.tgz' : '.tar'))
  fs.writeFileSync(file, buf)
  const exdir = path.join(tmp, 'x')
  fs.mkdirSync(exdir, { recursive: true })
  const r = run('tar', ['-xf', file, '-C', exdir])
  if (!r.ok) fail(`extraction failed (system tar handles zip only on bsdtar/macOS):\n${r.out.trim()}`)
  // enforce extract limits
  let total = 0, files = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      const st = fs.lstatSync(p)
      total += st.size
      if (++files > EX_MAX_FILES) fail(`extracted file count exceeds limit (${EX_MAX_FILES})`)
      if (total > EX_MAX_BYTES) fail(`extracted size exceeds limit (${EX_MAX_BYTES} bytes)`)
      if (e.isDirectory()) walk(p)
    }
  }
  walk(exdir)
  return { root: exdir, temp: tmp }
}

function parseFrontmatterContent(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const fm = {}
  if (!m) return fm
  // plain scalar lines, plus block scalars (`>`, `|`, with -/+ indicators):
  // the marker line is followed by deeper-indented lines that belong to the
  // key — fold them instead of capturing only the first line.
  // Nested sub-maps (`metadata:` with empty value + indented `key: value`
  // lines) collect into an object — `metadata.requires-env` lives there.
  let blockKey = null, contentIndent = 0, literal = false, buf = []
  let mapKey = null
  const flush = () => {
    if (blockKey == null) return
    const body = buf.map(l => l.slice(contentIndent)).join('\n').trim()
    fm[blockKey] = literal ? body : body.replace(/\s*\n\s*/g, ' ')
    blockKey = null; buf = []
  }
  for (const line of m[1].split(/\r?\n/)) {
    if (blockKey != null && (line.trim() === '' || /^\s+\S/.test(line))) {
      if (!buf.length && /^\s+\S/.test(line)) contentIndent = line.match(/^\s*/)[0].length
      buf.push(line); continue
    }
    if (mapKey != null && /^\s+\S/.test(line)) {
      const sk = line.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
      if (sk) fm[mapKey][sk[1]] = sk[2].replace(/^["']|["']$/g, '').trim()
      continue // indented non-kv line inside a sub-map — ignored
    }
    mapKey = null // blank or column-0 line ends the sub-map
    flush()
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!kv) continue
    const bs = kv[2].match(/^([>|])([+-]?\d*)\s*$/)
    if (bs) {
      blockKey = kv[1]; literal = bs[1] === '|'; buf = []
      continue
    }
    if (kv[2] === '') { mapKey = kv[1]; fm[mapKey] = {}; continue }
    fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim()
  }
  flush()
  for (const k of Object.keys(fm))
    if (typeof fm[k] === 'object' && fm[k] !== null && !Array.isArray(fm[k]) && !Object.keys(fm[k]).length) fm[k] = ''
  return fm
}

// obtain: resolve any source to an installable root. Returns { root }
async function obtain(src, { fatal = true, refresh = true } = {}) {
  const fail = (msg) => { if (!fatal) throw new Error(msg); die(msg) }
  if (src.kind === 'local') return { root: src.dir }
  if (src.kind === 'download') {
    const dl = await obtainDownload(src, { fatal })
    if (dl) return dl
    out('  ! not a direct download artifact — trying git clone')
    return { root: obtainGit({ ...src, kind: 'git', url: src.url }, { fatal, refresh }) }
  }
  const root = obtainGit(src, { fatal, refresh })
  if (src.subpath) {
    const sp = path.join(root, src.subpath)
    if (!fs.existsSync(sp)) fail(`subpath not found in repo: ${src.subpath}`)
  }
  return { root }
}
// Install model: local-directory sources symlink in place (live authoring
// view — qualified names and all, for skill development). Every other source
// installs as a spec-normalized copy: name=dirname per the Agent Skills
// spec, the v1 address preserved in a custom `address` field (ignored by
// spec validators, preferred by skillInfo for identity/dedup/projections).
// The lock file is the provenance store for all copies.
function applyStrictName(targetDir, info) {
  if (info.name === info.base) return
  const f = path.join(targetDir, 'SKILL.md')
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^name:.*$/m, `name: ${info.base}\naddress: ${info.name}`))
}

function installSkill(agentDir, s, { live, source, agent }) {
  fs.mkdirSync(agentDir, { recursive: true })
  const link = path.join(agentDir, s.base) // install dir = normalized dirname (qualified names are display-only)
  const st = fs.lstatSync(link, { throwIfNoEntry: false })
  if (st && !st.isSymbolicLink() && !lockRecord(agentDir, s.base)) {
    out(`  ! skip ${s.name}: ${link} exists and is not ours`)
    return false
  }
  if (st) fs.rmSync(link, { recursive: true, force: true })
  if (live) {
    fs.symlinkSync(s.dir, link)
    lockRemove(agentDir, s.base)
  } else {
    try {
      fs.cpSync(s.dir, link, { recursive: true })
      applyStrictName(link, s)
      lockAdd({ dir: agentDir, skill: s.base, source, method: 'copy' })
    } catch (e) {
      // a copy with no lock record is unrecoverable through the CLI (remove
      // refuses it, re-add skips it) — roll back to the previous state
      fs.rmSync(link, { recursive: true, force: true })
      throw e
    }
  }
  out(`  ${st ? '↻' : '→'} ${s.name} → ${agent} (${live ? 'link' : 'copy'})`)
  return true
}

// --- harness projections --------------------------------------------------------
// Repos own skills only. Every harness artifact is a generated projection with
// a fixed pipeline: extract (harness-neutral index of installed skills) →
// project (per-harness format) → install (write ours, skip foreign, prune
// vanished). Harnesses differ in format and control surface, so projectors
// live here — not in skill repos. Regenerated on add/remove/update; no LLM.

const PROJECTION_MARKER = '# kskills:generated'
const OMP_AGENTS_DIR = path.join(os.homedir(), '.omp', 'agent', 'agents')

// All currently installed skills (farms + lock-recorded copies), deduped by
// authored name. Broken farm links drop out naturally (SKILL.md unreadable).
function installedSkills() {
  const out = new Map()
  const lock = readLock() // one read; project farms consult it per entry
  for (const a of Object.keys(AGENT_TABLE))
    for (const scope of ['global', 'project']) {
      const dir = agentDirs(scope, [a], { optional: true })[0]
      if (!dir) continue
      let ents
      try { ents = fs.readdirSync(dir) } catch { continue }
      for (const e of ents) {
        const p = path.join(dir, e)
        if (!fs.existsSync(path.join(p, 'SKILL.md'))) continue
        // Project farms sit inside arbitrary repos; count only what kskills
        // installed (link or lock-recorded copy) so cwd content never leaks
        // into user-level projections (e.g. openclaw's bare `skills/` path).
        if (scope === 'project') {
          const st = fs.lstatSync(p, { throwIfNoEntry: false })
          if (st && !st.isSymbolicLink() && !lock.some(r => r.dir === dir && r.skill === e)) continue
        }
        try { const info = skillInfo(p); if (!info.internal) out.set(info.name, info) } catch { /* unparsable */ }
      }
    }
  for (const r of lock) {
    const p = path.join(r.dir, r.skill)
    if (fs.existsSync(path.join(p, 'SKILL.md')))
      try { const info = skillInfo(p); if (!info.internal) out.set(info.name, info) } catch { /* unparsable */ }
  }
  return [...out.values()]
}

// Harness-neutral index: prefix → members. Bare skills live under ''.
function extractAgentIndex(skills) {
  const idx = new Map()
  for (const s of skills) {
    const plug = s.name.includes(':') ? s.name.split(':', 1)[0] : ''
    if (!idx.has(plug)) idx.set(plug, [])
    idx.get(plug).push(s)
  }
  return idx
}

// Projector: omp/codex bare command — frontmatter `name` overrides the
// filename; first non-empty body line is the omp tooltip.
function projectCommandOmp(s) {
  // CLI-connector skills (kskills:*) run the subcommand immediately — no
  // skill-body round trip first. Procedure knowledge stays in the skill for
  // the cases that actually need judgment.
  if (s.address?.startsWith('kskills:')) {
    return `---\n${PROJECTION_MARKER}\nname: ${s.name}\n---\n\n${s.desc}\n\nkskills CLI 연결 — 이 커맨드는 스킬 문서를 먼저 열지 않는다. 요청이 서브커맨드 실행으로 즉결되면 지체 없이 CLI를 실행해 결과만 보고한다: kskills <서브커맨드> … . 절차·함정 판단이 필요한 요청(개명 재정렬, 장부 이탈 수습 등)일 때만 ~/.agents/skills/${s.base}/SKILL.md 를 읽는다: $ARGUMENTS\n`
  }
  const envPre = s.requiresEnv
    ? `\nrequires-env 스킬이다 — 본문 절차를 시작하기 전에 아래 자격 해소를 먼저 실행한다 (실패 시 kskills가 출력한 누락 안내를 사용자에게 그대로 전달하고 중단한다):\n\n\`\`\`sh\neval "$(kskills env ${s.name} --load)"\n\`\`\`\n`
    : ''
  return `---\n${PROJECTION_MARKER}\nname: ${s.name}\n---\n\n${s.desc}\n${envPre}\n스킬 '${s.name}'를 읽어 그 지시에 따라 다음 요청을 처리한다: $ARGUMENTS\n`
}

// Projector: omp family-router agent — one per qualified prefix; the routing
// table aggregates member descriptions (no authored content beyond formula).
function projectAgentOmp(plug, members) {
  const table = members.map(m => `- ${m.name} — ${m.desc}`).join('\n')
  return `---\n${PROJECTION_MARKER}\nname: ${plug}\ndescription: ${plug} family 라우터 — 과제 성격에 맞는 ${plug}:* 스킬을 선별·채택해 실행한다. 무상태 변환·검토 작업 위임용.\n---\n\n당신은 ${plug} 스킬 family의 라우터다.\n\n## 스킬 선별\n\n과제를 읽고 아래 family 스킬 중 알맞은 것을 골라 그 지시를 채택한다:\n\n${table}\n\n선별이 모호하면 반문하지 말고 가장 가까운 것을 고르고, 결과 머리에 선택한 스킬을 명시한다.\n\n## 해소 규칙\n\n스킬 디렉터리는 주소의 콜론→하이픈 규칙: \`~/.agents/skills/<주소>.replace(':','-')/SKILL.md\` (없으면 \`~/.claude/skills/\`).\n\n## 실행 계약\n\n1. 채택한 스킬의 프로토콜·출력 형식을 그대로 따른다.\n2. 스킬에 없는 판단은 과제 문맥에서 보완하고 보완했음을 명시한다.\n3. 과제가 지정한 대상을 임의로 좁히지 않는다. 파일 수정은 과제가 명시할 때만.\n`
}

// Install a projection set into a directory: write/refresh ours, skip foreign
// (real files without our marker), prune ours that left the set.
function installProjections(dir, files) {
  let wrote = 0, pruned = 0
  if (files.length) fs.mkdirSync(dir, { recursive: true }) // no empty dirs on machines lacking the harness
  const keep = new Set(files.map(f => f.name))
  for (const f of files) {
    const p = path.join(dir, f.name)
    const st = fs.lstatSync(p, { throwIfNoEntry: false })
    // directories are never ours and never written onto; regular files are
    // foreign unless they carry our marker
    const foreign = st && !st.isSymbolicLink() && (!st.isFile() || !fs.readFileSync(p, 'utf8').includes(PROJECTION_MARKER))
    if (foreign) { out(`  ! skip ${f.name}: ${p} is not ours`); continue }
    if (st?.isSymbolicLink()) fs.rmSync(p) // never write through a legacy link into its target
    fs.writeFileSync(p, f.content)
    wrote++
  }
  let ents
  try { ents = fs.readdirSync(dir) } catch { ents = [] }
  for (const e of ents) {
    const p = path.join(dir, e)
    const st = fs.lstatSync(p, { throwIfNoEntry: false })
    if (!st) continue
    const ours = st.isSymbolicLink() || (st.isFile() && fs.readFileSync(p, 'utf8').includes(PROJECTION_MARKER))
    if (ours && !keep.has(e)) { fs.rmSync(p); pruned++ }
  }
  return { wrote, pruned }
}

// Full projection pass — call after any mutation of the installed set.
function projectAll() {
  const skills = installedSkills()
  const idx = extractAgentIndex(skills)
  if (process.env.KSKILLS_DUMP_AGENTS) { out(JSON.stringify([...idx.entries()].map(([p, m]) => ({ prefix: p, members: m.map(x => x.name) })), null, 2)); return }
  const cmds = []
  const taken = new Map() // base.md → skill name; cross-repo base collisions warn
  for (const s of skills) {
    const f = `${s.base}.md`
    if (taken.has(f)) { out(`  ! name collision: ${f} (${taken.get(f)} kept, ${s.name} skipped)`); continue }
    taken.set(f, s.name)
    cmds.push({ name: f, content: projectCommandOmp(s) })
  }
  const c = installProjections(OMP_COMMANDS_DIR, cmds)
  const agents = [...idx.entries()].filter(([plug]) => plug)
    .map(([plug, members]) => ({ name: `${plug}.md`, content: projectAgentOmp(plug, members) }))
  const a = installProjections(OMP_AGENTS_DIR, agents)
  out(`  ⚙ projected ${c.wrote} command(s), ${a.wrote} agent(s)${c.pruned || a.pruned ? `, pruned ${c.pruned + a.pruned}` : ''}`)
}

async function cmdAdd(flags, pos) {
  if (pos.length > 1) die(`unexpected argument(s): ${pos.slice(1).join(', ')} (one source per add)`)
  const source = await resolveSource(pos[0] ?? DEFAULT_SOURCE)
  if (process.env.KSKILLS_DUMP_SOURCE) { out(JSON.stringify({ ...source, url: source.url ? redact(source.url) : undefined })); return }

  const scope = flags.project ? 'project' : 'global'
  // validate static args before any network/IO — a typo must not cost a clone
  const wildcard = flags.agent.includes('*')
  // full up-front validation for explicit agents: unknown ids AND missing scope
  // paths must die BEFORE any mutation — a die() inside the install loop skips
  // finally and leaves farm/projections out of sync
  if (!wildcard && flags.agent.length) agentDirs(scope, flags.agent)
  const { root } = await obtain(source)
  try {

  let skills = discoverSkills(root).map(skillInfo)
  if (source.subpath) {
    const prefix = path.join(root, source.subpath)
    skills = skills.filter(x => x.dir === prefix || x.dir.startsWith(prefix + path.sep))
  }
  if (!skills.length) die(`no skills found under ${source.subpath ?? root}${source.subpath ? ` (in ${root})` : ''}`)
  const skillSel = [...new Set([...flags.skill, ...(source.skills ?? [])])]
  const selected = skillSel.length
    ? skills.filter(s => skillSel.includes(s.name) || skillSel.includes(s.base))
    : skills.filter(s => !s.internal) // metadata: { internal: true } hidden unless -s
  if (skillSel.length) {
    const missing = skillSel.filter(n => !selected.some(s => s.name === n || s.base === n))
    if (missing.length) die(`skill(s) not found: ${missing.join(', ')} (available: ${skills.map(s => s.name).join(', ')})`)
  }
  out(`${source.label ?? root} — ${selected.length}/${skills.length} skill(s) [${scope}]`)
  for (const s of skills) {
    const mark = selected.includes(s) ? '*' : ' '
    out(`  ${mark} ${s.name}${s.internal ? ' (internal)' : ''}${s.mismatch ? ` (dir: ${s.base})` : ''}  ${s.desc}`.trimEnd())
  }
  if (flags.list) return

  if (flags.copy) die('--copy removed — installs are spec-normalized copies by default; local directories symlink live')
  const live = source.kind === 'local'
  const agents = flags.agent.length
    ? (wildcard ? Object.keys(AGENT_TABLE) : flags.agent)
    : defaultAgents()
  for (const a of agents) {
    // explicit agent selections die on a missing scope path; only the wildcard skips
    const d = agentDirs(scope, [a], { optional: wildcard })[0]
    if (!d) continue
    for (const s of selected)
      installSkill(d, s, { live, source: source.label ?? source.url ?? source.dir ?? root, agent: a })
  }
  } finally {
    // a mid-loop failure must not leave farm and projections out of sync.
    // -l (발견 전용) 은 읽기 경로 — 투영 재생성 부수효과를 내지 않는다.
    if (!flags.list) projectAll()
  }
}
function scanScope(scope, agents, found) {
  for (const a of agents) {
    const dir = agentDirs(scope, [a], { optional: true })[0]
    if (!dir) continue
    let ents
    try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of ents) {
      const p = path.join(dir, e.name)
      const st = fs.lstatSync(p, { throwIfNoEntry: false })
      if (!st) continue
      const scopeTag = scope === 'project' ? `${a}(p)` : a
      if (st.isSymbolicLink()) {
        const abs = path.resolve(dir, fs.readlinkSync(p))
        if (!fs.existsSync(abs)) { // broken link — own record; never merges with a live entry
          const key = `!${e.name}`
          const rec = found.get(key) ?? { name: e.name, agents: new Set(), kind: 'broken', source: fs.readlinkSync(p) }
          rec.agents.add(scopeTag)
          found.set(key, rec)
          continue
        }
        if (!fs.existsSync(path.join(abs, 'SKILL.md'))) continue // not a skill
        const kind = abs.startsWith(REPOS_DIR + path.sep) ? 'kskills' : 'link'
        const source = kind === 'kskills' ? path.relative(REPOS_DIR, abs) : abs
        const rec = found.get(e.name) ?? { name: e.name, agents: new Set(), kind, source, dir: abs }
        rec.agents.add(scopeTag)
        found.set(e.name, rec)
      } else if (st.isDirectory() && fs.existsSync(path.join(p, 'SKILL.md'))) {
        const rec = lockRecord(dir, e.name)
        const kind = rec ? 'copy' : 'dir'
        const source = rec ? rec.source : p
        const r = found.get(e.name) ?? { name: e.name, agents: new Set(), kind, source, dir: p }
        r.agents.add(scopeTag)
        found.set(e.name, r)
      }
    }
  }
}

function cmdList(flags, pos) {
  if (pos.length) die(`unexpected argument(s): ${pos.join(', ')}`)
  const agents = flags.agent.length
    ? (flags.agent.includes('*') ? Object.keys(AGENT_TABLE) : flags.agent)
    : Object.keys(AGENT_TABLE)
  for (const a of agents)
    if (!(a in AGENT_TABLE)) die(`unknown agent: ${a} (use -a '*' or run: kskills help)`)
  const found = new Map()
  scanScope('global', agents, found)
  scanScope('project', agents, found)
  if (!found.size) { out('no skills installed'); return { rows: [] } }
  const rows = [...found.values()].sort((x, y) => x.name.localeCompare(y.name))
  for (const rec of rows)
    out(`${rec.name.padEnd(24)} ${rec.kind.padEnd(8)} ${[...rec.agents].join(',').padEnd(24)} ${rec.source}`)
  return { rows: rows.map(rec => {
    const fm = rec.dir ? parseFrontmatter(path.join(rec.dir, 'SKILL.md')) : {}
    return { ...rec, agents: [...rec.agents], description: fm.description || '',
      requiresEnv: (fm.metadata && typeof fm.metadata === 'object' && !Array.isArray(fm.metadata)) ? parseEnvList(fm.metadata['requires-env']) : null }
  }) }
}
// Detect which harnesses leave a footprint on this machine. A harness counts
// as installed when its global skills root exists; a bare home dir (e.g.
// ~/.claude without skills) is reported as a trace, not an install.
function cmdHarnesses(flags) {
  const rows = []
  const lock = readLock()
  for (const [agent, [, glob]] of Object.entries(AGENT_TABLE)) {
    if (!glob) continue
    const g = expand(glob)
    if (fs.existsSync(g)) {
      const dir = agentDirs('global', [agent], { optional: true })[0]
      const managed = dir ? lock.some(r => r.dir === dir) : false
      rows.push({ agent, status: 'installed', dir: g, managed })
    } else {
      const home = g.replace(/\/skills\/?$/, '')
      if (home !== g && fs.existsSync(home)) rows.push({ agent, status: 'trace', dir: home, managed: false })
    }
  }
  const defs = new Set(defaultAgents())
  // Detected default targets without a footprint still get a row (status
  // 'absent') — consumers (web app) need the full selectable set, and a
  // footprint-less harness is exactly the install-worthy case.
  for (const a of defs)
    if (!rows.some(r => r.agent === a) && AGENT_TABLE[a]?.[1])
      rows.push({ agent: a, status: 'absent', dir: expand(AGENT_TABLE[a][1]), managed: false })
  for (const r of rows) r.defaultTarget = defs.has(r.agent)
  rows.sort((a, b) => a.agent.localeCompare(b.agent))
  if (flags.emit) { out(JSON.stringify(rows, null, 2)); return { rows } }
  for (const r of rows) out(`${r.agent.padEnd(20)} ${r.status.padEnd(10)} ${r.dir}${r.managed ? '  (kskills farm)' : ''}`)
  return { rows }
}

// --- remove ----------------------------------------------------------------------

// A source arg names a repo (owner/repo, URL) or directory (./dir, /abs) —
// anything with '/', which a skill name can never contain. Membership:
// farm links resolving into the source's cache checkout (or the source dir
// for local installs) plus copies whose lock record carries the source.
// Resolution stays offline — cache dir names and lock records only.
function sourceMembership(arg) {
  const roots = []
  const lockSources = new Set()
  const isPath = arg.startsWith('/') || arg.startsWith('./') || arg.startsWith('../') || arg.startsWith('~')
  if (isPath) {
    const dir = normPath(arg) // filesystem identity — relative/symlinked args must match
    if (fs.existsSync(dir)) roots.push(dir)
    for (const r of readLock())
      if (normPath(String(r.source)) === dir) lockSources.add(r.source)
  } else {
    const want = gitId(arg)
    let ents
    try { ents = fs.readdirSync(REPOS_DIR, { withFileTypes: true }) } catch { ents = [] }
    for (const e of ents) if (e.isDirectory() && e.name === want) roots.push(path.join(REPOS_DIR, e.name))
    for (const r of readLock())
      if (gitId(String(r.source).replace(/\.git$/, '')) === want) lockSources.add(r.source)
  }
  return { roots, lockSources }
}

function cmdRemove(flags, pos) {
  const scopes = []
  if (flags.project) scopes.push('project')
  if (flags.global || !flags.project) scopes.push('global')
  const agents = flags.agent.length
    ? (flags.agent.includes('*') ? Object.keys(AGENT_TABLE) : flags.agent)
    : Object.keys(AGENT_TABLE)
  const sources = pos.filter(p => p.includes('/'))
  if (flags.all && flags.broken) die('remove: --all and --broken cannot be combined')
  if ((flags.all || flags.broken) && pos.length) die(`remove: --${flags.all ? 'all' : 'broken'} cannot be combined with skill name or source arguments`)
  let names = flags.all || flags.broken ? null : pos.filter(p => !p.includes('/'))
  if (!names?.length && !sources.length && !flags.all && !flags.broken) {
    // bare remove defaults to the broken sweep — dangling links are drift and
    // cleaning them needs no argument
    flags.broken = true
    names = null // broken mode must not carry an empty-name filter
  }
  const memberships = sources.map(sourceMembership)
  for (const [i, s] of sources.entries())
    if (!memberships[i].roots.length && !memberships[i].lockSources.size)
      die(`remove: no installed skills match source: ${s}`)
  const inSource = (d, e, st) => memberships.some(m => {
    if (st.isSymbolicLink()) {
      try {
        const t = normPath(fs.readlinkSync(path.join(d, e))) // target may be absolute — resolve, don't join
        if (m.roots.some(r => { const n = normPath(r); return t === n || t.startsWith(n + path.sep) })) return true // root-skill links target the source dir itself
      } catch { /* unreadable link */ }
    }
    const lr = lockRecord(d, e)
    return Boolean(lr && m.lockSources.has(lr.source))
  })
  let removed = 0
  const removedSources = new Set()
  for (const scope of scopes) {
    for (const d of agentDirs(scope, agents, { optional: true })) {
      let ents
      try { ents = fs.readdirSync(d) } catch { continue }
      for (const e of ents) {
        const p = path.join(d, e)
        const st = fs.lstatSync(p, { throwIfNoEntry: false })
        if (!st) continue
        if (names && !names.includes(e) && !frontmatterKeys(path.join(d, e, 'SKILL.md')).some(k => names.includes(k)) && !inSource(d, e, st)) continue
        if (st.isSymbolicLink()) {
          if (flags.broken && fs.existsSync(path.resolve(d, fs.readlinkSync(p)))) continue
          fs.rmSync(p)
          out(`  ✗ ${e} (${scope}/${path.basename(d)}${flags.broken ? ', broken' : ''})`)
          removed++
        } else if (st.isDirectory()) {
          if (flags.broken) continue
          const rec = lockRecord(d, e)
          if (!rec) { out(`  ! skip ${e}: directory not installed by kskills (no lock record)`); continue }
          fs.rmSync(p, { recursive: true, force: true })
          lockRemove(d, e)
          if (rec.source) removedSources.add(String(rec.source))
          out(`  ✗ ${e} (${scope}/${path.basename(d)}, copy)`)
          removed++
        }
      }
    }
  }
  out(removed ? `removed ${removed} skill(s)` : 'nothing to remove')
  // lock is the ledger: when a source's LAST record goes away, its cache is a
  // derived artifact with nothing left to derive — remove it with the install
  const remaining = new Set(readLock().map(r => String(r.source)))
  for (const src of removedSources) {
    if (remaining.has(src)) continue
    const cache = path.join(REPOS_DIR, gitId(src))
    if (fs.existsSync(path.join(cache, '.git'))) {
      fs.rmSync(cache, { recursive: true, force: true })
      out(`  - 소스 캐시 제거: ${gitId(src)} (${src})`)
    }
  }
  if (removed) projectAll()
}
// Lock skill names predate spec normalization (cache-id dirnames on
// root-SKILL.md sources) — match a record to discovery results through the
// INSTALLED copy's identity keys as well. Shared by update and reportLinks.
function lockSkillMatch(rec, discovered) {
  const installedKeys = frontmatterKeys(path.join(rec.dir, rec.skill, 'SKILL.md'))
  return discovered.find(s => s.base === rec.skill || s.name === rec.skill || installedKeys.includes(s.name)) ?? null
}

function reportLinks(repo) {
  let swept = false
  const repoId = path.basename(repo)
  const discovered = discoverSkills(repo).map(skillInfo)
  const linked = new Set()
  // copies: membership lives in the lock, resolved through DISCOVERY — never
  // by reconstructing a "skills/<name>" path (root-SKILL.md repos break that)
  for (const r of readLock()) {
    if (resolveSourceCacheOnly(String(r.source)) !== repoId) continue // tree-URL labels must normalize to the cache id too
    const hit = lockSkillMatch(r, discovered)
    if (hit) linked.add(hit.dir)
  }
  // live/local installs: membership is the symlink target
  for (const a of Object.keys(AGENT_TABLE)) {
    for (const dir of [agentDirs('global', [a], { optional: true })[0], agentDirs('project', [a], { optional: true })[0]].filter(Boolean)) {
      let ents
      try { ents = fs.readdirSync(dir) } catch { continue }
      for (const e of ents) {
        const p = path.join(dir, e)
        const st = fs.lstatSync(p, { throwIfNoEntry: false })
        if (!st?.isSymbolicLink()) continue
        const abs = path.resolve(dir, fs.readlinkSync(p))
        if (!abs.startsWith(repo + path.sep)) continue
        if (!fs.existsSync(abs)) out(`  ! broken link: ${p} (removed upstream)`)
        else linked.add(abs)
      }
    }
  }
  for (const s of discovered)
    if (!linked.has(s.dir)) out(`  + available: ${s.name} — kskills add 로 설치`)
}

// Farm-wide dangling-symlink sweep: any kskills farm dir, any agent. Broken
// links are drift — the link and its lock record go together. Runs as a
// default update duty, independent of cache presence: live installs (local
// symlinks) have no cached repo, so per-repo reporting never sees them.
function sweepBrokenLinks() {
  let swept = false
  for (const a of Object.keys(AGENT_TABLE)) {
    for (const dir of [agentDirs('global', [a], { optional: true })[0], agentDirs('project', [a], { optional: true })[0]].filter(Boolean)) {
      let ents
      try { ents = fs.readdirSync(dir) } catch { continue }
      for (const e of ents) {
        const p = path.join(dir, e)
        const st = fs.lstatSync(p, { throwIfNoEntry: false })
        if (!st?.isSymbolicLink()) continue
        if (fs.existsSync(p)) continue // resolves fine — not broken
        fs.rmSync(p)
        lockRemove(dir, e)
        swept = true
        out(`  ✗ broken link removed: ${p} (removed upstream)`)
      }
    }
  }
  return swept
}
// --- update ----------------------------------------------------------------------

async function cmdUpdate(flags, pos) {
  if (flags.skill.length) die(`update: -s does not apply here (per-skill refresh is not supported; got: ${flags.skill.join(', ')})`)
  if (flags.list || flags.copy) die('update: -l/--copy do not apply here (they belong to add/use)')
  let changed = false
  // source args scope BOTH stages — a named source must never trigger work
  // the user did not ask for (and an unmatched name is an error, not a no-op)
  const wanted = pos.length ? pos : null
  // [@]<skill>[@<registry>] 인자는 레지스트리 해소 후 url로 정규화 — 설치 기록은 url로 매칭된다
  if (wanted) for (let i = 0; i < wanted.length; i++) {
    const p = parseRegistryExpr(String(wanted[i]))
    if (!p) continue
    wanted[i] = registryResolveEntry(p.skill, p.registry).entry.source.url
  }
  const sameSource = (a, b) => String(a) === String(b)
    || resolveSourceCacheOnly(String(a)) === resolveSourceCacheOnly(String(b))
    || (fs.existsSync(String(a)) && fs.existsSync(String(b)) && normPath(String(a)) === normPath(String(b)))
  const allRecords = readLock()
  fs.mkdirSync(REPOS_DIR, { recursive: true })
  let repos = fs.readdirSync(REPOS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(REPOS_DIR, e.name, '.git')))
    .map(e => path.join(REPOS_DIR, e.name))
  // the lock is the ledger; a cache is a derived artifact. A cache with no
  // install record is drift (e.g. a pre-isolation catalog browse) — remove it
  // silently-then-stated, never pull it
  const managed = new Set(allRecords.map(r => gitId(String(r.source))))
  for (const r of repos.filter(r => !managed.has(path.basename(r)))) {
    fs.rmSync(r, { recursive: true, force: true })
    out(`  - 미설치 캐시 제거: ${path.basename(r)}`)
  }
  repos = repos.filter(r => managed.has(path.basename(r)))
  // Validate EVERY named source BEFORE any mutation — a static argument error
  // must never leave refreshed copies with skipped projections behind
  const hasLiveTarget = (p) => {
    const target = normPath(p)
    if (!fs.existsSync(target)) return false
    for (const a of Object.keys(AGENT_TABLE)) {
      for (const dir of [agentDirs('global', [a], { optional: true })[0], agentDirs('project', [a], { optional: true })[0]].filter(Boolean)) {
        let ents
        try { ents = fs.readdirSync(dir) } catch { continue }
        for (const e of ents) {
          const q = path.join(dir, e)
          if (!fs.lstatSync(q, { throwIfNoEntry: false })?.isSymbolicLink()) continue
          const t = normPath(fs.readlinkSync(q))
          if (t === target || t.startsWith(target + path.sep)) return true
        }
      }
    }
    return false
  }
  const liveNoop = []
  if (wanted) {
    const unmatched = wanted.filter(p => {
      const hitRec = allRecords.some(rec => sameSource(p, rec.source))
      const hitRepo = repos.some(r => resolveSourceCacheOnly(p) === path.basename(r))
      const hitLive = hasLiveTarget(p)
      if (!hitRec && !hitRepo && hitLive) liveNoop.push(p)
      return !hitRec && !hitRepo && !hitLive
    })
    if (liveNoop.length) for (const s of liveNoop) out(`  ${s}: live install — nothing to refresh`)
    if (unmatched.length) die(`no cached repo or installed copy matches: ${unmatched.join(', ')}`)
    repos = repos.filter(r => wanted.some(p => resolveSourceCacheOnly(p) === path.basename(r)))
  }
  const records = allRecords
    .filter(rec => !wanted || wanted.some(p => sameSource(p, rec.source)))
  // 1) refresh copy-installed skills from their sources
  // obtain() per SOURCE, not per record: one source serves many records and
  // repeats dominated wall time (23 records → 23 clones of the same work)
  const srcCache = new Map()
  const sourceOnce = async (label) => {
    if (!srcCache.has(label)) {
      try {
        const src = await resolveSource(String(label), { fatal: false }) // dead source records isolate too
        const { root } = await obtain(src, { fatal: false })
        srcCache.set(label, { skills: discoverSkills(root).map(skillInfo) })
      } catch (e) { srcCache.set(label, { error: e }) }
      const s = srcCache.get(label)
      if (!s.error) out(`→ ${label} (cache refreshed once)`)
    }
    const s = srcCache.get(label)
    if (s.error) throw s.error
    return s.skills
  }
  for (const rec of records) {
    try {
      // legacy lock records carry pre-normalization cache-id skill names —
      // shared matcher falls back to the installed copy's identity keys
      const match = lockSkillMatch(rec, await sourceOnce(rec.source))
      if (!match) {
        // the source is the truth; a copy with no upstream counterpart is
        // drift — remove it with its lock record (rename follow-through)
        fs.rmSync(path.join(rec.dir, rec.skill), { recursive: true, force: true })
        lockRemove(rec.dir, rec.skill)
        out(`  ✗ ${rec.skill}: no longer in source — removed`)
        changed = true
        continue
      }
      const target = path.join(rec.dir, rec.skill)
      fs.rmSync(target, { recursive: true, force: true })
      fs.cpSync(match.dir, target, { recursive: true })
      applyStrictName(target, match) // remote installs are always normalized copies
      out(`  ↻ ${rec.skill} (copy, ${rec.source})`)
      changed = true
    } catch (e) {
      out(`  ! ${rec.skill}: update failed — ${redact(String(e.message || e))}`)
    }
  }
  // 1.5) broken sweep — default update duty, independent of cache presence:
  // live installs (local symlinks) have no cached repo, so the repo loop
  // below never sees their dangling links
  if (sweepBrokenLinks()) changed = true
  if (!repos.length && !records.length) {
    if (wanted) return // live-only args — honest no-op (validation passed above)
    out('nothing to update — run: kskills add'); return
  }
  for (const repo of repos) {
    const r = run('git', ['-C', repo, 'pull', '--ff-only'])
    if (!r.ok) { out(`! ${path.basename(repo)}: pull failed\n${redact(r.out.trim())}`); continue }
    const already = /Already up to date/.test(r.stdout)
    out(`${path.basename(repo)}: ${already ? '최신' : '갱신됨'}`)
    if (!already) {
      const log = run('git', ['-C', repo, 'log', '--oneline', 'ORIG_HEAD..HEAD'])
      if (log.ok) for (const l of log.stdout.trim().split('\n')) if (l) out(`    ${l}`)
    }
    if (reportLinks(repo)) changed = true // broken-link sweep may have changed the farm
    if (!already) changed = true
  }
  if (changed) projectAll()
}

function resolveSourceCacheOnly(p) {
  try {
    const s = resolveSourceSync(p)
    return s.id
  } catch { return null }
}

function resolveSourceSync(src) {
  let m = src.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/tree\/([^/]+)\/(.+?)(?:\/)?$/)
  if (m) return { id: `${segEsc(m[1])}__${segEsc(m[2].replace(/\.git$/, ''))}` }
  m = src.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/)
  if (m) return { id: `${segEsc(m[1])}__${segEsc(m[2])}` }
  if (/^(https?|git|ssh|file):\/\//.test(src) || /^git@/.test(src) || /\.git$/.test(src)) return { id: gitId(src) }
  m = src.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (m) return { id: `${segEsc(m[1])}__${segEsc(m[2])}` }
  return { id: null }
}

// --- find ------------------------------------------------------------------------

async function cmdFind(flags, pos) {
  if (pos.length > 1) die(`unexpected argument(s): ${pos.slice(1).join(', ')} (one query per find)`)
  const q = (pos[0] ?? '').toLowerCase()
  const results = []
  const found = new Map()
  scanScope('global', Object.keys(AGENT_TABLE), found)
  scanScope('project', Object.keys(AGENT_TABLE), found)
  for (const rec of found.values()) {
    // search installed skills by their IDENTITY (authored name/address +
    // description via skillInfo), not just the farm dirname — same model as
    // remove's frontmatterKeys and the cache-side search
    const info = rec.dir && fs.existsSync(path.join(rec.dir, 'SKILL.md')) ? skillInfo(rec.dir) : { name: rec.name, desc: '' }
    const keys = [rec.name, info.name, info.desc].filter(Boolean).map(s => s.toLowerCase())
    if (!q || keys.some(k => k.includes(q))) results.push({ where: 'installed', name: rec.name, desc: rec.kind, source: rec.source })
  }
  fs.mkdirSync(REPOS_DIR, { recursive: true })
  for (const e of fs.readdirSync(REPOS_DIR, { withFileTypes: true })) {
    const repo = path.join(REPOS_DIR, e.name)
    if (!e.isDirectory() || !fs.existsSync(path.join(repo, '.git'))) continue
    for (const s of discoverSkills(repo).map(skillInfo))
      if (!q || s.name.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q))
        results.push({ where: 'cache', name: s.name, desc: s.desc, source: e.name })
  }
  if (!results.length) { out(q ? `no match for: ${q}` : 'no skills found'); return }
  for (const r of results)
    out(`${r.where.padEnd(10)} ${r.name.padEnd(24)} ${r.desc}`.trimEnd())
}

// --- use -------------------------------------------------------------------------

async function cmdUse(flags, pos) {
  if (!pos.length) die('use: give a source (e.g. kskills use kaos-works/kskills --skill dev-test)')
  if (pos.length > 1) die(`unexpected argument(s): ${pos.slice(1).join(', ')} (one source per use)`)
  if (flags.skill.length > 1) die(`use: exactly one skill per invocation (got ${flags.skill.length}: ${flags.skill.join(', ')})`)
  const source = await resolveSource(pos[0])
  const { root } = await obtain(source)
  const skills = discoverSkills(root).map(skillInfo)
  if (!skills.length) die(`no skills found under ${source.subpath ?? root}${source.subpath ? ` (in ${root})` : ''}`)
  let pick = skills[0]
  const regSel = source.skills ?? [] // 레지스트리 단일 스킬 항목 — use도 자동 선택된다
  if (flags.skill.length || regSel.length) {
    const want = flags.skill.length ? flags.skill : regSel
    pick = skills.find(s => want.includes(s.name) || want.includes(s.base))
    if (!pick) die(`skill(s) not found: ${want.join(', ')} (available: ${skills.map(s => s.name).join(', ')})`)
  } else if (skills.length > 1) {
    out(`multiple skills in source — pick one with -s:`)
    for (const s of skills) out(`  - ${s.name}  ${s.desc}`)
    return
  }
  const text = fs.readFileSync(path.join(pick.dir, 'SKILL.md'), 'utf8')
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const extras = fs.readdirSync(pick.dir).filter(f => f !== 'SKILL.md')
  const prompt = [
    `You now have access to the skill "${pick.name}": ${pick.desc}`,
    ``,
    `<skill name="${pick.name}">`,
    body.trim(),
    `</skill>`,
    extras.length ? `\nAdditional files in the skill directory (${pick.dir}): ${extras.join(', ')}` : '',
  ].filter(x => x !== '').join('\n')
  if (flags.agent && typeof flags.agent[0] === 'string') {
    const r = spawnSync(flags.agent[0], { input: prompt, shell: true, stdio: ['pipe', 'inherit', 'inherit'], env: process.env })
    process.exit(r.status ?? 1)
  }
  out(prompt)
}

// --- init ------------------------------------------------------------------------

function cmdInit(pos) {
  if (pos.length > 1) die(`unexpected argument(s): ${pos.slice(1).join(', ')} (one directory per init)`)
  const dir = pos.length ? path.resolve(expand(pos[0])) : process.cwd()
  const name = path.basename(dir)
  const file = path.join(dir, 'SKILL.md')
  if (fs.existsSync(file)) die(`${file} already exists`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, `---\nname: ${name}\ndescription: What this skill does. Use when <trigger condition>.\n---\n\n# ${name}\n\nInstructions here.\n`)
  out(`created ${file}`)
}

// --- env -------------------------------------------------------------------------
// Skill credential expectations: `metadata.requires-env` declares the keys a
// skill needs; the machine has ONE source of truth (~/.local/state/skills/.env)
// managed via the web admin. Values never reach stdout — only key presence.

function envSource(flags) {
  return flags.source ? path.resolve(expand(flags.source)) : ENV_FILE
}

// KEY= lines of an env file → Set of keys (values stay in the file; unreadable
// or absent → null so callers can distinguish "no source" from "empty source").
function envFileKeys(src) {
  try {
    const keys = new Set()
    for (const line of fs.readFileSync(src, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=/) || line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)
      if (m) keys.add(m[1])
    }
    return keys
  } catch { return null }
}

const envHasKey = (k, fileKeys) => Boolean(process.env[k]) || Boolean(fileKeys && fileKeys.has(k))

function cmdEnv(flags, pos) {
  const src = envSource(flags)
  const fileKeys = envFileKeys(src)
  if (flags.check) {
    if (pos.length) die(`unexpected argument(s): ${pos.join(', ')} (--check audits every skill)`)
    const rows = installedSkills().filter(s => s.requiresEnv)
    if (!rows.length) { out('requires-env 선언 스킬 없음'); return }
    out(`source: ${fileKeys ? src : `${src} (없음 — 프로세스 env만 검사)`}`)
    let missing = 0
    for (const s of rows) {
      const miss = s.requiresEnv.filter(k => !envHasKey(k, fileKeys))
      missing += miss.length
      out(`  ${miss.length ? '✗' : '✓'} ${s.name}  ${s.requiresEnv.join(', ')}${miss.length ? ` — 누락: ${miss.join(', ')}` : ''}`)
    }
    if (missing) die(`${missing} key(s) missing — 채우려면: kskills web (env 패널) 또는 직접 ${src} 편집`, 1)
    return
  }
  const q = pos[0]
  if (!q) die('env: give a skill name (kskills env <skill-name>), or --check for the full audit')
  if (pos.length > 1) die(`unexpected argument(s): ${pos.slice(1).join(', ')}`)
  const s = installedSkills().find(x => x.name === q || x.base === q)
  if (!s) die(`skill not installed: ${q}`)
  if (!s.requiresEnv) { out(`${s.name}: requires-env 선언 없음`); return }
  if (flags.load) {
    const lines = []
    if (fileKeys) lines.push(`set -a; . "${src}"; set +a`)
    for (const k of s.requiresEnv)
      lines.push(`[ -n "\${${k}:-}" ] || { echo 'kskills: ${k} 누락 (${fileKeys ? src : '프로세스 env'})' >&2; exit 1; }`)
    out(lines.join('\n'))
    return
  }
  out(`${s.name} requires-env: ${s.requiresEnv.join(', ')}`)
  out(`source: ${fileKeys ? src : `${src} 없음 — 프로세스 env만 검사`}`)
  for (const k of s.requiresEnv) out(`  ${envHasKey(k, fileKeys) ? '✓' : '✗'} ${k}`)
}

// --- web-ui ------------------------------------------------------------------------
// `kskills` with no args (interactive TTY) boots the kskills-app web admin in
// the foreground: Ctrl-C stops it. Non-TTY contexts (CI, pipes) get help.
async function cmdWebUi(flags, pos) {
  if (pos.length) die(`unexpected argument(s): ${pos.join(', ')}`)
  if (flags.skill.length || flags.agent.length || flags.list || flags.copy || flags.all || flags.broken) die('web-ui: install/remove options do not apply here')
  const appDir = process.env.KSKILLS_APP || path.join(os.homedir(), 'kskills-app')
  if (!fs.existsSync(path.join(appDir, 'server.mjs'))) {
    out(`kskills-app 미설치 — 웹 어드민은 별도 앱이 필요하다 (KSKILLS_APP 경로 지정 또는 설치). looked: ${appDir}`)
    out(HELP)
    return { command: 'web-ui', fallback: 'help' }
  }
  out(`kskills-app 기동 (${appDir}) — 종료는 Ctrl-C`)
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync('node', ['server.mjs'], { cwd: appDir, stdio: 'inherit' })
  return { command: 'web-ui', exit: r.status ?? 1 }
}

// --- catalog ----------------------------------------------------------------------
// Source-scoped index emission (docs/plans/catalog-ecosystem.md): the source
// repo is the single source of truth; the catalog is a derived signpost.
// Consumption (lookup, alias add) is deliberately out of scope until demand.
async function cmdCatalog(flags, pos) {
  if (!flags.emit) die('catalog: --emit required — emits a catalog.json fragment for one source')
  if (pos.length !== 1) die(`catalog: exactly one source required (got ${pos.length})`)
  if (flags.skill.length || flags.agent.length || flags.list || flags.copy) die('catalog: -s/-a/-l/--copy do not apply here')
  const srcSpec = pos[0]
  const src = await resolveSource(srcSpec)
  // Read-only index. Cached source → scan the cache (zero network). Uncached
  // git source → throwaway shallow clone under os.tmpdir(): browsing must not
  // populate the install cache (update would start pulling a source you never
  // installed). The real acquisition happens at add-time, from the origin.
  let root, ephemeral = null
  const isGit = src.kind === 'github' || src.kind === 'git'
  if (isGit && !fs.existsSync(path.join(REPOS_DIR, src.id, '.git'))) {
    ephemeral = fs.mkdtempSync(path.join(os.tmpdir(), 'kskills-catalog-'))
    out(`→ ${src.label} — 임시 shallow 클론으로 색인 (설치 시점에 origin에서 획득)`)
    root = obtainGit(src, { dest: ephemeral, depth: 1 })
  } else {
    ;({ root } = await obtain(src, { refresh: false }))
  }
  const items = discoverSkills(root).map(skillInfo)
    .filter(s => !s.internal) // internal skills stay hidden unless explicitly -s'd at install time
    .map(s => ({
      name: s.base, // normalized install unit (dirname-derived, spec-valid)
      address: s.address || '', // v1 qualified identity, if the source carries one
      family: s.address ? s.address.split(':')[0] : '',
      description: s.desc,
      source: srcSpec, // verbatim source spec (git ref / tree subpath preserved)
    }))
  if (ephemeral) fs.rmSync(ephemeral, { recursive: true, force: true })
  out(JSON.stringify(items, null, 2))
  return { emitted: items.length, items }
}
// --- main ----------------------------------------------------------------------


const HELP = `kskills ${VERSION} — personal agent-skills installer (skills CLI parity)

Usage:
  kskills add [source]        install skills (default source: ${DEFAULT_SOURCE}, scope: global)
  kskills registry [name]     레지스트리 항목 목록 (미지정 시 default · ~/.kskills/registries.json 으로 등록 · --refresh 갱신)
  kskills registry add|remove|default <이름> [url]  등록·제거·기본값 (~/.kskills/registries.json)
  소스 문법 (add/update/use 공통): <skill>[@<registry>] · family:slug · bare 이름(카탈로그) · URL · owner/repo · 경로
  kskills list                list installed skills (global + project)
  kskills harnesses           list harnesses detected on this machine (--emit JSON)
  kskills remove [names|src]   remove skills by name/address, or every skill of a source (owner/repo, URL, ./dir)
  kskills env [skill]        스킬 env 기대·해소 — 키 조회 / --load 셸 프리앰블 / --check 감사 (값은 미출력)
                            소스 기본 ~/.local/state/skills/.env (--source <path> 로 지정)
  kskills update [source]     pull cached repos, refresh copies, verify links
  kskills use <source>        print (or pipe to an agent) a skill prompt without installing
  kskills find [query]        search installed + cached skills by name/description
  kskills catalog --emit <src>  emit a catalog.json fragment for one source (name/address/family/description/source)
  kskills init [name]         scaffold a SKILL.md in ./(name)/
  kskills web-ui              웹 어드민 기동 (kskills-app — foreground, 종료는 Ctrl-C)
  kskills                     인자 없이 실행 시 웹 어드민 기동 (비-TTY는 도움말)

Sources:
  owner/repo                  GitHub shorthand (https → gh → ssh fallback)
  https://github.com/o/r/tree/<ref>/<path>   one skill subtree of a repo
  https://… | git@… | file:// git URL
  host or https://host/       well-known discovery (/.well-known/agent-skills/)
  https://… (archive|SKILL.md) direct download (tar/tgz/zip; installs as copy)
  ./path                      local directory (symlinked in place — live)
Options:
  -a, --agent <id|*>          target agent (repeatable; '*' = all ${Object.keys(AGENT_TABLE).length} agents)
                             default: agents + 시장 점유율 상위 하네스 중 감지분 (claude-code, codex,
                             github-copilot, gemini-cli, cursor, opencode, amp 순 + pi). 감지 = PATH
                             binary 또는 desktop app 번들 (cursor: Cursor.app). omp 는 farm projection
                             으로 상시 커버. KSKILLS_DEFAULT_AGENTS 로 고정 (빈 값 = agents farm 만)
                             note: 'agents' is a kskills-only alias for the shared ~/.agents/skills dir
                             installs: 원격 소스는 스펙 준수 copy (name=dirname, v1 주소는
                             frontmatter address 필드로 보존) — ./path 로컬 소스만 라이브 심볼릭
  -s, --skill <name>          select skills by name (repeatable)
  -g, --global | -p, --project  scope (default: global — upstream differs)
  -l, --list                  list skills in source without installing
  --all | --broken            (remove) remove everything / only dangling symlinks
  -h, --help / -v, --version
Projections (add/remove/update 시 자동 재생성):
  ~/.omp/agent/commands/<base>.md 각 스킬 → 커맨드 (frontmatter name=주소, marker 관리)
  ~/.omp/agent/agents/<plug>.md 주소 접두사별 family 라우터 에이전트
  생성물은 '# kskills:generated' 마커로 식별; foreign 파일(무마커 실파일)은 건드리지 않음
Cache:   ${REPOS_DIR}   Copies: ${LOCK_FILE}
Env:     KSKILLS_HOME, KSKILLS_SOURCE, GITHUB_TOKEN/GH_TOKEN, GIT_SSH_COMMAND,
         SKILLS_DOWNLOAD_MAX_BYTES, SKILLS_EXTRACT_MAX_BYTES, SKILLS_EXTRACT_MAX_FILES`

function saveRegistriesFile(file) {
  fs.mkdirSync(path.dirname(REGISTRIES_FILE), { recursive: true })
  const tmp = `${REGISTRIES_FILE}.${process.pid}.tmp` // 제자리 쓰기 금지 — 크래시 시 잘린 파일이 다음 조작을 오염시킨다
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2) + '\n')
  fs.renameSync(tmp, REGISTRIES_FILE)
}
function cmdRegistry(flags, pos) {
  const sub = pos[0]
  if (sub === 'add' || sub === 'remove' || sub === 'default') {
    // 부재만 신규 취급 — 파송·이형(shape) 은 즉시 실패 (무음 폐기·거짓 성공 방지)
    let file = {}
    try { file = JSON.parse(fs.readFileSync(REGISTRIES_FILE, 'utf8')) }
    catch (e) { if (e.code !== 'ENOENT') die(`registries.json 파싱 실패: ${e.message} (${REGISTRIES_FILE})`) }
    if (!file || typeof file !== 'object' || Array.isArray(file)) die(`registries.json 형식 오류: 객체여야 한다 (${REGISTRIES_FILE})`)
    file.registries ??= {}
    if (typeof file.registries !== 'object' || Array.isArray(file.registries)) die(`registries.json 형식 오류: registries 는 객체여야 한다 (${REGISTRIES_FILE})`)
    if (sub === 'add') {
      const [name, url] = [pos[1], pos[2]]
      if (!name || !url) die('use: kskills registry add <이름> <git URL|경로>')
      // 점 미허용(경로 이탈 '.','..' 원천 차단)·서브커맨드 예약어 제외(조회 교착 방지)
      if (!/^[A-Za-z0-9_-]+$/.test(name) || ['add', 'remove', 'default'].includes(name)) die(`레지스트리 이름은 [A-Za-z0-9_-] (add/remove/default 제외) — 받은: '${name}'`)
      if (BUILTIN_REGISTRIES[name] && BUILTIN_REGISTRIES[name] !== url) out(`! 내장 '${name}' 을(를) 덮어쓴다 (내장: ${BUILTIN_REGISTRIES[name]})`)
      file.registries[name] = url
      saveRegistriesFile(file)
      out(`등록 ✓ ${name} → ${url} (${REGISTRIES_FILE})`)
    } else if (sub === 'remove') {
      const name = pos[1]
      if (!name) die('use: kskills registry remove <이름>')
      if (!file.registries[name]) {
        if (BUILTIN_REGISTRIES[name]) die(`'${name}' 은(는) 내장 레지스트리 — 파일에서 제거할 수 없다`)
        die(`등록되지 않은 레지스트리: ${name} — 등록됨: ${Object.keys({ ...BUILTIN_REGISTRIES, ...file.registries }).join(', ')}`)
      }
      delete file.registries[name]
      if (file.default === name) delete file.default
      saveRegistriesFile(file)
      out(`제거 ✓ ${name}`)
    } else {
      const name = pos[1]
      if (!name) die('use: kskills registry default <이름>')
      if (!registriesConfig().registries[name]) die(`등록되지 않은 레지스트리: ${name} — 등록됨: ${Object.keys(registriesConfig().registries).join(', ')}`)
      file.default = name
      saveRegistriesFile(file)
      out(`default ✓ ${name}`)
    }
    return { command: 'registry', registry: sub }
  }
  const cfg = registriesConfig()
  const names = Object.keys(cfg.registries)
  if (!names.length) {
    out('등록된 레지스트리가 없다 — "kskills registry add <이름> <git URL|경로>" 로 등록하라:')
    out('  {"default": "<이름>", "registries": {"<이름>": "<git URL 또는 경로>"}}')
    return { command: 'registry', registry: null }
  }
  const name = pos[0] ?? cfg.default
  const reg = registryLoad(name, { refresh: flags.refresh })
  out(`${name} — ${reg.description ?? ''} (${reg.entries.length}개 항목${name !== cfg.default ? ` · default: ${cfg.default}` : ''})`)
  for (const e of reg.entries) out(`  ${e.name.padEnd(22)} ${String(e.source.ref).padEnd(8)} ${e.description}`)
  return { command: 'registry', registry: name }
}

async function dispatch(flags, pos) {
  if (flags.version) { out(VERSION); return { command: 'version', version: VERSION } }
  if (flags.help) { out(HELP); return { command: 'help' } }
  const cmd = pos.shift() ?? (process.stdout.isTTY ? 'web-ui' : 'help')
  switch (cmd) {
    case 'add': return { command: 'add', ...((await cmdAdd(flags, pos)) ?? {}) }
    case 'list': case 'ls': return { command: 'list', ...(cmdList(flags, pos) ?? {}) }
    case 'harnesses': return { command: 'harnesses', ...(cmdHarnesses(flags) ?? {}) }
    case 'remove': case 'rm': return { command: 'remove', ...(cmdRemove(flags, pos) ?? {}) }
    case 'update': return { command: 'update', ...(await cmdUpdate(flags, pos) ?? {}) }
    case 'registry': return { command: 'registry', ...(cmdRegistry(flags, pos) ?? {}) }
    case 'find': return { command: 'find', ...(await cmdFind(flags, pos) ?? {}) }
    case 'catalog': return { command: 'catalog', ...((await cmdCatalog(flags, pos)) ?? {}) }
    case 'env': return { command: 'env', ...(cmdEnv(flags, pos) ?? {}) }
    case 'init': return { command: 'init', ...(cmdInit(pos) ?? {}) }
    case 'web-ui': return await cmdWebUi(flags, pos)
    case 'use': return { command: 'use', ...((await cmdUse(flags, pos)) ?? {}) }
    case 'help': out(HELP); return { command: 'help' }
    default:
      // preserve original CLI byte-for-byte: bare stderr message, no "error:" prefix
      if (!logContext.getStore()) {
        process.stderr.write(`unknown command: ${cmd}\n\n${HELP}\n`)
        process.exit(1)
      }
      throw new KskillsError(`unknown command: ${cmd}`)
  }
}

// --- library interface (kskills-app) ---------------------------------------------
// Run any command against an isolated output sink: no terminal writes, no
// process.exit — errors surface as { ok: false, error } instead.
// KSKILLS_HOME/HOME are read at import time — set them BEFORE importing.
export async function runCommand(command, argv = [], { onEvent } = {}) {
  const { flags, pos } = parseArgs([command, ...argv])
  const events = []
  try {
    const result = await logContext.run({ events, onEvent }, () => dispatch(flags, pos))
    return { ok: true, events, result }
  } catch (e) {
    if (e instanceof KskillsError) return { ok: false, events, error: e.message, code: e.code }
    throw e
  }
}

export { readLock, HELP, VERSION, AGENT_TABLE }

// realpath both sides: argv[1] may be a /tmp symlink path while import.meta.url
// is resolved (/private/tmp on macOS) — a mismatch would silently skip the CLI
const argv1 = process.argv[1] && fs.existsSync(process.argv[1])
  ? (() => { try { return fs.realpathSync.native(process.argv[1]) } catch { return process.argv[1] } })()
  : (process.argv[1] || '')
const isCli = import.meta.url === pathToFileURL(argv1).href
if (isCli) {
  const { flags, pos } = parseArgs(process.argv.slice(2))
  dispatch(flags, pos).catch((e) => die(String(e && e.message || e)))
}

#!/usr/bin/env node
// kskills-app — local web admin for the kskills engine.
// Security posture (docs/plans/kskills-app.md): bind 127.0.0.1 only, one-time
// token printed at startup (?token= bootstraps a cookie), Host header pinned
// (DNS-rebinding defense). No remote interface, ever.

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// KSKILLS_HOME/HOME are read at kskills import time — set before the import.
// HOME 부재(서비스 컨텍스트)에서도 엔진 기본값과 일치: os.homedir() 폴백.
const KSKILLS_HOME = process.env.KSKILLS_HOME || path.join(process.env.HOME || os.homedir(), '.kskills')
process.env.KSKILLS_HOME = KSKILLS_HOME

const ENGINE = fileURLToPath(new URL('../bin/kskills.mjs', import.meta.url))
const { runCommand, readLock, AGENT_TABLE } = await import(pathToFileURL(ENGINE).href)

const PORT = Number(process.env.PORT || 0) // 0 = ephemeral

// long-running jobs run in a CHILD kskills process: the engine's git/copy work
// is synchronous (spawnSync/cpSync) and would freeze this server's event loop
// for the whole run — killing every poll. The child's stdout IS the live log.
import { spawn } from 'node:child_process'
const KSKILLS_CLI = ENGINE

let job = null
function startUpdateJob(sources) {
  if (job?.running) return { ok: false, error: 'update already running', job: jobView() }
  const list = Array.isArray(sources) ? sources.map(String) : sources ? [String(sources)] : []
  job = { running: true, ok: null, events: [], startedAt: Date.now(), sources: list }
  const child = spawn(process.execPath, [KSKILLS_CLI, 'update', ...list])
  const feed = (chunk, isError) => {
    job._buf = (job._buf || '') + chunk
    let i
    while ((i = job._buf.indexOf('\n')) >= 0) {
      const line = job._buf.slice(0, i).trimEnd()
      job._buf = job._buf.slice(i + 1)
      if (line) job.events.push(isError ? line : line)
    }
  }
  child.stdout.on('data', (c) => feed(c.toString(), false))
  child.stderr.on('data', (c) => feed(c.toString(), true))
  child.on('error', (e) => { job.running = false; job.ok = false; job.error = String(e?.message || e); job.finishedAt = Date.now() })
  child.on('exit', (code) => {
    if (job._buf?.trim()) job.events.push(job._buf.trim())
    job.running = false
    job.ok = code === 0
    if (code !== 0 && !job.error) {
      const errLine = [...job.events].reverse().find(l => l.startsWith('error:'))
      if (errLine) job.error = errLine.replace(/^error:\s*/, '')
    }
    job.finishedAt = Date.now()
  })
  return { ok: true, started: true, job: jobView() }
}
const jobView = () => job && ({ running: job.running, ok: job.ok, error: job.error ?? null, startedAt: job.startedAt, finishedAt: job.finishedAt ?? null, events: job.events })
const HOST = '127.0.0.1'
const HERE = path.dirname(fileURLToPath(import.meta.url))

// --- engine helpers --------------------------------------------------------------

function agentIds() { return Object.entries(AGENT_TABLE).filter(([, [, glob]]) => glob).map(([a]) => a) } // project-only(globalPath 없음) 는 설치 선택지가 될 수 없다 — 노출 시 cmdAdd die(11차 리뷰 P1)
// farm(⌂) 체계 추종자 — 전역 스킬 디렉터리가 공용 farm(~/.agents/skills) 그 자체인
// 하네스. farm 에 깔리면 곧바로 읽힌다: 설치 선택지가 아니라 항상-공급 대상.
function farmFedAgents() {
  const farmGlob = AGENT_TABLE.agents?.[1]
  return Object.entries(AGENT_TABLE).filter(([a, [, g]]) => a !== 'agents' && g === farmGlob).map(([a]) => a)
}
async function state() {
  const res = await runCommand('list', ['-a', '*'])
  if (!res.ok) return res
  const hr = await runCommand('harnesses', ['--emit'])
  return {
    ok: true,
    skills: res.result.rows.map(r => ({
      name: r.name, kind: r.kind, agents: [...r.agents], source: r.source,
      description: typeof r.description === 'string' ? r.description : '', // map형 frontmatter 등 비문자열 계약 (10차)
    })),
    agents: agentIds(),
    farmFed: farmFedAgents(),
    harnesses: hr.ok ? hr.result.rows : [],
    lock: readLock().length,
    job: jobView(),
  }
}

async function skillDoc(name) {
  // farm lookup via lock records (dir) — copy lives at dir/name
  for (const r of readLock()) {
    if (r.skill !== name) continue
    const p = path.join(r.dir, name, 'SKILL.md')
    if (fs.existsSync(p)) return { ok: true, name, markdown: fs.readFileSync(p, 'utf8') }
  }
  // live/link 설치(kskills add ./dir)는 lock 기록이 없다 — state 가 내보내는
  // 'link' 행과 같은 발견(list)으로 문서를 찾는다. 심볼릭 링크는 readFileSync 가
  // 자동으로 따라간다 (5차 리뷰 — UI 문서 패널이 이 설치류 전체에서 404).
  const res = await runCommand('list', ['-a', '*'])
  const row = res.ok ? res.result.rows.find((r) => r.name === name) : null
  if (row?.dir) {
    const p = path.join(row.dir, 'SKILL.md')
    if (fs.existsSync(p)) return { ok: true, name, markdown: fs.readFileSync(p, 'utf8') }
  }
  return { ok: false, error: `no document for ${name}` }
}

async function catalog(source) {
  const res = await runCommand('catalog', ['--emit', String(source)])
  if (!res.ok) return res
  return { ok: true, items: res.result.items.map(it => ({ ...it, description: typeof it.description === 'string' ? it.description : '' })) }
}

// 레지스트리 위계 뷰 — 목록(이름만)과 항목(repo 그룹 키 포함) 모두 엔진 --emit 에 위임.
// 알려진 한계: add·catalog·registry 의 git 작업은 in-process 동기 실행이라 미캐시
// 클론 동안 이벤트 루프가 멈춘다(update 만 잡화됨). 잡화는 후속 이슈로 다룬다.
async function registryEntries(name) {
  const res = await runCommand('registry', [String(name ?? ''), '--emit'].filter(Boolean))
  if (!res.ok) return res
  return { ok: true, ...res.result }
}

// --- env panel --------------------------------------------------------------------
// The single credential source (~/.local/state/skills/.env). Overview rows are
// key-shaped (no values); ?raw=1 returns the file itself for the editor — the
// operator behind the one-time token may see their own secrets.
const ENV_FILE = path.join(process.env.HOME || os.homedir(), '.local', 'state', 'skills', '.env')

const envKeysIn = (text) => [...new Set([...text.matchAll(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=|^([A-Za-z_][A-Za-z0-9_]*)=/gm)].map(m => m[1] || m[2]))]

async function envState() {
  let text = null
  try { text = fs.readFileSync(ENV_FILE, 'utf8') }
  catch (e) {
    // 부재만 '없음' — 그 외(EACCES 등)를 삼키면 UI 가 빈 파일로 열어 저장이 절단한다 (9차)
    if (e.code !== 'ENOENT') return { ok: false, path: ENV_FILE, error: `env read failed: ${e.code ?? e.message}`, keys: [], missingSkills: [] }
  }
  const present = text == null ? [] : envKeysIn(text)
  const res = await runCommand('list', ['-a', '*'])
  const requiredBy = {}
  for (const s of (res.ok ? res.result.rows : []))
    for (const k of s.requiresEnv ?? []) (requiredBy[k] ??= []).push(s.name)
  const names = [...new Set([...present, ...Object.keys(requiredBy)])].sort()
  return {
    ok: true, path: ENV_FILE, exists: text != null,
    keys: names.map(name => ({ name, present: present.includes(name), requiredBy: requiredBy[name] ?? [] })),
    missingSkills: Object.entries(requiredBy).filter(([k]) => !present.includes(k))
      .flatMap(([, names2]) => names2).filter((v, i, a) => a.indexOf(v) === i),
  }
}

const ACTIONS = {
  add: (b) => {
    // source(s) 누락이 DEFAULT_SOURCE 전체 설치로 조용히 폴백하지 않게 한다 (3차 리뷰 D).
    // sources[] — 엔진 multi-add 로 N 소스를 1 add(1 git 캐시 패스·투영 배치)에 태운다.
    const sources = b.sources != null
      ? (!Array.isArray(b.sources) || !b.sources.length || b.sources.some(s => typeof s !== 'string' || !s.trim())
          ? null : b.sources.map(s => s.trim()))
      : null
    if (sources === null) {
      if (b.sources != null) return { ok: false, error: 'add: sources (non-empty string array) required' }
      if (typeof b.source !== 'string' || !b.source.trim()) return { ok: false, error: 'add: source (string) required' }
    }
    const srcs = sources ?? [String(b.source)]
    if (srcs.some(s => /^--?[A-Za-z]/.test(s))) return { ok: false, error: 'add: source must not look like an option' } // argv 로 전달돼 옵션으로 소비→DEFAULT_SOURCE 조용한 폴백 (10차)
    // update 잡 실행 중 뮤테이션은 git 캐시를 경쟁시킨다 — startUpdateJob 의 재진입
    // 게이트와 대칭으로 거부한다 (3차 리뷰 C).
    if (job?.running) return { ok: false, error: 'update is running — add/remove wait for it to finish' }
    const agents = (b.agents ?? (b.agent ? [String(b.agent)] : [])).map(String).filter(Boolean)
    return runCommand('add', [...srcs, ...(b.skills?.length ? ['-s', b.skills.join(',')] : ''), ...agents.flatMap(a => ['-a', a])].filter(x => x !== ''))
  },
  remove: (b) => {
    if (b.names != null && !Array.isArray(b.names)) return { ok: false, error: 'remove: names (array) required' }
    if (job?.running) return { ok: false, error: 'update is running — add/remove wait for it to finish' }
    return runCommand('remove', [...(b.names ?? []), ...(b.source ? [String(b.source)] : [])])
  },
}

// --- http plumbing ----------------------------------------------------------------

function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', (c) => { buf += c; if (buf.length > 1 << 20) reject(new Error('body too large')) })
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}) } catch { reject(new Error('invalid JSON')) } })
    req.on('error', reject)
  })
}

// 테스트 전용 시임 — job 은 모듈 내부 상태라 게이트(add/remove 대기) 검증을
// 위해 주입한다. 프로덕션 경로에서는 호출되지 않는다.
export const _test = { setJob: (j) => { job = j } }
export function createServer() {
  const token = crypto.randomBytes(16).toString('hex')
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}`)
    // DNS-rebinding defense: Host must name the loopback origin exactly
    if (req.headers.host !== `${HOST}:${server.address().port}`) return json(res, 403, { error: 'forbidden host' })

    // one-time token bootstraps a session cookie; thereafter cookie or header
    const presented = url.searchParams.get('token') ?? (req.headers.cookie || '').match(/ks_token=([0-9a-f]+)/)?.[1] ?? req.headers['x-ks-token']
    if (presented !== token) return json(res, 401, { error: 'invalid token' })
    if (url.searchParams.has('token')) res.setHeader('Set-Cookie', `ks_token=${token}; HttpOnly; SameSite=Strict`)

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const html = fs.readFileSync(path.join(HERE, 'index.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(html)
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, await state())
      if (req.method === 'GET' && url.pathname === '/api/registry') return json(res, 200, await registryEntries())
      if (req.method === 'GET' && url.pathname.startsWith('/api/registry/'))
        return json(res, 200, await registryEntries(decodeURIComponent(url.pathname.slice('/api/registry/'.length))))
      if (req.method === 'GET' && url.pathname.startsWith('/api/skill/')) {
        const doc = await skillDoc(decodeURIComponent(url.pathname.slice('/api/skill/'.length)))
        return json(res, doc.ok ? 200 : 404, doc)
      }
      if (req.method === 'POST' && url.pathname === '/api/catalog') return json(res, 200, await catalog((await readBody(req)).source))
      if (req.method === 'POST' && url.pathname === '/api/update') {
        const b = await readBody(req)
        return json(res, 200, startUpdateJob(b.sources ?? b.source))
      }
      if (req.method === 'POST' && url.pathname === '/api/shutdown') {
        // web power button: reply first, then signal OUR OWN pid — the existing
        // SIGINT handler closes the server cleanly (same path as Ctrl-C)
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end('{"ok":true,"stopping":true}')
        res.on('finish', () => process.kill(process.pid, 'SIGINT'))
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/env') {
        if (url.searchParams.get('raw') === '1') {
          try { return json(res, 200, { ok: true, path: ENV_FILE, content: fs.readFileSync(ENV_FILE, 'utf8') }) }
          catch (e) {
            // 부재(ENOENT)의 빈 폴백만 정당 — 그 외(EACCES 등)를 삼키면 편집기가
            // 빈 내용으로 열리고 저장이 자격 파일을 절단한다 (8차 리뷰).
            if (e.code === 'ENOENT') return json(res, 200, { ok: true, path: ENV_FILE, content: '' })
            return json(res, 200, { ok: false, path: ENV_FILE, error: `env read failed: ${e.code ?? e.message}` })
          }
        }
        return json(res, 200, await envState())
      }
      if (req.method === 'POST' && url.pathname === '/api/env') {
        const b = await readBody(req)
        if (typeof b.content !== 'string') return json(res, 400, { ok: false, error: 'content (string) required' })
        fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true })
        const tmp = `${ENV_FILE}.tmp-${process.pid}`
        fs.writeFileSync(tmp, b.content.endsWith('\n') || !b.content ? b.content : b.content + '\n', { mode: 0o600 })
        fs.renameSync(tmp, ENV_FILE)
        try { fs.chmodSync(ENV_FILE, 0o600) } catch { /* best effort */ }
        return json(res, 200, await envState())
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        const action = url.pathname.slice('/api/'.length)
        if (!ACTIONS[action]) return json(res, 404, { error: `unknown action: ${action}` })
        const result = await ACTIONS[action](await readBody(req))
        return json(res, result.ok ? 200 : 200, result) // engine errors are data, not HTTP failures
      }
      return json(res, 404, { error: 'not found' })
    } catch (e) {
      return json(res, 400, { ok: false, error: String(e?.message || e) })
    }
  })
  return { server, token }
}

// argv[1] is absent in packaged desktop apps — realpath('') crashes the native
// layer past any try/catch, so probe existence BEFORE resolving
const argv1 = process.argv[1] && fs.existsSync(process.argv[1])
  ? (() => { try { return fs.realpathSync.native(process.argv[1]) } catch { return process.argv[1] } })()
  : (process.argv[1] || '')
const isCli = import.meta.url === pathToFileURL(argv1).href
if (isCli) {
  const { server, token } = createServer()
  server.listen(PORT, HOST, () => {
    const { port } = server.address()
    console.log(`kskills-app listening → http://${HOST}:${port}/?token=${token}`)
    if (process.env.OPEN !== '0') {
      const open = process.platform === 'darwin' ? 'open' : 'xdg-open'
      import('node:child_process').then(({ spawn }) => spawn(open, [`http://${HOST}:${port}/?token=${token}`], { stdio: 'ignore' }).on('error', () => {}))
    }
  })
  // explicit shutdown: foreground `kskills serve` (or Ctrl-C) must close cleanly
  const stop = (sig) => { console.log(`kskills-app stopped (${sig})`); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref() }
  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))
}

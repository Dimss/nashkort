// Test helper: give each test file its own data directory and a fresh import
// of the modules that open the database at import time.
//
// Usage (static imports are hoisted, so the module under test must be loaded
// dynamically after DATA_DIR is set):
//
//   const { dir, load, cleanup } = await freshData()
//   const { messages } = await load('db.js')
import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function freshData({ prefix = 'kort-', seedFrom = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  if (seedFrom && existsSync(seedFrom)) cpSync(seedFrom, dir, { recursive: true })
  process.env.DATA_DIR = dir
  return {
    dir,
    load: (name) => import(new URL(`../../src/${name}`, import.meta.url).href),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

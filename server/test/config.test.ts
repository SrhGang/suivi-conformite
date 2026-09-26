import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe('loadConfig', () => {
  it('lit les secrets dans des fichiers (_FILE) et les injecte dans les URL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
    writeFileSync(join(dir, 'app'), 'a'.repeat(64) + '\n')
    writeFileSync(join(dir, 'db'), 'p@ss/word+=')
    writeFileSync(join(dir, 'owner'), 'owner-secret')
    process.env.APP_SECRET = ''
    process.env.APP_SECRET_FILE = join(dir, 'app')
    process.env.DATABASE_URL = 'postgres://conformite_app@db:5432/conformite'
    process.env.DATABASE_PASSWORD_FILE = join(dir, 'db')
    process.env.DATABASE_ADMIN_URL = 'postgres://conformite_owner@db:5432/conformite'
    process.env.DATABASE_ADMIN_PASSWORD_FILE = join(dir, 'owner')
    const c = loadConfig()
    expect(c.appSecret).toBe('a'.repeat(64))
    expect(decodeURIComponent(new URL(c.databaseUrl).password)).toBe('p@ss/word+=')
    expect(new URL(c.databaseAdminUrl).password).toBe('owner-secret')
  })

  it('garde les variables classiques', () => {
    delete process.env.APP_SECRET_FILE
    delete process.env.DATABASE_PASSWORD_FILE
    delete process.env.DATABASE_ADMIN_URL
    process.env.APP_SECRET = 'b'.repeat(40)
    process.env.DATABASE_URL = 'postgres://u:pw@localhost/db'
    const c = loadConfig()
    expect(c.databaseUrl).toBe('postgres://u:pw@localhost/db')
    expect(c.databaseAdminUrl).toBe(c.databaseUrl)
  })

  it('refuse un secret trop court', () => {
    delete process.env.APP_SECRET_FILE
    process.env.APP_SECRET = 'court'
    process.env.DATABASE_URL = 'postgres://u:pw@localhost/db'
    expect(() => loadConfig()).toThrow(/APP_SECRET/)
  })
})

import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isAuthorized, resolveStatic } from './index'

const basic = (user: string, password: string) => 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')

describe('isAuthorized', () => {
  it('без заданного пароля пускает всех', () => {
    expect(isAuthorized(undefined, 'loot', '')).toBe(true)
  })

  it('с паролем требует точного совпадения имени и пароля', () => {
    expect(isAuthorized(basic('loot', 'se:cret'), 'loot', 'se:cret')).toBe(true)
    expect(isAuthorized(basic('loot', 'wrong'), 'loot', 'se:cret')).toBe(false)
    expect(isAuthorized(basic('other', 'se:cret'), 'loot', 'se:cret')).toBe(false)
    expect(isAuthorized(undefined, 'loot', 'se:cret')).toBe(false)
    expect(isAuthorized('Bearer abc', 'loot', 'se:cret')).toBe(false)
  })
})

describe('resolveStatic', () => {
  const root = path.resolve('dist')

  it('отдаёт пути внутри каталога', () => {
    expect(resolveStatic(root, '/assets/app.js')).toBe(path.join(root, 'assets', 'app.js'))
    expect(resolveStatic(root, '/')).toBe(root)
  })

  it('не выпускает за пределы каталога', () => {
    for (const attack of ['/../package.json', '/..%2f..%2fpackage.json', '/assets/../../server/index.ts', '/%2e%2e/secret']) {
      const file = resolveStatic(root, attack)
      expect(file === null || file.startsWith(root)).toBe(true)
    }
    expect(resolveStatic(root, '/%E0%A4%A')).toBeNull()
  })
})

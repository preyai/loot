import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// DATA_DIR читается при загрузке модуля хранилища, поэтому каталог задаём до импорта.
let dir: string
let accounts: typeof import('./accounts')

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'loot-accounts-'))
  process.env.DATA_DIR = dir
  accounts = await import('./accounts')
})

afterAll(() => rm(dir, { recursive: true, force: true }))

describe('пользователи', () => {
  it('регистрация, вход, сессия и выход', async () => {
    const { login, token } = await accounts.register('Exile_1', 'secret-pass')
    expect(login).toBe('Exile_1')
    expect(await accounts.sessionUser(token)).toMatchObject({ login: 'Exile_1' })

    // Логин не зависит от регистра, занятый — второй раз не зарегистрировать.
    await expect(accounts.register('exile_1', 'other-pass')).rejects.toMatchObject({ status: 409 })
    const again = await accounts.login('EXILE_1', 'secret-pass')
    expect(again.login).toBe('Exile_1')
    await expect(accounts.login('Exile_1', 'wrong-pass')).rejects.toMatchObject({ status: 401 })
    await expect(accounts.login('Nobody', 'secret-pass')).rejects.toMatchObject({ status: 401 })

    await accounts.logout(token)
    expect(await accounts.sessionUser(token)).toBeNull()
    expect(await accounts.sessionUser(again.token)).toMatchObject({ login: 'Exile_1' })
  })

  it('проверяет логин и пароль', async () => {
    await expect(accounts.register('ab', 'secret-pass')).rejects.toMatchObject({ status: 400 })
    await expect(accounts.register('bad login', 'secret-pass')).rejects.toMatchObject({ status: 400 })
    await expect(accounts.register('Good', 'short')).rejects.toMatchObject({ status: 400 })
  })

  it('после 10 неудачных попыток с адреса — пауза', () => {
    const now = 1_000_000
    for (let i = 0; i < 10; i++) accounts.recordFailure('1.2.3.4', now)
    expect(accounts.tooManyAttempts('1.2.3.4', now)).toBe(true)
    expect(accounts.tooManyAttempts('5.6.7.8', now)).toBe(false)
    expect(accounts.tooManyAttempts('1.2.3.4', now + 11 * 60 * 1000)).toBe(false)
  })

  it('не больше 5 регистраций с адреса за час', () => {
    const now = 1_000_000
    for (let i = 0; i < 5; i++) accounts.recordRegistration('9.9.9.9', now)
    expect(accounts.tooManyRegistrations('9.9.9.9', now)).toBe(true)
    expect(accounts.tooManyRegistrations('8.8.8.8', now)).toBe(false)
    expect(accounts.tooManyRegistrations('9.9.9.9', now + 61 * 60 * 1000)).toBe(false)
  })
})

describe('фильтры и ссылки', () => {
  it('сохранение, список, изменение, ссылка и удаление', async () => {
    const owner = await accounts.register('Owner', 'secret-pass')
    const { id: userId } = (await accounts.sessionUser(owner.token))!

    const saved = await accounts.createFilter(userId, '  Мой фильтр ', { filterName: 'Mine', thresholds: { S: 500 } })
    expect(saved).toMatchObject({ name: 'Мой фильтр' })
    expect(saved).not.toHaveProperty('config')
    expect(await accounts.listFilters(userId)).toHaveLength(1)

    await accounts.updateFilter(userId, saved.id, { name: 'Строгий', config: { filterName: 'Strict' } })
    expect(await accounts.getFilter(userId, saved.id)).toMatchObject({ name: 'Строгий', config: { filterName: 'Strict' } })

    const { shareCode } = await accounts.shareFilter(userId, saved.id)
    expect((await accounts.shareFilter(userId, saved.id)).shareCode).toBe(shareCode)
    expect(await accounts.sharedFilter(shareCode)).toMatchObject({ name: 'Строгий', owner: 'Owner', config: { filterName: 'Strict' } })

    // Чужой пользователь не видит и не меняет чужие фильтры.
    const other = await accounts.register('Other', 'secret-pass')
    const { id: otherId } = (await accounts.sessionUser(other.token))!
    await expect(accounts.getFilter(otherId, saved.id)).rejects.toMatchObject({ status: 404 })
    await expect(accounts.updateFilter(otherId, saved.id, { name: 'x' })).rejects.toMatchObject({ status: 404 })

    await accounts.unshareFilter(userId, saved.id)
    await expect(accounts.sharedFilter(shareCode)).rejects.toMatchObject({ status: 404 })

    await accounts.shareFilter(userId, saved.id)
    await accounts.deleteFilter(userId, saved.id)
    expect(await accounts.listFilters(userId)).toEqual([])
  })

  it('проверяет название и настройки', async () => {
    const user = await accounts.register('Checker', 'secret-pass')
    const { id } = (await accounts.sessionUser(user.token))!
    await expect(accounts.createFilter(id, '', {})).rejects.toMatchObject({ status: 400 })
    await expect(accounts.createFilter(id, 'x'.repeat(61), {})).rejects.toMatchObject({ status: 400 })
    await expect(accounts.createFilter(id, 'ok', [])).rejects.toMatchObject({ status: 400 })
    await expect(accounts.createFilter(id, 'ok', { big: 'x'.repeat(600 * 1024) })).rejects.toMatchObject({ status: 413 })
  })

  it('одновременные сохранения не теряют друг друга', async () => {
    const user = await accounts.register('Racer', 'secret-pass')
    const { id } = (await accounts.sessionUser(user.token))!
    await Promise.all(Array.from({ length: 10 }, (_, i) => accounts.createFilter(id, `f${i}`, { i })))
    expect(await accounts.listFilters(id)).toHaveLength(10)
  })
})

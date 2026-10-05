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

/** Пользователь, вошедший через Discord: id учётной записи и токен сессии. */
let discordIds = 5000
async function signIn(name: string) {
  const { token } = await accounts.discordSignIn({ id: String(discordIds++), name })
  const { id } = (await accounts.sessionUser(token))!
  return { id, token }
}

describe('вход через Discord', () => {
  it('создаёт пользователя один раз, дальше входит в него же', async () => {
    const first = await accounts.discordSignIn({ id: '1001', name: 'tul_exile' })
    expect(first).toMatchObject({ login: 'tul_exile', created: true })
    const again = await accounts.discordSignIn({ id: '1001', name: 'tul_renamed' })
    expect(again).toMatchObject({ login: 'tul_exile', created: false })
    const { id } = (await accounts.sessionUser(again.token))!
    expect(await accounts.profile(id)).toEqual({ login: 'tul_exile', discord: 'tul_renamed' })
  })

  it('занятое или неподходящее имя — логин с числом', async () => {
    await accounts.discordSignIn({ id: '1002', name: 'xesht' })
    expect((await accounts.discordSignIn({ id: '1003', name: 'XESHT' })).login).toMatch(/^XESHT-\d+$/)
    expect((await accounts.discordSignIn({ id: '1004', name: 'ab' })).login).toMatch(/^ab-\d+$/)
  })

  it('сессия и выход', async () => {
    const first = await accounts.discordSignIn({ id: '1005', name: 'session_user' })
    const second = await accounts.discordSignIn({ id: '1005', name: 'session_user' })
    await accounts.logout(first.token)
    expect(await accounts.sessionUser(first.token)).toBeNull()
    expect(await accounts.sessionUser(second.token)).toMatchObject({ login: 'session_user' })
  })

  it('не больше 5 новых учётных записей с адреса за час', () => {
    const now = 1_000_000
    for (let i = 0; i < 5; i++) accounts.recordRegistration('9.9.9.9', now)
    expect(accounts.tooManyRegistrations('9.9.9.9', now)).toBe(true)
    expect(accounts.tooManyRegistrations('8.8.8.8', now)).toBe(false)
    expect(accounts.tooManyRegistrations('9.9.9.9', now + 61 * 60 * 1000)).toBe(false)
  })
})

describe('фильтры и ссылки', () => {
  it('сохранение, список, изменение, ссылка и удаление', async () => {
    const { id: userId } = await signIn('Owner')

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
    const { id: otherId } = await signIn('Other')
    await expect(accounts.getFilter(otherId, saved.id)).rejects.toMatchObject({ status: 404 })
    await expect(accounts.updateFilter(otherId, saved.id, { name: 'x' })).rejects.toMatchObject({ status: 404 })

    await accounts.unshareFilter(userId, saved.id)
    await expect(accounts.sharedFilter(shareCode)).rejects.toMatchObject({ status: 404 })

    await accounts.shareFilter(userId, saved.id)
    await accounts.deleteFilter(userId, saved.id)
    expect(await accounts.listFilters(userId)).toEqual([])
  })

  it('проверяет название и настройки', async () => {
    const { id } = await signIn('Checker')
    await expect(accounts.createFilter(id, '', {})).rejects.toMatchObject({ status: 400 })
    await expect(accounts.createFilter(id, 'x'.repeat(61), {})).rejects.toMatchObject({ status: 400 })
    await expect(accounts.createFilter(id, 'ok', [])).rejects.toMatchObject({ status: 400 })
    await expect(accounts.createFilter(id, 'ok', { big: 'x'.repeat(600 * 1024) })).rejects.toMatchObject({ status: 413 })
  })

  it('одновременные сохранения не теряют друг друга', async () => {
    const { id } = await signIn('Racer')
    await Promise.all(Array.from({ length: 10 }, (_, i) => accounts.createFilter(id, `f${i}`, { i })))
    expect(await accounts.listFilters(id)).toHaveLength(10)
  })
})

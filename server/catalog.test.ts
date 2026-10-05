import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let dir: string
let accounts: typeof import('./accounts')
let catalog: typeof import('./catalog')

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'loot-catalog-'))
  process.env.DATA_DIR = dir
  accounts = await import('./accounts')
  catalog = await import('./catalog')
})

afterAll(() => rm(dir, { recursive: true, force: true }))

let discordIds = 9000
async function user(name: string) {
  const { token } = await accounts.discordSignIn({ id: String(discordIds++), name })
  return (await accounts.sessionUser(token))!.id
}

describe('фильтры сообщества', () => {
  it('публикация, оценки, подписки, копии и сортировки', async () => {
    const author = await user('author')
    const fan = await user('fan')
    const other = await user('other')

    const strict = await accounts.createFilter(author, 'Strict', { filterName: 'Strict' })
    const soft = await accounts.createFilter(author, 'Soft', { filterName: 'Soft' })
    // Неопубликованный фильтр в каталог не попадает.
    expect(await catalog.catalog('new', '', null)).toEqual([])

    const published = await catalog.publishFilter(author, strict.id, '  Только ценное  ')
    expect(published).toMatchObject({ isPublic: true, description: 'Только ценное' })
    expect(published.shareCode).toBeTruthy()
    const { shareCode: softCode } = await catalog.publishFilter(author, soft.id, '')
    const code = published.shareCode!

    // Свой фильтр не оценить и не подписаться.
    await expect(catalog.rateFilter(code, author, 5)).rejects.toMatchObject({ status: 400 })
    await expect(catalog.subscribe(code, author)).rejects.toMatchObject({ status: 400 })
    await expect(catalog.rateFilter(code, fan, 6)).rejects.toMatchObject({ status: 400 })

    // Strict: две пятёрки; Soft: одна четвёрка, зато подписка и копия.
    await catalog.rateFilter(code, fan, 3)
    await catalog.rateFilter(code, fan, 5) // переоценка заменяет прежнюю
    await catalog.rateFilter(code, other, 5)
    await catalog.rateFilter(softCode!, fan, 4)
    await catalog.subscribe(softCode!, fan)
    await catalog.subscribe(softCode!, fan) // повторная подписка не дублируется
    const copy = await catalog.copyShared(softCode!, other)
    expect(copy).toMatchObject({ name: 'Soft', isPublic: false })

    const popular = await catalog.catalog('popular', '', fan)
    expect(popular.map((f) => f.name)).toEqual(['Soft', 'Strict'])
    expect(popular[0]).toMatchObject({ stats: { rating: 4, ratings: 1, subscribers: 1, copies: 1 }, subscribed: true, myRating: 4, own: false })
    expect(popular[1]).toMatchObject({ owner: 'author', stats: { rating: 5, ratings: 2, subscribers: 0, copies: 0 }, myRating: 5 })
    expect((await catalog.catalog('rating', '', null)).map((f) => f.name)).toEqual(['Strict', 'Soft'])
    expect((await catalog.catalog('new', 'stri', null)).map((f) => f.name)).toEqual(['Strict'])
    expect((await catalog.catalog('new', '%', null)).map((f) => f.name)).toEqual([])

    // Подписки фана и сведения по ссылке.
    expect((await catalog.subscriptions(fan)).map((f) => f.name)).toEqual(['Soft'])
    expect(await catalog.sharedFilter(code, author)).toMatchObject({ own: true, config: { filterName: 'Strict' } })

    // Снятие с публикации: из каталога пропадает, оценивать нельзя, отписаться можно.
    await catalog.unpublishFilter(author, soft.id)
    expect((await catalog.catalog('popular', '', null)).map((f) => f.name)).toEqual(['Strict'])
    await expect(catalog.rateFilter(softCode!, other, 1)).rejects.toMatchObject({ status: 403 })
    await catalog.unsubscribe(softCode!, fan)
    expect(await catalog.subscriptions(fan)).toEqual([])

    // Закрытая ссылка снимает и публикацию; удаление фильтра убирает его оценки.
    await accounts.unshareFilter(author, strict.id)
    expect(await catalog.catalog('popular', '', null)).toEqual([])
    await accounts.deleteFilter(author, strict.id)
    expect((await accounts.listFilters(author)).map((f) => f.name)).toEqual(['Soft'])
  })
})

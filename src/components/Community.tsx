import { useI18n } from '../i18n-react'

/** Приглашение на сервер Discord сообщества; пусто — ссылки на сайте не показываются. */
export const DISCORD_INVITE = ''

/** Логотип Discord (упрощённый «Clyde»): узнаваемый значок, без чужих шрифтов и надписей. */
function DiscordLogo() {
  return (
    <svg width="18" height="14" viewBox="0 0 24 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.3 1.5A19.8 19.8 0 0 0 15.4 0l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 0a19.7 19.7 0 0 0-4.9 1.5C.6 6.1-.3 10.6.1 15a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.1-.8-9.6-3.6-13.5ZM8 12.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 7.5 8 7.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"
      />
    </svg>
  )
}

/** Кнопка-ссылка на сервер сообщества; без приглашения не рисуется. */
export function CommunityLink({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  if (!DISCORD_INVITE) return null
  return (
    <a className={`community-link ${className}`} href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
      <DiscordLogo />
      {t('community.link')}
    </a>
  )
}

/** Блок на стартовой странице: куда писать вопросы, идеи и об ошибках. */
export function CommunityPanel() {
  const { t } = useI18n()
  if (!DISCORD_INVITE) return null
  return (
    <section className="panel community-panel">
      <h2>{t('community.title')}</h2>
      <p className="note">{t('community.text')}</p>
      <CommunityLink />
    </section>
  )
}

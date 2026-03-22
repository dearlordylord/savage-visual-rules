import { getLocale, locales, setLocale } from "../paraglide/runtime"

export function LocaleToggle() {
  return (
    <div className="flex gap-1">
      {locales.map((locale) => (
        <button
          key={locale}
          onClick={() => setLocale(locale)}
          className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${
            locale === getLocale()
              ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]"
              : "cursor-pointer border-[var(--line)] text-[var(--sea-ink-soft)]"
          }`}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

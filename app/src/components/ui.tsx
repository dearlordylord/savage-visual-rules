export function NumInput({
  label,
  max,
  min,
  onChange,
  title,
  value
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  title?: string
}) {
  return (
    <label className="flex items-center gap-1.5" title={title}>
      <span
        className={`text-xs text-[var(--sea-ink-soft)] ${title ? "cursor-help underline decoration-dotted underline-offset-2" : ""}`}
      >
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-14 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-center text-sm"
      />
    </label>
  )
}

export function EventBtn({
  children,
  disabled,
  onClick,
  title
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.24)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

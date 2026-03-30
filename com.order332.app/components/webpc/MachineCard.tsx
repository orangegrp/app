export interface MachineConfig {
  id: string
  name: string
  subtitle: string
  type: 'CLI' | 'GUI'
  description: string
  tags: string[]
  /** Informational note shown at the bottom of the card (user-facing) */
  note?: string
  /** Warning shown in an amber badge — use for known issues / experimental status */
  warning?: string
}

interface MachineCardProps {
  machine: MachineConfig
  onLaunch?: () => void
}

export function MachineCard({ machine, onLaunch }: MachineCardProps) {
  return (
    <div className="glass-card group flex flex-col gap-4 rounded-2xl p-6 hover:-translate-y-0.5 hover:bg-[oklch(1_0_0_/_5%)] transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="card-label">{machine.subtitle}</p>
          <h3 className="text-xl tracking-wider text-foreground leading-tight">{machine.name}</h3>
        </div>
        <span
          className={[
            'glass-button rounded-full px-2.5 py-0.5 text-xs tracking-widest shrink-0 mt-0.5',
            machine.type === 'GUI' ? 'text-foreground' : 'text-muted-foreground',
          ].join(' ')}
        >
          {machine.type}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground tracking-wider leading-relaxed flex-1">
        {machine.description}
      </p>

      {/* Warning */}
      {machine.warning && (
        <div className="flex items-start gap-2 rounded-xl border border-yellow-400/20 bg-yellow-400/5 px-3.5 py-2.5">
          <span className="mt-px text-yellow-400/70 text-xs shrink-0">⚠</span>
          <p className="text-xs text-yellow-400/70 tracking-wider leading-relaxed">
            {machine.warning}
          </p>
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {machine.tags.map((tag) => (
          <span
            key={tag}
            className="glass-button rounded-full px-2.5 py-0.5 text-xs tracking-wider text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Note */}
      {machine.note && (
        <p className="text-xs text-muted-foreground tracking-wider opacity-50 border-t border-white/5 pt-3.5">
          {machine.note}
        </p>
      )}

      {/* Launch */}
      <button
        onClick={onLaunch}
        className="glass-button glass-button-glass w-full rounded-xl py-3 text-sm tracking-widest text-center mt-auto flex items-center justify-center gap-2.5"
      >
        <span className="text-base leading-none opacity-80">▶</span>
        Boot
      </button>
    </div>
  )
}

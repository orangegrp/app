export function MailEmptyState() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 px-8 py-16 text-center">
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-20"
        aria-hidden="true"
      >
        <rect x="8" y="20" width="64" height="44" rx="6" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M8 28l32 22 32-22"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Select a message to read it</p>
        <p className="mt-1 text-xs text-muted-foreground/50">Your messages will appear here</p>
      </div>
    </div>
  )
}

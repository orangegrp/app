import * as React from "react"

const sizesMap = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 32,
  xl: 48,
} as const

type SpinnerSize = keyof typeof sizesMap

interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  size?: SpinnerSize
  animate?: boolean
  clockwise?: boolean
  className?: string
}

// Keyframe injected once into the document head — avoids styled-jsx which
// does not work in Next.js App Router with the SWC compiler.
const KEYFRAME_ID = "ui-spinner-kf"
function ensureKeyframe() {
  if (typeof document === "undefined") return
  if (document.getElementById(KEYFRAME_ID)) return
  const s = document.createElement("style")
  s.id = KEYFRAME_ID
  s.textContent = `
    @keyframes ui-spinner-blade {
      0%   { opacity: 1;    }
      100% { opacity: 0.15; }
    }
  `
  document.head.appendChild(s)
}

// For the bright spot to reach blade i at time t = i*(1/8)s, blade i must be
// at 0% of its animation at that moment.
// Clockwise  (0→1→2→…→7): offset = (8 - i) % 8
// Counter-CW (0→7→6→…→1): offset = i
function bladeDelay(i: number, clockwise: boolean): string {
  const offset = clockwise ? (8 - i) % 8 : i
  return `${-(offset / 8)}s`
}

const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  animate = true,
  clockwise = true,
  className = "",
  ...props
}) => {
  const dim = sizesMap[size] ?? sizesMap.md

  React.useEffect(() => {
    ensureKeyframe()
  }, [])

  return (
    <svg
      role="status"
      aria-label="Loading"
      width={dim}
      height={dim}
      viewBox="0 0 100 100"
      className={className}
      {...props}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <rect
          key={i}
          x={46}
          y={8}
          width={8}
          height={28}
          rx={4}
          fill="oklch(1 0 0 / 80%)"
          transform={`rotate(${i * 45}, 50, 50)`}
          style={
            animate
              ? {
                  animation: "ui-spinner-blade 1s linear infinite",
                  animationDelay: bladeDelay(i, clockwise),
                }
              : { opacity: 0.15 }
          }
        />
      ))}
    </svg>
  )
}

export { Spinner }

/** Numbered mono section label used at the top of dashboard panel cells. */
export default function Eyebrow({
  n,
  label,
  right,
  className = '',
}: {
  n?: string
  label: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <p className={`eyebrow ${className}`}>
      <span>
        {n && <b>{n}</b>}
        {label}
      </span>
      {right != null && <span>{right}</span>}
    </p>
  )
}

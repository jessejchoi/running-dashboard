import Image from 'next/image'

type RunDashWordmarkProps = {
  imageClassName?: string
  textClassName?: string
}

export default function RunDashWordmark({
  imageClassName = 'h-6 w-6',
  textClassName = 'text-xl',
}: RunDashWordmarkProps) {
  return (
    <span className={`font-display font-bold uppercase tracking-tight inline-flex items-center ${textClassName}`}>
      <Image
        src="/rundash-icon.png"
        alt=""
        aria-hidden="true"
        width={760}
        height={760}
        priority
        className={`mr-1.5 object-contain ${imageClassName}`}
      />
      <span style={{ color: 'var(--orange)' }}>RUN</span>
      <span className="text-white/50">DASH</span>
    </span>
  )
}

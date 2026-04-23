import Image from 'next/image'

type RunDashWordmarkProps = {
  imageClassName?: string
  textClassName?: string
}

export default function RunDashWordmark({
  imageClassName = 'h-7 w-7',
  textClassName = 'text-xl',
}: RunDashWordmarkProps) {
  return (
    <span className={`font-display font-bold uppercase tracking-tight inline-flex items-center ${textClassName}`}>
      <Image
        src="/rundash-icon.png"
        alt=""
        aria-hidden="true"
        width={680}
        height={680}
        priority
        className={`mr-2 object-contain ${imageClassName}`}
      />
      <span style={{ color: 'var(--orange)' }}>RUN</span>
      <span className="text-white/50">DASH</span>
    </span>
  )
}

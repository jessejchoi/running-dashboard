'use client'

import { formatPace } from '@/lib/analysis'
import type { ProjectAthleteResult } from '@/lib/analysis/projector-service'

interface Props {
  projection: ProjectAthleteResult
}

/**
 * The four feature panels that drive the new race-time projector.
 * Each maps directly onto a feature extractor in `lib/analysis/features.ts`
 * plus the CP fit. Renders in a 2x2 grid on desktop, 1-col on mobile.
 */
export default function AthleteFeaturesSection({ projection }: Props) {
  return (
    <div className="mt-8">
      <h2 className="font-display font-bold text-xl mb-6">Fitness profile</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SpeedPanel projection={projection} />
        <AerobicPanel projection={projection} />
        <EndurancePanel projection={projection} />
        <FormPanel projection={projection} />
      </div>
    </div>
  )
}

// ─── Speed ────────────────────────────────────────────────────────────────────

function SpeedPanel({ projection: { fit } }: { projection: ProjectAthleteResult }) {
  const cvPace   = 1000 / fit.cv
  const vmaxPace = 1000 / fit.vmax
  const qualityColor =
    fit.fitQuality === 'high' ? 'text-emerald-400' :
    fit.fitQuality === 'medium' ? 'text-yellow-400' : 'text-orange-400'

  return (
    <div className="card fade-up">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-display font-bold text-base">Speed</h3>
        <span className="text-xs font-mono text-[#6b7280]">{fit.nPoints} efforts</span>
      </div>

      <div className="mb-5">
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#6b7280] mb-1">Critical pace</p>
        <p className="stat-num text-3xl font-bold text-white leading-none">{formatPace(cvPace)}<span className="text-base text-[#6b7280]">/km</span></p>
        <p className="text-[10px] text-[#6b7280] mt-1">Sustainable aerobic limit (CV)</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <SubStat label="Anaerobic" value={`${fit.dPrime.toFixed(0)} m`} hint="reserve (D')" />
        <SubStat label="Sprint" value={`${formatPace(vmaxPace)}/km`} hint="ceiling (Vmax)" />
        <SubStat label="Fit" value={<span className={`uppercase ${qualityColor}`}>{fit.fitQuality}</span>} hint={`rmse ${fit.rmse.toFixed(2)}`} />
      </div>
    </div>
  )
}

// ─── Aerobic ──────────────────────────────────────────────────────────────────

function AerobicPanel({ projection: { features: { aerobic } } }: { projection: ProjectAthleteResult }) {
  const hasData = aerobic.currentPaceSecPerKm != null
  const trend = aerobic.trendSecPerKmPerWeek

  return (
    <div className="card fade-up">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-display font-bold text-base">Aerobic engine</h3>
        <span className="text-xs font-mono text-[#6b7280]">{aerobic.points.length} runs</span>
      </div>

      <div className="mb-5">
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#6b7280] mb-1">Pace at HR 150</p>
        <p className="stat-num text-3xl font-bold text-white leading-none">
          {hasData
            ? <>{formatPace(aerobic.currentPaceSecPerKm!)}<span className="text-base text-[#6b7280]">/km</span></>
            : <span className="text-[#6b7280]">—</span>}
        </p>
        <p className="text-[10px] text-[#6b7280] mt-1">Steady-state efficiency, duration-normalized</p>
      </div>

      {trend != null && (
        <div className="bg-[#161616] rounded-lg px-3 py-2 text-xs">
          <p className="text-[10px] text-[#6b7280] uppercase mb-0.5">Trend</p>
          <div className="flex items-baseline gap-2">
            <span className={`font-mono font-bold ${trend < 0 ? 'text-emerald-400' : trend > 0 ? 'text-orange-400' : 'text-[#a1a1aa]'}`}>
              {trend < 0 ? '▼' : trend > 0 ? '▲' : '—'} {Math.abs(trend).toFixed(1)}s/km
            </span>
            <span className="text-[10px] text-[#6b7280]">per week</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Endurance ────────────────────────────────────────────────────────────────

function EndurancePanel({ projection: { features: { endurance } } }: { projection: ProjectAthleteResult }) {
  return (
    <div className="card fade-up">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-display font-bold text-base">Endurance</h3>
        <span className="text-xs font-mono text-[#6b7280]">{endurance.runsInWindow} runs</span>
      </div>

      <div className="mb-5">
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#6b7280] mb-1">Longest recent run</p>
        <p className="stat-num text-3xl font-bold text-white leading-none">
          {endurance.longestRunKm.toFixed(1)}<span className="text-base text-[#6b7280]"> km</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
        <SubStat label="Volume" value={`${endurance.weeklyVolumeKm.toFixed(0)} km`} hint="per week" />
        <SubStat label="Time" value={`${(endurance.weeklyDurationMins / 60).toFixed(1)} h`} hint="per week" />
      </div>

      <div className="space-y-1.5">
        <ReadinessRow label="HM (21K)" current={endurance.longestRunKm} threshold={25} />
        <ReadinessRow label="FM (42K)" current={endurance.longestRunKm} threshold={35} />
      </div>
    </div>
  )
}

function ReadinessRow({ label, current, threshold }: { label: string; current: number; threshold: number }) {
  const pct = Math.min(100, (current / threshold) * 100)
  const ready = current >= threshold
  return (
    <div className="text-xs">
      <div className="flex justify-between mb-0.5">
        <span className="text-[10px] text-[#6b7280] uppercase">{label}</span>
        <span className={`font-mono font-bold ${ready ? 'text-emerald-400' : 'text-[#a1a1aa]'}`}>
          {ready ? 'ready' : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="h-1 bg-[#161616] rounded overflow-hidden">
        <div
          className={`h-full ${ready ? 'bg-emerald-500/60' : 'bg-[#f97316]/60'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function FormPanel({ projection: { features: { form } } }: { projection: ProjectAthleteResult }) {
  const statusLabel: Record<typeof form.status, string> = {
    detrained: 'Detrained',
    fresh:     'Fresh',
    neutral:   'Neutral',
    building:  'Building',
    fatigued:  'Fatigued',
  }
  const statusColor: Record<typeof form.status, string> = {
    detrained: 'text-[#6b7280]',
    fresh:     'text-blue-400',
    neutral:   'text-[#a1a1aa]',
    building:  'text-emerald-400',
    fatigued:  'text-orange-400',
  }

  return (
    <div className="card fade-up">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-display font-bold text-base">Form</h3>
        <span className="text-xs font-mono text-[#6b7280]">acute / chronic</span>
      </div>

      <div className="mb-5">
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#6b7280] mb-1">Training status</p>
        <p className={`stat-num text-3xl font-bold uppercase leading-none ${statusColor[form.status]}`}>
          {statusLabel[form.status]}
        </p>
        <p className="text-[10px] text-[#6b7280] mt-1 font-mono">ratio {form.acuteChronicRatio.toFixed(2)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <SubStat label="7-day" value={form.acuteLoad.toFixed(0)} hint="load" />
        <SubStat label="28-day" value={form.chronicLoad.toFixed(0)} hint="load" />
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function SubStat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-[#161616] rounded-lg px-2.5 py-2">
      <p className="text-[10px] text-[#6b7280] uppercase tracking-wide">{label}</p>
      <p className="font-mono font-bold text-white text-sm">{value}</p>
      {hint && <p className="text-[10px] text-[#6b7280]">{hint}</p>}
    </div>
  )
}

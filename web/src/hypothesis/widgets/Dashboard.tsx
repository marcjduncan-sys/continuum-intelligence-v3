'use client'

import { useState, useMemo } from 'react'
import type { StockModel, Hypothesis } from '../types'
import { computeAllMetrics } from '../compute'
import { PosteriorVector } from './PosteriorVector'
import { DominancePanel } from './DominancePanel'
import { RiskBalance } from './RiskBalance'
import { RegimeMap } from './RegimeMap'
import { AuditDrawer } from './AuditDrawer'

export function Dashboard({ model }: { model: StockModel }) {
  const [selectedHyp, setSelectedHyp] = useState<Hypothesis | null>(null)
  const metrics = useMemo(() => computeAllMetrics(model), [model])

  return (
    <div className="max-w-[900px] mx-auto px-4 py-6 space-y-4">
      {/* Header bar */}
      <div className="flex items-end justify-between pb-3 border-b border-slate-800">
        <div>
          <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Continuum Intelligence</p>
          <h1 className="text-xl font-bold text-slate-100">{model.stock.name}</h1>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-200">{model.stock.price}</p>
          <p className="text-xs text-slate-500">{model.stock.ticker} · {model.stock.asOf}</p>
        </div>
      </div>

      {/* Row 1: PosteriorVector full width */}
      <PosteriorVector metrics={metrics} model={model} onSelectHypothesis={setSelectedHyp} />

      {/* Row 2: DominancePanel + RiskBalance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DominancePanel metrics={metrics} />
        <RiskBalance metrics={metrics} model={model} />
      </div>

      {/* Row 3: RegimeMap full width */}
      <RegimeMap metrics={metrics} model={model} />

      {/* Footer */}
      <p className="text-[11px] text-slate-600 text-center pt-2">
        Canonical state · {model.evidence.length} evidence items · {model.meta.domainsCovered} domains · {metrics.n} hypotheses · No recalculation · Derived metrics only
      </p>

      {/* AuditDrawer */}
      <AuditDrawer hypothesis={selectedHyp} metrics={metrics} model={model} onClose={() => setSelectedHyp(null)} />
    </div>
  )
}

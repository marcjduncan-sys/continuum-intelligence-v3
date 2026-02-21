'use client'

import { useState, useEffect } from 'react'
import { Dashboard } from '@/hypothesis/widgets/Dashboard'
import { BHP_FIXTURE, TECHCO_FIXTURE, DIFFUSE_FIXTURE } from '@/hypothesis/fixtures'
import { validate } from '@/hypothesis/validate'
import type { StockModel } from '@/hypothesis/types'

type FixtureKey = 'BHP' | 'TECHCO' | 'DIFFUSE'

const FIXTURES: Record<FixtureKey, StockModel> = {
  BHP: BHP_FIXTURE,
  TECHCO: TECHCO_FIXTURE,
  DIFFUSE: DIFFUSE_FIXTURE,
}

const TABS: FixtureKey[] = ['BHP', 'TECHCO', 'DIFFUSE']

export default function HypothesisPage() {
  const [active, setActive] = useState<FixtureKey>('BHP')
  const [validationErrors, setValidationErrors] = useState<Record<FixtureKey, string[]>>({
    BHP: [], TECHCO: [], DIFFUSE: [],
  })

  useEffect(() => {
    setValidationErrors({
      BHP: validate(BHP_FIXTURE),
      TECHCO: validate(TECHCO_FIXTURE),
      DIFFUSE: validate(DIFFUSE_FIXTURE),
    })
  }, [])

  const errors = validationErrors[active]
  const model = FIXTURES[active]

  return (
    <main className="min-h-screen bg-slate-950 py-6">
      <div className="max-w-[900px] mx-auto px-4 mb-6">
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                active === tab ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-2">
          Quantitative Hypothesis Engine · Deterministic derivation from canonical weights
        </p>
      </div>

      {errors.length > 0 && (
        <div className="max-w-[900px] mx-auto px-4 mb-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-400 mb-2">Fixture validation errors</p>
            <ul className="space-y-1">
              {errors.map((e, i) => <li key={i} className="text-xs text-red-300">· {e}</li>)}
            </ul>
          </div>
        </div>
      )}

      <Dashboard model={model} />
    </main>
  )
}

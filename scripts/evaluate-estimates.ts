import { readFileSync, writeFileSync } from 'node:fs'
import { calibrateAndEvaluate } from '../lib/analysis/evaluation'
async function main() {
  const file = process.argv[2],
    out = process.argv[3] ?? '/tmp/rundash-estimate-evaluation.json'
  if (!file)
    throw new Error(
      'Usage: npm run evaluate:estimates -- corpus.json [report.json] (see docs/rollout.md)',
    )
  const corpus = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(corpus))
    throw new Error('Corpus must be an array of athletes with runs and efforts')
  const report = calibrateAndEvaluate(corpus)
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(
    JSON.stringify(
      {
        gate: report.gate,
        training: report.training,
        heldout: report.heldout,
        byDistance: report.byDistance,
        report: out,
      },
      null,
      2,
    ),
  )
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})

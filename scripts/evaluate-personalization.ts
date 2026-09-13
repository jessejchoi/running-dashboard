import { readFileSync, writeFileSync } from 'node:fs'
import { evaluatePersonalization } from '../lib/analysis/personalizationEvaluation'
const file = process.argv[2], output = process.argv[3] ?? '/tmp/rundash-personalization-evaluation.json'
if (!file) throw new Error('Usage: vite-node --config vitest.config.ts scripts/evaluate-personalization.ts corpus.json [report.json]')
const data = JSON.parse(readFileSync(file, 'utf8'))
const report = evaluatePersonalization(data.map((c: any) => ({ ...c, conditions: new Map(c.conditions.map((row: any) => [row.activity_id, row])) })))
writeFileSync(output, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ races: report.racesSeen, usableOutcomes: report.usableOutcomes, calibration: report.calibration, marathon: report.marathon, output }, null, 2))

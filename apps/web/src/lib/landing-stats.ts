import fs from 'node:fs';
import path from 'node:path';
import { getDataset, getRules, getApplicationSummaries } from '@/.data/store';

export interface LandingStats {
  rules: number;
  faults: number;
  applications: number;
  documents: number;
  tests: { passed: number; total: number; at: string | null } | null;
}

interface VitestJson {
  numPassedTests?: number;
  numTotalTests?: number;
  startTime?: number;
}

/** Reads the JSON report that `pnpm test` writes (vitest.config.ts). Missing report → null, never a made-up number. */
function readTestReport(): LandingStats['tests'] {
  const candidates = [
    path.resolve(process.cwd(), '.data', 'test-results.json'),
    path.resolve(process.cwd(), '..', '..', '.data', 'test-results.json'),
  ];
  for (const file of candidates) {
    try {
      const report = JSON.parse(fs.readFileSync(file, 'utf8')) as VitestJson;
      if (typeof report.numPassedTests === 'number' && typeof report.numTotalTests === 'number') {
        return { passed: report.numPassedTests, total: report.numTotalTests, at: report.startTime ? new Date(report.startTime).toISOString().slice(0, 10) : null };
      }
    } catch {
      /* try the next location */
    }
  }
  return null;
}

/** Every figure is computed from the repo: the loaded rule pack, the fixture dataset and the last test report. */
export function getLandingStats(): LandingStats {
  const ds = getDataset();
  return {
    rules: getRules().length,
    faults: new Set(ds.faultIndex.map((f) => f.n)).size,
    applications: getApplicationSummaries().length,
    documents: ds.documents.length,
    tests: readTestReport(),
  };
}

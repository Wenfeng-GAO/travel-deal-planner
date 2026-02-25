import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveRepoRoot } from '../../data/src/env.js';

const root = resolveRepoRoot();
const crawler = path.join(root, 'packages', 'jobs', 'src', 'ctrip_crawler.js');
const exporter = path.join(root, 'packages', 'jobs', 'src', 'export_ctrip_csv.js');
const quality = path.join(root, 'packages', 'jobs', 'src', 'ctrip_quality_report.js');
const spotcheck = path.join(root, 'packages', 'jobs', 'src', 'ctrip_spotcheck.js');

function run() {
  const crawl = spawnSync('node', [crawler], { stdio: 'inherit' });
  if (crawl.status !== 0) {
    process.exit(crawl.status ?? 1);
  }

  const exportCsv = spawnSync('node', [exporter], { stdio: 'inherit' });
  if (exportCsv.status !== 0) {
    process.exit(exportCsv.status ?? 1);
  }

  const qualityReport = spawnSync('node', [quality], { stdio: 'inherit' });
  if (qualityReport.status !== 0) {
    process.exit(qualityReport.status ?? 1);
  }

  const spot = spawnSync('node', [spotcheck], { stdio: 'inherit' });
  process.exit(spot.status ?? 0);
}

run();

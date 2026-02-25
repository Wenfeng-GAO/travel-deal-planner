import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveRepoRoot } from '../../data/src/env.js';

const root = resolveRepoRoot();
const crawler = path.join(root, 'packages', 'jobs', 'src', 'ctrip_crawler.js');
const exporter = path.join(root, 'packages', 'jobs', 'src', 'export_ctrip_csv.js');

function run() {
  const crawl = spawnSync('node', [crawler], { stdio: 'inherit' });
  if (crawl.status !== 0) {
    process.exit(crawl.status ?? 1);
  }
  const exportCsv = spawnSync('node', [exporter], { stdio: 'inherit' });
  process.exit(exportCsv.status ?? 0);
}

run();

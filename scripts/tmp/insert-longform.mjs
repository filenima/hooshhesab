// Insert new longform sections into lib/city-industry-data.ts before each city's anchor (or before closing backtick).
// Idempotent: skips a city if the first 40 chars of its new content already exist in the file.
import { readFileSync, writeFileSync, existsSync } from 'fs';

const FILE = '/home/z/my-project/hooshhesab/lib/city-industry-data.ts';
const DIR = '/home/z/my-project/hooshhesab/scripts/tmp/longform-add';
// anchor: insert before this line (within the city longform). If null -> insert before closing backtick line.
const ANCHORS = {
  tehran: '<h2>مسیر مهاجرت برای کسب‌وکار تهران',
  mashhad: '<h2>مهاجرت و شروع — مسیرِ عملی</h2>',
  tabriz: '<h2>بانک‌ها و شروعِ کار در تبریز</h2>',
  karaj: '<h2>مهاجرت و شروع — مسیرِ عملی برای کرج</h2>',
};
const DEFAULT_ANCHOR = '<h2>گامِ بعدی — از همین امروز</h2>';

const slugs = process.argv.slice(2);
let src = readFileSync(FILE, 'utf8');
let inserted = 0, skipped = 0;
for (const slug of slugs) {
  const path = DIR + '/' + slug + '.html';
  if (!existsSync(path)) { console.log('MISSING FILE ' + slug); continue; }
  let content = readFileSync(path, 'utf8').replace(/\s+$/, '');
  if (content.includes('`') || content.includes('${')) { console.log('REJECTED (backtick or ${): ' + slug); process.exitCode = 1; continue; }
  const probe = content.slice(0, 40);
  if (src.includes(probe)) { console.log('SKIP (already inserted): ' + slug); skipped++; continue; }
  const citySlug = slug.replace(/-topup\d*$/, '');
  const slugIdx = src.indexOf('slug: "' + citySlug + '",');
  if (slugIdx < 0) { console.log('SLUG NOT FOUND: ' + slug); process.exitCode = 1; continue; }
  const lfIdx = src.indexOf('longform: `', slugIdx);
  if (lfIdx < 0) { console.log('LONGFORM NOT FOUND: ' + slug); process.exitCode = 1; continue; }
  const closeIdx = src.indexOf('\n`,', lfIdx);
  const anchor = ANCHORS[citySlug] || DEFAULT_ANCHOR;
  const aIdx = src.indexOf(anchor, lfIdx);
  let insertIdx;
  if (aIdx > 0 && aIdx < closeIdx) insertIdx = aIdx;
  else insertIdx = closeIdx;
  const ins = '\n' + content + '\n';
  src = src.slice(0, insertIdx) + ins + src.slice(insertIdx);
  inserted++;
  console.log('INSERTED: ' + slug + ' (' + content.length + ' bytes)');
}
writeFileSync(FILE, src);
console.log('done. inserted=' + inserted + ' skipped=' + skipped);

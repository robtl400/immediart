/**
 * checkObjectNames.js — Sample objectName distribution from the new painting query
 *
 * DEV TOOL ONLY — not shipped in production.
 *
 * Fetches the ID pool from the new medium=Paintings&q=painting query, samples
 * up to SAMPLE_SIZE random IDs, fetches each object, and tallies objectName values.
 *
 * Also checks: does the MET ever use compound objectNames like "Oil painting",
 * "Acrylic painting", "Tempera painting" etc.? Or does it separate technique
 * into the `medium` field and keep objectName as just "Painting"?
 *
 * Usage:
 *   node scripts/checkObjectNames.js
 */

const BASE_URL = 'https://collectionapi.metmuseum.org/public/collection/v1';
const SAMPLE_SIZE = 300;
const CONCURRENCY = 4;
const BATCH_COOLDOWN_MS = 200;
const REQUEST_GAP_MS = 60;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

function sampleIDs(ids, n) {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

async function main() {
  console.log('Fetching ID pool from medium=Paintings&q=painting...');
  const searchData = await fetchJSON(
    `${BASE_URL}/search?hasImages=true&medium=Paintings&q=painting`
  );

  if (!searchData?.objectIDs?.length) {
    console.error('No IDs returned.');
    process.exit(1);
  }

  const totalIDs = searchData.objectIDs.length;
  console.log(`ID pool: ${totalIDs.toLocaleString()} objects`);

  const sample = sampleIDs(searchData.objectIDs, SAMPLE_SIZE);
  console.log(`Sampling ${sample.length} random objects...\n`);

  const objectNames = {};
  // For passing objects: track medium field to show technique separation
  const mediumSamples = [];
  let fetched = 0;
  let failures = 0;

  for (let i = 0; i < sample.length; i += CONCURRENCY) {
    const batch = sample.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(id =>
        sleep(REQUEST_GAP_MS)
          .then(() => fetchJSON(`${BASE_URL}/objects/${id}`))
          .catch(() => null)
      )
    );

    for (const obj of results) {
      fetched++;
      if (!obj) { failures++; continue; }
      const name = (obj.objectName?.trim()) || '(missing)';
      objectNames[name] = (objectNames[name] || 0) + 1;

      // Collect medium field for objects that pass the filter
      if (name.toLowerCase().startsWith('painting') && mediumSamples.length < 20) {
        mediumSamples.push({ objectName: name, medium: obj.medium || '(none)' });
      }
    }

    process.stdout.write(`\r  Fetched ${fetched}/${sample.length} (${failures} failures)...`);
    if (i + CONCURRENCY < sample.length) await sleep(BATCH_COOLDOWN_MS);
  }

  console.log('\n');

  const sorted = Object.entries(objectNames).sort((a, b) => b[1] - a[1]);
  const valid = fetched - failures;
  const passCount = sorted
    .filter(([n]) => n.toLowerCase().startsWith('painting'))
    .reduce((s, [, c]) => s + c, 0);

  // ── All objectNames ──────────────────────────────────────────────────────
  console.log('─── ALL objectNames ──────────────────────────────────────────────────');
  console.log('objectName'.padEnd(42) + 'Count'.padStart(6) + '  Filter');
  console.log('─'.repeat(60));
  for (const [name, count] of sorted) {
    const passes = name.toLowerCase().startsWith('painting');
    const pct = ((count / valid) * 100).toFixed(1);
    console.log(
      name.slice(0, 41).padEnd(42) +
      `${count}`.padStart(4) + ` (${pct}%)` +
      `  ${passes ? '✓' : '✗'}`
    );
  }

  // ── Compound painting objectName check ──────────────────────────────────
  console.log('\n─── "painting" objectNames — full list (what startsWith catches) ────');
  const passingNames = sorted.filter(([n]) => n.toLowerCase().startsWith('painting'));
  if (passingNames.length === 0) {
    console.log('  (none in sample)');
  } else {
    for (const [name, count] of passingNames) {
      console.log(`  "${name}" — ${count}`);
    }
  }
  console.log('\n  → Any "Oil painting", "Acrylic painting", "Tempera painting" etc.?');
  const compound = passingNames.filter(([n]) => n.toLowerCase() !== 'painting' && !n.toLowerCase().startsWith('painting,'));
  if (compound.length === 0) {
    console.log('  No compound formats found. MET uses "Painting" as the type,');
    console.log('  technique (oil, acrylic, tempera) lives in the `medium` field.');
  } else {
    for (const [name] of compound) {
      console.log(`  FOUND: "${name}"`);
    }
  }

  // ── medium field samples for passing objects ─────────────────────────────
  console.log('\n─── `medium` field for passing objects (technique is here, not objectName) ─');
  for (const { objectName, medium } of mediumSamples.slice(0, 12)) {
    console.log(`  objectName: "${objectName}"`);
    console.log(`  medium:     "${medium.slice(0, 80)}"\n`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('─── Summary ──────────────────────────────────────────────────────────');
  console.log(`  Sampled:       ${sample.length}  |  Returned: ${valid}  |  404s: ${failures}`);
  console.log(`  Pass filter:   ${passCount} / ${valid} (${((passCount / valid) * 100).toFixed(1)}%)`);
  console.log(`  Excluded:      ${valid - passCount} / ${valid} (${(((valid - passCount)) / valid * 100).toFixed(1)}%)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

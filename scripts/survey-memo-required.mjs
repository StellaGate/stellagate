// How many accounts the public directory tags memo-required also set SEP-29 on chain?
// Usage: node scripts/survey-memo-required.mjs
const DIRECTORY = "https://api.stellar.expert/explorer/public/directory";
const HORIZON = "https://horizon.stellar.org";

const tagged = [];
let url = `${DIRECTORY}?limit=200&tag[]=memo-required`;
while (url) {
  const page = await fetch(url).then((r) => r.json());
  const records = page._embedded.records;
  tagged.push(...records.filter((r) => r.tags.includes("memo-required")));
  url = records.length === 200 && page._links?.next ? `https://api.stellar.expert${page._links.next.href}` : null;
}

const rows = [];
for (const rec of tagged) {
  const res = await fetch(`${HORIZON}/accounts/${rec.address}`);
  if (!res.ok) continue;
  const data = (await res.json()).data ?? {};
  rows.push({ name: rec.name, address: rec.address, sep29: Boolean(data["config.memo_required"]) });
}

const withSep29 = rows.filter((r) => r.sep29).length;
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Directory accounts tagged memo-required and live on chain: ${rows.length}`);
console.log(`Of those, SEP-29 set on chain: ${withSep29} (${Math.round((100 * withSep29) / rows.length)}%)`);
console.log(`SEP-29 missing: ${rows.length - withSep29}`);
console.log("\nMissing SEP-29:");
for (const r of rows.filter((r) => !r.sep29)) console.log(`  ${r.name.padEnd(28)} ${r.address}`);

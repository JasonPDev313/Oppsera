const j = require('../../packages/db/migrations/meta/_journal.json');
console.log('Total journal entries:', j.entries.length);
console.log('\nFirst 5:');
j.entries.slice(0, 5).forEach(e => console.log('  idx=' + e.idx, e.tag));
console.log('\nLast 5:');
j.entries.slice(-5).forEach(e => console.log('  idx=' + e.idx, e.tag));

// Check for gaps
const gaps = [];
for (let i = 1; i < j.entries.length; i++) {
  const prev = j.entries[i - 1].idx;
  const curr = j.entries[i].idx;
  if (curr !== prev + 1) {
    gaps.push(`  ${prev} -> ${curr} (skipped ${curr - prev - 1})`);
  }
}
console.log('\nGaps in idx sequence:', gaps.length ? '\n' + gaps.join('\n') : 'none');

// Check tag numbering (the 0000_ prefix)
const tagNums = j.entries.map(e => {
  const m = e.tag.match(/^(\d+)_/);
  return m ? parseInt(m[1], 10) : -1;
});
const tagGaps = [];
for (let i = 1; i < tagNums.length; i++) {
  if (tagNums[i] !== tagNums[i - 1] + 1) {
    tagGaps.push(`  ${j.entries[i - 1].tag} (${tagNums[i - 1]}) -> ${j.entries[i].tag} (${tagNums[i]})`);
  }
}
console.log('\nGaps in tag numbering:', tagGaps.length ? '\n' + tagGaps.join('\n') : 'none');
console.log('\nTag range:', tagNums[0], '->', tagNums[tagNums.length - 1]);

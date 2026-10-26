const fs = require('fs');
const path = require('path');

// Firefox caps bookmark URLs at ~64 KB; we keep well under that.
const BUDGET = 30 * 1024;

describe('built bookmarklet', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../dist/bookmarklet.js'), 'utf8');
  const url = 'javascript:' + encodeURIComponent(code);

  test('bookmarklet fits the 30 KB budget', () => {
    expect(url.length).toBeLessThanOrEqual(BUDGET);
  });

  test('README contains the current bookmarklet', () => {
    const readme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
    expect(readme.includes(url)).toBe(true);
  });
});

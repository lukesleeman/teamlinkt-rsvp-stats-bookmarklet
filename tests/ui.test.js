import { lineChart, escapeXml } from '../src/ui/chart.js';
import { copyText, downloadFile } from '../src/ui/copy.js';

describe('lineChart', () => {
  test('escapes labels and draws one dot per point', () => {
    const svg = lineChart([{ label: 'HK Movie 🦇 & <Party>', y: 5 }, { label: 'b', y: 10 }]);
    expect(svg).toContain('HK Movie 🦇 &amp; &lt;Party&gt;: 5');
    expect(svg).toContain('>10<');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('circle')).toHaveLength(2);
    expect(doc.getElementsByTagName('path')).toHaveLength(1);
  });

  test('labels the x axis with up to 5 evenly spaced, escaped ticks', () => {
    const texts = svg => [...new DOMParser().parseFromString(svg, 'image/svg+xml').getElementsByTagName('text')].map(t => t.textContent);
    const nine = Array.from({ length: 9 }, (_, i) => ({ label: `p${i}`, y: i, tick: `t${i}` }));
    expect(texts(lineChart(nine))).toEqual(expect.arrayContaining(['t0', 't2', 't4', 't6', 't8']));
    expect(texts(lineChart(nine)).filter(t => /^t\d$/.test(t))).toHaveLength(5);
    const two = [{ label: 'a', y: 1, tick: '<a&b>' }, { label: 'b', y: 2, tick: 'end' }];
    expect(lineChart(two)).toContain('&lt;a&amp;b&gt;');
    expect(texts(lineChart(two))).toEqual(expect.arrayContaining(['<a&b>', 'end']));
  });

  test('returns nothing for no points', () => {
    expect(lineChart([])).toBe('');
  });

  test('escapeXml escapes all special characters', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('copyText', () => {
  afterEach(() => {
    delete navigator.clipboard;
    delete document.execCommand;
    document.body.innerHTML = '';
  });

  test('uses the clipboard API when available', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyText('a\tb')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('a\tb');
  });

  test('falls back to execCommand when the clipboard API fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockRejectedValue(new Error('no')) }, configurable: true });
    document.execCommand = jest.fn().mockReturnValue(true);
    await expect(copyText('hello')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('.tlrsvp-copybuf')).toBeNull();
  });

  test('leaves the text selected when every copy method fails', async () => {
    document.execCommand = jest.fn().mockReturnValue(false);
    await expect(copyText('hello')).resolves.toBe(false);
    expect(document.querySelector('.tlrsvp-copybuf').value).toBe('hello');
  });
});

describe('downloadFile', () => {
  test('clicks a temporary download link', () => {
    jest.useFakeTimers();
    URL.createObjectURL = jest.fn().mockReturnValue('blob:x');
    URL.revokeObjectURL = jest.fn();
    let clicked;
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicked = this; });

    downloadFile('Sea Dragons RSVPs.csv', 'a,b');

    expect(click).toHaveBeenCalledTimes(1);
    expect(clicked.download).toBe('Sea Dragons RSVPs.csv');
    expect(clicked.href).toBe('blob:x');
    expect(document.body.contains(clicked)).toBe(false);
    jest.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
    jest.useRealTimers();
  });
});

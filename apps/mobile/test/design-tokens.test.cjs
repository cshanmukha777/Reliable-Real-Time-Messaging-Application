const assert = require('node:assert/strict');
const { test } = require('node:test');
const { light, dark } = require('../src/design/palette.ts');

function luminance(hex) {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((pair) => Number.parseInt(pair, 16) / 255);
  const channels = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(foreground, background) {
  const values = [luminance(foreground), luminance(background)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

for (const [mode, palette] of Object.entries({ light, dark })) {
  test(`${mode} theme meets text and control-contrast thresholds`, () => {
    const checks = [
      ...[
        'background',
        'surface',
        'elevated',
        'pressed',
        'selected',
        'incoming',
        'outgoing',
        'errorSurface',
      ].flatMap((surface) =>
        ['text', 'secondary', 'muted'].map((ink) => [ink, surface, 4.5]),
      ),
      ['text', 'avatarFern', 4.5],
      ['text', 'avatarClay', 4.5],
      ['text', 'avatarSlate', 4.5],
      ['text', 'avatarPaper', 4.5],
      ['accentText', 'accent', 4.5],
      ['accentText', 'success', 4.5],
      ['accent', 'background', 4.5],
      ['accent', 'selected', 4.5],
      ['warning', 'warningSurface', 4.5],
      ['control', 'surface', 3],
      ['control', 'background', 3],
      ['error', 'errorSurface', 4.5],
      ...['queued', 'sending', 'sent', 'delivered', 'read', 'failed'].map(
        (status) => [status, 'background', 4.5],
      ),
    ];
    for (const [foreground, background, minimum] of checks) {
      const contrast = ratio(palette[foreground], palette[background]);
      assert.ok(
        contrast >= minimum,
        `${foreground} on ${background}: ${contrast.toFixed(2)}:1 is below ${minimum}:1`,
      );
    }
  });
}

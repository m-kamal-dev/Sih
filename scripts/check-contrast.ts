import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve('apps/web/src/app/globals.css'), 'utf8');
const darkBlock = css.match(/\[data-theme="dark"\]\s*\{([^\0]*?)\n\}/)?.[1];
const lightBlock = css.match(/@theme\s*\{([^\0]*?)\n\}/)?.[1];
if (!darkBlock || !lightBlock) throw new Error('Could not find both theme token blocks (light @theme + [data-theme="dark"]) in globals.css');

function tokens(block: string): Map<string, string> {
  return new Map([...block.matchAll(/--color-([\w-]+):\s*(#[\da-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

function luminance(hex: string): number {
  const values = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/*
 * Text tokens must meet 4.5:1 (AA body text) on every surface.
 * Primary buttons carry small text on the accent fill, so accent-contrast on
 * accent must also meet 4.5:1. Other fills (danger/warn) appear as icons and
 * large labels and are checked at 3:1 (docs/UX_RATIONALE.md, 3.2).
 * Every accent preset ([data-theme][data-accent] blocks) is merged over its
 * base theme and checked the same way.
 */
const TEXT_TOKENS = [
  'accent-text', 'danger-text', 'warn-text', 'text', 'text-muted', 'text-faint',
  'ok', 'violet', 'teal',
  'completeness', 'validity', 'discrepancy', 'anomaly', 'violation',
  'verified', 'mismatch', 'expired', 'pending', 'source-unavailable', 'manual-review',
];
// Light additionally uses the accent itself as link colour (must pass 4.5 on all surfaces).
const TEXT_EXTRA_LIGHT = ['accent'];
const FILLS = [
  ['danger-contrast', 'danger'],
  ['warn-contrast', 'warn'],
] as const;

const presets = [...css.matchAll(/\[data-theme="(dark|light)"\]\[data-accent="([\w-]+)"\]\s*\{([^}]*)\}/g)].map((m) => ({
  theme: m[1] as 'dark' | 'light',
  name: m[2]!,
  block: m[3]!,
}));
if (presets.length === 0) throw new Error('No accent presets ([data-theme][data-accent] blocks) found in globals.css');

const palettes: { name: string; theme: 'dark' | 'light'; palette: Map<string, string> }[] = [
  { name: 'dark', theme: 'dark', palette: tokens(darkBlock) },
  { name: 'light', theme: 'light', palette: tokens(lightBlock) },
];
for (const preset of presets) {
  const base = tokens(preset.theme === 'dark' ? darkBlock : lightBlock);
  palettes.push({ name: `${preset.theme}/${preset.name}`, theme: preset.theme, palette: new Map([...base, ...tokens(preset.block)]) });
}

const failures: string[] = [];
for (const { name, theme, palette } of palettes) {
  const surfaces = ['canvas', 'surface', 'raised', 'overlay'].map((key) => [key, palette.get(key)] as const);
  const textTokens = [...TEXT_TOKENS, ...(theme === 'light' ? TEXT_EXTRA_LIGHT : [])];
  for (const foreground of textTokens) {
    const color = palette.get(foreground);
    if (!color) {
      failures.push(`${name}: missing --color-${foreground}`);
      continue;
    }
    for (const [background, bg] of surfaces) {
      if (!bg) continue;
      const ratio = contrast(color, bg);
      if (ratio < 4.5) failures.push(`${name}: --color-${foreground} on --color-${background} = ${ratio.toFixed(2)}:1`);
    }
  }
  for (const [fgToken, fillToken] of FILLS) {
    const fg = palette.get(fgToken);
    const fill = palette.get(fillToken);
    if (!fg || !fill) {
      failures.push(`${name}: missing --color-${fgToken} or --color-${fillToken}`);
      continue;
    }
    const ratio = contrast(fg, fill);
    if (ratio < 3) failures.push(`${name}: --color-${fgToken} on --color-${fillToken} (fill) = ${ratio.toFixed(2)}:1`);
  }
  const accentFg = palette.get('accent-contrast');
  const accentFill = palette.get('accent');
  if (!accentFg || !accentFill) failures.push(`${name}: missing --color-accent-contrast or --color-accent`);
  else if (contrast(accentFg, accentFill) < 4.5) {
    failures.push(`${name}: --color-accent-contrast on --color-accent = ${contrast(accentFg, accentFill).toFixed(2)}:1 (button text needs 4.5)`);
  }
}

if (failures.length) {
  process.stderr.write(`Contrast check failed (WCAG AA):\n${failures.map((f) => `- ${f}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Contrast check passed for ${palettes.length} palettes (2 base themes + ${presets.length} accent presets): text meets 4.5:1 on all four surfaces, button text on the accent fill meets 4.5:1, other fills meet 3:1.\n`);
}

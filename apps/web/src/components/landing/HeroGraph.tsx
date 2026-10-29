'use client';
import { useEffect, useRef } from 'react';
import { useEffectsStore, type EffectsTier } from '@/store/effects-store';

/**
 * Hero animation: an evidence graph assembling itself around a document.
 * Plain 2D canvas (no 3D library) so it costs a few kB. Tiers:
 *  full: ~30 nodes, glow sprites, pulses along edges, up to 60fps
 *  lite: ~16 nodes, no glow, no pulses, capped at 30fps
 *  off:  a single fully assembled frame (reduced motion / "Reduce effects")
 * The loop pauses when the canvas is off-screen or the tab is hidden.
 */

const LABELS = ['Fire NOC', 'Sale deed', 'Faculty roster', 'Land area', 'Signature', 'Valid until', 'FDR receipt', 'Building plan'];
const SIGNAL_INDEXES = new Set([3, 4]); // nodes drawn as signals (amber / red)

interface Node {
  tx: number; ty: number; sx: number; sy: number;
  r: number; delay: number; ring: 1 | 2; label?: string; signal?: 'warn' | 'alert'; parent: number;
  phase: number;
}

interface Palette { accent: string; accent2: string; muted: string; line: string; warn: string; alert: string; surface: string; text: string }

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function easeOut(p: number) {
  return 1 - Math.pow(1 - p, 3);
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    accent: v('--color-accent', '#F5A524'),
    accent2: v('--color-accent-2', '#22D3EE'),
    muted: v('--color-text-muted', '#A3ACC6'),
    line: v('--color-border-strong', '#39446A'),
    warn: v('--color-warn', '#F59E0B'),
    alert: v('--color-alert', '#EF4444'),
    surface: v('--color-surface', '#0E1322'),
    text: v('--color-text', '#EEF1FA'),
  };
}

function buildNodes(w: number, h: number, tier: EffectsTier): { nodes: Node[]; cx: number; cy: number } {
  const narrow = w < 760;
  const cx = narrow ? w * 0.5 : w * 0.7;
  const cy = narrow ? h * 0.8 : h * 0.5;
  const base = Math.min(narrow ? w * 0.8 : w * 0.5, narrow ? h * 0.45 : h);
  const r1 = base * 0.32;
  const r2 = base * 0.55;
  const rand = rng(7);
  const nodes: Node[] = [];
  const ring1 = LABELS.length;
  for (let i = 0; i < ring1; i++) {
    const a = (i / ring1) * Math.PI * 2 - Math.PI / 2 + (rand() - 0.5) * 0.25;
    const d = r1 * (0.9 + rand() * 0.2);
    const signal = SIGNAL_INDEXES.has(i) ? (i === 4 ? 'alert' : 'warn') : undefined;
    nodes.push({
      tx: cx + Math.cos(a) * d, ty: cy + Math.sin(a) * d * 0.85,
      sx: cx + Math.cos(a) * d * 3.2, sy: cy + Math.sin(a) * d * 3.2,
      r: signal ? 6 : 5, delay: 0.25 + i * 0.09, ring: 1, label: LABELS[i], signal, parent: -1, phase: rand() * 6.28,
    });
  }
  const outer = tier === 'full' ? 22 : 8;
  for (let i = 0; i < outer; i++) {
    const a = rand() * Math.PI * 2;
    const d = r2 * (0.75 + rand() * 0.45);
    const tx = cx + Math.cos(a) * d;
    const ty = cy + Math.sin(a) * d * 0.8;
    let parent = 0;
    let best = Infinity;
    for (let j = 0; j < ring1; j++) {
      const n = nodes[j]!;
      const dist = (n.tx - tx) ** 2 + (n.ty - ty) ** 2;
      if (dist < best) { best = dist; parent = j; }
    }
    nodes.push({ tx, ty, sx: tx + (rand() - 0.5) * 400, sy: ty + (rand() - 0.5) * 400, r: 2 + rand() * 1.8, delay: 0.9 + rand() * 1.1, ring: 2, parent, phase: rand() * 6.28 });
  }
  return { nodes, cx, cy };
}

function glowSprite(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return c;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'transparent');
  g.globalAlpha = 0.55;
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function HeroGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { tier, ready } = useEffectsStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const attr = document.documentElement.getAttribute('data-effects');
    const level: EffectsTier = ready ? tier : attr === 'off' || attr === 'lite' ? attr : 'full';

    let w = 0;
    let h = 0;
    let palette = readPalette();
    let glow = { accent: glowSprite(palette.accent), warn: glowSprite(palette.warn), alert: glowSprite(palette.alert) };
    let graph = buildNodes(1, 1, level);
    let raf = 0;
    let visible = true;
    let start = performance.now();
    let lastFrame = 0;

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, level === 'full' ? 2 : 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      graph = buildNodes(w, h, level);
      if (level === 'off') draw(30);
    }

    function draw(t: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const { nodes, cx, cy } = graph;
      const pos = nodes.map((n) => {
        const p = easeOut(Math.min(1, Math.max(0, (t - n.delay) / 1.1)));
        const settle = level === 'off' ? 0 : Math.min(1, Math.max(0, t - 2.5));
        const drift = settle * (n.ring === 1 ? 3 : 5);
        return {
          x: n.sx + (n.tx - n.sx) * p + Math.sin(t * 0.5 + n.phase) * drift,
          y: n.sy + (n.ty - n.sy) * p + Math.cos(t * 0.4 + n.phase) * drift,
          p,
        };
      });

      // Edges
      ctx.lineWidth = 1;
      nodes.forEach((n, i) => {
        const a = pos[i]!;
        const target = n.ring === 1 ? { x: cx, y: cy, p: 1 } : pos[n.parent]!;
        const alpha = Math.min(a.p, target.p);
        if (alpha < 0.05) return;
        ctx.globalAlpha = alpha * (n.ring === 1 ? 0.7 : 0.35);
        ctx.strokeStyle = n.signal ? (n.signal === 'alert' ? palette.alert : palette.warn) : palette.line;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        // Pulses travel from evidence to the document (full tier only)
        if (level === 'full' && n.ring === 1 && a.p > 0.95) {
          const k = ((t * 0.45 + n.phase) % 1);
          ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
          ctx.fillStyle = palette.accent2;
          ctx.beginPath();
          ctx.arc(a.x + (cx - a.x) * k, a.y + (cy - a.y) * k, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Nodes
      nodes.forEach((n, i) => {
        const a = pos[i]!;
        if (a.p < 0.02) return;
        const color = n.signal === 'alert' ? palette.alert : n.signal === 'warn' ? palette.warn : n.ring === 1 ? palette.accent : palette.muted;
        if (level === 'full' && n.ring === 1) {
          const sprite = n.signal === 'alert' ? glow.alert : n.signal === 'warn' ? glow.warn : glow.accent;
          const pulse = n.signal ? 1 + Math.sin(t * 3 + n.phase) * 0.25 : 1;
          const s = n.r * 7 * pulse;
          ctx.globalAlpha = a.p;
          ctx.drawImage(sprite, a.x - s / 2, a.y - s / 2, s, s);
        }
        ctx.globalAlpha = a.p * (n.ring === 1 ? 1 : 0.7);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(a.x, a.y, n.r, 0, Math.PI * 2);
        ctx.fill();
        if (n.label && w > 520) {
          ctx.globalAlpha = Math.max(0, (a.p - 0.5) * 2);
          ctx.fillStyle = n.signal ? color : palette.muted;
          ctx.font = '500 12px "Inter Variable", system-ui, sans-serif';
          ctx.textAlign = a.x < cx ? 'right' : 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.label, a.x + (a.x < cx ? -12 : 12), a.y);
        }
      });

      // The document at the centre
      const dw = 74;
      const dh = 96;
      const docIn = easeOut(Math.min(1, t / 0.8));
      ctx.globalAlpha = docIn;
      ctx.fillStyle = palette.surface;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx - dw / 2, cy - dh / 2, dw, dh, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.muted;
      for (let l = 0; l < 6; l++) {
        ctx.globalAlpha = docIn * 0.55;
        ctx.fillRect(cx - dw / 2 + 12, cy - dh / 2 + 16 + l * 12, l % 3 === 2 ? 30 : 50, 3);
      }
      if (level !== 'off') {
        const k = (t * 0.5) % 1;
        const y = cy - dh / 2 + 8 + k * (dh - 16);
        const grad = ctx.createLinearGradient(0, y - 10, 0, y + 2);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, palette.accent2);
        ctx.globalAlpha = docIn * 0.8;
        ctx.fillStyle = grad;
        ctx.fillRect(cx - dw / 2 + 4, y - 10, dw - 8, 12);
      }
      ctx.globalAlpha = 1;
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      if (level === 'lite' && now - lastFrame < 33) return;
      lastFrame = now;
      draw((now - start) / 1000);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting) && !document.hidden; });
    io.observe(canvas);
    const onVis = () => { visible = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    const mo = new MutationObserver(() => {
      palette = readPalette();
      glow = { accent: glowSprite(palette.accent), warn: glowSprite(palette.warn), alert: glowSprite(palette.alert) };
      if (level === 'off') draw(30);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });

    if (level === 'off') draw(30);
    else {
      start = performance.now();
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [tier, ready]);

  return <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />;
}

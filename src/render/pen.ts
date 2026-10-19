// The pen: one hand for everything the visual compiler draws. In ink it wobbles (seeded, so the
// same building always wobbles the same way); as the Oracle draws, lines are crisp, white and
// glowing. Pure string building: no DOM, so it runs in Node for the gallery and the tests.
import { Rng } from "../core/random/prng";

export type Point = readonly [number, number];
export type Look = "ink" | "oracle";

/** One decimal place: enough for the eye, and the same text on every platform. */
export const f1 = (n: number): string => String(Math.round(n * 10) / 10);

/** cos and sin of iπ/12, i = 0..12, written out so no platform's Math.cos is involved. */
const C12 = [
  1, 0.9659258, 0.8660254, 0.7071068, 0.5, 0.258819, 0, -0.258819, -0.5, -0.7071068, -0.8660254, -0.9659258,
  -1,
];
const S12 = [
  0, 0.258819, 0.5, 0.7071068, 0.8660254, 0.9659258, 1, 0.9659258, 0.8660254, 0.7071068, 0.5, 0.258819, 0,
];
const turn = (i: number) => ((i % 24) + 24) % 24;
export const cos12 = (i: number): number => {
  const k = turn(i);
  return k <= 12 ? C12[k]! : C12[24 - k]!;
};
export const sin12 = (i: number): number => {
  const k = turn(i);
  return k <= 12 ? S12[k]! : -S12[k - 12]!;
};

/** A seeded stream of floats in [0, 1). */
export function stream(seed: number): () => number {
  const rng = Rng.fromSeed(seed >>> 0);
  return () => rng.float();
}

/** Mix numbers into one seed. */
export function mix(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}

export function inkPath(pts: readonly Point[], r: () => number, rough: number, close = true): string {
  const j = () => (r() - 0.5) * 1.6 * rough;
  let d = `M${f1(pts[0]![0] + j())} ${f1(pts[0]![1] + j())}`;
  const n = pts.length;
  for (let i = 1; i <= (close ? n : n - 1); i++) {
    const a = pts[i - 1]!;
    const b = pts[i % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const off = (r() - 0.5) * Math.min(6, len * 0.05) * rough;
    d += ` Q${f1((a[0] + b[0]) / 2 + nx * off)} ${f1((a[1] + b[1]) / 2 + ny * off)} ${f1(b[0] + j())} ${f1(b[1] + j())}`;
  }
  return d + (close ? "Z" : "");
}

export const crispPath = (pts: readonly Point[], close = true): string =>
  "M" + pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join(" L") + (close ? "Z" : "");

export interface Pen {
  look: Look;
  ink: boolean;
  /** A polygon (or polyline) path in this pen's hand. */
  P(pts: readonly Point[], close?: boolean): string;
  /** A single line. */
  L(x1: number, y1: number, x2: number, y2: number): string;
  stroke: string;
  width: number;
  hatch: number;
  /** A unique, deterministic prefix for ids inside one drawing. */
  id: string;
  next(): string;
}

export function pen(
  look: Look,
  seed: number,
  rough: number,
  stroke: number,
  hatch: number,
  idBase: string,
): Pen {
  const ink = look === "ink";
  const r = stream(mix(seed, 7919, 13));
  const P = (pts: readonly Point[], close = true) =>
    ink ? inkPath(pts, r, rough, close) : crispPath(pts, close);
  let n = 0;
  return {
    look,
    ink,
    P,
    L: (x1, y1, x2, y2) =>
      P(
        [
          [x1, y1],
          [x2, y2],
        ],
        false,
      ),
    stroke: ink ? "#1d1916" : "#ffffff",
    width: ink ? stroke : 1.1,
    hatch,
    id: idBase,
    next: () => `${idBase}-${n++}`,
  };
}

export const open = (c: Pen): string =>
  `<g stroke="${c.stroke}" stroke-width="${f1(c.width)}" stroke-linejoin="round" stroke-linecap="round" fill="none">`;

/** The soft outer glow the Oracle draws round a body. */
export const halo = (c: Pen, pts: readonly Point[]): string =>
  c.ink ? "" : `<path d="${crispPath(pts)}" stroke="#dfeaff" stroke-width="9" opacity=".2"/>`;

/** Shading hatch, clipped to a polygon. Ink only. */
export function hatch(c: Pen, pts: readonly Point[], x: number, y: number, w: number, h: number): string {
  if (!c.ink || c.hatch <= 0) return "";
  const id = c.next();
  return `<clipPath id="${id}"><path d="${crispPath(pts)}"/></clipPath><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="url(#hatch)" stroke="none" opacity="${f1(c.hatch)}" clip-path="url(#${id})"/>`;
}

/** Darken a #rrggbb colour (side faces are in shadow). */
export function shade(hex: string, f = 0.72): string {
  const n = parseInt(hex.slice(1), 16);
  const h = (v: number) =>
    Math.round(v * f)
      .toString(16)
      .padStart(2, "0");
  return "#" + h((n >> 16) & 255) + h((n >> 8) & 255) + h(n & 255);
}

/** Shared definitions every drawing refers to: the hatch, the Oracle's gradients, the lamp glow. */
export const DEFS =
  `<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="7" stroke="#1d1916" stroke-width="1.3"/></pattern>` +
  `<linearGradient id="oBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8ff"/><stop offset="1" stop-color="#b3c6e2"/></linearGradient>` +
  `<linearGradient id="oRoof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cbdaf2"/></linearGradient>` +
  `<linearGradient id="oSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe8f6"/><stop offset="1" stop-color="#93a7c6"/></linearGradient>` +
  `<radialGradient id="lampGlow"><stop offset="0" stop-color="#ffe6a3" stop-opacity=".85"/><stop offset="1" stop-color="#ffe6a3" stop-opacity="0"/></radialGradient>`;

export function svgWrap(w: number, h: number, inner: string, standalone: boolean): string {
  const defs = standalone ? `<defs>${DEFS}</defs>` : "";
  return `<svg width="${f1(w)}" height="${f1(h)}" viewBox="0 0 ${f1(w)} ${f1(h)}" xmlns="http://www.w3.org/2000/svg">${defs}${inner}</svg>`;
}

export const escapeText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

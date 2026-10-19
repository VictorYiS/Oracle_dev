// The visual compiler: a building's Visual IR (recipe or landmark, style pack, seed, lot) plus a
// state and a way of looking (ink: seen with your own eyes; oracle: drawn from the records) gives
// an SVG. Same inputs, same bytes. All the shapes, colours and odds come from the scenario pack;
// this file only knows how to draw the engine's grammars and part kinds.
import type { Landmark, Palette, Part, Recipe, Shape, StylePack } from "../core/content/schema";
import type { VisualState } from "../core/world/facts";
import {
  cos12,
  escapeText,
  f1,
  halo,
  hatch,
  type Look,
  mix,
  open,
  type Pen,
  pen,
  type Point,
  shade,
  sin12,
  stream,
  svgWrap,
} from "./pen";

export type { Look };

export interface VisualContent {
  styles: ReadonlyMap<string, StylePack>;
  recipes: ReadonlyMap<string, Recipe>;
  parts: ReadonlyMap<string, Part>;
  landmarks: ReadonlyMap<string, Landmark>;
}

/** What to draw, whatever state it is in: a building's Visual IR. Saves never hold pictures, only this. */
export type VisualIR =
  | {
      kind: "recipe";
      recipe: string;
      style: string;
      seed: number;
      /** Lot width: the building fills it. */
      lot: number;
      /** Where its door must be (a passage leads in there), from the lot's left edge. */
      door: number | null;
      /** Parts it always has. */
      parts: readonly string[];
    }
  | { kind: "landmark"; landmark: string; seed: number };

export interface DrawOptions {
  /** Include the shared definitions, for a drawing that stands on its own (gallery files). */
  standalone?: boolean;
  /** Resolve a pack text key (landmark signs). */
  text?: (ref: string) => string;
  /** Prefix for ids inside the drawing, unique within a page. */
  id?: string;
}

/** How the hand moves: line width, wobble, and how dark the shading hatch is. */
interface Hand {
  stroke: number;
  rough: number;
  hatch: number;
}

interface Base {
  seed: number;
  hand: Hand;
  /** Colours for patched-together walls and washing. */
  patches: readonly string[];
  palette: Palette;
  parts: Part[];
  width: number;
  height: number;
  doorX: number | null;
  doorH: number;
  doorW: number;
  doorBottom: number;
  /** Where the side faces attach: the main body's left and right edge, and its top. */
  body: { x0: number; x1: number; top: number };
}
type Terrace = Base & {
  grammar: "terrace";
  margin: number;
  floors: number;
  bays: number;
  bayW: number;
  floorH: number;
  base: number;
  roof: string;
  roofH: number;
  chimneys: number;
  winShape: string;
  doorBay: number;
  balconyBay: number;
};
type Hall = Base & {
  grammar: "hall";
  margin: number;
  floors: number;
  bays: number;
  bayW: number;
  floorH: number;
  roof: string;
  roofH: number;
  stacks: number;
  stackH: number;
  doorW: number;
};
type StackBox = { w: number; h: number; dx: number; color: string; wins: number };
type Stack = Base & { grammar: "stack"; boxes: StackBox[] };
type Tower = Base & {
  grammar: "tower";
  margin: number;
  floors: number;
  floorH: number;
  setbacks: number;
  crown: string;
  crownH: number;
};
type LandmarkForm = Base & { grammar: "landmark"; landmark: Landmark };

/** The IR resolved against the pack: every number the drawing needs, none of which depend on state. */
export type Form = Terrace | Hall | Stack | Tower | LandmarkForm;

const need = <T>(map: ReadonlyMap<string, T>, id: string, what: string): T => {
  const v = map.get(id);
  if (!v) throw new Error(`unknown ${what} "${id}"`);
  return v;
};

/** Landmarks are drawn by the ordinary town hand. */
const LANDMARK_HAND: Hand = { stroke: 2.4, rough: 1, hatch: 0.5 };

export function resolve(content: VisualContent, ir: VisualIR): Form {
  if (ir.kind === "landmark") {
    const lm = need(content.landmarks, ir.landmark, "landmark");
    const door = lm.shapes.find((s) => s.door)?.door;
    const body = lm.body ?? [0, lm.width, 0];
    return {
      grammar: "landmark",
      landmark: lm,
      seed: ir.seed,
      hand: LANDMARK_HAND,
      patches: [lm.palette.body],
      palette: lm.palette,
      parts: [],
      width: lm.width,
      height: lm.height,
      doorX: door ? door[0] + door[2] / 2 : null,
      doorH: door ? door[3] : 0,
      doorW: door ? door[2] : 0,
      doorBottom: door ? lm.height - door[1] - door[3] : 0,
      body: { x0: body[0], x1: body[1], top: body[2] },
    };
  }
  const style = need(content.styles, ir.style, "style pack");
  const recipe = need(content.recipes, ir.recipe, "recipe");
  const r = stream(mix(ir.seed, 1));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
  const range = ([lo, hi]: readonly [number, number]) => lo + Math.floor(r() * (hi - lo + 1));
  const parts: Part[] = [];
  for (const [id, chance] of Object.entries(style.parts)) {
    if (r() < chance || ir.parts.includes(id)) parts.push(need(content.parts, id, "part"));
  }
  for (const id of ir.parts) if (!parts.some((p) => p.id === id)) parts.push(need(content.parts, id, "part"));
  const palette = pick(style.palettes);
  const W = ir.lot;
  const hand: Hand = { stroke: style.stroke, rough: style.rough, hatch: style.hatch };
  const common = { seed: ir.seed, hand, patches: style.patches, palette, parts, width: W };

  switch (recipe.grammar) {
    case "terrace": {
      const margin = 12;
      const span = W - 2 * margin;
      const bays = Math.max(1, Math.round(span / range(recipe.bay_width)));
      const bayW = span / bays;
      const floors = range(recipe.floors);
      const floorH = range(recipe.floor_height);
      const base = range(recipe.base);
      const roof = pick(recipe.roofs);
      const chimneys = range(recipe.chimneys);
      const winShape = pick(recipe.windows);
      let doorBay = Math.floor(r() * bays);
      const balconyBay = Math.floor(r() * bays);
      let doorX = margin + doorBay * bayW + bayW / 2;
      if (ir.door !== null) {
        doorX = Math.min(W - margin - bayW * 0.25, Math.max(margin + bayW * 0.25, ir.door));
        doorBay = Math.min(bays - 1, Math.floor((doorX - margin) / bayW));
      }
      const bodyH = base + floors * floorH;
      const roofH =
        { flat: 16, gable: Math.round(span * 0.3), sawtooth: 34, mansard: 46, dome: Math.round(span * 0.26) }[
          roof
        ] ?? 16;
      const H = Math.ceil(bodyH + roofH + (chimneys ? 30 : 0) + 8);
      return {
        ...common,
        grammar: "terrace",
        margin,
        floors,
        bays,
        bayW,
        floorH,
        base,
        roof,
        roofH,
        chimneys,
        winShape,
        doorBay,
        balconyBay,
        height: H,
        doorX,
        doorH: floorH * 0.78,
        doorW: Math.min(span * 0.6, Math.max(70, bayW * 0.5)),
        doorBottom: 0,
        body: { x0: margin, x1: W - margin, top: H - bodyH },
      };
    }
    case "hall": {
      const margin = 16;
      const span = W - 2 * margin;
      const bays = Math.max(2, Math.round(span / range(recipe.bay_width)));
      const bayW = span / bays;
      const floors = range(recipe.floors);
      const floorH = range(recipe.floor_height);
      const roof = pick(recipe.roofs);
      const stacks = range(recipe.stacks);
      const stackH = range(recipe.stack_height);
      const doorBay = Math.floor(r() * bays);
      const bodyH = floors * floorH + 14;
      const roofH = { sawtooth: 42, barrel: Math.round(span * 0.16), flat: 14 }[roof] ?? 14;
      const H = Math.ceil(bodyH + Math.max(roofH, stackH) + 26);
      const doorW = bayW * 1.3;
      const want = ir.door ?? margin + doorBay * bayW + bayW / 2;
      const doorX = Math.min(W - margin - doorW / 2 - 4, Math.max(margin + doorW / 2 + 4, want));
      return {
        ...common,
        grammar: "hall",
        margin,
        floors,
        bays,
        bayW,
        floorH,
        roof,
        roofH,
        stacks,
        stackH,
        doorW,
        doorBottom: 0,
        height: H,
        doorX,
        doorH: floorH * 0.82,
        body: { x0: margin, x1: W - margin, top: H - bodyH },
      };
    }
    case "stack": {
      const margin = 24;
      const room = W - 2 * margin;
      const n = range(recipe.boxes);
      const boxes: StackBox[] = [];
      for (let i = 0; i < n; i++) {
        const w = Math.floor((0.55 + 0.4 * r()) * room);
        const h = range(recipe.box_height);
        const lean = Math.floor((r() - 0.5) * 2 * recipe.lean);
        const dx = Math.max(-(room - w) / 2, Math.min((room - w) / 2, lean));
        boxes.push({ w, h, dx, color: pick(style.patches), wins: range(recipe.windows) });
      }
      if (ir.door !== null) {
        const b0 = boxes[0]!;
        b0.dx = Math.max(-(room - b0.w) / 2, Math.min((room - b0.w) / 2, ir.door - W / 2));
      }
      const H = boxes.reduce((sum, b) => sum + b.h, 0) + 70;
      const b0 = boxes[0]!;
      return {
        ...common,
        grammar: "stack",
        boxes,
        height: H,
        doorX: W / 2 + b0.dx,
        doorH: b0.h * 0.72,
        doorW: Math.min(b0.w * 0.6, 74),
        doorBottom: 0,
        body: { x0: W / 2 + b0.dx - b0.w / 2, x1: W / 2 + b0.dx + b0.w / 2, top: H - b0.h },
      };
    }
    case "tower": {
      const margin = 16;
      const floors = range(recipe.floors);
      const floorH = range(recipe.floor_height);
      const setbacks = range(recipe.setbacks);
      const crown = pick(recipe.crowns);
      const crownH = { spire: 170, crystal: 120, antenna: 150, stepped: 70, flat: 16 }[crown] ?? 16;
      const H = floors * floorH + crownH + 10;
      return {
        ...common,
        grammar: "tower",
        margin,
        floors,
        floorH,
        setbacks,
        crown,
        crownH,
        height: H,
        doorX: null,
        doorH: 0,
        doorW: 0,
        doorBottom: 0,
        body: { x0: margin, x1: W - margin, top: crownH + 10 },
      };
    }
  }
}

// ---- shared pieces ------------------------------------------------------------------------------

type WinKind = "lit" | "dark" | "candle";

/** Is this window lit? Ink shows the state as it is; the Oracle shows tidy, generous light. */
function litKind(c: Pen, state: VisualState, rw: () => number, p = 0.55): WinKind {
  if (!c.ink) {
    if (state === "powered") return rw() < 0.72 ? "lit" : "dark";
    if (state === "empty") return rw() < 0.3 ? "lit" : "dark";
    return "dark";
  }
  if (state === "powered") return rw() < p ? "lit" : "dark";
  if (state === "empty") return rw() < 0.12 ? "lit" : "dark";
  return "dark";
}

function winPts(x: number, y: number, w: number, h: number, shape: string): Point[] {
  if (shape === "arch") {
    const r = w / 2;
    const pts: Point[] = [
      [x, y + h],
      [x, y + r],
    ];
    for (let i = 1; i < 6; i++) pts.push([x + r + cos12(12 - 2 * i) * r, y + r - sin12(12 - 2 * i) * r]);
    pts.push([x + w, y + r], [x + w, y + h]);
    return pts;
  }
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

function drawWin(
  c: Pen,
  pts: Point[],
  b: { x: number; y: number; w: number; h: number },
  kind: WinKind,
): string {
  const d = c.P(pts);
  const msw = c.ink ? 1.3 : 0.7;
  let o = "";
  if (kind === "lit") {
    if (!c.ink) {
      o += `<rect x="${f1(b.x - 3)}" y="${f1(b.y - 3)}" width="${f1(b.w + 6)}" height="${f1(b.h + 6)}" rx="3" fill="#fff3c8" opacity=".35" stroke="none"/>`;
    }
    o += `<path d="${d}" fill="${c.ink ? "#efc068" : "#fff3c8"}"/>`;
  } else if (kind === "candle") {
    o += `<path class="candle" d="${d}" fill="#d98838"/>`;
  } else {
    o += `<path d="${d}" fill="${c.ink ? "#2a2e35" : "#a8bddc"}"/>`;
  }
  o += `<path d="${c.L(b.x + b.w / 2, b.y + 2, b.x + b.w / 2, b.y + b.h)}" stroke-width="${msw}"/>`;
  o += `<path d="${c.L(b.x, b.y + b.h * 0.5, b.x + b.w, b.y + b.h * 0.5)}" stroke-width="${msw}"/>`;
  return o;
}

/** The one window that shows a candle in an unpowered, lived-in house. */
const candleWindow = (state: VisualState, c: Pen, index: number, chosen: number): WinKind | null =>
  state === "candle" && c.ink ? (index === chosen ? "candle" : "dark") : null;

interface Box {
  x0: number;
  x1: number;
  yT: number;
  yB: number;
}

const has = (form: Form, draw: Part["draw"]): Part | undefined => form.parts.find((p) => p.draw === draw);

const partGroup = (part: Part, inner: string): string =>
  inner ? `<g data-part="${part.id}">${inner}</g>` : "";

/** Clutter: what only ink shows. The Oracle tidies all of it away. */
function clutter(c: Pen, form: Form, box: Box, state: VisualState, salt = 0): string {
  if (!c.ink) return "";
  const rp = stream(mix(form.seed, 31, 7, salt));
  const { x0, x1, yT, yB } = box;
  const w = x1 - x0;
  const h = yB - yT;
  let o = "";
  for (const part of form.parts) {
    if (!part.clutter || (part.damaged_only && state !== "damaged")) continue;
    let g = "";
    switch (part.draw) {
      case "pipes": {
        const px = x1 - 7;
        g += `<path d="${c.L(px, yT + 6, px, yB)}" stroke="#4a4844" stroke-width="5"/><path d="${c.L(px, yT + h * 0.45, px - w * 0.35, yT + h * 0.45)}" stroke="#4a4844" stroke-width="4"/>`;
        for (let y = yT + 30; y < yB - 10; y += 52)
          g += `<rect x="${f1(px - 4)}" y="${f1(y)}" width="8" height="5" fill="#2b2a28" stroke="none"/>`;
        break;
      }
      case "laundry": {
        if (h <= 100) break;
        const y = yT + h * (0.3 + rp() * 0.2);
        const mx = (x0 + x1) / 2;
        g += `<path d="M${f1(x0 + 6)} ${f1(y)} Q${f1(mx)} ${f1(y + 16)} ${f1(x1 - 6)} ${f1(y)}" stroke-width="1"/>`;
        const n = 3 + Math.floor(rp() * 3);
        for (let i = 0; i < n; i++) {
          const t = (i + 1) / (n + 1);
          const cx = x0 + 6 + (w - 12) * t;
          const cy = y + 16 * 4 * t * (1 - t) * 0.5 + 1;
          const color = form.patches[Math.floor(rp() * form.patches.length)]!;
          g += `<path d="${c.P([
            [cx - 6, cy],
            [cx + 6, cy],
            [cx + 5, cy + 14 + rp() * 6],
            [cx - 5, cy + 14 + rp() * 6],
          ])}" fill="${color}" stroke-width="1"/>`;
        }
        break;
      }
      case "posters": {
        const n = 1 + Math.floor(rp() * 3);
        for (let i = 0; i < n; i++) {
          const px = x0 + 8 + rp() * Math.max(1, w - 30);
          const py = yB - 64 - rp() * 30;
          const a = (rp() - 0.5) * 10;
          const oracleNote = rp() < 0.4;
          g += `<g transform="rotate(${f1(a)} ${f1(px + 8)} ${f1(py + 10)})"><path d="${c.P([
            [px, py],
            [px + 16, py],
            [px + 16, py + 20],
            [px, py + 20],
          ])}" fill="${oracleNote ? "#cfe0ff" : "#e9dfc8"}" stroke-width="1"/>`;
          g += oracleNote
            ? `<path d="${c.P([
                [px + 8, py + 6],
                [px + 12, py + 10],
                [px + 8, py + 14],
                [px + 4, py + 10],
              ])}" stroke="#3b5d9a" stroke-width="1"/>`
            : `<path d="${c.L(px + 3, py + 6, px + 13, py + 6)}" stroke-width=".8"/><path d="${c.L(px + 3, py + 11, px + 11, py + 11)}" stroke-width=".8"/>`;
          g += "</g>";
        }
        break;
      }
      case "ladder": {
        const lx = x0 + 4 + rp() * 10;
        const ly0 = yT + 10;
        g += `<path d="${c.L(lx, ly0, lx, yB)}" stroke-width="1.6"/><path d="${c.L(lx + 12, ly0, lx + 12, yB)}" stroke-width="1.6"/>`;
        for (let y = ly0 + 8; y < yB; y += 13)
          g += `<path d="${c.L(lx, y, lx + 12, y)}" stroke-width="1.1"/>`;
        break;
      }
      case "wires": {
        const wy = yT + 4;
        g += `<path d="M${f1(x0 + w * 0.3)} ${f1(wy)} Q${f1(x0 - 40)} ${f1(wy + 30)} ${f1(x0 - 90)} ${f1(wy + 6)}" stroke-width="1"/>`;
        g += `<path d="M${f1(x1 - w * 0.2)} ${f1(wy)} Q${f1(x1 + 50)} ${f1(wy + 40)} ${f1(x1 + 110)} ${f1(wy + 12)}" stroke-width="1"/>`;
        break;
      }
      case "cracks": {
        const rc = stream(mix(form.seed, 99, salt));
        for (let k = 0; k < 2; k++) {
          let x = x0 + w * (0.2 + 0.6 * rc());
          let y = yT + 4;
          let d = `M${f1(x)} ${f1(y)}`;
          for (let i = 0; i < 9 && y < yB - 30; i++) {
            x += (rc() - 0.5) * 22;
            y += 16 + rc() * 18;
            d += ` L${f1(x)} ${f1(y)}`;
          }
          g += `<path d="${d}" stroke-width="1.8"/>`;
        }
        for (let i = 0; i < 5; i++) {
          const rx = x0 + rc() * w;
          g += `<path d="${c.P([
            [rx, yB],
            [rx + 6 + rc() * 8, yB - 4 - rc() * 6],
            [rx + 14 + rc() * 8, yB],
          ])}" fill="#6b6359" stroke-width="1.2"/>`;
        }
        break;
      }
      default:
        break;
    }
    o += partGroup(part, g);
  }
  return o;
}

const oFill = (c: Pen, inkColor: string, oracle: string) => (c.ink ? inkColor : oracle);

function drawVacant(w: number, h: number, standalone: boolean): string {
  let o = `<g stroke="#ffffff" stroke-width="1.1" fill="none" opacity=".85">`;
  for (let x = 8; x < w - 4; x += 18) o += `<path d="M${f1(x)} ${f1(h)} L${f1(x)} ${f1(h - 34)}"/>`;
  o += `<path d="M4 ${f1(h - 26)} L${f1(w - 4)} ${f1(h - 26)}"/><path d="M4 ${f1(h - 12)} L${f1(w - 4)} ${f1(h - 12)}"/></g>`;
  return svgWrap(w, h, o, standalone);
}

// ---- grammars ------------------------------------------------------------------------------------

function terrace(f: Terrace, state: VisualState, c: Pen): string {
  const rw = stream(mix(f.seed, 104729, c.ink ? 7 : 11));
  const pal = f.palette;
  const W = f.width;
  const H = f.height;
  const span = W - 2 * f.margin;
  const bodyH = f.base + f.floors * f.floorH;
  const x0 = f.margin;
  const x1 = W - f.margin;
  const yT = H - bodyH;
  const yB = H;
  const roofFill = oFill(c, pal.roof, "url(#oRoof)");
  let o = open(c);
  for (let i = 0; i < f.chimneys; i++) {
    const cx = x0 + span * (i ? 0.72 : 0.26);
    const top = yT - f.roofH * 0.55 - 30;
    o += `<path d="${c.P([
      [cx - 8, yT - 2],
      [cx - 8, top],
      [cx + 8, top],
      [cx + 8, yT - 2],
    ])}" fill="${roofFill}"/>`;
  }
  let roof: Point[];
  switch (f.roof) {
    case "flat":
      roof = [
        [x0 - 4, yT],
        [x0 - 4, yT - f.roofH],
        [x1 + 4, yT - f.roofH],
        [x1 + 4, yT],
      ];
      break;
    case "gable":
      roof = [
        [x0 - 9, yT],
        [W / 2, yT - f.roofH],
        [x1 + 9, yT],
      ];
      break;
    case "sawtooth": {
      roof = [[x0, yT]];
      for (let i = 0; i < f.bays; i++)
        roof.push([x0 + i * f.bayW, yT - f.roofH], [x0 + (i + 1) * f.bayW, yT - f.roofH * 0.3]);
      roof.push([x1, yT]);
      break;
    }
    case "mansard":
      roof = [
        [x0 - 6, yT],
        [x0 + 14, yT - f.roofH],
        [x1 - 14, yT - f.roofH],
        [x1 + 6, yT],
      ];
      break;
    default: {
      roof = [];
      for (let i = 0; i <= 12; i++) roof.push([W / 2 - cos12(i) * (span / 2), yT - sin12(i) * f.roofH]);
    }
  }
  const body: Point[] = [
    [x0, yT],
    [x1, yT],
    [x1, yB],
    [x0, yB],
  ];
  o +=
    halo(c, body) +
    `<path d="${c.P(roof)}" fill="${roofFill}"/><path d="${c.P(body)}" fill="${oFill(c, pal.body, "url(#oBody)")}"/>`;
  o += hatch(c, body, x1 - span * 0.24, yT, span * 0.24 + 2, bodyH);
  if (c.ink)
    o += `<rect x="${f1(x0)}" y="${f1(yT)}" width="${f1(span)}" height="8" fill="#000" opacity=".2" stroke="none"/>`;
  for (let i = 1; i < f.floors; i++) {
    const y = yB - f.base - i * f.floorH;
    o += `<path d="${c.L(x0 - 3, y, x1 + 3, y)}"/>`;
  }
  o += `<path d="${c.L(x0, yB - f.base, x1, yB - f.base)}"/>`;
  const doorX = f.doorX ?? x0 + f.bayW / 2;
  const dw = f.doorW;
  const dh = f.doorH;
  let broken = state === "damaged";
  const candleAt = f.floors > 1 ? f.bays : 0;
  let index = 0;
  for (let i = 0; i < f.floors; i++) {
    for (let b = 0; b < f.bays; b++) {
      const shop = i === 0;
      const bx = x0 + b * f.bayW;
      const ww = f.bayW * (shop ? 0.66 : 0.46);
      const wh = f.floorH * (shop ? 0.5 : f.winShape === "tall" ? 0.62 : 0.46);
      const wx = bx + (f.bayW - ww) / 2;
      const wy = yB - f.base - (i + 1) * f.floorH + (f.floorH - wh) * (shop ? 0.62 : 0.42);
      if (shop && Math.abs(wx + ww / 2 - doorX) < (ww + dw) / 2 + 4) continue;
      const kind = candleWindow(state, c, index++, candleAt) ?? litKind(c, state, rw);
      o += drawWin(
        c,
        winPts(wx, wy, ww, wh, shop ? "rect" : f.winShape),
        { x: wx, y: wy, w: ww, h: wh },
        kind,
      );
      if (broken && c.ink && kind === "dark" && i > 0 && rw() < 0.6) {
        broken = false;
        for (let k = 0; k < 6; k++) {
          const a = k * 4 + Math.floor(rw() * 4);
          o += `<path d="${c.L(wx + ww / 2, wy + wh / 2, wx + ww / 2 + cos12(a) * ww * 0.5, wy + wh / 2 + sin12(a) * wh * 0.5)}" stroke-width="1"/>`;
        }
      }
    }
  }
  o += `<path d="${c.P([
    [doorX - dw / 2, yB],
    [doorX - dw / 2, yB - dh],
    [doorX + dw / 2, yB - dh],
    [doorX + dw / 2, yB],
  ])}" fill="${oFill(c, pal.door, "#dbe7ff")}"/>`;
  o += `<circle cx="${f1(doorX + dw * 0.28)}" cy="${f1(yB - dh * 0.45)}" r="1.8" fill="${c.stroke}" stroke="none"/>`;
  if (c.ink && state === "damaged") {
    o += `<path d="${c.L(doorX - dw / 2 - 3, yB - dh * 0.7, doorX + dw / 2 + 3, yB - dh * 0.35)}" stroke-width="5" stroke="#5b4a3a"/>`;
    o += `<path d="${c.L(doorX - dw / 2 - 3, yB - dh * 0.3, doorX + dw / 2 + 3, yB - dh * 0.62)}" stroke-width="5" stroke="#5b4a3a"/>`;
  }
  const awning = has(f, "awning");
  if (awning) {
    const ay = yB - f.base - f.floorH + 4;
    const n = Math.max(4, Math.round(span / 14));
    const s = span / n;
    let g = "";
    for (let k = 0; k < n; k++) {
      const ax = x0 + k * s;
      const fill = c.ink ? (k % 2 ? pal.trim : "#8a3b2f") : k % 2 ? "#ffffff" : "#d8e6ff";
      g += `<path d="${c.P([
        [ax, ay],
        [ax + s, ay],
        [ax + s + 2, ay + 18],
        [ax + 2, ay + 18],
      ])}" fill="${fill}" stroke-width="${c.ink ? 1.4 : 0.6}"/>`;
    }
    o += partGroup(awning, g);
  }
  const sign = has(f, "sign");
  if (sign) {
    const sy = yB - f.base - f.floorH * 1.85;
    let g = `<path d="${c.P([
      [x1 - 2, sy],
      [x1 + 16, sy],
      [x1 + 16, sy + 52],
      [x1 - 2, sy + 52],
    ])}" fill="${oFill(c, pal.trim, "#ffffff")}"/>`;
    for (let k = 0; k < 3; k++)
      g += `<path d="${c.L(x1 + 3, sy + 10 + k * 14, x1 + 11, sy + 14 + k * 14)}" stroke-width="1.2"/>`;
    o += partGroup(sign, g);
  }
  const balcony = has(f, "balcony");
  if (balcony && f.floors > 2) {
    const by = yB - f.base - f.floorH - 2;
    const bx0 = x0 + f.balconyBay * f.bayW + 6;
    const bx1 = bx0 + f.bayW - 12;
    let g = `<path d="${c.L(bx0 - 4, by, bx1 + 4, by)}" stroke-width="${c.ink ? 3 : 1.4}"/><path d="${c.L(bx0 - 4, by - 18, bx1 + 4, by - 18)}"/>`;
    for (let k = 0; k <= 5; k++) {
      const xx = bx0 - 4 + (k * (bx1 - bx0 + 8)) / 5;
      g += `<path d="${c.L(xx, by, xx, by - 18)}" stroke-width="1"/>`;
    }
    o += partGroup(balcony, g);
  }
  return o + clutter(c, f, { x0, x1, yT, yB }, state) + "</g>";
}

function hall(f: Hall, state: VisualState, c: Pen): string {
  const rw = stream(mix(f.seed, 104729, c.ink ? 7 : 11));
  const pal = f.palette;
  const W = f.width;
  const H = f.height;
  const span = W - 2 * f.margin;
  const bodyH = f.floors * f.floorH + 14;
  const x0 = f.margin;
  const x1 = W - f.margin;
  const yT = H - bodyH;
  const yB = H;
  const roofFill = oFill(c, pal.roof, "url(#oRoof)");
  let o = open(c);
  for (let i = 0; i < f.stacks; i++) {
    const cx = x0 + span * (i ? 0.8 : 0.22);
    const yt = yT - f.stackH;
    o += `<path d="${c.P([
      [cx - 14, yT],
      [cx - 9, yt],
      [cx + 9, yt],
      [cx + 14, yT],
    ])}" fill="${roofFill}"/>`;
    for (let y = yt + 16; y < yT - 8; y += 26)
      o += `<path d="${c.L(cx - 13, y, cx + 13, y)}" stroke-width="1.2"/>`;
    if (c.ink && state === "powered")
      o += `<path d="M${f1(cx)} ${f1(yt - 4)} q-10 -12 2 -22 q12 -10 0 -24" stroke="#8d8a84" stroke-width="5" opacity=".55"/>`;
  }
  let roof: Point[];
  if (f.roof === "sawtooth") {
    roof = [[x0, yT]];
    for (let i = 0; i < f.bays; i++)
      roof.push([x0 + i * f.bayW, yT - f.roofH], [x0 + (i + 1) * f.bayW, yT - f.roofH * 0.25]);
    roof.push([x1, yT]);
  } else if (f.roof === "barrel") {
    roof = [];
    for (let i = 0; i <= 12; i++) roof.push([W / 2 - cos12(i) * (span / 2 + 6), yT - sin12(i) * f.roofH]);
  } else {
    roof = [
      [x0 - 4, yT],
      [x0 - 4, yT - f.roofH],
      [x1 + 4, yT - f.roofH],
      [x1 + 4, yT],
    ];
  }
  const body: Point[] = [
    [x0, yT],
    [x1, yT],
    [x1, yB],
    [x0, yB],
  ];
  o +=
    halo(c, body) +
    `<path d="${c.P(roof)}" fill="${roofFill}"/><path d="${c.P(body)}" fill="${oFill(c, pal.body, "url(#oBody)")}"/>`;
  o +=
    hatch(c, body, x0, yT, span, bodyH * 0.18) + hatch(c, body, x1 - span * 0.2, yT, span * 0.2 + 2, bodyH);
  const dx = f.doorX ?? W / 2;
  const dw = f.doorW;
  const dh = f.doorH;
  let index = 0;
  for (let fl = 0; fl < f.floors; fl++) {
    for (let b = 0; b < f.bays; b++) {
      const bx = x0 + b * f.bayW;
      const cxb = bx + f.bayW / 2;
      if (fl === 0 && Math.abs(cxb - dx) < dw / 2 + 6) continue;
      const ww = f.bayW * 0.62;
      const wh = f.floorH * 0.55;
      const wx = bx + (f.bayW - ww) / 2;
      const wy = yB - (fl + 1) * f.floorH + f.floorH * 0.16;
      const kind = candleWindow(state, c, index++, 1) ?? litKind(c, state, rw, 0.6);
      o += drawWin(c, winPts(wx, wy, ww, wh, "rect"), { x: wx, y: wy, w: ww, h: wh }, kind);
      o += `<path d="${c.L(wx, wy + wh * 0.25, wx + ww, wy + wh * 0.25)}" stroke-width="${c.ink ? 1 : 0.6}"/><path d="${c.L(wx, wy + wh * 0.75, wx + ww, wy + wh * 0.75)}" stroke-width="${c.ink ? 1 : 0.6}"/>`;
    }
  }
  o += `<path d="${c.P([
    [dx - dw / 2, yB],
    [dx - dw / 2, yB - dh],
    [dx + dw / 2, yB - dh],
    [dx + dw / 2, yB],
  ])}" fill="${oFill(c, pal.door, "#dbe7ff")}"/>`;
  o += `<path d="${c.L(dx - dw / 2, yB, dx + dw / 2, yB - dh)}" stroke-width="1.2"/><path d="${c.L(dx - dw / 2, yB - dh, dx + dw / 2, yB)}" stroke-width="1.2"/>`;
  const sign = has(f, "sign");
  if (sign) {
    const sy = yB - dh - 26;
    let g = `<path d="${c.P([
      [dx - dw * 0.7, sy],
      [dx + dw * 0.7, sy],
      [dx + dw * 0.7, sy + 18],
      [dx - dw * 0.7, sy + 18],
    ])}" fill="${oFill(c, pal.trim, "#ffffff")}"/>`;
    for (let k = 0; k < 4; k++)
      g += `<path d="${c.L(dx - dw * 0.55 + k * dw * 0.3, sy + 6, dx - dw * 0.4 + k * dw * 0.3, sy + 12)}" stroke-width="1.2"/>`;
    o += partGroup(sign, g);
  }
  return o + clutter(c, f, { x0, x1, yT, yB }, state) + "</g>";
}

function stack(f: Stack, state: VisualState, c: Pen): string {
  const rw = stream(mix(f.seed, 104729, c.ink ? 7 : 11));
  // The Oracle tidies self-built houses: the boxes line up, the patches turn uniform.
  const boxes = f.boxes.map((b, i) => ({ ...b, dx: c.ink || (i === 0 && f.doorX !== null) ? b.dx : 0 }));
  const W = f.width;
  const H = f.height;
  const cx = W / 2;
  let o = open(c);
  let y = H;
  let x0 = W;
  let x1 = 0;
  let index = 0;
  boxes.forEach((b, i) => {
    const bx0 = cx + b.dx - b.w / 2;
    const bx1 = bx0 + b.w;
    const by0 = y - b.h;
    x0 = Math.min(x0, bx0);
    x1 = Math.max(x1, bx1);
    const pts: Point[] = [
      [bx0, by0],
      [bx1, by0],
      [bx1, y],
      [bx0, y],
    ];
    o += halo(c, pts) + `<path d="${c.P(pts)}" fill="${oFill(c, b.color, "url(#oBody)")}"/>`;
    o += hatch(c, pts, bx1 - b.w * 0.22, by0, b.w * 0.22 + 2, b.h);
    o += `<path d="${c.L(bx0 - 5, by0, bx1 + 5, by0)}" stroke-width="${c.ink ? 3.2 : 1.4}"/>`;
    for (let k = 0; k < b.wins; k++) {
      const ww = Math.min(44, (b.w / (b.wins + 1)) * 0.42);
      const wh = b.h * 0.34;
      const wx = bx0 + (b.w / (b.wins + 1)) * (k + 1) - ww / 2;
      const wy = by0 + b.h * 0.18;
      if (i === 0 && Math.abs(wx + ww / 2 - (cx + b.dx)) < (ww + f.doorW) / 2 + 4) continue;
      const kind = candleWindow(state, c, index++, 0) ?? litKind(c, state, rw);
      o += drawWin(c, winPts(wx, wy, ww, wh, "rect"), { x: wx, y: wy, w: ww, h: wh }, kind);
    }
    if (i === 0) {
      const doorX = cx + b.dx;
      const doorH = b.h * 0.72;
      o += `<path d="${c.P([
        [doorX - f.doorW / 2, y],
        [doorX - f.doorW / 2, y - doorH],
        [doorX + f.doorW / 2, y - doorH],
        [doorX + f.doorW / 2, y],
      ])}" fill="${oFill(c, "#2f2b27", "#dbe7ff")}"/>`;
      if (c.ink && state === "damaged")
        o += `<path d="${c.L(doorX - 16, y - doorH * 0.7, doorX + 16, y - doorH * 0.35)}" stroke-width="5" stroke="#5b4a3a"/>`;
    }
    y = by0;
  });
  const top = boxes[boxes.length - 1]!;
  const tx0 = cx + top.dx - top.w / 2 - 6;
  const tx1 = tx0 + top.w + 12;
  const zig: Point[] = [
    [tx0, y],
    [tx0, y - 10],
  ];
  for (let x = tx0; x < tx1; x += 10) zig.push([x + 5, y - 15], [x + 10, y - 10]);
  zig.push([tx1, y]);
  o += `<path d="${c.P(zig)}" fill="${oFill(c, "#5a5148", "url(#oRoof)")}" stroke-width="${c.ink ? 1.6 : 0.8}"/>`;
  o += `<path d="${c.L(cx + top.dx, y - 12, cx + top.dx, y - 52)}" stroke-width="1.6"/><path d="${c.L(cx + top.dx - 12, y - 44, cx + top.dx + 12, y - 44)}" stroke-width="1.4"/>`;
  return o + clutter(c, f, { x0, x1, yT: y, yB: H }, state) + "</g>";
}

function tower(f: Tower, state: VisualState, c: Pen): string {
  const rw = stream(mix(f.seed, 977, c.ink ? 3 : 9));
  const pal = f.palette;
  const W = f.width;
  const H = f.height;
  const cx = W / 2;
  const roofFill = oFill(c, pal.roof, "url(#oRoof)");
  let o = `<g stroke="${c.stroke}" stroke-width="${c.ink ? 3 : 1.4}" stroke-linejoin="round" fill="none">`;
  let lit = "";
  let left = f.floors;
  let w = W - 2 * f.margin;
  let yb = H;
  const segs: { x0: number; x1: number; yb: number; yt: number; nf: number }[] = [];
  for (let s = 0; s <= f.setbacks && left > 0; s++) {
    const nf = s === f.setbacks ? left : Math.max(2, Math.round(left * 0.55));
    segs.push({ x0: cx - w / 2, x1: cx + w / 2, yb, yt: yb - nf * f.floorH, nf });
    yb -= nf * f.floorH;
    left -= nf;
    w *= 0.76;
  }
  const p = !c.ink ? (state === "powered" || state === "empty" ? 0.74 : 0) : state === "powered" ? 0.5 : 0;
  for (const g of segs) {
    o += `<path d="${c.P([
      [g.x0, g.yt],
      [g.x1, g.yt],
      [g.x1, g.yb],
      [g.x0, g.yb],
    ])}" fill="${oFill(c, pal.body, "url(#oBody)")}"/>`;
    for (let fl = 0; fl < g.nf; fl++) {
      const by = g.yb - (fl + 1) * f.floorH + f.floorH * 0.3;
      const bh = f.floorH * 0.38;
      const bx0 = g.x0 + 10;
      const bx1 = g.x1 - 10;
      o += `<rect x="${f1(bx0)}" y="${f1(by)}" width="${f1(bx1 - bx0)}" height="${f1(bh)}" fill="${c.ink ? "#2a2e35" : "#9fb5d8"}" stroke="none"/>`;
      const cells = Math.max(2, Math.floor((bx1 - bx0) / 22));
      const cw = (bx1 - bx0) / cells;
      let run = -1;
      for (let k = 0; k <= cells; k++) {
        const on = k < cells && rw() < p;
        if (on && run < 0) run = k;
        if (!on && run >= 0) {
          lit += `<rect x="${f1(bx0 + run * cw + 1)}" y="${f1(by + 1)}" width="${f1((k - run) * cw - 2)}" height="${f1(bh - 2)}" fill="${c.ink ? "#efc068" : "#fff3c8"}" stroke="none"/>`;
          run = -1;
        }
      }
    }
  }
  o += lit;
  const top = segs[segs.length - 1]!;
  const tw = top.x1 - top.x0;
  const ty = top.yt;
  const ch = f.crownH;
  switch (f.crown) {
    case "spire":
      o += `<path d="${c.P([
        [cx - tw * 0.18, ty],
        [cx, ty - ch],
        [cx + tw * 0.18, ty],
      ])}" fill="${roofFill}"/>`;
      break;
    case "crystal":
      o += `<path d="${c.P([
        [cx - tw * 0.3, ty],
        [cx - tw * 0.36, ty - ch * 0.45],
        [cx, ty - ch],
        [cx + tw * 0.36, ty - ch * 0.45],
        [cx + tw * 0.3, ty],
      ])}" fill="${oFill(c, "#9fb3b8", "#eaf6ff")}"/>`;
      break;
    case "antenna":
      o += `<path d="${c.L(cx, ty, cx, ty - ch)}"/><circle cx="${f1(cx)}" cy="${f1(ty - ch)}" r="5" fill="${oFill(c, "#c0392b", "#fff3c8")}"/>`;
      break;
    case "stepped":
      o += `<path d="${c.P([
        [cx - tw * 0.32, ty],
        [cx - tw * 0.32, ty - ch * 0.5],
        [cx + tw * 0.32, ty - ch * 0.5],
        [cx + tw * 0.32, ty],
      ])}" fill="${roofFill}"/>`;
      o += `<path d="${c.P([
        [cx - tw * 0.15, ty - ch * 0.5],
        [cx - tw * 0.15, ty - ch],
        [cx + tw * 0.15, ty - ch],
        [cx + tw * 0.15, ty - ch * 0.5],
      ])}" fill="${roofFill}"/>`;
      break;
    default:
      o += `<path d="${c.P([
        [top.x0 - 4, ty],
        [top.x0 - 4, ty - ch],
        [top.x1 + 4, ty - ch],
        [top.x1 + 4, ty],
      ])}" fill="${roofFill}"/>`;
  }
  const s0 = segs[0]!;
  return o + clutter(c, f, { x0: s0.x0, x1: s0.x1, yT: s0.yt, yB: H }, state) + "</g>";
}

/** Pale the Oracle's way: any colour drifts toward its clean blue-white. */
function oracleTint(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const blend = (v: number, t: number) => Math.round(v * 0.3 + t * 0.7);
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return "#" + h(blend((n >> 16) & 255, 0xe4)) + h(blend((n >> 8) & 255, 0xed)) + h(blend(n & 255, 0xff));
}

function shapes(f: LandmarkForm, state: VisualState, c: Pen, text: (ref: string) => string): string {
  const lm = f.landmark;
  const pal = lm.palette;
  const rw = stream(mix(f.seed, 104729, c.ink ? 7 : 11));
  const fillOf = (s: Shape): string => {
    switch (s.fill) {
      case "none":
        return "none";
      case "body":
        return oFill(c, pal.body, "url(#oBody)");
      case "roof":
        return oFill(c, pal.roof, "url(#oRoof)");
      case "trim":
        return oFill(c, pal.trim, "#ffffff");
      case "door":
        return oFill(c, pal.door, "#dbe7ff");
      default:
        return c.ink ? s.fill : oracleTint(s.fill);
    }
  };
  let o = open(c);
  let windows = 0;
  for (const s of lm.shapes) {
    if (s.clutter && !c.ink) continue;
    const [dx, count] = s.repeat ?? [0, 1];
    const attrs =
      (s.stroke && c.ink ? ` stroke="${s.stroke}"` : "") +
      (s.width !== undefined ? ` stroke-width="${f1(s.width)}"` : "") +
      (s.opacity !== undefined ? ` opacity="${f1(s.opacity)}"` : "");
    for (let k = 0; k < count; k++) {
      const ox = dx * k;
      if (s.poly) {
        o += `<path d="${c.P(s.poly.map(([x, y]) => [x + ox, y] as Point))}" fill="${fillOf(s)}"${attrs}/>`;
      } else if (s.line) {
        const [x1, y1, x2, y2] = s.line;
        o += `<path d="${c.L(x1 + ox, y1, x2 + ox, y2)}"${attrs}/>`;
      } else if (s.rect) {
        const [x, y, w, h] = s.rect;
        o += `<path d="${c.P([
          [x + ox, y],
          [x + ox + w, y],
          [x + ox + w, y + h],
          [x + ox, y + h],
        ])}" fill="${fillOf(s)}"${attrs}/>`;
        if (s.glow)
          o += `<rect x="${f1(x + ox - 6)}" y="${f1(y - 6)}" width="${f1(w + 12)}" height="${f1(h + 12)}" rx="6" fill="#dfeaff" opacity=".3" stroke="none"/>`;
      } else if (s.circle) {
        const [x, y, r] = s.circle;
        o += s.glow
          ? `<circle cx="${f1(x + ox)}" cy="${f1(y)}" r="${f1(r)}" fill="url(#lampGlow)" stroke="none"/>`
          : `<circle cx="${f1(x + ox)}" cy="${f1(y)}" r="${f1(r)}" fill="${fillOf(s)}"${attrs}/>`;
      } else if (s.window) {
        const [x, y, w, h] = s.window;
        const kind = candleWindow(state, c, windows++, 0) ?? litKind(c, state, rw, 0.8);
        o += drawWin(c, winPts(x + ox, y, w, h, "rect"), { x: x + ox, y, w, h }, kind);
      } else if (s.door) {
        const [x, y, w, h] = s.door;
        o += `<path d="${c.P([
          [x + ox, y + h],
          [x + ox, y],
          [x + ox + w, y],
          [x + ox + w, y + h],
        ])}" fill="${oFill(c, pal.door, "#dbe7ff")}"/>`;
        if (c.ink && state === "damaged")
          o += `<path d="${c.L(x + ox - 3, y + h * 0.3, x + ox + w + 3, y + h * 0.65)}" stroke-width="5" stroke="#5b4a3a"/>`;
      } else if (s.text && s.at) {
        const color = s.fill === "none" ? (c.ink ? "#1d1916" : "#5a7fc0") : fillOf(s);
        o += `<text x="${f1(s.at[0] + ox)}" y="${f1(s.at[1])}" font-size="${f1(s.size)}" font-weight="700" text-anchor="middle" fill="${color}" stroke="none">${escapeText(text(s.text))}</text>`;
      }
    }
  }
  const body = f.body;
  return o + clutter(c, f, { x0: body.x0, x1: body.x1, yT: body.top, yB: f.height }, state) + "</g>";
}

// ---- entry points ------------------------------------------------------------------------------

export interface Drawing {
  svg: string;
  width: number;
  height: number;
}

const penFor = (f: Form, look: Look, salt: number, idBase: string): Pen =>
  pen(look, mix(f.seed, salt), f.hand.rough, f.hand.stroke, f.hand.hatch, idBase);

const idOf = (f: Form, opts: DrawOptions, face: string) => `${opts.id ?? `v${f.seed}`}-${face}`;

/** The front of a building. Its outline (width, height, door) depends only on the form. */
export function drawFacade(f: Form, state: VisualState, look: Look, opts: DrawOptions = {}): Drawing {
  const standalone = opts.standalone ?? false;
  if (state === "vacant")
    return { svg: drawVacant(f.width, f.height, standalone), width: f.width, height: f.height };
  const c = penFor(f, look, 0, idOf(f, opts, look[0]!));
  const text = opts.text ?? ((ref: string) => ref);
  let inner: string;
  switch (f.grammar) {
    case "terrace":
      inner = terrace(f, state, c);
      break;
    case "hall":
      inner = hall(f, state, c);
      break;
    case "stack":
      inner = stack(f, state, c);
      break;
    case "tower":
      inner = tower(f, state, c);
      break;
    case "landmark":
      inner = shapes(f, state, c, text);
      break;
  }
  return { svg: svgWrap(f.width, f.height, inner, standalone), width: f.width, height: f.height };
}

/** One side face: the box's wall running back `depth` units, in shadow, with the same state. */
export function drawSide(
  f: Form,
  state: VisualState,
  look: Look,
  depth: number,
  side: "left" | "right",
  opts: DrawOptions = {},
): Drawing {
  const H = f.height - f.body.top;
  const standalone = opts.standalone ?? false;
  if (state === "vacant") return { svg: svgWrap(depth, H, "", standalone), width: depth, height: H };
  const salt = side === "left" ? 1 : 2;
  const c = penFor(f, look, salt + 2, idOf(f, opts, `${look[0]}${side[0]}`));
  const rw = stream(mix(f.seed, 131, salt, c.ink ? 0 : 7));
  const pts: Point[] = [
    [0, 0],
    [depth, 0],
    [depth, H],
    [0, H],
  ];
  let o = open(c) + `<path d="${c.P(pts)}" fill="${oFill(c, shade(f.palette.body), "url(#oSide)")}"/>`;
  o += hatch(c, pts, 0, 0, depth, H);
  o += `<rect x="0" y="0" width="${f1(depth)}" height="7" fill="${oFill(c, f.palette.roof, "#eef4ff")}" stroke="none"/>`;
  if (depth >= 80) {
    let index = 0;
    const floors =
      f.grammar === "terrace" || f.grammar === "hall" ? f.floors : Math.max(1, Math.floor(H / 160));
    const floorH = f.grammar === "terrace" || f.grammar === "hall" ? f.floorH : H / floors;
    for (let floor = 0; floor < floors; floor++) {
      const ww = Math.min(44, depth * 0.22);
      const wh = floorH * 0.42;
      const y = H - (floor + 1) * floorH + floorH * 0.2;
      const wx = depth * 0.35;
      const kind = candleWindow(state, c, index++, 99) ?? litKind(c, state, rw, 0.4);
      o += drawWin(c, winPts(wx, y, ww, wh, "rect"), { x: wx, y, w: ww, h: wh }, kind);
    }
  }
  const cracks = f.parts.find((p) => p.draw === "cracks");
  if (c.ink && state === "damaged" && cracks) {
    o += partGroup(
      cracks,
      `<path d="M${f1(depth * 0.3)} 10 L${f1(depth * 0.42)} ${f1(H * 0.3)} L${f1(depth * 0.36)} ${f1(H * 0.55)}" stroke-width="1.6"/>`,
    );
  }
  return { svg: svgWrap(depth, H, o + "</g>", standalone), width: depth, height: H };
}

/** A paper figure: the hero, a resident. */
export function drawFigure(coat: string, hat: boolean, folder: boolean): string {
  return (
    `<svg width="64" height="150" viewBox="0 0 64 150" xmlns="http://www.w3.org/2000/svg"><g stroke="#1d1916" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">` +
    `<path d="M23 96 L19 146 L30 146 L32 104 L34 146 L45 146 L41 96 Z" fill="#2b292c"/>` +
    `<path d="M13 48 Q32 37 51 48 L55 102 Q32 109 9 102 Z" fill="${coat}"/>` +
    `<path d="M32 50 L32 100" stroke-width="1.4" fill="none"/>` +
    (folder
      ? `<rect x="36" y="58" width="18" height="24" fill="#d9cfb8" transform="rotate(-10 45 70)"/>`
      : "") +
    `<circle cx="32" cy="27" r="15" fill="#e4d0ae"/>` +
    (hat
      ? `<path d="M15 20 L49 20 L45 13 Q32 2 19 13 Z" fill="#2b292c"/><path d="M9 21 L55 21" stroke-width="3"/>`
      : `<path d="M17 24 Q31 3 48 22 Q41 15 32 16 Q24 15 17 24Z" fill="#1d1916"/>`) +
    `<circle cx="38" cy="28" r="1.6" fill="#1d1916" stroke="none"/></g></svg>`
  );
}

/** A distant skyline along a far layer: generated towers, always as the Oracle draws them. */
export function skyline(
  content: VisualContent,
  spec: { recipe: string; style: string; seed: number; lot: readonly [number, number] },
  from: number,
  to: number,
  opts: DrawOptions = {},
): { x: number; drawing: Drawing }[] {
  const r = stream(spec.seed);
  const out: { x: number; drawing: Drawing }[] = [];
  for (let x = from; x < to;) {
    const lot = spec.lot[0] + Math.floor(r() * (spec.lot[1] - spec.lot[0] + 1));
    const seed = Math.floor(r() * 1e9);
    const form = resolve(content, {
      kind: "recipe",
      recipe: spec.recipe,
      style: spec.style,
      seed,
      lot,
      door: null,
      parts: [],
    });
    out.push({
      x: Math.round(x),
      drawing: drawFacade(form, "powered", "oracle", { ...opts, id: `sky${out.length}` }),
    });
    x += lot * (0.55 + r() * 0.7);
  }
  return out;
}

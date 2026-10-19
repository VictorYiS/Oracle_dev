// Draws the world onto a canvas: terrain, fog, resource nodes, buildings, units, the selection
// and the placement ghost. Pure drawing: no state, no events.
import type { PackIndex } from "../../core/world/pack-index";
import type { WorldView } from "../../core/world/types";
import type { Camera, Mode, Selection } from "./types";

export interface Palette {
  fog: string;
  grid: string;
  select: string;
  ghostOk: string;
  ghostBad: string;
  text: string;
}

export interface Scene {
  world: WorldView;
  ix: PackIndex;
  camera: Camera;
  selection: Selection;
  mode: Mode;
  hover: { x: number; y: number } | null;
  ghostOk: boolean;
  palette: Palette;
}

export function draw(g: CanvasRenderingContext2D, width: number, height: number, scene: Scene): void {
  const { world: w, ix, camera: cam, palette } = scene;
  const t = cam.tile;
  g.clearRect(0, 0, width, height);
  g.fillStyle = palette.fog;
  g.fillRect(0, 0, width, height);

  const x0 = Math.max(0, Math.floor(cam.x));
  const y0 = Math.max(0, Math.floor(cam.y));
  const x1 = Math.min(w.width - 1, Math.ceil(cam.x + width / t));
  const y1 = Math.min(w.height - 1, Math.ceil(cam.y + height / t));
  const px = (x: number) => (x - cam.x) * t;
  const py = (y: number) => (y - cam.y) * t;

  // Terrain (explored tiles only).
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tile = y * w.width + x;
      if (w.explored[tile] !== 1) continue;
      g.fillStyle = ix.terrain[w.terrain[tile] ?? 0]?.color ?? palette.fog;
      g.fillRect(px(x), py(y), t + 0.5, t + 0.5);
    }
  }
  if (t >= 14) {
    g.strokeStyle = palette.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      g.moveTo(Math.round(px(x)) + 0.5, py(y0));
      g.lineTo(Math.round(px(x)) + 0.5, py(y1 + 1));
    }
    for (let y = y0; y <= y1 + 1; y++) {
      g.moveTo(px(x0), Math.round(py(y)) + 0.5);
      g.lineTo(px(x1 + 1), Math.round(py(y)) + 0.5);
    }
    g.stroke();
  }

  g.textAlign = "center";
  g.textBaseline = "middle";
  const glyph = (ch: string, x: number, y: number, color: string, scale = 0.72) => {
    g.fillStyle = color;
    g.font = `${Math.round(t * scale)}px system-ui, "Segoe UI Symbol", "Noto Sans Symbols 2", sans-serif`;
    g.fillText(ch, px(x) + t / 2, py(y) + t / 2 + 1);
  };

  // Resource nodes.
  for (const n of w.nodes) {
    if (n.amount === 0 || w.explored[n.tile] !== 1) continue;
    const x = n.tile % w.width;
    const y = Math.floor(n.tile / w.width);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const def = ix.nodes.get(n.type);
    if (def) glyph(def.glyph, x, y, def.color);
  }

  // Buildings and sites.
  for (const b of w.buildings) {
    const def = ix.buildings.get(b.type);
    if (!def) continue;
    const bx = px(b.x);
    const by = py(b.y);
    if (b.complete) {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(bx + 1, by + 1, t - 2, t - 2);
      glyph(def.glyph, b.x, b.y, def.color, 0.8);
    } else {
      g.setLineDash([3, 3]);
      g.strokeStyle = def.color;
      g.lineWidth = 1.5;
      g.strokeRect(bx + 2, by + 2, t - 4, t - 4);
      g.setLineDash([]);
      glyph(def.glyph, b.x, b.y, def.color, 0.5);
      g.fillStyle = def.color;
      g.fillRect(bx + 2, by + t - 4, (t - 4) * (b.progress / def.build_ticks), 2);
    }
  }

  // Units.
  for (const u of w.units) {
    const def = ix.units.get(u.type);
    if (!def) continue;
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.beginPath();
    g.arc(px(u.x) + t / 2, py(u.y) + t / 2, t * 0.42, 0, Math.PI * 2);
    g.fill();
    glyph(def.glyph, u.x, u.y, u.disabledDays > 0 ? palette.grid : def.color, 0.66);
  }

  // Selection.
  const sel = scene.selection;
  const ring = (x: number, y: number) => {
    g.strokeStyle = palette.select;
    g.lineWidth = 2;
    g.strokeRect(px(x) + 1, py(y) + 1, t - 2, t - 2);
  };
  if (sel?.kind === "tile") ring(sel.x, sel.y);
  if (sel?.kind === "unit") {
    const u = w.units.find((v) => v.id === sel.id);
    if (u) {
      ring(u.x, u.y);
      if (u.path.length > 0) {
        g.fillStyle = palette.select;
        for (const step of u.path) {
          g.fillRect(px(step % w.width) + t / 2 - 1.5, py(Math.floor(step / w.width)) + t / 2 - 1.5, 3, 3);
        }
      }
    }
  }
  if (sel?.kind === "building") {
    const b = w.buildings.find((v) => v.id === sel.id);
    if (b) ring(b.x, b.y);
  }

  // Placement ghost.
  if (scene.mode?.kind === "place" && scene.hover) {
    const def = ix.buildings.get(scene.mode.building);
    if (def) {
      g.fillStyle = scene.ghostOk ? palette.ghostOk : palette.ghostBad;
      g.fillRect(px(scene.hover.x), py(scene.hover.y), t, t);
      glyph(def.glyph, scene.hover.x, scene.hover.y, palette.text, 0.6);
    }
  }
}

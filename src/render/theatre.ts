// The paper theatre: a district drawn as upright cards at fixed depths, horizontal ground planes and
// solid passages, in real CSS perspective. Buildings are paper boxes: a facade card and two side
// faces from the same IR and the same state; an alley's walls are its neighbours' sides.
//
// The theatre only shows. It reads the world each frame (where the hero is, what the player
// remembers, what the records say) and never changes it: walking, crossing and deciding are
// commands the interface submits. Looking is the theatre's own business: the camera can go where
// the hero is not, and nothing in the world changes when it does.
import type { Building, Layer, Passage } from "../core/content/schema";
import type { PackIndex } from "../core/world/pack-index";
import { ends } from "../core/world/places";
import { memoryAge, memoryOf, shownState } from "../core/world/query";
import type { WorldView } from "../core/world/types";
import {
  drawFacade,
  drawFigure,
  drawSide,
  type Form,
  resolve,
  skyline,
  type VisualContent,
  type VisualIR,
} from "./compiler";
import { DEFS, f1 } from "./pen";
import {
  camFromMatrix,
  camText,
  EASE,
  GROUND,
  PERSPECTIVE,
  type Cam,
  type Shot,
  SKY_GROUND,
  solve,
  STAGE_H,
} from "./geometry";

export type LookTarget =
  | { kind: "layer"; layer: string; x: number }
  | { kind: "alley"; passage: string }
  | { kind: "sky"; layer: string; x: number };

export interface Hit {
  kind: "building" | "prop" | "passage" | "window" | "ground";
  layer: string;
  x: number;
  id: string;
}

export interface TheatreOptions {
  reduceMotion: boolean;
  /** Resolve a pack text key in the current language. */
  text: (ref: string) => string;
  /**
   * Draw into bitmaps instead of keeping live SVG. Some engines redraw every vector shape on every
   * frame while the camera moves through 3D; a bitmap is drawn once. Costs memory and a little sharpness.
   */
  bitmaps?: boolean;
}

interface Face {
  el: HTMLElement;
  face: HTMLElement;
}

interface BuildingView {
  def: Building;
  form: Form;
  card: Face;
  sides: (Face & { side: "left" | "right"; depth: number })[];
  key: string;
  attrs: string;
}

interface FigureView {
  el: HTMLElement;
  layer: string | null;
}

const ids = new WeakMap<object, number>();
let idCounter = 0;
const uid = (o: object) => {
  if (!ids.has(o)) ids.set(o, ++idCounter);
  return ids.get(o)!;
};

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

/** Widest bitmap piece, in pixels: very wide textures are slow or refused on some GPUs. */
const TILE_PX = 2048;

/** Put a drawing into an element: as live SVG, or once into bitmaps at `scale` pixels per unit. */
function place(el: HTMLElement, svg: string, w: number, h: number, bitmapScale: number | null): void {
  if (bitmapScale === null) {
    el.innerHTML = svg;
    return;
  }
  const pxW = Math.max(1, Math.ceil(w * bitmapScale));
  const pxH = Math.max(1, Math.ceil(h * bitmapScale));
  const pieces = Math.ceil(pxW / TILE_PX);
  const holder = document.createElement("div");
  holder.className = "pt-bitmap";
  holder.style.width = `${f1(w)}px`;
  holder.style.height = `${f1(h)}px`;
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < pieces; i++) {
    const c = document.createElement("canvas");
    c.width = Math.min(TILE_PX, pxW - i * TILE_PX);
    c.height = pxH;
    c.style.width = `${f1(c.width / bitmapScale)}px`;
    c.style.height = `${f1(h)}px`;
    canvases.push(c);
    holder.appendChild(c);
  }
  const img = new Image();
  img.onload = () => {
    canvases.forEach((c, i) =>
      c
        .getContext("2d")
        ?.drawImage(img, (i * TILE_PX) / bitmapScale, 0, c.width / bitmapScale, h, 0, 0, c.width, c.height),
    );
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  el.replaceChildren(holder);
}

/** Visual durations, in ms. */
const MS = { bridge: 1400, stairs: 1000, alley: 1300, door: 1000, look: 850, sky: 1000, back: 800 } as const;

export class Theatre {
  readonly viewport: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly world: HTMLElement;
  private readonly ix: PackIndex;
  private readonly content: VisualContent;
  private opts: TheatreOptions;
  private layerEls = new Map<string, HTMLElement>();
  private groups = new Map<string, HTMLElement[]>();
  private shownGroups = new Set<string>();
  private buildings = new Map<string, BuildingView>();
  private props: { el: HTMLElement; landmark: string; seed: number }[] = [];
  private figures = new Map<string, FigureView>();
  private hero: HTMLElement;
  private heroLayer: string;
  private anchors = new Map<string, number>();
  private width = 1280;
  private scale = 1;
  /** Pixels per stage unit for bitmaps (null: live SVG). */
  private bitmapScale: number | null = null;
  private cam: Cam = { tx: 0, ty: 0, cz: 0 };
  private camAnim: Animation | null = null;
  private looks: LookTarget[] = [];
  private zoom = 0;
  private busyCount = 0;
  private lastFrame = 0;
  private heroX = 0;
  private alleys = new Map<string, { x0: number; x1: number; depth: number; back: number }>();
  /** Cards that can be left undrawn while they are out of the camera's view. */
  private cullable: { els: HTMLElement[]; depth: number; x0: number; x1: number; out: boolean }[] = [];

  constructor(host: HTMLElement, ix: PackIndex, opts: TheatreOptions) {
    this.ix = ix;
    this.opts = opts;
    this.content = { styles: ix.styles, recipes: ix.recipes, parts: ix.parts, landmarks: ix.landmarks };
    this.frame = document.createElement("div");
    this.frame.className = "pt-frame";
    this.viewport = document.createElement("div");
    this.viewport.id = "viewport";
    this.viewport.className = "pt-viewport";
    this.world = document.createElement("div");
    this.world.className = "pt-world";
    this.viewport.appendChild(this.world);
    this.frame.appendChild(this.viewport);
    // The hatch, the Oracle's gradients and the lamp glow, shared by every drawing on the stage.
    const defs = document.createElement("div");
    defs.className = "pt-defs";
    defs.innerHTML = `<svg width="0" height="0" aria-hidden="true"><defs>${DEFS}</defs></svg>`;
    this.frame.appendChild(defs);
    host.appendChild(this.frame);
    if (opts.bitmaps) {
      const scale = (host.clientHeight || STAGE_H) / STAGE_H;
      this.bitmapScale = Math.min(2, Math.max(1, (globalThis.devicePixelRatio || 1) * scale));
    }
    const start = ix.pack.start.hero;
    this.heroLayer = start.layer;
    this.heroX = start.x;
    this.build();
    this.hero = this.figure("hero", start.look.coat, start.look.hat, true);
    this.hero.dataset.testid = "hero";
    this.hero.classList.add("hero");
    this.putFigure(this.hero, start.layer, start.x);
    this.resize(host.clientWidth || 1280, host.clientHeight || 720);
    this.applyVisibility(true);
    this.setCam(this.shotFor(this.heroLayer, this.heroX), 0);
  }

  // ---- building the stage ------------------------------------------------------------------

  private group(key: string, el: HTMLElement): void {
    el.dataset.group = key;
    const list = this.groups.get(key) ?? [];
    list.push(el);
    this.groups.set(key, list);
  }

  private plane(
    group: string,
    x: number,
    y: number,
    w: number,
    h: number,
    transform: string,
    cls: string,
  ): HTMLElement {
    const d = document.createElement("div");
    d.className = `pt-plane ${cls}`;
    d.style.cssText = `left:${f1(x)}px;top:${f1(y)}px;width:${f1(w)}px;height:${f1(h)}px;transform:${transform}`;
    this.world.appendChild(d);
    this.group(group, d);
    return d;
  }

  /** A horizontal surface at height y, from depth `near` back to `far`. */
  private floor(
    group: string,
    x: number,
    w: number,
    y: number,
    near: number,
    far: number,
    cls: string,
  ): HTMLElement {
    return this.plane(group, x, y, w, near - far, `translateZ(${near}px) rotateX(-90deg)`, cls);
  }

  /** A wall running back into depth at x, from depth z for `depth` units. */
  private wall(
    group: string,
    x: number,
    y: number,
    h: number,
    z: number,
    depth: number,
    cls: string,
  ): HTMLElement {
    return this.plane(group, x, y, depth, h, `translateZ(${z}px) rotateY(90deg)`, cls);
  }

  private card(layer: string, x: number, y: number, w: number, h: number, cls: string): HTMLElement {
    const d = document.createElement("div");
    d.className = `pt-obj ${cls}`;
    d.style.cssText = `left:${f1(x)}px;top:${f1(y)}px;width:${f1(w)}px;height:${f1(h)}px`;
    this.layerEls.get(layer)!.appendChild(d);
    return d;
  }

  private irFor(b: Building): VisualIR {
    if ("landmark" in b.look) return { kind: "landmark", landmark: b.look.landmark, seed: fnv(b.id) };
    const door = this.ix.pack.passages.find(
      (p) => p.kind === "door" && p.from.layer === b.layer && p.from.x >= b.x && p.from.x <= b.x + b.width,
    );
    const district = this.ix.districts.get(this.ix.districtOf.get(b.id) ?? "");
    return {
      kind: "recipe",
      recipe: b.look.recipe,
      style: b.look.style ?? district?.style ?? "",
      seed: b.look.seed,
      lot: b.width,
      door: door ? door.from.x - b.x : null,
      parts: b.look.parts,
    };
  }

  private build(): void {
    const { ix } = this;
    // Layers: flat containers at their depth. Interiors sit behind the door that leads in.
    for (const p of ix.pack.passages) {
      const to = ix.layers.get(p.to.layer);
      const scene = to ? ix.scenes.get(to.scene) : undefined;
      if (scene?.kind === "interior") this.anchors.set(to!.id, p.from.x - p.to.x);
    }
    for (const layer of [...ix.layers.values()].sort((a, b) => a.depth - b.depth)) {
      const el = document.createElement("div");
      el.className = "pt-layer";
      el.dataset.layer = layer.id;
      el.style.transform = `translate3d(${this.anchors.get(layer.id) ?? 0}px,0,${layer.depth}px)`;
      this.world.appendChild(el);
      this.layerEls.set(layer.id, el);
      this.group(layer.id, el);
    }
    for (const scene of ix.pack.scenes) {
      const [left, right] = scene.extent;
      if (scene.kind === "interior") {
        const layer = ix.sceneLayers.get(scene.id)?.[0];
        const lm = scene.backdrop ? ix.landmarks.get(scene.backdrop) : undefined;
        if (layer && lm) {
          const el = this.card(layer.id, -lm.width / 2, GROUND - 600, lm.width, lm.height, "pt-backdrop");
          el.dataset.ground = layer.id;
          el.dataset.left = String(-lm.width / 2);
          this.props.push({ el, landmark: lm.id, seed: fnv(scene.id) });
        }
        continue;
      }
      for (const g of scene.grounds) {
        const el = this.floor(
          g.layer,
          left,
          right - left,
          GROUND + g.drop,
          g.near,
          g.far,
          `pt-ground pt-${g.kind}`,
        );
        if (ix.layers.get(g.layer)?.walk && g.kind !== "water") {
          el.dataset.ground = g.layer;
          el.dataset.left = String(left);
        }
      }
      // The distant skyline.
      for (const layer of ix.layers.values()) {
        if (layer.scene !== scene.id || layer.kind !== "far" || !layer.skyline) continue;
        this.card(layer.id, left * 1.6, SKY_GROUND - 90, (right - left) * 2, 500, "pt-haze");
        for (const { x, drawing } of skyline(this.content, layer.skyline, left * 1.6, right * 1.2, {
          standalone: this.bitmapScale !== null,
        })) {
          const el = this.card(
            layer.id,
            x,
            SKY_GROUND - drawing.height,
            drawing.width,
            drawing.height,
            "pt-tower",
          );
          this.cullable.push({ els: [el], depth: layer.depth, x0: x, x1: x + drawing.width, out: false });
          // The skyline is never seen closer than about half size.
          place(el, drawing.svg, drawing.width, drawing.height, this.bitmapScale && this.bitmapScale * 0.6);
          el.dataset.look = layer.id;
          el.dataset.x = String(Math.round(x + drawing.width / 2));
        }
        this.card(layer.id, left * 1.6, SKY_GROUND - 420, (right - left) * 2, 440, "pt-fog");
      }
    }
    for (const b of ix.pack.buildings) this.buildBuilding(b);
    for (const p of ix.pack.passages) this.buildPassage(p);
    for (const prop of ix.pack.props) {
      const lm = ix.landmarks.get(prop.landmark);
      if (!lm) continue;
      const el = this.card(
        prop.layer,
        prop.x - lm.width / 2,
        GROUND - lm.height + prop.y,
        lm.width,
        lm.height,
        "pt-prop",
      );
      if (!this.anchors.has(prop.layer) && lm.width < 1000)
        this.cullable.push({
          els: [el],
          depth: ix.layers.get(prop.layer)?.depth ?? 0,
          x0: prop.x - lm.width / 2,
          x1: prop.x + lm.width / 2,
          out: false,
        });
      const layer = ix.layers.get(prop.layer);
      if (layer?.kind === "near") el.classList.add("pt-near");
      else {
        el.dataset.prop = prop.id;
        el.dataset.x = String(prop.x);
        el.dataset.look = prop.layer;
      }
      if (ix.window.layer === prop.layer && Math.abs(ix.window.x - prop.x) <= ix.window.reach)
        el.dataset.window = "1";
      this.props.push({ el, landmark: lm.id, seed: fnv(prop.id) });
    }
    this.paintProps();
  }

  private buildBuilding(b: Building): void {
    const form = resolve(this.content, this.irFor(b));
    const top = GROUND - form.height;
    const el = this.card(b.layer, b.x, top, form.width, form.height, "pt-bld");
    el.dataset.building = b.id;
    el.dataset.look = b.layer;
    el.dataset.x = String(Math.round(b.x + form.width / 2));
    const face = document.createElement("div");
    face.className = "pt-face";
    el.appendChild(face);
    const door = this.ix.pack.passages.find(
      (p) => p.kind === "door" && p.from.layer === b.layer && p.from.x >= b.x && p.from.x <= b.x + b.width,
    );
    if (door && form.doorX !== null) {
      const hot = document.createElement("div");
      hot.className = "pt-hot pt-door";
      hot.dataset.passage = door.id;
      hot.dataset.x = String(door.from.x);
      hot.style.cssText = `left:${f1(form.doorX - 22)}px;top:${f1(form.height - Math.max(40, form.doorH))}px;width:44px;height:${f1(Math.max(40, form.doorH))}px`;
      el.appendChild(hot);
    }
    const layer = this.ix.layers.get(b.layer)!;
    const alley = this.ix.pack.passages.find(
      (p) =>
        p.kind === "alley" &&
        p.from.layer === b.layer &&
        (Math.abs(p.from.x - (b.x + b.width)) < p.width || Math.abs(p.from.x - b.x) < p.width),
    );
    const depth = Math.max(b.depth, alley ? alley.length + 14 : 0);
    const wallH = form.height - form.body.top;
    const sides: BuildingView["sides"] = [];
    for (const side of ["left", "right"] as const) {
      const sx = b.x + (side === "left" ? form.body.x0 : form.body.x1);
      const w = this.wall(b.layer, sx, GROUND - wallH, wallH, layer.depth, depth, "pt-side");
      w.dataset.face = side;
      w.dataset.building = b.id;
      w.dataset.look = b.layer;
      w.dataset.x = String(Math.round(b.x + form.width / 2));
      const f = document.createElement("div");
      f.className = "pt-face";
      w.appendChild(f);
      sides.push({ el: w, face: f, side, depth });
    }
    this.buildings.set(b.id, { def: b, form, card: { el, face }, sides, key: "", attrs: "" });
    this.cullable.push({
      els: [el, ...sides.map((s) => s.el)],
      depth: layer.depth,
      x0: b.x - 40,
      x1: b.x + form.width + 40,
      out: false,
    });
  }

  private buildPassage(p: Passage): void {
    const ix = this.ix;
    const from = ix.layers.get(p.from.layer)!;
    const to = ix.layers.get(p.to.layer)!;
    const inner = ix.scenes.get(to.scene)?.kind === "interior";
    const near = from.depth >= to.depth ? from : to;
    const far = near === from ? to : from;
    const nearEnd = near === from ? p.from : p.to;
    const farEnd = near === from ? p.to : p.from;
    if (p.kind === "bridge" || p.kind === "stairs") {
      const x = (nearEnd.x + farEnd.x) / 2 - p.width / 2;
      const z0 = near.depth - 8;
      const z1 = far.depth + 90;
      this.floor(far.id, x, p.width, GROUND - 3, z0, z1, p.kind === "bridge" ? "pt-deck" : "pt-steps");
      if (p.kind === "bridge") {
        const len = z0 - z1;
        let s = `<svg width="${f1(len)}" height="48" viewBox="0 0 ${f1(len)} 48" xmlns="http://www.w3.org/2000/svg"><g stroke="#1d1916" fill="none" stroke-linecap="round">`;
        s += `<path d="M0 30 Q${f1(len / 2)} 4 ${f1(len)} 30" stroke-width="5"/><path d="M0 40 Q${f1(len / 2)} 18 ${f1(len)} 40" stroke-width="2.5"/>`;
        for (let xx = 0; xx <= len; xx += 38) {
          const t = xx / len;
          s += `<path d="M${f1(xx)} ${f1(30 - 26 * 4 * t * (1 - t))} L${f1(xx)} 48" stroke-width="3"/>`;
        }
        s += "</g></svg>";
        for (const rx of [x, x + p.width])
          place(this.wall(far.id, rx, GROUND - 48, 48, z0, len, "pt-rail"), s, len, 48, this.bitmapScale);
      }
    }
    if (p.kind === "alley") {
      // The alley runs back between two buildings; their side faces are its walls.
      const row = ix.rows.get(p.from.layer) ?? [];
      const left = [...row].reverse().find((b) => b.x + b.width <= p.from.x);
      const right = row.find((b) => b.x >= p.from.x);
      const lv = left ? this.buildings.get(left.id) : undefined;
      const rv = right ? this.buildings.get(right.id) : undefined;
      const x0 = lv ? lv.def.x + lv.form.body.x1 : p.from.x - p.width / 2;
      const x1 = rv ? rv.def.x + rv.form.body.x0 : p.from.x + p.width / 2;
      const back = from.depth - p.length;
      this.floor(from.id, x0, x1 - x0, GROUND, from.depth, back, "pt-alley-floor");
      const wallH = Math.min(
        lv ? lv.form.height - lv.form.body.top : 300,
        rv ? rv.form.height - rv.form.body.top : 300,
      );
      const end = document.createElement("div");
      end.className = "pt-plane pt-alley-end";
      end.style.cssText = `left:${f1(x0)}px;top:${f1(GROUND - wallH)}px;width:${f1(x1 - x0)}px;height:${f1(wallH)}px;transform:translateZ(${back}px)`;
      end.dataset.look = `alley:${p.id}`;
      this.world.appendChild(end);
      this.group(from.id, end);
      this.alleys.set(p.id, { x0, x1, depth: from.depth, back });
    }
    // Where you step onto it: a hotspot at each outdoor end.
    for (const e of [p.from, p.to]) {
      const layer = ix.layers.get(e.layer)!;
      if (ix.scenes.get(layer.scene)?.kind === "interior" && !inner) continue;
      if (p.kind === "door" && e === p.from) continue; // the door itself is the hotspot
      const hot = this.card(
        e.layer,
        e.x - 60,
        GROUND - (p.kind === "alley" ? 120 : 50),
        120,
        p.kind === "alley" ? 120 : 50,
        "pt-hot",
      );
      hot.dataset.passage = p.id;
      hot.dataset.x = String(e.x);
      if (p.kind === "alley" && e === p.from) hot.dataset.look = `alley:${p.id}`;
    }
  }

  private figure(key: string, coat: string, hat: boolean, folder: boolean): HTMLElement {
    const el = document.createElement("div");
    el.className = "pt-obj pt-figure";
    el.dataset.person = key;
    const flip = document.createElement("div");
    flip.className = "pt-flip";
    place(flip, drawFigure(coat, hat, folder), 64, 150, this.bitmapScale);
    el.appendChild(flip);
    return el;
  }

  /**
   * Stand a figure on a layer. Figures are planes of their own in the 3D world rather than part of
   * a layer's card: a walking figure then never makes the browser redraw the whole layer.
   */
  private putFigure(el: HTMLElement, layer: string, x: number): void {
    const l = this.ix.layers.get(layer);
    if (!l) return;
    if (el.parentElement !== this.world) this.world.appendChild(el);
    const at = (this.anchors.get(layer) ?? 0) + x - 32;
    const transform = `translate3d(${f1(at)}px,${GROUND - 150}px,${l.depth}px)`;
    if (el.style.transform !== transform) el.style.transform = transform;
    const shown = this.shownGroups.has(layer);
    if (el.classList.contains("pt-gone") === shown) el.classList.toggle("pt-gone", !shown);
    el.dataset.layer = layer;
    el.dataset.x = String(Math.round(x));
  }

  // ---- painting ------------------------------------------------------------------------------

  private paintProps(): void {
    for (const p of this.props) {
      const lm = this.ix.landmarks.get(p.landmark)!;
      const form = resolve(this.content, { kind: "landmark", landmark: lm.id, seed: p.seed });
      const d = drawFacade(form, "powered", "ink", {
        text: this.opts.text,
        id: `p${uid(p.el)}`,
        standalone: this.bitmapScale !== null,
      });
      place(p.el, d.svg, d.width, d.height, this.bitmapScale);
    }
  }

  private paint(
    v: BuildingView,
    style: "ink" | "oracle",
    state: Parameters<typeof drawFacade>[1],
    reveal: number | null,
  ): void {
    const id = `b${uid(v.card.el)}`;
    const standalone = this.bitmapScale !== null;
    const swap = (target: Face, d: { svg: string; width: number; height: number }) => {
      if (reveal !== null && !this.opts.reduceMotion) {
        const old = target.face.cloneNode(true) as HTMLElement;
        old.classList.add("pt-old");
        old.removeAttribute("data-style");
        old.removeAttribute("data-state");
        target.el.insertBefore(old, target.face);
        place(target.face, d.svg, d.width, d.height, this.bitmapScale);
        const a = target.face.animate(
          [{ clipPath: `circle(0% at ${reveal}% 100%)` }, { clipPath: `circle(150% at ${reveal}% 100%)` }],
          { duration: 900, easing: "ease-out" },
        );
        a.onfinish = a.oncancel = () => old.remove();
      } else {
        place(target.face, d.svg, d.width, d.height, this.bitmapScale);
      }
      target.face.dataset.style = style;
      target.face.dataset.state = state;
    };
    swap(v.card, drawFacade(v.form, state, style, { text: this.opts.text, id, standalone }));
    for (const s of v.sides)
      swap(s, drawSide(v.form, state, style, s.depth, s.side, { id: `${id}${s.side[0]}`, standalone }));
  }

  private syncBuildings(w: WorldView): void {
    for (const [id, v] of this.buildings) {
      const shown = shownState(w, id);
      const key = `${shown.style}:${shown.state}`;
      const memory = memoryOf(w, id);
      const age = memoryAge(w, id);
      if (key !== v.key) {
        const near = age === 0 && v.key !== "";
        const reveal = near ? Math.max(0, Math.min(100, ((this.heroX - v.def.x) / v.def.width) * 100)) : null;
        this.paint(v, shown.style, shown.state, reveal);
        v.key = key;
      }
      const attrs = `${memory ? 1 : 0}:${memory?.day ?? ""}:${age ?? ""}`;
      if (attrs !== v.attrs) {
        v.attrs = attrs;
        const seen = String(Boolean(memory));
        const day = memory ? String(memory.day) : "";
        const ageText = age === null ? "" : String(age);
        v.card.el.dataset.seen = seen;
        v.card.el.dataset.seenDay = day;
        v.card.el.dataset.age = ageText;
        for (const s of v.sides) s.el.dataset.age = ageText;
      }
    }
  }

  // ---- figures --------------------------------------------------------------------------------

  private syncFigures(w: WorldView, frac: number): void {
    const scene = this.ix.layers.get(this.heroLayer)?.scene;
    const speed = this.ix.params.resident_speed;
    for (const r of w.residents) {
      let fig = this.figures.get(r.id);
      const visible = r.here && r.scene === scene && !(r.legs[0] && "cross" in r.legs[0]);
      if (!visible) {
        if (fig?.layer) {
          fig.el.remove();
          fig.layer = null;
        }
        continue;
      }
      if (!fig) {
        const def = this.ix.residents.get(r.id);
        fig = {
          el: this.figure(r.id, def?.look.coat ?? "#5b6470", def?.look.hat ?? false, false),
          layer: null,
        };
        fig.el.classList.add("pt-npc");
        this.figures.set(r.id, fig);
      }
      const leg = r.legs[0];
      let x = r.x;
      if (leg && "walk" in leg) {
        const dx = leg.walk - r.x;
        x += Math.sign(dx) * Math.min(Math.abs(dx), speed * frac);
        fig.el.firstElementChild?.setAttribute("style", `transform:scaleX(${dx < 0 ? -1 : 1})`);
      }
      this.putFigure(fig.el, r.layer, x);
      fig.layer = r.layer;
    }
  }

  // ---- camera --------------------------------------------------------------------------------

  private shotFor(layer: string, x: number): Shot {
    const l = this.ix.layers.get(layer)!;
    const anchor = this.anchors.get(layer);
    if (anchor !== undefined)
      return { z: l.depth, k: 1, x: anchor + Math.max(-160, Math.min(160, x)), y: GROUND, ys: GROUND };
    const [lo, hi] = l.walk ?? [x, x];
    return { z: l.depth, k: 1 + this.zoom, x: Math.max(lo, Math.min(hi, x)), y: GROUND, ys: GROUND };
  }

  private shotForLook(t: LookTarget): Shot {
    if (t.kind === "sky")
      return { z: this.ix.layers.get(t.layer)!.depth, k: 0.6, x: t.x, y: SKY_GROUND, ys: 640 };
    if (t.kind === "alley") {
      const a = this.alleys.get(t.passage)!;
      return { z: a.back, k: 1.15, x: (a.x0 + a.x1) / 2, y: GROUND - 60, ys: 470 };
    }
    return { z: this.ix.layers.get(t.layer)!.depth, k: 1, x: t.x, y: GROUND, ys: GROUND };
  }

  private currentShot(): Shot {
    const look = this.looks.at(-1);
    return look ? this.shotForLook(look) : this.shotFor(this.heroLayer, this.heroX);
  }

  private setCam(shot: Shot, ms: number): Promise<void> {
    const to = solve(shot, this.width / 2);
    if (this.camAnim) {
      this.cam = camFromMatrix(new DOMMatrixReadOnly(getComputedStyle(this.world).transform));
      this.camAnim.cancel();
      this.camAnim = null;
      this.world.style.transform = camText(this.cam);
    }
    if (ms <= 0 || this.opts.reduceMotion) {
      this.cam = to;
      this.world.style.transform = camText(to);
      return Promise.resolve();
    }
    return new Promise((done) => {
      const a = this.world.animate([{ transform: camText(this.cam) }, { transform: camText(to) }], {
        duration: ms,
        easing: EASE,
        fill: "forwards",
      });
      this.camAnim = a;
      const finish = () => {
        if (this.camAnim === a) {
          this.cam = to;
          this.world.style.transform = camText(to);
          this.camAnim = null;
        }
        a.cancel();
        done();
      };
      a.onfinish = finish;
      a.oncancel = () => done();
    });
  }

  // ---- what can be seen from here --------------------------------------------------------------

  private visibleSet(layerId: string, look: LookTarget | undefined): Set<string> {
    const at = this.ix.layers.get(layerId)!;
    const scene = this.ix.scenes.get(at.scene)!;
    if (scene.kind === "interior") return new Set([at.id]);
    const layers = [...this.ix.layers.values()].filter((l) => l.scene === scene.id);
    if (look?.kind === "sky") return new Set(layers.filter((l) => l.kind === "far").map((l) => l.id));
    const focus =
      look?.kind === "layer"
        ? this.ix.layers.get(look.layer)!.depth
        : look?.kind === "alley"
          ? this.ix.layers.get(this.ix.passages.get(look.passage)!.from.layer)!.depth
          : at.depth;
    const front = Math.max(...layers.filter((l) => l.kind === "walk").map((l) => l.depth));
    return new Set(
      layers
        .filter((l) => (l.kind === "near" ? !look && at.depth === front : l.depth <= focus))
        .map((l) => l.id),
    );
  }

  private applyVisibility(instant: boolean, leaving: Set<string> = new Set()): void {
    const want = this.visibleSet(this.heroLayer, this.looks.at(-1));
    for (const [key, els] of this.groups) {
      const show = want.has(key);
      const wasShown = this.shownGroups.has(key);
      if (show === wasShown && !instant) continue;
      for (const el of els) {
        el.classList.toggle("pt-off", !show && !instant && !leaving.has(key) && !this.opts.reduceMotion);
        el.classList.toggle("pt-gone", !show && (instant || leaving.has(key) || this.opts.reduceMotion));
        if (show) {
          el.classList.remove("pt-off");
          el.classList.remove("pt-gone");
        }
      }
      if (show) this.shownGroups.add(key);
      else this.shownGroups.delete(key);
    }
    this.viewport.dataset.at = this.heroLayer;
    this.viewport.dataset.focus = this.focus;
    this.refreshFigures();
  }

  /**
   * Leave undrawn whatever lies outside every one of these camera shots (a move's start and end:
   * everything it passes through lies between them). Less to draw, on every frame of the move.
   */
  private cull(shots: Shot[]): void {
    const half = this.width / 2;
    for (const c of this.cullable) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const shot of shots) {
        // Width of the view, in world units, at this card's depth.
        const w = (half * (PERSPECTIVE / shot.k - c.depth + shot.z)) / PERSPECTIVE + 240;
        lo = Math.min(lo, shot.x - w);
        hi = Math.max(hi, shot.x + w);
      }
      const out = c.x1 < lo || c.x0 > hi;
      if (out !== c.out) {
        c.out = out;
        for (const el of c.els) el.classList.toggle("pt-culled", out);
      }
    }
  }

  /** Figures show and hide with the layer they stand on. */
  private refreshFigures(): void {
    for (const el of [this.hero, ...[...this.figures.values()].map((f) => f.el)]) {
      const layer = el?.dataset.layer;
      if (!layer || el.parentElement !== this.world || el.getAnimations().length > 0) continue;
      el.classList.toggle("pt-gone", !this.shownGroups.has(layer));
    }
  }

  /** Change what is shown: groups in front of the new view vanish at once, new ones fade in partway. */
  private async transit(ms: number, mutate: () => void, shot?: Shot): Promise<void> {
    const before = this.visibleSet(this.heroLayer, this.looks.at(-1));
    const from = this.currentShot();
    mutate();
    this.cull([from, shot ?? this.currentShot()]);
    const after = this.visibleSet(this.heroLayer, this.looks.at(-1));
    const newDepth = (shot ?? this.currentShot()).z;
    const passed = new Set(
      [...before].filter((g) => !after.has(g) && (this.ix.layers.get(g)?.depth ?? -Infinity) > newDepth),
    );
    // Hide what is leaving now; show what arrives a little into the move.
    for (const [key, els] of this.groups) {
      if (before.has(key) && !after.has(key)) {
        for (const el of els) {
          const instant = passed.has(key) || this.opts.reduceMotion;
          el.classList.toggle("pt-gone", instant);
          el.classList.toggle("pt-off", !instant);
        }
        this.shownGroups.delete(key);
      }
    }
    this.viewport.dataset.at = this.heroLayer;
    this.viewport.dataset.focus = this.focus;
    this.refreshFigures();
    const arriving = [...after].filter((g) => !before.has(g));
    const reveal = () => {
      for (const key of arriving) {
        for (const el of this.groups.get(key) ?? []) el.classList.remove("pt-off", "pt-gone");
        this.shownGroups.add(key);
      }
      this.refreshFigures();
    };
    if (this.opts.reduceMotion || ms <= 0) reveal();
    else setTimeout(reveal, ms * 0.45);
    await this.setCam(shot ?? this.currentShot(), ms);
    reveal();
  }

  private async busyWith(work: () => Promise<void>): Promise<void> {
    this.busyCount++;
    this.viewport.dataset.busy = "1";
    try {
      await work();
    } finally {
      this.busyCount--;
      if (this.busyCount === 0) delete this.viewport.dataset.busy;
    }
  }

  // ---- moving the hero between layers -------------------------------------------------------------

  private crossTo(layer: string, x: number, from: { layer: string; x: number }): Promise<void> {
    const passage = this.ix.pack.passages.find((p) => {
      const e = ends(p, from.layer);
      return e && e.there.layer === layer;
    });
    const fromLayer = this.ix.layers.get(from.layer)!;
    const toLayer = this.ix.layers.get(layer)!;
    const kind = passage?.kind;
    const indoors = (l: Layer) => this.ix.scenes.get(l.scene)?.kind === "interior";
    return this.busyWith(async () => {
      this.looks = [];
      this.zoom = 0;
      if (this.opts.reduceMotion || !passage) {
        this.heroLayer = layer;
        this.heroX = x;
        this.putFigure(this.hero, layer, x);
        this.hero.style.opacity = "1";
        this.applyVisibility(true);
        await this.setCam(this.shotFor(layer, x), 0);
        return;
      }
      if (kind === "door" || indoors(fromLayer) || indoors(toLayer)) {
        this.hero.style.opacity = "0";
        await this.transit(MS.door, () => {
          this.heroLayer = layer;
          this.heroX = x;
        });
        this.putFigure(this.hero, layer, x);
        this.hero.style.opacity = "1";
        return;
      }
      // Walk the passage in depth: the figure leaves its layer and crosses in 3D.
      const ms = kind === "bridge" ? MS.bridge : MS.stairs;
      const fromX = from.x - 32;
      const toX = x - 32;
      const top = GROUND - 150;
      this.hero.style.opacity = "1";
      this.hero.classList.remove("pt-gone");
      const walk = this.hero.animate(
        [
          { transform: `translate3d(${fromX}px,${top}px,${fromLayer.depth}px)` },
          { transform: `translate3d(${toX}px,${top}px,${toLayer.depth}px)` },
        ],
        { duration: ms, easing: EASE, fill: "forwards" },
      );
      this.hero.classList.add("pt-walk");
      await this.transit(ms, () => {
        this.heroLayer = layer;
        this.heroX = x;
      });
      walk.cancel();
      this.hero.classList.remove("pt-walk");
      this.putFigure(this.hero, layer, x);
    });
  }

  // ---- public ----------------------------------------------------------------------------------

  get busy(): boolean {
    return this.busyCount > 0;
  }

  get looking(): boolean {
    return this.looks.length > 0;
  }

  /** The layer (or alley) the camera is on. */
  get focus(): string {
    const look = this.looks.at(-1);
    if (!look) return this.heroLayer;
    return look.kind === "alley" ? look.passage : look.layer;
  }

  get at(): string {
    return this.heroLayer;
  }

  /** Where the hero is drawn right now (between ticks while walking). */
  get heroDrawnX(): number {
    return this.heroX;
  }

  setOptions(opts: Partial<TheatreOptions>): void {
    const textChanged = opts.text && opts.text !== this.opts.text;
    this.opts = { ...this.opts, ...opts };
    this.viewport.classList.toggle("pt-reduce", this.opts.reduceMotion);
    if (textChanged) {
      // Signs are text: redraw them now, so the stage never shows two languages at once.
      this.paintProps();
      for (const v of this.buildings.values()) {
        if (v.form.grammar !== "landmark" || !v.key) continue;
        const [style, state] = v.key.split(":") as ["ink" | "oracle", Parameters<typeof drawFacade>[1]];
        this.paint(v, style, state, null);
      }
    }
  }

  resize(width: number, height: number): void {
    this.scale = Math.max(0.1, height / STAGE_H);
    this.width = Math.max(200, width / this.scale);
    this.frame.style.width = `${f1(this.width)}px`;
    this.frame.style.height = `${STAGE_H}px`;
    this.frame.style.transform = `scale(${this.scale})`;
    this.viewport.style.perspective = `${PERSPECTIVE}px`;
    this.viewport.style.perspectiveOrigin = `${f1(this.width / 2)}px 300px`;
    if (!this.busy) void this.setCam(this.currentShot(), 0);
  }

  /** Draw the world as it is now. `frac` is how far the clock is into the next tick (for smooth walking). */
  sync(w: WorldView, frac: number, now = performance.now()): void {
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    const h = w.hero;
    if (h.layer !== this.heroLayer && !this.busy) {
      void this.crossTo(h.layer, h.x, { layer: this.heroLayer, x: this.heroX });
    }
    if (this.busy) return;
    let x = h.x;
    if (h.target !== null) {
      const dx = h.target - h.x;
      x += Math.sign(dx) * Math.min(Math.abs(dx), this.ix.params.hero_speed * frac);
    }
    const moving = Math.abs(x - this.heroX) > 0.5;
    if (moving)
      this.hero.firstElementChild?.setAttribute("style", `transform:scaleX(${x < this.heroX ? -1 : 1})`);
    this.hero.classList.toggle("pt-walk", moving && !this.opts.reduceMotion);
    this.heroX = x;
    this.putFigure(this.hero, h.layer, x);
    this.hero.style.opacity = this.looking ? "0" : "1";
    this.syncBuildings(w);
    this.syncFigures(w, frac);
    if (!this.camAnim && !this.looking) {
      this.cull([this.shotFor(this.heroLayer, this.heroX)]);
      const target = solve(this.shotFor(this.heroLayer, this.heroX), this.width / 2);
      if (Math.abs(target.cz - this.cam.cz) > 0.5 || Math.abs(target.ty - this.cam.ty) > 0.5) {
        void this.setCam(this.shotFor(this.heroLayer, this.heroX), 320);
      } else if (Math.abs(target.tx - this.cam.tx) > 0.05) {
        const k = this.opts.reduceMotion ? 1 : 1 - Math.exp(-dt * 6);
        this.cam.tx += (target.tx - this.cam.tx) * k;
        this.world.style.transform = camText(this.cam);
      }
    }
  }

  /** What looking at this element would show, if anything (wheel up on it). */
  lookTargetAt(el: Element | null): LookTarget | null {
    const t = el?.closest<HTMLElement>("[data-look]");
    if (!t) return null;
    const look = t.dataset.look!;
    if (look.startsWith("alley:")) return { kind: "alley", passage: look.slice("alley:".length) };
    const layer = this.ix.layers.get(look);
    if (!layer) return null;
    const x = Number(t.dataset.x ?? 0);
    return layer.kind === "far" ? { kind: "sky", layer: layer.id, x } : { kind: "layer", layer: layer.id, x };
  }

  /** May the camera go there from here? Only deeper than it is now, and only in this scene. */
  canLook(t: LookTarget): boolean {
    if (this.busy) return false;
    const at = this.ix.layers.get(this.heroLayer)!;
    if (this.ix.scenes.get(at.scene)?.kind === "interior") return false;
    const current = this.looks.at(-1);
    if (current?.kind === "sky") return false;
    const focusDepth = this.currentShot().z;
    const depth = t.kind === "alley" ? this.alleys.get(t.passage)!.back : this.ix.layers.get(t.layer)!.depth;
    const layer = t.kind === "alley" ? this.ix.passages.get(t.passage)!.from.layer : t.layer;
    return depth < focusDepth - 1 && this.ix.layers.get(layer)?.scene === at.scene;
  }

  /** Where W (or ⊕) looks: into an alley you stand at the mouth of, else the next layer back. */
  autoLook(): LookTarget | null {
    const at = this.ix.layers.get(this.heroLayer)!;
    const focus = this.currentShot();
    if (!this.looking) {
      for (const [id, a] of this.alleys) {
        const p = this.ix.passages.get(id)!;
        if (p.from.layer === at.id && this.heroX >= a.x0 - 120 && this.heroX <= a.x1 + 120)
          return { kind: "alley", passage: id };
      }
    }
    const deeper = [...this.ix.layers.values()]
      .filter((l) => l.scene === at.scene && l.kind !== "near" && l.depth < focus.z - 1)
      .sort((a, b) => b.depth - a.depth)[0];
    if (!deeper) return null;
    if (deeper.kind === "far") return { kind: "sky", layer: deeper.id, x: focus.x };
    const row = this.ix.rows.get(deeper.id) ?? [];
    let x = focus.x;
    let best = Infinity;
    for (const b of row) {
      const cx = b.x + b.width / 2;
      if (Math.abs(cx - focus.x) < best) [x, best] = [cx, Math.abs(cx - focus.x)];
    }
    return { kind: "layer", layer: deeper.id, x };
  }

  look(t: LookTarget): Promise<void> {
    if (!this.canLook(t)) return Promise.resolve();
    return this.busyWith(() =>
      this.transit(t.kind === "sky" ? MS.sky : MS.look, () => {
        this.looks.push(t);
        this.zoom = 0;
        this.hero.style.opacity = "0";
      }),
    );
  }

  /** Pull the camera back one step: to the previous look, or to where the hero stands. */
  pullBack(): Promise<void> {
    if (this.busy) return Promise.resolve();
    if (this.looks.length === 0) {
      this.zoom = Math.max(0, this.zoom - 0.06);
      return Promise.resolve();
    }
    return this.busyWith(async () => {
      await this.transit(MS.back, () => {
        this.looks.pop();
      });
      if (!this.looking) this.hero.style.opacity = "1";
    });
  }

  /** A little zoom toward the hero's layer when there is nothing deeper to look at. */
  nudge(): void {
    if (!this.looking) this.zoom = Math.min(0.18, this.zoom + 0.06);
  }

  /** What a click on `el` means: a building, a prop, a passage end, the window, or a spot on the ground. */
  hitAt(el: Element | null, offsetX?: number): Hit | null {
    const t = el?.closest<HTMLElement>(
      "[data-passage],[data-window],[data-prop],[data-building],[data-ground]",
    );
    if (!t) return null;
    const layer =
      t.closest<HTMLElement>("[data-layer]")?.dataset.layer ?? t.dataset.group ?? t.dataset.ground ?? "";
    if (t.dataset.passage) return { kind: "passage", layer, x: Number(t.dataset.x), id: t.dataset.passage };
    if (t.dataset.window) return { kind: "window", layer, x: Number(t.dataset.x), id: "window" };
    if (t.dataset.prop) return { kind: "prop", layer, x: Number(t.dataset.x), id: t.dataset.prop };
    if (t.dataset.building)
      return { kind: "building", layer, x: Number(t.dataset.x), id: t.dataset.building };
    const left = Number(t.dataset.left ?? 0);
    return {
      kind: "ground",
      layer: t.dataset.ground!,
      x: Math.round(left + (offsetX ?? 0)),
      id: t.dataset.ground!,
    };
  }

  /** The hero's position on screen, in CSS pixels relative to the viewport (for hints). */
  heroOnScreen(): { x: number; y: number } {
    const r = this.hero.getBoundingClientRect();
    const v = this.frame.parentElement!.getBoundingClientRect();
    return { x: r.left + r.width / 2 - v.left, y: r.top - v.top };
  }

  destroy(): void {
    this.camAnim?.cancel();
    this.frame.remove();
  }
}

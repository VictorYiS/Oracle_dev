// The map: a canvas that follows the world, with drag-to-pan, wheel and pinch-free zoom buttons,
// tap to select or choose a target, and right-click for the obvious order.
import { useEffect, useRef } from "preact/hooks";
import type { Session } from "../../app/session";
import { setTileToCanvas } from "../../app/debug";
import { draw, type Palette } from "./render";
import type { Camera, Mode, Selection } from "./types";

export interface MapApi {
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
  centerOn(x: number, y: number): void;
}

interface Props {
  session: Session;
  revision: number;
  selection: Selection;
  mode: Mode;
  ghostOk(x: number, y: number): boolean;
  onTile(x: number, y: number, context: boolean): void;
  onReady(api: MapApi): void;
}

const ZOOM_MIN = 10;
const ZOOM_MAX = 48;

function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    fog: v("--map-fog", "#0b0f12"),
    grid: v("--map-grid", "rgba(255,255,255,0.05)"),
    select: v("--accent", "#d6b46a"),
    ghostOk: v("--ghost-ok", "rgba(143,174,91,0.45)"),
    ghostBad: v("--ghost-bad", "rgba(179,65,47,0.45)"),
    text: v("--fg", "#dfe5e8"),
  };
}

export function MapView(props: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, tile: 24 });
  const size = useRef({ w: 0, h: 0 });
  const hover = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(true);
  const latest = useRef(props);
  latest.current = props;

  const toTile = (clientX: number, clientY: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    const cam = camera.current;
    return {
      x: Math.floor(cam.x + (clientX - rect.left) / cam.tile),
      y: Math.floor(cam.y + (clientY - rect.top) / cam.tile),
    };
  };

  const clamp = () => {
    const cam = camera.current;
    const w = latest.current.session.world;
    const viewW = size.current.w / cam.tile;
    const viewH = size.current.h / cam.tile;
    cam.x = Math.min(Math.max(cam.x, -viewW / 2), w.width - viewW / 2);
    cam.y = Math.min(Math.max(cam.y, -viewH / 2), w.height - viewH / 2);
    dirty.current = true;
  };

  const api: MapApi = {
    pan(dx, dy) {
      camera.current.x += dx;
      camera.current.y += dy;
      clamp();
    },
    zoom(factor) {
      const cam = camera.current;
      const cx = cam.x + size.current.w / cam.tile / 2;
      const cy = cam.y + size.current.h / cam.tile / 2;
      cam.tile = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.tile * factor));
      cam.x = cx - size.current.w / cam.tile / 2;
      cam.y = cy - size.current.h / cam.tile / 2;
      clamp();
    },
    centerOn(x, y) {
      const cam = camera.current;
      cam.x = x + 0.5 - size.current.w / cam.tile / 2;
      cam.y = y + 0.5 - size.current.h / cam.tile / 2;
      clamp();
    },
  };

  // Size the canvas to its box (crisp on high-density screens) and keep it sized.
  useEffect(() => {
    const el = wrap.current!;
    const resize = () => {
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: rect.width, h: rect.height };
      const c = canvas.current!;
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
      c.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty.current = true;
    };
    resize();
    const avatar = latest.current.session.world.units.find((u) => u.role === "avatar");
    if (avatar) api.centerOn(avatar.x, avatar.y);
    props.onReady(api);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    setTileToCanvas((x, y) => {
      const cam = camera.current;
      return { x: (x + 0.5 - cam.x) * cam.tile, y: (y + 0.5 - cam.y) * cam.tile };
    });
    return () => {
      observer.disconnect();
      setTileToCanvas(() => null);
    };
  }, []);

  // Redraw on the next frame whenever anything shown has changed.
  useEffect(() => {
    dirty.current = true;
  }, [props.revision, props.selection, props.mode]);

  useEffect(() => {
    let frame = 0;
    let palette: Palette | null = null;
    const tick = () => {
      if (dirty.current && canvas.current) {
        dirty.current = false;
        palette ??= readPalette(canvas.current);
        const p = latest.current;
        const h = hover.current;
        draw(canvas.current.getContext("2d")!, size.current.w, size.current.h, {
          world: p.session.world,
          ix: p.session.game.ix,
          camera: camera.current,
          selection: p.selection,
          mode: p.mode,
          hover: h,
          ghostOk: h ? p.ghostOk(h.x, h.y) : false,
          palette,
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Pointer: drag pans, a short press selects or targets.
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 2) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent) => {
    const t = toTile(e.clientX, e.clientY);
    if (!hover.current || hover.current.x !== t.x || hover.current.y !== t.y) {
      hover.current = t;
      dirty.current = true;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) canvas.current?.setPointerCapture(e.pointerId);
    d.moved = true;
    api.pan(-dx / camera.current.tile, -dy / camera.current.tile);
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || e.button === 2) return;
    const t = toTile(e.clientX, e.clientY);
    props.onTile(t.x, t.y, false);
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const t = toTile(e.clientX, e.clientY);
    props.onTile(t.x, t.y, true);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    api.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  return (
    <div class="map" ref={wrap}>
      <canvas
        ref={canvas}
        data-testid="map"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          hover.current = null;
          dirty.current = true;
        }}
        onContextMenu={onContextMenu}
        onWheel={onWheel}
      />
    </div>
  );
}

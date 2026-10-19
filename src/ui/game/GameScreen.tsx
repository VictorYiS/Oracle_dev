// The game: top bar, map, selection panel and event feed, plus the keyboard and the
// "what does the next tap do" mode that turns map taps into commands.
import { useEffect, useRef, useState } from "preact/hooks";
import type { Session } from "../../app/session";
import type { Speed } from "../../app/clock";
import { nodeAt } from "../../core/world/query";
import { useRevision, useUi } from "../context";
import { fmt } from "../i18n";
import { EventFeed } from "./EventFeed";
import { MapView, type MapApi } from "./MapView";
import { nameOf } from "./names";
import { BuildMenu, HelpOverlay, SaveMenu } from "./Overlays";
import { SidePanel } from "./SidePanel";
import { TopBar } from "./TopBar";
import type { Mode, Selection } from "./types";

interface Props {
  session: Session;
  onReplace(session: Session): void;
}

export function GameScreen(props: Props) {
  const { m, lang } = useUi();
  const { session } = props;
  const revision = useRevision(session);
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [overlay, setOverlay] = useState<"build" | "save" | "help" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const map = useRef<MapApi | null>(null);
  const lastSpeed = useRef<Speed>(1);
  const w = session.world;
  const ix = session.game.ix;

  // Refusals become a short message in the player's language.
  useEffect(() => {
    const r = session.lastResult;
    if (!r || r.ok) return;
    setToast(m.rejections[r.code]);
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [session.lastResult, m]);

  const canPlace = (building: string, x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height) return false;
    const tile = y * w.width + x;
    const def = ix.buildings.get(building);
    if (!def || w.explored[tile] !== 1 || !ix.terrain[w.terrain[tile] ?? 0]?.buildable) return false;
    if (w.buildings.some((b) => b.x === x && b.y === y)) return false;
    if ((nodeAt(w, tile)?.amount ?? 0) > 0) return false;
    return Object.entries(def.cost).every(([res, n]) => (w.stock[res] ?? 0) >= n);
  };

  const order = (kind: "move" | "gather" | "build", unit: string, x: number, y: number) => {
    if (kind === "move") return session.submit({ type: "unit.move", unit, to: [x, y] });
    if (kind === "gather") return session.submit({ type: "unit.gather", unit, at: [x, y] });
    const site = w.buildings.find((b) => b.x === x && b.y === y && !b.complete);
    return session.submit({ type: "unit.build", unit, site: site?.id ?? "b0" });
  };

  const onTile = (x: number, y: number, context: boolean) => {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height) return;
    if (mode) {
      const result =
        mode.kind === "place"
          ? session.submit({ type: "build.place", building: mode.building, at: [x, y] })
          : order(mode.kind, mode.unit, x, y);
      if (result.ok) {
        setMode(null);
        if (mode.kind === "place") {
          const site = session.world.buildings.find((b) => b.x === x && b.y === y);
          if (site) setSelection({ kind: "building", id: site.id });
        }
      }
      return;
    }
    // Right-click with a unit selected: the obvious order for that tile.
    if (context && selection?.kind === "unit") {
      const unit = w.units.find((u) => u.id === selection.id);
      if (unit && unit.role !== "resident") {
        const tile = y * w.width + x;
        const site = w.buildings.find((b) => b.x === x && b.y === y && !b.complete);
        const kind = site ? "build" : (nodeAt(w, tile)?.amount ?? 0) > 0 ? "gather" : "move";
        order(kind, unit.id, x, y);
        return;
      }
    }
    const unit = [...w.units].reverse().find((u) => u.x === x && u.y === y);
    const building = w.buildings.find((b) => b.x === x && b.y === y);
    setSelection(
      unit
        ? { kind: "unit", id: unit.id }
        : building
          ? { kind: "building", id: building.id }
          : { kind: "tile", x, y },
    );
  };

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const selectedUnit =
        selection?.kind === "unit" ? w.units.find((u) => u.id === selection.id) : undefined;
      const handled = (() => {
        if (k === " ") {
          if (session.speed === 0) session.setSpeed(lastSpeed.current);
          else {
            lastSpeed.current = session.speed;
            session.setSpeed(0);
          }
        } else if (k === "1" || k === "2" || k === "3")
          session.setSpeed(([1, 2, 4] as const)[Number(k) - 1]!);
        else if (k === "Enter") session.submit({ type: "phase.advance" });
        else if (k === "b" || k === "B") setOverlay(overlay === "build" ? null : "build");
        else if (k === "?") setOverlay(overlay === "help" ? null : "help");
        else if (k === "Escape") {
          setMode(null);
          setOverlay(null);
        } else if ((k === "g" || k === "m") && selectedUnit && selectedUnit.role !== "resident") {
          setMode({ kind: k === "g" ? "gather" : "move", unit: selectedUnit.id });
        } else if (k === "x" && selectedUnit) session.submit({ type: "unit.stop", unit: selectedUnit.id });
        else if (k === "ArrowLeft" || k === "a") map.current?.pan(-2, 0);
        else if (k === "ArrowRight" || k === "d") map.current?.pan(2, 0);
        else if (k === "ArrowUp" || k === "w") map.current?.pan(0, -2);
        else if (k === "ArrowDown" || k === "s") map.current?.pan(0, 2);
        else if (k === "+" || k === "=") map.current?.zoom(1.2);
        else if (k === "-" || k === "_") map.current?.zoom(1 / 1.2);
        else return false;
        return true;
      })();
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, selection, overlay, w]);

  const hint =
    mode?.kind === "place"
      ? fmt(m.targeting.place, { name: nameOf(ix, lang, mode.building) })
      : mode
        ? m.targeting[mode.kind]
        : null;

  return (
    <div class="game" data-revision={revision} data-phase={w.clock.phase}>
      <TopBar
        session={session}
        onBuild={() => setOverlay("build")}
        onSave={() => setOverlay("save")}
        onHelp={() => setOverlay("help")}
      />
      <main class="board">
        <MapView
          session={session}
          revision={revision}
          selection={selection}
          mode={mode}
          ghostOk={(x, y) => (mode?.kind === "place" ? canPlace(mode.building, x, y) : false)}
          onTile={onTile}
          onReady={(api) => (map.current = api)}
        />
        {hint && (
          <div class="hint" role="status" data-testid="hint">
            {hint}
            <button type="button" onClick={() => setMode(null)}>
              {m.actions.cancel}
            </button>
          </div>
        )}
        {toast && (
          <div class="toast" role="alert" data-testid="toast">
            {toast}
          </div>
        )}
        <div class="zoom">
          <button type="button" aria-label="+" onClick={() => map.current?.zoom(1.2)}>
            +
          </button>
          <button type="button" aria-label="−" onClick={() => map.current?.zoom(1 / 1.2)}>
            −
          </button>
        </div>
        <EventFeed session={session} />
      </main>
      <SidePanel session={session} selection={selection} select={setSelection} setMode={setMode} />
      {overlay === "build" && (
        <BuildMenu
          session={session}
          onClose={() => setOverlay(null)}
          onPick={(building) => {
            setOverlay(null);
            setMode({ kind: "place", building });
          }}
        />
      )}
      {overlay === "save" && (
        <SaveMenu
          session={session}
          onClose={() => setOverlay(null)}
          onLoaded={(loaded) => {
            setOverlay(null);
            setSelection(null);
            setMode(null);
            props.onReplace(loaded);
          }}
        />
      )}
      {overlay === "help" && <HelpOverlay onClose={() => setOverlay(null)} />}
    </div>
  );
}

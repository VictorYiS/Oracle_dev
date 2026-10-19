// The game: the top bar, the paper theatre with its small heads-up display, the window (desk), the
// pending tray, and the keyboard. Walking, crossing, deciding and checking are commands; looking is
// the camera's own business and changes nothing in the world.
import { useEffect, useRef, useState } from "preact/hooks";
import type { Session } from "../../app/session";
import type { Speed } from "../../app/clock";
import { reducedMotion, storeReducedMotion } from "../../app/motion";
import type { Rejection } from "../../core/commands/schema";
import { waitingCases } from "../../core/world/query";
import type { Hit, Theatre } from "../../render/theatre";
import { useRevision, useUi } from "../context";
import { fmt, type Later } from "../i18n";
import { Desk } from "./Desk";
import { EventFeed } from "./EventFeed";
import { layerName, packText } from "./names";
import { HelpOverlay, SaveMenu, SettingsDialog } from "./Overlays";
import { PendingTray } from "./Pending";
import { TheatreView } from "./TheatreView";
import { TopBar } from "./TopBar";
import "../../render/theatre.css";
import { nearestUsable, type Usable, usablesOn } from "./usables";

interface Props {
  session: Session;
  onReplace(session: Session): void;
}

type Overlay = "desk" | "save" | "settings" | "help" | null;
/** A message on screen: UI copy picked when shown, a pack text, or a refusal. */
type Toast = { ui: Later } | { pack: string } | { refusal: Rejection };

/** How far an interaction key will walk to reach its target. */
const USE_SLACK = 160;

export function GameScreen(props: Props) {
  const { m, lang } = useUi();
  const { session } = props;
  const revision = useRevision(session);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [reduceMotion, setReduceMotionState] = useState(reducedMotion);
  const [, setCameraTick] = useState(0);
  const theatre = useRef<Theatre | null>(null);
  const lastSpeed = useRef<Speed>(1);
  const pendingUse = useRef<(Usable & { layer: string }) | null>(null);
  const toastTimer = useRef(0);
  const w = session.world;
  const ix = session.game.ix;

  const show = (t: Toast, ms = 3600) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  };
  const rerender = () => setCameraTick((n) => n + 1);

  // Refusals become a short message in the player's language: the code is kept, not the text.
  useEffect(() => {
    const r = session.lastResult;
    if (r && !r.ok) show({ refusal: r.code }, 3000);
  }, [session.lastResult]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const setReduceMotion = (on: boolean) => {
    storeReducedMotion(on);
    setReduceMotionState(on);
  };

  const layerRange = (): [number, number] => ix.layers.get(session.world.hero.layer)?.walk ?? [0, 0];
  const walkTo = (x: number) => {
    const [lo, hi] = layerRange();
    return session.submit({ type: "hero.walk", to: Math.round(Math.max(lo, Math.min(hi, x))) });
  };
  const stopWalking = () => {
    const t = theatre.current;
    if (session.world.hero.target === null || !t) return;
    walkTo(t.heroDrawnX);
  };

  const use = (u: Usable) => {
    pendingUse.current = null;
    if (u.kind === "window") {
      setOverlay("desk");
      setSheet(null);
    } else if (u.kind === "passage") {
      session.submit({ type: "hero.cross", passage: u.id });
    } else {
      const prop = ix.props.get(u.id);
      if (prop?.text) show({ pack: prop.text }, 6000);
    }
  };

  /** Walk to something, then use it on arrival. */
  const approach = (u: Usable) => {
    const dist = Math.abs(u.x - session.world.hero.x);
    if (dist <= u.reach) return use(u);
    const r = walkTo(u.x);
    if (r.ok) pendingUse.current = { ...u, layer: session.world.hero.layer };
  };

  const useNearby = () => {
    if (theatre.current?.busy) return;
    if (theatre.current?.looking) return show({ ui: (t) => t.hints.onlyLooking });
    const u = nearestUsable(session.world, ix, USE_SLACK, "use");
    if (!u) return show({ ui: (t) => t.hints.nothingHere });
    approach(u);
  };

  // Arrived where we were heading to use something?
  useEffect(() => {
    const p = pendingUse.current;
    if (!p) return;
    const h = w.hero;
    if (h.layer !== p.layer || (h.target !== null && h.target !== Math.round(p.x))) {
      if (h.layer !== p.layer || h.target !== null) pendingUse.current = null;
      return;
    }
    if (h.target === null && Math.abs(h.x - p.x) <= p.reach) use(p);
  }, [revision]);

  const lookIn = () => {
    const t = theatre.current;
    if (!t || t.busy) return;
    const target = t.inspectionTarget();
    if (target && t.canLook(target)) {
      pendingUse.current = null;
      stopWalking();
      void t.look(target).then(rerender);
    }
  };
  const travel = (direction: "in" | "out") => {
    const t = theatre.current;
    if (!t || t.busy) return;
    if (t.looking) return void lookOut();
    const u = nearestUsable(session.world, ix, USE_SLACK, direction);
    if (u) approach(u);
    else show({ ui: (m2) => m2.hints.noPassage });
  };
  const lookOut = () => {
    const t = theatre.current;
    if (t?.busy) return;
    if (!t) return;
    void t.pullBack().then(rerender);
  };

  const onHit = (hit: Hit) => {
    const t = theatre.current;
    if (t?.busy) return;
    if (t?.looking) return show({ ui: (m2) => m2.hints.onlyLooking });
    if (hit.layer !== session.world.hero.layer) return show({ ui: (m2) => m2.hints.farLayer });
    if (hit.kind === "ground" || hit.kind === "building") {
      pendingUse.current = null;
      walkTo(hit.x);
      return;
    }
    const u = usablesOn(session.world, ix, hit.layer).find((x) =>
      hit.kind === "window" ? x.kind === "window" : x.id === hit.id,
    );
    if (u) approach(u);
    else walkTo(hit.x);
  };

  // What the key handler reads, current as of the last render.
  const keyState = useRef({ overlay, sheet, trayOpen });
  keyState.current = { overlay, sheet, trayOpen };

  useEffect(() => {
    const held = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.matches("input, textarea, select") || e.target.isContentEditable)
      )
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const { overlay, sheet, trayOpen } = keyState.current;
      // A focused button keeps Space and Enter; an open dialog keeps every key but Escape.
      if ((k === " " || k === "Enter") && e.target instanceof HTMLButtonElement) return;
      if (overlay && k !== "Escape") return;
      const lower = k.length === 1 ? k.toLowerCase() : k;
      const handled = (() => {
        if (k === "Escape") {
          if (sheet) setSheet(null);
          else if (overlay) setOverlay(null);
          else if (trayOpen) setTrayOpen(false);
          else lookOut();
        } else if (lower === "a" || k === "ArrowLeft" || lower === "d" || k === "ArrowRight") {
          if (theatre.current?.busy) return true;
          if (e.repeat || held.has(lower === "a" || k === "ArrowLeft" ? "left" : "right")) return true;
          if (theatre.current?.looking) {
            show({ ui: (t) => t.hints.onlyLooking });
            return true;
          }
          const left = lower === "a" || k === "ArrowLeft";
          held.add(left ? "left" : "right");
          pendingUse.current = null;
          const [lo, hi] = layerRange();
          walkTo(left ? lo : hi);
        } else if (lower === "w" || k === "ArrowUp") {
          if (!e.repeat) travel("in");
        } else if (lower === "s" || k === "ArrowDown") {
          if (!e.repeat) travel("out");
        } else if (lower === "f") {
          if (!e.repeat) lookIn();
        } else if (lower === "e") useNearby();
        else if (lower === "t") session.submit({ type: "hero.wait", minutes: 60 });
        else if (lower === "p") setTrayOpen(!trayOpen);
        else if (k === " ") {
          if (session.speed === 0) session.setSpeed(lastSpeed.current);
          else {
            lastSpeed.current = session.speed;
            session.setSpeed(0);
          }
        } else if (k === "1" || k === "2" || k === "3")
          session.setSpeed(([1, 2, 4] as const)[Number(k) - 1]!);
        else if (k === "Enter") session.submit({ type: "phase.advance" });
        else if (k === "?") setOverlay(overlay === "help" ? null : "help");
        else return false;
        return true;
      })();
      if (handled) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key;
      const lower = k.length === 1 ? k.toLowerCase() : k;
      const side =
        lower === "a" || k === "ArrowLeft" ? "left" : lower === "d" || k === "ArrowRight" ? "right" : null;
      if (side && held.delete(side) && held.size === 0) stopWalking();
    };
    const onBlur = () => {
      held.clear();
      stopWalking();
    };
    // A button clicked with the mouse gives focus back, so Space and Enter stay game keys for
    // mouse players; keyboard players who tab to a button keep it focused and activate it.
    const onPointerUp = (e: PointerEvent) => {
      const button = e.target instanceof Element ? e.target.closest("button") : null;
      if (e.pointerType === "mouse" && button && document.activeElement === button) button.blur();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [session]);

  const near = nearestUsable(w, ix);
  const waiting = waitingCases(w).length;
  const focus = theatre.current?.focus ?? w.hero.layer;
  const hint = near
    ? fmt(near.kind === "passage" ? (near.direction === "in" ? m.hints.goIn : m.hints.goOut) : m.hints.use, {
        what:
          near.kind === "window"
            ? m.hints.window
            : near.kind === "passage"
              ? packText(ix.pack, lang, ix.passages.get(near.id)!.name)
              : packText(ix.pack, lang, ix.props.get(near.id)!.name),
      })
    : null;
  const toastText = toast
    ? "ui" in toast
      ? toast.ui(m)
      : "pack" in toast
        ? packText(ix.pack, lang, toast.pack)
        : m.rejections[toast.refusal]
    : null;

  const padHold = (side: "left" | "right") => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      if (theatre.current?.busy) return;
      if (theatre.current?.looking) return show({ ui: (t) => t.hints.onlyLooking });
      const [lo, hi] = layerRange();
      pendingUse.current = null;
      walkTo(side === "left" ? lo : hi);
    },
    onPointerUp: stopWalking,
    onPointerLeave: stopWalking,
    onPointerCancel: stopWalking,
  });

  return (
    <div
      class={`game ${reduceMotion ? "reduce-motion" : ""}`}
      data-revision={revision}
      data-phase={w.clock.phase}
    >
      <TopBar
        session={session}
        onSave={() => setOverlay("save")}
        onSettings={() => setOverlay("settings")}
        onHelp={() => setOverlay("help")}
      />
      <main class="board">
        <TheatreView
          session={session}
          reduceMotion={reduceMotion}
          onReady={(t) => {
            theatre.current = t;
            rerender();
          }}
          onHit={onHit}
          onViewChange={rerender}
        />
        <div class="hud" data-testid="hud">
          <p class="where">
            <span>
              {m.hud.you}: <b data-testid="where">{layerName(ix, lang, w.hero.layer)}</b>
            </span>
            <span class={focus !== w.hero.layer ? "looking" : ""}>
              {m.hud.camera}: <b data-testid="focus">{layerName(ix, lang, focus)}</b>
            </span>
          </p>
          <p class="goal" data-testid="goal">
            {waiting ? fmt(m.hints.goal, { n: waiting }) : m.hints.goalNone}
          </p>
        </div>
        {hint && (
          <p class="hint" role="status" data-testid="hint">
            {hint}
          </p>
        )}
        {toastText && (
          <div class="toast" role="alert" data-testid="toast">
            {toastText}
          </div>
        )}
        <div class="pad" role="group">
          <button type="button" aria-label={m.pad.left} data-testid="pad-left" {...padHold("left")}>
            ◀
          </button>
          <button type="button" aria-label={m.pad.right} data-testid="pad-right" {...padHold("right")}>
            ▶
          </button>
          <button type="button" aria-label={m.pad.goIn} data-testid="pad-up" onClick={() => travel("in")}>
            ↑
          </button>
          <button type="button" aria-label={m.pad.goOut} data-testid="pad-down" onClick={() => travel("out")}>
            ↓
          </button>
          <button type="button" aria-label={m.pad.use} data-testid="pad-use" onClick={useNearby}>
            E
          </button>
          <button
            type="button"
            aria-label={m.pad.lookIn}
            data-testid="pad-in"
            disabled={!theatre.current?.canInspect || theatre.current.looking}
            onClick={lookIn}
          >
            ⊕
          </button>
          <button
            type="button"
            aria-label={m.pad.lookOut}
            data-testid="pad-out"
            disabled={!theatre.current?.looking}
            onClick={lookOut}
          >
            ⊖
          </button>
        </div>
        <EventFeed session={session} />
        <PendingTray session={session} open={trayOpen} onToggle={() => setTrayOpen(!trayOpen)} />
      </main>
      {overlay === "desk" && (
        <Desk session={session} sheet={sheet} setSheet={setSheet} onClose={() => setOverlay(null)} />
      )}
      {overlay === "save" && (
        <SaveMenu
          session={session}
          onClose={() => setOverlay(null)}
          onLoaded={(loaded) => {
            setOverlay(null);
            props.onReplace(loaded);
          }}
        />
      )}
      {overlay === "settings" && (
        <SettingsDialog
          reduceMotion={reduceMotion}
          setReduceMotion={setReduceMotion}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "help" && <HelpOverlay onClose={() => setOverlay(null)} />}
    </div>
  );
}

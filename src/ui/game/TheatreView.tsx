// Hosts the paper theatre: mounts it, keeps it in step with the world every frame, and turns the
// wheel and clicks into looks (the camera's business) or hits (the game screen decides what they do).
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { prefersBitmaps } from "../../app/engine";
import type { Session } from "../../app/session";
import { text } from "../../core/content/pack";
import { type Hit, Theatre } from "../../render/theatre";
import { useUi } from "../context";

interface Props {
  session: Session;
  reduceMotion: boolean;
  onReady(theatre: Theatre | null): void;
  onHit(hit: Hit): void;
  onViewChange(): void;
}

const WHEEL_LOCK_MS = 380;

export function TheatreView(props: Props) {
  const { lang } = useUi();
  const host = useRef<HTMLDivElement>(null);
  const theatre = useRef<Theatre | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { session } = props;

  useEffect(() => {
    const el = host.current!;
    const pack = session.game.ix.pack;
    const t = new Theatre(el, session.game.ix, {
      reduceMotion: latest.current.reduceMotion,
      text: (ref) => text(pack, ref, lang),
      bitmaps: prefersBitmaps(),
    });
    t.setOptions({ reduceMotion: latest.current.reduceMotion });
    theatre.current = t;
    latest.current.onReady(t);
    const resize = () => t.resize(el.clientWidth, el.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    let frame = 0;
    let viewState = "";
    const loop = (now: number) => {
      t.sync(session.world, session.frac, now, session.revision);
      const next = `${t.focus}:${t.looking}:${t.busy}:${t.canInspect}`;
      if (next !== viewState) {
        viewState = next;
        latest.current.onViewChange();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    let wheelLock = 0;
    const onWheel = (e: WheelEvent) => {
      if (!t.canInspect && !t.looking) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock || t.busy) return;
      wheelLock = now + WHEEL_LOCK_MS;
      if (e.deltaY < 0) {
        const target = t.inspectionTarget();
        if (target && t.canLook(target)) {
          if (session.world.hero.target !== null)
            session.submit({ type: "hero.walk", to: Math.round(t.heroDrawnX) });
          void t.look(target);
        }
      } else if (e.deltaY > 0) void t.pullBack();
    };
    const onClick = (e: MouseEvent) => {
      const hit = t.hitAt(e.target as Element, { x: e.clientX, y: e.clientY });
      if (hit) latest.current.onHit(hit);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("click", onClick);
      t.destroy();
      theatre.current = null;
      latest.current.onReady(null);
    };
    // A new session (new game, loaded save) gets a new stage; language and motion are updated below.
  }, [session]);

  // In the same commit as the rest of the screen: the stage's signs never lag behind a language switch.
  useLayoutEffect(() => {
    const pack = session.game.ix.pack;
    theatre.current?.setOptions({ text: (ref) => text(pack, ref, lang) });
  }, [lang, session]);

  useEffect(() => {
    theatre.current?.setOptions({ reduceMotion: props.reduceMotion });
  }, [props.reduceMotion]);

  return <div ref={host} class="pt-host stage" data-testid="theatre" />;
}

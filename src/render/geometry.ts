// The paper theatre's fixed geometry and camera maths. Everything is in stage units: the stage is
// 720 units tall and as wide as the screen's shape allows; it is scaled to fit.

/** Perspective distance (CSS `perspective`). */
export const PERSPECTIVE = 900;
export const STAGE_H = 720;
/** Where the eye is, vertically. */
export const EYE_Y = 300;
/** The ground line of every walkable layer. */
export const GROUND = 600;
/** The far skyline stands on a lower line, so it sits on the horizon. */
export const SKY_GROUND = 820;
export const EASE = "cubic-bezier(.45,.05,.25,1)";

/** What the camera looks at: a depth, a zoom, a point, and where on screen that point should be. */
export interface Shot {
  z: number;
  k: number;
  x: number;
  y: number;
  ys: number;
}

export interface Cam {
  tx: number;
  ty: number;
  cz: number;
}

/** The world transform that puts `shot` in front of the eye. `ox` is the stage's horizontal middle. */
export function solve(shot: Shot, ox: number): Cam {
  const zEff = PERSPECTIVE * (1 - 1 / shot.k);
  return { cz: zEff - shot.z, tx: ox - shot.x, ty: (shot.ys - EYE_Y) / shot.k + EYE_Y - shot.y };
}

export const camText = (c: Cam): string =>
  `translate3d(${c.tx.toFixed(2)}px,${c.ty.toFixed(2)}px,${c.cz.toFixed(2)}px)`;

/** Read back a world transform (mid-animation) as a camera. */
export function camFromMatrix(m: DOMMatrixReadOnly): Cam {
  return { tx: m.m41, ty: m.m42, cz: m.m43 };
}

// Which browser engine is drawing. Gecko redraws every vector shape on every frame while the camera
// moves through CSS 3D, so the theatre gives it bitmaps instead (measured: tests/e2e/transitions.spec.ts).
export function prefersBitmaps(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /\bGecko\/\d/.test(navigator.userAgent) &&
    /\bFirefox\//.test(navigator.userAgent)
  );
}

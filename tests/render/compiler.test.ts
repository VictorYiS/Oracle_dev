// P2 acceptance A4: the visual compiler is deterministic. The same IR, state and way of looking give
// byte-identical SVG; different seeds give different buildings; a building's state never moves its
// outline; clutter (washing lines, wiring, posters, cracks) is drawn in ink and tidied away by the
// Oracle; side faces are just as deterministic and follow the state too.
import { describe, expect, it } from "vitest";
import type { Pack } from "../../src/core/content/pack";
import { drawFacade, drawSide, resolve, type VisualContent, type VisualIR } from "../../src/render/compiler";
import { defaultPack } from "../helpers/game";

const pack: Pack = defaultPack();
const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((e) => [e.id, e]));
const content: VisualContent = {
  styles: byId(pack.styles),
  recipes: byId(pack.recipes),
  parts: byId(pack.parts),
  landmarks: byId(pack.landmarks),
};
const styleFor = (recipe: string) => pack.styles.find((s) => s.recipes.some((r) => r.recipe === recipe))!.id;
const ir = (
  recipe: string,
  seed: number,
  extra: Partial<Extract<VisualIR, { kind: "recipe" }>> = {},
): VisualIR => ({
  kind: "recipe",
  recipe,
  style: styleFor(recipe),
  seed,
  lot: 240,
  door: null,
  parts: [],
  ...extra,
});
const STATES = ["powered", "dark", "damaged", "candle", "empty"] as const;
const CLUTTER = ["part.laundry", "part.wires", "part.posters", "part.cracks"];

describe("the visual compiler", () => {
  it("gives byte-identical SVG for the same IR, state and look", () => {
    for (const recipe of pack.recipes) {
      for (const state of STATES) {
        for (const look of ["ink", "oracle"] as const) {
          const a = drawFacade(resolve(content, ir(recipe.id, 42)), state, look, { standalone: true }).svg;
          const b = drawFacade(resolve(content, ir(recipe.id, 42)), state, look, { standalone: true }).svg;
          expect(a, `${recipe.id} ${state} ${look}`).toBe(b);
        }
      }
    }
    const lm = { kind: "landmark", landmark: pack.landmarks[0]!.id, seed: 9 } as const;
    expect(drawFacade(resolve(content, lm), "powered", "ink").svg).toBe(
      drawFacade(resolve(content, lm), "powered", "ink").svg,
    );
  });

  it("gives different buildings for different seeds (at least 95 of 100 pairs)", () => {
    for (const recipe of pack.recipes) {
      let differ = 0;
      for (let i = 0; i < 100; i++) {
        const a = drawFacade(resolve(content, ir(recipe.id, 1000 + 2 * i)), "powered", "ink").svg;
        const b = drawFacade(resolve(content, ir(recipe.id, 1001 + 2 * i)), "powered", "ink").svg;
        if (a !== b) differ++;
      }
      expect(differ, recipe.id).toBeGreaterThanOrEqual(95);
    }
  });

  it("never moves a building's outline with its state: width, height and door stay put", () => {
    const doorOf = (svg: string) => /<path d="([^"]+)" fill="#dbe7ff"/.exec(svg)?.[1];
    for (const recipe of pack.recipes) {
      for (let seed = 1; seed <= 20; seed++) {
        const form = resolve(content, ir(recipe.id, seed, { door: recipe.grammar === "tower" ? null : 120 }));
        const shapes = STATES.map((state) => drawFacade(form, state, "oracle"));
        const head = (svg: string) => /<svg width="([\d.]+)" height="([\d.]+)"/.exec(svg)!.slice(1).join("×");
        expect(new Set(shapes.map((d) => head(d.svg))).size, `${recipe.id} ${seed}`).toBe(1);
        expect(new Set(shapes.map((d) => `${d.width}×${d.height}`)).size).toBe(1);
        if (recipe.grammar !== "tower")
          expect(new Set(shapes.map((d) => doorOf(d.svg))).size, `${recipe.id} ${seed} door`).toBe(1);
      }
    }
    // A building fills its lot.
    expect(resolve(content, ir("recipe.row_house", 5, { lot: 233 })).width).toBe(233);
  });

  it("draws clutter in ink and leaves every bit of it out when the Oracle draws", () => {
    const form = resolve(content, ir("recipe.stack", 1717, { parts: CLUTTER }));
    const ink = drawFacade(form, "damaged", "ink").svg;
    const oracle = drawFacade(form, "damaged", "oracle").svg;
    for (const part of CLUTTER) {
      expect(ink, `ink ${part}`).toContain(`data-part="${part}"`);
      expect(oracle, `oracle ${part}`).not.toContain(`data-part="${part}"`);
    }
    // Cracks only where there is damage.
    expect(drawFacade(form, "powered", "ink").svg).not.toContain(`data-part="part.cracks"`);
    // A row house's awning is not clutter: both draw it.
    const shop = resolve(content, ir("recipe.row_house", 3, { parts: ["part.awning"] }));
    expect(drawFacade(shop, "powered", "ink").svg).toContain(`data-part="part.awning"`);
    expect(drawFacade(shop, "powered", "oracle").svg).toContain(`data-part="part.awning"`);
  });

  it("draws side faces the same way every time, and with the same state as the front", () => {
    let litSides = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const form = resolve(content, ir("recipe.row_house", seed));
      for (const side of ["left", "right"] as const) {
        const lit = drawSide(form, "powered", "ink", 120, side).svg;
        expect(drawSide(form, "powered", "ink", 120, side).svg).toBe(lit);
        const dark = drawSide(form, "dark", "ink", 120, side).svg;
        // In the dark, no window on the side is lit either.
        expect(dark).not.toContain(`fill="#efc068"`);
        if (lit.includes(`fill="#efc068"`)) {
          litSides++;
          expect(dark).not.toBe(lit);
        }
        expect(drawSide(form, "damaged", "ink", 120, side).svg).toContain(`data-part="part.cracks"`);
        expect(drawSide(form, "damaged", "oracle", 120, side).svg).not.toContain("data-part");
      }
      expect(drawSide(form, "powered", "ink", 120, "left").svg).not.toBe(
        drawSide(form, "powered", "ink", 120, "right").svg,
      );
    }
    expect(litSides).toBeGreaterThan(12);
  });
});

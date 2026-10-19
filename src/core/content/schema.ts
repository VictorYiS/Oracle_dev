// Scenario pack schema, v0. Every content type a pack can declare lives here,
// so the validator, the loader and (later) JSON Schema export share one source.
import { z } from "zod";

export const ENGINE_SCHEMA_VERSION = "0";

/** Namespaced content id: `<type>.<name>`, e.g. `res.example`, `bld.example`. */
export const ContentId = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/, "content ids look like type.name, e.g. res.example");

/** Text is always a locale key (`@key`) so packs can be translated and engine code never holds copy. */
export const TextRef = z
  .string()
  .regex(/^@[a-z0-9_.-]+$/, "text fields are locale keys like @res.example.name");

export const SystemModule = z.enum(["debt", "boons", "contracts", "rules", "oracle", "story"]);

/** BCP 47 language tag as used by the game: `en`, `zh-CN`, `pt-BR`. */
export const LanguageTag = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "language tags look like en or zh-CN");

export const ScenarioManifest = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    engine: z.literal(ENGINE_SCHEMA_VERSION),
    extends: z.string().optional(),
    /**
     * Languages this pack ships, each with complete text. The first is the fallback when the
     * player's language is not offered. A pack that extends another inherits its list if omitted.
     */
    languages: z.array(LanguageTag).min(1).optional(),
    title: TextRef,
    tagline: TextRef.optional(),
    systems: z.array(SystemModule).default(["debt", "boons", "contracts", "rules", "oracle", "story"]),
    /** Proper nouns that must never appear in engine code (checked by tools/check-engine-neutral). */
    engine_forbidden_terms: z.array(z.string().min(1)).default([]),
  })
  .strict();

const idWithPrefix = (prefix: string) =>
  ContentId.refine((id) => id.startsWith(prefix), `ids in this section start with ${prefix}`);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colours look like #a1b2c3");
const Int = z.number().int();
const Count = z.number().int().min(0);
/** An inclusive integer range [min, max]. */
const IntRange = z
  .tuple([z.number().int(), z.number().int()])
  .refine(([a, b]) => a <= b, "a range is [min, max] with min ≤ max");
const Point = z.tuple([z.number(), z.number()]);

/** Goods. Listed for later phases; nothing consumes them yet. */
export const Resource = z
  .object({
    id: idWithPrefix("res."),
    name: TextRef,
    tags: z.array(z.string()).default([]),
  })
  .strict();

/** When the day runs, in minutes after midnight. One tick is one game minute. */
export const Calendar = z
  .object({
    day_start_minute: z.number().int().min(0).max(1439),
    dusk_minute: z.number().int().min(1).max(1440),
  })
  .strict()
  .refine((c) => c.dusk_minute > c.day_start_minute, "dusk must come after the day starts");

// ---- places ------------------------------------------------------------------------------------

/** A quarter of the town: its look and its power line. */
export const District = z
  .object({
    id: idWithPrefix("district."),
    name: TextRef,
    /** The style pack its buildings are drawn in. */
    style: ContentId,
    /** Power the district's line can carry, in load units. */
    capacity: Count,
    /** Repair crews the works office can send out per day. */
    repair_crews: Count,
  })
  .strict();

/** Ground surfaces the engine knows how to draw. */
export const GroundKind = z.enum(["pavement", "water", "quay", "steps", "floor"]);

export const Scene = z
  .object({
    id: idWithPrefix("scene."),
    name: TextRef,
    district: ContentId,
    kind: z.enum(["outdoor", "interior"]),
    /** Horizontal ground strips, from `near` to `far` depth; `drop` sinks a strip below street level. */
    grounds: z
      .array(
        z
          .object({
            kind: GroundKind,
            near: Int,
            far: Int,
            drop: Count.default(0),
            /** The layer whose view the strip belongs to (it hides when that layer is passed). */
            layer: ContentId,
          })
          .strict(),
      )
      .default([]),
    /** Left and right edges of the scenery. */
    extent: IntRange,
    /** A landmark drawn as the back wall of an interior. */
    backdrop: ContentId.optional(),
  })
  .strict();

export const Layer = z
  .object({
    id: idWithPrefix("layer."),
    name: TextRef,
    scene: ContentId,
    /** Depth of the layer's plane: 0 is the street, negative is further away. */
    depth: Int,
    /** walk: people stand and walk here. near: foreground silhouettes. far: the distant skyline. */
    kind: z.enum(["walk", "near", "far"]),
    /** The stretch a walker can use, for walk layers. */
    walk: IntRange.optional(),
    /** A far layer's skyline: buildings generated along its whole width, always as the Oracle draws. */
    skyline: z.object({ recipe: ContentId, style: ContentId, seed: Int, lot: IntRange }).strict().optional(),
  })
  .strict();

export const PassageKind = z.enum(["bridge", "alley", "stairs", "door"]);

const PassageEnd = z.object({ layer: ContentId, x: Int }).strict();

/** The only way from one layer, or one scene, to another. */
export const Passage = z
  .object({
    id: idWithPrefix("passage."),
    name: TextRef,
    kind: PassageKind,
    from: PassageEnd,
    to: PassageEnd,
    /** How far it is, in the same units as walking along a layer: crossing takes time. */
    length: z.number().int().min(1),
    /** Width of the deck, steps or alley. */
    width: z.number().int().min(10).default(96),
  })
  .strict();

/** A named place on a layer that people walk to (the market, a bench). */
export const Spot = z.object({ id: idWithPrefix("spot."), name: TextRef, layer: ContentId, x: Int }).strict();

const Look = z.union([
  z
    .object({
      recipe: ContentId,
      seed: Int,
      /** Draw in another style pack than the district's. */
      style: ContentId.optional(),
      /** Parts this building always has, whatever the dice say. */
      parts: z.array(ContentId).default([]),
    })
    .strict(),
  z.object({ landmark: ContentId }).strict(),
]);

const Facts = z.object({ power: z.boolean(), damaged: z.boolean() }).strict();

export const Building = z
  .object({
    id: idWithPrefix("bld."),
    address: TextRef,
    layer: ContentId,
    /** Left edge of the lot and its width. */
    x: Int,
    width: z.number().int().min(40),
    /** How far the box runs back (its side faces). Alleys make their neighbours' sides as deep as they are. */
    depth: z.number().int().min(10).default(90),
    look: Look,
    /** Power it draws when connected. */
    load: Count.default(1),
    /** How it really is at the start. */
    truth: Facts,
    /** What the institutions have on file at the start. Fields left out agree with the truth. */
    record: z
      .object({
        known: z.boolean().default(true),
        power: z.boolean().optional(),
        damaged: z.boolean().optional(),
      })
      .strict()
      .default({ known: true }),
  })
  .strict();

/** Street furniture and fittings: drawn from a landmark; may say something when you use it. */
export const Prop = z
  .object({
    id: idWithPrefix("prop."),
    name: TextRef,
    layer: ContentId,
    x: Int,
    /** Raise (negative) or sink the drawing relative to the ground line. */
    y: Int.default(0),
    landmark: ContentId,
    /** What you find out when you use it. */
    text: TextRef.optional(),
  })
  .strict();

export const Routine = z
  .object({
    id: idWithPrefix("routine."),
    /** From `at` (minute of the day) on, go to `go`: "home", "work", or a building or spot id. */
    steps: z.array(z.object({ at: z.number().int().min(0).max(1440), go: z.string() }).strict()).min(1),
  })
  .strict();

export const Resident = z
  .object({
    id: idWithPrefix("person."),
    name: TextRef,
    /** Where they really live (null: not in town yet). */
    home: ContentId.nullable(),
    /** Where the registry has them. Defaults to their home. */
    registered: ContentId.nullable().optional(),
    /** Where they spend the working day: a building or a spot. */
    work: ContentId,
    routine: ContentId,
    look: z.object({ coat: Color, hat: z.boolean().default(false) }).strict(),
  })
  .strict();

/** What an institution keeps on file. */
export const RecordField = z.enum(["address", "occupants", "power", "condition"]);

export const Institution = z
  .object({ id: idWithPrefix("inst."), name: TextRef, keeps: z.array(RecordField).min(1) })
  .strict();

/** What the engine does with a case: the mechanics are the engine's, the words are the pack's. */
export const CaseKind = z.enum(["connect", "register", "repair"]);

/** Why the Oracle suggests what it suggests, per case kind. Each needs a template in the pack. */
export const ORACLE_REASONS = {
  connect: ["ok", "unknown_address", "already_powered", "damaged", "empty", "no_capacity"],
  register: ["ok", "unknown_address", "already_registered"],
  repair: ["ok", "unknown_address", "no_damage_on_file"],
} as const;

const oracleTexts = <K extends keyof typeof ORACLE_REASONS>(kind: K) =>
  z
    .object(
      Object.fromEntries(ORACLE_REASONS[kind].map((r) => [r, TextRef])) as Record<
        (typeof ORACLE_REASONS)[K][number],
        typeof TextRef
      >,
    )
    .strict();

const caseCommon = {
  name: TextRef,
  /** The visitor's request, a template with {name} and {address}. */
  request: TextRef,
  /** The standing operating procedure: clauses shown when you open the SOP. */
  sop: z.array(TextRef).min(1),
  approve: TextRef,
  deny: TextRef,
};

export const CaseType = z.discriminatedUnion("kind", [
  z
    .object({
      id: idWithPrefix("case."),
      kind: z.literal("connect"),
      ...caseCommon,
      oracle: oracleTexts("connect"),
    })
    .strict(),
  z
    .object({
      id: idWithPrefix("case."),
      kind: z.literal("register"),
      ...caseCommon,
      oracle: oracleTexts("register"),
    })
    .strict(),
  z
    .object({
      id: idWithPrefix("case."),
      kind: z.literal("repair"),
      ...caseCommon,
      oracle: oracleTexts("repair"),
    })
    .strict(),
]);

export const Effect = z.discriminatedUnion("type", [
  /** The real power at a building changes; the records do not hear of it. */
  z.object({ type: z.literal("power"), building: ContentId, on: z.boolean() }).strict(),
  z.object({ type: z.literal("damage"), building: ContentId, damaged: z.boolean() }).strict(),
  /** The records change; the building does not. */
  z
    .object({
      type: z.literal("record"),
      building: ContentId,
      known: z.boolean().optional(),
      power: z.boolean().optional(),
      damaged: z.boolean().optional(),
    })
    .strict(),
  /** Someone leaves town. Nobody tells the registry. */
  z.object({ type: z.literal("move_out"), person: ContentId }).strict(),
  /** Someone moves into a building. Nobody tells the registry. */
  z.object({ type: z.literal("move_in"), person: ContentId, building: ContentId }).strict(),
]);

export const GameEvent = z
  .object({
    id: idWithPrefix("event."),
    /** Shown in the event feed when the event fires; events without one happen unseen. */
    message: TextRef.optional(),
    trigger: z
      .object({
        /** Fires at this dawn exactly (overrides chance and min_day). */
        day: z.number().int().min(1).optional(),
        chance_per_day: z.number().min(0).max(1).default(0),
        min_day: z.number().int().min(1).default(1),
        once: z.boolean().default(true),
      })
      .strict(),
    effects: z.array(Effect).min(1),
  })
  .strict();

// ---- the visual compiler's content -------------------------------------------------------------

const Palette = z.object({ body: Color, roof: Color, door: Color, trim: Color }).strict();

/** A style pack: how one district's buildings are inked. */
export const StylePack = z
  .object({
    id: idWithPrefix("style."),
    name: TextRef,
    stroke: z.number().min(0.5).max(6),
    /** How much the hand wobbles. */
    rough: z.number().min(0).max(3),
    /** Opacity of the shading hatch. */
    hatch: z.number().min(0).max(1),
    palettes: z.array(Palette).min(1),
    /** Patch colours for self-built boxes. */
    patches: z.array(Color).min(1),
    recipes: z.array(z.object({ recipe: ContentId, weight: z.number().positive() }).strict()).min(1),
    /** Chance of each part per building. */
    parts: z.record(ContentId, z.number().min(0).max(1)).default({}),
  })
  .strict();

/** The shape grammars the engine can draw. A recipe gives one of them its numbers. */
export const Grammar = z.enum(["terrace", "hall", "stack", "tower"]);

const recipeBase = { id: idWithPrefix("recipe."), name: TextRef };
export const Recipe = z.discriminatedUnion("grammar", [
  z
    .object({
      ...recipeBase,
      grammar: z.literal("terrace"),
      floors: IntRange,
      bay_width: IntRange,
      floor_height: IntRange,
      base: IntRange,
      roofs: z.array(z.enum(["flat", "gable", "sawtooth", "mansard", "dome"])).min(1),
      windows: z.array(z.enum(["rect", "arch", "tall"])).min(1),
      chimneys: IntRange,
    })
    .strict(),
  z
    .object({
      ...recipeBase,
      grammar: z.literal("hall"),
      floors: IntRange,
      bay_width: IntRange,
      floor_height: IntRange,
      roofs: z.array(z.enum(["sawtooth", "barrel", "flat"])).min(1),
      stacks: IntRange,
      stack_height: IntRange,
    })
    .strict(),
  z
    .object({
      ...recipeBase,
      grammar: z.literal("stack"),
      boxes: IntRange,
      box_height: IntRange,
      /** How far each box may sit off-centre. */
      lean: z.number().int().min(0),
      windows: IntRange,
    })
    .strict(),
  z
    .object({
      ...recipeBase,
      grammar: z.literal("tower"),
      floors: IntRange,
      floor_height: IntRange,
      setbacks: IntRange,
      crowns: z.array(z.enum(["spire", "crystal", "antenna", "stepped", "flat"])).min(1),
    })
    .strict(),
]);

/** One drawn mark: a polygon, a line, a circle, a box, or a line of text. Fills name a palette role or a colour. */
export const Shape = z
  .object({
    poly: z.array(Point).min(2).optional(),
    line: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    circle: z.tuple([z.number(), z.number(), z.number()]).optional(),
    rect: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    /** A window: lit, dark or candle-lit with the building's state. */
    window: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    /** The door, where a passage leads in. */
    door: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    text: TextRef.optional(),
    at: Point.optional(),
    size: z.number().positive().default(15),
    fill: z.union([z.enum(["body", "roof", "trim", "door", "none"]), Color]).default("none"),
    /** Line colour (the pen's ink if left out). */
    stroke: Color.optional(),
    opacity: z.number().min(0).max(1).optional(),
    width: z.number().positive().optional(),
    /** Repeat the mark `count` times, `dx` apart. */
    repeat: z.tuple([z.number(), z.number().int().min(1)]).optional(),
    /** Left out when the Oracle draws it. */
    clutter: z.boolean().default(false),
    /** Only drawn in this light. */
    glow: z.boolean().default(false),
  })
  .strict()
  .refine(
    (s) =>
      [s.poly, s.line, s.circle, s.rect, s.window, s.door, s.text].filter((v) => v !== undefined).length ===
      1,
    "a shape is exactly one of poly, line, circle, rect, window, door or text",
  )
  .refine((s) => s.text === undefined || s.at !== undefined, "text needs `at`");

/** Things that hang on a building. Clutter is what the Oracle tidies away. */
export const Part = z
  .object({
    id: idWithPrefix("part."),
    name: TextRef,
    draw: z.enum(["pipes", "laundry", "posters", "ladder", "wires", "awning", "sign", "balcony", "cracks"]),
    clutter: z.boolean(),
    /** Only on a damaged building (cracks). */
    damaged_only: z.boolean().default(false),
  })
  .strict();

/** Hand-drawn part data, inked with the same pen as everything generated. */
export const Landmark = z
  .object({
    id: idWithPrefix("landmark."),
    name: TextRef,
    width: z.number().int().min(4),
    height: z.number().int().min(4),
    palette: Palette,
    shapes: z.array(Shape).min(1),
    /** The main body's left, right and top edge: where the side faces attach. */
    body: z.tuple([z.number(), z.number(), z.number()]).optional(),
  })
  .strict();

// ---- the start, the window and the rules of thumb -----------------------------------------------

export const Start = z
  .object({
    hero: z
      .object({
        layer: ContentId,
        x: Int,
        look: z.object({ coat: Color, hat: z.boolean().default(false) }).strict(),
      })
      .strict(),
  })
  .strict();

/** The service window: where cases are heard and originals fetched. */
export const WindowPlace = z
  .object({
    layer: ContentId,
    x: Int,
    /** How close you must stand to work it. */
    reach: z.number().int().min(1),
    /** Where the queue starts and how far apart visitors stand. */
    queue: z.object({ x: Int, gap: z.number().int().min(1) }).strict(),
  })
  .strict();

export const Params = z
  .object({
    /** Walking speeds, in units per game minute. */
    hero_speed: z.number().int().min(1),
    resident_speed: z.number().int().min(1),
    /** How close counts as being there: added to half a building's width. */
    presence_reach: Count,
    /** How close to a passage's end you must be to take it. */
    passage_reach: z.number().int().min(1),
    /** Visitors a day. */
    cases_per_day: IntRange,
    /** Game minutes to fetch and read an original. */
    original_minutes: z.number().int().min(1),
    /** Days without power before people give up and leave. */
    leave_after_dark_days: z.number().int().min(1),
  })
  .strict();

const Probability = z.number().min(0).max(1);

export const EconomyParams = z
  .object({
    /** Daily petition slots; tiers use slots per `petition_slots`. */
    daily_petitions: z.number().int().min(0),
    petition_slots: z
      .object({
        glance: z.number().int().min(1),
        ponder: z.number().int().min(1),
        decree: z.number().int().min(1),
      })
      .strict(),
    petition_debt: z
      .object({ glance: z.number().min(0), ponder: z.number().min(0), decree: z.number().min(0) })
      .strict(),
    /** Compound interest charged on the outstanding balance at every dusk. */
    interest_rate: Probability,
    understanding_debt_per_rule: z.number().min(0),
    repay: z
      .object({
        verify: z.number().min(0),
        verify_catch: z.number().min(0),
        manual_per_hour: z.number().min(0),
        manual_daily_cap: z.number().min(0),
        translate: z.number().min(0),
        fast_fraction: Probability,
      })
      .strict(),
    distortion: z.object({ base: Probability, per_debt: Probability, max: Probability }).strict(),
    collection_thresholds: z.array(z.number().positive()).min(1),
    /** Share of the balance that remains after a collection reveals the truth. */
    collection_relief: Probability,
    /** Days after a collection before the next one can happen. */
    collection_cooldown_days: z.number().int().min(0),
    boon_offer_every_days: z.number().int().min(1),
    boon_offer_size: z.number().int().min(1),
  })
  .strict();

/** A pack only writes the economy fields it changes, nested ones included. */
export const EconomyPatch = EconomyParams.extend({
  petition_slots: EconomyParams.shape.petition_slots.partial(),
  petition_debt: EconomyParams.shape.petition_debt.partial(),
  repay: EconomyParams.shape.repay.partial(),
  distortion: EconomyParams.shape.distortion.partial(),
}).partial();

export const LocaleTable = z.record(z.string().regex(/^[a-z0-9_.-]+$/), z.string());

/** Sections that hold lists of entities, merged by id across files and `extends`. */
export const ENTITY_SECTIONS = {
  resources: Resource,
  districts: District,
  scenes: Scene,
  layers: Layer,
  passages: Passage,
  spots: Spot,
  buildings: Building,
  props: Prop,
  routines: Routine,
  residents: Resident,
  institutions: Institution,
  cases: CaseType,
  events: GameEvent,
  styles: StylePack,
  recipes: Recipe,
  parts: Part,
  landmarks: Landmark,
} as const;
export type EntitySection = keyof typeof ENTITY_SECTIONS;
export const ENTITY_SECTION_NAMES = Object.keys(ENTITY_SECTIONS) as EntitySection[];

const removable = z.array(ContentId).optional();

/** What one pack file may contain. Files are merged section by section. */
export const PackFile = z
  .object({
    ...(Object.fromEntries(
      ENTITY_SECTION_NAMES.map((name) => [name, z.array(ENTITY_SECTIONS[name]).optional()]),
    ) as {
      [K in EntitySection]: z.ZodOptional<z.ZodArray<(typeof ENTITY_SECTIONS)[K]>>;
    }),
    calendar: Calendar.optional(),
    start: Start.optional(),
    window: WindowPlace.optional(),
    params: Params.partial().optional(),
    economy: EconomyPatch.optional(),
    /** In a pack that extends another: ids to drop from the parent. */
    remove: z
      .object(
        Object.fromEntries(ENTITY_SECTION_NAMES.map((name) => [name, removable])) as Record<
          EntitySection,
          typeof removable
        >,
      )
      .strict()
      .optional(),
  })
  .strict();

export type ScenarioManifest = z.infer<typeof ScenarioManifest>;
export type Resource = z.infer<typeof Resource>;
export type Calendar = z.infer<typeof Calendar>;
export type District = z.infer<typeof District>;
export type GroundKind = z.infer<typeof GroundKind>;
export type Scene = z.infer<typeof Scene>;
export type Layer = z.infer<typeof Layer>;
export type PassageKind = z.infer<typeof PassageKind>;
export type Passage = z.infer<typeof Passage>;
export type Spot = z.infer<typeof Spot>;
export type Building = z.infer<typeof Building>;
export type Prop = z.infer<typeof Prop>;
export type Routine = z.infer<typeof Routine>;
export type Resident = z.infer<typeof Resident>;
export type RecordField = z.infer<typeof RecordField>;
export type Institution = z.infer<typeof Institution>;
export type CaseKind = z.infer<typeof CaseKind>;
export type CaseType = z.infer<typeof CaseType>;
export type OracleReason<K extends CaseKind = CaseKind> = (typeof ORACLE_REASONS)[K][number];
export type Effect = z.infer<typeof Effect>;
export type GameEvent = z.infer<typeof GameEvent>;
export type Palette = z.infer<typeof Palette>;
export type StylePack = z.infer<typeof StylePack>;
export type Grammar = z.infer<typeof Grammar>;
export type Recipe = z.infer<typeof Recipe>;
export type Shape = z.infer<typeof Shape>;
export type Part = z.infer<typeof Part>;
export type Landmark = z.infer<typeof Landmark>;
export type Start = z.infer<typeof Start>;
export type WindowPlace = z.infer<typeof WindowPlace>;
export type Params = z.infer<typeof Params>;
export type EconomyParams = z.infer<typeof EconomyParams>;
export type PackFile = z.infer<typeof PackFile>;
export type LocaleTable = z.infer<typeof LocaleTable>;

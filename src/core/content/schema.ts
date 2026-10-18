// Scenario pack schema, v0. Every content type a pack can declare lives here,
// so the validator, the loader and (later) JSON Schema export share one source.
import { z } from "zod";

export const ENGINE_SCHEMA_VERSION = "0";

/** Namespaced content id: `<type>.<name>`, e.g. `res.example`, `boon.example`. */
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
/** One or two characters used to draw the thing on the map until there is art. */
const Glyph = z.string().min(1).max(2);
const Amounts = z.record(ContentId, z.number().int().min(1));
const Tile = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

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

export const Terrain = z
  .object({
    id: idWithPrefix("terrain."),
    name: TextRef,
    walkable: z.boolean(),
    buildable: z.boolean(),
    move_cost: z.number().int().min(1).default(1),
    color: Color,
  })
  .strict();

/** A place to gather a resource: a tree, a berry bush, a fishing spot. */
export const ResourceNode = z
  .object({
    id: idWithPrefix("node."),
    name: TextRef,
    yields: ContentId,
    amount: z.number().int().min(1),
    gather_ticks: z.number().int().min(1),
    regrow_per_day: z.number().int().min(0).default(0),
    glyph: Glyph,
    color: Color,
  })
  .strict();

export const Building = z
  .object({
    id: idWithPrefix("bld."),
    name: TextRef,
    description: TextRef,
    cost: Amounts,
    build_ticks: z.number().int().min(1),
    /** Gatherers can deliver here. */
    depot: z.boolean().default(false),
    /** Storage capacity added to the settlement. */
    storage: z.number().int().min(0).default(0),
    housing: z.number().int().min(0).default(0),
    /** Fog radius this building keeps revealed. */
    sight: z.number().int().min(0).default(0),
    /** Resident work places. */
    workers: z.number().int().min(0).default(0),
    /** Produced per working resident at dusk. */
    produces: Amounts.optional(),
    /** Consumed per working resident at dusk; no production without them. */
    consumes: Amounts.optional(),
    glyph: Glyph,
    color: Color,
  })
  .strict();

export const UnitRole = z.enum(["avatar", "worker", "resident"]);

export const UnitType = z
  .object({
    id: idWithPrefix("unit."),
    name: TextRef,
    role: UnitRole,
    ticks_per_tile: z.number().int().min(1),
    sight: z.number().int().min(0),
    carry: z.number().int().min(0),
    food_per_day: z.number().int().min(0).default(0),
    glyph: Glyph,
    color: Color,
  })
  .strict();

export const Weather = z
  .object({
    id: idWithPrefix("weather."),
    name: TextRef,
    sight_delta: z.number().int().default(0),
    /** Extra production per working resident at dusk. */
    produce_bonus: z.record(ContentId, z.number().int()).default({}),
  })
  .strict();

export const Effect = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_resource"), resource: ContentId, amount: z.number().int() }).strict(),
  z.object({ type: z.literal("set_weather"), weather: ContentId }).strict(),
  z
    .object({ type: z.literal("spawn_unit"), unit: ContentId, count: z.number().int().min(1).max(10) })
    .strict(),
  /** A random worker unit stops working for some days. */
  z.object({ type: z.literal("disable_worker"), days: z.number().int().min(1) }).strict(),
  /** Every node of this type gains (or loses) some amount. */
  z.object({ type: z.literal("node_bonus"), node: ContentId, amount: z.number().int() }).strict(),
]);

export const GameEvent = z
  .object({
    id: idWithPrefix("event."),
    /** Shown in the event feed when the event fires. */
    message: TextRef,
    trigger: z
      .object({
        chance_per_day: z.number().min(0).max(1),
        min_day: z.number().int().min(1).default(1),
        once: z.boolean().default(false),
        /** Only while some housing is free. */
        needs_free_housing: z.boolean().default(false),
        /** Only while the current weather is one of these. */
        weather_in: z.array(ContentId).optional(),
      })
      .strict(),
    effects: z.array(Effect).min(1),
  })
  .strict();

/** The map, drawn as text rows: one character per tile, explained by the legend. */
export const MapDef = z
  .object({
    width: z.number().int().min(8).max(128),
    height: z.number().int().min(8).max(128),
    legend: z.record(
      z.string().length(1),
      z.object({ terrain: ContentId, node: ContentId.optional() }).strict(),
    ),
    rows: z.array(z.string()).min(1),
  })
  .strict();

export const Start = z
  .object({
    units: z.array(z.object({ unit: ContentId, at: Tile }).strict()).min(1),
    buildings: z.array(z.object({ building: ContentId, at: Tile }).strict()).default([]),
    stock: z.record(ContentId, z.number().int().min(0)).default({}),
    weather: ContentId,
    /** Storage capacity before any storage building exists. */
    base_storage: z.number().int().min(0),
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
  terrain: Terrain,
  nodes: ResourceNode,
  buildings: Building,
  units: UnitType,
  weathers: Weather,
  events: GameEvent,
} as const;
export type EntitySection = keyof typeof ENTITY_SECTIONS;
export const ENTITY_SECTION_NAMES = Object.keys(ENTITY_SECTIONS) as EntitySection[];

const removable = z.array(ContentId).optional();

/** What one pack file may contain. Files are merged section by section. */
export const PackFile = z
  .object({
    resources: z.array(Resource).optional(),
    terrain: z.array(Terrain).optional(),
    nodes: z.array(ResourceNode).optional(),
    buildings: z.array(Building).optional(),
    units: z.array(UnitType).optional(),
    weathers: z.array(Weather).optional(),
    events: z.array(GameEvent).optional(),
    calendar: Calendar.optional(),
    map: MapDef.optional(),
    start: Start.optional(),
    economy: EconomyPatch.optional(),
    /** In a pack that extends another: ids to drop from the parent. */
    remove: z
      .object({
        resources: removable,
        terrain: removable,
        nodes: removable,
        buildings: removable,
        units: removable,
        weathers: removable,
        events: removable,
      })
      .strict()
      .optional(),
  })
  .strict();

export type ScenarioManifest = z.infer<typeof ScenarioManifest>;
export type Resource = z.infer<typeof Resource>;
export type Calendar = z.infer<typeof Calendar>;
export type Terrain = z.infer<typeof Terrain>;
export type ResourceNode = z.infer<typeof ResourceNode>;
export type Building = z.infer<typeof Building>;
export type UnitRole = z.infer<typeof UnitRole>;
export type UnitType = z.infer<typeof UnitType>;
export type Weather = z.infer<typeof Weather>;
export type Effect = z.infer<typeof Effect>;
export type GameEvent = z.infer<typeof GameEvent>;
export type MapDef = z.infer<typeof MapDef>;
export type Start = z.infer<typeof Start>;
export type EconomyParams = z.infer<typeof EconomyParams>;
export type PackFile = z.infer<typeof PackFile>;
export type LocaleTable = z.infer<typeof LocaleTable>;

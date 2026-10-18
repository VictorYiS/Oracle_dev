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

export const ScenarioManifest = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    engine: z.literal(ENGINE_SCHEMA_VERSION),
    extends: z.string().optional(),
    title: TextRef,
    tagline: TextRef.optional(),
    systems: z.array(SystemModule).default(["debt", "boons", "contracts", "rules", "oracle", "story"]),
    /** Proper nouns that must never appear in engine code (checked by tools/check-engine-neutral). */
    engine_forbidden_terms: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const Resource = z
  .object({
    id: ContentId.refine((id) => id.startsWith("res."), "resource ids start with res."),
    name: TextRef,
    tags: z.array(z.string()).default([]),
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

/** What one pack file may contain. Files are merged section by section. */
export const PackFile = z
  .object({
    resources: z.array(Resource).optional(),
    economy: EconomyPatch.optional(),
    /** In a pack that extends another: ids to drop from the parent. */
    remove: z
      .object({ resources: z.array(ContentId).optional() })
      .strict()
      .optional(),
  })
  .strict();

export type ScenarioManifest = z.infer<typeof ScenarioManifest>;
export type Resource = z.infer<typeof Resource>;
export type EconomyParams = z.infer<typeof EconomyParams>;
export type PackFile = z.infer<typeof PackFile>;
export type LocaleTable = z.infer<typeof LocaleTable>;

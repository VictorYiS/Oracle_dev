// Every way to change the world, as data. The player, the debug hook (and later rules and the
// Oracle) all submit these same commands through the bus.
import { z } from "zod";
import { ContentId } from "../content/schema";

export const CommandSource = z.enum(["manual", "script", "oracle", "debug"]);
export type CommandSource = z.infer<typeof CommandSource>;

const CaseId = z.string().regex(/^c\d+$/);
const base = {
  source: CommandSource.default("manual"),
  /**
   * If set, the command is refused when another command has been accepted since this version.
   * The version counts accepted commands only: time passing and routines do not change it.
   */
  basedOnVersion: z.number().int().min(0).optional(),
};

export const Command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("phase.advance"), ...base }).strict(),
  /** Walk along the current layer to x (to where you stand, to stop). */
  z.object({ type: z.literal("hero.walk"), to: z.number().int(), ...base }).strict(),
  /** Take a passage from the end you are standing at. Takes game time. */
  z.object({ type: z.literal("hero.cross"), passage: ContentId, ...base }).strict(),
  /** Let the time pass, up to dusk. */
  z.object({ type: z.literal("hero.wait"), minutes: z.number().int().min(1).max(1440), ...base }).strict(),
  /** Decide a case at the window yourself. */
  z
    .object({ type: z.literal("case.decide"), case: CaseId, action: z.enum(["approve", "deny"]), ...base })
    .strict(),
  /** Do what the Oracle suggests for a case; what it took for granted goes on the pending tray. */
  z.object({ type: z.literal("case.adopt"), case: CaseId, ...base }).strict(),
  /** Have the original papers behind a pending item fetched and read. Takes game time. */
  z.object({ type: z.literal("pending.read"), item: z.number().int().min(1), ...base }).strict(),
  /** Change the truth about a building behind everyone's back (tests and curious players). */
  z
    .object({
      type: z.literal("debug.truth"),
      building: ContentId,
      power: z.boolean().optional(),
      damaged: z.boolean().optional(),
      ...base,
    })
    .strict(),
  /** Change a building's records without changing the building. */
  z
    .object({
      type: z.literal("debug.record"),
      building: ContentId,
      known: z.boolean().optional(),
      power: z.boolean().optional(),
      damaged: z.boolean().optional(),
      ...base,
    })
    .strict(),
]);
export type Command = z.infer<typeof Command>;
export type CommandType = Command["type"];

export const COMMAND_TYPES: CommandType[] = [
  "phase.advance",
  "hero.walk",
  "hero.cross",
  "hero.wait",
  "case.decide",
  "case.adopt",
  "pending.read",
  "debug.truth",
  "debug.record",
];

/** Which sources may issue which commands. */
export const PERMISSIONS: Record<CommandType, CommandSource[]> = {
  "phase.advance": ["manual"],
  "hero.walk": ["manual"],
  "hero.cross": ["manual"],
  "hero.wait": ["manual"],
  "case.decide": ["manual"],
  "case.adopt": ["manual"],
  "pending.read": ["manual"],
  "debug.truth": ["debug"],
  "debug.record": ["debug"],
};

export const REJECTIONS = [
  "SCHEMA_INVALID",
  "NO_PERMISSION",
  "STALE_VERSION",
  "INVALID_TARGET",
  "INSUFFICIENT_RESOURCE",
  "PRECONDITION_FAILED",
] as const;
export type Rejection = (typeof REJECTIONS)[number];

export type CommandResult =
  { ok: true; seq: number } | { ok: false; seq: number; code: Rejection; reason: string };

/** One line of the command log: enough to replay the game exactly. */
export interface CommandRecord {
  seq: number;
  /** Clock tick when the command was submitted. */
  tick: number;
  command: unknown;
  result: "ok" | Rejection;
}

// Every way to change the world, as data. Manual play, rules (P2) and the Oracle (P3+) all
// submit these same commands through the bus.
import { z } from "zod";
import { ContentId } from "../content/schema";

export const CommandSource = z.enum(["manual", "script", "oracle"]);
export type CommandSource = z.infer<typeof CommandSource>;

const Tile = z.tuple([z.number().int(), z.number().int()]);
const UnitId = z.string().regex(/^u\d+$/);
const BuildingId = z.string().regex(/^b\d+$/);
const base = {
  source: CommandSource.default("manual"),
  /** If set, the command is refused when the world has changed since this version. */
  basedOnVersion: z.number().int().min(0).optional(),
};

export const Command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("phase.advance"), ...base }).strict(),
  z.object({ type: z.literal("unit.move"), unit: UnitId, to: Tile, ...base }).strict(),
  z.object({ type: z.literal("unit.gather"), unit: UnitId, at: Tile, ...base }).strict(),
  z.object({ type: z.literal("unit.build"), unit: UnitId, site: BuildingId, ...base }).strict(),
  z.object({ type: z.literal("unit.stop"), unit: UnitId, ...base }).strict(),
  z
    .object({ type: z.literal("unit.assign"), unit: UnitId, building: BuildingId.nullable(), ...base })
    .strict(),
  z.object({ type: z.literal("build.place"), building: ContentId, at: Tile, ...base }).strict(),
]);
export type Command = z.infer<typeof Command>;
export type CommandType = Command["type"];

export const COMMAND_TYPES: CommandType[] = [
  "phase.advance",
  "unit.move",
  "unit.gather",
  "unit.build",
  "unit.stop",
  "unit.assign",
  "build.place",
];

/** Which sources may issue which commands. Rules may direct units but not spend or end the day. */
export const PERMISSIONS: Record<CommandType, CommandSource[]> = {
  "phase.advance": ["manual"],
  "build.place": ["manual"],
  "unit.move": ["manual", "script"],
  "unit.gather": ["manual", "script"],
  "unit.build": ["manual", "script"],
  "unit.stop": ["manual", "script"],
  "unit.assign": ["manual", "script"],
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

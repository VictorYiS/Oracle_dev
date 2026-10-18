// The context a world runs in. A type only: holding a Ctx does not grant the right to write;
// writing goes through ./mutate, which only the world's systems and the command bus may import.
import type { PackIndex } from "./pack-index";
import type { WorldEvent, WorldState } from "./types";

export interface Ctx {
  s: WorldState;
  ix: PackIndex;
  log: WorldEvent[];
}

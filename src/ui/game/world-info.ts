// Read-only facts about the running world, for display.
import type { Session } from "../../app/session";
import { capacity } from "../../core/world/query";

export const capacityOf = (session: Session): number => capacity({ s: session.world, ix: session.game.ix });

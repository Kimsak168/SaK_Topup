import "server-only";
import { Game, type IGame } from "@/models/Game";
import type { QueryFilter } from "mongoose";
import { cachePublicQuery, CATALOGUE_TAG } from "./cacheService";
import { catalogueQuery, withCatalogueTimeout } from "./catalogueTiming";

// Only public game rules are cached. Player IDs, nicknames and supplier responses
// never enter this cache. All admin catalogue changes invalidate these rules.
export const getVerificationGame = cachePublicQuery(
  "verification-game-v1",
  CATALOGUE_TAG,
  async (supplier: string, identifier: string) => withCatalogueTimeout(
    catalogueQuery("verification-game", async () => Game.findOne({
      $or: [
        { supplier, supplierGameCode: identifier },
        { supplier, slug: identifier },
        { supplierGameCode: identifier },
        { slug: identifier },
      ],
    } as QueryFilter<IGame>).select("supplierGameCode requiresServer serverLabel -_id").maxTimeMS(4000).lean())
  )
);

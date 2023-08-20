import type { IDBPDatabase } from "idb";
import Cache from "./Cache";
import connectLeague, { type LeagueDB } from "./connectLeague";
import connectMeta, { type MetaDB } from "./connectMeta";
import * as getCopies from "./getCopies";
import * as getCopy from "./getCopy";

const idb: {
	cache: Cache;
	getCopies: typeof getCopies;
	getCopy: typeof getCopy;
	league: IDBPDatabase<LeagueDB>;
	meta: IDBPDatabase<MetaDB>;
} = {
	cache: new Cache(),
	getCopies,
	getCopy,
	// @ts-expect-error
	league: undefined,
	// @ts-expect-error
	meta: undefined,
};

export { Cache, connectLeague, connectMeta, idb };
export { default as getAll } from "./getAll";
export { default as iterate } from "./iterate";
export { default as reset } from "./reset";

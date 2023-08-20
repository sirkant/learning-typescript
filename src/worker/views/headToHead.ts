import { g, helpers } from "../util";
import type { UpdateEvents, ViewInput } from "../../common/types";
import { headToHead } from "../core";
import { idb } from "../db";

const updateHeadToHead = async (
	{ abbrev, season, tid, type }: ViewInput<"headToHead">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		((season === g.get("season") || season === "all") &&
			updateEvents.includes("gameSim")) ||
		season !== state.season ||
		tid !== state.tid ||
		type !== state.type
	) {
		const simpleSums = [
			"won",
			"lost",
			"tied",
			"otl",
			"pts",
			"oppPts",
			"seriesWon",
			"seriesLost",
			"finalsWon",
			"finalsLost",
		] as const;
		type TeamInfo = Record<typeof simpleSums[number], number> & {
			tid: number;
		};

		const totals = {
			won: 0,
			lost: 0,
			tied: 0,
			otl: 0,
			pts: 0,
			oppPts: 0,
			seriesWon: 0,
			seriesLost: 0,
			finalsWon: 0,
			finalsLost: 0,
			winp: 0,
		};

		const infoByTid = new Map<number, TeamInfo>();

		await headToHead.iterate(
			{
				tid,
				type,
				season,
			},
			info => {
				const current = infoByTid.get(info.tid);
				if (current) {
					for (const key of simpleSums) {
						current[key] += info[key];
					}
				} else {
					infoByTid.set(info.tid, info);
				}

				for (const key of simpleSums) {
					totals[key] += info[key];
				}
			},
		);

		const teamInfos = await idb.getCopies.teamsPlus(
			{
				attrs: ["tid"],
				seasonAttrs: ["region", "name", "abbrev", "imgURL", "imgURLSmall"],
				season: season === "all" ? g.get("season") : season,
				addDummySeason: true,
			},
			"noCopyCache",
		);

		const teams = Array.from(infoByTid.values()).map(info => {
			const t = teamInfos.find(t => t.tid === info.tid);
			if (!t) {
				throw new Error("Team not found");
			}
			return {
				...info,
				...t,
				winp: helpers.calcWinp(info),
			};
		});

		totals.winp = helpers.calcWinp(totals);

		let ties = false;
		let otl = false;
		for (const t of teams) {
			if (t.tied > 0) {
				ties = true;
			}
			if (t.otl > 0) {
				otl = true;
			}
			if (ties && otl) {
				break;
			}
		}

		return {
			abbrev,
			season,
			teams,
			tid,
			ties: g.get("ties", season === "all" ? "current" : season) || ties,
			otl: g.get("otl", season === "all" ? "current" : season) || otl,
			totals,
			type,
			userTid: g.get("userTid"),
		};
	}
};

export default updateHeadToHead;

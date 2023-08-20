import g from "./g";
import getProcessedGames from "./getProcessedGames";
import toUI from "./toUI";
import type { LocalStateUI } from "../../common/types";
import { getUpcoming } from "../views/schedule";

const initUILocalGames = async () => {
	const userTid = g.get("userTid");

	// Start with completed games
	const games: LocalStateUI["games"] = (
		await getProcessedGames({
			abbrev: g.get("teamInfoCache")[userTid]?.abbrev,
			season: g.get("season"),
			includeAllStarGame: true,
		})
	).map(game => ({
		forceWin: game.forceWin,
		gid: game.gid,
		overtimes: game.overtimes,
		numPeriods: game.numPeriods,
		teams: [
			{
				ovr: game.teams[0].ovr,
				pts: game.teams[0].pts,
				tid: game.teams[0].tid,
				playoffs: game.teams[0].playoffs,
			},
			{
				ovr: game.teams[1].ovr,
				pts: game.teams[1].pts,
				tid: game.teams[1].tid,
				playoffs: game.teams[1].playoffs,
			},
		],
	}));
	games.reverse();

	// Add upcoming games
	const upcoming = await getUpcoming({ tid: userTid });
	for (const game of upcoming) {
		games.push({
			gid: game.gid,
			teams: [
				{
					ovr: game.teams[0].ovr,
					tid: game.teams[0].tid,
					playoffs: game.teams[0].playoffs,
				},
				{
					ovr: game.teams[1].ovr,
					tid: game.teams[1].tid,
					playoffs: game.teams[1].playoffs,
				},
			],
		});
	}

	await toUI("updateLocal", [
		{
			games,
		},
	]);
};

export default initUILocalGames;

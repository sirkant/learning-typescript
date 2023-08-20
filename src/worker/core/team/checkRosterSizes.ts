import { bySport, PLAYER, POSITION_COUNTS } from "../../../common";
import { player, freeAgents } from "..";
import rosterAutoSort from "./rosterAutoSort";
import { idb } from "../../db";
import { g, helpers, local } from "../../util";
import type { MinimalPlayerRatings, Player } from "../../../common/types";
import { KEY_POSITIONS_NEEDED } from "../freeAgents/getBest";

export const dropPlayers = async (
	players: Player<MinimalPlayerRatings>[],
	numToDrop: number,
) => {
	// Automatically drop lowest value players until we reach g.get("maxRosterSize")

	// Only drop player from a position there is an excess of (no dropping your only kicker)
	let counts;
	let countsHealthyKey;
	if (
		bySport({
			baseball: true,
			basketball: false,
			football: true,
			hockey: true,
		})
	) {
		counts = { ...POSITION_COUNTS };
		for (const pos of Object.keys(counts)) {
			counts[pos] = 0;
		}

		if (KEY_POSITIONS_NEEDED) {
			countsHealthyKey = {} as Record<string, number>;
			for (const pos of KEY_POSITIONS_NEEDED) {
				countsHealthyKey[pos] = 0;
			}
		}

		for (const p of players) {
			const pos = p.ratings.at(-1)!.pos;

			if (counts[pos] !== undefined) {
				counts[pos] += 1;
			}

			if (
				countsHealthyKey?.[pos] !== undefined &&
				p.injury.gamesRemaining === 0
			) {
				countsHealthyKey[pos] += 1;
			}
		}

		let validPositions = [];
		for (const [pos, count] of Object.entries(counts)) {
			if (count > POSITION_COUNTS[count]) {
				validPositions.push(pos);
			}
		}

		// Should be impossible, but just in case, include all players except K/P
		if (validPositions.length === 0) {
			validPositions = Object.keys(POSITION_COUNTS).filter(
				pos => pos !== "K" && pos !== "P",
			);
		}
	}

	players.sort((a, b) => a.value - b.value); // Lowest first

	const releasedPIDs = [];
	for (const p of players) {
		if (
			counts &&
			bySport({
				baseball: true,
				basketball: false,
				football: true,
				hockey: true,
			})
		) {
			const pos = p.ratings.at(-1)!.pos;

			if (countsHealthyKey) {
				// If this is a key position and there is only one healthy player, keep the healthy player
				if (countsHealthyKey[pos] <= 1 && p.injury.gamesRemaining === 0) {
					continue;
				}
			}

			// Use 1 rather than POSITION_COUNTS[pos], just to be sure it's not some weird league where POSITION_COUNTS don't apply
			if (counts[pos] <= 1) {
				continue;
			}

			counts[pos] -= 1;

			if (countsHealthyKey?.[pos] !== undefined) {
				countsHealthyKey[pos] -= 1;
			}
		}

		await player.release(p, false);
		releasedPIDs.push(p.pid);

		if (releasedPIDs.length >= numToDrop) {
			break;
		}
	}

	return releasedPIDs;
};

/**
 * Check roster size limits
 *
 * If any AI team is over the maximum roster size, cut their worst players.
 * If any AI team is under the minimum roster size, sign minimum contract
 * players until the limit is reached. If the user's team is breaking one of
 * these roster size limits, display a warning.
 *
 * @memberOf core.team
 * @return {Promise.?string} Resolves to null if there is no error, or a string with the error message otherwise.
 */
const checkRosterSizes = async (
	userOrOther: "user" | "other",
): Promise<string | void> => {
	const minFreeAgents: Player[] = [];
	let userTeamSizeError: string | undefined;

	const releasedPIDs: number[] = [];

	const checkRosterSize = async (tid: number, userTeamAndActive: boolean) => {
		const players = await idb.cache.players.indexGetAll("playersByTid", tid);
		let numPlayersOnRoster = players.length;

		if (numPlayersOnRoster > g.get("maxRosterSize")) {
			if (userTeamAndActive) {
				if (g.get("userTids").length <= 1) {
					userTeamSizeError = "Your team has ";
				} else {
					userTeamSizeError = `The ${g.get("teamInfoCache")[tid]?.region} ${
						g.get("teamInfoCache")[tid]?.name
					} have `;
				}

				userTeamSizeError += `more than the maximum number of players (${g.get(
					"maxRosterSize",
				)}). You must remove players (by <a href="${helpers.leagueUrl([
					"roster",
				])}">releasing them from your roster</a> or through <a href="${helpers.leagueUrl(
					["trade"],
				)}">trades</a>) before continuing.`;
			} else {
				const releasedPIDsTemp = await dropPlayers(
					players,
					numPlayersOnRoster - g.get("maxRosterSize"),
				);
				releasedPIDs.push(...releasedPIDsTemp);
			}
		} else if (numPlayersOnRoster < g.get("minRosterSize")) {
			if (userTeamAndActive) {
				if (g.get("userTids").length <= 1) {
					userTeamSizeError = "Your team has ";
				} else {
					userTeamSizeError = `The ${g.get("teamInfoCache")[tid]?.region} ${
						g.get("teamInfoCache")[tid]?.name
					} have `;
				}

				userTeamSizeError += `less than the minimum number of players (${g.get(
					"minRosterSize",
				)}). You must add players (through <a href="${helpers.leagueUrl([
					"free_agents",
				])}">free agency</a> or <a href="${helpers.leagueUrl([
					"trade",
				])}">trades</a>) before continuing.<br><br>Reminder: you can always sign free agents to ${helpers.formatCurrency(
					g.get("minContract") / 1000,
					"M",
					2,
				)}/yr contracts, even if you're over the cap!`;
			} else {
				// Auto-add players
				while (numPlayersOnRoster < g.get("minRosterSize")) {
					// See also core.phase
					let p: any = minFreeAgents.shift();

					if (!p) {
						p = await player.genRandomFreeAgent();
					}

					await player.sign(p, tid, p.contract, g.get("phase"));
					await idb.cache.players.put(p);
					numPlayersOnRoster += 1;
				}
			}
		}

		// Auto sort rosters (except player's team)
		// This will sort all AI rosters before every game. Excessive? It could change some times, but usually it won't
		const t = await idb.cache.teams.get(tid);
		if (!userTeamAndActive || (t && t.keepRosterSorted)) {
			await rosterAutoSort(tid);
		}
	};

	const players = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);

	// List of free agents looking for minimum contracts, sorted by value. This is used to bump teams up to the minimum roster size.
	for (let i = 0; i < players.length; i++) {
		if (players[i].contract.amount === g.get("minContract")) {
			minFreeAgents.push(players[i]);
		}
	}

	minFreeAgents.sort((a, b) => b.value - a.value); // Make sure teams are all within the roster limits

	const teams = await idb.cache.teams.getAll();
	for (const t of teams) {
		if (t.disabled) {
			continue;
		}

		const userTeamAndActive =
			g.get("userTids").includes(t.tid) &&
			!local.autoPlayUntil &&
			!g.get("spectator");

		if (
			(userTeamAndActive && userOrOther === "user") ||
			(!userTeamAndActive && userOrOther === "other")
		) {
			await checkRosterSize(t.tid, userTeamAndActive);
		}

		if (userTeamSizeError) {
			break;
		}
	}

	if (releasedPIDs.length > 0) {
		await freeAgents.normalizeContractDemands({
			type: "dummyExpiringContracts",
			pids: releasedPIDs,
		});
	}

	return userTeamSizeError;
};

export default checkRosterSizes;

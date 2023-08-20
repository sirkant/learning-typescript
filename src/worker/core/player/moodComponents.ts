import { finances } from "..";
import { isSport, PHASE, PLAYER } from "../../../common";
import { facilitiesEffectMood } from "../../../common/budgetLevels";
import type { MoodComponents, Player } from "../../../common/types";
import { idb } from "../../db";
import { g, helpers, local } from "../../util";

const getMinFractionDiff = async (pid: number, tid: number) => {
	if (!isSport("basketball")) {
		return 0;
	}

	if (!local.minFractionDiffs) {
		const season = g.get("season");
		const playersAll = await idb.cache.players.getAll();

		const players = [];
		for (const p of playersAll) {
			let stats;
			for (let i = p.stats.length - 1; i >= 0; i--) {
				if (p.stats[i].season === season && !p.stats[i].playoffs) {
					stats = p.stats[i];
				} else if (p.stats[i] < season) {
					break;
				}
			}

			if (stats) {
				if (stats.minAvailable !== undefined && stats.minAvailable > 500) {
					players.push({
						pid: p.pid,
						tid: stats.tid,
						value: p.valueNoPot,

						// Fraction of available minutes that this player played
						fraction: stats.min / stats.minAvailable,
					});
				}
			}
		}

		players.sort((a, b) => b.value - a.value);

		local.minFractionDiffs = {};

		if (players.length < 100) {
			return 0;
		}

		// Logistic regression would be better than binning to find expected value, but no good library
		const BIN_SIZE = 20;
		const numBins = Math.ceil(players.length / BIN_SIZE);
		for (let i = 0; i < numBins; i++) {
			const binPlayers = players.slice(i * BIN_SIZE, (i + 1) * BIN_SIZE);
			let average = 0;
			for (const p of binPlayers) {
				average += p.fraction;
			}
			average /= binPlayers.length;
			for (const p of binPlayers) {
				local.minFractionDiffs[p.pid] = {
					tid: p.tid,
					diff: p.fraction - average,
				};
			}
		}
	}

	const p = local.minFractionDiffs[pid];
	if (!p || p.tid !== tid) {
		return 0;
	}

	return p.diff;
};

// Make components -2 to 2, then scale with traits to -5 to 5
const moodComponents = async (
	p: Player,
	tid: number,
): Promise<MoodComponents> => {
	const season = g.get("season");
	const phase = g.get("phase");

	const teamSeasons = await idb.cache.teamSeasons.indexGetAll(
		"teamSeasonsByTidSeason",
		[
			[tid, season - 2],
			[tid, season],
		],
	);
	const currentTeamSeason = teamSeasons.find(ts => ts.season === season);

	const teams = helpers.addPopRank(
		(await idb.cache.teams.getAll()).filter(t => !t.disabled),
	);
	const t = teams.find(t => t.tid === tid);
	if (!t) {
		throw new Error(`tid ${tid} not found`);
	}

	const components = {
		marketSize: 0,
		facilities: 0,
		teamPerformance: 0,
		hype: 0,
		loyalty: 0,
		trades: 0,
		playingTime: 0,
		rookieContract: 0,
		difficulty: 0,
	};

	{
		// MARKET SIZE: -2 to 2, based on population rank
		const marketSize0to1 = (teams.length - t.popRank) / (teams.length - 1);
		components.marketSize = -2 + marketSize0to1 * 4;
	}

	{
		// FACILITIES: -2 to 2, based on facilities level
		const facilitiesLevel = await finances.getLevelLastThree("facilities", {
			t,
			teamSeasons,
		});
		components.facilities = facilitiesEffectMood(facilitiesLevel);
	}

	{
		// TEAM PERFORMANCE: -2 means no playoffs and 25% winning percentage. +2 means championship and 60% winning percentage, or 75% winning percentage
		if (currentTeamSeason) {
			const projectedRecord = {
				won: currentTeamSeason.won,
				lost: currentTeamSeason.lost,
				tied: currentTeamSeason.tied,
				otl: currentTeamSeason.otl,
			};

			// If a custom league file starts after the regular season, don't assume all teams have 0 winning percentage
			const leagueFileFromAfterSeason =
				g.get("phase") >= PHASE.PLAYOFFS &&
				projectedRecord.won === 0 &&
				projectedRecord.lost === 0 &&
				projectedRecord.tied === 0 &&
				projectedRecord.otl === 0;
			if (!leagueFileFromAfterSeason) {
				let wonTitle = false;

				// If season ongoing, project record and playoff success based on last year
				if (phase < PHASE.PLAYOFFS) {
					const previousSeason = teamSeasons.find(
						ts => ts.season === season - 1,
					);
					const previousRecord = {
						won: previousSeason ? previousSeason.won : 0,
						lost: previousSeason ? previousSeason.lost : 0,
						tied: previousSeason ? previousSeason.tied : 1,
						otl: previousSeason ? previousSeason.otl : 0,
					};

					const fractionComplete =
						(projectedRecord.won +
							projectedRecord.lost +
							projectedRecord.tied +
							projectedRecord.otl) /
						g.get("numGames");

					const currentGames =
						projectedRecord.won +
						projectedRecord.lost +
						projectedRecord.tied +
						projectedRecord.otl;
					const previousGames =
						previousRecord.won +
						previousRecord.lost +
						previousRecord.tied +
						previousRecord.otl;

					const remainingGames = helpers.bound(
						g.get("numGames") - currentGames,
						0,
						Infinity,
					);

					for (const key of ["won", "lost", "tied", "otl"] as const) {
						const currentFraction =
							currentGames > 0 ? projectedRecord[key] / currentGames : 0;
						const previousFraction =
							previousGames > 0 ? previousRecord[key] / previousGames : 0;

						projectedRecord[key] +=
							(currentFraction * fractionComplete +
								previousFraction * (1 - fractionComplete)) *
							remainingGames;
					}

					if (previousSeason) {
						wonTitle =
							previousSeason.playoffRoundsWon >=
							g.get("numGamesPlayoffSeries", season - 1).length;
					}
				} else {
					wonTitle =
						currentTeamSeason.playoffRoundsWon >=
						g.get("numGamesPlayoffSeries", "current").length;
				}

				let winp = helpers.calcWinp(projectedRecord);
				if (wonTitle) {
					// If won title, equivalent to extra 15%, so 60% winp and title maxes it out
					winp += 0.15;
				}

				if (isSport("hockey")) {
					// 40% to 60% -> -2 to 2
					components.teamPerformance = -2 + ((winp - 0.4) * 4) / 0.2;
				} else {
					// 25% to 75% -> -2 to 2
					components.teamPerformance = -2 + ((winp - 0.25) * 4) / 0.5;
				}

				// Negative matters more
				if (isSport("basketball") && components.teamPerformance < 0) {
					components.teamPerformance *= 2;
				}

				// Set upper bound, in case went over due to playoff bonus
				components.teamPerformance = helpers.bound(
					components.teamPerformance,
					-Infinity,
					2,
				);
			}
		}
	}

	{
		// HYPE
		if (currentTeamSeason) {
			components.hype = -2 + 4 * currentTeamSeason.hype;
		}
	}

	{
		// LOYALTY
		const numSeasonsWithTeam = p.stats.filter(row => row.tid === tid).length;
		components.loyalty = numSeasonsWithTeam / 8;

		if (
			p.tid === tid ||
			(p.tid === PLAYER.FREE_AGENT && phase === PHASE.RESIGN_PLAYERS)
		) {
			// Wants to re-sign
			components.loyalty += isSport("football") ? 5 : 2;
		}
	}

	{
		// TRADES
		let numPlayersTradedAwayNormalized = 0;
		for (const teamSeason of teamSeasons) {
			if (teamSeason.season === season - 2) {
				numPlayersTradedAwayNormalized +=
					teamSeason.numPlayersTradedAway * 0.25;
			} else if (teamSeason.season === season - 1) {
				numPlayersTradedAwayNormalized += teamSeason.numPlayersTradedAway * 0.5;
			} else if (teamSeason.season === season) {
				numPlayersTradedAwayNormalized +=
					teamSeason.numPlayersTradedAway * 0.75;
			}
		}

		components.trades = helpers.bound(
			-(numPlayersTradedAwayNormalized - 5) / 4,
			-Infinity,
			0,
		);
	}

	{
		// PLAYING TIME
		const diff = await getMinFractionDiff(p.pid, tid);
		components.playingTime = diff * 10;
	}

	{
		// ROOKIE CONTRACT
		if (
			p.contract.rookieResign ||
			p.contract.rookie ||
			p.tid === PLAYER.UNDRAFTED
		) {
			components.rookieContract = 8;
		}
	}

	// Apply difficulty modulation
	const difficulty = g.get("difficulty");
	if (g.get("userTids").includes(tid)) {
		if (difficulty !== 0) {
			for (const key of helpers.keys(components)) {
				// Higher difficulty should result in lower mood, but we don't want to swap signs because that'd make for weird output (like complaining about team success when you won the title... but it's okay to just have it at 0 and say nothing)
				if (difficulty > 0) {
					if (components[key] > 0) {
						components[key] /= 1 + difficulty;
					} else {
						components[key] *= 1 + difficulty;
					}
				} else {
					if (components[key] > 0) {
						components[key] *= 1 - difficulty;
					} else {
						components[key] /= 1 - difficulty;
					}
				}
			}
		}
	} else {
		// At default difficulty, make players more likely to refuse. Decrease this, and players will be more likely to enter free agency
		const amount = 0.5 - helpers.bound(difficulty / 2, -0.25, 0.25);
		for (const key of helpers.keys(components)) {
			if (amount > 0) {
				if (components[key] > 0) {
					components[key] /= 1 + amount;
				} else {
					components[key] *= 1 + amount;
				}
			} else {
				if (components[key] > 0) {
					components[key] *= 1 - amount;
				} else {
					components[key] /= 1 - amount;
				}
			}
		}
	}

	// Bound all components - they don't all have the same bounds!
	components.marketSize = helpers.bound(components.marketSize, -2, 2);
	components.facilities = helpers.bound(components.facilities, -2, 2);
	components.teamPerformance = helpers.bound(
		components.teamPerformance,
		-Infinity,
		2,
	);
	components.hype = helpers.bound(components.hype, -2, 2);
	components.loyalty = helpers.bound(components.loyalty, 0, Infinity);
	components.trades = helpers.bound(components.trades, -Infinity, 0);
	components.playingTime = helpers.bound(components.playingTime, -Infinity, 2);
	components.rookieContract = helpers.bound(
		components.rookieContract,
		0,
		Infinity,
	);

	// Apply traits modulation
	if (g.get("playerMoodTraits")) {
		if (p.moodTraits.includes("F")) {
			components.marketSize *= 2.5;
			components.hype *= 2.5;
			components.playingTime *= 2.5;
		}
		if (p.moodTraits.includes("L")) {
			components.marketSize *= 0.5;
			components.loyalty *= 2.5;
			components.trades *= 2.5;
		}
		if (p.moodTraits.includes("$")) {
			components.facilities *= 1.5;
			components.marketSize *= 0.5;
			components.teamPerformance *= 0.5;
		}
		if (p.moodTraits.includes("W")) {
			components.marketSize *= 0.5;
			components.playingTime *= 0.5;
			components.teamPerformance *= 2.5;
		}
	}

	return components;
};

export default moodComponents;

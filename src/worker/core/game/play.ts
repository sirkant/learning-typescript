import { ALL_STAR_GAME_ONLY, isSport, PHASE } from "../../../common";
import {
	GameSim,
	allStar,
	freeAgents,
	phase,
	player,
	season,
	team,
	trade,
} from "..";
import loadTeams from "./loadTeams";
import updatePlayoffSeries from "./updatePlayoffSeries";
import writeGameStats from "./writeGameStats";
import writePlayerStats, {
	P_FATIGUE_DAILY_REDUCTION,
} from "./writePlayerStats";
import writeTeamStats from "./writeTeamStats";
import { idb } from "../../db";
import {
	advStats,
	g,
	helpers,
	lock,
	logEvent,
	toUI,
	updatePlayMenu,
	updateStatus,
	recomputeLocalUITeamOvrs,
	local,
} from "../../util";
import type {
	Conditions,
	ScheduleGame,
	UpdateEvents,
} from "../../../common/types";
import allowForceTie from "../../../common/allowForceTie";

/**
 * Play one or more days of games.
 *
 * This also handles the case where there are no more games to be played by switching the phase to either the playoffs or before the draft, as appropriate.
 *
 * @memberOf core.game
 * @param {number} numDays An integer representing the number of days to be simulated. If numDays is larger than the number of days remaining, then all games will be simulated up until either the end of the regular season or the end of the playoffs, whichever happens first.
 * @param {boolean} start Is this a new request from the user to play games (true) or a recursive callback to simulate another day (false)? If true, then there is a check to make sure simulating games is allowed. Default true.
 * @param {number?} gidOneGame Game ID number if we just want to sim one game rather than the whole day. Must be defined if playByPlay is true.
 * @param {boolean?} playByPlay When true, an array of strings representing the play-by-play game simulation are included in the api.realtimeUpdate raw call.
 */
const play = async (
	numDays: number,
	conditions: Conditions,
	start: boolean = true,
	gidOneGame?: number,
	playByPlay?: boolean,
) => {
	// This is called when there are no more games to play, either due to the user's request (e.g. 1 week) elapsing or at the end of the regular season
	const cbNoGames = async (playoffsOver: boolean = false) => {
		await updateStatus("Saving...");
		await idb.cache.flush();
		await updateStatus("Idle");
		await lock.set("gameSim", false);

		// Check to see if the season is over
		const schedule = await season.getSchedule();
		if (g.get("phase") < PHASE.PLAYOFFS) {
			if (schedule.length === 0) {
				await phase.newPhase(
					PHASE.PLAYOFFS,
					conditions,
					gidOneGame !== undefined,
				);
			}
		} else if (playoffsOver) {
			await phase.newPhase(
				PHASE.DRAFT_LOTTERY,
				conditions,
				gidOneGame !== undefined,
			);
		}

		if (schedule.length > 0 && !playoffsOver) {
			const allStarNext = await allStar.nextGameIsAllStar(schedule);

			if (allStarNext && gidOneGame === undefined) {
				toUI(
					"realtimeUpdate",
					[
						[],
						helpers.leagueUrl(
							ALL_STAR_GAME_ONLY ? ["all_star", "teams"] : ["all_star"],
						),
					],
					conditions,
				);
			}
		}

		await updatePlayMenu();
	};

	// Saves a vector of results objects for a day, as is output from cbSimGames
	const cbSaveResults = async (results: any[], dayOver: boolean) => {
		// Before writeGameStats, so LeagueTopBar can not update with game result
		if (gidOneGame !== undefined && playByPlay) {
			await toUI("updateLocal", [{ liveGameInProgress: true }]);
		}

		// Before writeGameStats, so injury is set correctly
		const { injuryTexts, pidsInjuredOneGameOrLess, stopPlay } =
			await writePlayerStats(results, conditions);

		const gidsFinished = await Promise.all(
			results.map(async result => {
				const att = await writeTeamStats(result);
				await writeGameStats(result, att, conditions);
				return result.gid;
			}),
		);

		// Delete finished games from schedule
		for (const gid of gidsFinished) {
			if (typeof gid === "number") {
				await idb.cache.schedule.delete(gid);
			}
		}

		// Invalidate leaders cache, if it exists
		local.seasonLeaders = undefined;

		if (g.get("phase") === PHASE.PLAYOFFS) {
			// Update playoff series W/L
			await updatePlayoffSeries(results, conditions);
		} else {
			// Update clinchedPlayoffs, only if there are games left in the schedule. Otherwise, this would be inaccruate (not correctly accounting for tiebreakers) and redundant (going to be called again on phase change)
			const schedule = await season.getSchedule();
			if (schedule.length > 0) {
				await team.updateClinchedPlayoffs(false, conditions);
			}
		}

		if (injuryTexts.length > 0) {
			logEvent(
				{
					type: "injuredList",
					text: injuryTexts.join("<br>"),
					showNotification: true,
					persistent: stopPlay,
					saveToDb: false,
				},
				conditions,
			);
		}

		const updateEvents: UpdateEvents = ["gameSim"];

		if (dayOver) {
			local.minFractionDiffs = undefined;

			const healedTexts: string[] = [];

			// Injury countdown - This must be after games are saved, of there is a race condition involving new injury assignment in writeStats. Free agents are handled in decreaseDemands.
			const players = await idb.cache.players.indexGetAll("playersByTid", [
				0,
				Infinity,
			]);

			for (const p of players) {
				let changed = false;

				if (p.injury.gamesRemaining > 0) {
					p.injury.gamesRemaining -= 1;
					changed = true;
				}

				if (isSport("baseball") && p.pFatigue !== undefined && p.pFatigue > 0) {
					p.pFatigue = helpers.bound(
						p.pFatigue - P_FATIGUE_DAILY_REDUCTION,
						0,
						100,
					);
					changed = true;
				}

				// Is it already over?
				if (p.injury.type !== "Healthy" && p.injury.gamesRemaining <= 0) {
					const score = p.injury.score;
					p.injury = {
						type: "Healthy",
						gamesRemaining: 0,
					};
					changed = true;
					const healedText = `${
						p.ratings.at(-1)!.pos
					} <a href="${helpers.leagueUrl(["player", p.pid])}">${p.firstName} ${
						p.lastName
					}</a>`;

					if (
						p.tid === g.get("userTid") &&
						!pidsInjuredOneGameOrLess.has(p.pid)
					) {
						healedTexts.push(healedText);
					}

					logEvent(
						{
							type: "healed",
							text: `${healedText} has recovered from ${helpers.pronoun(
								g.get("gender"),
								"his",
							)} injury.`,
							showNotification: false,
							pids: [p.pid],
							tids: [p.tid],
							score,
						},
						conditions,
					);
				}

				// Also check for gamesUntilTradable
				if (p.gamesUntilTradable === undefined) {
					p.gamesUntilTradable = 0; // Initialize for old leagues

					changed = true;
				} else if (p.gamesUntilTradable > 0) {
					p.gamesUntilTradable -= 1;
					changed = true;
				}

				if (changed) {
					await idb.cache.players.put(p);
				}
			}

			if (healedTexts.length > 0) {
				logEvent(
					{
						type: "healedList",
						text: healedTexts.join("<br>"),
						showNotification: true,
						saveToDb: false,
					},
					conditions,
				);
			}

			// Tragic deaths only happen during the regular season!
			if (
				g.get("phase") !== PHASE.PLAYOFFS &&
				Math.random() < g.get("tragicDeathRate")
			) {
				await player.killOne(conditions);

				if (g.get("stopOnInjury")) {
					await lock.set("stopGameSim", true);
				}

				updateEvents.push("playerMovement");
			}

			// Do this stuff after injuries, so autoSign knows the injury status of players for the next game
			const phase = g.get("phase");
			if (
				phase === PHASE.REGULAR_SEASON ||
				phase === PHASE.AFTER_TRADE_DEADLINE
			) {
				await freeAgents.decreaseDemands();
				await freeAgents.autoSign();
			}
			if (phase === PHASE.REGULAR_SEASON) {
				await trade.betweenAiTeams();
			}
		}

		// More stuff for LeagueTopBar - update ovrs based on injuries
		await recomputeLocalUITeamOvrs();

		await advStats();

		const playoffsOver =
			g.get("phase") === PHASE.PLAYOFFS &&
			(await season.newSchedulePlayoffsDay());

		let raw;
		let url;

		// If there was a play by play done for one of these games, get it
		if (gidOneGame !== undefined && playByPlay) {
			for (let i = 0; i < results.length; i++) {
				if (results[i].playByPlay !== undefined) {
					raw = {
						gidOneGame,
						playByPlay: results[i].playByPlay,
					};
					url = helpers.leagueUrl(["live_game"]);
				}
			}

			// This is not ideal... it means no event will be sent to other open tabs. But I don't have a way of saying "send this update to all tabs except X" currently
			await toUI("realtimeUpdate", [updateEvents, url, raw], conditions);
		} else {
			url = undefined;
			await toUI("realtimeUpdate", [updateEvents]);
		}

		if (numDays - 1 <= 0 || playoffsOver) {
			await cbNoGames(playoffsOver);
		} else {
			await play(numDays - 1, conditions, false);
		}
	};

	const getResult = ({
		gid,
		day,
		teams,
		doPlayByPlay = false,
		homeCourtFactor = 1,
		disableHomeCourtAdvantage = false,
	}: {
		gid: number;
		day: number | undefined;
		teams: [any, any];
		doPlayByPlay?: boolean;
		homeCourtFactor?: number;
		disableHomeCourtAdvantage?: boolean;
	}) => {
		let dh;
		if (isSport("baseball")) {
			const dhSetting = g.get("dh");
			const cidHome = teams[0].cid;
			dh =
				dhSetting === "all" ||
				(Array.isArray(dhSetting) && dhSetting.includes(cidHome));
		}

		// In FBGM, need to do depth chart generation here (after deepCopy in forceWin case) to maintain referential integrity of players (same object in depth and team).
		for (const t of teams) {
			if (t.depth !== undefined) {
				t.depth = team.getDepthPlayers(t.depth, t.player, dh);
			}
		}

		let baseInjuryRate;
		const allStarGame = teams[0].id === -1 && teams[1].id === -2;
		if (allStarGame) {
			// Fewer injuries in All-Star Game, and no injuries in playoffs All-Star Game
			if (g.get("phase") === PHASE.PLAYOFFS) {
				baseInjuryRate = 0;
			} else {
				baseInjuryRate = g.get("injuryRate") / 4;
			}
		} else {
			baseInjuryRate = g.get("injuryRate");
		}

		return new GameSim({
			gid,
			day,
			teams,
			doPlayByPlay,
			homeCourtFactor,
			disableHomeCourtAdvantage: disableHomeCourtAdvantage || allStarGame,
			allStarGame,
			baseInjuryRate,

			// @ts-expect-error
			dh,
		}).run();
	};

	// Simulates a day of games (whatever is in schedule) and passes the results to cbSaveResults
	const cbSimGames = async (
		schedule: ScheduleGame[],
		teams: Record<number, any>,
		dayOver: boolean,
	) => {
		const results: any[] = [];

		for (const game of schedule) {
			const doPlayByPlay = gidOneGame === game.gid && playByPlay;

			const teamsInput = [teams[game.homeTid], teams[game.awayTid]] as any;

			const forceTie = game.forceWin === "tie";
			const invalidForceTie =
				forceTie &&
				!allowForceTie({
					homeTid: game.homeTid,
					awayTid: game.awayTid,
					ties: g.get("ties", "current"),
					phase: g.get("phase"),
					elam: g.get("elam"),
					elamASG: g.get("elamASG"),
				});

			if (g.get("godMode") && game.forceWin !== undefined && !invalidForceTie) {
				const NUM_TRIES = 2000;
				const START_CHANGING_HOME_COURT_ADVANTAGE = NUM_TRIES / 4;

				const forceWinHome = game.forceWin === game.homeTid;
				let homeCourtFactor = 1;

				let found = false;
				let homeWonLastGame = false;
				let homeWonCounter = 0;
				for (let i = 0; i < NUM_TRIES; i++) {
					if (i >= START_CHANGING_HOME_COURT_ADVANTAGE) {
						if (!forceTie) {
							// Scale from 1x to 3x linearly, after staying at 1x for some time
							homeCourtFactor =
								1 +
								(2 * (i - START_CHANGING_HOME_COURT_ADVANTAGE)) /
									(NUM_TRIES - START_CHANGING_HOME_COURT_ADVANTAGE);

							if (!forceWinHome) {
								homeCourtFactor = 1 / homeCourtFactor;
							}
						} else {
							// Keep track of homeWonCounter only after START_CHANGING_HOME_COURT_ADVANTAGE
							if (homeWonLastGame) {
								homeWonCounter += 1;
							} else {
								homeWonCounter -= 1;
							}

							// Scale from 1 to 3, where 3 happens when homeWonCounter is 1000
							homeCourtFactor =
								1 + Math.min(2, (Math.abs(homeWonCounter) * 2) / 1000);

							if (homeWonCounter > 0) {
								homeCourtFactor = 1 / homeCourtFactor;
							}
						}
					}

					const result = getResult({
						gid: game.gid,
						day: game.day,
						teams: helpers.deepCopy(teamsInput), // So stats start at 0 each time
						doPlayByPlay,
						homeCourtFactor,
					});

					let wonTid: number | undefined;
					if (result.team[0].stat.pts > result.team[1].stat.pts) {
						wonTid = result.team[0].id;
						homeWonLastGame = true;
					} else if (result.team[0].stat.pts < result.team[1].stat.pts) {
						wonTid = result.team[1].id;
						homeWonLastGame = false;
					}

					if (
						(forceTie && wonTid === undefined) ||
						(!forceTie && wonTid === game.forceWin)
					) {
						found = true;
						(result as any).forceWin = i + 1;
						results.push(result);
						break;
					}
				}

				if (!found) {
					const teamInfoCache = g.get("teamInfoCache");

					let suffix: string;
					if (game.forceWin === "tie") {
						suffix = `the ${teamInfoCache[game.homeTid].region} ${
							teamInfoCache[game.homeTid].name
						} tied the ${teamInfoCache[game.awayTid].region} ${
							teamInfoCache[game.awayTid].name
						}`;
					} else {
						const otherTid = forceWinHome ? game.awayTid : game.homeTid;

						suffix = `the ${teamInfoCache[game.forceWin].region} ${
							teamInfoCache[game.forceWin].name
						} beat the ${teamInfoCache[otherTid].region} ${
							teamInfoCache[otherTid].name
						}`;
					}

					logEvent(
						{
							type: "error",
							text: `Could not find a simulation in ${helpers.numberWithCommas(
								NUM_TRIES,
							)} tries where ${suffix}.`,
							showNotification: true,
							persistent: true,
							saveToDb: false,
						},
						conditions,
					);
					await lock.set("stopGameSim", true);
				}
			} else {
				let disableHomeCourtAdvantage = false;
				if (isSport("football") && g.get("phase") === PHASE.PLAYOFFS) {
					const numGamesPlayoffSeries = g.get(
						"numGamesPlayoffSeries",
						"current",
					);
					const numFinalsGames = numGamesPlayoffSeries.at(-1);

					// If finals is 1 game, then no home court advantage
					if (numFinalsGames === 1) {
						const playoffSeries = await idb.cache.playoffSeries.get(
							g.get("season"),
						);
						if (
							playoffSeries &&
							playoffSeries.currentRound === numGamesPlayoffSeries.length - 1
						) {
							disableHomeCourtAdvantage = true;
						}
					}
				}

				const result = getResult({
					gid: game.gid,
					day: game.day,
					teams: teamsInput,
					doPlayByPlay,
					disableHomeCourtAdvantage,
				});
				results.push(result);
			}
		}

		await cbSaveResults(results, dayOver);
	};

	// Simulates a day of games. If there are no games left, it calls cbNoGames.
	// Promise is resolved after games are run
	const cbPlayGames = async () => {
		await updateStatus(`Playing (${helpers.daysLeft(false, numDays)})`);

		let schedule = await season.getSchedule(true);

		// If live game sim, only do that one game, not the whole day
		let dayOver = true;
		if (gidOneGame !== undefined) {
			const lengthBefore = schedule.length;
			schedule = schedule.filter(game => game.gid === gidOneGame);
			const lengthAfter = schedule.length;

			if (lengthBefore - lengthAfter > 0) {
				dayOver = false;
			}
		}

		if (
			schedule.length > 0 &&
			schedule[0].homeTid === -3 &&
			schedule[0].awayTid === -3
		) {
			await idb.cache.schedule.delete(schedule[0].gid);
			await phase.newPhase(PHASE.AFTER_TRADE_DEADLINE, conditions);
			await toUI("deleteGames", [[schedule[0].gid]]);
			await play(numDays - 1, conditions, false);
		} else {
			// This should also call cbNoGames after the playoffs end, because g.get("phase") will have been incremented by season.newSchedulePlayoffsDay after the previous day's games
			if (schedule.length === 0 && g.get("phase") !== PHASE.PLAYOFFS) {
				return cbNoGames();
			}

			const tids = new Set<number>();

			// Will loop through schedule and simulate all games
			if (schedule.length === 0 && g.get("phase") === PHASE.PLAYOFFS) {
				// Sometimes the playoff schedule isn't made the day before, so make it now
				// This works because there should always be games in the playoffs phase. The next phase will start before reaching this point when the playoffs are over.
				await season.newSchedulePlayoffsDay();
				schedule = await season.getSchedule(true);
			}

			for (const matchup of schedule) {
				tids.add(matchup.homeTid);
				tids.add(matchup.awayTid);
			}

			const teams = await loadTeams(Array.from(tids), conditions); // Play games

			await cbSimGames(schedule, teams, dayOver);
		}
	};

	// This simulates a day, including game simulation and any other bookkeeping that needs to be done
	const cbRunDay = async () => {
		const userTeamSizeError = await team.checkRosterSizes("user");

		if (!userTeamSizeError) {
			await updatePlayMenu();

			if (numDays > 0) {
				// If we didn't just stop games, let's play
				// Or, if we are starting games (and already passed the lock), continue even if stopGameSim was just seen
				const stopGameSim = lock.get("stopGameSim");

				if (start || !stopGameSim) {
					// If start is set, then reset stopGames
					if (stopGameSim) {
						await lock.set("stopGameSim", false);
					}

					if (g.get("phase") !== PHASE.PLAYOFFS) {
						await team.checkRosterSizes("other");
					}

					await cbPlayGames();
				} else {
					// Update UI if stopped
					await cbNoGames();
				}
			} else {
				// Not sure why we get here sometimes, but we do
				const playoffsOver =
					g.get("phase") === PHASE.PLAYOFFS &&
					(await season.newSchedulePlayoffsDay());
				await cbNoGames(playoffsOver);
			}
		} else {
			await lock.set("gameSim", false); // Counteract auto-start in lock.canStartGames
			await updatePlayMenu();
			await updateStatus("Idle");
			logEvent(
				{
					type: "error",
					text: userTeamSizeError,
					saveToDb: false,
				},
				conditions,
			);
		}
	};

	// If this is a request to start a new simulation... are we allowed to do
	// that? If so, set the lock and update the play menu
	if (start) {
		const canStartGames = await lock.canStartGames();

		if (canStartGames) {
			await cbRunDay();
		}
	} else {
		await cbRunDay();
	}
};

export default play;

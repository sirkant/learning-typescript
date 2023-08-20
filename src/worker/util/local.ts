import type { Local } from "../../common/types";

// These variables are transient and will be reset every refresh. See lock.js for more.
const defaultLocal: Local = {
	autoPlayUntil: undefined,
	autoSave: true,
	exhibitionGamePlayers: undefined,
	fantasyDraftResults: [],
	goldUntil: Infinity, // Default is to assume Gold, until told otherwise by server
	mailingList: false, // Default, until told otherwise by server
	minFractionDiffs: undefined,
	leagueLoaded: false,
	phaseText: "",
	playerBioInfo: undefined,
	playerOvrMean: 47,
	playerOvrStd: 10,
	playerOvrMeanStdStale: true,
	seasonLeaders: undefined,
	playingUntilEndOfRound: false,
	statusText: "Idle",
	unviewedSeasonSummary: false, // Set to true when a live game sim of the final game prevents an automatic redirect to the season summary page
	username: undefined,
};
const local: Local & {
	reset: () => void;
} = {
	autoPlayUntil: defaultLocal.autoPlayUntil,
	autoSave: defaultLocal.autoSave,
	exhibitionGamePlayers: defaultLocal.exhibitionGamePlayers,
	fantasyDraftResults: defaultLocal.fantasyDraftResults,
	goldUntil: defaultLocal.goldUntil,
	leagueLoaded: defaultLocal.leagueLoaded,
	mailingList: defaultLocal.mailingList,
	minFractionDiffs: defaultLocal.minFractionDiffs,
	phaseText: defaultLocal.phaseText,
	playerBioInfo: defaultLocal.playerBioInfo,
	playerOvrMean: defaultLocal.playerOvrMean,
	playerOvrStd: defaultLocal.playerOvrStd,
	playerOvrMeanStdStale: defaultLocal.playerOvrMeanStdStale,
	playingUntilEndOfRound: defaultLocal.playingUntilEndOfRound,
	seasonLeaders: defaultLocal.seasonLeaders,
	statusText: defaultLocal.statusText,
	unviewedSeasonSummary: defaultLocal.unviewedSeasonSummary,
	username: defaultLocal.username,
	reset: () => {
		// These variables will be reset if the user switches leagues
		local.autoPlayUntil = defaultLocal.autoPlayUntil;
		local.autoSave = defaultLocal.autoSave;
		local.exhibitionGamePlayers = defaultLocal.exhibitionGamePlayers;
		local.fantasyDraftResults = defaultLocal.fantasyDraftResults;
		local.leagueLoaded = defaultLocal.leagueLoaded;
		local.minFractionDiffs = defaultLocal.minFractionDiffs;
		local.phaseText = defaultLocal.phaseText;
		local.playerBioInfo = defaultLocal.playerBioInfo;
		local.playerOvrMean = defaultLocal.playerOvrMean;
		local.playerOvrStd = defaultLocal.playerOvrStd;
		local.playerOvrMeanStdStale = defaultLocal.playerOvrMeanStdStale;
		local.playingUntilEndOfRound = defaultLocal.playingUntilEndOfRound;
		local.seasonLeaders = defaultLocal.seasonLeaders;
		local.statusText = defaultLocal.statusText;
		local.unviewedSeasonSummary = defaultLocal.unviewedSeasonSummary;
		local.username = defaultLocal.username;

		// Don't reset goldUntil because that persists across leagues. Probably it shouldn't be in this file, but should
		// be somewhere else (like how g used to have some variables not persisted to database).
	},
};

export default local;

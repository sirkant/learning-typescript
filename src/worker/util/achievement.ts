import { ACCOUNT_API_URL, fetchWrapper, DIFFICULTY } from "../../common";
import { idb } from "../db";
import achievements from "./achievements";
import g from "./g";
import logEvent from "./logEvent";
import type { AchievementWhen, Conditions } from "../../common/types";
import toUI from "./toUI";

type Difficulty = "insane" | "hard" | "normal" | "easy";
const getDifficulty = (): Difficulty => {
	const difficulty = g.get("lowestDifficulty");
	if (difficulty >= DIFFICULTY.Insane) {
		return "insane";
	}
	if (difficulty >= DIFFICULTY.Hard) {
		return "hard";
	}
	if (difficulty >= DIFFICULTY.Normal) {
		return "normal";
	}

	return "easy";
};

/**
 * Records one or more achievements.
 *
 * If logged in, try to record remotely and fall back to IndexedDB if necessary. If not logged in, just write to IndexedDB. Then, create a notification.
 *
 * @memberOf util.helpers
 * @param {Array.<string>} achievements Array of achievement IDs (see allAchievements above).
 * @param {boolean=} silent If true, don't show any notifications (like if achievements are only being moved from IDB to remote). Default false.
 * @return {Promise}
 */
async function add(
	slugs: string[],
	conditions: Conditions,
	difficulty: Difficulty = getDifficulty(),
	silent: boolean = false,
) {
	if (difficulty === "easy") {
		return;
	}

	const notify = (slug: string) => {
		const achievement = achievements.find(
			achievement2 => slug === achievement2.slug,
		);

		if (!achievement) {
			throw new Error(`No achievement found for slug "${slug}"`);
		}

		logEvent(
			{
				type: "achievement",
				text: `"${achievement.name}" achievement awarded! <a href="/achievements#${achievement.slug}">View all achievements.</a>`,
				saveToDb: false,
			},
			conditions,
		);

		toUI(
			"analyticsEvent",
			[
				"unlock_achievement",
				{
					achievement_id: slug,
				},
			],
			conditions,
		);
	};

	const addToIndexedDB = async (slugs2: string[]) => {
		const tx = idb.meta.transaction("achievements", "readwrite");
		for (const slug of slugs2) {
			tx.store.add({
				slug,
				difficulty,
			});
		}
		await tx.done;
	};

	if (!silent) {
		for (const slug of slugs) {
			notify(slug);
		}
	}

	try {
		const data = await fetchWrapper({
			url: `${ACCOUNT_API_URL}/add_achievements.php`,
			method: "POST",
			data: {
				achievements: slugs,
				sport: process.env.SPORT,
				difficulty,
			},
			credentials: "include",
		});

		if (!data.success) {
			await addToIndexedDB(slugs);
		}
	} catch (error) {
		await addToIndexedDB(slugs);
	}
}

async function getAll(): Promise<
	{
		category: string;
		desc: string;
		name: string;
		slug: string;
		normal: number;
		hard: number;
		insane: number;
	}[]
> {
	const achievements2 = achievements.map(({ category, desc, name, slug }) => {
		return {
			category,
			desc,
			name,
			slug,
			normal: 0,
			hard: 0,
			insane: 0,
		};
	});

	// Handle any achivements stored in IndexedDB
	const achievementsLocal = await idb.meta.getAll("achievements");

	for (const achievementLocal of achievementsLocal) {
		const difficulty = achievementLocal.difficulty ?? "normal";
		for (const achievement of achievements2) {
			if (achievement.slug === achievementLocal.slug) {
				achievement[difficulty] += 1;
			}
		}
	}

	try {
		// Handle any achievements stored in the cloud
		const achievementsRemote = await fetchWrapper({
			url: `${ACCOUNT_API_URL}/get_achievements.php`,
			method: "GET",
			data: {
				sport: process.env.SPORT,
			},
			credentials: "include",
		});

		// Merge local and remote achievements
		for (const achievement of achievements2) {
			if (achievementsRemote[achievement.slug] !== undefined) {
				for (const difficulty of ["normal", "hard", "insane"] as const) {
					achievement[difficulty] +=
						achievementsRemote[achievement.slug][difficulty];
				}
			}
		}

		return achievements2;
	} catch (err) {
		// If remote fails, still return local achievements
		return achievements2;
	}
}

const check = async (when: AchievementWhen, conditions: Conditions) => {
	try {
		const tooEz =
			g.get("lowestDifficulty") < DIFFICULTY.Normal ||
			g.get("godModeInPast") ||
			g.get("spectator");

		const awarded: string[] = [];

		for (const achievement of achievements) {
			if (achievement.when === when && achievement.check !== undefined) {
				const result = await achievement.check();
				// reason why not awarded
				let message;

				if (result) {
					if (tooEz) {
						if (g.get("godMode")) {
							message = "God Mode is enabled.";
						} else if (g.get("godModeInPast")) {
							message = "God Mode was enabled in the past.";
						} else if (g.get("spectator")) {
							message = "Spectator Mode is enabled.";
						} else if (g.get("difficulty") < DIFFICULTY.Normal) {
							message = 'the difficulty level is below "Normal".';
						} else {
							message = 'the difficulty level was previously below "Normal".';
						}

						logEvent(
							{
								type: "achievement",
								text: `"${achievement.name}" achievement not awarded because ${message} <a href="/achievements">View all achievements.</a>`,
								saveToDb: false,
							},
							conditions,
						);
					} else {
						awarded.push(achievement.slug);
					}
				}
			}
		}

		if (awarded.length > 0) {
			await add(awarded, conditions);
		}
	} catch (error) {
		console.error("Achievements error");
		console.error(error);
	}
};

export default {
	add,
	check,
	getAll,
};

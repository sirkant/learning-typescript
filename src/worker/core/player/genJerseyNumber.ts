import { idb } from "../../db";
import range from "lodash-es/range";
import { random, helpers } from "../../util";
import { bySport, isSport } from "../../../common";

// Football/hockey gets 1-99
const VALID_JERSEY_NUMBERS = range(1, 100).map(i => String(i));

// Basketball also gets 0 and 00
if (isSport("basketball")) {
	VALID_JERSEY_NUMBERS.push("0", "00");
}

const weightFunction = bySport({
	baseball: (jerseyNumber: string) => {
		// https://www.baseball-reference.com/leagues/majors/2021-uniform-numbers.shtml
		const frequencies: Record<string, number> = {
			0: 9,
			1: 17,
			2: 26,
			3: 20,
			4: 15,
			5: 21,
			6: 20,
			7: 22,
			8: 18,
			9: 24,
			10: 17,
			11: 21,
			12: 24,
			13: 23,
			14: 14,
			15: 22,
			16: 21,
			17: 20,
			18: 25,
			19: 18,
			20: 14,
			21: 25,
			22: 22,
			23: 26,
			24: 20,
			25: 22,
			26: 23,
			27: 25,
			28: 32,
			29: 24,
			30: 26,
			31: 24,
			32: 24,
			33: 20,
			34: 19,
			35: 24,
			36: 20,
			37: 24,
			38: 24,
			39: 20,
			40: 19,
			41: 24,
			42: 25, // Not really..
			43: 25,
			44: 22,
			45: 27,
			46: 25,
			47: 18,
			48: 31,
			49: 21,
			50: 26,
			51: 20,
			52: 26,
			53: 21,
			54: 24,
			55: 24,
			56: 25,
			57: 27,
			58: 22,
			59: 22,
			60: 29,
			61: 24,
			62: 28,
			63: 23,
			64: 22,
			65: 24,
			66: 20,
			67: 16,
			68: 20,
			69: 4,
			70: 15,
			71: 17,
			72: 7,
			73: 11,
			74: 15,
			75: 10,
			76: 5,
			77: 16,
			78: 6,
			79: 7,
			80: 3,
			81: 7,
			82: 3,
			83: 4,
			84: 7,
			85: 7,
			86: 5,
			87: 3,
			88: 3,
			89: 4,
			90: 2,
			91: 1,
			92: 4,
			93: 1,
			94: 1,
			95: 1,
			96: 2,
			97: 1,
			98: 1,
			99: 7,
		};

		const frequency = frequencies[jerseyNumber];

		if (frequency === undefined || frequency === 0) {
			// Never have 0 probability
			return 0.25;
		}

		return frequency;
	},
	basketball: (jerseyNumber: string) => {
		// https://old.reddit.com/r/nba/comments/4sxoi0/the_mostleast_worn_jersey_numbers/
		const frequencies: Record<string, number> = {
			"00": 29,
			0: 68,
			1: 199,
			2: 176,
			3: 283,
			4: 263,
			5: 298,
			6: 210,
			7: 284,
			8: 224,
			9: 233,
			10: 279,
			11: 341,
			12: 380,
			13: 173,
			14: 301,
			15: 304,
			16: 108,
			17: 145,
			18: 120,
			19: 87,
			20: 305,
			21: 274,
			22: 282,
			23: 214,
			24: 240,
			25: 201,
			26: 45,
			27: 48,
			28: 32,
			29: 26,
			30: 205,
			31: 168,
			32: 209,
			33: 224,
			34: 210,
			35: 166,
			36: 17,
			37: 4,
			38: 8,
			39: 4,
			40: 162,
			41: 100,
			42: 158,
			43: 99,
			44: 209,
			45: 106,
			46: 4,
			47: 5,
			48: 2,
			49: 2,
			50: 114,
			51: 39,
			52: 80,
			53: 29,
			54: 81,
			55: 90,
			56: 3,
			57: 1,
			58: 0,
			59: 0,
			60: 2,
			61: 2,
			62: 2,
			63: 1,
			64: 0,
			65: 1,
			66: 3,
			67: 1,
			68: 1,
			69: 0,
			70: 7,
			71: 3,
			72: 1,
			73: 1,
			74: 0,
			75: 0,
			76: 0,
			77: 10,
			78: 0,
			79: 0,
			80: 0,
			81: 0,
			82: 0,
			83: 1,
			84: 1,
			85: 1,
			86: 2,
			87: 0,
			88: 5,
			89: 2,
			90: 2,
			91: 2,
			92: 2,
			93: 2,
			94: 1,
			95: 0,
			96: 2,
			97: 0,
			98: 3,
			99: 6,
		};

		const frequency = frequencies[jerseyNumber];

		if (frequency === undefined || frequency === 0) {
			// Never have 0 probability
			return 0.25;
		}

		return frequency;
	},
	football: () => 1,
	hockey: (jerseyNumber: string) => {
		// https://www.hockey-reference.com/leagues/NHL_2020_numbers.html
		const frequencies: Record<string, number> = {
			1: 7,
			2: 12,
			3: 15,
			4: 16,
			5: 16,
			6: 20,
			7: 14,
			8: 19,
			9: 17,
			10: 16,
			11: 16,
			12: 14,
			13: 19,
			14: 21,
			15: 19,
			16: 14,
			17: 21,
			18: 19,
			19: 22,
			20: 23,
			21: 22,
			22: 19,
			23: 20,
			24: 19,
			25: 17,
			26: 22,
			27: 19,
			28: 32,
			29: 21,
			30: 16,
			31: 14,
			32: 13,
			33: 18,
			34: 17,
			35: 15,
			36: 15,
			37: 19,
			38: 18,
			39: 13,
			40: 15,
			41: 13,
			42: 14,
			43: 11,
			44: 24,
			45: 12,
			46: 17,
			47: 14,
			48: 14,
			49: 10,
			50: 13,
			51: 9,
			52: 10,
			53: 14,
			54: 5,
			55: 14,
			56: 7,
			57: 8,
			58: 11,
			59: 6,
			60: 9,
			61: 10,
			62: 7,
			63: 8,
			64: 10,
			65: 7,
			66: 0,
			67: 11,
			68: 6,
			69: 0,
			70: 9,
			71: 12,
			72: 12,
			73: 9,
			74: 13,
			75: 9,
			76: 4,
			77: 15,
			78: 4,
			79: 7,
			80: 5,
			81: 10,
			82: 5,
			83: 8,
			84: 2,
			85: 2,
			86: 8,
			87: 2,
			88: 11,
			89: 8,
			90: 11,
			91: 8,
			92: 8,
			93: 5,
			94: 2,
			95: 6,
			96: 2,
			97: 2,
			98: 1,
			99: 0,
		};

		const frequency = frequencies[jerseyNumber];

		if (frequency === undefined || frequency === 0) {
			// Never have 0 probability
			return 0.25;
		}

		return frequency;
	},
});

// Would be nice if this handled prefixed jersey numbers, but that would make it a bit slower so idk if it's worth it
const genFootballWeightFunction = (boost: number[]) => {
	const boostString = boost.map(String);
	return (jerseyNumber: string) => {
		return boostString.includes(jerseyNumber) ? 10000 : 1;
	};
};

const weightFunctionsByPosition = bySport({
	football: {
		QB: genFootballWeightFunction(range(1, 20)),
		RB: genFootballWeightFunction([...range(1, 50), ...range(80, 90)]),
		WR: genFootballWeightFunction([...range(1, 50), ...range(80, 90)]),
		TE: genFootballWeightFunction([...range(1, 50), ...range(80, 91)]),
		OL: genFootballWeightFunction(range(50, 80)),
		DL: genFootballWeightFunction([...range(50, 80), ...range(90, 100)]),
		LB: genFootballWeightFunction([...range(1, 60), ...range(90, 100)]),
		CB: genFootballWeightFunction(range(1, 50)),
		S: genFootballWeightFunction(range(1, 50)),
		K: genFootballWeightFunction(range(1, 20)),
		P: genFootballWeightFunction(range(1, 20)),
	},
	default: undefined,
});

const genJerseyNumber = async (
	p: {
		pid?: number;
		tid: number;
		jerseyNumber?: string;
		ratings: {
			pos: string;
		}[];
		stats: any[];
	},

	// When this is undefined, it'll read from the database to find what it should be. But that won't work during league creation.
	teamJerseyNumbersInput?: string[],
	retiredJerseyNumbersInput?: string[],

	// When this is true, ignore current/previous jersey number
	pickRandomNumber?: boolean,

	// When all jersey numbers are retired, it will add a prefix and try again
	prefix?: number,
): Promise<string | undefined> => {
	let prevJerseyNumber;
	if (!pickRandomNumber) {
		prevJerseyNumber = helpers.getJerseyNumber(p);

		if (p.tid < 0) {
			return prevJerseyNumber;
		}
	}

	const teamJerseyNumbers: string[] = teamJerseyNumbersInput
		? teamJerseyNumbersInput
		: [];
	if (!teamJerseyNumbersInput) {
		if (p.tid >= 0) {
			const teammates = (
				await idb.cache.players.indexGetAll("playersByTid", p.tid)
			).filter(p2 => p2.pid !== p.pid);
			for (const teammate of teammates) {
				if (teammate.stats.length > 0) {
					const teamJerseyNumber = teammate.stats.at(-1).jerseyNumber;
					if (teamJerseyNumber) {
						teamJerseyNumbers.push(teamJerseyNumber);
					}
				}
			}
		}
	}

	const retiredJerseyNumbers: string[] = retiredJerseyNumbersInput
		? retiredJerseyNumbersInput
		: [];
	if (!retiredJerseyNumbersInput) {
		const t = await idb.cache.teams.get(p.tid);
		if (t?.retiredJerseyNumbers) {
			retiredJerseyNumbers.push(
				...t.retiredJerseyNumbers.map(row => row.number),
			);
		}
	}

	let validJerseyNumbers;
	if (prefix === undefined) {
		validJerseyNumbers = VALID_JERSEY_NUMBERS;
	} else {
		validJerseyNumbers = range(0, 100).map(i => String(prefix * 100 + i));
	}

	const candidates = validJerseyNumbers.filter(
		jerseyNumber =>
			!teamJerseyNumbers.includes(jerseyNumber) &&
			!retiredJerseyNumbers.includes(jerseyNumber),
	);

	if (
		prevJerseyNumber &&
		(candidates.includes(prevJerseyNumber) ||
			!validJerseyNumbers.includes(prevJerseyNumber))
	) {
		// Keep old jersey number, if it is available or if prevJerseyNumber is not a valid jersey number (must have been manually edited)
		return prevJerseyNumber;
	}

	if (candidates.length === 0) {
		// No valid jersey number left! Try again with a larger prefix (so it'll pick numbers like 1XX rather than XX, then 2XX, 3XX, etc.)
		return genJerseyNumber(
			p,
			teamJerseyNumbersInput,
			retiredJerseyNumbersInput,
			pickRandomNumber,
			(prefix ?? 0) + 1,
		);
	}

	if (weightFunctionsByPosition) {
		const pos = p.ratings.at(-1)!.pos;
		if ((weightFunctionsByPosition as any)[pos]) {
			return random.choice(candidates, (weightFunctionsByPosition as any)[pos]);
		}
		return random.choice(candidates);
	}

	return random.choice(candidates, weightFunction);
};

export default genJerseyNumber;

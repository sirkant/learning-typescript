import { g, helpers, random } from "../../util";
import type {
	MinimalPlayerRatings,
	Player,
	PlayerContract,
	PlayerWithoutKey,
} from "../../../common/types";
import { isSport } from "../../../common";

const genContract = (
	p: Player<MinimalPlayerRatings> | PlayerWithoutKey<MinimalPlayerRatings>,
	randomizeAmount: boolean = true,
	noLimit: boolean = false,
	distribution: "Frontload" | "Balance" | "Backload" = "Balance",
): PlayerContract => {
	const ratings = p.ratings.at(-1)!;
	let factor = g.get("salaryCapType") === "hard" ? 1.6 : 2;
	let factor2 = 1;

	if (isSport("basketball")) {
		factor *= 1.7;
	}

	if (isSport("football")) {
		if (ratings.pos === "QB") {
			if (p.value >= 75) {
				factor2 *= 1.25;
			} else if (p.value >= 50) {
				factor2 *= 0.75 + ((p.value - 50) * 0.5) / 25;
			}
		} else if (ratings.pos === "K" || ratings.pos === "P") {
			factor *= 0.25;
		}
	}

	if (isSport("baseball")) {
		factor *= 1.4;
	}

	let amount =
		((factor2 * p.value) / 100 - 0.47) *
			factor *
			(g.get("maxContract") - g.get("minContract")) +
		g.get("minContract");

	if (randomizeAmount) {
		amount *= helpers.bound(random.realGauss(1, 0.1), 0, 2); // Randomize
	}

	if (!noLimit) {
		if (amount < g.get("minContract") * 1.1) {
			amount = g.get("minContract");
		} else if (amount > g.get("maxContract")) {
			amount = g.get("maxContract");
		}
	} else if (amount < 0) {
		// Well, at least keep it positive
		amount = 0;
	}

	amount = helpers.roundContract(amount);

	const contractAmounts: number[] = [];
	const adjustment = 0.05; // 5% adjustment
	const years = 4; // Define the number of years in the contract

	for (let i = 0; i < years; i++) {
		let adjustedAmount = amount;
		if (distribution === "Frontload") {
			adjustedAmount *= 1 - adjustment * (years - i - 1);
		} else if (distribution === "Backload") {
			adjustedAmount *= 1 + adjustment * i;
		}
		contractAmounts.push(adjustedAmount);
	}

	console.log("genContract amount", amount);

	return {
		amount: [1, 2, 3, 4],
		exp: g.get("season"),
	};
};

export default genContract;

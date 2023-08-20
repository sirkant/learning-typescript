import fs from "node:fs";
import generateJSONSchema from "./lib/generateJSONSchema.js";

const jsonSchema = generateJSONSchema("test");
fs.mkdirSync("build/files", { recursive: true });
fs.writeFileSync(
	"build/files/league-schema.json",
	JSON.stringify(jsonSchema, null, 2),
);

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const readline_1 = __importDefault(require("readline"));
const BrowserGenie_1 = require("../core/BrowserGenie");
function promptUser(query) {
    const rl = readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans.trim());
    }));
}
async function main() {
    const url = process.argv[2];
    if (!url) {
        console.error('Usage: ts-node src/cli/cli.ts <url>');
        process.exit(1);
    }
    const goal = await promptUser('\n🤖 Enter your natural language instruction: ');
    const genie = new BrowserGenie_1.BrowserGenie();
    await genie.interact(url, goal);
    console.log("Finished CLI");
    // setTimeout(() => {
    //   console.log('[DEBUG] Checking why Node is still running...');
    //   why(); // Dump open handles and reasons
    // }, 1000);
    setTimeout(() => process.exit(0), 2000);
}
main().catch(err => {
    console.error('❌ Error running BrowserGenie:', err);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map
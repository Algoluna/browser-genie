import readline from 'readline';
import { BrowserGenie } from '../core/BrowserGenie';
import why from 'why-is-node-running';

function promptUser(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
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
  const genie = new BrowserGenie();
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

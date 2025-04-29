"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserGenie = void 0;
const ActionPlanner_1 = require("./ActionPlanner");
const PlanExecutor_1 = require("./PlanExecutor");
const ChromeBrowser_1 = require("../browser/ChromeBrowser");
const PageSummaryPrinter_1 = require("../extract/PageSummaryPrinter");
class BrowserGenie {
    async printPageSummary(summary) {
        const formatted = await new PageSummaryPrinter_1.PageSummaryPrinter().format(summary);
        console.log(formatted);
        console.log("======================================================================");
    }
    async interact(url, goal) {
        console.log(`[GENIE] Navigating to ${url}...`);
        const browser = new ChromeBrowser_1.ChromeBrowser();
        const executionContext = await browser.launch(url);
        const planner = new ActionPlanner_1.ActionPlanner();
        const executor = new PlanExecutor_1.PlanExecutor(browser);
        let iteration = 0;
        while (iteration < 5) {
            console.log(`\n[GENIE] Iteration ${iteration + 1}`);
            const { elements, screenshotPath } = await browser.captureState(executionContext);
            const plan = await planner.generateActionPlan(goal, elements, screenshotPath, executionContext);
            console.log(`[GENIE] Generated plan`);
            console.log(JSON.stringify(plan, null, 2));
            const status = await executor.execute(plan, executionContext);
            switch (status.status) {
                case 'success':
                    console.log('[GENIE] ✅ Goal completed successfully.');
                    const pageSummary = await browser.extractSummary(executionContext);
                    executionContext.pushPageSummary(pageSummary);
                    console.log('[GENIE] Extracted outputs');
                    executionContext.pageSummaries.forEach((summary) => {
                        this.printPageSummary(summary);
                    });
                    await browser.close();
                    return;
                case 'giveup':
                    console.warn('[GENIE] ❌ Planner gave up. Stopping.');
                    await browser.close();
                    return;
                case 'error':
                    console.error(`[GENIE] ❗ Error during execution: ${status.reason}`);
                    await browser.close();
                    return;
                case 'plan':
                    console.log('[GENIE] 🔄 Re-planning after inspect or state change...');
                    iteration++;
                    break;
            }
        }
        console.warn('[GENIE] ⚠️ Maximum planning iterations reached. Giving up.');
        await browser.close();
    }
}
exports.BrowserGenie = BrowserGenie;
//# sourceMappingURL=BrowserGenie.js.map
import { ActionPlanner } from './ActionPlanner';
import { PlanExecutor } from './PlanExecutor';
import { ExecutionContext, ExecutionStatus, Action, PageSummary } from '../types';
import { ChromeBrowser } from '../browser/ChromeBrowser';
import { PageSummaryPrinter } from '../extract/PageSummaryPrinter';

export class BrowserGenie {


  async printPageSummary(summary: PageSummary) {
    const printer = new PageSummaryPrinter();
    const formatted = await printer.format(summary);
    console.log(formatted);
    console.log("======================================================================")
  }

  async interact(url: string, goal: string) { 
    console.log(`[GENIE] Navigating to ${url}...`);
    const browser = new ChromeBrowser(); 
    const executionContext = await browser.launch(url);

    const planner = new ActionPlanner();
    const executor = new PlanExecutor(browser);

    let iteration = 0;

    while (iteration < 5) {
      console.log(`\n[GENIE] Iteration ${iteration + 1}`);
      const { elements, screenshotPath } = await browser.captureState(executionContext);
      const plan = await planner.generateActionPlan(goal, elements, screenshotPath, executionContext);
      console.log(`[GENIE] Generated plan`);
      console.log(JSON.stringify(plan, null, 2));

      const status: ExecutionStatus = await executor.execute(plan, executionContext);

      switch (status.status) {
        case 'success':
          console.log('[GENIE] ✅ Goal completed successfully.');    
          const pageSummary = await browser.extractSummary(executionContext);
          executionContext.pushPageSummary(pageSummary);
          console.log('[GENIE] Extracted outputs');
          await Promise.all(
            executionContext.pageSummaries.map(summary =>
              this.printPageSummary(summary)
            )
          );
          browser.close();
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

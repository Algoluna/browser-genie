"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanExecutor = void 0;
class PlanExecutor {
    browser;
    constructor(browser) {
        this.browser = browser;
    }
    async execute(plan, context) {
        try {
            for (const instruction of plan.instructions) {
                context.pushHistory(instruction);
                for (const action of instruction.actions) {
                    console.log(`[EXECUTOR] Executing action: ${action.actionType}`);
                    switch (action.actionType) {
                        case 'click':
                            if (!action.objectId) {
                                return { status: 'error', reason: 'Missing objectId for click action' };
                            }
                            await this.browser.click(context, action.objectId);
                            break;
                        case 'hover':
                            if (!action.objectId) {
                                return { status: 'error', reason: 'Missing objectId for hover action' };
                            }
                            await this.browser.hover(context, action.objectId);
                            break;
                        case 'type':
                            if (!action.objectId || !action.text) {
                                return { status: 'error', reason: 'Missing objectId or text for type action' };
                            }
                            await this.browser.type(context, action.objectId, action.text);
                            break;
                        case 'sleep':
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            break;
                        case 'inspect':
                            return { status: 'plan', reason: 'Triggering re-inspection of UI after exploratory step' };
                        case 'giveup':
                            return { status: 'giveup', reason: 'Planner decided to give up' };
                        case 'goback':
                            await this.browser.goback(context);
                            return { status: 'plan', reason: 'Went back in history, will replan' };
                        case 'read':
                            const pageSummary = await this.browser.extractSummary(context);
                            context.pushPageSummary(pageSummary);
                            return { status: 'plan', reason: 'Went back in history, will replan' };
                            break;
                        default:
                            return { status: 'error', reason: `Unknown action type: ${action.actionType}` };
                    }
                }
            }
        }
        catch (err) {
            return { status: 'error', reason: `Execution failed: ${err.message}` };
        }
        return { status: 'success' };
    }
}
exports.PlanExecutor = PlanExecutor;
//# sourceMappingURL=PlanExecutor.js.map
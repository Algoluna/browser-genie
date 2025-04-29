import { Browser } from '../browser/Browser';
import { ActionPlan, ExecutionContext, ExecutionStatus } from '../types';
export declare class PlanExecutor {
    private browser;
    constructor(browser: Browser);
    execute(plan: ActionPlan, context: ExecutionContext): Promise<ExecutionStatus>;
}

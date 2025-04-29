import { AnnotatedElement, ActionPlan, ExecutionContext } from '../types';
export declare class ActionPlanner {
    private readonly model;
    constructor(model?: string);
    generateActionPlan(instruction: string, elements: AnnotatedElement[], screenshotPath: string, executionContext: ExecutionContext): Promise<ActionPlan>;
    private expandUserInstruction;
    private resolveReferences;
    private planActions;
}

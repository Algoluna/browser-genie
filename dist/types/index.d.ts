export type AnnotatedElement = {
    nodeId: number;
    objectId: string;
    tag: string;
    role: string;
    label: string;
    box: [number, number, number, number] | null;
    clipPath?: string;
};
export type Action = {
    actionType: 'click' | 'type' | 'hover' | 'sleep' | 'inspect' | 'giveup' | 'goback' | 'read';
    objectId?: string;
    text?: string;
    modifiers?: Record<string, any>;
};
export type Instruction = {
    instruction: string;
    actions: Action[];
};
export type ActionPlan = {
    instructions: Instruction[];
};
export type PageState = {
    title: string;
    url: string;
    elements: AnnotatedElement[];
    screenshotPath: string;
};
export declare class ExecutionContext {
    client: any;
    targetId: string;
    executionHistory: Instruction[];
    stateHistory: PageState[];
    pageSummaries: PageSummary[];
    constructor(targetId: string);
    pushHistory(instruction: Instruction): void;
    pushState(state: PageState): void;
    pushPageSummary(summary: PageSummary): void;
}
export type ExecutionStatus = {
    status: 'success' | 'giveup' | 'plan' | 'error';
    reason?: string;
};
export type StructuredTextNode = {
    tag: string;
    text?: string;
    children: StructuredTextNode[];
};
export declare class PageSummary {
    title: string;
    url: string;
    visibleText: StructuredTextNode;
    images: {
        src: string;
        alt: string;
    }[];
    constructor(title: string, url: string, visibleText: StructuredTextNode, images: {
        src: string;
        alt: string;
    }[]);
    print(): void;
    private printTextTree;
}

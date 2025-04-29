import { PageSummary } from '../types';
export declare class PageSummaryPrinter {
    private readonly model;
    constructor(model?: string);
    format(summary: PageSummary): Promise<string>;
    private normalizeStructuredTextTree;
    private flattenText;
}

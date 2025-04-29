import { PageSummary } from '../types';
export declare class BrowserGenie {
    printPageSummary(summary: PageSummary): Promise<void>;
    interact(url: string, goal: string): Promise<void>;
}

import { ExecutionContext, PageState, PageSummary } from '../types';
import { Browser } from './Browser';
export declare class ChromeBrowser implements Browser {
    private clients;
    launch(url: string): Promise<ExecutionContext>;
    captureState(context: ExecutionContext): Promise<PageState>;
    click(context: ExecutionContext, objectId: string): Promise<void>;
    hover(context: ExecutionContext, objectId: string): Promise<void>;
    type(context: ExecutionContext, objectId: string, text: string): Promise<void>;
    pressEscape(context: ExecutionContext): Promise<void>;
    goback(context: ExecutionContext): Promise<void>;
    extractSummary(context: ExecutionContext): Promise<PageSummary>;
    close(): Promise<void>;
}

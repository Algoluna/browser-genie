import { AnnotatedElement, ExecutionContext, PageSummary } from '../types';


export interface Browser {
  launch(url: string): Promise<ExecutionContext>;
  captureState(context: ExecutionContext): Promise<{ elements: AnnotatedElement[]; screenshotPath: string }>;
  click(context: ExecutionContext, objectId: string): Promise<void>;
  hover(context: ExecutionContext, objectId: string): Promise<void>;
  type(context: ExecutionContext, objectId: string, text: string): Promise<void>;
  pressEscape(context: ExecutionContext): Promise<void>;
  goback(context: ExecutionContext): Promise<void>;
  extractSummary(context: ExecutionContext): Promise<PageSummary>;
  close(): Promise<void>;
}

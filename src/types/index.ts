import CDP from 'chrome-remote-interface';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';

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

export class ExecutionContext {
  client: any;
  targetId: string;
  executionHistory: Instruction[] = [];
  stateHistory: PageState[] = [];
  pageSummaries: PageSummary[] = [];

  constructor(targetId: string) {
    this.targetId = targetId;
  }

  pushHistory(instruction: Instruction) {
    this.executionHistory.push(instruction);
  }

  pushState(state: PageState) {
    this.stateHistory.push(state);
  }

  pushPageSummary(summary: PageSummary) {
    this.pageSummaries.push(summary);
  }
}

export type ExecutionStatus = {
  status: 'success' | 'giveup' | 'plan' | 'error';
  reason?: string;
};

export type StructuredTextNode = {
  tag: string;         // e.g., 'p', 'h1', 'li'
  text?: string;
  children: StructuredTextNode[]; // no longer optional
};

export class PageSummary {
  constructor(
    public title: string,
    public url: string,
    public visibleText: StructuredTextNode,
    public images: { src: string; alt: string }[]
  ) {}

  print(): void {
    console.log(`\n📝 Page Summary`);
    console.log(`Title: ${this.title}`);
    console.log(`URL:   ${this.url}`);

    console.log(`\n📄 Visible Text:`);
    this.printTextTree(this.visibleText);

    if (this.images.length > 0) {
      console.log(`\n🖼️ Images (${this.images.length}):`);
      this.images.forEach((img, i) => {
        console.log(`  [${i + 1}] alt="${img.alt}" src="${img.src}"`);
      });
    } else {
      console.log(`\n🖼️ No visible images`);
    }

    console.log('\n' + '='.repeat(60));
  }

  private printTextTree(node: StructuredTextNode | null | undefined, indent = 0): void {
    if (!node) return;
  
    const prefix = '  '.repeat(indent);
  
    if (node.text) {
      console.log(`${prefix}${node.text}`);
    }
  
    if (node.children?.length) {
      console.log(`${prefix}<${node.tag}>`);
      for (const child of node.children) {
        this.printTextTree(child, indent + 1);
      }
    } else if (!node.text) {
      // fallback: still show tag
      console.log(`${prefix}<${node.tag} />`);
    }
  }
}

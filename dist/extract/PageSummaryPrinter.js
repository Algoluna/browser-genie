"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageSummaryPrinter = void 0;
const openai_1 = require("openai");
const openai = new openai_1.OpenAI({ apiKey: process.env.OPENAI_API_KEY });
class PageSummaryPrinter {
    model;
    constructor(model = 'gpt-4o') {
        this.model = model;
    }
    async format(summary) {
        const cleanedTextTree = this.normalizeStructuredTextTree(summary.visibleText);
        const cleanedSummary = {
            title: summary.title,
            url: summary.url,
            visibleText: cleanedTextTree,
        };
        const compactJSON = JSON.stringify(cleanedSummary); // no indentation
        const prompt = `
  You are a markdown formatter for structured web page summaries.
  
  You will receive a structured JSON object representing:
  - The page title and URL
  - The hierarchical structure of visible text
  
  Your task is to convert this into clean, readable Markdown using **collapsible sections** to organize the content. Use the following rules:
  
  1. Begin with a title and the URL.
  2. Format the visibleText tree using:
     - \`<details>\` and \`<summary>\` for collapsible regions
     - Preserve the text structure and indentation
     - Limit nesting to 4 levels (already normalized)
  
  Do not include any images.
  Do not add commentary or extra metadata. Return only valid Markdown.
  
  Here is the structured page summary:
  
  ${compactJSON}
  
  Return only the markdown.
  `.trim();
        console.log(prompt);
        const response = await openai.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 2000
        });
        console.log("response from model");
        console.log(JSON.stringify(response.choices[0].message));
        return response.choices[0].message.content?.trim() || '';
    }
    normalizeStructuredTextTree(node, depth = 0, maxDepth = 4) {
        if (node.tag === 'text')
            return node;
        if (depth >= maxDepth) {
            const flatText = this.flattenText(node);
            return {
                tag: 'div',
                children: flatText
            };
        }
        const NON_SEMANTIC_TAGS = new Set([
            'div', 'span', 'section', 'article', 'main', 'body', 'header', 'footer', 'nav'
        ]);
        const cleanedChildren = [];
        for (const child of node.children) {
            const normalized = this.normalizeStructuredTextTree(child, depth + 1, maxDepth);
            if (normalized) {
                if (normalized.tag === 'div' && normalized.children.length === 1) {
                    cleanedChildren.push(normalized.children[0]);
                }
                else {
                    cleanedChildren.push(normalized);
                }
            }
        }
        if (NON_SEMANTIC_TAGS.has(node.tag) && cleanedChildren.length === 1) {
            return cleanedChildren[0];
        }
        return {
            tag: node.tag,
            text: node.text,
            children: cleanedChildren
        };
    }
    flattenText(node) {
        if (node.tag === 'text')
            return [node];
        return node.children.flatMap(child => this.flattenText(child));
    }
}
exports.PageSummaryPrinter = PageSummaryPrinter;
//# sourceMappingURL=PageSummaryPrinter.js.map
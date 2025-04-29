import CDP from 'chrome-remote-interface';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { createCanvas, loadImage } from 'canvas';
import { OpenAI } from 'openai';

const OUTPUT_DIR = 'clips';
const ELEMENTS_JSON = 'elements.json';

const MIN_BOX_WIDTH = 20;
const MIN_BOX_HEIGHT = 20;
const MIN_TEXT_LENGTH = 10;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type AnnotatedElement = {
  nodeId: number;
  objectId: string;
  tag: string;
  role: string;
  label: string;
  box: [number, number, number, number] | null;
  clipPath?: string;
};

async function promptUser(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function waitForDocumentReady(client: any) {
  const timeout = 10000;
  const interval = 500;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { result } = await client.Runtime.evaluate({ expression: 'document.readyState', returnByValue: true });
    if (result.value === 'complete') return;
    await new Promise(r => setTimeout(r, interval));
  }
}

function getBoxBounds(box: number[]): [number, number, number, number] {
  const x1 = Math.min(box[0], box[4]);
  const y1 = Math.min(box[1], box[5]);
  const x2 = Math.max(box[0], box[4]);
  const y2 = Math.max(box[1], box[5]);
  return [x1, y1, x2, y2];
}

function isBoxBigEnough(box: [number, number, number, number]): boolean {
  const [x1, y1, x2, y2] = box;
  return (x2 - x1) >= MIN_BOX_WIDTH || (y2 - y1) >= MIN_BOX_HEIGHT;
}

function isSignificantContent(tag: string, role: string, label: string): boolean {
  const hasText = label?.length >= MIN_TEXT_LENGTH;
  const isVisualTag = ['img', 'svg', 'icon'].includes(tag.toLowerCase());
  const isVisualRole = ['img', 'image', 'graphic', 'icon'].includes(role.toLowerCase());
  return hasText || isVisualTag || isVisualRole;
}

async function simulatePopupClicks(Runtime: any) {
  await Runtime.evaluate({
    expression: `Array.from(document.querySelectorAll('[aria-haspopup="true"]')).forEach(el => el.click());`,
  });
  await new Promise(r => setTimeout(r, 1000));
}

async function extractElements(url: string): Promise<AnnotatedElement[]> {
  const client = await CDP();
  const { Target } = client;
  const { targetId } = await Target.createTarget({ url });
  const tab = await CDP({ target: targetId });
  const { DOM, Runtime, Page, Accessibility, Network } = tab;

  await Promise.all([DOM.enable(), Runtime.enable(), Page.enable(), Accessibility.enable(), Network.enable()]);
  await waitForDocumentReady(tab);
  await new Promise(r => setTimeout(r, 1000));
  await Page.bringToFront();
  await simulatePopupClicks(Runtime);

  const elementsByObjectId = new Map<string, AnnotatedElement>();
  const { root } = await DOM.getDocument({ depth: -1, pierce: true });
  const actionableTags = new Set(['button', 'a', 'input', 'textarea', 'select', 'label']);

  async function traverseDOM(node: any) {
    if (!node?.nodeId || !node.nodeName) return;
    const tag = node.nodeName.toLowerCase();
    const nodeId = node.nodeId;

    if (actionableTags.has(tag)) {
      try {
        const { object } = await DOM.resolveNode({ nodeId });
        const { result: innerText } = await Runtime.callFunctionOn({
          objectId: object.objectId,
          functionDeclaration: 'function() { return this.innerText || this.getAttribute("aria-label") || ""; }',
          returnByValue: true,
        });
        const label = innerText.value?.trim() || '';
        let box: [number, number, number, number] | null = null;
        try {
          const { model } = await DOM.getBoxModel({ nodeId });
          box = getBoxBounds(model.border);
        } catch {}
        const keep = (box && isBoxBigEnough(box)) || isSignificantContent(tag, '', label);
        if (keep && !elementsByObjectId.has(object.objectId!)) {
          elementsByObjectId.set(object.objectId!, { nodeId, objectId: object.objectId!, tag, role: '', label, box });
        }
      } catch {}
    }
    for (const child of node.children || []) await traverseDOM(child);
  }

  await traverseDOM(root);

  const { nodes: axNodes } = await Accessibility.getFullAXTree();
  const interestingRoles = new Set(['button', 'link', 'menu', 'menuitem', 'tabpanel', 'tab', 'list', 'listitem', 'dialog', 'image', 'graphic', 'icon']);

  for (const axNode of axNodes) {
    if (!axNode.role || !axNode.name || !axNode.backendDOMNodeId) continue;
    const role = axNode.role.value;
    const label = axNode.name.value?.trim() || '';
    if (!interestingRoles.has(role)) continue;

    try {
      const { node } = await DOM.describeNode({ backendNodeId: axNode.backendDOMNodeId });
      const nodeId = node.nodeId;
      const { object } = await DOM.resolveNode({ nodeId });
      let box: [number, number, number, number] | null = null;
      try {
        const { model } = await DOM.getBoxModel({ nodeId });
        box = getBoxBounds(model.border);
      } catch {}
      const tag = '';
      const keep = (box && isBoxBigEnough(box)) || isSignificantContent(tag, role, label);
      if (keep && !elementsByObjectId.has(object.objectId!)) {
        elementsByObjectId.set(object.objectId!, { nodeId, objectId: object.objectId!, tag, role, label, box });
      }
    } catch {}
  }

  const { data } = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: true });
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync('original.png', buffer);
  const image = await loadImage(buffer);
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  const elements = Array.from(elementsByObjectId.values());
  elements.forEach((el, i) => {
    if (!el.box) return;
    const [x1, y1, x2, y2] = el.box;
    const width = x2 - x1, height = y2 - y1;
    const clipCanvas = createCanvas(width, height);
    const clipCtx = clipCanvas.getContext('2d');
    clipCtx.drawImage(image, x1, y1, width, height, 0, 0, width, height);
    const clipName = `element-${String(i + 1).padStart(3, '0')}.png`;
    const clipPath = path.join(OUTPUT_DIR, clipName);
    fs.writeFileSync(clipPath, clipCanvas.toBuffer('image/png'));
    el.clipPath = clipPath;
  });

  fs.writeFileSync(ELEMENTS_JSON, JSON.stringify(elements, null, 2));
  console.log(`✅ Saved ${elements.length} elements to ${ELEMENTS_JSON}`);
  await tab.close();
  await client.close();
  return elements;
}

async function expandUserInstruction(instruction: string): Promise<string> {
  const screenshotData = fs.readFileSync('original.png').toString('base64');
  const prompt = `You are an assistant that helps plan browser automation. Given a user instruction and a screenshot of a page, break the instruction into a numbered list of English steps. Each step should either directly fulfill the goal or be an exploratory action like opening a dropdown. Only return the numbered list.`;
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `${prompt}\n\n==== USER INSTRUCTION ====\n${instruction}` },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotData}` } }
      ]
    }],
    max_tokens: 1000,
    temperature: 0.2,
  });
  return response.choices[0].message.content || '';
}

async function resolveReferences(elements: AnnotatedElement[], instruction: string) {
  const BATCH_SIZE = 10;
  const resolvedMap: Record<string, { objectId: string, confidence: number }[]> = {};

  console.log('[INFO] Sending VLM batches to resolve references...');
  for (let start = 0; start < elements.length; start += BATCH_SIZE) {
    const batch = elements.slice(start, start + BATCH_SIZE);

    const content: OpenAI.ChatCompletionContentPart[] = [{
      type: 'text',
      text:
`You are given a list of up to 10 UI elements. Each element has:
- objectId
- label
- role
- a cropped image

Instruction: "${instruction}"

Return only this JSON format:
{
  "resolvedReferences": [
    {
      "reference": "user subphrase",
      "objectIds": [
        { "objectId": "abc123", "confidence": 0.92 }
      ]
    }
  ]
}

Only return valid JSON. No commentary.`,
    }];

    for (const el of batch) {
      const meta = `objectId=${el.objectId}, role=${el.role}, label="${el.label}"`;
      content.push({ type: 'text', text: meta });

      if (el.clipPath && fs.existsSync(el.clipPath)) {
        const imageData = fs.readFileSync(el.clipPath).toString('base64');
        content.push({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${imageData}` }
        });
      }
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content }],
      max_tokens: 1000,
      temperature: 0.2,
    });

    const response = completion.choices[0].message.content;
    if (!response) continue;

    try {
      const json = JSON.parse(response.match(/{[\s\S]+}/)?.[0] || '{}');
      for (const entry of json.resolvedReferences || []) {
        const list = (entry.objectIds || []).sort((a: any, b: any) => b.confidence - a.confidence);
        if (list.length) resolvedMap[entry.reference] = list;
      }
    } catch (err) {
      console.warn('[WARN] Failed to parse response:', err);
    }
  }

  console.log('\n=== Resolved References ===\n');
  console.log(JSON.stringify(resolvedMap, null, 2));
  return resolvedMap;
}

async function planActions(instruction: string, resolvedMap: Record<string, { objectId: string, confidence: number }[]>) {
  console.log('[INFO] Asking GPT-4o to generate browser actions...');

  const screenshotData = fs.readFileSync('original.png').toString('base64');

  const promptText = `
You are a browser automation planner.

You will receive:
1. A user instruction
2. A set of resolved references (natural language → objectId with confidence)
3. A full-page screenshot

First, expand the user's instruction into a sequence of detailed natural language steps that explain what the automation agent should do. Then, for each step, generate one or more structured actions to be executed in the browser.

Each action must have the following JSON schema:
{
  "actionType": "click | type | hover | sleep | inspect | giveup",
  "objectId"?: "string (optional - only for element-based actions)",
  "text"?: "string (required for 'type')",
  "modifiers"?: { ... }, // optional metadata
  "instruction": "The English step this action corresponds to"
}

Action Types:
- "click": Click on a page element. Requires "objectId".
- "type": Focus a text input and type into it. Requires "objectId" and "text".
- "hover": Hover over a UI element. Requires "objectId".
- "sleep": Wait 2 seconds. No objectId required.
- "inspect": Re-analyze the current page and extract UI elements again. No objectId required.
  Only use "inspect" if the required UI elements are missing or ambiguous in the current resolved references.
- "giveup": Use this only if the instruction makes no sense in the context of the page and the resolved object references.
  If you truly cannot proceed meaningfully, return a single "giveup" action.

Guidance:
- Your expanded instructions should either directly complete the user’s goal OR perform an exploratory workflow that opens or reveals new UI components.
- Exploratory workflows (e.g., opening a popup or expanding a dropdown) should end with an "inspect" action.
- Goal-completing workflows should never end with an "inspect" action.
- Only return "inspect" if something is missing.
- Only return "giveup" if the user's instruction cannot be fulfilled at all.

Use the following context to guide your planning:

==== USER INSTRUCTION ====
${instruction}

==== RESOLVED OBJECT REFERENCES ====
${JSON.stringify(resolvedMap, null, 2)}

Return your output in the following format:

{
  "steps": [
    {
      "instruction": "Expanded English step",
      "actions": [ ...action objects as described above... ]
    },
    ...
  ]
}

Return only valid JSON. Do not include commentary, explanation, or notes.
`.trim();

  console.log('\n[DEBUG] Action Planner Prompt:\n');
  console.log(promptText);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: promptText },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${screenshotData}` }
        }
      ]
    }],
    max_tokens: 1500,
    temperature: 0.2,
  });

  const plan = response.choices[0].message.content;
  console.log('\n=== Action Plan ===\n');
  console.log(plan);
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: ts-node fullPipeline.ts <url>');
    process.exit(1);
  }

  const elements = await extractElements(url);
  const instruction = await promptUser('\nEnter your natural language instruction: ');
  const expandedInstructions = await expandUserInstruction(instruction);
  const resolvedMap = await resolveReferences(elements, expandedInstructions);
  await planActions(expandedInstructions, resolvedMap);
}

main();

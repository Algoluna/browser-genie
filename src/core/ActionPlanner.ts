import fs from 'fs';
import { OpenAI } from 'openai';
import { AnnotatedElement, ActionPlan, ExecutionContext } from '../types';

const BATCH_SIZE = 1000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class ActionPlanner {
  constructor(private readonly model: string = 'gpt-4o') {}

  async generateActionPlan(instruction: string, elements: AnnotatedElement[], screenshotPath: string, executionContext: ExecutionContext): Promise<ActionPlan> {
    const expandedInstructions = await this.expandUserInstruction(instruction, screenshotPath, executionContext);
    if (!expandedInstructions || expandedInstructions.trim() === "DONE") {
      return { instructions: [] };
    }
    const resolvedMap = await this.resolveReferences(elements, expandedInstructions);
    return await this.planActions(expandedInstructions, resolvedMap, screenshotPath);
  }

  private async expandUserInstruction(instruction: string, screenshotPath: string, executionContext: ExecutionContext): Promise<string> {
    const screenshotData = fs.readFileSync(screenshotPath).toString('base64');
    const prompt = `You are an assistant that helps plan browser automation. 
You are given a user's goal, the past steps which have already been completed and a screenshot of the current page.
Look at the screenshot and see if we have already reached the goal.
If we have reached the goal, then return the string 'DONE'.
Otherwise, come up with some instructions to reach the goal as a series of steps in English.
The steps should be very explicit and describe the page element clearly. 
Use unambiguous HTML terms like "text input" and "button". 
Each step should either directly fulfill the goal or be an exploratory action like opening a dropdown. 
Don't say things like "Locate XYZ object". Only use verbs that suggest interacting with elements on the page.
If the user asks you to "read" or "save" a page, make an instruction like "Read the page". Don't instruct to read specific elements on the page.
If there is an instruction which will navigate away from the page, then always say inspect the page as the next instruction.
Do not give any further instructions after the inspect instruction.
Do not make any assumptions about what will happen if you click on a button or link. 
Always instruct to inspect the page after clicking anything.
Only return the numbered list.
When generating instructions, consider all the steps that have been taken already. Avoid repeating those steps again. Make forward progress.

==== USER INSTRUCTION ====
${instruction}

==== PAST STEPS ====
${JSON.stringify(executionContext.executionHistory, null, 2)}
`;

    console.log(`${prompt}`);
    const response = await openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${prompt}` },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotData}` } }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.2,
    });

    const instructions = response.choices[0].message.content || '';
  
    console.log(`Expanded user instructions to: ${instructions}`)

    return instructions;
  }

  private async resolveReferences(
    elements: AnnotatedElement[],
    instruction: string
  ): Promise<Record<string, { objectId: string; confidence: number }[]>> {
    const resolvedMap: Record<string, { objectId: string; confidence: number }[]> = {};

    console.log('[INFO] Sending VLM batches to resolve references...');
    for (let start = 0; start < elements.length; start += BATCH_SIZE) {
      const batch = elements.slice(start, start + BATCH_SIZE);

      const content: OpenAI.ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: `You are an assistant that helps plan browser automation. 
You are given a set of user instructions and a list of UI elements. Each element has:
- objectId
- label
- role
- a cropped image

Instruction: "${instruction}"

Return only this JSON format:
{
  "resolvedReferences": [
    {
      "reference": "natural language phrase describing object in the user instructions",
      "objectIds": [
        { "objectId": "abc123", "confidence": 0.92 }
      ]
    }
  ]
}

Instructions referring to "the page" don't have an objectId reference.

Only return valid JSON. No commentary.`.trim()
        }
      ];

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
        model: this.model,
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

  private async planActions(
    expandedInstruction: string,
    resolvedMap: Record<string, { objectId: string; confidence: number }[]>,
    screenshotPath: string
  ): Promise<ActionPlan> {
    const screenshotData = fs.readFileSync(screenshotPath).toString('base64');

    const promptText = `
You are a browser automation planner.

You will receive:
1. A list of user instructions
2. A set of resolved references (natural language → objectId with confidence)
3. A full-page screenshot

For each step of the user instructions, generate one or more structured actions to be executed in the browser.

Each action must have the following JSON schema:
{
  "actionType": "click | type | hover | sleep | inspect | giveup | goback | read",
  "objectId"?: "string (optional - only for element-based actions)",
  "text"?: "string (required for 'type')",
  "modifiers"?: { ... }, // optional metadata
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
- "goback": Go back to the previous page in the browser history. Use this only when the current page diverges from
  the goal and we need to backtrack and try other actions.
- "read": Extract a summary of the page and save it. Use this action always as the final action before completing a goal.
  Also use this if the user explicitly asks to "read" or "save" a page. No objectId required.

Guidance:
- Your expanded instructions should either directly complete the user’s goal OR perform an exploratory workflow that opens or reveals new UI components.
- Exploratory workflows (e.g., opening a popup or expanding a dropdown) should end with an "inspect" action.
- Goal-completing workflows should never end with an "inspect" action.
- Only return "inspect" if something is missing.
- Only return "giveup" if the user's instruction cannot be fulfilled at all.

Use the following context to guide your planning:

==== USER INSTRUCTION ====
${expandedInstruction}

==== RESOLVED OBJECT REFERENCES ====
${JSON.stringify(resolvedMap, null, 2)}

Return your output in the following format:

{
  "instructions": [
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
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotData}` } }
          ]
        }
      ],
      max_tokens: 1500,
      temperature: 0.2,
    });

    const result = response.choices[0].message.content;
    if (!result) throw new Error('No action plan returned by OpenAI');

    try {
      const parsed = JSON.parse(result.match(/{[\s\S]+}/)?.[0] || '{}');
      return { instructions: parsed.instructions || [] };
    } catch (e) {
      console.error('[ERROR] Failed to parse action plan JSON:', e);
      throw e;
    }
  }
}
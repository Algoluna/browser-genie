import { OpenAI } from 'openai';
import CDP from 'chrome-remote-interface';
import * as fs from 'fs';
import { createCanvas, loadImage } from 'canvas';

// const OPENAI_ENDPOINT = 'https://api.openai.com/v1';
const OPENAI_ENDPOINT = 'http://localhost:1234/v1';
// const MODEL_NAME = 'gpt-4o';
const MODEL_NAME = 'qwen2.5-vl-32b-instruct';
const ORIGINAL_IMAGE = 'original.png';
const SCALED_IMAGE = 'scaled.png';
const OUTPUT_IMAGE = 'annotated.png';
const ELEMENTS_JSON = 'elements.json';
const MAX_DIM = 1024;

type BoundingBox = { x1: number; y1: number; x2: number; y2: number };

class VisualElement {
  constructor(
    public text: string,
    public role: string,
    public description: string,
    public visual: { color: string; size: string },
    public position: string,
    public boundingBox: BoundingBox
  ) {}

  static fromJSON(obj: any): VisualElement {
    return new VisualElement(
      obj.text,
      obj.role,
      obj.description,
      obj.visual,
      obj.position,
      obj.boundingBox
    );
  }
}

const openai = new OpenAI({
  baseURL: OPENAI_ENDPOINT,
  apiKey: process.env.OPENAI_API_KEY!,
});

async function waitForDocumentReady(client: CDP.Client) {
  console.log("Waiting for document.readyState to be 'complete'...");
  const timeout = 10000;
  const interval = 500;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const { result } = await client.Runtime.evaluate({
      expression: 'document.readyState',
      returnByValue: true,
    });

    if (result.value === 'complete') {
      console.log('Document is ready.');
      return;
    }

    await new Promise(r => setTimeout(r, interval));
  }

  console.warn("Timed out waiting for document.readyState == 'complete'");
}

async function captureScreenshotAfterNavigation(url: string): Promise<void> {
  console.log(`Opening new tab and navigating to ${url}...`);
  const client = await CDP();
  const { Target, Page, Network } = client;

  await Promise.all([Target.setDiscoverTargets({ discover: true }), Network.enable()]);
  const { targetId } = await Target.createTarget({ url });

  const attached = await CDP({ target: targetId });
  const { Page: Page2 } = attached;

  console.log("Enabling page domain...");
  await Page2.enable();
  await waitForDocumentReady(attached);
  await new Promise(r => setTimeout(r, 1000));
  await Page2.bringToFront();

  console.log("Capturing screenshot...");
  const { data } = await Page2.captureScreenshot({ format: 'png' });
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(ORIGINAL_IMAGE, buffer);

  await attached.close();
  await client.close();

  console.log(`Screenshot saved as ${ORIGINAL_IMAGE}`);
}

async function scaleImage(inputPath: string, outputPath: string): Promise<{ width: number; height: number }> {
  console.log("Scaling image...");
  const image = await loadImage(inputPath);
  const w = image.width;
  const h = image.height;

  const scale = MAX_DIM / Math.max(w, h);
  const newW = Math.round(w * scale);
  const newH = Math.round(h * scale);

  const canvas = createCanvas(newW, newH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, newW, newH);

  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`Scaled image saved as ${outputPath} (${newW} x ${newH})`);

  return { width: newW, height: newH };
}

function getPrompt(width: number, height: number): string {
  return `
You are a visual UI interpreter. You are given a screenshot of a web page with dimensions ${width}x${height} pixels.

Your task is to identify all key visual elements on the page such as buttons, links, text blocks, input boxes, icons, images, and menus.

Return a JSON array of objects. Each object should follow this schema:

{
  "text": string,
  "role": string,
  "description": string,
  "visual": {
    "color": string,
    "size": string
  },
  "position": string,
  "boundingBox": {
    "x1": number,
    "y1": number,
    "x2": number,
    "y2": number
  }
}

Coordinates must be **absolute pixel values** on the image, not relative. The origin is at the top left hand corner of the image (not the page).
Return only the JSON array.
`.trim();
}

function getRandomBrightColor(): string {
  const r = 100 + Math.floor(Math.random() * 155);
  const g = 100 + Math.floor(Math.random() * 155);
  const b = 100 + Math.floor(Math.random() * 155);
  return `rgb(${r}, ${g}, ${b})`;
}

async function annotateImageAbsolute(elements: VisualElement[]) {
  console.log("Annotating scaled image with absolute coordinates...");
  const image = await loadImage(ORIGINAL_IMAGE);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  ctx.font = '14px sans-serif';

  elements.forEach((el, i) => {
    const color = getRandomBrightColor();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    const { x1, y1, x2, y2 } = el.boundingBox;
    const w = x2 - x1;
    const h = y2 - y1;

    ctx.strokeRect(x1, y1, w, h);
    ctx.fillText(`[${i + 1}] ${el.role}`, x1 + 4, y1 + 2);
  });

  fs.writeFileSync(OUTPUT_IMAGE, canvas.toBuffer('image/png'));
  console.log(`✅ Annotated image saved as ${OUTPUT_IMAGE}`);
}

async function run() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: ts-node extractScreenshotElements.ts <url>');
    process.exit(1);
  }

  console.log("🧠 Starting extractScreenshotElements pipeline...");
  await captureScreenshotAfterNavigation(url);

  const { width, height } = await scaleImage(ORIGINAL_IMAGE, SCALED_IMAGE);
  const prompt = getPrompt(width, height);
  const imageData = fs.readFileSync(ORIGINAL_IMAGE, 'base64');

  console.log("🧠 Sending image to OpenAI VLM...");
  const completion = await openai.chat.completions.create({
    model: MODEL_NAME,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageData}`,
            },
          },
        ],
      },
    ],
  });

  const content = completion.choices[0].message.content;
  if (!content) throw new Error('No content returned by model.');
  const jsonMatch = content.match(/\[.*\]/s);
  if (!jsonMatch) throw new Error('No valid JSON array in model response.');

  const elementsRaw = JSON.parse(jsonMatch[0]);
  const elements = elementsRaw.map((obj: any) => VisualElement.fromJSON(obj));

  console.log(`✅ Extracted ${elements.length} elements from model.`);
  fs.writeFileSync(ELEMENTS_JSON, JSON.stringify(elementsRaw, null, 2));
  console.log(`💾 Saved raw JSON to ${ELEMENTS_JSON}`);

  await annotateImageAbsolute(elements);
}

run().catch(console.error);

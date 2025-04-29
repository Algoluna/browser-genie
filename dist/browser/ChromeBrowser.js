"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChromeBrowser = void 0;
const chrome_remote_interface_1 = __importDefault(require("chrome-remote-interface"));
const fs_1 = __importDefault(require("fs"));
const canvas_1 = require("canvas");
const types_1 = require("../types");
const OUTPUT_DIR = 'clips';
const ELEMENTS_JSON = 'elements.json';
const SCREENSHOT_PATH = 'original.png';
const MIN_BOX_WIDTH = 20;
const MIN_BOX_HEIGHT = 20;
const MIN_TEXT_LENGTH = 10;
function getBoxBoundsFromQuad(quad) {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const x1 = Math.min(...xs);
    const y1 = Math.min(...ys);
    const x2 = Math.max(...xs);
    const y2 = Math.max(...ys);
    return [x1, y1, x2, y2];
}
function isBoxBigEnough(box) {
    const [x1, y1, x2, y2] = box;
    return (x2 - x1) >= MIN_BOX_WIDTH || (y2 - y1) >= MIN_BOX_HEIGHT;
}
function isSignificantContent(tag, role, label) {
    const hasText = label?.length >= MIN_TEXT_LENGTH;
    return hasText;
}
async function waitForDocumentReady(client) {
    const timeout = 10000;
    const interval = 500;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const { result } = await client.Runtime.evaluate({ expression: 'document.readyState', returnByValue: true });
        if (result.value === 'complete')
            return;
        await new Promise(r => setTimeout(r, interval));
    }
}
async function simulatePopupClicks(Runtime) {
    await Runtime.evaluate({
        expression: `Array.from(document.querySelectorAll('[aria-haspopup="true"]')).forEach(el => el.click());`,
    });
    await new Promise(r => setTimeout(r, 1000));
}
async function getBoundingBox(client, objectId) {
    const { DOM, Runtime } = client;
    try {
        const { model } = await DOM.getBoxModel({ objectId });
        return getBoxBoundsFromQuad(model.border);
    }
    catch {
        try {
            const { quads } = await DOM.getContentQuads({ objectId });
            if (quads && quads.length > 0) {
                return getBoxBoundsFromQuad(quads[0]);
            }
        }
        catch { }
        try {
            const { result } = await Runtime.callFunctionOn({
                objectId,
                functionDeclaration: `function() {
          const r = this.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }`,
                returnByValue: true
            });
            const { left, top, right, bottom } = result.value;
            return [left, top, right, bottom];
        }
        catch {
            throw new Error('Could not determine bounding box for element');
        }
    }
}
class ChromeBrowser {
    clients = [];
    async launch(url) {
        const client = await (0, chrome_remote_interface_1.default)();
        const { Target } = client;
        const { targetId } = await Target.createTarget({ url });
        const tab = await (0, chrome_remote_interface_1.default)({ target: targetId });
        this.clients.push(client, tab);
        const { DOM, Runtime, Page, Accessibility, Network } = tab;
        await Promise.all([DOM.enable(), Runtime.enable(), Page.enable(), Accessibility.enable(), Network.enable()]);
        await waitForDocumentReady(tab);
        await new Promise(r => setTimeout(r, 1000));
        await Page.bringToFront();
        const executionContext = new types_1.ExecutionContext(targetId);
        return executionContext;
    }
    async captureState(context) {
        const tab = await (0, chrome_remote_interface_1.default)({ target: context.targetId });
        this.clients.push(tab);
        context.client = tab;
        const { DOM, Runtime, Page, Accessibility } = tab;
        await waitForDocumentReady(tab);
        await simulatePopupClicks(Runtime);
        const { result: titleResult } = await Runtime.evaluate({
            expression: `document.title`,
            returnByValue: true
        });
        const { result: urlResult } = await Runtime.evaluate({
            expression: `window.location.href`,
            returnByValue: true
        });
        const elementsByObjectId = new Map();
        const { root } = await DOM.getDocument({ depth: -1, pierce: true });
        const actionableTags = new Set(['button', 'a', 'input', 'textarea', 'select', 'label']);
        async function traverseDOM(node) {
            if (!node?.nodeId || !node.nodeName)
                return;
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
                    let box = null;
                    try {
                        box = await getBoundingBox(tab, object.objectId);
                    }
                    catch { }
                    const keep = (box && isBoxBigEnough(box)) || isSignificantContent(tag, '', label);
                    if (keep && !elementsByObjectId.has(object.objectId)) {
                        elementsByObjectId.set(object.objectId, { nodeId, objectId: object.objectId, tag, role: '', label, box });
                    }
                }
                catch { }
            }
            for (const child of node.children || [])
                await traverseDOM(child);
        }
        await traverseDOM(root);
        const { nodes: axNodes } = await Accessibility.getFullAXTree();
        const interestingRoles = new Set(['button', 'link', 'menu', 'menuitem', 'tabpanel', 'tab', 'list', 'listitem', 'dialog', 'image', 'graphic', 'icon']);
        for (const axNode of axNodes) {
            if (!axNode.role || !axNode.name || !axNode.backendDOMNodeId)
                continue;
            const role = axNode.role.value;
            const label = axNode.name.value?.trim() || '';
            if (!interestingRoles.has(role))
                continue;
            try {
                const { node } = await DOM.describeNode({ backendNodeId: axNode.backendDOMNodeId });
                const nodeId = node.nodeId;
                const { object } = await DOM.resolveNode({ nodeId });
                let box = null;
                try {
                    box = await getBoundingBox(tab, object.objectId);
                }
                catch { }
                const tag = '';
                const keep = (box && isBoxBigEnough(box)) || isSignificantContent(tag, role, label);
                if (keep && !elementsByObjectId.has(object.objectId)) {
                    elementsByObjectId.set(object.objectId, { nodeId, objectId: object.objectId, tag, role, label, box });
                }
            }
            catch { }
        }
        const { data } = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: true });
        const buffer = Buffer.from(data, 'base64');
        fs_1.default.writeFileSync(SCREENSHOT_PATH, buffer);
        const image = await (0, canvas_1.loadImage)(buffer);
        if (!fs_1.default.existsSync(OUTPUT_DIR))
            fs_1.default.mkdirSync(OUTPUT_DIR);
        const elements = Array.from(elementsByObjectId.values());
        fs_1.default.writeFileSync(ELEMENTS_JSON, JSON.stringify(elements, null, 2));
        console.log(`✅ Saved ${elements.length} elements to ${ELEMENTS_JSON}`);
        return {
            elements,
            screenshotPath: SCREENSHOT_PATH,
            title: titleResult.value,
            url: urlResult.value
        };
    }
    async click(context, objectId) {
        const { Input } = context.client;
        const [x1, y1, x2, y2] = await getBoundingBox(context.client, objectId);
        const x = (x1 + x2) / 2;
        const y = (y1 + y2) / 2;
        await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
        await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    async hover(context, objectId) {
        const { Input } = context.client;
        const [x1, y1, x2, y2] = await getBoundingBox(context.client, objectId);
        const x = (x1 + x2) / 2;
        const y = (y1 + y2) / 2;
        await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
    }
    async type(context, objectId, text) {
        const { Runtime, Input } = context.client;
        await Runtime.callFunctionOn({ objectId, functionDeclaration: 'function() { this.focus(); }' });
        for (const char of text) {
            await Input.dispatchKeyEvent({ type: 'char', text: char });
        }
        await this.pressEscape(context);
    }
    async pressEscape(context) {
        const { Input } = context.client;
        await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    }
    async goback(context) {
        const { Page } = context.client;
        await Page.goBack();
        await waitForDocumentReady(context.client);
    }
    async extractSummary(context) {
        const { Runtime } = context.client;
        const { result: textResult } = await Runtime.evaluate({
            expression: `
  (function extractTextTree(node) {
    const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code']);
  
    function isVisible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && +style.opacity !== 0 && rect.width > 0 && rect.height > 0;
    }
  
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        return text ? { tag: 'text', text, children: [] } : null;
      }
  
      if (node.nodeType !== Node.ELEMENT_NODE || !isVisible(node)) {
        return null;
      }
  
      const tag = node.tagName.toLowerCase();
      const children = [];
  
      for (const child of node.childNodes) {
        const result = walk(child);
        if (result) children.push(result);
      }
  
      if (BLOCK_TAGS.has(tag)) {
        if (children.length === 1 && children[0].tag === 'text') {
          return { tag, text: children[0].text, children: [] };
        }
        return { tag, children };
      } else {
        if (children.length === 1) return children[0];
        if (children.length > 1) return { tag: 'group', children };
        return null;
      }
    }
  
    return walk(document.body);
  })(document.body);
      `,
            returnByValue: true,
        });
        const { result: imageResult } = await Runtime.evaluate({
            expression: `
  Array.from(document.images)
    .filter(img => img.offsetWidth || img.offsetHeight || img.getClientRects().length)
    .map(img => ({
      src: img.src,
      alt: img.alt || ""
    }))
      `,
            returnByValue: true,
        });
        const [{ result: titleResult }, { result: urlResult }] = await Promise.all([
            Runtime.evaluate({ expression: 'document.title', returnByValue: true }),
            Runtime.evaluate({ expression: 'window.location.href', returnByValue: true }),
        ]);
        return new types_1.PageSummary(titleResult.value, urlResult.value, textResult.value, imageResult.value);
    }
    async close() {
        for (const client of this.clients) {
            try {
                await Promise.race([
                    client.close(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout closing CDP connection')), 3000))
                ]);
            }
            catch (err) {
                console.warn('[CHROME] ⚠️ Failed to close CDP client:', err);
            }
        }
        this.clients = [];
    }
}
exports.ChromeBrowser = ChromeBrowser;
//# sourceMappingURL=ChromeBrowser.js.map
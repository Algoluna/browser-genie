"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageSummary = exports.ExecutionContext = void 0;
class ExecutionContext {
    client;
    targetId;
    executionHistory = [];
    stateHistory = [];
    pageSummaries = [];
    constructor(targetId) {
        this.targetId = targetId;
    }
    pushHistory(instruction) {
        this.executionHistory.push(instruction);
    }
    pushState(state) {
        this.stateHistory.push(state);
    }
    pushPageSummary(summary) {
        this.pageSummaries.push(summary);
    }
}
exports.ExecutionContext = ExecutionContext;
class PageSummary {
    title;
    url;
    visibleText;
    images;
    constructor(title, url, visibleText, images) {
        this.title = title;
        this.url = url;
        this.visibleText = visibleText;
        this.images = images;
    }
    print() {
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
        }
        else {
            console.log(`\n🖼️ No visible images`);
        }
        console.log('\n' + '='.repeat(60));
    }
    printTextTree(node, indent = 0) {
        if (!node)
            return;
        const prefix = '  '.repeat(indent);
        if (node.text) {
            console.log(`${prefix}${node.text}`);
        }
        if (node.children?.length) {
            console.log(`${prefix}<${node.tag}>`);
            for (const child of node.children) {
                this.printTextTree(child, indent + 1);
            }
        }
        else if (!node.text) {
            // fallback: still show tag
            console.log(`${prefix}<${node.tag} />`);
        }
    }
}
exports.PageSummary = PageSummary;
//# sourceMappingURL=index.js.map
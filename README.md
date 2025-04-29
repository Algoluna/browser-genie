# Browser Genie

**Browser Genie** is a modular, LLM-driven browser automation agent built in TypeScript. It leverages the Chrome DevTools Protocol (CDP) for robust browser control and OpenAI GPT-4o for vision-language planning and reasoning. The system enables natural language-driven automation of web pages, supporting complex, multi-step workflows with transparency and extensibility.

---

## High-Level Architecture

```
flowchart TD
    CLI["CLI (src/cli/cli.ts)"] --> Genie["BrowserGenie (src/core/BrowserGenie.ts)"]
    Genie --> Planner["ActionPlanner (src/core/ActionPlanner.ts)"]
    Genie --> Executor["PlanExecutor (src/core/PlanExecutor.ts)"]
    Executor --> Browser["ChromeBrowser (src/browser/ChromeBrowser.ts)"]
    Browser -->|CDP| Chrome["Chrome"]
    Genie -->|Summaries| Printer["PageSummaryPrinter (src/extract/PageSummaryPrinter.ts)"]
```

- **CLI**: Entry point. Accepts a URL and a natural language goal from the user.
- **BrowserGenie**: Orchestrates the automation loop, coordinating planning, execution, and output.
- **ActionPlanner**: Uses OpenAI GPT-4o to expand user goals, resolve UI references, and generate structured action plans.
- **PlanExecutor**: Executes action plans by invoking browser actions and handling control flow.
- **ChromeBrowser**: Implements browser automation using the Chrome DevTools Protocol.
- **PageSummaryPrinter**: Formats and prints structured summaries of page state and results.

---

## Key Design Decisions

- **Modular, Extensible Architecture**  
  Each major responsibility (planning, execution, browser control) is encapsulated in a dedicated class with clear interfaces, enabling easy extension or replacement of components.

- **Multi-Stage LLM Planning**  
  The system uses a vision-language model (OpenAI GPT-4o) at multiple stages:
  - Expanding user goals into explicit, step-by-step instructions, using screenshots and execution history.
  - Resolving natural language references to specific UI elements, using cropped element images and metadata.
  - Generating structured action plans (JSON) specifying browser actions.

- **Robust Browser Introspection**  
  The browser layer captures actionable elements via DOM and accessibility tree traversal, simulates popups, and takes full-page screenshots. This enables the planner to reason about the true state of the page.

- **Iterative, Transparent Planning Loop**  
  The system iterates up to 5 times, replanning as needed based on execution results and updated page state. All plans, actions, and summaries are logged for transparency and debugging.

- **TypeScript-Only Implementation**  
  All code is TypeScript, with no native or Rust dependencies, simplifying development and deployment.

---

## High-Level Implementation Details

- **ActionPlanner**  
  - Expands user instructions using LLM and screenshots.
  - Resolves references to UI elements using LLM and cropped images.
  - Generates structured action plans (click, type, hover, inspect, giveup, goback, read, sleep).

- **PlanExecutor**  
  - Executes each action in the plan, invoking browser methods and handling control flow (success, error, replanning, giveup).

- **ChromeBrowser**  
  - Launches and controls Chrome via CDP.
  - Captures actionable elements, screenshots, and page summaries.
  - Supports robust element interaction (by objectId and coordinates).

- **Data Flow**  
  1. User provides a URL and goal via CLI.
  2. BrowserGenie launches Chrome and enters the planning loop.
  3. ActionPlanner generates a plan based on the current state.
  4. PlanExecutor executes the plan.
  5. BrowserGenie prints summaries and results.
  6. Loop continues until success, error, or giveup.

- **Extensibility**  
  - New planners, executors, or browser backends can be added by implementing the relevant interfaces.
  - The system is designed for easy integration with other LLMs or browser engines.

---

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set your OpenAI API key:**
   ```bash
   export OPENAI_API_KEY=sk-...
   ```

3. **Run the CLI:**
   ```bash
   npx ts-node src/cli/cli.ts https://example.com
   ```

---

## CLI Usage

The CLI is the main entry point for Browser Genie. It requires a URL as a command-line argument and will prompt you for a natural language instruction.

**Basic usage:**
```bash
npx ts-node src/cli/cli.ts <url>
```

- `<url>`: The web page to automate (e.g., `https://example.com`).

**Example session:**
```bash
npx ts-node src/cli/cli.ts https://en.wikipedia.org/wiki/OpenAI

🤖 Enter your natural language instruction: Summarize the first paragraph and list all section headings.
```

The agent will launch Chrome, analyze the page, and iteratively plan and execute actions to fulfill your instruction. Progress, plans, and results will be printed to the terminal.

---

## Limitations

While Browser Genie demonstrates advanced LLM-driven browser automation, it currently has several limitations:

- **Chrome-Only**: Automation is limited to Google Chrome via the Chrome DevTools Protocol. Other browsers (Firefox, Safari, Edge) are not supported.
- **Requires OpenAI API Key**: The planner depends on OpenAI GPT-4o and requires a valid API key and internet access.
- **LLM/VLM Non-Determinism**: Planning and reference resolution rely on large language/vision models, which may hallucinate, fail to parse, or produce suboptimal plans.
- **No Persistent Memory**: The agent does not learn or persist knowledge across sessions.
- **Limited Iterations**: Each session is capped at 5 planning/execution iterations.
- **No Advanced Navigation**: Features like multi-tab workflows, file uploads, or complex authentication flows are not supported.
- **Error Handling**: Error recovery is basic; there is no robust retry or fallback logic.
- **CLI-Only**: There is no web UI or graphical interface.
- **No Test Coverage**: The project currently lacks automated tests and CI/CD integration.
- **Limited Extensibility**: While modular, there is no plugin system for custom planners, executors, or browser backends.
- **No Headless Mode Options**: Browser launch options (e.g., headless/headful, custom flags) are not exposed to the user.

Contributions to address these limitations are welcome.

---

## License

MIT

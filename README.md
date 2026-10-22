# Research Canvas for Zotero

Research Canvas is a Zotero 10 plugin for arranging notes, annotations, references and your own ideas on local canvases. Cards remain linked to their Zotero sources. Create frames, label connectors, compare evidence, and export to SVG, PNG, PDF, JSON or Obsidian Canvas.

## Install

1. Download the latest `research-canvas-*.xpi` from [Releases](https://github.com/Dcrizz/zotero-research-canvas/releases).
2. In Zotero 10, open **Tools → Plugins**, choose **Install Plugin From File**, and select the XPI.
3. Open **Research Canvas** from Zotero's Tools menu. Your canvases are saved locally in Zotero's data directory under `research-canvas/`.

The tested version is Zotero 10.0.6 on macOS. Other Zotero 10.0 builds and operating systems need community testing. Back up your Zotero profile and canvas directory before upgrading. The plugin does not require an account or AI service for ordinary canvas editing.

## Use the canvas

- Drag Zotero notes, annotations or references onto a canvas, or use the search bar. A card's source action opens the original item; annotation cards can jump to their saved PDF highlight.
- Right-click blank space to add a card or frame. Use the left object toolbar for shapes, sticky notes, text, tables, wireframes, templates, images, files and [Excalidraw library](https://libraries.excalidraw.com/) imports. Click the active icon again to close its palette.
- Drag a card port onto another card to connect them; click a port to create a smaller child card. Edit route points, arrowheads, colour, thickness and labels from the connector controls.
- Define reusable **Link types** in **Zotero Settings → Research Canvas**. Built-ins include green **SL ✅** supporting links and red **❌CL** critical links. Custom types can set a name, displayed label, colour, thickness, pattern, route and arrows.
- Use the Canvas Explorer to organise canvases in folders, embed one canvas in another, and recover deleted canvases from Trash.
- Select several cards with Shift-click or the drag selection tool to move, resize, align, colour or delete them together. Undo and local version snapshots help recover changes.

Embedded images display in the card. PDFs use a scrollable document viewer; DOCX and plain-text files show scrollable text. Other file types retain the original bytes with a Save file action. Individual files are limited to 20 MB. Exports include embedded assets; Word previews are text extracts, so complex page layout stays in the original file.

## AI and semantic search

AI is optional. **Connections** compares selected cards and proposes links with source excerpts. **Counter** and **Supporting** search notes and annotations for challenging or corroborating evidence; you review each result before adding it. Accepted results connect to the original card. Generation alone never changes the canvas.

Choose one AI provider in **Zotero Settings → Research Canvas**:

- **Awesome GPT** reuses its model and credentials. No key is copied into Research Canvas.
- **Own API key** accepts an HTTPS OpenAI-compatible Chat Completions endpoint and model ID. Save the key separately; Zotero's password manager stores it outside canvas files, settings JSON and exports. Provider charges and data handling follow your provider's terms. [OpenAI Chat Completions reference](https://platform.openai.com/docs/api-reference/chat/create).

Semantic search and the Counter/Supporting library workflows additionally need the [Zotero MCP Plugin by cookjohn](https://github.com/cookjohn/zotero-mcp) with its semantic index enabled and built. Research Canvas uses that plugin's in-process `callSemanticSearch` service; it does not require an external MCP client or the separate Zotero debugging bridge. Keyword search works without it. See [AI and MCP setup](docs/AI-AND-MCP.md) for steps, limits and troubleshooting.

AI analyses are text-only and bounded. They send the selected card text and, for library searches, retrieved excerpts to the chosen model. Image pixels and image-only annotations are not analysed. You decide whether to accept each suggestion. The semantic service is an internal integration with the Zotero MCP Plugin and may need updating when that plugin changes.

## Data and exports

Canvas files and snapshots stay in your local Zotero data directory. Source notes and annotations retain Zotero's normal saving and sync. JSON export backs up the editable canvas; SVG, PNG and PDF exports are visual snapshots. Obsidian export writes `.canvas`, Markdown and asset files into a folder you choose inside your vault. It is one-way: edits made in Obsidian do not sync back to Zotero. See [Feature guide](docs/FEATURES.md) for more detail.

## Build and test

The installable XPI contains `manifest.json`, `bootstrap.js`, `LICENSE` and `content/`; no Node dependency runs in Zotero. From the repository root:

```sh
npm ci
npm test
npm run test:objects
npm run test:workspace
npm run build
```

`npm run build` writes a deterministic XPI and source archive to the parent directory. Browser tests require Playwright's Chromium (`npx playwright install chromium`). Native Zotero integration tests use a **separate disposable profile** and are described in [Testing](docs/TESTING.md). Do not point the native test runner at your everyday Zotero profile.

## Contributing and licence

Issues and pull requests are welcome. Please include the Zotero version, operating system, steps to reproduce, and whether Awesome GPT or the semantic MCP plugin is installed. Do not include API keys, private notes or Zotero database files in issues. Research Canvas is MIT licensed; bundled Excalidraw Forms objects retain their own attribution and MIT notice in [Third-party notices](THIRD_PARTY.md).

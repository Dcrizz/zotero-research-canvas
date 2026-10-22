# Changes

- 0.36.0: Adds Insert chain with iconic Conditional and Sequential options and editable, ungrouped instruction placeholders. Ordinary cards support direct rich-text editing, live Markdown heading/list shortcuts and a contextual formatting toolbar; cards and groups support Copy/Paste with internal links and Undo. Hides unsaved template drafts from dashboard recents, displays saved custom/default templates once, reuses editor drafts and avoids draft snapshot histories. Formatted conditional instructions retain their guards. Removes the accent border from exported quotations.

- 0.35.1: Expands the custom-template starter with separate Sequential Numerical Example and Conditional Branches Example groups. Includes the full saved conditional example when available, preserves the original custom template, and adds brief explanations and use cases excluded from template saving and AI filling.
- 0.35.0: Adds continuous perimeter attachment with a hover/snap ring in place of four fixed connector dots. Simplifies elbow segment controls and snaps drags without accumulating bends. Numbered AI drafts have consistent horizontal or vertical flow and aligned branches. New custom template drafts include editable sequential and conditional examples alongside the excluded guidance card; separately saved examples remain intact.
- 0.34.0: Adds Create Template with an excluded guidance card, separate single-format and all-format restores, and a custom-only template selector. Adds AI template authoring with Create draft and Revise draft, prompt-based instructions, validation, cancellation and one-step Undo. Template runs retain their existing source-grounded analysis workflow.
- 0.33.0: Adds a home icon beside Zotero selection, a dashboard Templates manager with previews and per-format defaults, and a Manage templates entry in Zotero settings. Format-default templates save card and layout edits automatically without naming; Restore built-in defaults resets all six formats while preserving named custom templates. Built-in link types can be customised and reset. Custom template selectors and versioned dashboard assets prevent duplicate option text and stale styles after updates. Adds independent freeform and mind-map custom templates, a custom template browser, and Use custom template from Zotero sources. Item and collection context menus now group shortened, individually illustrated actions under Canvas tools.

- 0.31.0: Adds on-demand evidence health checks, source coverage by parent Zotero work, a read-only argument walkthrough, and conditional AI template branches with saved omission explanations. Generated cards now retain their exact evidence quote for later checks.

- 0.30.1: Numbered template cards run through AI in ascending steps. Later steps receive only verified earlier answers as context; equal-numbered cards run together and unnumbered cards retain a single flexible batch after numbered steps. The fill dialog shows progress by step.

- 0.30.0: Adds six editable built-in research templates, saved per-format custom templates and defaults, and AI filling of instruction cards from selected Zotero sources. Matrix rows expand across selected sources; filled cards keep exact excerpts, source links and verified page positions when available. Adds circular junctions at any connector point for branching to cards or other connectors; the Timeline template uses a dated connector spine with junctions.

- 0.29.5: Generated Concept Maps use a source-grounded Definition card at the centre and spread the other cards into four more spacious branches. Blank comparison matrices explain how to add Zotero sources.

- 0.29.4: Allows cards in Mind map and Concept Map to be dragged without losing their positions on redraw or reload. Reflow restores automatic placement; Concept Map links attach to facing sides. Clarifies which Zotero action creates a mind map.

- 0.29.3: Adds a multi-source Concept Map centred on a named concept, with typed source cards and topic headings. Adds Group and Ungroup to the blank-canvas menu. Uses page-positioned Awesome GPT PDF passages when available so generated cards can jump to verified PDF pages; index-only excerpts still show page unavailable.

- 0.29.2: Adds an optional focus prompt before comparing selected sources. The focus steers the source-grounded analysis and prioritizes relevant indexed-PDF excerpts; leaving it blank retains the general comparison.

- 0.29.1: Gives literature columns and cards more space. New source-comparison cards have provisional types, distinct colours and clearer relationship labels. PDF annotation cards show saved page labels; plain indexed PDF excerpts still indicate when page location is unavailable.

- 0.29.0: Adds five structured canvas formats and horizontal/vertical mind-map layouts with direct facing parent-child links. Zotero item-menu actions create excerpt-grounded comparison or concept canvases from selected sources, with links back to notes, annotations and indexed PDFs. Generated interpretations are marked as bounded drafts.

- 0.28.0: Adds a Zotero Canvas dashboard launched from Zotero's right-hand icon rail or Tools menu. Create freeform canvases, mind maps and folders; browse recent canvases with live previews, folder filters, search and grid/list views.

- 0.27.2: Renames the visible plugin to Zotero Canvas while preserving its plugin ID, board storage and saved AI credentials. New Obsidian exports use the new name; existing export bundles remain accepted. Adds sample screenshots and clarifies automatic Awesome GPT/Zotero MCP integrations, the own-key alternative and the separate semantic-index requirement. Panning and zooming retain existing card previews, preventing annotation and embedded-content flicker; annotation previews also stay attached while their cards move. Free connectors default to elbow routing, with larger endpoint/bend hit areas and a live routed line while dragging an endpoint.

- 0.27.0: Reusable link types can be created, edited and removed in Zotero Settings. Supporting and critical links default to `SL ✅` and `❌CL`; connector labels remain fully visible.
- 0.27.0: Adds an optional HTTPS OpenAI-compatible provider with a user-supplied endpoint, model and API key stored in Zotero's password manager. The existing Awesome GPT provider remains available.
- 0.27.0: Publishes installation, AI/MCP setup, privacy, testing and contribution guidance for the public release.
- 0.26.1: Object palettes close when their toolbar icon is clicked again. Cards gain partial fill, and the object toolbar imports images and documents with embedded images and scrollable previews where supported.

- 0.26.0: Adds a vertical object palette: nine diagram shapes, six sticky-note colours, text boxes, editable tables, six wireframe components and three research/screen templates. Objects support selection, move, resize, connectors, history and save/reload.
- 0.26.0: Includes 26 MIT Excalidraw Forms library items with attribution and licence notices. Imports version 1/2 .excalidrawlib vector sets into a reusable local library, reporting unsupported elements. Imported items remain vector composites; SVG/Obsidian export preserves assets and notices.
- 0.26.0: Table cells/rows/columns have a dedicated editor; SVG exports preserve object appearance and Obsidian exports tables as editable Markdown. Diagram objects can resize below standard source-card minimums.

- 0.25.1: Filters & colours, Select cards and Find on canvases use SVG icons with hover/focus labels. Box-selection mode highlights its icon, uses a crosshair and shows an on-canvas drag hint; Escape resets it. Shift-drag remains available.

- 0.25.0: AI actions move from the research toolbar into an icon menu above every card: Connections, Counter, Supporting. Actions select the clicked card; Connections only suggests relationships involving it and clears old results when changing cards. Keyboard navigation and Escape/outside dismissal are supported.
- 0.25.0: Removes the top-level Child button; port-click creation remains. Undo/Redo become labeled SVG icon buttons with hover text. JSON export/import and export/recovery move into a right-aligned Export / Import menu.

- 0.24.0: Shared explicit choice controls replace remaining native HTML dropdowns (view mode, folder destinations and default shape), avoiding recurring duplicated popup text in Zotero chrome windows. Adds arrow-key selection, bounded folder lists, wrapping tool rows and viewport-clamped menus/dialogs.
- 0.24.0: Adding a reviewed counterexample creates a red Counterexample connector to the original selected card. Find supporting sources reuses semantic retrieval and exact excerpt review; adding one creates a green Supporting source connector. Card and connector are saved/undone together; saved explanations are available from either. No graph mutation occurs while generating or dismissing results.

- 0.23.0: Counterexample search uses the existing Zotero MCP semantic index and configured Awesome GPT model to retrieve saved library notes/annotations. Shows exact supporting excerpts and individual Add/Dismiss decisions; chosen cards retain their explanation without automatically linking or changing source notes.
- 0.23.0: Hover ports display a plus; click creates a child inheriting appearance at 85% of parent dimensions (minimum 140 by 100). Drag creates attached or loose connectors; selected endpoints and bend handles can be dragged. Custom routes persist, undo and export.
- 0.23.0: Repairs AI scope controls, aligns dark blue note action buttons with card tops, and moves card/frame creation to an empty-canvas right-click icon toolbar.

- 0.22.0: AI connection review uses the configured Awesome GPT model, supports selected cards/frame/all cards, verifies verbatim excerpts from both sources, and requires individual Accept/Reject decisions. Accepted links preserve explanations/evidence; unchanged rejected pairs and existing links are excluded. Changed sources, board switches, cancellation and save failures are guarded. Accepted note-to-note links retain the existing additive Zotero Related behavior.

- 0.21.0: Send to Obsidian exports editable JSON Canvas files, Markdown source cards and annotation image assets, including linked canvases and reciprocal references. Exports are separate snapshots with source links; existing exports are never overwritten.
- 0.21.0: Zotero Settings → Research Canvas configures the Obsidian export folder/open-after-send and default card colours/borders/size/shape/text plus canvas background/grid. Existing styling is preserved.

- 0.20.2: Explorer folder titles use bold 14px type, slightly larger than 13px canvas titles.

- 0.20.1: top-right Explorer fold button and canvas-edge unfold button, preserving the app-icon toggle.
- 0.20.1: folder icons with persistent custom colours and reset from the folder context menu; canvas rows use the supplied easel icon, including entries in folders and Trash.

- 0.20.0: fold-out Canvas Explorer with named canvas creation, folders, drag-to-folder organisation, rename/move context actions, recoverable Trash, and active-canvas accent. Header management controls move into Explorer.
- 0.20.0: cross-canvas link and live embedded overview cards; reciprocal embeds remain one level deep; incoming-link lookup and open-canvas navigation. Embedded overview images are retained in exports.
- 0.20.0: removes the persistent Selection pane; idea/reference text edits live in the floating Text tool, delete icons in card/connector toolbars, and membership results in a closable pop-up.

- 0.12.0: independent named frames, floating styling toolbar, group movement and mode retention. Installed after browser and model review.
- 0.12.1: replaced overlapping native search dropdown with segmented method buttons. Installed after browser regression checks.
- 0.13.0: source metadata filters, tag-family colour overlays, strict search content-type selection and closing results after insertion. Installed after 75 native checks.
- 0.14.0: exact annotation source navigation. Installed after 76 native checks.
- 0.15.0: multiple selection, group movement/resizing, alignment, spacing, colour and deletion. Installed after 78 native checks.
- 0.16.0: built-in and custom reusable connector meanings. Installed after 79 native checks.
- 0.17.0: canvas membership and jump-to-card navigation. Installed after 82 native checks.
- 0.18.0: SVG/PNG/PDF exports; automatic history with non-destructive recovery; annotation header menu, native-style preview/tag pills and highlight-colour pill; frame controls remain accessible over card content.
- 0.18.1: annotation-colour labels follow the active custom palette in the live library, including custom pink/teal/brown/mint colours and semantic names.
- 0.19.0: annotation outer headers use Creator (YYYY) - Item title; native annotation headings/content inside cards are retained; existing source links refresh headers after reference metadata edits.
- 0.19.0: zoom controls moved into a bottom-left icon toolbar with hover/focus labels, centre-preserving zoom, 100% reset, Centre and Fit all.

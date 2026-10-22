# AI and Zotero MCP setup

Zotero Canvas has two independent optional integrations:

1. A text model for connection suggestions, source-grounded comparison/concept canvases, and review of supporting or critical evidence. Choose **Awesome GPT** or **Own API key** under **Zotero Settings → Zotero Canvas → AI access**.
2. The [Zotero MCP Plugin](https://github.com/cookjohn/zotero-mcp) semantic index for concept-based canvas search and finding library notes/annotations. This is the Zotero MCP Plugin, not the MCP Bridge for Zotero used for debugging.

When Awesome GPT is installed with a configured model, Zotero Canvas uses its model and credentials automatically under the default provider setting. When the Zotero MCP Plugin has semantic search enabled and an index built, Zotero Canvas uses that index automatically. Neither integration needs a second API key entered in Zotero Canvas. If Awesome GPT is absent, select **Own API key** and configure a compatible provider below. This replaces the text-model connection only: Counter, Supporting and Semantic search still require the Zotero MCP Plugin's index.

## Configure a model

**Awesome GPT:** Install and configure [Awesome GPT](https://github.com/MuiseDestiny/zotero-gpt). Select a model in its settings, then leave Zotero Canvas's provider set to Awesome GPT. Zotero Canvas calls Awesome GPT's installed request service; its credentials remain there.

**Own API key:** Choose Own API key, enter the model ID and an HTTPS Chat Completions URL, then click **Save settings**. Enter your key and click **Save API key** separately. The default endpoint is `https://api.openai.com/v1/chat/completions`. Other providers must support a compatible `model` + `messages` request and a `choices[0].message.content` response. A successful model choice and key are both required. The key is stored through Zotero's password manager and can be removed in the same settings pane; it is never written to a canvas, settings JSON or exported archive. Changing the provider does not delete a saved key. Configure the endpoint only for a service you trust with the selected source excerpts.

No model request is made until you choose an AI action. Connections, Counter and Supporting propose results for individual acceptance. Source comparison and concept actions create editable draft canvases after checking every generated quote against the supplied passage. An optional focus prompt before a source comparison directs the model and helps choose indexed-PDF excerpts; an empty prompt keeps the general comparison. It does not relax quote or relationship checks. For Connection suggestions, at most 30 cards and 4,000 normalised text characters per card are submitted. Counter/Supporting searches send the chosen card and at most 30 retrieved passages of up to 2,400 characters each. Source canvases send bounded saved-note, annotation and indexed-PDF excerpts; they do not send complete PDFs. Saved PDF annotations provide page labels and exact annotation links. Zotero's plain-text PDF index has no dependable page mapping, so excerpts taken only from that index have no page number. Awesome GPT's command-tag `getRelatedText` searches passages from the current selection; its `[number]` markers identify retrieved passages, not verified PDF pages. Source canvases use the text model but do not require the Zotero MCP Plugin's semantic index. The model's explanations and card types still need human checking.

## Configure semantic search

1. Install a compatible release of [cookjohn's Zotero MCP Plugin](https://github.com/cookjohn/zotero-mcp/releases) in Zotero 10. Zotero Canvas was developed against version 1.6.0.
2. In Zotero MCP Plugin preferences, enable semantic search and configure its embedding provider. Its documentation describes OpenAI and Ollama embeddings. Build/index the items you want to search and check the plugin's index status in Zotero. The index belongs to that plugin; Zotero Canvas does not create, update or copy it.
3. Open Zotero Canvas and select **Semantic** in the search bar. Search for a concept you know appears in an indexed note. The Counter and Supporting actions use the same indexed service.

You do not need to configure an external MCP client or launch another MCP process for this integration. Zotero Canvas calls the installed plugin's internal semantic-search service directly. Its internal API is not a stable public contract; if a future Zotero MCP Plugin release changes it, semantic features may need a Zotero Canvas update. Keyword/tag search and ordinary editing remain available without the MCP plugin.

## Troubleshooting

- **Enable Awesome GPT…**: Choose a model in Awesome GPT, or switch Zotero Canvas to Own API key and configure a model plus key.
- **Save an AI API key…**: Save the key in Zotero Canvas settings; saving general settings alone does not store it.
- **Enable the Zotero MCP Plugin semantic search…**: Confirm that the cookjohn plugin is installed, semantic search is enabled, and its index contains the relevant items. The MCP Bridge for Zotero is a different plugin.
- **No supporting or critical suggestions**: The search is bounded and conservative. Try a more focused card or update the semantic index. An empty result does not prove the library has no counterevidence.
- **Provider returned HTTP ...**: Check the endpoint, model, key, provider account and network access. Zotero Canvas surfaces the HTTP status without printing the key.

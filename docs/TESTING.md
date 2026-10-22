# Testing

Run `npm ci`, `npm test`, and the browser suites in `package.json` after installing Playwright Chromium. `npm run build` creates the installable XPI and source archive. The native Zotero suite uses `test/native-notes.js` as a companion verifier in a disposable Zotero profile. It creates synthetic notes and boards there; do not install it in your daily profile. Maintainers can adapt `work/run-native.py` from the development workspace or create an equivalent isolated runner. Manual checks should cover file dialogs, the Zotero settings pane, PDF/Word previews and your target operating system.

The recorded native suite passed on Zotero 10.0.6/macOS in the maintainer's disposable profile. Browser tests cover canvas interactions but do not prove Zotero's native note editor or reader behaviour. Release candidates should be installed in a clean profile before distribution.

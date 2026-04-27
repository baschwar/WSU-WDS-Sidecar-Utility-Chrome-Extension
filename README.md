# WSU WDS Sidecar Utilities Extension

A local Chrome extension side panel for WordPress editor cleanup tasks used by WSU Web/Digital Strategy workflows.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `wp-bulk-editor-extension` folder in this repo.
5. After reloading/updating the extension, reload any open WordPress editor tabs so the content-script bridge attaches.

## Current Utilities

### Accessibility Fixes

- Fix incorrect heading order by making content headings H2.
- Replace URL-like link text with linked page titles.
- Remove open-in-new-tab behavior from rich text links.
- Unbold long all-bold paragraphs by character threshold.
- Convert short all-bold paragraphs to H2 xMedium by word threshold.
- Split a leading bold line followed by a soft return into an H2 xMedium plus a following paragraph.

### Heading Cleanup

- Make all content heading blocks H2.

### Heading Size

- Apply WSU Display Options font-size classes to all H2 blocks.
- Preserves unrelated Advanced classes.

## Notes

The extension uses a side panel plus a content-script bridge. It does not require WordPress database, SSH, WP-CLI, or a WordPress plugin install.

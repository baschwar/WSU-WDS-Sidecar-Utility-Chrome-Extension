# WSU WDS Sidecar Utilities

A Chrome side panel extension for speeding up WordPress block editor cleanup tasks used in WSU Web Design System workflows.

The extension runs in the browser while you are logged into WordPress. It does not require database access, WP-CLI, SSH, or a WordPress plugin install.

## Repository Description

Chrome side panel utilities for WSU WordPress editor cleanup, accessibility fixes, and Gutenberg heading normalization.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `wp-bulk-editor-extension` folder in this repo.
5. Open or reload a WordPress post/page editor tab.
6. Click the extension icon to open the side panel.

Important: after reloading or updating the extension, reload any open WordPress editor tabs so the content-script bridge attaches.

## Current Utilities

### Accessibility Fixes

- Fix incorrect heading order by making content headings H2.
- Replace URL-like link text with linked page titles.
- Remove open-in-new-tab behavior from rich text links.
- Set linked image alt text for images that link directly to full-size image files.
- Unbold long all-bold paragraphs by character threshold.
- Convert short all-bold paragraphs to H2 xMedium by word threshold.
- Split a leading bold line followed by a soft return into an H2 xMedium plus a following paragraph.

### List Utilities

- Re-save visible Posts/Pages rows whose Accessibility column shows No Data so WordPress can regenerate accessibility checks on save.

### Heading Cleanup

- Make all content heading blocks H2.

### Heading Size

- Apply WSU Display Options font-size classes to all H2 blocks.
- Preserves unrelated Advanced classes.

## How It Works

The side panel talks to a content-script bridge loaded on WordPress editor pages. The bridge calls Gutenberg's editor APIs from the page context, then reports results back to the side panel.

This approach keeps the workflow browser-only:

- No WordPress server changes.
- No database writes outside the normal editor save process.
- No WP-CLI dependency.
- The user still reviews and saves/updates the post in WordPress.

## Permissions

The extension requests access to WordPress editor URLs so it can attach the content-script bridge.

It also requests `http://*/*` and `https://*/*` host access so the URL-link-text fixer can fetch linked pages and read their titles. This is used to replace link text like `https://example.com/page` with the linked page title.

## Development Notes

Loadable extension source lives in:

`wp-bulk-editor-extension/`

Primary files:

- `manifest.json`: Chrome extension manifest.
- `sidepanel.html`, `sidepanel.css`, `sidepanel.js`: side panel UI.
- `content.js`: content-script bridge.
- `page-bridge.js`: page-context Gutenberg utilities.

## Version

Current extension version: `0.10.1`.

const fixHeadingOrderButton = document.querySelector("#fix-heading-order");
const fixUrlLinkTextButton = document.querySelector("#fix-url-link-text");
const fixGenericLinkTextButton = document.querySelector("#fix-generic-link-text");
const fixUrlDefenseLinksButton = document.querySelector("#fix-urldefense-links");
const fixNewTabLinksButton = document.querySelector("#fix-new-tab-links");
const fixLinkedImageAltButton = document.querySelector("#fix-linked-image-alt");
const suggestAltTextButton = document.querySelector("#suggest-alt-text");
const applyAltSuggestionsButton = document.querySelector("#apply-alt-suggestions");
const deselectAltSuggestionsButton = document.querySelector("#deselect-alt-suggestions");
const altSuggestionActionsEl = document.querySelector("#alt-suggestion-actions");
const altSuggestionsEl = document.querySelector("#alt-suggestions");
const includePageTitleAltInput = document.querySelector("#include-page-title-alt");
const fixBoldParagraphsButton = document.querySelector("#fix-bold-paragraphs");
const fixShortBoldHeadingsButton = document.querySelector("#fix-short-bold-headings");
const fixLeadingBoldLineButton = document.querySelector("#fix-leading-bold-line");
const boldMaxCharsInput = document.querySelector("#bold-max-chars");
const boldHeadingMaxWordsInput = document.querySelector("#bold-heading-max-words");
const resaveNoDataButton = document.querySelector("#resave-no-data");
const makeHeadingsH2Button = document.querySelector("#make-headings-h2");
const unboldHeadingBlocksButton = document.querySelector("#unbold-heading-blocks");
const applyButton = document.querySelector("#apply-h2");
const inspectButton = document.querySelector("#inspect-block");
const fontSizeSelect = document.querySelector("#font-size");
const feedbackEl = document.querySelector("#feedback");
const statusEl = document.querySelector("#status");
const detailsEl = document.querySelector("#details");

const SIZE_VALUES = ["Medium", "xMedium", "xxMedium", "Large", "xLarge", "xxLarge"];
let currentAltSuggestions = [];

function moveFeedbackToButton(button) {
  if (button.closest('.tooltip-heading') || button.classList.contains('tooltip-trigger')) {
    return;
  }

  const card = button.closest('.utility-card') || button.closest('.panel');

  if (!card) {
    return;
  }

  card.appendChild(feedbackEl);
  feedbackEl.hidden = false;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');

  if (!button) {
    return;
  }

  moveFeedbackToButton(button);
});

function setStatus(message) {
  statusEl.textContent = message;
}

function setDetails(value) {
  detailsEl.hidden = !value;
  detailsEl.textContent = value || "";
}

function isWordPressEditorUrl(url = "") {
  try {
    const parsed = new URL(url);

    if (!parsed.pathname.match(/\/wp-admin\/(post|post-new)\.php$/)) {
      return false;
    }

    return parsed.pathname.endsWith("/post-new.php") || parsed.searchParams.get("action") === "edit";
  } catch (_error) {
    return false;
  }
}

function isWordPressListUrl(url = "") {
  try {
    return new URL(url).pathname.endsWith("/wp-admin/edit.php");
  } catch (_error) {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for the WordPress tab to load."));
    }, 30000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") {
        return;
      }

      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function getEditorTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab?.id && isWordPressEditorUrl(activeTab.url)) {
    return activeTab;
  }

  const editorTabs = await chrome.tabs.query({
    currentWindow: true,
    url: [
      "*://*/wp-admin/post.php*",
      "*://*/wp-admin/post-new.php*",
      "*://*/*/wp-admin/post.php*",
      "*://*/*/wp-admin/post-new.php*"
    ]
  });
  const editorTab = editorTabs.find((tab) => isWordPressEditorUrl(tab.url)) || editorTabs[0];

  if (editorTab?.id) {
    return editorTab;
  }

  if (!activeTab?.id) {
    throw new Error("No WordPress editor tab found. Click the WordPress editor tab, then run this utility again.");
  }

  return activeTab;
}

async function runInTab(tab, action, payload = {}) {
  setDetails("Target tab: " + (tab.title || tab.url || "WordPress"));

  try {
    return await chrome.tabs.sendMessage(tab.id, {
      source: "WSU_WDS_SIDEPANEL",
      action,
      payload
    });
  } catch (error) {
    throw new Error("Could not reach the WSU WDS content script. Reload the WordPress tab, then try again. " + (error.message || ""));
  }
}

async function runInEditorTab(action, payload = {}) {
  return runInTab(await getEditorTab(), action, payload);
}

async function getActiveWordPressTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab?.id) {
    throw new Error("Click the WordPress tab, then run this utility again.");
  }

  return activeTab;
}


resaveNoDataButton.addEventListener("click", async () => {
  resaveNoDataButton.disabled = true;
  setStatus("Scanning visible list rows...");
  setDetails("");

  try {
    const tab = await getActiveWordPressTab();

    if (!isWordPressListUrl(tab.url)) {
      throw new Error("Open a WordPress Posts or Pages list screen first, then run this utility.");
    }

    const listUrl = tab.url;
    const scan = await runInTab(tab, "scanAccessibilityNoDataRows");
    const items = scan.items || [];

    if (!items.length) {
      setStatus("No visible No Data rows found.");
      setDetails(scan.details || "Try increasing Screen Options items per page if more rows need checking.");
      return;
    }

    const results = [];

    for (const [index, item] of items.entries()) {
      setStatus("Saving " + (index + 1) + " of " + items.length + "...");
      setDetails("Opening: " + (item.title || item.url));
      const loadPromise = waitForTabLoad(tab.id);
      await chrome.tabs.update(tab.id, { url: item.url });
      await loadPromise;
      await delay(1200);

      const response = await runInTab(tab, "saveCurrentPostForAccessibilityRefresh");
      results.push((item.title || item.url) + ": " + response.message);
      await delay(900);
    }

    setStatus("Re-saved " + items.length + " item" + (items.length === 1 ? "" : "s") + ".");
    setDetails(results.join("\n"));
    const returnLoad = waitForTabLoad(tab.id);
    await chrome.tabs.update(tab.id, { url: listUrl });
    await returnLoad;
  } catch (error) {
    setStatus(error.message || "Could not re-save No Data items.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    resaveNoDataButton.disabled = false;
  }
});

fixHeadingOrderButton.addEventListener("click", async () => {
  fixHeadingOrderButton.disabled = true;
  setStatus("Fixing heading order...");
  setDetails("");

  try {
    const response = await runInEditorTab("makeAllHeadingsH2");

    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not fix heading order.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    fixHeadingOrderButton.disabled = false;
  }
});

async function replaceLinkTextWithTitles(options) {
  const button = options.button;
  button.disabled = true;
  setStatus(options.findingMessage);
  setDetails("");

  try {
    const scan = await runInEditorTab("scanLinkTextForTitles", { mode: options.mode });

    if (!scan.candidates?.length) {
      setStatus(options.emptyMessage);
      setDetails(scan.details || "");
      return;
    }

    setStatus(`Fetching ${scan.candidates.length} page title${scan.candidates.length === 1 ? "" : "s"}...`);
    setDetails(scan.details || "");
    const titleMap = await fetchPageTitles(scan.candidates.map((candidate) => candidate.href));
    const response = await runInEditorTab("applyLinkTextTitles", {
      mode: options.mode,
      titleMap
    });

    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || options.errorMessage);
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    button.disabled = false;
  }
}

fixUrlLinkTextButton.addEventListener("click", () => {
  replaceLinkTextWithTitles({
    button: fixUrlLinkTextButton,
    mode: "url",
    findingMessage: "Finding URL link text...",
    emptyMessage: "No URL link text found.",
    errorMessage: "Could not fix URL link text."
  });
});

fixGenericLinkTextButton.addEventListener("click", () => {
  replaceLinkTextWithTitles({
    button: fixGenericLinkTextButton,
    mode: "generic",
    findingMessage: "Finding generic link text...",
    emptyMessage: "No generic link text found.",
    errorMessage: "Could not fix generic link text."
  });
});

fixUrlDefenseLinksButton.addEventListener("click", async () => {
  fixUrlDefenseLinksButton.disabled = true;
  setStatus("Unwrapping tracked links...");
  setDetails("");

  try {
    const response = await runInEditorTab("unwrapUrlDefenseLinks");

    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not unwrap tracked links.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    fixUrlDefenseLinksButton.disabled = false;
  }
});

fixNewTabLinksButton.addEventListener("click", async () => {
  fixNewTabLinksButton.disabled = true;
  setStatus("Removing open-in-new-tab links...");
  setDetails("");

  try {
    const response = await runInEditorTab("removeNewTabFromLinks");

    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not remove open-in-new-tab links.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    fixNewTabLinksButton.disabled = false;
  }
});


fixLinkedImageAltButton.addEventListener("click", async () => {
  fixLinkedImageAltButton.disabled = true;
  setStatus("Updating linked image alt text...");
  setDetails("");

  try {
    const response = await runInEditorTab("setLinkedImageAltToDestination");

    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not update linked image alt text.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    fixLinkedImageAltButton.disabled = false;
  }
});

function renderAltSuggestions(suggestions) {
  currentAltSuggestions = suggestions || [];
  altSuggestionsEl.textContent = "";
  altSuggestionsEl.hidden = !currentAltSuggestions.length;
  altSuggestionActionsEl.hidden = !currentAltSuggestions.length;

  currentAltSuggestions.forEach((suggestion, index) => {
    const item = document.createElement("div");
    item.className = "suggestion-item";

    const header = document.createElement("label");
    header.className = "suggestion-header";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.index = String(index);

    const title = document.createElement("span");
    title.textContent = suggestion.label || suggestion.filename || "Image";

    header.append(checkbox, title);

    const textarea = document.createElement("textarea");
    textarea.value = suggestion.suggestion || "";
    textarea.dataset.index = String(index);

    const meta = document.createElement("div");
    meta.className = "suggestion-meta";
    meta.textContent = [
      suggestion.currentAlt ? "Current: " + suggestion.currentAlt : "Current: empty",
      suggestion.reason || "Review before applying."
    ].join(" | ");

    item.append(header, textarea, meta);
    altSuggestionsEl.append(item);
  });
}

suggestAltTextButton.addEventListener("click", async () => {
  suggestAltTextButton.disabled = true;
  altSuggestionActionsEl.hidden = true;
  altSuggestionsEl.hidden = true;
  altSuggestionsEl.textContent = "";
  setStatus("Scanning images for alt suggestions...");
  setDetails("");

  try {
    const response = await runInEditorTab("suggestImageAltText", {
      includePageTitle: includePageTitleAltInput.checked
    });
    const suggestions = response.suggestions || [];

    renderAltSuggestions(suggestions);
    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not suggest image alt text.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    suggestAltTextButton.disabled = false;
  }
});

deselectAltSuggestionsButton.addEventListener("click", () => {
  altSuggestionsEl.querySelectorAll('.suggestion-header input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = false;
  });
});

applyAltSuggestionsButton.addEventListener("click", async () => {
  applyAltSuggestionsButton.disabled = true;
  setStatus("Applying checked alt suggestions...");
  setDetails("");

  try {
    const checkedCheckboxes = [];
    const updates = Array.from(altSuggestionsEl.querySelectorAll(".suggestion-item")).map((item) => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const textarea = item.querySelector("textarea");
      const suggestion = currentAltSuggestions[Number.parseInt(textarea.dataset.index, 10)];

      if (!checkbox.checked || !textarea.value.trim()) {
        return null;
      }

      checkedCheckboxes.push(checkbox);
      return { target: suggestion.target, alt: textarea.value.trim() };
    }).filter(Boolean);

    if (!updates.length) {
      setStatus("No checked alt suggestions to apply.");
      return;
    }

    const response = await runInEditorTab("applyImageAltTextSuggestions", { updates });

    checkedCheckboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not apply image alt text suggestions.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    applyAltSuggestionsButton.disabled = false;
  }
});

fixBoldParagraphsButton.addEventListener("click", async () => {
  fixBoldParagraphsButton.disabled = true;
  setStatus("Finding long all-bold paragraphs...");
  setDetails("");

  try {
    const maxChars = Number.parseInt(boldMaxCharsInput.value, 10) || 120;
    const response = await runInEditorTab("unboldLongAllBoldParagraphs", { minChars: maxChars });

    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not fix long bold-only paragraphs.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    fixBoldParagraphsButton.disabled = false;
  }
});

async function fetchPageTitles(urls) {
  const uniqueUrls = Array.from(new Set(urls));
  const entries = [];

  for (const [index, url] of uniqueUrls.entries()) {
    setStatus(`Fetching page title ${index + 1} of ${uniqueUrls.length}...`);
    entries.push([url, await fetchPageTitle(url)]);
  }

  return Object.fromEntries(entries);
}

async function fetchPageTitle(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return titleFromUrl(url);
    }

    const html = await response.text();
    const title = extractTitle(html) || titleFromUrl(url);

    return decodeHtmlEntities(title).trim() || titleFromUrl(url);
  } catch (_error) {
    return titleFromUrl(url);
  } finally {
    clearTimeout(timeout);
  }
}

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (titleMatch?.[1]) {
    return titleMatch[1].replace(/\s+/g, " ");
  }

  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i);

  return ogTitleMatch?.[1] || "";
}

function decodeHtmlEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function titleFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (_error) {
    return url;
  }
}

fixShortBoldHeadingsButton.addEventListener("click", async () => {
  fixShortBoldHeadingsButton.disabled = true;
  setStatus("Converting short bold paragraphs...");
  setDetails("");

  try {
    const maxWords = Number.parseInt(boldHeadingMaxWordsInput.value, 10) || 4;
    const response = await runInEditorTab("convertShortAllBoldParagraphsToH2", {
      maxWords,
      fontSize: "xMedium"
    });

    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not convert short bold paragraphs.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    fixShortBoldHeadingsButton.disabled = false;
  }
});

fixLeadingBoldLineButton.addEventListener("click", async () => {
  fixLeadingBoldLineButton.disabled = true;
  setStatus("Splitting leading bold lines...");
  setDetails("");

  try {
    const maxWords = Number.parseInt(boldHeadingMaxWordsInput.value, 10) || 4;
    const response = await runInEditorTab("splitLeadingBoldLineToH2", {
      maxWords,
      fontSize: "xMedium"
    });

    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not split leading bold lines.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    fixLeadingBoldLineButton.disabled = false;
  }
});

makeHeadingsH2Button.addEventListener("click", async () => {
  makeHeadingsH2Button.disabled = true;
  setStatus("Converting headings...");
  setDetails("");

  try {
    const response = await runInEditorTab("makeAllHeadingsH2");

    setStatus(response.message);
    if (response.details) {
      setDetails(response.details);
    }
  } catch (error) {
    setStatus(error.message || "Could not update headings.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    makeHeadingsH2Button.disabled = false;
  }
});


unboldHeadingBlocksButton.addEventListener("click", async () => {
  unboldHeadingBlocksButton.disabled = true;
  setStatus("Removing bold markup from headings...");
  setDetails("");

  try {
    const response = await runInEditorTab("unboldHeadingBlocks");

    setStatus(response.message);
    setDetails(response.details || "");
  } catch (error) {
    setStatus(error.message || "Could not unbold headings.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    unboldHeadingBlocksButton.disabled = false;
  }
});

applyButton.addEventListener("click", async () => {
  applyButton.disabled = true;
  setStatus("Applying...");
  setDetails("");

  try {
    const response = await runInEditorTab("applyH2FontSize", { fontSize: fontSizeSelect.value });

    setStatus(response.message);
    if (response.details) {
      setDetails(response.details);
    }
  } catch (error) {
    setStatus(error.message || "Could not reach the WordPress editor.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    applyButton.disabled = false;
  }
});

inspectButton.addEventListener("click", async () => {
  inspectButton.disabled = true;
  setStatus("Inspecting selected block...");
  setDetails("");

  try {
    const response = await runInEditorTab("inspectSelectedBlock");

    setStatus(response.message);
    setDetails(response.details);
  } catch (error) {
    setStatus(error.message || "Could not inspect the selected block.");
    setDetails(String(error?.stack || error?.message || error));
  } finally {
    inspectButton.disabled = false;
  }
});

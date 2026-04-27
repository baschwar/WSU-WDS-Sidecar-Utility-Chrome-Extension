const applyButton = document.querySelector("#apply-h2");
const inspectButton = document.querySelector("#inspect-block");
const fontSizeSelect = document.querySelector("#font-size");
const statusEl = document.querySelector("#status");
const detailsEl = document.querySelector("#details");

const SIZE_VALUES = ["Medium", "xMedium", "xxMedium", "Large", "xLarge", "xxLarge"];
const WSU_FONT_SIZE_CLASS = /(?:^|\s)wsu-font-size--[^\s]+/g;

function setStatus(message) {
  statusEl.textContent = message;
}

function setDetails(value) {
  detailsEl.hidden = !value;
  detailsEl.textContent = value || "";
}

async function runInActiveTab(func, args = []) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func,
    args
  });

  return result || { ok: false, message: "The WordPress page script did not return a result." };
}

applyButton.addEventListener("click", async () => {
  applyButton.disabled = true;
  setStatus("Applying...");
  setDetails("");

  try {
    const response = await runInActiveTab(applyH2FontSizeInPage, [
      fontSizeSelect.value,
      SIZE_VALUES
    ]);

    setStatus(response.message);
    if (response.details) {
      setDetails(response.details);
    }
  } catch (error) {
    setStatus(error.message || "Could not reach the WordPress editor.");
  } finally {
    applyButton.disabled = false;
  }
});

inspectButton.addEventListener("click", async () => {
  inspectButton.disabled = true;
  setStatus("Inspecting selected block...");
  setDetails("");

  try {
    const response = await runInActiveTab(inspectSelectedBlockInPage, [SIZE_VALUES]);

    setStatus(response.message);
    setDetails(response.details);
  } catch (error) {
    setStatus(error.message || "Could not inspect the selected block.");
  } finally {
    inspectButton.disabled = false;
  }
});

function applyH2FontSizeInPage(fontSize, sizeValues) {
  const wsuFontSizeClass = /(?:^|\s)wsu-font-size--[^\s]+/g;

  function getBlocks(select) {
    const blockEditor = select("core/block-editor");
    return blockEditor?.getBlocks?.() || [];
  }

  function collectBlocks(blocks, predicate, matches = []) {
    blocks.forEach((block) => {
      if (predicate(block)) {
        matches.push(block);
      }

      if (block.innerBlocks?.length) {
        collectBlocks(block.innerBlocks, predicate, matches);
      }
    });

    return matches;
  }

  function toClassSuffix(value) {
    return value ? value.toLowerCase() : "";
  }

  function updateClassName(className, value) {
    const withoutFontSize = (className || "").replace(wsuFontSizeClass, " ").trim();
    const nextFontSizeClass = value ? `wsu-font-size--${toClassSuffix(value)}` : "";

    return [withoutFontSize, nextFontSizeClass].filter(Boolean).join(" ");
  }

  if (!window.wp?.data) {
    return {
      ok: false,
      message: "Open this on a WordPress block editor page first."
    };
  }

  const blocks = getBlocks(window.wp.data.select);
  const h2Blocks = collectBlocks(
    blocks,
    (block) => block.name === "core/heading" && block.attributes?.level === 2
  );

  h2Blocks.forEach((block) => {
    window.wp.data.dispatch("core/block-editor").updateBlockAttributes(block.clientId, {
      className: updateClassName(block.attributes?.className, fontSize)
    });
  });

  return {
    ok: true,
    message: `Updated ${h2Blocks.length} H2 block${h2Blocks.length === 1 ? "" : "s"}.`,
    details: fontSize
      ? `Updated Advanced class: wsu-font-size--${toClassSuffix(fontSize)}`
      : "Removed WSU font-size class from H2 blocks."
  };
}
function inspectSelectedBlockInPage(sizeValues) {
  const wsuFontSizeClass = /(?:^|\s)wsu-font-size--[^\s]+/g;

  function findSizePaths(value, path = [], paths = []) {
    if (sizeValues.includes(value)) {
      paths.push(path);
      return paths;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return paths;
    }

    Object.entries(value).forEach(([key, child]) => {
      findSizePaths(child, [...path, key], paths);
    });

    return paths;
  }

  if (!window.wp?.data) {
    return {
      ok: false,
      message: "Open this on a WordPress block editor page first.",
      details: ""
    };
  }

  const block = window.wp.data.select("core/block-editor")?.getSelectedBlock?.();

  if (!block) {
    return {
      ok: false,
      message: "Select one heading block first.",
      details: ""
    };
  }

  return {
    ok: true,
    message: `Selected block: ${block.name}`,
    details: JSON.stringify(
      {
        name: block.name,
        clientId: block.clientId,
        fontSizeClasses: (block.attributes?.className || "").match(wsuFontSizeClass) || [],
        className: block.attributes?.className || "",
        sizePaths: findSizePaths(block.attributes || {}).map((path) => path.join(".")),
        attributes: block.attributes
      },
      null,
      2
    )
  };
}

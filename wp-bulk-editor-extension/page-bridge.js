(() => {
  if (window.__WSU_WDS_PAGE_BRIDGE__) {
    return;
  }

  window.__WSU_WDS_PAGE_BRIDGE__ = true;

  function getEditorBlocks() {
    const blockEditor = window.wp?.data?.select('core/block-editor');
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

  function makeAllHeadingsH2() {
    if (!window.wp?.data) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.' };
    }

    const headingBlocks = collectBlocks(getEditorBlocks(), (block) => block.name === 'core/heading');
    const changedBlocks = headingBlocks.filter((block) => block.attributes?.level !== 2);

    changedBlocks.forEach((block) => {
      window.wp.data.dispatch('core/block-editor').updateBlockAttributes(block.clientId, { level: 2 });
    });

    return {
      ok: true,
      message: `Changed ${changedBlocks.length} heading block${changedBlocks.length === 1 ? '' : 's'} to H2.`,
      details: `Found ${headingBlocks.length} heading block${headingBlocks.length === 1 ? '' : 's'} in post content. Post title was not touched.`
    };
  }

  function applyH2FontSize(payload) {
    const fontSize = payload?.fontSize || '';
    const wsuFontSizeClass = /(?:^|\s)wsu-font-size--[^\s]+/g;

    function toClassSuffix(value) {
      return value ? value.toLowerCase() : '';
    }

    function updateClassName(className, value) {
      const withoutFontSize = (className || '').replace(wsuFontSizeClass, ' ').trim();
      const nextFontSizeClass = value ? `wsu-font-size--${toClassSuffix(value)}` : '';
      return [withoutFontSize, nextFontSizeClass].filter(Boolean).join(' ');
    }

    if (!window.wp?.data) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.' };
    }

    const h2Blocks = collectBlocks(
      getEditorBlocks(),
      (block) => block.name === 'core/heading' && block.attributes?.level === 2
    );

    h2Blocks.forEach((block) => {
      window.wp.data.dispatch('core/block-editor').updateBlockAttributes(block.clientId, {
        className: updateClassName(block.attributes?.className, fontSize)
      });
    });

    return {
      ok: true,
      message: `Updated ${h2Blocks.length} H2 block${h2Blocks.length === 1 ? '' : 's'}.`,
      details: fontSize
        ? `Updated Advanced class: wsu-font-size--${toClassSuffix(fontSize)}`
        : 'Removed WSU font-size class from H2 blocks.'
    };
  }

  function inspectSelectedBlock() {
    const wsuFontSizeClass = /(?:^|\s)wsu-font-size--[^\s]+/g;

    if (!window.wp?.data) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.', details: '' };
    }

    const block = window.wp.data.select('core/block-editor')?.getSelectedBlock?.();

    if (!block) {
      return { ok: false, message: 'Select one heading block first.', details: '' };
    }

    return {
      ok: true,
      message: `Selected block: ${block.name}`,
      details: JSON.stringify({
        name: block.name,
        clientId: block.clientId,
        fontSizeClasses: (block.attributes?.className || '').match(wsuFontSizeClass) || [],
        className: block.attributes?.className || '',
        attributes: block.attributes
      }, null, 2)
    };
  }

  function walkRichTextStrings(block, visitor) {
    const attributes = block.attributes || {};
    ['content', 'value', 'citation', 'text', 'html'].forEach((key) => {
      if (typeof attributes[key] === 'string' && attributes[key].includes('<a')) {
        visitor(key, attributes[key]);
      }
    });
  }

  function normalizeHref(href) {
    try {
      return new URL(href, window.location.href).href;
    } catch (_error) {
      return '';
    }
  }

  function linkNeedsTitle(text, href) {
    const cleanText = (text || '').replace(/\s+/g, ' ').trim();

    if (/^https?:\/\//i.test(cleanText)) {
      return true;
    }

    if (!href) {
      return false;
    }

    try {
      const parsed = new URL(href);
      const withoutProtocol = cleanText.replace(/^www\./i, '');
      const urlishText = [parsed.hostname, parsed.pathname, parsed.search]
        .join('')
        .replace(/^www\./i, '');

      return cleanText.length > 35 && urlishText.includes(withoutProtocol.slice(0, 20));
    } catch (_error) {
      return false;
    }
  }

  function getLinkCandidates(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    return Array.from(template.content.querySelectorAll('a[href]'))
      .map((anchor) => ({
        href: normalizeHref(anchor.getAttribute('href')),
        text: anchor.textContent || ''
      }))
      .filter((link) => link.href && linkNeedsTitle(link.text, link.href));
  }

  function scanUrlLinkText() {
    if (!window.wp?.data) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.', candidates: [] };
    }

    const candidates = [];
    const blocks = collectBlocks(getEditorBlocks(), () => true);

    blocks.forEach((block) => {
      walkRichTextStrings(block, (attribute, value) => {
        getLinkCandidates(value).forEach((link) => {
          candidates.push({
            clientId: block.clientId,
            blockName: block.name,
            attribute,
            href: link.href,
            text: link.text
          });
        });
      });
    });

    return {
      ok: true,
      message: `Found ${candidates.length} URL-like link text item${candidates.length === 1 ? '' : 's'}.`,
      candidates,
      details: candidates.map((candidate) => `${candidate.text} -> ${candidate.href}`).join('\n')
    };
  }

  function replaceLinksInHtml(html, titleMap) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const changes = [];

    Array.from(template.content.querySelectorAll('a[href]')).forEach((anchor) => {
      const href = normalizeHref(anchor.getAttribute('href'));
      const title = href ? titleMap[href] : '';
      const oldText = anchor.textContent || '';

      if (!title || !linkNeedsTitle(oldText, href)) {
        return;
      }

      anchor.textContent = title;
      changes.push(`${oldText} -> ${title}`);
    });

    return {
      html: template.innerHTML,
      changes
    };
  }

  function applyUrlLinkTextTitles(payload) {
    if (!window.wp?.data) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.' };
    }

    const titleMap = payload?.titleMap || {};
    const blocks = collectBlocks(getEditorBlocks(), () => true);
    const changes = [];
    let changedBlocks = 0;

    blocks.forEach((block) => {
      const updates = {};

      walkRichTextStrings(block, (attribute, value) => {
        const result = replaceLinksInHtml(value, titleMap);

        if (result.changes.length) {
          updates[attribute] = result.html;
          changes.push(...result.changes);
        }
      });

      if (Object.keys(updates).length) {
        window.wp.data.dispatch('core/block-editor').updateBlockAttributes(block.clientId, updates);
        changedBlocks += 1;
      }
    });

    return {
      ok: true,
      message: `Updated ${changes.length} link text item${changes.length === 1 ? '' : 's'}.`,
      details: changes.length ? changes.join('\n') : `Changed ${changedBlocks} block${changedBlocks === 1 ? '' : 's'}.`
    };
  }

  function getTextContentFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isEntireHtmlBold(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    let hasText = false;
    let node = walker.nextNode();

    while (node) {
      if (node.textContent.trim()) {
        hasText = true;

        if (!hasBoldAncestor(node, template.content)) {
          return false;
        }
      }

      node = walker.nextNode();
    }

    return hasText;
  }

  function hasBoldAncestor(textNode, root) {
    let node = textNode.parentElement;

    while (node && node !== root) {
      const tagName = node.tagName?.toLowerCase();

      if (tagName === 'strong' || tagName === 'b') {
        return true;
      }

      node = node.parentElement;
    }

    return false;
  }

  function unwrapBoldRootElements(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    Array.from(template.content.querySelectorAll('strong, b')).forEach((element) => {
      element.replaceWith(...Array.from(element.childNodes));
    });

    return template.innerHTML;
  }

  function unboldLongAllBoldParagraphs(payload) {
    if (!window.wp?.data) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.' };
    }

    const minChars = Number.parseInt(payload?.minChars, 10) || 120;
    const paragraphBlocks = collectBlocks(getEditorBlocks(), (block) => block.name === 'core/paragraph');
    const changes = [];
    const skippedShort = [];

    paragraphBlocks.forEach((block) => {
      const content = block.attributes?.content;

      if (typeof content !== 'string' || !content.trim()) {
        return;
      }

      const text = getTextContentFromHtml(content);

      if (!text || !isEntireHtmlBold(content)) {
        return;
      }

      if (text.length <= minChars) {
        skippedShort.push(text);
        return;
      }

      window.wp.data.dispatch('core/block-editor').updateBlockAttributes(block.clientId, {
        content: unwrapBoldRootElements(content)
      });
      changes.push(text);
    });

    return {
      ok: true,
      message: `Unbolded ${changes.length} paragraph${changes.length === 1 ? '' : 's'}.`,
      details: changes.length
        ? changes.map((text) => `"${text}"`).join('\n')
        : skippedShort.length
          ? `Found ${skippedShort.length} all-bold paragraph${skippedShort.length === 1 ? '' : 's'} at or below ${minChars} characters. Lower the cutoff to include them.`
          : `No all-bold paragraph blocks found over ${minChars} characters.`
    };
  }

  function removeNewTabAttributesFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const changes = [];

    Array.from(template.content.querySelectorAll('a[target]')).forEach((anchor) => {
      if ((anchor.getAttribute('target') || '').toLowerCase() !== '_blank') {
        return;
      }

      const label = (anchor.textContent || anchor.getAttribute('href') || '').replace(/\s+/g, ' ').trim();
      anchor.removeAttribute('target');

      const relTokens = (anchor.getAttribute('rel') || '')
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => !['noopener', 'noreferrer'].includes(token.toLowerCase()));

      if (relTokens.length) {
        anchor.setAttribute('rel', relTokens.join(' '));
      } else {
        anchor.removeAttribute('rel');
      }

      changes.push(label || anchor.href || 'Link');
    });

    return {
      html: template.innerHTML,
      changes
    };
  }

  function removeNewTabFromLinks() {
    if (!window.wp?.data) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.' };
    }

    const blocks = collectBlocks(getEditorBlocks(), () => true);
    const changes = [];
    let changedBlocks = 0;

    blocks.forEach((block) => {
      const updates = {};

      walkRichTextStrings(block, (attribute, value) => {
        const result = removeNewTabAttributesFromHtml(value);

        if (result.changes.length) {
          updates[attribute] = result.html;
          changes.push(...result.changes);
        }
      });

      if (Object.keys(updates).length) {
        window.wp.data.dispatch('core/block-editor').updateBlockAttributes(block.clientId, updates);
        changedBlocks += 1;
      }
    });

    return {
      ok: true,
      message: `Updated ${changes.length} link${changes.length === 1 ? '' : 's'}.`,
      details: changes.length
        ? changes.map((label) => `Removed new-tab behavior: ${label}`).join('\n')
        : 'No rich-text links set to open in a new tab were found.'
    };
  }

  function getWordCount(text) {
    return (text.match(/\b[\w’'-]+\b/g) || []).length;
  }

  function convertShortAllBoldParagraphsToH2(payload) {
    if (!window.wp?.data || !window.wp?.blocks) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.' };
    }

    const maxWords = Number.parseInt(payload?.maxWords, 10) || 4;
    const fontSize = payload?.fontSize || 'xMedium';
    const fontSizeClass = fontSize ? `wsu-font-size--${fontSize.toLowerCase()}` : '';
    const paragraphBlocks = collectBlocks(getEditorBlocks(), (block) => block.name === 'core/paragraph');
    const changes = [];
    const skippedLong = [];

    paragraphBlocks.forEach((block) => {
      const content = block.attributes?.content;

      if (typeof content !== 'string' || !content.trim()) {
        return;
      }

      const text = getTextContentFromHtml(content);

      if (!text || !isEntireHtmlBold(content)) {
        return;
      }

      const wordCount = getWordCount(text);

      if (wordCount > maxWords) {
        skippedLong.push(`${text} (${wordCount} words)`);
        return;
      }

      const headingBlock = window.wp.blocks.createBlock('core/heading', {
        content: unwrapBoldRootElements(content),
        level: 2,
        className: fontSizeClass
      });

      window.wp.data.dispatch('core/block-editor').replaceBlock(block.clientId, headingBlock);
      changes.push(text);
    });

    return {
      ok: true,
      message: `Converted ${changes.length} paragraph${changes.length === 1 ? '' : 's'} to H2.`,
      details: changes.length
        ? changes.map((text) => `"${text}" -> H2 ${fontSize}`).join('\n')
        : skippedLong.length
          ? `Found ${skippedLong.length} all-bold paragraph${skippedLong.length === 1 ? '' : 's'} over ${maxWords} words. Raise the word limit to include them.`
          : `No all-bold paragraph blocks found at or below ${maxWords} words.`
    };
  }

  function getLeadingBoldLineSplit(content) {
    const template = document.createElement('template');
    template.innerHTML = content;
    const nodes = Array.from(template.content.childNodes);
    const firstMeaningfulIndex = nodes.findIndex((node) => {
      return node.nodeType !== Node.TEXT_NODE || node.textContent.trim();
    });

    if (firstMeaningfulIndex === -1) {
      return null;
    }

    const firstNode = nodes[firstMeaningfulIndex];

    if (firstNode.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const tagName = firstNode.tagName.toLowerCase();

    if (tagName !== 'strong' && tagName !== 'b') {
      return null;
    }

    const childNodes = Array.from(firstNode.childNodes);
    const brInsideIndex = childNodes.findIndex((node) => {
      return node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'br';
    });

    if (brInsideIndex !== -1) {
      const headingTemplate = document.createElement('template');
      childNodes.slice(0, brInsideIndex).forEach((node) => headingTemplate.content.appendChild(node.cloneNode(true)));
      const headingContent = headingTemplate.innerHTML.trim();
      const headingText = getTextContentFromHtml(headingContent);

      if (!headingText) {
        return null;
      }

      const remainingTemplate = document.createElement('template');
      childNodes.slice(brInsideIndex + 1).forEach((node) => remainingTemplate.content.appendChild(node.cloneNode(true)));
      nodes.slice(firstMeaningfulIndex + 1).forEach((node) => remainingTemplate.content.appendChild(node.cloneNode(true)));
      const remainingContent = remainingTemplate.innerHTML.trim();

      if (!getTextContentFromHtml(remainingContent)) {
        return null;
      }

      return {
        headingContent,
        headingText,
        remainingContent
      };
    }

    const nextNode = nodes[firstMeaningfulIndex + 1];

    if (!nextNode || nextNode.nodeType !== Node.ELEMENT_NODE || nextNode.tagName.toLowerCase() !== 'br') {
      return null;
    }

    const headingText = (firstNode.textContent || '').replace(/\s+/g, ' ').trim();

    if (!headingText) {
      return null;
    }

    const remainingNodes = nodes.slice(firstMeaningfulIndex + 2);
    const remainingTemplate = document.createElement('template');
    remainingNodes.forEach((node) => remainingTemplate.content.appendChild(node.cloneNode(true)));
    const remainingContent = remainingTemplate.innerHTML.trim();

    if (!getTextContentFromHtml(remainingContent)) {
      return null;
    }

    return {
      headingContent: firstNode.innerHTML,
      headingText,
      remainingContent
    };
  }

  function splitLeadingBoldLineToH2(payload) {
    if (!window.wp?.data || !window.wp?.blocks) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.' };
    }

    const maxWords = Number.parseInt(payload?.maxWords, 10) || 4;
    const fontSize = payload?.fontSize || 'xMedium';
    const fontSizeClass = fontSize ? 'wsu-font-size--' + fontSize.toLowerCase() : '';
    const paragraphBlocks = collectBlocks(getEditorBlocks(), (block) => block.name === 'core/paragraph');
    const changes = [];
    const skippedLong = [];

    paragraphBlocks.forEach((block) => {
      const content = block.attributes?.content;

      if (typeof content !== 'string' || !content.trim()) {
        return;
      }

      const split = getLeadingBoldLineSplit(content);

      if (!split) {
        return;
      }

      const wordCount = getWordCount(split.headingText);

      if (wordCount > maxWords) {
        skippedLong.push(split.headingText + ' (' + wordCount + ' words)');
        return;
      }

      const headingBlock = window.wp.blocks.createBlock('core/heading', {
        content: split.headingContent,
        level: 2,
        className: fontSizeClass
      });
      const paragraphBlock = window.wp.blocks.createBlock('core/paragraph', {
        content: split.remainingContent
      });

      window.wp.data.dispatch('core/block-editor').replaceBlocks(block.clientId, [headingBlock, paragraphBlock]);
      changes.push(split.headingText);
    });

    return {
      ok: true,
      message: 'Split ' + changes.length + ' paragraph' + (changes.length === 1 ? '' : 's') + '.',
      details: changes.length
        ? changes.map((text) => '"' + text + '" -> H2 ' + fontSize).join('\n')
        : skippedLong.length
          ? 'Found ' + skippedLong.length + ' leading bold line' + (skippedLong.length === 1 ? '' : 's') + ' over ' + maxWords + ' words. Raise the word limit to include them.'
          : 'No paragraph blocks found with a leading bold line, soft return, and following text.'
    };
  }

  function getAccessibilityColumnIndex() {
    const headers = Array.from(document.querySelectorAll('.wp-list-table thead th, .wp-list-table thead td'));
    const index = headers.findIndex((header) => {
      return (header.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase().includes('accessibility');
    });

    return index === -1 ? null : index;
  }

  function scanAccessibilityNoDataRows() {
    const table = document.querySelector('.wp-list-table');

    if (!table) {
      return { ok: false, message: 'Open this on a WordPress Posts or Pages list screen first.', items: [] };
    }

    const columnIndex = getAccessibilityColumnIndex();

    if (columnIndex === null) {
      return { ok: false, message: 'Could not find an Accessibility column on this list screen.', items: [] };
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const items = rows.map((row) => {
      const cells = Array.from(row.children);
      const accessibilityCell = cells[columnIndex];
      const accessibilityText = (accessibilityCell?.textContent || '').replace(/\s+/g, ' ').trim();

      if (!/\bno data\b/i.test(accessibilityText)) {
        return null;
      }

      const editLink = row.querySelector('a.row-title[href*="post.php"], .row-actions .edit a[href*="post.php"], a[href*="post.php"][href*="action=edit"]');

      if (!editLink?.href) {
        return null;
      }

      return {
        title: (editLink.textContent || '').replace(/\s+/g, ' ').trim(),
        url: editLink.href
      };
    }).filter(Boolean);

    return {
      ok: true,
      message: 'Found ' + items.length + ' visible No Data item' + (items.length === 1 ? '' : 's') + '.',
      items,
      details: items.length
        ? items.map((item) => item.title || item.url).join('\n')
        : 'No visible rows in the Accessibility column contained No Data.'
    };
  }

  function waitForEditorSaveToFinish() {
    return new Promise((resolve) => {
      const editorSelect = window.wp?.data?.select('core/editor');
      let sawSaving = false;
      const startedAt = Date.now();
      const unsubscribe = window.wp.data.subscribe(() => {
        const isSaving = Boolean(editorSelect?.isSavingPost?.());
        const isAutosaving = Boolean(editorSelect?.isAutosavingPost?.());

        if (isSaving || isAutosaving) {
          sawSaving = true;
          return;
        }

        if (sawSaving || Date.now() - startedAt > 12000) {
          unsubscribe();
          resolve();
        }
      });

      setTimeout(() => {
        unsubscribe();
        resolve();
      }, 20000);
    });
  }

  async function saveCurrentPostForAccessibilityRefresh() {
    if (!window.wp?.data) {
      return { ok: false, message: 'Open this on a WordPress block editor page first.' };
    }

    const editorDispatch = window.wp.data.dispatch('core/editor');
    const editorSelect = window.wp.data.select('core/editor');
    const title = editorSelect?.getEditedPostAttribute?.('title') || document.title || 'Post';

    if (!editorDispatch?.savePost) {
      const updateButton = document.querySelector('.editor-post-publish-button, .editor-post-save-draft, button[aria-label="Save"]');

      if (!updateButton) {
        return { ok: false, message: 'Could not find a WordPress save/update control.' };
      }

      updateButton.click();
      return { ok: true, message: 'Clicked save/update for ' + title + '.' };
    }

    const saveResult = editorDispatch.savePost();

    if (saveResult?.then) {
      await saveResult;
    } else {
      await waitForEditorSaveToFinish();
    }

    return { ok: true, message: 'Saved ' + title + '.' };
  }

  const actions = {
    makeAllHeadingsH2,
    applyH2FontSize,
    inspectSelectedBlock,
    scanUrlLinkText,
    applyUrlLinkTextTitles,
    unboldLongAllBoldParagraphs,
    removeNewTabFromLinks,
    convertShortAllBoldParagraphsToH2,
    splitLeadingBoldLineToH2,
    scanAccessibilityNoDataRows,
    saveCurrentPostForAccessibilityRefresh
  };

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== 'WSU_WDS_CONTENT') {
      return;
    }

    const action = actions[event.data.action];
    let response;

    try {
      response = action
        ? await action(event.data.payload || {})
        : { ok: false, message: `Unknown action: ${event.data.action}` };
    } catch (error) {
      response = { ok: false, message: error.message || 'Page bridge action failed.', details: String(error?.stack || error) };
    }

    window.postMessage({
      source: 'WSU_WDS_PAGE',
      id: event.data.id,
      response
    }, '*');
  });
})();

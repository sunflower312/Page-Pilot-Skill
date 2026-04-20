export function collectStructuredPageDataRuntime(payload, fixtureData) {
  if (fixtureData) {
    return fixtureData;
  }

  const { settings } = payload;
  const instantiateInteractivePriorityRuntime = Function(`return (${payload.interactiveRuntimeInstantiatorSource})`)();
  const {
    compactText: compactTextInner,
    compareInteractivePriority: compareInteractivePriorityInner,
    finalizeInteractiveEntry,
  } = instantiateInteractivePriorityRuntime(payload);
  const interactiveInputTypes = new Set(['text', 'email', 'search', 'url', 'tel', 'password', 'number', '']);
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const getLabel = (element) => {
    const readLabelText = (node) => compactTextInner(node?.innerText || node?.textContent || '');
    const readLabeledByText = (ids) =>
      compactTextInner(
        String(ids || '')
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => readLabelText(document.getElementById(id)))
          .filter(Boolean)
          .join(' ')
      );
    const readTableRowLabel = (control) => {
      const row = control.closest?.('tr');
      if (!row) {
        return '';
      }

      const cells = Array.from(row.children).filter((cell) => /^(td|th)$/i.test(cell.tagName));
      const ownerCell = control.closest?.('td,th');
      const ownerIndex = ownerCell ? cells.indexOf(ownerCell) : -1;
      if (ownerIndex <= 0) {
        return '';
      }

      for (let index = ownerIndex - 1; index >= 0; index -= 1) {
        const text = readLabelText(cells[index]);
        if (text) {
          return text;
        }
      }

      return '';
    };
    const readNearbyLabel = (control) => {
      const siblings = [control.previousElementSibling].filter(Boolean);
      for (const sibling of siblings) {
        const text = readLabelText(sibling);
        if (text) {
          return text;
        }
      }
      return '';
    };

    if (element.labels?.length) {
      return readLabelText(element.labels[0]);
    }
    if (element.id) {
      const explicit = readLabelText(document.querySelector(`label[for="${element.id}"]`));
      if (explicit) {
        return explicit;
      }
    }
    const wrapped = readLabelText(element.closest?.('label'));
    if (wrapped) {
      return wrapped;
    }
    const labelledBy = readLabeledByText(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      return labelledBy;
    }
    const tableRowLabel = readTableRowLabel(element);
    if (tableRowLabel) {
      return tableRowLabel;
    }
    return readNearbyLabel(element);
  };
  const getElementText = (element) =>
    compactTextInner(
      element.innerText ||
        element.textContent ||
        (element.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes((element.getAttribute('type') || '').toLowerCase())
          ? element.value
          : '') ||
        ''
    );
  const getName = (element) =>
    compactTextInner(
      element.getAttribute('aria-label') ||
        getElementText(element) ||
        getLabel(element) ||
        element.getAttribute('placeholder') ||
        ''
    );
  const getDescription = (element) => {
    const describedBy = compactTextInner(element.getAttribute('aria-describedby') || '');
    const describedByText = describedBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => compactTextInner(document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || ''))
      .filter(Boolean)
      .join(' ');

    return compactTextInner(element.getAttribute('aria-description') || describedByText || element.getAttribute('title') || '');
  };
  const getGeometry = (element) => {
    const rect = element.getBoundingClientRect();
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
      return null;
    }
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewportVisibleRatio: Number(
        Math.max(
          0,
          Math.min(1, (Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)) / Math.max(rect.height, 1))
        ).toFixed(2)
      ),
    };
  };
  const escapeCssIdentifier = (value) => {
    const source = String(value ?? '');
    if (globalThis.CSS?.escape) {
      return globalThis.CSS.escape(source);
    }
    return source.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, (match, digit) => (digit ? `\\3${digit} ` : `\\${match}`));
  };
  const escapeCssAttributeValue = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const getCss = (element) => {
    if (element.id) {
      return `#${escapeCssIdentifier(element.id)}`;
    }
    if (element.getAttribute('data-testid')) {
      return `${element.tagName.toLowerCase()}[data-testid="${escapeCssAttributeValue(element.getAttribute('data-testid'))}"]`;
    }
    if (element.getAttribute('name')) {
      return `${element.tagName.toLowerCase()}[name="${escapeCssAttributeValue(element.getAttribute('name'))}"]`;
    }
    return element.tagName.toLowerCase();
  };
  const pushIfRoom = (entries, limit, entry) => {
    if (entries.length >= limit) {
      return false;
    }
    entries.push(entry);
    return true;
  };
  const hasClosestMatch = (element, owner, selector) =>
    Boolean(element.closest?.(selector)) || Boolean(owner !== element && owner?.closest?.(selector));
  const getClosestContextElement = (element, owner, selector) => owner?.closest?.(selector) || element.closest?.(selector) || null;
  const getContextFlags = (element, owner = element) => ({
    withinMain: hasClosestMatch(element, owner, 'main,[role="main"]'),
    withinForm: hasClosestMatch(element, owner, 'form'),
    withinDialog: hasClosestMatch(element, owner, 'dialog,[role="dialog"]'),
    withinHeader: hasClosestMatch(element, owner, 'header,[role="banner"]'),
    withinFooter: hasClosestMatch(element, owner, 'footer,[role="contentinfo"]'),
    withinNav: hasClosestMatch(element, owner, 'nav,[role="navigation"]'),
    withinAside: hasClosestMatch(element, owner, 'aside,[role="complementary"]'),
  });
  const getHeadingContext = (element, owner = element) => {
    const scope =
      getClosestContextElement(element, owner, 'section,article,form,dialog,[role="dialog"],main,[role="main"]') ?? document.body;
    const heading = scope?.querySelector?.('h1,h2,h3,h4,h5,h6,[role="heading"]');
    if (!heading) {
      return null;
    }
    return {
      text: compactTextInner(heading.innerText || heading.textContent || ''),
      level: /^h[1-6]$/i.test(heading.tagName) ? Number(heading.tagName.slice(1)) : null,
      css: getCss(heading),
    };
  };
  const buildContextSummary = (contextElement) => {
    if (!contextElement) {
      return null;
    }
    return {
      name:
        compactTextInner(
          contextElement.getAttribute?.('aria-label') ||
            contextElement.getAttribute?.('name') ||
            contextElement.getAttribute?.('id') ||
            contextElement.innerText ||
            contextElement.textContent ||
            ''
        ) || '',
      css: getCss(contextElement),
    };
  };
  const getLocalContext = (element, owner = element) => {
    const form = getClosestContextElement(element, owner, 'form');
    const dialog = getClosestContextElement(element, owner, 'dialog,[role="dialog"]');
    const table = getClosestContextElement(element, owner, 'table,[role="table"],[role="grid"]');
    const list = getClosestContextElement(element, owner, 'ul,ol,[role="list"]');
    const section = getClosestContextElement(element, owner, 'section,article');
    const landmark = getClosestContextElement(
      element,
      owner,
      'main,[role="main"],nav,[role="navigation"],aside,[role="complementary"],header,[role="banner"],footer,[role="contentinfo"]'
    );

    return {
      form: buildContextSummary(form),
      dialog: buildContextSummary(dialog),
      table: buildContextSummary(table),
      list: buildContextSummary(list),
      heading: getHeadingContext(element, owner),
      section: buildContextSummary(section),
      landmark: buildContextSummary(landmark),
    };
  };
  const isHigherPriorityEntry = (left, right) => compareInteractivePriorityInner(left, right) < 0;
  const insertInteractiveEntry = (entries, limit, entry) => {
    if (entries.length < limit) {
      entries.push(entry);
      return;
    }

    let worstIndex = 0;
    for (let index = 1; index < entries.length; index += 1) {
      if (isHigherPriorityEntry(entries[worstIndex], entries[index])) {
        worstIndex = index;
      }
    }

    if (isHigherPriorityEntry(entry, entries[worstIndex])) {
      entries[worstIndex] = entry;
    }
  };
  const shadowTextSnippets = [];
  const raw = {
    title: document.title,
    url: window.location.href,
    lang: document.documentElement.lang || undefined,
    readyState: document.readyState,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined,
    text: '',
    headings: [],
    lists: [],
    tables: [],
    interactives: {
      buttons: [],
      links: [],
      inputs: [],
      selects: [],
      textareas: [],
      checkboxes: [],
    },
    landmarks: {
      forms: [],
      dialogs: [],
      mains: [],
    },
    dialogs: [],
    frames: [],
    shadowHosts: [],
  };
  const interactiveLimits = {
    buttons: settings.maxButtons,
    links: settings.maxLinks,
    inputs: settings.maxInputs,
    selects: settings.maxSelects,
    textareas: settings.maxTextareas,
    checkboxes: settings.maxCheckboxes,
  };
  const mapFormControl = (element, meta = {}) => {
    const owner = meta.host ?? element;
    const tagName = element.tagName.toLowerCase();
    const css = `${meta.hostCss ? `${meta.hostCss} ` : ''}${getCss(element)}`.trim();
    const context = getContextFlags(element, owner);
    const base = {
      name: getName(element),
      label: getLabel(element),
      description: getDescription(element),
      testId: element.getAttribute('data-testid') || '',
      css,
      visible: isVisible(owner) && isVisible(element),
      disabled: Boolean(element.disabled),
      ariaDisabled: element.getAttribute('aria-disabled'),
      required: element.required === true || element.getAttribute('aria-required') === 'true',
      readonly: element.readOnly === true || element.getAttribute('aria-readonly') === 'true',
      geometry: getGeometry(element),
      localContext: getLocalContext(element, owner),
      domIndex: meta.anchorIndex ?? -1,
      fromShadow: Boolean(meta.host),
      ...context,
    };

    if (tagName === 'select') {
      return {
        group: 'selects',
        entry: finalizeInteractiveEntry({
          ...base,
          role: 'combobox',
          value: element.value || '',
          selectedText: compactTextInner(element.selectedOptions?.[0]?.innerText || ''),
        }),
      };
    }
    if (tagName === 'textarea') {
      return {
        group: 'textareas',
        entry: finalizeInteractiveEntry({
          ...base,
          role: 'textbox',
          placeholder: element.getAttribute('placeholder') || '',
          value: element.value || '',
        }),
      };
    }

    const inputType = (element.type || '').toLowerCase();
    if (inputType === 'checkbox') {
      return {
        group: 'checkboxes',
        entry: finalizeInteractiveEntry({
          ...base,
          role: 'checkbox',
          checked: element.checked === true,
        }),
      };
    }
    if (!interactiveInputTypes.has(inputType)) {
      return null;
    }

    return {
      group: 'inputs',
      entry: finalizeInteractiveEntry({
        ...base,
        role: inputType === 'search' ? 'searchbox' : 'textbox',
        text: getLabel(element) || getName(element),
        placeholder: element.getAttribute('placeholder') || '',
        inputType,
        value: element.value || '',
      }),
    };
  };
  const addInteractiveEntry = (group, entry) => {
    insertInteractiveEntry(raw.interactives[group], interactiveLimits[group], { ...entry, group });
  };
  const addButton = (element, meta = {}) => {
    const owner = meta.host ?? element;
    const context = getContextFlags(element, owner);
    const entry = finalizeInteractiveEntry({
      role: 'button',
      name: getName(element),
      text: getElementText(element),
      description: getDescription(element),
      testId: element.getAttribute('data-testid') || '',
      css: `${meta.hostCss ? `${meta.hostCss} ` : ''}${getCss(element)}`.trim(),
      visible: isVisible(owner) && isVisible(element),
      disabled: Boolean(element.disabled),
      ariaDisabled: element.getAttribute('aria-disabled'),
      isSubmitControl: element.getAttribute('type') === 'submit',
      geometry: getGeometry(element),
      localContext: getLocalContext(element, owner),
      focusable: typeof element.tabIndex === 'number' ? element.tabIndex >= 0 : true,
      domIndex: meta.anchorIndex ?? -1,
      fromShadow: Boolean(meta.host),
      ...context,
    });
    addInteractiveEntry('buttons', entry);
  };
  const addLink = (element, domIndex) => {
    const context = getContextFlags(element, element);
    const entry = finalizeInteractiveEntry({
      role: 'link',
      name: getName(element),
      text: compactTextInner(element.innerText || ''),
      description: getDescription(element),
      testId: element.getAttribute('data-testid') || '',
      href: element.getAttribute('href') || '',
      css: getCss(element),
      visible: isVisible(element),
      disabled: Boolean(element.disabled),
      ariaDisabled: element.getAttribute('aria-disabled'),
      geometry: getGeometry(element),
      localContext: getLocalContext(element, element),
      focusable: typeof element.tabIndex === 'number' ? element.tabIndex >= 0 : true,
      domIndex,
      ...context,
    });
    addInteractiveEntry('links', entry);
  };
  const addFormControl = (element, meta = {}) => {
    const mapped = mapFormControl(element, meta);
    if (!mapped) {
      return;
    }
    addInteractiveEntry(mapped.group, mapped.entry);
  };
  const addDialog = (element) => {
    const entry = {
      name: getName(element),
      text: compactTextInner(element.innerText || element.textContent || ''),
      open: element.open === true || (element.getAttribute('aria-hidden') !== 'true' && isVisible(element)),
      css: getCss(element),
    };
    if (pushIfRoom(raw.dialogs, settings.maxDialogs, entry)) {
      pushIfRoom(raw.landmarks.dialogs, settings.maxDialogs, { name: entry.name });
    }
  };
  const addHeading = (element) => {
    const entry = {
      level: Number(element.tagName.slice(1)),
      text: compactTextInner(element.innerText || element.textContent || ''),
      css: getCss(element),
    };
    if (entry.text) {
      pushIfRoom(raw.headings, settings.maxHeadings, entry);
    }
  };
  const addList = (element) => {
    const items = Array.from(element.querySelectorAll(':scope > li'))
      .map((item) => compactTextInner(item.innerText || item.textContent || ''))
      .filter(Boolean);
    if (items.length > 0) {
      pushIfRoom(raw.lists, settings.maxLists, {
        label: element.getAttribute('aria-label') || element.getAttribute('id') || '',
        itemsCount: items.length,
        itemsPreview: items.slice(0, 3),
        css: getCss(element),
      });
    }
  };
  const addTable = (element) => {
    const headers = Array.from(element.querySelectorAll('th'))
      .map((header) => compactTextInner(header.innerText || header.textContent || ''))
      .filter(Boolean);
    pushIfRoom(raw.tables, settings.maxLists, {
      label: element.getAttribute('aria-label') || element.getAttribute('id') || '',
      headers: headers.slice(0, 5),
      css: getCss(element),
    });
  };
  const addFrame = (element) => {
    pushIfRoom(raw.frames, settings.maxFrames, {
      name: element.getAttribute('name') || '',
      title: element.getAttribute('title') || '',
      src: element.getAttribute('src') || '',
      text: (() => {
        if (!settings.includeFrameText) {
          return '';
        }
        try {
          return compactTextInner(element.contentDocument?.body?.innerText || '');
        } catch {
          return '';
        }
      })(),
    });
  };
  const registerShadowHost = (host, meta) => {
    const shadowText = compactTextInner(host.shadowRoot?.textContent || '');
    if (shadowText) {
      shadowTextSnippets.push(shadowText);
    }
    if (
      !pushIfRoom(raw.shadowHosts, settings.maxShadowHosts, {
        tag: host.tagName.toLowerCase(),
        css: meta.hostCss,
        text: shadowText,
      })
    ) {
      return;
    }

    if (settings.includeShadowInteractives) {
      Array.from(host.shadowRoot.querySelectorAll('input,textarea,select')).forEach((element) =>
        addFormControl(element, {
          host,
          anchorIndex: meta.anchorIndex,
          hostCss: meta.hostCss,
        })
      );
      Array.from(host.shadowRoot.querySelectorAll('button,input[type="button"],input[type="submit"]')).forEach((element) =>
        addButton(element, {
          host,
          anchorIndex: meta.anchorIndex,
          hostCss: meta.hostCss,
        })
      );
    }

    if (!settings.discoverNestedShadowHosts) {
      return;
    }

    const nestedHosts = Array.from(host.shadowRoot.querySelectorAll('*')).filter((element) => element.shadowRoot);
    for (const nestedHost of nestedHosts) {
      if (raw.shadowHosts.length >= settings.maxShadowHosts) {
        break;
      }
      registerShadowHost(nestedHost, {
        anchorIndex: meta.anchorIndex,
        hostCss: `${meta.hostCss} ${getCss(nestedHost)}`.trim(),
      });
    }
  };

  const root = document.body ?? document.documentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let domIndex = 0;

  while (walker.nextNode()) {
    const element = walker.currentNode;
    const tagName = element.tagName.toLowerCase();
    const currentDomIndex = domIndex;
    domIndex += 1;

    if (tagName === 'form') {
      pushIfRoom(raw.landmarks.forms, settings.maxForms, {
        name: element.getAttribute('id') || element.getAttribute('name') || '',
      });
    }

    if (tagName === 'main' || element.getAttribute('role') === 'main') {
      pushIfRoom(raw.landmarks.mains, settings.maxMains, {
        name: getName(element),
      });
    }

    if (tagName === 'dialog' || element.getAttribute('role') === 'dialog') {
      addDialog(element);
    }

    if (/^h[1-6]$/.test(tagName)) {
      addHeading(element);
    }

    if (tagName === 'ul' || tagName === 'ol') {
      addList(element);
    }

    if (tagName === 'table' || element.getAttribute('role') === 'table' || element.getAttribute('role') === 'grid') {
      addTable(element);
    }

    if (tagName === 'iframe') {
      addFrame(element);
    }

    if (tagName === 'button' || (tagName === 'input' && ['button', 'submit'].includes((element.type || '').toLowerCase()))) {
      addButton(element, { anchorIndex: currentDomIndex });
    } else if (tagName === 'a' && element.hasAttribute('href')) {
      addLink(element, currentDomIndex);
    } else if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      addFormControl(element, { anchorIndex: currentDomIndex });
    }

    if (element.shadowRoot && raw.shadowHosts.length < settings.maxShadowHosts) {
      registerShadowHost(element, {
        anchorIndex: currentDomIndex,
        hostCss: getCss(element),
      });
    }
  }

  raw.text = compactTextInner([document.body?.innerText ?? '', ...shadowTextSnippets].join(' '));

  return raw;
}

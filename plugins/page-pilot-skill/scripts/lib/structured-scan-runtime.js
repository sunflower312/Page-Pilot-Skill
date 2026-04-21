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
  const dateInputTypes = new Set(['date', 'datetime-local', 'month', 'time', 'week']);
  const specializedGroups = ['radios', 'switches', 'sliders', 'tabs', 'options', 'menuItems', 'fileInputs', 'dateInputs'];
  const seenInteractiveKeys = new Set();
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
  const getLabelWithSource = (element) => {
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
      const tagName = control.tagName?.toLowerCase?.() || '';
      const role = compactTextInner(control.getAttribute?.('role') || '');
      const allowsNearbyLabel =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        control.isContentEditable === true ||
        ['textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider'].includes(role);

      if (!allowsNearbyLabel) {
        return '';
      }

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
      return { value: readLabelText(element.labels[0]), source: 'label' };
    }
    if (element.id) {
      const explicit = readLabelText(document.querySelector(`label[for="${element.id}"]`));
      if (explicit) {
        return { value: explicit, source: 'label' };
      }
    }
    const wrapped = readLabelText(element.closest?.('label'));
    if (wrapped) {
      return { value: wrapped, source: 'wrapped-label' };
    }
    const labelledBy = readLabeledByText(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      return { value: labelledBy, source: 'aria-labelledby' };
    }
    const tableRowLabel = readTableRowLabel(element);
    if (tableRowLabel) {
      return { value: tableRowLabel, source: 'table-row' };
    }
    const nearby = readNearbyLabel(element);
    return {
      value: nearby,
      source: nearby ? 'nearby-sibling' : 'none',
    };
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
  const getRoleWithSource = (element, explicitRole = '') => {
    const ariaRole = compactTextInner(explicitRole || element.getAttribute('role') || '');
    if (ariaRole) {
      return { value: ariaRole, source: 'aria_role' };
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName === 'button') {
      return { value: 'button', source: 'native_tag' };
    }
    if (tagName === 'a' && element.hasAttribute('href')) {
      return { value: 'link', source: 'native_tag' };
    }
    if (tagName === 'textarea') {
      return { value: 'textbox', source: 'native_tag' };
    }
    if (tagName === 'select') {
      return { value: 'combobox', source: 'native_tag' };
    }
    if (tagName === 'input') {
      const inputType = compactTextInner(element.getAttribute('type') || element.type || '');
      if (inputType === 'checkbox') {
        return { value: 'checkbox', source: 'native_tag' };
      }
      if (inputType === 'radio') {
        return { value: 'radio', source: 'native_tag' };
      }
      if (inputType === 'range') {
        return { value: 'slider', source: 'native_tag' };
      }
      if (inputType === 'search') {
        return { value: 'searchbox', source: 'native_tag' };
      }
      return { value: 'textbox', source: 'native_tag' };
    }
    if (element.isContentEditable) {
      return { value: 'textbox', source: 'derived' };
    }
    return { value: '', source: 'none' };
  };
  const getNameWithSource = (element, labelResult = getLabelWithSource(element)) => {
    const ariaLabel = compactTextInner(element.getAttribute('aria-label') || '');
    if (ariaLabel) {
      return { value: ariaLabel, source: 'aria-label' };
    }

    const labelledBy = compactTextInner(element.getAttribute('aria-labelledby') || '');
    if (labelledBy) {
      const labelledByText = labelledBy
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => compactTextInner(document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || ''))
        .filter(Boolean)
        .join(' ');
      if (labelledByText) {
        return { value: labelledByText, source: 'aria-labelledby' };
      }
    }

    const elementText = getElementText(element);
    if (elementText) {
      return { value: elementText, source: 'inner-text' };
    }

    if (labelResult.value) {
      return { value: labelResult.value, source: labelResult.source === 'none' ? 'label' : labelResult.source };
    }

    const placeholder = compactTextInner(element.getAttribute('placeholder') || '');
    if (placeholder) {
      return { value: placeholder, source: 'placeholder' };
    }

    return { value: '', source: 'none' };
  };
  const getDescriptionWithSource = (element) => {
    const describedBy = compactTextInner(element.getAttribute('aria-describedby') || '');
    const describedByText = describedBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => compactTextInner(document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || ''))
      .filter(Boolean)
      .join(' ');

    const ariaDescription = compactTextInner(element.getAttribute('aria-description') || '');
    if (ariaDescription) {
      return { value: ariaDescription, source: 'aria-description' };
    }
    if (describedByText) {
      return { value: describedByText, source: 'aria-describedby' };
    }
    const title = compactTextInner(element.getAttribute('title') || '');
    if (title) {
      return { value: title, source: 'title' };
    }
    return { value: '', source: 'none' };
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
    specializedControls: {
      radios: [],
      switches: [],
      sliders: [],
      tabs: [],
      options: [],
      menuItems: [],
      fileInputs: [],
      dateInputs: [],
    },
    discoveredCounts: {
      buttons: 0,
      links: 0,
      inputs: 0,
      selects: 0,
      textareas: 0,
      checkboxes: 0,
      specialized: {
        radios: 0,
        switches: 0,
        sliders: 0,
        tabs: 0,
        options: 0,
        menuItems: 0,
        fileInputs: 0,
        dateInputs: 0,
      },
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
    radios: settings.maxRadios ?? 3,
    switches: settings.maxSwitches ?? 3,
    sliders: settings.maxSliders ?? 3,
    tabs: settings.maxTabs ?? 4,
    options: settings.maxOptions ?? 4,
    menuItems: settings.maxMenuItems ?? 4,
    fileInputs: settings.maxFileInputs ?? 2,
    dateInputs: settings.maxDateInputs ?? 2,
  };
  const incrementDiscovered = (group) => {
    if (specializedGroups.includes(group)) {
      raw.discoveredCounts.specialized[group] += 1;
      return;
    }
    raw.discoveredCounts[group] += 1;
  };
  const makeInteractiveKey = (element, group, meta = {}) =>
    `${group}:${meta.hostCss ?? 'document'}:${
      element.id ||
      element.getAttribute('name') ||
      element.getAttribute('aria-label') ||
      (meta.host ? `${element.tagName}:${meta.shadowLocalIndex ?? ''}` : element.tagName)
    }:${meta.host ? meta.shadowLocalIndex ?? '' : meta.anchorIndex ?? ''}`;
  const mapFormControl = (element, meta = {}) => {
    const owner = meta.host ?? element;
    const tagName = element.tagName.toLowerCase();
    const css = `${meta.hostCss ? `${meta.hostCss} ` : ''}${getCss(element)}`.trim();
    const context = getContextFlags(element, owner);
    const labelResult = getLabelWithSource(element);
    const nameResult = getNameWithSource(element, labelResult);
    const descriptionResult = getDescriptionWithSource(element);
    const roleResult = getRoleWithSource(element);
    const base = {
      roleSource: roleResult.source,
      name: nameResult.value,
      nameSource: nameResult.source,
      label: labelResult.value,
      labelSource: labelResult.source,
      description: descriptionResult.value,
      descriptionSource: descriptionResult.source,
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
          role: roleResult.value || 'combobox',
          value: element.value || '',
          selectedText: compactTextInner(element.selectedOptions?.[0]?.innerText || ''),
          controlType: 'select',
        }),
      };
    }
    if (tagName === 'textarea') {
      return {
        group: 'textareas',
        entry: finalizeInteractiveEntry({
          ...base,
          role: roleResult.value || 'textbox',
          placeholder: element.getAttribute('placeholder') || '',
          value: element.value || '',
          controlType: 'textarea',
        }),
      };
    }

    const inputType = (element.type || '').toLowerCase();
    if (inputType === 'checkbox') {
      return {
        group: 'checkboxes',
        entry: finalizeInteractiveEntry({
          ...base,
          role: roleResult.value || 'checkbox',
          checked: element.checked === true,
          controlType: 'checkbox',
        }),
      };
    }
    if (inputType === 'radio') {
      return {
        group: 'radios',
        entry: finalizeInteractiveEntry({
          ...base,
          role: roleResult.value || 'radio',
          checked: element.checked === true,
          controlType: 'radio',
        }),
      };
    }
    if (inputType === 'range') {
      return {
        group: 'sliders',
        entry: finalizeInteractiveEntry({
          ...base,
          role: roleResult.value || 'slider',
          value: element.value || '',
          controlType: 'range',
        }),
      };
    }
    if (inputType === 'file') {
      return {
        group: 'fileInputs',
        entry: finalizeInteractiveEntry({
          ...base,
          role: 'button',
          controlType: 'file',
        }),
      };
    }
    if (dateInputTypes.has(inputType)) {
      return {
        group: 'dateInputs',
        entry: finalizeInteractiveEntry({
          ...base,
          role: roleResult.value || 'textbox',
          value: element.value || '',
          controlType: inputType || 'date',
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
        role: roleResult.value || (inputType === 'search' ? 'searchbox' : 'textbox'),
        text: labelResult.value || nameResult.value,
        placeholder: element.getAttribute('placeholder') || '',
        inputType,
        value: element.value || '',
        controlType: 'text',
      }),
    };
  };
  const addInteractiveEntry = (group, entry) => {
    incrementDiscovered(group);
    insertInteractiveEntry(raw.interactives[group], interactiveLimits[group], { ...entry, group });
  };
  const addSpecializedEntry = (group, entry) => {
    incrementDiscovered(group);
    insertInteractiveEntry(raw.specializedControls[group], interactiveLimits[group], { ...entry, group });
  };
  const addButton = (element, meta = {}) => {
    const owner = meta.host ?? element;
    const context = getContextFlags(element, owner);
    const roleResult = getRoleWithSource(element, 'button');
    const labelResult = getLabelWithSource(element);
    const nameResult = getNameWithSource(element, labelResult);
    const descriptionResult = getDescriptionWithSource(element);
    const entry = finalizeInteractiveEntry({
      role: roleResult.value || 'button',
      roleSource: roleResult.source,
      name: nameResult.value,
      nameSource: nameResult.source,
      text: getElementText(element),
      label: labelResult.value,
      labelSource: labelResult.source,
      description: descriptionResult.value,
      descriptionSource: descriptionResult.source,
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
    const key = makeInteractiveKey(element, 'buttons', meta);
    if (seenInteractiveKeys.has(key)) {
      return;
    }
    seenInteractiveKeys.add(key);
    addInteractiveEntry('buttons', entry);
  };
  const addLink = (element, meta = {}) => {
    const owner = meta.host ?? element;
    const context = getContextFlags(element, owner);
    const roleResult = getRoleWithSource(element, 'link');
    const labelResult = getLabelWithSource(element);
    const nameResult = getNameWithSource(element, labelResult);
    const descriptionResult = getDescriptionWithSource(element);
    const entry = finalizeInteractiveEntry({
      role: roleResult.value || 'link',
      roleSource: roleResult.source,
      name: nameResult.value,
      nameSource: nameResult.source,
      text: compactTextInner(element.innerText || ''),
      label: labelResult.value,
      labelSource: labelResult.source,
      description: descriptionResult.value,
      descriptionSource: descriptionResult.source,
      testId: element.getAttribute('data-testid') || '',
      href: element.getAttribute('href') || '',
      css: `${meta.hostCss ? `${meta.hostCss} ` : ''}${getCss(element)}`.trim(),
      visible: isVisible(owner) && isVisible(element),
      disabled: Boolean(element.disabled),
      ariaDisabled: element.getAttribute('aria-disabled'),
      geometry: getGeometry(element),
      localContext: getLocalContext(element, owner),
      focusable: typeof element.tabIndex === 'number' ? element.tabIndex >= 0 : true,
      domIndex: meta.anchorIndex ?? -1,
      fromShadow: Boolean(meta.host),
      ...context,
    });
    const key = makeInteractiveKey(element, 'links', meta);
    if (seenInteractiveKeys.has(key)) {
      return;
    }
    seenInteractiveKeys.add(key);
    addInteractiveEntry('links', entry);
  };
  const addFormControl = (element, meta = {}) => {
    const mapped = mapFormControl(element, meta);
    if (!mapped) {
      return;
    }
    const key = makeInteractiveKey(element, mapped.group, meta);
    if (seenInteractiveKeys.has(key)) {
      return;
    }
    seenInteractiveKeys.add(key);
    if (specializedGroups.includes(mapped.group)) {
      addSpecializedEntry(mapped.group, mapped.entry);
      return;
    }
    addInteractiveEntry(mapped.group, mapped.entry);
  };
  const addDialog = (element) => {
    const entry = {
      name: getNameWithSource(element).value,
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
      rowCountEstimate: element.querySelectorAll('tbody tr').length || element.querySelectorAll('tr').length,
      rowActions: Array.from(element.querySelectorAll('button,a[href]'))
        .map((node) => compactTextInner(node.innerText || node.textContent || ''))
        .filter(Boolean)
        .slice(0, 4),
    });
  };
  const addFrame = (element) => {
    pushIfRoom(raw.frames, settings.maxFrames, {
      name: element.getAttribute('name') || '',
      title: element.getAttribute('title') || '',
      src: element.getAttribute('src') || '',
      sameOrigin: (() => {
        try {
          return Boolean(element.contentDocument);
        } catch {
          return false;
        }
      })(),
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
      Array.from(host.shadowRoot.querySelectorAll('input,textarea,select')).forEach((element, shadowLocalIndex) =>
        addFormControl(element, {
          host,
          anchorIndex: meta.anchorIndex,
          hostCss: meta.hostCss,
          shadowLocalIndex,
        })
      );
      Array.from(host.shadowRoot.querySelectorAll('button,input[type="button"],input[type="submit"]')).forEach((element, shadowLocalIndex) =>
        addButton(element, {
          host,
          anchorIndex: meta.anchorIndex,
          hostCss: meta.hostCss,
          shadowLocalIndex,
        })
      );
      Array.from(host.shadowRoot.querySelectorAll('a[href]')).forEach((element, shadowLocalIndex) =>
        addLink(element, {
          host,
          anchorIndex: meta.anchorIndex,
          hostCss: meta.hostCss,
          shadowLocalIndex,
        })
      );
      Array.from(host.shadowRoot.querySelectorAll('[role]')).forEach((element, shadowLocalIndex) =>
        addRoleBasedInteractive(element, {
          host,
          anchorIndex: meta.anchorIndex,
          hostCss: meta.hostCss,
          shadowLocalIndex,
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
  const roleToSpecializedGroup = {
    radio: 'radios',
    switch: 'switches',
    slider: 'sliders',
    tab: 'tabs',
    option: 'options',
    menuitem: 'menuItems',
  };
  const isRedundantRoleForNativeCollector = (element, role) => {
    const tagName = element.tagName.toLowerCase();
    const inputType = (element.getAttribute('type') || '').toLowerCase();

    if (role === 'button' && (tagName === 'button' || (tagName === 'input' && ['button', 'submit'].includes(inputType)))) {
      return true;
    }
    if (role === 'link' && tagName === 'a' && element.hasAttribute('href')) {
      return true;
    }
    if (role === 'textbox' && (tagName === 'input' || tagName === 'textarea')) {
      return true;
    }
    if (role === 'combobox' && tagName === 'select') {
      return true;
    }
    if (role === 'checkbox' && tagName === 'input' && inputType === 'checkbox') {
      return true;
    }
    if (role === 'radio' && tagName === 'input' && inputType === 'radio') {
      return true;
    }

    return false;
  };
  const addRoleBasedInteractive = (element, meta = {}) => {
    const owner = meta.host ?? element;
    const roleResult = getRoleWithSource(element);
    const role = roleResult.value;
    if (!role) {
      return;
    }

    const supportedRoles = new Set([
      'button',
      'link',
      'textbox',
      'searchbox',
      'combobox',
      'checkbox',
      'radio',
      'switch',
      'slider',
      'tab',
      'option',
      'menuitem',
    ]);

    if (!supportedRoles.has(role)) {
      return;
    }

    if (isRedundantRoleForNativeCollector(element, role)) {
      return;
    }

    const key = makeInteractiveKey(element, role, meta);
    if (seenInteractiveKeys.has(key)) {
      return;
    }

    const context = getContextFlags(element, owner);
    const labelResult = getLabelWithSource(element);
    const nameResult = getNameWithSource(element, labelResult);
    const descriptionResult = getDescriptionWithSource(element);
    const base = finalizeInteractiveEntry({
      role,
      roleSource: roleResult.source,
      name: nameResult.value,
      nameSource: nameResult.source,
      text: getElementText(element),
      label: labelResult.value,
      labelSource: labelResult.source,
      description: descriptionResult.value,
      descriptionSource: descriptionResult.source,
      testId: element.getAttribute('data-testid') || '',
      href: element.getAttribute('href') || '',
      css: `${meta.hostCss ? `${meta.hostCss} ` : ''}${getCss(element)}`.trim(),
      visible: isVisible(owner) && isVisible(element),
      disabled: Boolean(element.disabled),
      ariaDisabled: element.getAttribute('aria-disabled'),
      placeholder: element.getAttribute('placeholder') || '',
      value: element.getAttribute('value') || '',
      checked: element.getAttribute('aria-checked') === 'true' ? true : element.getAttribute('aria-checked') === 'false' ? false : null,
      selected: element.getAttribute('aria-selected') === 'true' ? true : element.getAttribute('aria-selected') === 'false' ? false : null,
      expanded: element.getAttribute('aria-expanded'),
      pressed: element.getAttribute('aria-pressed'),
      busy: element.getAttribute('aria-busy'),
      geometry: getGeometry(element),
      localContext: getLocalContext(element, owner),
      focusable: typeof element.tabIndex === 'number' ? element.tabIndex >= 0 : true,
      domIndex: meta.anchorIndex ?? -1,
      fromShadow: Boolean(meta.host),
      ...context,
    });

    seenInteractiveKeys.add(key);

    if (role === 'button') {
      addInteractiveEntry('buttons', base);
      return;
    }
    if (role === 'link') {
      addInteractiveEntry('links', base);
      return;
    }
    if (role === 'textbox' || role === 'searchbox') {
      addInteractiveEntry('inputs', base);
      return;
    }
    if (role === 'combobox') {
      addInteractiveEntry('selects', base);
      return;
    }
    if (role === 'checkbox') {
      addInteractiveEntry('checkboxes', base);
      return;
    }

    const specializedGroup = roleToSpecializedGroup[role];
    if (specializedGroup) {
      addSpecializedEntry(specializedGroup, base);
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
        name: getNameWithSource(element).value,
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
      addLink(element, { anchorIndex: currentDomIndex });
    } else if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      addFormControl(element, { anchorIndex: currentDomIndex });
    } else if (element.isContentEditable) {
      addRoleBasedInteractive(element, { anchorIndex: currentDomIndex });
    }

    if (element.getAttribute('role')) {
      addRoleBasedInteractive(element, { anchorIndex: currentDomIndex });
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

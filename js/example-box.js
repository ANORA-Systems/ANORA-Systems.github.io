// Example search: a search form over recorded SpecScout results from demo/examples.json,
// without any call to the API. Product name, brand and category are separate fields,
// each a searchable dropdown of the available examples; choosing a product fills in
// its brand and category. After "Search" a short pause with a spinner, then the result
// appears below the form, in the same panel.
// Two looks, both reading data-src (the JSON, relative to the page) and data-start-url
// ("Start free"), and both filling the [data-example-root] inside them:
// - data-example-search: the dark hero card on the homepage (data-expand-grid names the
//   hero grid, which switches to top alignment once the card grows);
// - data-example-box: a light box (the Re-commerce page); data-only="older" keeps only
//   the examples marked "older".
// Icon templates come from _build/layouts/example-icons.html. Texts are German or
// English after <html lang>. Values are shown as returned, numbers in the page's format.
(function () {
    'use strict';

    const lang = document.documentElement.lang === 'de' ? 'de' : 'en';
    const TEXT = {
        de: {
            product: 'Produktname',
            brand: 'Marke',
            category: 'Kategorie',
            productPlaceholder: 'z. B. Galaxy S24 Ultra',
            brandPlaceholder: 'z. B. Samsung',
            categoryPlaceholder: 'z. B. Smartphone',
            search: 'Suchen',
            searching: 'Suche läuft …',
            noOptions: 'Keine passenden Beispiele',
            needProduct: 'Bitte geben Sie einen Produktnamen ein.',
            noExample: (name) => `Für „${name}“ gibt es hier kein aufgezeichnetes Beispiel. Ihre eigenen Produkte suchen Sie direkt in SpecScout: `,
            startFree: 'Kostenlos starten',
            input: 'Eingabe',
            typical: 'Typisches Angebot',
            withSpecScout: 'Mit SpecScout',
            typicalNote: 'So sehen viele Angebote aus: Fließtext, ungenaue Angaben, nichts davon ist filterbar.',
            notFound: 'nicht gefunden',
            notFoundNote: 'Kein Wert bestätigt: SpecScout rät nicht.',
            sources: (n) => (n === 1 ? '1 Quelle' : `${n} Quellen`),
            confidence: 'Konfidenz',
            yes: 'Ja',
            no: 'Nein',
            recorded: (date, seconds) => `Aufgezeichnetes Ergebnis vom ${date} · Dauer ${seconds} s`,
            notLive: 'Diese Suche zeigt nur ausgewählte gespeicherte Ergebnisse.',
            shownOf: (shown, total) => `${shown} von ${total} Merkmalen gezeigt`,
            tryLive: 'Wenn Sie die Live-Suche ausprobieren möchten, klicken Sie',
            tryLiveButton: 'Live-Suche ausprobieren',
            close: 'Ergebnis schließen',
            clickHere: 'hier',
            error: 'Die Beispiele konnten gerade nicht geladen werden.',
        },
        en: {
            product: 'Product name',
            brand: 'Brand',
            category: 'Category',
            productPlaceholder: 'e.g. Galaxy S24 Ultra',
            brandPlaceholder: 'e.g. Samsung',
            categoryPlaceholder: 'e.g. Smartphone',
            search: 'Search',
            searching: 'Searching …',
            noOptions: 'No matching examples',
            needProduct: 'Please enter a product name.',
            noExample: (name) => `There is no recorded example for "${name}" here. Search your own products directly in SpecScout: `,
            startFree: 'Start free',
            input: 'Input',
            typical: 'Typical listing',
            withSpecScout: 'With SpecScout',
            typicalNote: 'Many listings look like this: running text, vague details, none of it filterable.',
            notFound: 'not found',
            notFoundNote: 'No value confirmed: SpecScout does not guess.',
            sources: (n) => (n === 1 ? '1 source' : `${n} sources`),
            confidence: 'Confidence',
            yes: 'Yes',
            no: 'No',
            recorded: (date, seconds) => `Recorded result from ${date} · took ${seconds} s`,
            notLive: 'This is an offline search only showing selected recorded results.',
            shownOf: (shown, total) => `${shown} of ${total} attributes shown`,
            tryLive: 'Try live search',
            tryLiveButton: 'Try live search',
            close: 'Close results',
            clickHere: 'here',
            error: 'The examples could not be loaded just now.',
        },
    }[lang];

    // Every class string of both looks. Tailwind finds them here when it compiles the CSS.
    const LOOKS = {
        light: {
            form: 'grid grid-cols-1 items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto]',
            label: 'mb-1 block text-sm font-semibold text-anoraBlue',
            productWrap: '',
            submit: 'inline-flex items-center justify-center gap-2 rounded-brand border border-transparent bg-anoraBlue px-6 py-2.5 font-semibold text-white transition hover:bg-anoraTeal disabled:cursor-wait disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal focus-visible:ring-offset-2',
            message: 'text-sm font-medium text-red-700 md:col-span-4',
            result: 'mt-5',
            notice: 'mt-3 text-xs text-gray-500',
            noticeLink: 'underline hover:text-anoraBlue',
            actions: 'mt-4 flex flex-col gap-3 sm:flex-row',
            closeButton: 'inline-flex items-center justify-center gap-2 rounded-brand border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-anoraBlue transition hover:border-anoraBlue focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal',
            loading: 'flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-6 text-sm text-gray-600',
            spinner: 'h-5 w-5 animate-spin text-anoraTeal',
            note: 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600',
            noteLink: 'font-semibold text-anoraTeal hover:underline',
            card: 'rounded-xl border border-gray-200 bg-white shadow-sm',
            head: 'flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
            inputLine: 'text-sm text-gray-600',
            inputLabel: 'font-semibold text-anoraBlue',
            toggle: 'inline-flex self-start rounded-lg bg-gray-100 p-1 text-sm',
            toggleOn: ['bg-white', 'shadow-sm', 'text-anoraBlue'],
            toggleOff: ['text-gray-500'],
            body: 'px-4 pb-2 pt-1 sm:px-5',
            row: 'grid grid-cols-1 gap-1 border-t border-gray-100 py-3 first:border-t-0 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-4',
            name: 'text-sm text-gray-500 sm:pt-1',
            value: 'font-semibold text-anoraBlue',
            badge: ['bg-anoraTeal/10 text-teal-800 border-anoraTeal/30', 'bg-amber-50 text-amber-800 border-amber-200', 'bg-gray-100 text-gray-700 border-gray-200'],
            sourcesButton: 'inline-flex items-center gap-1 rounded text-xs font-medium text-anoraTeal hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal',
            sourcesList: 'mt-1 space-y-1 border-l-2 border-anoraTeal/30 pl-3 text-xs',
            sourceLink: 'inline-flex items-center gap-1 break-all text-gray-600 underline decoration-gray-300 hover:text-anoraBlue',
            missing: 'flex flex-wrap items-center gap-2 py-1 text-sm text-gray-500',
            typicalBox: 'my-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 sm:p-5',
            typicalTitle: 'font-semibold text-gray-800',
            typicalList: 'mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600',
            typicalNote: 'mt-4 text-xs text-gray-500',
            foot: 'border-t border-gray-100 px-4 py-3 text-xs text-gray-500 sm:px-5',
        },
        dark: {
            form: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
            label: 'mb-1 block text-xs font-semibold uppercase tracking-wide text-onBlue',
            productWrap: 'sm:col-span-2',
            submit: 'mt-1 inline-flex items-center justify-center gap-2 rounded-brand border border-transparent bg-anoraTeal px-6 py-3 font-semibold text-white transition hover:bg-anoraTealHover disabled:cursor-wait disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:col-span-2',
            message: 'text-sm font-medium text-amber-200 sm:col-span-2',
            result: '',
            notice: 'mt-4 text-xs text-gray-400',
            noticeLink: 'underline hover:text-white',
            actions: 'mt-5 flex flex-col gap-3 sm:flex-row',
            closeButton: 'inline-flex items-center justify-center gap-2 rounded-brand border border-white/30 px-5 py-3 text-sm font-medium text-white transition hover:border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
            loading: 'mt-5 flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-onBlue',
            spinner: 'h-5 w-5 animate-spin text-anoraTeal',
            note: 'mt-5 border-t border-white/10 pt-5 text-sm text-onBlue',
            noteLink: 'font-semibold text-anoraTeal hover:underline',
            card: 'mt-5 border-t border-white/10 pt-5',
            head: 'flex flex-col gap-3 pb-3',
            inputLine: 'text-sm text-onBlue',
            inputLabel: 'font-semibold text-white',
            toggle: 'inline-flex self-start rounded-lg bg-black/30 p-1 text-sm',
            toggleOn: ['bg-white/15', 'text-white'],
            toggleOff: ['text-onBlueMuted'],
            body: '',
            row: 'grid grid-cols-1 gap-1 border-t border-white/10 py-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4',
            name: 'text-sm text-onBlueMuted sm:pt-1',
            value: 'font-semibold text-white',
            badge: ['bg-anoraTeal/20 text-teal-200 border-anoraTeal/40', 'bg-amber-400/15 text-amber-200 border-amber-300/30', 'bg-white/10 text-gray-300 border-white/20'],
            sourcesButton: 'inline-flex items-center gap-1 rounded text-xs font-medium text-anoraTeal hover:text-teal-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
            sourcesList: 'mt-1 space-y-1 border-l-2 border-anoraTeal/40 pl-3 text-xs',
            sourceLink: 'inline-flex items-center gap-1 break-all text-gray-300 underline decoration-white/20 hover:text-white',
            missing: 'flex flex-wrap items-center gap-2 py-1 text-sm text-onBlueMuted',
            typicalBox: 'my-3 rounded-lg border border-dashed border-white/20 bg-black/20 p-4',
            typicalTitle: 'font-semibold text-white',
            typicalList: 'mt-2 list-disc space-y-1 pl-5 text-sm text-onBlue',
            typicalNote: 'mt-4 text-xs text-onBlueMuted',
            foot: 'border-t border-white/10 pt-3 text-xs text-onBlueMuted',
        },
    };

    const numberFormat = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 2 });
    const dateFormat = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let idCounter = 0;
    const nextId = (prefix) => `${prefix}-${++idCounter}`;
    const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const fieldClass = 'w-full rounded-brand border border-gray-300 bg-white px-3 py-2.5 text-slate-800 placeholder:text-gray-400 focus:border-anoraTeal focus:outline-none focus:ring-2 focus:ring-anoraTeal';

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function icon(name, extraClass) {
        const template = document.querySelector(`template[data-icon="${name}"]`);
        if (!template) return document.createTextNode('');
        const svg = template.content.firstElementChild.cloneNode(true);
        if (extraClass) svg.setAttribute('class', `${svg.getAttribute('class')} ${extraClass}`);
        return svg;
    }

    // --- searchable dropdown (ARIA combobox with a listbox popup) ----------------------------

    function combobox({ label, placeholder, options, onSelect, labelClass, wrapClass }) {
        const wrap = el('div', `relative ${wrapClass || ''}`);
        const inputId = nextId('example-field');
        const listId = nextId('example-options');
        const labelEl = el('label', labelClass, label);
        labelEl.htmlFor = inputId;
        const input = el('input', fieldClass);
        Object.assign(input, { id: inputId, type: 'text', placeholder, autocomplete: 'off', spellcheck: false });
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', listId);
        const list = el('ul', 'absolute z-20 mt-1 hidden max-h-64 w-full overflow-auto rounded-brand border border-gray-200 bg-white py-1 text-sm shadow-lg');
        list.id = listId;
        list.setAttribute('role', 'listbox');
        wrap.append(labelEl, input, list);

        let shown = [];
        let active = -1;

        function close() {
            list.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            active = -1;
        }

        function highlight(index) {
            active = index;
            [...list.children].forEach((item, i) => {
                const on = i === index;
                item.classList.toggle('bg-anoraTeal/10', on);
                if (on) {
                    input.setAttribute('aria-activedescendant', item.id);
                    item.scrollIntoView({ block: 'nearest' });
                }
            });
        }

        function choose(option) {
            input.value = option.value;
            close();
            onSelect(option);
        }

        function open() {
            const query = input.value.trim().toLowerCase();
            shown = options().filter((option) => !query || `${option.value} ${option.hint || ''}`.toLowerCase().includes(query));
            list.replaceChildren();
            if (!shown.length) list.append(el('li', 'px-3 py-2 text-gray-500', TEXT.noOptions));
            shown.forEach((option, index) => {
                const item = el('li', 'flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 hover:bg-gray-50');
                item.id = `${listId}-${index}`;
                item.setAttribute('role', 'option');
                item.append(el('span', 'font-medium text-anoraBlue', option.value));
                if (option.hint) item.append(el('span', 'shrink-0 text-xs text-gray-500', option.hint));
                // mousedown, not click: a click would blur the input first and close the list
                item.addEventListener('mousedown', (event) => { event.preventDefault(); choose(option); });
                list.append(item);
            });
            list.classList.remove('hidden');
            input.setAttribute('aria-expanded', 'true');
            highlight(-1);
        }

        input.addEventListener('focus', open);
        input.addEventListener('click', open);
        input.addEventListener('input', open);
        input.addEventListener('blur', close);
        input.addEventListener('keydown', (event) => {
            const isOpen = !list.classList.contains('hidden');
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (!isOpen) open();
                if (shown.length) highlight(Math.min(active + 1, shown.length - 1));
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (shown.length) highlight(Math.max(active - 1, 0));
            } else if (event.key === 'Enter' && isOpen && active >= 0) {
                event.preventDefault();
                choose(shown[active]);
            } else if (event.key === 'Escape' && isOpen) {
                event.preventDefault();
                close();
            }
        });

        return { wrap, input };
    }

    // --- results --------------------------------------------------------------------------------

    // Multi-part values follow the spec's sub_values: a "min value"/"max value" pair is a range
    // (100–102.400), anything else (width/height/depth) a dimension list (8,6 × 79 × 162,3).
    // Yes/no answers the search returned as text ("True", "Yes") read as yes/no as well.
    function formatValue(value, unit, subValues) {
        const part = (item) => (typeof item === 'number' ? numberFormat.format(item) : String(item));
        const isRange = Array.isArray(subValues) && subValues.length === 2 && /min/i.test(subValues[0]) && /max/i.test(subValues[1]);
        let text;
        if (typeof value === 'boolean') text = value ? TEXT.yes : TEXT.no;
        else if (typeof value === 'string' && /^(true|yes)$/i.test(value)) text = TEXT.yes;
        else if (typeof value === 'string' && /^(false|no)$/i.test(value)) text = TEXT.no;
        else if (typeof value === 'number') text = numberFormat.format(value);
        else if (Array.isArray(value)) text = value.map(part).join(isRange ? '–' : ' × ');
        else text = String(value);
        return unit ? `${text} ${unit}` : text;
    }

    function confidenceBadge(look, confidence) {
        const percent = Math.round(confidence * 100);
        const tone = look.badge[percent >= 85 ? 0 : percent >= 60 ? 1 : 2];
        const badge = el('span', `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`, `${percent} %`);
        badge.title = `${TEXT.confidence}: ${percent} %`;
        badge.setAttribute('aria-label', `${TEXT.confidence} ${percent} %`);
        return badge;
    }

    function valueLine(look, specValue, spec) {
        const wrap = el('div', 'py-1');
        const line = el('div', 'flex flex-wrap items-center gap-2');
        line.append(el('span', look.value, formatValue(specValue.value, specValue.unit, spec.sub_values)), confidenceBadge(look, specValue.confidence));

        const listId = nextId('example-sources');
        const toggle = el('button', look.sourcesButton);
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', listId);
        toggle.append(document.createTextNode(TEXT.sources(specValue.sources.length)));
        const chevron = icon('chevron-down', 'transition-transform');
        toggle.append(chevron);
        line.append(toggle);

        const list = el('ul', `${look.sourcesList} hidden`);
        list.id = listId;
        specValue.sources.forEach((url) => {
            const link = el('a', look.sourceLink, url.replace(/^https?:\/\//, ''));
            link.href = url;
            link.target = '_blank';
            link.rel = 'nofollow noopener noreferrer';
            link.append(icon('external-link'));
            const item = el('li');
            item.append(link);
            list.append(item);
        });
        toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(open));
            list.classList.toggle('hidden', !open);
            chevron.classList.toggle('rotate-180', open);
        });
        wrap.append(line, list);
        return wrap;
    }

    function specRow(look, nameText, content) {
        const row = el('div', look.row);
        row.append(el('div', look.name, nameText), content);
        return row;
    }

    function resultsView(look, example) {
        const view = el('div');
        example.response.specs.forEach((spec) => {
            const values = el('div');
            spec.value.forEach((specValue) => values.append(valueLine(look, specValue, spec)));
            view.append(specRow(look, spec.name, values));
        });
        example.response.not_found.forEach((spec) => {
            const missing = el('div', look.missing);
            const label = el('span', 'inline-flex items-center gap-1 italic');
            label.append(icon('circle-slash'), document.createTextNode(TEXT.notFound));
            missing.append(label, el('span', 'text-xs', TEXT.notFoundNote));
            view.append(specRow(look, spec.name, missing));
        });
        return view;
    }

    function typicalView(look, example) {
        const view = el('div', look.typicalBox);
        const lines = example.typical_listing[lang];
        view.append(el('p', look.typicalTitle, lines[0]));
        const list = el('ul', look.typicalList);
        lines.slice(1).forEach((line) => list.append(el('li', '', line)));
        view.append(list, el('p', look.typicalNote, TEXT.typicalNote));
        return view;
    }

    function resultCard(look, example) {
        let showResults = true;
        const card = el('div', look.card);
        const head = el('div', look.head);
        const inputLine = el('p', look.inputLine);
        inputLine.append(
            el('span', look.inputLabel, `${TEXT.input}: `),
            document.createTextNode(`${example.input.product_name} · ${TEXT.brand}: ${example.input.brand} · ${TEXT.category}: ${example.category[lang]}`),
        );
        const toggle = el('div', look.toggle);
        toggle.setAttribute('role', 'group');
        const body = el('div', look.body);
        const toggleButtons = [[TEXT.typical, false], [TEXT.withSpecScout, true]].map(([label, value]) => {
            const button = el('button', 'whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal', label);
            button.type = 'button';
            button.addEventListener('click', () => { showResults = value; update(); });
            toggle.append(button);
            return [button, value];
        });
        // Not every example has a typical-listing illustration; without one there is nothing to switch to.
        head.append(inputLine);
        if (example.typical_listing) head.append(toggle);
        const foot = el('p', look.foot,
            TEXT.recorded(dateFormat.format(new Date(`${example.recorded_at}T12:00:00Z`)), Math.round(example.duration_ms / 1000))
            + (example.specs_total ? ` · ${TEXT.shownOf(example.response.specs.length + example.response.not_found.length, example.specs_total)}` : ''));
        card.append(head, body, foot);

        function update() {
            toggleButtons.forEach(([button, value]) => {
                const active = value === showResults;
                button.setAttribute('aria-pressed', String(active));
                look.toggleOn.forEach((name) => button.classList.toggle(name, active));
                look.toggleOff.forEach((name) => button.classList.toggle(name, !active));
            });
            body.replaceChildren(showResults ? resultsView(look, example) : typicalView(look, example));
        }
        update();
        return card;
    }

    // --- the form -------------------------------------------------------------------------------

    function searchPanel({ examples, look, startUrl, onExpand, onCollapse }) {
        const categoryOf = (example) => example.category[lang];
        const unique = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
        const form = el('form', look.form);
        form.noValidate = true;
        let product;
        let brand;
        let category;

        product = combobox({
            label: TEXT.product,
            placeholder: TEXT.productPlaceholder,
            labelClass: look.label,
            wrapClass: look.productWrap,
            options: () => examples
                .filter((example) => !brand.input.value.trim() || same(example.input.brand, brand.input.value))
                .filter((example) => !category.input.value.trim() || same(categoryOf(example), category.input.value))
                .map((example) => ({ value: example.input.product_name, hint: `${example.input.brand} · ${categoryOf(example)}`, example })),
            onSelect: (option) => {
                brand.input.value = option.example.input.brand;
                category.input.value = categoryOf(option.example);
            },
        });
        brand = combobox({
            label: TEXT.brand,
            placeholder: TEXT.brandPlaceholder,
            labelClass: look.label,
            options: () => unique(examples
                .filter((example) => !category.input.value.trim() || same(categoryOf(example), category.input.value))
                .map((example) => example.input.brand)).map((value) => ({ value })),
            onSelect: (option) => {
                const match = examples.find((example) => same(example.input.product_name, product.input.value));
                if (match && !same(match.input.brand, option.value)) product.input.value = '';
            },
        });
        category = combobox({
            label: TEXT.category,
            placeholder: TEXT.categoryPlaceholder,
            labelClass: look.label,
            options: () => unique(examples.map(categoryOf)).map((value) => ({ value })),
            onSelect: (option) => {
                const match = examples.find((example) => same(example.input.product_name, product.input.value));
                if (match && !same(categoryOf(match), option.value)) product.input.value = '';
                if (brand.input.value.trim() && !examples.some((example) => same(example.input.brand, brand.input.value) && same(categoryOf(example), option.value))) brand.input.value = '';
            },
        });

        const submit = el('button', look.submit);
        submit.type = 'submit';
        submit.append(icon('search'), document.createTextNode(TEXT.search));
        const message = el('p', `${look.message} hidden`);
        message.setAttribute('role', 'alert');
        form.append(product.wrap, brand.wrap, category.wrap, submit, message);

        const result = el('div', look.result);
        result.setAttribute('aria-live', 'polite');
        const panel = el('div');
        panel.append(form, result);
        // One quiet line: these are stored examples, the live search is in SpecScout.
        const notice = el('p', look.notice, `${TEXT.notLive} ${TEXT.tryLive} `);
        const live = el('a', look.noticeLink, TEXT.clickHere);
        live.href = startUrl;
        notice.append(live, document.createTextNode('.'));
        panel.append(notice);

        let searchRun = 0;

        // Under every answer: the way to the live search, and a way to fold the panel back.
        function withActions(node) {
            const actions = el('div', look.actions);
            const live = el('a', 'inline-flex flex-1 items-center justify-center gap-2 rounded-brand bg-anoraOrange px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-anoraOrangeHover', TEXT.tryLiveButton);
            live.href = startUrl;
            live.append(icon('arrow-right'));
            const close = el('button', look.closeButton);
            close.type = 'button';
            close.append(icon('x'), document.createTextNode(TEXT.close));
            close.addEventListener('click', () => {
                searchRun += 1;
                result.replaceChildren();
                onCollapse();
                product.input.focus({ preventScroll: true });
            });
            actions.append(live, close);
            const wrap = el('div');
            wrap.append(node, actions);
            return wrap;
        }

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const name = product.input.value.trim();
            message.classList.toggle('hidden', Boolean(name));
            if (!name) {
                message.textContent = TEXT.needProduct;
                product.input.focus();
                return;
            }
            const match = examples.find((example) => same(example.input.product_name, name)
                && (!brand.input.value.trim() || same(example.input.brand, brand.input.value))
                && (!category.input.value.trim() || same(categoryOf(example), category.input.value)));

            // A short pause with a spinner, so the search reads as a search.
            const run = ++searchRun;
            const loading = el('div', look.loading);
            loading.setAttribute('role', 'status');
            loading.append(icon('loader-circle', look.spinner), document.createTextNode(TEXT.searching));
            result.replaceChildren(loading);
            submit.disabled = true;
            onExpand();
            setTimeout(() => {
                if (run !== searchRun) return;
                submit.disabled = false;
                if (!match) {
                    const note = el('p', look.note, TEXT.noExample(name));
                    const link = el('a', look.noteLink, TEXT.startFree);
                    link.href = startUrl;
                    note.append(link);
                    result.replaceChildren(withActions(note));
                    return;
                }
                result.replaceChildren(withActions(resultCard(look, match)));
            }, reduceMotion ? 300 : 1200 + Math.round(Math.random() * 600));
        });
        return panel;
    }

    function setUp(host, look, filter, onExpand, onCollapse) {
        const root = host.querySelector('[data-example-root]');
        fetch(host.dataset.src)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((data) => {
                const panel = searchPanel({
                    examples: data.examples.filter(filter),
                    look,
                    startUrl: host.dataset.startUrl,
                    onExpand,
                    onCollapse,
                });
                root.replaceChildren(panel);
            })
            .catch(() => root.replaceChildren(el('p', 'text-sm text-gray-500', TEXT.error)));
    }

    // The dark hero card: while it is grown, the hero grid aligns to the top so the text stays put.
    document.querySelectorAll('[data-example-search]').forEach((host) => {
        const grid = host.dataset.expandGrid && document.getElementById(host.dataset.expandGrid);
        setUp(host, LOOKS.dark, () => true,
            () => grid && grid.classList.replace('items-center', 'items-start'),
            () => grid && grid.classList.replace('items-start', 'items-center'));
    });

    // The light box (Re-commerce page).
    document.querySelectorAll('[data-example-box]').forEach((box) => {
        setUp(box, LOOKS.light, (example) => box.dataset.only !== 'older' || example.older, () => {}, () => {});
    });
})();

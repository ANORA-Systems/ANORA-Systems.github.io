// Example box: a search form over recorded SpecScout results from demo/examples.json,
// without any call to the API. Product name, brand and category are separate fields,
// each a searchable dropdown of the available examples; choosing a product fills in
// its brand and category. Results appear only after "Search".
// Markup: _build/layouts/example-box.html inside an element with data-example-box,
// data-src (the JSON, relative to the page) and data-start-url ("Start free");
// data-only="older" keeps only the examples marked "older" (the Re-commerce page).
// Texts are German or English after <html lang>. Values are shown as returned,
// numbers in the page's number format.
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
            noOptions: 'Keine passenden Beispiele',
            hint: 'Wählen Sie eines der Beispielprodukte und klicken Sie auf „Suchen“.',
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
            placeholder: 'Platzhalterdaten',
            placeholderNote: 'Diese Beispiele sind vorläufige Platzhalter, keine echten Suchergebnisse.',
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
            noOptions: 'No matching examples',
            hint: 'Pick one of the example products and click "Search".',
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
            placeholder: 'Placeholder data',
            placeholderNote: 'These examples are temporary placeholders, not real search results.',
            error: 'The examples could not be loaded just now.',
        },
    }[lang];

    const numberFormat = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 2 });
    const dateFormat = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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

    function icon(box, name) {
        const template = box.querySelector(`template[data-icon="${name}"]`);
        return template ? template.content.firstElementChild.cloneNode(true) : document.createTextNode('');
    }

    // --- searchable dropdown (ARIA combobox with a listbox popup) ----------------------------

    function combobox({ label, placeholder, options, onSelect }) {
        const wrap = el('div', 'relative');
        const inputId = nextId('example-field');
        const listId = nextId('example-options');
        const labelEl = el('label', 'mb-1 block text-sm font-semibold text-anoraBlue', label);
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
            if (!shown.length) {
                list.append(el('li', 'px-3 py-2 text-gray-500', TEXT.noOptions));
            }
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

    function formatValue(value, unit) {
        let text;
        if (typeof value === 'boolean') text = value ? TEXT.yes : TEXT.no;
        else if (typeof value === 'number') text = numberFormat.format(value);
        else if (Array.isArray(value)) text = value.map((part) => (typeof part === 'number' ? numberFormat.format(part) : String(part))).join(' × ');
        else text = String(value);
        return unit ? `${text} ${unit}` : text;
    }

    function confidenceBadge(confidence) {
        const percent = Math.round(confidence * 100);
        const tone = percent >= 85
            ? 'bg-anoraTeal/10 text-teal-800 border-anoraTeal/30'
            : percent >= 60
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-gray-100 text-gray-700 border-gray-200';
        const badge = el('span', `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`, `${percent} %`);
        badge.title = `${TEXT.confidence}: ${percent} %`;
        badge.setAttribute('aria-label', `${TEXT.confidence} ${percent} %`);
        return badge;
    }

    function valueLine(box, specValue) {
        const wrap = el('div', 'py-1');
        const line = el('div', 'flex flex-wrap items-center gap-2');
        line.append(el('span', 'font-semibold text-anoraBlue', formatValue(specValue.value, specValue.unit)), confidenceBadge(specValue.confidence));

        const listId = nextId('example-sources');
        const toggle = el('button', 'inline-flex items-center gap-1 rounded text-xs font-medium text-anoraTeal hover:text-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', listId);
        toggle.append(document.createTextNode(TEXT.sources(specValue.sources.length)));
        const chevron = icon(box, 'chevron-down');
        chevron.classList.add('transition-transform');
        toggle.append(chevron);
        line.append(toggle);

        const list = el('ul', 'hidden mt-1 space-y-1 border-l-2 border-anoraTeal/30 pl-3 text-xs');
        list.id = listId;
        specValue.sources.forEach((url) => {
            const item = el('li');
            const link = el('a', 'inline-flex items-center gap-1 break-all text-gray-600 hover:text-anoraBlue underline decoration-gray-300', url.replace(/^https?:\/\//, ''));
            link.href = url;
            link.target = '_blank';
            link.rel = 'nofollow noopener noreferrer';
            link.append(icon(box, 'external-link'));
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

    function specRow(nameText, content) {
        const row = el('div', 'grid grid-cols-1 gap-1 border-t border-gray-100 py-3 first:border-t-0 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-4');
        row.append(el('div', 'text-sm text-gray-500 sm:pt-1', nameText), content);
        return row;
    }

    function resultsView(box, example) {
        const view = el('div');
        example.response.specs.forEach((spec) => {
            const values = el('div');
            spec.value.forEach((specValue) => values.append(valueLine(box, specValue)));
            view.append(specRow(spec.name, values));
        });
        example.response.not_found.forEach((spec) => {
            const missing = el('div', 'flex flex-wrap items-center gap-2 py-1 text-sm text-gray-500');
            const label = el('span', 'inline-flex items-center gap-1 italic');
            label.append(icon(box, 'circle-slash'), document.createTextNode(TEXT.notFound));
            missing.append(label, el('span', 'text-xs', TEXT.notFoundNote));
            view.append(specRow(spec.name, missing));
        });
        return view;
    }

    function typicalView(example) {
        const view = el('div', 'my-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 sm:p-5');
        const lines = example.typical_listing[lang];
        view.append(el('p', 'font-semibold text-gray-800', lines[0]));
        const list = el('ul', 'mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600');
        lines.slice(1).forEach((line) => list.append(el('li', '', line)));
        view.append(list, el('p', 'mt-4 text-xs text-gray-500', TEXT.typicalNote));
        return view;
    }

    function resultCard(box, example) {
        let showResults = true;
        const card = el('div', 'rounded-xl border border-gray-200 bg-white shadow-sm');
        const head = el('div', 'flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5');
        const inputLine = el('p', 'text-sm text-gray-600');
        inputLine.append(
            el('span', 'font-semibold text-anoraBlue', `${TEXT.input}: `),
            document.createTextNode(`${example.input.product_name} · ${TEXT.brand}: ${example.input.brand} · ${TEXT.category}: ${example.category[lang]}`),
        );
        const toggle = el('div', 'inline-flex self-start rounded-lg bg-gray-100 p-1 text-sm');
        toggle.setAttribute('role', 'group');
        const body = el('div', 'px-4 pb-2 pt-1 sm:px-5');
        const toggleButtons = [[TEXT.typical, false], [TEXT.withSpecScout, true]].map(([label, value]) => {
            const button = el('button', 'rounded-md px-3 py-1.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal', label);
            button.type = 'button';
            button.addEventListener('click', () => { showResults = value; update(); });
            toggle.append(button);
            return [button, value];
        });
        head.append(inputLine, toggle);
        const foot = el('p', 'border-t border-gray-100 px-4 py-3 text-xs text-gray-500 sm:px-5',
            TEXT.recorded(dateFormat.format(new Date(`${example.recorded_at}T12:00:00Z`)), Math.round(example.duration_ms / 1000)));
        card.append(head, body, foot);

        function update() {
            toggleButtons.forEach(([button, value]) => {
                const active = value === showResults;
                button.setAttribute('aria-pressed', String(active));
                button.classList.toggle('bg-white', active);
                button.classList.toggle('shadow-sm', active);
                button.classList.toggle('text-anoraBlue', active);
                button.classList.toggle('text-gray-500', !active);
            });
            body.replaceChildren(showResults ? resultsView(box, example) : typicalView(example));
        }
        update();
        return card;
    }

    // --- the box --------------------------------------------------------------------------------

    function render(box, data) {
        const root = box.querySelector('[data-example-root]');
        const examples = data.examples.filter((example) => box.dataset.only !== 'older' || example.older);
        const categoryOf = (example) => example.category[lang];
        const unique = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

        root.replaceChildren();
        if (data.placeholder) {
            const notice = el('p', 'mb-4 flex flex-wrap items-start gap-x-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900');
            notice.append(el('span', 'font-semibold', `${TEXT.placeholder}:`), document.createTextNode(TEXT.placeholderNote));
            root.append(notice);
        }

        const form = el('form', 'grid grid-cols-1 items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto]');
        form.noValidate = true;
        let product;
        let brand;
        let category;

        product = combobox({
            label: TEXT.product,
            placeholder: TEXT.productPlaceholder,
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
            options: () => unique(examples.map(categoryOf)).map((value) => ({ value })),
            onSelect: (option) => {
                const match = examples.find((example) => same(example.input.product_name, product.input.value));
                if (match && !same(categoryOf(match), option.value)) product.input.value = '';
                if (brand.input.value.trim() && !examples.some((example) => same(example.input.brand, brand.input.value) && same(categoryOf(example), option.value))) brand.input.value = '';
            },
        });

        const submit = el('button', 'inline-flex items-center justify-center gap-2 rounded-brand border border-transparent bg-anoraBlue px-6 py-2.5 font-semibold text-white transition hover:bg-anoraTeal focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal focus-visible:ring-offset-2');
        submit.type = 'submit';
        submit.append(icon(box, 'search'), document.createTextNode(TEXT.search));
        form.append(product.wrap, brand.wrap, category.wrap, submit);

        const result = el('div', 'mt-5');
        result.setAttribute('aria-live', 'polite');
        result.append(el('p', 'text-sm text-gray-500', TEXT.hint));
        root.append(form, result);

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const name = product.input.value.trim();
            if (!name) {
                result.replaceChildren(el('p', 'text-sm font-medium text-red-700', TEXT.needProduct));
                product.input.focus();
                return;
            }
            const match = examples.find((example) => same(example.input.product_name, name)
                && (!brand.input.value.trim() || same(example.input.brand, brand.input.value))
                && (!category.input.value.trim() || same(categoryOf(example), category.input.value)));
            if (!match) {
                const note = el('p', 'rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600', TEXT.noExample(name));
                const link = el('a', 'font-semibold text-anoraTeal hover:underline', TEXT.startFree);
                link.href = box.dataset.startUrl;
                note.append(link);
                result.replaceChildren(note);
                return;
            }
            result.replaceChildren(resultCard(box, match));
        });
    }

    document.querySelectorAll('[data-example-box]').forEach((box) => {
        fetch(box.dataset.src)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((data) => render(box, data))
            .catch(() => {
                box.querySelector('[data-example-root]').replaceChildren(el('p', 'text-sm text-gray-500', TEXT.error));
            });
    });
})();

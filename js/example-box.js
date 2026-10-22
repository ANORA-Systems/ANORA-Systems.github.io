// Example box: shows recorded SpecScout results from demo/examples.json, without
// any call to the API. Markup: _build/layouts/example-box.html inside an element
// with data-example-box and data-src (the JSON, relative to the page);
// data-only="older" keeps only the examples marked "older" (the Re-commerce page).
// Texts are German or English after <html lang>. Values are shown as returned,
// numbers in the page's number format.
(function () {
    'use strict';

    const lang = document.documentElement.lang === 'de' ? 'de' : 'en';
    const TEXT = {
        de: {
            picker: 'Beispielprodukt wählen',
            input: 'Eingabe',
            brand: 'Marke',
            typical: 'Typisches Angebot',
            withSpecScout: 'Mit SpecScout',
            typicalNote: 'So sehen viele Angebote aus: Fließtext, ungenaue Angaben, nichts davon ist filterbar.',
            spec: 'Merkmal',
            value: 'Wert',
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
            picker: 'Choose an example product',
            input: 'Input',
            brand: 'Brand',
            typical: 'Typical listing',
            withSpecScout: 'With SpecScout',
            typicalNote: 'Many listings look like this: running text, vague details, none of it filterable.',
            spec: 'Attribute',
            value: 'Value',
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

        const listId = `example-sources-${++idCounter}`;
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
        const row = el('div', 'grid gap-1 border-t border-gray-100 py-3 first:border-t-0 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4');
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
        const view = el('div', 'rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 sm:p-5');
        const lines = example.typical_listing[lang];
        view.append(el('p', 'font-semibold text-gray-800', lines[0]));
        const list = el('ul', 'mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600');
        lines.slice(1).forEach((line) => list.append(el('li', '', line)));
        view.append(list, el('p', 'mt-4 text-xs text-gray-500', TEXT.typicalNote));
        return view;
    }

    function render(box, data) {
        const root = box.querySelector('[data-example-root]');
        const examples = data.examples.filter((example) => box.dataset.only !== 'older' || example.older);
        let current = examples[0];
        let showResults = true;

        root.replaceChildren();
        if (data.placeholder) {
            const notice = el('p', 'mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900');
            notice.append(el('span', 'font-semibold', `${TEXT.placeholder}:`), document.createTextNode(TEXT.placeholderNote));
            root.append(notice);
        }

        const picker = el('div', 'flex flex-wrap gap-2');
        picker.setAttribute('role', 'group');
        picker.setAttribute('aria-label', TEXT.picker);
        const chips = examples.map((example) => {
            const chip = el('button', 'rounded-full border px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal');
            chip.type = 'button';
            chip.append(el('span', 'font-medium', `${example.input.brand} ${example.input.product_name}`), el('span', 'ml-1.5 text-xs opacity-70', example.category[lang]));
            chip.addEventListener('click', () => { current = example; update(); });
            picker.append(chip);
            return chip;
        });

        const card = el('div', 'mt-5 rounded-xl border border-gray-200 bg-white shadow-sm');
        const head = el('div', 'flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5');
        const inputLine = el('p', 'text-sm text-gray-600');
        const toggle = el('div', 'inline-flex self-start rounded-lg bg-gray-100 p-1 text-sm');
        toggle.setAttribute('role', 'group');
        const toggleButtons = [[TEXT.typical, false], [TEXT.withSpecScout, true]].map(([label, value]) => {
            const button = el('button', 'rounded-md px-3 py-1.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-anoraTeal', label);
            button.type = 'button';
            button.addEventListener('click', () => { showResults = value; update(); });
            toggle.append(button);
            return [button, value];
        });
        head.append(inputLine, toggle);
        const body = el('div', 'px-4 pb-2 pt-1 sm:px-5');
        const foot = el('p', 'border-t border-gray-100 px-4 py-3 text-xs text-gray-500 sm:px-5');
        card.append(head, body, foot);
        root.append(picker, card);

        function update() {
            chips.forEach((chip, index) => {
                const active = examples[index] === current;
                chip.setAttribute('aria-pressed', String(active));
                chip.classList.toggle('bg-anoraBlue', active);
                chip.classList.toggle('text-white', active);
                chip.classList.toggle('border-anoraBlue', active);
                chip.classList.toggle('bg-white', !active);
                chip.classList.toggle('text-anoraBlue', !active);
                chip.classList.toggle('border-gray-200', !active);
                chip.classList.toggle('hover:border-anoraTeal', !active);
            });
            toggleButtons.forEach(([button, value]) => {
                const active = value === showResults;
                button.setAttribute('aria-pressed', String(active));
                button.classList.toggle('bg-white', active);
                button.classList.toggle('shadow-sm', active);
                button.classList.toggle('text-anoraBlue', active);
                button.classList.toggle('text-gray-500', !active);
            });
            inputLine.replaceChildren(
                el('span', 'font-semibold text-anoraBlue', `${TEXT.input}: `),
                document.createTextNode(`${current.input.product_name} · ${TEXT.brand}: ${current.input.brand}`),
            );
            body.replaceChildren(showResults ? resultsView(box, current) : typicalView(current));
            if (!showResults) body.firstChild.classList.add('my-4');
            foot.textContent = TEXT.recorded(dateFormat.format(new Date(`${current.recorded_at}T12:00:00Z`)), Math.round(current.duration_ms / 1000));
        }
        update();
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

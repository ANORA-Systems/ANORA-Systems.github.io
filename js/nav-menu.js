// Mobile menu of the full nav (_build/layouts/nav-full.html): the button opens and
// closes it and swaps its icon; a click on one of its links closes it again.
(function () {
    'use strict';

    const button = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (!button || !menu) return;
    const icon = button.querySelector('i');

    function setOpen(open) {
        menu.classList.toggle('hidden', !open);
        icon.classList.toggle('fa-bars', !open);
        icon.classList.toggle('fa-xmark', open);
    }

    button.addEventListener('click', () => setOpen(menu.classList.contains('hidden')));
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
})();

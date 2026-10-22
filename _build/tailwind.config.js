// Tailwind CSS 3.4.17, compiled by the standalone CLI in _build/build.py.
// Until October 2026 every page carried this config inline for the Tailwind play script;
// these are those configs merged. Paths are relative to the repo root (the build runs there).
module.exports = {
    content: [
        './*.html',
        './en/*.html',
        './js/**/*.js',
        './_build/layouts/*.html',
        './_build/*.py',
    ],
    theme: {
        extend: {
            colors: {
                anoraBlue: '#0B1E3D',   // navy of the logo
                anoraTeal: '#00A99D',   // teal of the swoosh
                anoraOrange: '#F7941D', // orange of the dots and primary buttons
                lightGray: '#F3F4F6',
                codeBg: '#1e293b',      // code blocks on the API documentation
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                outfit: ['"Outfit"', 'sans-serif'],
                mono: ['Fira Code', 'monospace'],
            },
        },
    },
};

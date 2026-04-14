# PageSnip

PageSnip is a lightweight desktop PDF splitter with an optional compression mode, built for Windows, macOS, and Linux.

## Features

- Insert a PDF by drag-and-drop, file picker, or clipboard path paste
- Choose export pages with flexible ranges like `1-3, 6, 9-12`
- Generate a split PDF from the selected pages
- Optionally compress output for easier sharing on lower-end hardware
- Modern desktop GUI with native file dialogs

## Stack

- Electron for the desktop shell and installers
- Vite for a fast front-end build
- `pdf-lib` for page extraction
- `pdf.js` for optional rasterized compression output

## Development

```bash
npm install
npm start
```

## Production Builds

```bash
npm run build
```

Installer output is generated in `dist-installers/`.

Platform notes:

- Windows: NSIS installer
- macOS: DMG
- Linux: AppImage and `.deb`

`electron-builder` creates installers for the current platform. To produce all three platform installers, build on each target OS or use platform-specific CI runners.

## Compression Notes

`Original quality` preserves vector text and original PDF fidelity.

`Balanced compression` and `Compact compression` re-render selected pages as JPEG-backed PDF pages to reduce size. This is effective for sharing, but searchable text and some vector sharpness may be reduced.

## Author

Vashaar Sarmad

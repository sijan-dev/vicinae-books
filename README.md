# Books

A Vicinae extension for displaying the docuents and books as a cover grid
and opens the selected book in the appropriate reader.

## Requirements

- Books stored in local system as EPUB (`.epub`, `.mobi`, `.azw3`) or
  PDF/`.djvu` files.
- [Foliate](https://github.com/johnfactotum/foliate) installed for EPUBs.
- [Papers](https://apps.gnome.org/Papers/) (or `papers` on PATH) for PDFs.
- `pdftoppm` (poppler-utils) and `unzip` for generating book covers.

## Usage

Run the **Books** command to browse your library. Each book shows its cover and
title. Selecting a book opens it in its reader and closes the panel:

- **EPUB / MOBI / AZW3** open in Foliate.
- **PDF / DjVu** open in Papers.

Use the grid search bar to filter by title.

### Actions

- **Open** – open the book in its reader.
- **Set Cover…** – pick an image file to use as the book's cover.
- **Reset Cover** – remove a custom cover and fall back to the generated one.
- **Reveal** – reveal the file in the file manager.
- **Copy Path** – copy the book's absolute path.
- **Refresh Covers** – clear the cached covers and regenerate them.

Covers are generated on first load and cached under the extension's support
directory.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Checks:

```bash
npm run typecheck
npm run lint
```

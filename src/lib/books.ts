import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';

export type BookFormat = 'epub' | 'pdf';

export type Book = {
  /** Stable identifier derived from the book's absolute path. */
  id: string;
  /** Human readable title, prettified from the file name. */
  name: string;
  /** Absolute path to the book file. */
  path: string;
  format: BookFormat;
};

const BOOK_DIR = join(homedir(), 'Documents', 'Books');

const FORMAT_BY_EXTENSION: Record<string, BookFormat> = {
  '.epub': 'epub',
  '.mobi': 'epub',
  '.azw3': 'epub',
  '.pdf': 'pdf',
  '.djvu': 'pdf',
};

/**
 * Scans the book directory and returns the supported books it contains.
 * Non-book files (fonts, metadata, etc.) are ignored. The folder is not
 * required to exist; an empty list is returned when it is missing.
 */
export function listBooks(): Book[] {
  if (!existsSync(BOOK_DIR)) {
    return [];
  }

  const books: Book[] = [];

  for (const entry of readdirSync(BOOK_DIR)) {
    const fullPath = join(BOOK_DIR, entry);
    if (!statSync(fullPath).isFile()) {
      continue;
    }
    const format = FORMAT_BY_EXTENSION[extname(entry).toLowerCase()];
    if (format === undefined) {
      continue;
    }
    books.push({
      id: fullPath,
      name: prettifyName(entry),
      path: fullPath,
      format,
    });
  }

  return books.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Converts a file name into a readable title by dropping the extension and
 * replacing separators with spaces.
 */
function prettifyName(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/u, '');
  return name.replace(/[_-]+/gu, ' ').trim();
}

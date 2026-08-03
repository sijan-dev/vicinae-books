import { execFile } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { environment, LocalStorage } from '@vicinae/api';
import type { Book } from './books';

const execFileAsync = promisify(execFile);

const COVER_DIR = join(environment.supportPath, 'covers');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function overrideKey(book: Book): string {
  return `custom-cover:${book.id}`;
}

type Cover = {
  /** Absolute path to the cached cover image, or `undefined` when none. */
  cover: string | undefined;
};

/**
 * Returns the cached cover for a book, generating it on first use.
 * Covers are stored under the extension's support directory.
 */
export async function getCover(book: Book): Promise<Cover> {
  mkdirSync(COVER_DIR, { recursive: true });

  const custom = await getCustomCover(book);
  if (custom) {
    return { cover: custom };
  }

  const cachePath = await coverCachePath(book);
  if (!cachePath) {
    return { cover: undefined };
  }

  if (fileExists(cachePath)) {
    return { cover: cachePath };
  }

  await generateCover(book, cachePath).catch(() => undefined);
  return fileExists(cachePath) ? { cover: cachePath } : { cover: undefined };
}

/**
 * Copies a user chosen image into the cover cache as the book's cover.
 * The file's image extension is preserved so the reader renders it.
 */
export async function setCustomCover(
  book: Book,
  sourcePath: string
): Promise<void> {
  const imageExt = extname(sourcePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(imageExt)) {
    throw new Error('Please choose an image file (PNG, JPEG or WebP).');
  }
  if (!fileExists(sourcePath)) {
    throw new Error('The selected image could not be found.');
  }

  mkdirSync(COVER_DIR, { recursive: true });
  const target = join(COVER_DIR, `${sanitize(basename(book.path))}${imageExt}`);
  copyFileSync(sourcePath, target);
  await LocalStorage.setItem(overrideKey(book), target);
}

/**
 * Removes a custom cover so the auto-generated cover (or placeholder) is
 * used again.
 */
export async function resetCover(book: Book): Promise<void> {
  const stored = await LocalStorage.getItem<string>(overrideKey(book));
  if (!stored) {
    return;
  }
  await LocalStorage.removeItem(overrideKey(book));
  try {
    unlinkSync(stored);
  } catch {
    // The cached file may no longer exist; that is fine.
  }
}

async function getCustomCover(book: Book): Promise<string | undefined> {
  const stored = await LocalStorage.getItem<string>(overrideKey(book));
  return stored && fileExists(stored) ? stored : undefined;
}

/**
 * Resolves the file the cover thumbnail should be stored at. PDF covers are
 * rendered as PNG; EPUB covers keep the extension of the embedded image.
 */
async function coverCachePath(book: Book): Promise<string | undefined> {
  const base = sanitize(basename(book.path));
  const ext = extname(book.path).toLowerCase();

  if (ext === '.pdf' || ext === '.djvu') {
    return join(COVER_DIR, `${base}.png`);
  }

  const coverEntry = await findEpubCover(book.path);
  if (!coverEntry) {
    return undefined;
  }
  const coverExt = extname(coverEntry).toLowerCase() || '.jpg';
  return join(COVER_DIR, `${base}${coverExt}`);
}

/**
 * Removes all cached covers so they are regenerated on the next load.
 */
export async function clearCoverCache(): Promise<void> {
  const { unlink, readdir } = await import('node:fs/promises');
  const files = await readdir(COVER_DIR).catch(() => []);
  await Promise.all(
    files.map((file) => unlink(join(COVER_DIR, file)).catch(() => undefined))
  );
}

async function generateCover(book: Book, cachePath: string): Promise<void> {
  const ext = extname(book.path).toLowerCase();

  if (ext === '.pdf' || ext === '.djvu') {
    await renderPdfCover(book.path, cachePath);
    return;
  }

  const coverEntry = await findEpubCover(book.path);
  if (coverEntry) {
    await extractEpubCover(book.path, coverEntry, cachePath);
  }
}

async function renderPdfCover(
  pdfPath: string,
  cachePath: string
): Promise<void> {
  const base = cachePath.replace(/\.png$/u, '');
  await execFileAsync('pdftoppm', [
    '-png',
    '-singlefile',
    '-r',
    '72',
    '-f',
    '1',
    '-l',
    '1',
    pdfPath,
    base,
  ]);
}

async function findEpubCover(epubPath: string): Promise<string | undefined> {
  const containerXml = await unzipEntry(epubPath, 'META-INF/container.xml');
  if (!containerXml) {
    return undefined;
  }

  const opfPath = rootfilePath(containerXml);
  if (!opfPath) {
    return undefined;
  }

  const opfXml = await unzipEntry(epubPath, opfPath);
  if (!opfXml) {
    return undefined;
  }

  const coverId = coverIdFromOpf(opfXml);
  const href = coverHref(opfXml, coverId);
  if (!href) {
    return undefined;
  }

  return joinPath(opfPath, href);
}

function coverIdFromOpf(opfXml: string): string | undefined {
  const meta = opfXml.match(
    /<meta\s+[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/u
  );
  if (meta) {
    return meta[1];
  }

  const propertiesItem = coverImageItem(opfXml);
  if (propertiesItem) {
    const id = propertiesItem.match(/id=["']([^"']+)["']/u);
    if (id) {
      return id[1];
    }
  }

  return undefined;
}

function coverHref(
  opfXml: string,
  coverId: string | undefined
): string | undefined {
  if (!coverId) {
    return undefined;
  }

  for (const item of opfXml.matchAll(/<item\s+([^>]*)>/gu)) {
    const attrs = item[1];
    if (!new RegExp(`id=["']${escapeRegExp(coverId)}["']`, 'u').test(attrs)) {
      continue;
    }
    const href = attrs.match(/href=["']([^"']+)["']/u);
    if (href) {
      return href[1];
    }
  }

  return undefined;
}

function coverImageItem(opfXml: string): string | undefined {
  const match = opfXml.match(
    /<item\s+[^>]*properties=["'][^"']*cover-image[^"']*["'][^>]*>/u
  );
  return match ? match[0] : undefined;
}

function rootfilePath(containerXml: string): string | undefined {
  const match = containerXml.match(
    /rootfile\s+[^>]*full-path=["']([^"']+)["']/u
  );
  return match ? match[1] : undefined;
}

async function extractEpubCover(
  epubPath: string,
  entry: string,
  cachePath: string
): Promise<void> {
  const { stdout } = await execFileAsync('unzip', ['-p', epubPath, entry]);
  writeFileSync(cachePath, stdout);
}

async function unzipEntry(
  epubPath: string,
  entry: string
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('unzip', ['-p', epubPath, entry]);
    return stdout;
  } catch {
    return undefined;
  }
}

function joinPath(opfPath: string, href: string): string {
  const base = opfPath.split('/').slice(0, -1).join('/');
  const raw = base ? `${base}/${href}` : href;
  const parts: string[] = [];
  for (const segment of raw.split('/')) {
    if (segment === '..') {
      parts.pop();
    } else if (segment !== '.') {
      parts.push(segment);
    }
  }
  return parts.join('/');
}

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, '_');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

import { spawn } from 'node:child_process';
import { closeMainWindow } from '@vicinae/api';
import type { Book } from './books';

/**
 * Opens a book in the reader that matches its format:
 * - EPUB and related formats open in Foliate.
 * - PDF and DjVu open in Papers.
 *
 * The Vicinae window is closed so the reader runs full-screen.
 */
export async function openBook(book: Book): Promise<void> {
  await openReader(book);
  await closeMainWindow();
}

async function openReader(book: Book): Promise<void> {
  const { binary, label } = readerFor(book.format);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, [book.path], {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', () => {
      reject(new Error(`${label} is required to open this book.`));
    });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function readerFor(format: Book['format']): { binary: string; label: string } {
  if (format === 'pdf') {
    return { binary: 'papers', label: 'Papers' };
  }
  return { binary: 'foliate', label: 'Foliate' };
}

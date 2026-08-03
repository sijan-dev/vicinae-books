import {
  Action,
  ActionPanel,
  Form,
  Grid,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from '@vicinae/api';
import { useCallback, useEffect, useState } from 'react';
import { type Book, listBooks } from './lib/books';
import {
  clearCoverCache,
  getCover,
  resetCover,
  setCustomCover,
} from './lib/covers';
import { openBook } from './lib/open';

type BookCard = {
  book: Book;
  cover: string | undefined;
};

export default function Command() {
  const [cards, setCards] = useState<BookCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const books = listBooks();
    const loaded = await Promise.all(
      books.map(async (book) => ({ book, cover: (await getCover(book)).cover }))
    );
    setCards(loaded);
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    await load();
    setIsLoading(false);
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refreshCovers = async () => {
    try {
      await clearCoverCache();
      await reload();
      await showToast({
        style: Toast.Style.Success,
        title: 'Covers refreshed',
      });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: 'Failed to refresh covers',
        message: String(error),
      });
    }
  };

  const open = async (book: Book) => {
    try {
      await openBook(book);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: 'Failed to open book',
        message: String(error),
      });
    }
  };

  const unsetCover = async (book: Book) => {
    try {
      await resetCover(book);
      await reload();
      await showToast({ style: Toast.Style.Success, title: 'Cover reset' });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: 'Could not reset cover',
        message: String(error),
      });
    }
  };

  return (
    <Grid
      isLoading={isLoading}
      columns={4}
      fit={Grid.Fit.Contain}
      aspectRatio="2/3"
      searchBarPlaceholder="Search books..."
      navigationTitle="Books"
    >
      <Grid.EmptyView
        icon={Icon.Book}
        title="No books found"
        description="Add EPUB or PDF files to ~/Documents/Books and try again."
      />
      {cards.map(({ book, cover }) => (
        <Grid.Item
          key={book.id}
          title={book.name}
          subtitle={cover ? format(book) : `${format(book)} · no cover`}
          content={
            cover
              ? { source: cover }
              : {
                  value: Icon.BlankDocument,
                  tooltip: book.name,
                }
          }
          actions={
            <ActionPanel>
              <Action
                title="Open"
                icon={Icon.Book}
                onAction={() => void open(book)}
              />
              <Action.Push
                title="Set Cover…"
                icon={Icon.Image}
                target={<SetCoverForm book={book} onDone={reload} />}
              />
              <Action
                title="Reset Cover"
                icon={Icon.ArrowCounterClockwise}
                onAction={() => void unsetCover(book)}
              />
              <Action.ShowInFinder path={book.path} />
              <Action.CopyToClipboard title="Copy Path" content={book.path} />
              <Action
                title="Refresh Covers"
                icon={Icon.ArrowClockwise}
                onAction={() => void refreshCovers()}
              />
            </ActionPanel>
          }
        />
      ))}
    </Grid>
  );
}

function SetCoverForm({ book, onDone }: { book: Book; onDone: () => void }) {
  const { pop } = useNavigation();
  const [files, setFiles] = useState<string[]>([]);

  const apply = async () => {
    try {
      if (files.length === 0) {
        throw new Error('Select an image first.');
      }
      await setCustomCover(book, files[0]);
      onDone();
      pop();
      await showToast({ style: Toast.Style.Success, title: 'Cover updated' });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: 'Could not set cover',
        message: String(error),
      });
    }
  };

  return (
    <Form
      navigationTitle="Set Cover"
      actions={
        <ActionPanel>
          <Action title="Set Cover" onAction={() => void apply()} />
        </ActionPanel>
      }
    >
      <Form.Description
        text={`Pick a cover image for “${book.name}”. The image is copied into the extension so moving it later does not matter.`}
      />
      <Form.FilePicker
        id="cover"
        title="Cover Image"
        canChooseFiles
        canChooseDirectories={false}
        value={files}
        onChange={setFiles}
      />
    </Form>
  );
}

const format = (book: Book) => (book.format === 'pdf' ? 'PDF' : 'eBook');

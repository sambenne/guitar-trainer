import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { UserChord, UserPattern, UserSong } from '../types/models';

interface GuitarDB extends DBSchema {
  songs: { key: string; value: UserSong };
  chords: { key: string; value: UserChord };
  patterns: { key: string; value: UserPattern };
}

export type StoreName = 'songs' | 'chords' | 'patterns';

let dbPromise: Promise<IDBPDatabase<GuitarDB>> | null = null;

function db(): Promise<IDBPDatabase<GuitarDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GuitarDB>('guitar-trainer', 1, {
      upgrade(database) {
        database.createObjectStore('songs', { keyPath: 'id' });
        database.createObjectStore('chords', { keyPath: 'id' });
        database.createObjectStore('patterns', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function getAll<T extends StoreName>(store: T): Promise<GuitarDB[T]['value'][]> {
  return (await db()).getAll(store);
}

export async function getOne<T extends StoreName>(store: T, id: string): Promise<GuitarDB[T]['value'] | undefined> {
  return (await db()).get(store, id);
}

export async function put<T extends StoreName>(store: T, value: GuitarDB[T]['value']): Promise<void> {
  await (await db()).put(store, value);
}

export async function remove(store: StoreName, id: string): Promise<void> {
  await (await db()).delete(store, id);
}

export async function clearAll(): Promise<void> {
  const database = await db();
  const tx = database.transaction(['songs', 'chords', 'patterns'], 'readwrite');
  await Promise.all([
    tx.objectStore('songs').clear(),
    tx.objectStore('chords').clear(),
    tx.objectStore('patterns').clear(),
    tx.done,
  ]);
}

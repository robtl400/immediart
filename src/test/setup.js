import { IDBFactory } from 'fake-indexeddb';

// Provide a fresh fake IndexedDB to the jsdom environment
globalThis.indexedDB = new IDBFactory();

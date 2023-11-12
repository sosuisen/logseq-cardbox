import Dexie, { Table } from 'dexie';

export interface Box {
  name: string; // originalName in Logseq db
  uuid: string; // uuid in Logseq db  
  time: number; // Unix time
  summary: string[];
  image: string;
}

export class CardBoxDexie extends Dexie {
  box!: Table<Box>; 

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      box: '&name, time' // name is the primary key and followings are indexed props
    });
  }
}

export let db: CardBoxDexie;

export const setDB = (dbName: string) => {
  if (db) {
    db.close();
  }  
  db = new CardBoxDexie(dbName);
};

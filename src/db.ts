import Dexie, { Table } from 'dexie';

export interface Box {
  graph: string; // graph name in Logseq db
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
      box: '[graph+name], graph, time' // [graph+name] is the compound primary key, and time is an indexed property.
    });
  }
}

export const db = new CardBoxDexie('logseq-cardbox-plugin');

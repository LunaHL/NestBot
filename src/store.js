import fs from 'node:fs';

const DB_PATH = './db.json';
function loadDB() { try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch { return { guilds: {} }; } }
function saveDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

export const DB = loadDB();

export function gstore(gid) {
  if (!DB.guilds[gid]) DB.guilds[gid] = {
    config: {
      wordle: { date: null, answer: null, bonus: 5, solvedBy: [] },
      shop: { items: [] } // items: [{id,name,price,priceCurrency,type,meta}]
    },
    users: {}
  };
  return DB.guilds[gid];
}
export function ustore(gid, uid) {
  const g = gstore(gid);
  if (!g.users[uid]) {
    g.users[uid] = {
      coins: 0,
      paws: 0,
      pain: 0,
      lastDaily: 0,
      inventory: []   // <--- add this
    };
  } else if (!Array.isArray(g.users[uid].inventory)) {
    g.users[uid].inventory = [];   // <--- fix old users
  }
  return g.users[uid];
}

export function add(gid, uid, field, amt) {
  const u = ustore(gid, uid);
  u[field] = Math.max(0, (u[field] || 0) + amt);
  saveDB(DB); return u[field];
}
export function pushInventory(gid, uid, item) {
  const u = ustore(gid, uid);
  u.inventory.push(item);
  saveDB(DB);
  return item;
}
export function popInventory(gid, uid, itemId) {
  const u = ustore(gid, uid);
  const idx = u.inventory.findIndex(it => it.id === itemId);
  if (idx === -1) return null;
  const [item] = u.inventory.splice(idx, 1);
  saveDB(DB);
  return item;
}
export function save() { saveDB(DB); }

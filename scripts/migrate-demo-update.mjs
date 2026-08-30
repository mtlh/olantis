import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

const existingAccs = await sql`SELECT id, name FROM accounts WHERE user_id='demo'`;
console.log("existing accounts", existingAccs);
const existingPorts = await sql`SELECT id, name, account_id FROM portfolios WHERE user_id='demo'`;
console.log("existing portfolios", existingPorts);

let accISA, accFun;

// Create ISA account if missing
let isaAcc = existingAccs.find(a=>a.name==='ISA');
if (!isaAcc) {
  const id = crypto.randomUUID();
  await sql`INSERT INTO accounts (id, user_id, name, created_at) VALUES (${id}, 'demo', 'ISA', ${Math.floor(Date.now()/1000)})`;
  accISA = id;
  console.log("created ISA account", id);
} else accISA = isaAcc.id;

let funAcc = existingAccs.find(a=>a.name==='For Fun');
if (!funAcc) {
  const id = crypto.randomUUID();
  await sql`INSERT INTO accounts (id, user_id, name, created_at) VALUES (${id}, 'demo', 'For Fun', ${Math.floor(Date.now()/1000)})`;
  accFun = id;
  console.log("created For Fun account", id);
} else accFun = funAcc.id;

// Handle portfolios
let isaPort = existingPorts.find(p=>p.name==='ISA');
if (isaPort) {
  await sql`UPDATE portfolios SET name='Global Tracker', account_id=${accISA} WHERE id=${isaPort.id}`;
  console.log("renamed ISA -> Global Tracker, moved to ISA account");
} else {
  // check if Global Tracker already exists
  let gt = existingPorts.find(p=>p.name==='Global Tracker');
  if (!gt) {
    const id = crypto.randomUUID();
    await sql`INSERT INTO portfolios (id, user_id, account_id, name, type, created_at) VALUES (${id}, 'demo', ${accISA}, 'Global Tracker', 'live', ${Math.floor(Date.now()/1000)})`;
    // add holdings
    await sql`INSERT INTO holdings (id, portfolio_id, symbol, name, shares, avg_price, current_price, currency, purchase_date, exchange) VALUES (${crypto.randomUUID()}, ${id}, 'VWRP', 'Vanguard FTSE All-World', 120, 98, 106.4, 'GBP', '2024-01-15', 'LSE')`;
    await sql`INSERT INTO holdings (id, portfolio_id, symbol, name, shares, avg_price, current_price, currency, purchase_date, exchange) VALUES (${crypto.randomUUID()}, ${id}, 'AAPL', 'Apple Inc', 15, 145, 178, 'USD', '2024-03-10', 'NASDAQ')`;
    await sql`INSERT INTO holdings (id, portfolio_id, symbol, name, shares, avg_price, current_price, currency, purchase_date, exchange) VALUES (${crypto.randomUUID()}, ${id}, 'NVDA', 'NVIDIA', 8, 420, 485, 'USD', '2024-05-20', 'NASDAQ')`;
    console.log("created Global Tracker portfolio", id);
  } else {
    await sql`UPDATE portfolios SET account_id=${accISA} WHERE id=${gt.id}`;
    console.log("ensured Global Tracker in ISA account");
  }
}

let sippPort = existingPorts.find(p=>p.name==='SIPP');
if (sippPort) {
  await sql`UPDATE portfolios SET account_id=${accFun} WHERE id=${sippPort.id}`;
  console.log("moved SIPP to For Fun account");
} else {
  // check if SIPP exists already under For Fun
  let sipp2 = existingPorts.find(p=>p.name==='SIPP');
  if (!sipp2) {
    const id = crypto.randomUUID();
    await sql`INSERT INTO portfolios (id, user_id, account_id, name, type, created_at) VALUES (${id}, 'demo', ${accFun}, 'SIPP', 'live', ${Math.floor(Date.now()/1000)})`;
    await sql`INSERT INTO holdings (id, portfolio_id, symbol, name, shares, avg_price, current_price, currency, purchase_date, exchange) VALUES (${crypto.randomUUID()}, ${id}, 'VUAG', 'Vanguard S&P 500', 200, 68, 74.2, 'GBP', '2023-11-01', 'LSE')`;
    console.log("created SIPP portfolio in For Fun", id);
  }
}

// Create Retirement portfolio under For Fun if missing
let retPort = existingPorts.find(p=>p.name==='Retirement');
if (!retPort) {
  const id = crypto.randomUUID();
  await sql`INSERT INTO portfolios (id, user_id, account_id, name, type, created_at) VALUES (${id}, 'demo', ${accFun}, 'Retirement', 'live', ${Math.floor(Date.now()/1000)})`;
  await sql`INSERT INTO holdings (id, portfolio_id, symbol, name, shares, avg_price, current_price, currency, purchase_date, exchange) VALUES (${crypto.randomUUID()}, ${id}, 'VWCE', 'Vanguard FTSE All-World Acc', 85, 95, 102.3, 'GBP', '2024-02-10', 'LSE')`;
  console.log("created Retirement portfolio in For Fun", id);
} else {
  await sql`UPDATE portfolios SET account_id=${accFun} WHERE id=${retPort.id}`;
  console.log("ensured Retirement in For Fun");
}

// Clean up old InvestEngine account if exists
const oldAcc = existingAccs.find(a=>a.name==='InvestEngine');
if (oldAcc) {
  await sql`DELETE FROM accounts WHERE id=${oldAcc.id}`;
  console.log("removed old InvestEngine account");
}

const finalAccs = await sql`SELECT id, name FROM accounts WHERE user_id='demo'`;
const finalPorts = await sql`SELECT id, name, account_id FROM portfolios WHERE user_id='demo'`;
console.log("final accounts", finalAccs);
console.log("final portfolios", finalPorts);
const holdings = await sql`SELECT portfolio_id, symbol FROM holdings`;
console.log("holdings count", holdings.length);

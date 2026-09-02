/**
 * Aurora FC 2.0 — Dividend Receipt Reconciliation
 * =================================================
 * Standalone, lightweight reconciliation layer for AuroraData 2 — Consolidated.
 *
 * Purpose
 * -------
 * Reads BrokerCashLedger and updates matching rows in Dividends when a broker
 * dividend is received or reinvested.
 *
 * Supported broker ledger types:
 *   DIVIDEND_CASH
 *   DIVIDEND_REINVESTED
 *
 * Dividends updates:
 *   received_gbp       = 1
 *   actual_amount_gbp  = broker-confirmed amount
 *   status             = PAID
 *   updated_at         = current timestamp
 *
 * expected_amount_gbp is NEVER overwritten.
 *
 * Matching rule:
 *   account + ticker + pay date within +/- 7 days
 *
 * Multiple broker ledger entries for the same dividend are summed, so split
 * payments such as £4.99 + £3.29 correctly become £8.28 actual received.
 *
 * This file does NOT define doGet/doPost and does NOT touch the web deployment.
 */

const A2_DIV_RECEIPT_SPREADSHEET_ID = '1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA';
const A2_DIV_RECEIPT_DIVIDENDS_SHEET = 'Dividends';
const A2_DIV_RECEIPT_LEDGER_SHEET = 'BrokerCashLedger';
const A2_DIV_RECEIPT_HANDLER = 'runDividendReceiptReconciliation';
const A2_DIV_RECEIPT_MATCH_DAYS = 7;
const A2_DIV_RECEIPT_LAST_RUN = 'A2_DIVIDEND_RECEIPT_LAST_RUN';
const A2_DIV_RECEIPT_LAST_SUMMARY = 'A2_DIVIDEND_RECEIPT_LAST_SUMMARY';

/**
 * Run this ONCE after adding this file to Apps Script.
 * It installs a 15-minute trigger and immediately performs a safe backfill.
 */
function installDividendReceiptReconciliation() {
  removeDividendReceiptReconciliationTrigger_();

  ScriptApp.newTrigger(A2_DIV_RECEIPT_HANDLER)
    .timeBased()
    .everyMinutes(15)
    .create();

  const backfill = runDividendReceiptReconciliation();

  return {
    ok: true,
    installed: true,
    handler: A2_DIV_RECEIPT_HANDLER,
    schedule: 'Every 15 minutes',
    backfill: backfill
  };
}

/**
 * Public trigger/manual entry point.
 */
function runDividendReceiptReconciliation() {
  const lock = LockService.getScriptLock();

  // Keep this short. If another Aurora write is active, skip rather than spin.
  if (!lock.tryLock(5000)) {
    return {
      ok: false,
      skipped: true,
      reason: 'Another Aurora backend write currently holds the script lock.',
      at: new Date().toISOString()
    };
  }

  try {
    const result = reconcileDividendReceiptsCore_();

    const props = PropertiesService.getScriptProperties();
    props.setProperty(A2_DIV_RECEIPT_LAST_RUN, result.finishedAt || '');
    props.setProperty(A2_DIV_RECEIPT_LAST_SUMMARY, JSON.stringify(result));

    SpreadsheetApp.flush();
    console.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Safe status helper. Does not run reconciliation.
 */
function dividendReceiptReconciliationStatus() {
  const triggers = ScriptApp.getProjectTriggers();
  const installed = triggers.some(function(t) {
    return t.getHandlerFunction() === A2_DIV_RECEIPT_HANDLER;
  });

  const props = PropertiesService.getScriptProperties();
  let lastSummary = {};

  try {
    lastSummary = JSON.parse(props.getProperty(A2_DIV_RECEIPT_LAST_SUMMARY) || '{}');
  } catch (_) {
    lastSummary = {};
  }

  return {
    ok: true,
    installed: installed,
    schedule: installed ? 'Every 15 minutes' : 'NOT_INSTALLED',
    lastRunAt: props.getProperty(A2_DIV_RECEIPT_LAST_RUN) || '',
    lastSummary: lastSummary
  };
}

/**
 * Optional uninstall helper.
 */
function removeDividendReceiptReconciliation() {
  const removed = removeDividendReceiptReconciliationTrigger_();
  return { ok: true, removed: removed };
}

function removeDividendReceiptReconciliationTrigger_() {
  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === A2_DIV_RECEIPT_HANDLER) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });

  return removed;
}

function reconcileDividendReceiptsCore_() {
  const started = new Date();
  const ss = SpreadsheetApp.openById(A2_DIV_RECEIPT_SPREADSHEET_ID);
  const dividendsSheet = ss.getSheetByName(A2_DIV_RECEIPT_DIVIDENDS_SHEET);
  const ledgerSheet = ss.getSheetByName(A2_DIV_RECEIPT_LEDGER_SHEET);

  if (!dividendsSheet) {
    throw new Error('Dividends sheet not found.');
  }

  if (!ledgerSheet) {
    throw new Error('BrokerCashLedger sheet not found.');
  }

  const dividendValues = dividendsSheet.getDataRange().getValues();
  const ledgerValues = ledgerSheet.getDataRange().getValues();

  const result = {
    ok: true,
    startedAt: started.toISOString(),
    ledgerDividendEntries: 0,
    dividendRowsChecked: 0,
    matchedRows: 0,
    updatedRows: 0,
    alreadyCorrect: 0,
    unmatchedLedgerEntries: [],
    updates: []
  };

  if (dividendValues.length < 2 || ledgerValues.length < 2) {
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const d = headerMap_(dividendValues[0]);
  const l = headerMap_(ledgerValues[0]);

  requireHeaders_(d, [
    'dividend_id',
    'account',
    'ticker',
    'pay_date',
    'received_gbp',
    'status',
    'updated_at',
    'expected_amount_gbp',
    'actual_amount_gbp',
    'notes'
  ], 'Dividends');

  requireHeaders_(l, [
    'entry_id',
    'recorded_at',
    'account',
    'type',
    'ticker',
    'gross_gbp',
    'reference'
  ], 'BrokerCashLedger');

  const ledgerEntries = [];

  for (let i = 1; i < ledgerValues.length; i++) {
    const row = ledgerValues[i];
    const type = text_(row[l.type]).toUpperCase();

    if (type !== 'DIVIDEND_CASH' && type !== 'DIVIDEND_REINVESTED') {
      continue;
    }

    const account = account_(row[l.account]);
    const ticker = ticker_(row[l.ticker]);
    const amount = number_(row[l.gross_gbp]);
    const date = dateOnly_(row[l.recorded_at]);

    if (!account || !ticker || !(amount > 0) || !date) {
      continue;
    }

    ledgerEntries.push({
      sheetRow: i + 1,
      entryId: text_(row[l.entry_id]),
      reference: text_(row[l.reference]),
      account: account,
      ticker: ticker,
      type: type,
      amount: round2_(amount),
      date: date,
      dateIso: isoDate_(date)
    });
  }

  result.ledgerDividendEntries = ledgerEntries.length;
  const usedLedgerKeys = new Set();

  for (let i = 1; i < dividendValues.length; i++) {
    const row = dividendValues[i];
    const status = text_(row[d.status]).toUpperCase();

    if (status === 'ARCHIVED' || status === 'CANCELLED') {
      continue;
    }

    const account = account_(row[d.account]);
    const ticker = ticker_(row[d.ticker]);
    const payDate = dateOnly_(row[d.pay_date]);

    if (!account || !ticker || !payDate) {
      continue;
    }

    result.dividendRowsChecked++;

    const matches = ledgerEntries.filter(function(entry) {
      if (entry.account !== account || entry.ticker !== ticker) {
        return false;
      }

      const daysApart = Math.abs(Math.round(
        (entry.date.getTime() - payDate.getTime()) / 86400000
      ));

      return daysApart <= A2_DIV_RECEIPT_MATCH_DAYS;
    });

    if (!matches.length) {
      continue;
    }

    result.matchedRows++;

    // Dedupe ledger records before summing split payments.
    const localKeys = new Set();
    const matchedEntries = [];
    let actual = 0;

    matches.forEach(function(entry) {
      const key = entry.entryId || entry.reference || [
        entry.account,
        entry.ticker,
        entry.dateIso,
        entry.amount,
        entry.type,
        entry.sheetRow
      ].join('|');

      if (localKeys.has(key)) {
        return;
      }

      localKeys.add(key);
      usedLedgerKeys.add(key);
      actual += entry.amount;
      matchedEntries.push(entry);
    });

    actual = round2_(actual);

    if (!(actual > 0)) {
      continue;
    }

    const existingActual = round2_(number_(row[d.actual_amount_gbp]));
    const alreadyReceived = number_(row[d.received_gbp]) === 1;

    if (
      alreadyReceived &&
      status === 'PAID' &&
      Math.abs(existingActual - actual) < 0.005
    ) {
      result.alreadyCorrect++;
      continue;
    }

    const entrySummary = matchedEntries.map(function(entry) {
      return '£' + entry.amount.toFixed(2) + ' ' + entry.type;
    }).join(' + ');

    const receiptNote =
      'Broker-confirmed dividend receipt: ' +
      entrySummary +
      ' = £' + actual.toFixed(2) + '.';

    const existingNotes = text_(row[d.notes]);
    const newNotes = appendNote_(existingNotes, receiptNote);

    const sheetRow = i + 1;

    // Only write the fields this reconciler owns.
    dividendsSheet.getRange(sheetRow, d.received_gbp + 1).setValue(1);
    dividendsSheet.getRange(sheetRow, d.actual_amount_gbp + 1).setValue(actual);
    dividendsSheet.getRange(sheetRow, d.status + 1).setValue('PAID');
    dividendsSheet.getRange(sheetRow, d.notes + 1).setValue(newNotes);
    dividendsSheet.getRange(sheetRow, d.updated_at + 1).setValue(new Date().toISOString());

    // Keep local copy current in case this same run sees overlapping data.
    row[d.received_gbp] = 1;
    row[d.actual_amount_gbp] = actual;
    row[d.status] = 'PAID';
    row[d.notes] = newNotes;

    result.updatedRows++;
    result.updates.push({
      dividendId: text_(row[d.dividend_id]),
      account: account,
      ticker: ticker,
      payDate: isoDate_(payDate),
      expectedAmount: round2_(number_(row[d.expected_amount_gbp])),
      actualAmount: actual,
      entries: matchedEntries.map(function(entry) {
        return {
          entryId: entry.entryId,
          type: entry.type,
          amount: entry.amount,
          date: entry.dateIso
        };
      })
    });
  }

  ledgerEntries.forEach(function(entry) {
    const key = entry.entryId || entry.reference || [
      entry.account,
      entry.ticker,
      entry.dateIso,
      entry.amount,
      entry.type,
      entry.sheetRow
    ].join('|');

    if (!usedLedgerKeys.has(key)) {
      result.unmatchedLedgerEntries.push({
        entryId: entry.entryId,
        account: entry.account,
        ticker: entry.ticker,
        type: entry.type,
        amount: entry.amount,
        date: entry.dateIso
      });
    }
  });

  result.finishedAt = new Date().toISOString();
  return result;
}

function headerMap_(headers) {
  const map = {};

  headers.forEach(function(header, index) {
    const key = text_(header).toLowerCase();
    if (key) {
      map[key] = index;
    }
  });

  return map;
}

function requireHeaders_(map, required, sheetName) {
  required.forEach(function(header) {
    if (map[header] == null) {
      throw new Error(sheetName + ' is missing required column: ' + header);
    }
  });
}

function text_(value) {
  return String(value == null ? '' : value).trim();
}

function number_(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function account_(value) {
  const s = text_(value).toUpperCase();
  if (!s) return '';

  if (s === 'TRADING 212' || s === 'TRADING212' || s === 'T212 ISA') {
    return 'T212';
  }

  if (s === 'IG ISA') {
    return 'IG';
  }

  return s;
}

function ticker_(value) {
  return text_(value).toUpperCase();
}

function dateOnly_(value) {
  let date = null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    date = new Date(value.getTime());
  } else {
    const s = text_(value);
    if (!s) return null;

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
    } else {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }
  }

  if (!date || isNaN(date.getTime())) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function isoDate_(date) {
  return Utilities.formatDate(date, 'Europe/London', 'yyyy-MM-dd');
}

function appendNote_(existing, note) {
  const a = text_(existing);
  const b = text_(note);

  if (!b || a.indexOf(b) >= 0) {
    return a;
  }

  return a ? a + ' • ' + b : b;
}

const SPREADSHEET_ID = '1AHTtCf5T_4u4ZunrFlGSVVwslE0Mr5hBqbuV3wL324Q';
const USERS_SHEET = 'Users';
const GROUPS_SHEET = 'WatchlistGroups';
const STOCKS_SHEET = 'WatchlistStocks';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('APP_INTERNAL_SECRET');

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    const action = payload.action;
    const user = payload.user;

    if (!user || !user.user_id) {
      return json_({ ok: false, error: 'missing_user' });
    }

    if (action === 'upsertUser') return upsertUser_(user);
    if (action === 'getWatchlist') return getWatchlist_(user.user_id);
    if (action === 'saveWatchlist') return saveWatchlist_(user.user_id, payload.groups || []);

    return json_({ ok: false, error: 'invalid_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function upsertUser_(user) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) throw new Error('Users sheet not found');

  const now = new Date();
  const lastRow = sheet.getLastRow();
  let rowIndex = -1;

  if (lastRow >= 2) {
    const userIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < userIds.length; i++) {
      if (String(userIds[i][0]) === String(user.user_id)) {
        rowIndex = i + 2;
        break;
      }
    }
  }

  if (rowIndex === -1) {
    rowIndex = Math.max(2, lastRow + 1);
    sheet.getRange(rowIndex, 1, 1, 7).setValues([[
      String(user.user_id),
      user.email || '',
      user.display_name || '',
      user.photo_url || '',
      now,
      now,
      'active'
    ]]);
  } else {
    sheet.getRange(rowIndex, 2, 1, 3).setValues([[
      user.email || '',
      user.display_name || '',
      user.photo_url || ''
    ]]);
    sheet.getRange(rowIndex, 6).setValue(now);
    sheet.getRange(rowIndex, 7).setValue('active');
  }

  return json_({ ok: true, row: rowIndex });
}

function getWatchlist_(userId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const groupSheet = ss.getSheetByName(GROUPS_SHEET);
  const stockSheet = ss.getSheetByName(STOCKS_SHEET);
  if (!groupSheet || !stockSheet) throw new Error('Watchlist sheets not found');

  const groups = [];
  const groupMap = {};

  if (groupSheet.getLastRow() >= 2) {
    const rows = groupSheet.getRange(2, 1, groupSheet.getLastRow() - 1, 6).getValues();
    rows.forEach(r => {
      if (String(r[1]) !== String(userId)) return;
      const g = {
        group_id: String(r[0]),
        name: String(r[2] || ''),
        sort_order: Number(r[3]) || 0,
        stocks: []
      };
      groups.push(g);
      groupMap[g.group_id] = g;
    });
  }

  if (stockSheet.getLastRow() >= 2) {
    const rows = stockSheet.getRange(2, 1, stockSheet.getLastRow() - 1, 8).getValues();
    rows.forEach(r => {
      if (String(r[1]) !== String(userId)) return;
      const g = groupMap[String(r[2])];
      if (!g) return;
      g.stocks.push({
        symbol: String(r[3]),
        starred: r[4] === true || String(r[4]).toLowerCase() === 'true',
        sort_order: Number(r[5]) || 0
      });
    });
  }

  groups.sort((a,b) => a.sort_order - b.sort_order);
  groups.forEach(g => g.stocks.sort((a,b) => a.sort_order - b.sort_order));

  return json_({ ok: true, groups: groups });
}

function saveWatchlist_(userId, groups) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const groupSheet = ss.getSheetByName(GROUPS_SHEET);
    const stockSheet = ss.getSheetByName(STOCKS_SHEET);
    if (!groupSheet || !stockSheet) throw new Error('Watchlist sheets not found');

    deleteUserRows_(stockSheet, 2, userId);
    deleteUserRows_(groupSheet, 2, userId);

    const now = new Date();
    const groupRows = [];
    const stockRows = [];

    (groups || []).forEach((g, gi) => {
      const groupId = String(g.group_id || ('g_' + gi));
      groupRows.push([
        groupId,
        String(userId),
        String(g.name || ('自選' + (gi + 1))),
        gi + 1,
        now,
        now
      ]);

      (g.stocks || []).forEach((s, si) => {
        stockRows.push([
          'ws_' + groupId + '_' + String(s.symbol),
          String(userId),
          groupId,
          String(s.symbol),
          !!s.starred,
          si + 1,
          now,
          now
        ]);
      });
    });

    if (groupRows.length) {
      groupSheet.getRange(groupSheet.getLastRow() + 1, 1, groupRows.length, 6).setValues(groupRows);
    }
    if (stockRows.length) {
      stockSheet.getRange(stockSheet.getLastRow() + 1, 1, stockRows.length, 8).setValues(stockRows);
    }

    return json_({ ok: true, group_count: groupRows.length, stock_count: stockRows.length });
  } finally {
    lock.releaseLock();
  }
}

function deleteUserRows_(sheet, userIdColumn, userId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, userIdColumn, lastRow - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === String(userId)) {
      sheet.deleteRow(i + 2);
    }
  }
}

function doGet() {
  return json_({ ok: true, service: 'Stock Lens Database API' });
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

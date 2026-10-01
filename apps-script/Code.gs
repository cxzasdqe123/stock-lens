const SPREADSHEET_ID = '1AHTtCf5T_4u4ZunrFlGSVVwslE0Mr5hBqbuV3wL324Q';
const USERS_SHEET = 'Users';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('APP_INTERNAL_SECRET');

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    if (payload.action !== 'upsertUser' || !payload.user || !payload.user.user_id) {
      return json_({ ok: false, error: 'invalid_payload' });
    }

    const user = payload.user;
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

    return json_({
      ok: true,
      action: rowIndex === Math.max(2, lastRow + 1) ? 'created_or_appended' : 'updated',
      row: rowIndex
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
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

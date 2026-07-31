/**
 * Think & Make — PWA form backend
 * Inqui-Lab Foundation
 *
 * Roles: Admin, IIF, School
 * New tabs: Users, Sessions, RolePermissions
 * New doPost actions: login, saveUser, savePermissions
 * New doGet  actions: schoolData, allSchoolStatus, formData, schools
 */

var SHEET_ID = '1OXs8suaKhTvpgLoGh0CYkVzDQYJI-WXvCL4D30bWEpk';
var SECRET_TOKEN = 'TM2026SECRET';
var SESSION_DAYS = 30;

// -------- Column definitions per form --------
var FORM_SCHEMAS = {
  form1_school_orientation: {
    tabName: 'School_Enrollment',
    columns: [
      'Submission ID', 'Submitted At', 'Submitted By', 'Form Version', 'Status',
      'Partner', 'School', 'School Code', 'Visited By', 'Visit Date',
      'School Location', 'District', 'Distance to IIF (km)',
      'Gender Type', 'School Type', 'Medium', 'Programme Year',
      'Grades', 'Total Sections', 'Grade Data',
      'Principal Name', 'Principal Phone', 'Principal Email',
      'Lab Room', 'Internet', 'Smart Board', 'Kit Storage',
      'School Photo URL', 'Maps Link',
      'Observations', 'Next Steps', 'Principal Acknowledged'
    ]
  },
  form2_schools_contact: {
    tabName: 'Schools_Contact_Info',
    columns: [
      'Submission ID', 'Submitted At', 'Submitted By', 'Form Version', 'Status',
      'Partner', 'School', 'School Code',
      'Maps Link', 'Principal Name', 'Principal Phone', 'Grades',
      'Teachers',
      'IIF PoC', 'Session Schedule'
    ]
  },
  form3_student_data: {
    tabName: 'Students_Count_Info',
    columns: [
      'Submission ID', 'Submitted At', 'Form Version', 'Status',
      'School', 'School Code', 'Grade', 'Section',
      'Total SL', 'Total Clusters', 'Total Teams',
      'Total Students', 'Teams Info Photo', 'Extraction Status', 'Count Validation', 'Student Database'
    ]
  },
  form4_sl_selection: {
    tabName: 'SL_Selection_Assessment',
    columns: [
      'Submission ID', 'Submitted At', 'Form Version', 'Status',
      'Partner', 'School', 'School Code', 'Grade', 'Section', 'Teacher',
      'SL Name', 'Interested in Role', 'Attendance >90%', 'SL Status',
      'Speaks Clearly', 'Speaks Loudly', 'Understands English',
      'Teacher Acknowledged'
    ]
  },
  form5_kits_handover: {
    tabName: 'Kits_Info',
    columns: [
      'Submission ID', 'Submitted At', 'Form Version', 'Status',
      'Partner', 'School', 'School Code',
      'Delivered By', 'Received By', 'Date of Delivery',
      'Grades', 'Grade 6 Kit', 'Grade 7 Kit', 'Grade 8 Kit', 'Grade 9 Kit',
      'Delivery Proof Photo', 'Acknowledgement Letter'
    ]
  }
};

// -------- ROUTING --------

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    // Login does not require SECRET_TOKEN (it uses email+PIN)
    if (action === 'login') return handleLogin(payload);

    // All other actions require either the app secret or a valid session token
    if (!validateRequest(payload)) {
      return json({ status: 'error', message: 'Unauthorised' });
    }

    if (action === 'saveUser')               return handleSaveUser(payload);
    if (action === 'savePermissions')        return handleSavePermissions(payload);
    if (action === 'extractTeamData')        return handleExtractTeamData(payload);
    if (action === 'processInnovation')      return handleProcessInnovation(payload);
    if (action === 'saveIdeaArtifact')       return handleSaveIdeaArtifact(payload);
    if (action === 'generateSectionFeedback') return handleGenerateSectionFeedback(payload);
    if (action === 'getTeamPhoto')           return handleGetTeamPhoto(payload);

    // Form submissions (formId present)
    if (payload.formId) return handleFormSubmit(payload);

    return json({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    return json({ status: 'error', message: String(err) });
  }
}

function doGet(e) {
  var p = e.parameter || {};
  var action = p.action;

  if (action === 'schools') return handleGetSchools();

  // All data-fetch actions require a valid session token
  if (!validateToken(p.token)) {
    return json({ status: 'error', message: 'Unauthorised' });
  }

  if (action === 'schoolData')               return handleSchoolData(p);
  if (action === 'allSchoolStatus')          return handleAllSchoolStatus(p);
  if (action === 'formData')                 return handleFormData(p);
  if (action === 'listUsers')                return handleListUsers(p);
  if (action === 'getTeamData')              return handleGetTeamData(p);
  if (action === 'getSchoolSummary')         return handleGetSchoolSummary(p);
  if (action === 'allForm3Submissions')      return handleAllForm3Submissions(p);
  if (action === 'allForm4Submissions')      return handleAllForm4Submissions(p);
  if (action === 'getSchoolGradesAndSections') return handleGetSchoolGradesAndSections(p);
  if (action === 'getSchoolBuddyTeams')      return handleGetSchoolBuddyTeams(p);

  return json({ status: 'ok', message: 'TM form backend live' });
}

// -------- AUTH HELPERS --------

function validateRequest(payload) {
  // Accept app-level secret (form submissions from PWA) OR a valid session token
  if (SECRET_TOKEN && payload.token === SECRET_TOKEN) return true;
  return validateToken(payload.token);
}

function validateToken(token) {
  if (!token) return false;
  var ss = getSheet();
  var sheet = ss.getSheetByName('Sessions');
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(token)) {
      var expires = new Date(data[i][2]);
      return expires > now;
    }
  }
  return false;
}

function getSessionUser(token) {
  if (!token) return null;
  var ss = getSheet();
  var sheet = ss.getSheetByName('Sessions');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(token)) {
      var expires = new Date(data[i][2]);
      if (expires > now) return { email: data[i][1] };
    }
  }
  return null;
}

// -------- LOGIN --------

function handleLogin(payload) {
  var email = (payload.email || '').toLowerCase().trim();
  var pin   = String(payload.pin || '').trim();
  if (!email || !pin) return json({ status: 'error', message: 'Email and PIN required.' });

  var ss = getSheet();
  var users = getOrCreateUsersTab(ss);
  var data = users.getDataRange().getValues();
  // Columns: Email(0) Name(1) Role(2) SchoolCode(3) PIN(4) Active(5)
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[0]).toLowerCase().trim() === email) {
      if (String(row[5]).toUpperCase() !== 'Y') {
        return json({ status: 'error', message: 'Account is inactive.' });
      }
      if (String(row[4]).trim() !== pin) {
        return json({ status: 'error', message: 'Incorrect PIN.' });
      }
      var token = makeUUID();
      var expires = new Date();
      expires.setDate(expires.getDate() + SESSION_DAYS);
      var sessions = getOrCreateSessionsTab(ss);
      sessions.appendRow([token, email, expires.toISOString()]);

      var perms = loadPermissions(ss, String(row[2]));
      return json({
        status: 'ok',
        name: row[1],
        role: row[2],
        schoolCode: row[3] || '',
        token: token,
        permissions: perms
      });
    }
  }
  return json({ status: 'error', message: 'User not found.' });
}

function loadPermissions(ss, role) {
  var sheet = ss.getSheetByName('RolePermissions');
  if (!sheet) return defaultPermissions(role);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return defaultPermissions(role);
  // Row 1 = header: Role, form1, form2, form3, form4, iifDash, tracker, editSubmit, adminPanel
  var header = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === role.toLowerCase()) {
      var perms = {};
      for (var j = 1; j < header.length; j++) {
        perms[header[j]] = (String(data[i][j]).toUpperCase() === 'Y');
      }
      return perms;
    }
  }
  return defaultPermissions(role);
}

function defaultPermissions(role) {
  var r = role.toLowerCase();
  if (r === 'admin')  return { form1:true, form2:true, form3:true, form4:true, form5:true, iifDash:true, tracker:true, editSubmit:true, adminPanel:true, buddy:true };
  if (r === 'iif')    return { form1:true, form2:true, form3:true, form4:true, form5:true, iifDash:true, tracker:true, editSubmit:true, adminPanel:false, buddy:true };
  if (r === 'school') return { form1:false, form2:false, form3:false, form4:false, form5:false, iifDash:false, tracker:false, editSubmit:false, adminPanel:false, buddy:false };
  return {};
}

// -------- LIST USERS --------

function handleListUsers(p) {
  var ss = getSheet();
  var sheet = ss.getSheetByName('Users');
  if (!sheet) return json({ status: 'ok', users: [] });
  var data = sheet.getDataRange().getValues();
  var users = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    users.push({ email: data[i][0], name: data[i][1], role: data[i][2], schoolCode: data[i][3], pin: data[i][4], active: data[i][5] });
  }
  return json({ status: 'ok', users: users });
}

// -------- SAVE USER --------

function handleSaveUser(payload) {
  var ss = getSheet();
  var users = getOrCreateUsersTab(ss);
  var data = users.getDataRange().getValues();
  var u = payload.user || {};
  var email = (u.email || '').toLowerCase().trim();
  if (!email) return json({ status: 'error', message: 'Email required.' });

  // Check if updating existing
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase().trim() === email) {
      var row = i + 1;
      users.getRange(row, 1, 1, 6).setValues([[
        email,
        u.name || data[i][1],
        u.role || data[i][2],
        u.schoolCode !== undefined ? u.schoolCode : data[i][3],
        u.pin || data[i][4],
        u.active !== undefined ? (u.active ? 'Y' : 'N') : data[i][5]
      ]]);
      return json({ status: 'ok', action: 'updated' });
    }
  }
  // New user
  var pin = u.pin || String(Math.floor(100000 + Math.random() * 900000));
  users.appendRow([email, u.name || '', u.role || 'IIF', u.schoolCode || '', pin, u.active !== false ? 'Y' : 'N']);
  return json({ status: 'ok', action: 'created', pin: pin });
}

// -------- SAVE PERMISSIONS --------

function handleSavePermissions(payload) {
  var ss = getSheet();
  var sheet = getOrCreatePermissionsTab(ss);
  var perms = payload.permissions || {};
  // perms = { IIF: { form1:true, ... }, School: { form1:false, ... } }
  var features = ['form1','form2','form3','form4','iifDash','tracker','editSubmit','adminPanel','buddy'];
  var header = ['Role'].concat(features);
  var rows = [header];
  var roles = ['Admin','IIF','School'];
  roles.forEach(function(role) {
    var rp = perms[role] || defaultPermissions(role);
    var row = [role];
    features.forEach(function(f) { row.push(rp[f] ? 'Y' : 'N'); });
    rows.push(row);
  });
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, header.length).setValues(rows);
  return json({ status: 'ok' });
}

// -------- GET SCHOOLS --------

function handleGetSchools() {
  var ss = getSheet();
  var sheet = ss.getSheetByName('Schools_List');
  if (!sheet) return json({ status: 'ok', schools: [] });
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return json({ status: 'ok', schools: [] });

  // Find columns by header name (case-insensitive, also handles "Partner Name", "School Name", etc.)
  var header = data[0].map(function(h){ return String(h).toLowerCase().trim(); });
  var partnerIdx = header.indexOf('partner');
  if (partnerIdx < 0) partnerIdx = header.findIndex(function(h){ return h.indexOf('partner') >= 0; });
  if (partnerIdx < 0) partnerIdx = 2;
  var codeIdx = header.indexOf('school code');
  if (codeIdx < 0) codeIdx = header.findIndex(function(h){ return h.indexOf('school') >= 0 && h.indexOf('code') >= 0; });
  if (codeIdx < 0) codeIdx = 1;
  var nameIdx = header.indexOf('school');
  if (nameIdx < 0) nameIdx = header.findIndex(function(h){ return h.indexOf('school') >= 0 && h !== header[codeIdx]; });
  if (nameIdx < 0) nameIdx = 0;

  var schools = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameIdx] || '').trim();
    if (name) schools.push({
      name:    name,
      code:    String(data[i][codeIdx]    || '').trim(),
      partner: String(data[i][partnerIdx] || '').trim()
    });
  }
  return json({ status: 'ok', schools: schools });
}

// -------- SCHOOL DATA (dashboard) --------

function handleSchoolData(p) {
  var schoolCode = (p.schoolCode || '').trim().toUpperCase();
  if (!schoolCode) return json({ status: 'error', message: 'schoolCode required' });
  var ss = getSheet();
  var partnerName = getPartnerForSchool(ss, schoolCode);
  var targetSS = partnerName ? getOrCreatePartnerSheet(partnerName, ss) : ss;
  var result = {};
  var formKeys = ['form1_school_orientation','form2_schools_contact','form3_student_data','form4_sl_selection','form5_kits_handover'];
  formKeys.forEach(function(fk) {
    var schema = FORM_SCHEMAS[fk];
    if (!schema) return;
    var sheet = targetSS.getSheetByName(schema.tabName);
    if (!sheet) { result[fk] = null; return; }
    var data = sheet.getDataRange().getValues();
    var header = data[0];
    var scIdx = header.indexOf('School Code');
    var statusIdx = header.indexOf('Status');
    var latest = null, latestDate = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][scIdx]).trim().toUpperCase() !== schoolCode) continue;
      if (statusIdx >= 0 && String(data[i][statusIdx]).toLowerCase() === 'superseded') continue;
      var d = new Date(data[i][1]);
      if (!latestDate || d > latestDate) { latestDate = d; latest = data[i]; }
    }
    if (!latest) { result[fk] = null; return; }
    var obj = {};
    header.forEach(function(col, idx) { obj[col] = latest[idx]; });
    result[fk] = obj;
  });
  return json({ status: 'ok', data: result });
}

// -------- ALL SCHOOL STATUS (IIF dashboard / tracker) --------

function handleAllSchoolStatus(p) {
  var ss = getSheet();
  var schoolsSheet = ss.getSheetByName('Schools_List');
  if (!schoolsSheet) return json({ status: 'ok', schools: [] });
  var schoolData = schoolsSheet.getDataRange().getValues();

  var formKeys = ['form1_school_orientation','form2_schools_contact','form3_student_data','form4_sl_selection','form5_kits_handover'];
  var submitted = {};
  formKeys.forEach(function(fk) { submitted[fk] = {}; });

  // Aggregate submission data from all partner sheets
  var partnerConfig = getPartnerConfig(ss);
  Object.keys(partnerConfig).forEach(function(pName) {
    var pEntry = partnerConfig[pName];
    if (!pEntry.sheetId) return;
    try {
      var partnerSS = SpreadsheetApp.openById(pEntry.sheetId);
      formKeys.forEach(function(fk) {
        var schema = FORM_SCHEMAS[fk];
        if (!schema) return;
        var sheet = partnerSS.getSheetByName(schema.tabName);
        if (!sheet) return;
        var data = sheet.getDataRange().getValues();
        var header = data[0];
        var scIdx = header.indexOf('School Code');
        var statusIdx = header.indexOf('Status');
        for (var i = 1; i < data.length; i++) {
          if (statusIdx >= 0 && String(data[i][statusIdx]).toLowerCase() === 'superseded') continue;
          var code = String(data[i][scIdx]).trim().toUpperCase();
          if (!code) continue;
          var d = new Date(data[i][1]);
          if (!submitted[fk][code] || d > new Date(submitted[fk][code])) {
            submitted[fk][code] = data[i][1];
          }
        }
      });
    } catch(e) { /* skip inaccessible partner sheets */ }
  });

  var schools = [];
  for (var i = 1; i < schoolData.length; i++) {
    if (!schoolData[i][0]) continue;
    var code = String(schoolData[i][1] || '').trim().toUpperCase();
    var entry = {
      name: schoolData[i][0],
      code: code,
      partner: schoolData[i][2] || ''
    };
    formKeys.forEach(function(fk, idx) {
      var key = 'form' + (idx + 1);
      entry[key] = submitted[fk][code] ? 'submitted' : 'pending';
      if (submitted[fk][code]) entry[key + 'Date'] = submitted[fk][code];
    });
    schools.push(entry);
  }
  return json({ status: 'ok', schools: schools });
}

// -------- FORM DATA (edit/re-submit) --------

function handleFormData(p) {
  var schoolCode = (p.schoolCode || '').trim().toUpperCase();
  var formId = p.formId || '';
  if (!schoolCode || !formId) return json({ status: 'error', message: 'schoolCode and formId required' });
  var schema = FORM_SCHEMAS[formId];
  if (!schema) return json({ status: 'error', message: 'Unknown formId' });
  var ss = getSheet();
  var partnerName = getPartnerForSchool(ss, schoolCode);
  var targetSS = partnerName ? getOrCreatePartnerSheet(partnerName, ss) : ss;
  var sheet = targetSS.getSheetByName(schema.tabName);
  if (!sheet) return json({ status: 'ok', row: null });
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var scIdx = header.indexOf('School Code');
  var statusIdx = header.indexOf('Status');
  var latest = null, latestDate = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][scIdx]).trim().toUpperCase() !== schoolCode) continue;
    if (statusIdx >= 0 && String(data[i][statusIdx]).toLowerCase() === 'superseded') continue;
    var d = new Date(data[i][1]);
    if (!latestDate || d > latestDate) { latestDate = d; latest = data[i]; }
  }
  if (!latest) return json({ status: 'ok', row: null });
  var obj = {};
  header.forEach(function(col, idx) { obj[col] = latest[idx]; });
  return json({ status: 'ok', row: obj });
}

// -------- FORM SUBMIT --------

function handleFormSubmit(payload) {
  var schema = FORM_SCHEMAS[payload.formId];
  if (!schema) return json({ status: 'error', message: 'Unknown formId: ' + payload.formId });

  var ss = getSheet();
  var partner = (payload.header || {}).partner || payload.partner || '';
  var partnerSS = getOrCreatePartnerSheet(partner, ss);

  // Block duplicate submissions for school-level forms (Forms 1 & 2)
  var duplicateGuardForms = ['form1_school_orientation', 'form2_schools_contact', 'form5_kits_handover'];
  if (!payload.isEdit && duplicateGuardForms.indexOf(payload.formId) !== -1) {
    var checkSheet = partnerSS.getSheetByName(schema.tabName);
    if (checkSheet) {
      var checkData = checkSheet.getDataRange().getValues();
      var checkHeader = checkData[0];
      var chkScIdx = checkHeader.indexOf('School Code');
      var chkStIdx = checkHeader.indexOf('Status');
      var dupSchoolCode = ((payload.header || {}).schoolCode || '').trim().toUpperCase();
      for (var ci = 1; ci < checkData.length; ci++) {
        if (String(checkData[ci][chkScIdx]).trim().toUpperCase() !== dupSchoolCode) continue;
        if (chkStIdx >= 0 && String(checkData[ci][chkStIdx]).toLowerCase() === 'superseded') continue;
        return json({ status: 'duplicate', message: 'This form has already been submitted for this school. Contact admin to make any changes.' });
      }
    }
  }

  // Handle edit/re-submit: mark old row as superseded
  if (payload.isEdit && payload.originalSubmissionId) {
    var sheet = partnerSS.getSheetByName(schema.tabName);
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      var header = data[0];
      var sidIdx = header.indexOf('Submission ID');
      var statusIdx = header.indexOf('Status');
      if (sidIdx >= 0 && statusIdx >= 0) {
        for (var i = 1; i < data.length; i++) {
          if (String(data[i][sidIdx]) === String(payload.originalSubmissionId)) {
            sheet.getRange(i + 1, statusIdx + 1).setValue('superseded');
            break;
          }
        }
      }
    }
  }

  var tab = getOrCreateTab(partnerSS, schema);
  if (payload.formId === 'form4_sl_selection') {
    var slRows = buildRowForm4(payload);
    slRows.forEach(function(rowObj) {
      tab.appendRow(schema.columns.map(function(c) { return rowObj[c] !== undefined ? rowObj[c] : ''; }));
    });
  } else {
    var row = buildRow(payload, schema);
    tab.appendRow(row);
  }

  uploadPhotos(payload, ss, partner, partnerSS);

  return json({ status: 'success', submissionId: payload.submissionId || '' });
}

// -------- PHOTO UPLOAD --------

function uploadPhotos(payload, ss, partner, partnerSS) {
  var folder;
  if (partner) {
    try {
      var pCfg = getPartnerConfig(ss);
      var pEntry = pCfg[partner];
      if (pEntry && pEntry.folderId) {
        folder = getOrCreatePartnerSubFolder(pEntry.folderId, 'TM_FormPhotos');
      }
    } catch(e) {}
  }
  if (!folder) folder = getOrCreateDriveFolder('TM_FormPhotos');

  var targetSS = partnerSS || ss;

  function upload(photoObj, fileName) {
    if (!photoObj || !photoObj.data) return null;
    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(photoObj.data), photoObj.mime || 'image/jpeg', fileName);
      var file = folder.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e2) {}
      return file.getUrl();
    } catch(e) { return null; }
  }

  if (payload.formId === 'form1_school_orientation') {
    var schoolName = ((payload.header || {}).school || 'school').replace(/[^a-zA-Z0-9]/g, '_');
    var url = upload(payload.sectionH && payload.sectionH.schoolPhoto, schoolName + '_photo.jpg');
    if (url) updatePhotoUrl(targetSS, FORM_SCHEMAS[payload.formId], payload.submissionId, 'School Photo URL', url);
  }
  if (payload.formId === 'form3_student_data') {
    var sc3  = ((payload.header||{}).schoolCode||'SCH').replace(/[^a-zA-Z0-9]/g,'');
    var gr3  = ((payload.header||{}).grade||'').replace(/[^a-zA-Z0-9]/g,'');
    var sec3 = ((payload.header||{}).section||'').toUpperCase().replace(/[^a-zA-Z0-9]/g,'');
    var u1 = upload(payload.photo, sc3+'_'+gr3+sec3+'_TeamsInfo.jpg');
    if (u1) {
      updatePhotoUrl(targetSS, FORM_SCHEMAS[payload.formId], payload.submissionId, 'Teams Info Photo', u1);
      var photoBase64 = payload.photo ? (payload.photo.data || payload.photo) : null;
      if (photoBase64) {
        var partnerFolderId3 = null;
        if (partner) {
          try {
            var pCfg3 = getPartnerConfig(ss);
            var pEntry3 = pCfg3[partner];
            if (pEntry3 && pEntry3.folderId) partnerFolderId3 = pEntry3.folderId;
          } catch(e) {}
        }
        extractStudentDataFromPhoto(photoBase64, u1, payload, targetSS, partner, partnerFolderId3);
      }
    }
  }
  if (payload.formId === 'form5_kits_handover') {
    var sc5 = ((payload.header||{}).schoolCode||'SCH').replace(/[^a-zA-Z0-9]/g,'');
    var up1 = upload(payload.proofPhoto, sc5+'_Kit_DeliveryProof.jpg');
    var up2 = upload(payload.ackPhoto, sc5+'_Kit_AckLetter.jpg');
    if (up1) updatePhotoUrl(targetSS, FORM_SCHEMAS[payload.formId], payload.submissionId, 'Delivery Proof Photo', up1);
    if (up2) updatePhotoUrl(targetSS, FORM_SCHEMAS[payload.formId], payload.submissionId, 'Acknowledgement Letter', up2);
  }
}

function updatePhotoUrl(ss, schema, submissionId, colName, url) {
  var sheet = ss.getSheetByName(schema.tabName);
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var sidIdx = header.indexOf('Submission ID');
  var colIdx = header.indexOf(colName);
  if (sidIdx < 0 || colIdx < 0) return;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][sidIdx]) === String(submissionId)) {
      sheet.getRange(i + 1, colIdx + 1).setValue(url);
      return;
    }
  }
}

function getOrCreateDriveFolder(name) {
  var iter = DriveApp.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : DriveApp.createFolder(name);
}

// -------- PARTNER CONFIG HELPERS --------

function getOrCreatePartnerConfigTab(ss) {
  var sheet = ss.getSheetByName('PartnerConfig');
  if (!sheet) {
    sheet = ss.insertSheet('PartnerConfig');
    var cols = ['PartnerName', 'FolderID', 'SheetID', 'StudentDbSheetId'];
    sheet.appendRow(cols);
    sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#0D3B4A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getPartnerConfig(ss) {
  var sheet = getOrCreatePartnerConfigTab(ss);
  var data = sheet.getDataRange().getValues();
  if (data.length < 1) return {};
  var header = data[0].map(function(h) { return String(h).trim(); });
  var folderIdx    = header.indexOf('FolderID');         if (folderIdx < 0)   folderIdx = 1;
  var sheetIdx     = header.indexOf('SheetID');          if (sheetIdx < 0)    sheetIdx = 2;
  var studentDbIdx   = header.indexOf('StudentDbSheetId');   // -1 if column not yet added
  var ideaFbIdx      = header.indexOf('IdeaFeedbackSheetId'); // -1 if column not yet added
  var config = {};
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0] || '').trim();
    if (!name) continue;
    config[name] = {
      folderId:            String(data[i][folderIdx] || '').trim(),
      sheetId:             String(data[i][sheetIdx]  || '').trim(),
      studentDbSheetId:    studentDbIdx >= 0 ? String(data[i][studentDbIdx] || '').trim() : '',
      ideaFeedbackSheetId: ideaFbIdx    >= 0 ? String(data[i][ideaFbIdx]    || '').trim() : ''
    };
  }
  return config;
}

function updatePartnerSheetId(ss, partnerName, sheetId) {
  var sheet = getOrCreatePartnerConfigTab(ss);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === partnerName) {
      sheet.getRange(i + 1, 3).setValue(sheetId);
      return;
    }
  }
}

function updatePartnerStudentDbId(ss, partnerName, sheetId) {
  var sheet = getOrCreatePartnerConfigTab(ss);
  var data = sheet.getDataRange().getValues();
  var header = data[0].map(function(h) { return String(h).trim(); });
  var colIdx = header.indexOf('StudentDbSheetId');
  if (colIdx < 0) {
    colIdx = header.length;
    sheet.getRange(1, colIdx + 1).setValue('StudentDbSheetId');
  }
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === partnerName) {
      sheet.getRange(i + 1, colIdx + 1).setValue(sheetId);
      return;
    }
  }
}

function getOrCreatePartnerSheet(partnerName, ss) {
  if (!partnerName) throw new Error('Partner name is required for data routing.');
  var config = getPartnerConfig(ss);
  var entry = config[partnerName];
  if (!entry) throw new Error('Partner "' + partnerName + '" not found in PartnerConfig. Add it to the PartnerConfig tab in the master sheet.');
  if (entry.sheetId) return SpreadsheetApp.openById(entry.sheetId);
  if (!entry.folderId) throw new Error('No FolderID configured for partner "' + partnerName + '". Update PartnerConfig.');

  var folder = DriveApp.getFolderById(entry.folderId);
  var newSheet = SpreadsheetApp.create(partnerName + ' - TM Data');
  var file = DriveApp.getFileById(newSheet.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  updatePartnerSheetId(ss, partnerName, newSheet.getId());
  return newSheet;
}

function getOrCreatePartnerSubFolder(partnerFolderId, subFolderName) {
  var parentFolder = DriveApp.getFolderById(partnerFolderId);
  var iter = parentFolder.getFoldersByName(subFolderName);
  return iter.hasNext() ? iter.next() : parentFolder.createFolder(subFolderName);
}

function getPartnerForSchool(ss, schoolCode) {
  var sheet = ss.getSheetByName('Schools_List');
  if (!sheet) return '';
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return '';
  var header = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var codeIdx = header.indexOf('school code');
  if (codeIdx < 0) codeIdx = header.findIndex(function(h) { return h.indexOf('school') >= 0 && h.indexOf('code') >= 0; });
  if (codeIdx < 0) codeIdx = 1;
  var partnerIdx = header.indexOf('partner');
  if (partnerIdx < 0) partnerIdx = header.findIndex(function(h) { return h.indexOf('partner') >= 0; });
  if (partnerIdx < 0) partnerIdx = 2;
  var normalCode = schoolCode.trim().toUpperCase();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][codeIdx] || '').trim().toUpperCase() === normalCode) {
      return String(data[i][partnerIdx] || '').trim();
    }
  }
  return '';
}

// -------- ROW BUILDERS --------

function buildRow(p, schema) {
  var row;
  if (p.formId === 'form1_school_orientation')  row = buildRowForm1(p);
  else if (p.formId === 'form2_schools_contact') row = buildRowForm2(p);
  else if (p.formId === 'form3_student_data')   row = buildRowForm3(p);
  else if (p.formId === 'form4_sl_selection')   row = buildRowForm4(p);
  else if (p.formId === 'form5_kits_handover') row = buildRowForm5(p);
  else row = {};
  return schema.columns.map(function(col) { return row[col] !== undefined ? row[col] : ''; });
}

function buildRowForm1(p) {
  var h=p.header||{}, a=p.sectionA||{}, b=p.sectionB||{},
      d=p.sectionD||{}, hh=p.sectionH||{}, i=p.sectionI||{};
  return {
    'Submission ID':p.submissionId||'','Submitted At':p.submittedAt||new Date().toISOString(),
    'Submitted By':p.submittedBy||'','Form Version':p.formVersion||'','Status':p.isEdit?'edited':'active',
    'Partner':h.partner||'','School':h.school||'','School Code':h.schoolCode||'',
    'Visited By':h.visitedBy||'','Visit Date':h.visitDate||'',
    'School Location':a.a1||'','District':a.a2||'','Distance to IIF (km)':a.adist||'',
    'Gender Type':a.a3||'','School Type':a.a4||'','Medium':a.a5||'','Programme Year':a.a6||'',
    'Grades':a.aGrades||'','Total Sections':a.aSections||'',
    'Grade Data': Object.keys(a.aGradeData||{}).sort(function(x,y){return Number(x)-Number(y);}).map(function(g){var d=(a.aGradeData||{})[g]||{};return 'Grade '+g+': '+(d.students||0)+' students, '+(d.sections||0)+' sections';}).join('\n'),
    'Principal Name':b.b1||'','Principal Phone':b.b2||'','Principal Email':b.b3||'',
    'Lab Room':d.d1||'','Internet':d.d2||'','Smart Board':d.d3||'','Kit Storage':d.d4||'',
    'School Photo URL':'','Maps Link':hh.mapsLink||'',
    'Observations':i.i1||'','Next Steps':i.i2||'','Principal Acknowledged':i.i3||''
  };
}

function buildRowForm2(p) {
  var h=p.header||{};
  return {
    'Submission ID':p.submissionId||'','Submitted At':p.submittedAt||new Date().toISOString(),
    'Submitted By':p.submittedBy||'','Form Version':p.formVersion||'','Status':p.isEdit?'edited':'active',
    'Partner':h.partner||'','School':h.school||'','School Code':h.schoolCode||'',
    'Maps Link':p.schoolLocation||'',
    'Principal Name':p.principalName||'',
    'Principal Phone':p.principalPhone||'',
    'Grades':p.grades||'',
    'Teachers':(p.teachers||[]).map(function(t,i){return 'Teacher '+(i+1)+': '+(t.name||'')+(t.phone?' - '+t.phone:'')+(t.grades?' - Grade '+t.grades:'');}).join('\n'),
    'IIF PoC':p.poc||'',
    'Session Schedule':p.sessionSchedule||''
  };
}

function buildRowForm3(p) {
  var h=p.header||{};
  return {
    'Submission ID':p.submissionId||'','Submitted At':p.submittedAt||new Date().toISOString(),
    'Form Version':p.formVersion||'','Status':p.isEdit?'edited':'active',
    'School':h.school||'','School Code':h.schoolCode||'',
    'Grade':h.grade||'','Section':(h.section||'').toUpperCase(),
    'Total SL':p.totalSL||0,'Total Clusters':p.totalClusters||0,'Total Teams':p.totalTeams||0,
    'Total Students':p.total||0,'Teams Info Photo':'','Extraction Status':'','Count Validation':'','Student Database':''
  };
}

function handleAllForm3Submissions(p) {
  var schoolCode = (p.schoolCode || '').trim().toUpperCase();
  if (!schoolCode) return json({ status: 'error', message: 'schoolCode required' });
  var ss = getSheet();
  var partnerName = getPartnerForSchool(ss, schoolCode);
  var targetSS = partnerName ? getOrCreatePartnerSheet(partnerName, ss) : ss;
  var schema = FORM_SCHEMAS['form3_student_data'];
  var sheet = targetSS.getSheetByName(schema.tabName);
  if (!sheet) return json({ status: 'ok', submissions: [] });
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var scIdx = header.indexOf('School Code');
  var statusIdx = header.indexOf('Status');
  var submissions = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][scIdx]).trim().toUpperCase() !== schoolCode) continue;
    if (statusIdx >= 0 && String(data[i][statusIdx]).toLowerCase() === 'superseded') continue;
    var obj = {};
    header.forEach(function(col, idx) { obj[col] = data[i][idx]; });
    submissions.push(obj);
  }
  return json({ status: 'ok', submissions: submissions });
}

function handleAllForm4Submissions(p) {
  var schoolCode = (p.schoolCode || '').trim().toUpperCase();
  if (!schoolCode) return json({ status: 'error', message: 'schoolCode required' });
  var ss = getSheet();
  var partnerName = getPartnerForSchool(ss, schoolCode);
  var targetSS = partnerName ? getOrCreatePartnerSheet(partnerName, ss) : ss;
  var schema = FORM_SCHEMAS['form4_sl_selection'];
  var sheet = targetSS.getSheetByName(schema.tabName);
  if (!sheet) return json({ status: 'ok', submissions: [] });
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var scIdx = header.indexOf('School Code');
  var statusIdx = header.indexOf('Status');
  var submissions = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][scIdx]).trim().toUpperCase() !== schoolCode) continue;
    if (statusIdx >= 0 && String(data[i][statusIdx]).toLowerCase() === 'superseded') continue;
    var obj = {};
    header.forEach(function(col, idx) { obj[col] = data[i][idx]; });
    submissions.push(obj);
  }
  return json({ status: 'ok', submissions: submissions });
}

// -------- STUDENT DATABASE EXTRACTION --------

function getOrCreateStudentDbSheet(partnerName, partnerFolderId) {
  var ss = getSheet();
  if (partnerName) {
    var config = getPartnerConfig(ss);
    var entry = config[partnerName];
    if (entry && entry.studentDbSheetId) {
      try { return SpreadsheetApp.openById(entry.studentDbSheetId); } catch(e) {}
    }
    var newSS = SpreadsheetApp.create(partnerName + ' - TM Student Database');
    if (partnerFolderId) {
      try {
        var file = DriveApp.getFileById(newSS.getId());
        DriveApp.getFolderById(partnerFolderId).addFile(file);
        DriveApp.getRootFolder().removeFile(file);
      } catch(e) { Logger.log('Could not move student DB sheet: ' + e.message); }
    }
    updatePartnerStudentDbId(ss, partnerName, newSS.getId());
    return newSS;
  }
  // Non-partner fallback: Config tab
  var configSheet = ss.getSheetByName('Config');
  if (!configSheet) {
    configSheet = ss.insertSheet('Config');
    configSheet.appendRow(['Key', 'Value']);
    configSheet.setFrozenRows(1);
  }
  var data = configSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === 'StudentDbSheetId' && data[i][1]) {
      try { return SpreadsheetApp.openById(String(data[i][1])); } catch(e) {}
    }
  }
  var newSS2 = SpreadsheetApp.create('TM Student Database');
  configSheet.appendRow(['StudentDbSheetId', newSS2.getId()]);
  return newSS2;
}

function getOrCreateSchoolTab(dbSS, schoolCode, schoolName) {
  var tabName = (schoolCode || schoolName || 'School').replace(/[^a-zA-Z0-9_\- ]/g, '_').substring(0, 100).trim();
  var sheet = dbSS.getSheetByName(tabName);
  if (!sheet) {
    sheet = dbSS.insertSheet(tabName);
    var defaultSheet = dbSS.getSheetByName('Sheet1');
    if (defaultSheet) { try { dbSS.deleteSheet(defaultSheet); } catch(e) {} }
    var header = ['School Code','School Name','Grade','Section','Cluster ID','SL ID','SL Name','Team ID','Team Code','Student Name','Gender','Extracted At','Source Photo URL'];
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setBackground('#0D3B4A').setFontColor('#ffffff').setFontWeight('bold');
  }
  return sheet;
}

function extractStudentDataFromPhoto(photoBase64, photoUrl, payload, targetSS, partnerName, partnerFolderId) {
  var schema = FORM_SCHEMAS['form3_student_data'];
  var submissionId = payload.submissionId || '';
  var h = payload.header || {};
  var grade = String(h.grade || '');
  var section = (h.section || '').toUpperCase();
  var schoolCode = (h.schoolCode || '').trim().toUpperCase();
  var schoolName = h.school || '';

  function setStatus(val) {
    updatePhotoUrl(targetSS, schema, submissionId, 'Extraction Status', val);
  }

  setStatus('In Progress');
  var _schemaSheet = targetSS.getSheetByName(schema.tabName);
  if (_schemaSheet) ensureSchemaColumns(_schemaSheet, schema);
  try {
    var extractPrompt = [
      { role: 'system', content: 'You are an expert at extracting structured data from handwritten Indian school student database sheets.\n\nThe image shows a student database sheet with columns including: School Code, Section, Cluster (number), SL ID (sequential like S1 or 1), SL Name, Team # (sequential like T1/T2/T3), Team Code (alphanumeric like TM26DA6A11), Student Name, Gender (M/F).\n\nExtract ALL SL blocks, their cluster numbers, the teams within each cluster, and all student details.\n\nReturn ONLY valid JSON (no markdown, no explanation) in this exact format:\n[\n  {\n    "sl_id": "SL ID or number (e.g. S1, 1)",\n    "sl_name": "Name of Student Leader",\n    "cluster_id": "Cluster number (e.g. 1, 2, 3)",\n    "grade": "Grade number if visible, else empty string",\n    "section": "Section letter if visible, else empty string",\n    "teams": [\n      {\n        "team_number": "Sequential team ID (e.g. T1, T2)",\n        "team_code": "Alphanumeric Team Code (e.g. TM26DA6A11)",\n        "students": [\n          { "name": "Student Name", "gender": "M or F or empty" }\n        ]\n      }\n    ]\n  }\n]\n\nExtract every SL block visible on the page.' },
      { role: 'user', content: [
        { type: 'text', text: 'Extract all SL, cluster, team, and student data from this student database sheet.' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + photoBase64 } }
      ]}
    ];

    var rawResult = callGemini(extractPrompt, 'gemini-2.5-flash', false);
    var cleaned = rawResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    var slBlocks = JSON.parse(cleaned);
    if (!Array.isArray(slBlocks)) throw new Error('Gemini returned non-array');

    var rows = [];
    var now = new Date().toISOString();
    slBlocks.forEach(function(slBlock) {
      var slId      = String(slBlock.sl_id || '').trim();
      var slName    = String(slBlock.sl_name || '').trim();
      var clusterId = String(slBlock.cluster_id || '').trim();
      var imgGrade  = String(slBlock.grade || grade).trim();
      var imgSec    = String(slBlock.section || section).trim().toUpperCase();
      (slBlock.teams || []).forEach(function(team) {
        var teamNum  = String(team.team_number || '').trim();
        var teamCode = String(team.team_code || '').trim();
        (team.students || []).forEach(function(student) {
          var name   = typeof student === 'object' ? String(student.name || '') : String(student);
          var gender = typeof student === 'object' ? String(student.gender || '') : '';
          rows.push([schoolCode, schoolName, imgGrade, imgSec, clusterId, slId, slName, teamNum, teamCode, name.trim(), gender.trim(), now, photoUrl]);
        });
      });
    });

    var dbSS = getOrCreateStudentDbSheet(partnerName, partnerFolderId);
    var schoolTab = getOrCreateSchoolTab(dbSS, schoolCode, schoolName);

    // Remove existing rows for this grade+section
    var existing = schoolTab.getDataRange().getValues();
    var toDelete = [];
    for (var i = existing.length - 1; i >= 1; i--) {
      if (String(existing[i][2]) === grade && String(existing[i][3]) === section) toDelete.push(i + 1);
    }
    toDelete.forEach(function(r) { schoolTab.deleteRow(r); });

    if (rows.length > 0) {
      schoolTab.getRange(schoolTab.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    var tabUrl = 'https://docs.google.com/spreadsheets/d/' + dbSS.getId() + '/edit#gid=' + schoolTab.getSheetId();
    updatePhotoUrl(targetSS, schema, submissionId, 'Student Database', tabUrl);
    setStatus('Done (' + rows.length + ' students)');
    var enteredTotal = Number(payload.total || 0);
    var countValidation = (enteredTotal > 0 && enteredTotal === rows.length)
      ? 'Counts matched'
      : 'Counts mismatch - Needs validation';
    updatePhotoUrl(targetSS, schema, submissionId, 'Count Validation', countValidation);
    return tabUrl;
  } catch(e) {
    Logger.log('extractStudentDataFromPhoto error: ' + e.message);
    setStatus('Error: ' + e.message.substring(0, 120));
    updatePhotoUrl(targetSS, schema, submissionId, 'Count Validation', 'Extraction error - Needs validation');
    return null;
  }
}

// -------- RE-EXTRACT FAILED (called from Apps Script menu) --------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TM Tools')
    .addItem('Re-extract failed student data', 'reExtractFailed')
    .addToUi();
}

function reExtractFailed() {
  var ss = getSheet();
  var sheet = ss.getSheetByName('Students_Count_Info');
  if (!sheet) { SpreadsheetApp.getUi().alert('Students_Count_Info tab not found.'); return; }
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var statusIdx = header.indexOf('Extraction Status');
  var photoIdx  = header.indexOf('Teams Info Photo');
  var subIdIdx  = header.indexOf('Submission ID');
  var schoolIdx = header.indexOf('School');
  var codeIdx   = header.indexOf('School Code');
  var gradeIdx  = header.indexOf('Grade');
  var secIdx    = header.indexOf('Section');
  var totalStudentsIdx = header.indexOf('Total Students');
  if (statusIdx < 0 || photoIdx < 0) { SpreadsheetApp.getUi().alert('Required columns not found.'); return; }

  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][statusIdx] || '');
    if (!status.startsWith('Error') && status !== 'In Progress') continue;
    var photoUrl = String(data[i][photoIdx] || '');
    if (!photoUrl) continue;
    var fileId = null;
    try {
      var m = photoUrl.match(/\/d\/([a-zA-Z0-9_-]+)\//);
      if (!m) m = photoUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (m) fileId = m[1];
    } catch(e) {}
    if (!fileId) continue;

    var imageBase64 = null;
    var imageMime = 'image/jpeg';
    try {
      var file = DriveApp.getFileById(fileId);
      imageMime = file.getMimeType() || 'image/jpeg';
      imageBase64 = Utilities.base64Encode(file.getBlob().getBytes());
    } catch(e) { continue; }

    var fakePayload = {
      submissionId: String(data[i][subIdIdx] || ''),
      header: {
        school: String(data[i][schoolIdx] || ''),
        schoolCode: String(data[i][codeIdx] || ''),
        grade: String(data[i][gradeIdx] || ''),
        section: String(data[i][secIdx] || '')
      },
      total: totalStudentsIdx >= 0 ? Number(data[i][totalStudentsIdx] || 0) : 0
    };
    var partnerName = getPartnerForSchool(ss, fakePayload.header.schoolCode);
    var targetSS = partnerName ? getOrCreatePartnerSheet(partnerName, ss) : ss;
    var reFolderId = null;
    if (partnerName) {
      try {
        var reCfg = getPartnerConfig(ss);
        var reEntry = reCfg[partnerName];
        if (reEntry && reEntry.folderId) reFolderId = reEntry.folderId;
      } catch(e) {}
    }
    extractStudentDataFromPhoto(imageBase64, photoUrl, fakePayload, targetSS, partnerName, reFolderId);
    count++;
  }
  SpreadsheetApp.getUi().alert('Re-extraction done for ' + count + ' row(s). Check Extraction Status column.');
}

function buildRowForm4(p) {
  var h = p.header || {};
  var common = {
    'Submission ID': p.submissionId || '',
    'Submitted At': p.submittedAt || new Date().toISOString(),
    'Form Version': p.formVersion || '',
    'Status': p.isEdit ? 'edited' : 'active',
    'Partner': h.partner || '',
    'School': h.school || '',
    'School Code': h.schoolCode || '',
    'Grade': h.grade || '',
    'Section': h.section || '',
    'Teacher': h.teacher || ''
  };
  var ack = p.teacherAck || '';
  return (p.sls || []).map(function(sl) {
    return Object.assign({}, common, {
      'SL Name': sl.name || '',
      'Interested in Role': sl.interested || '',
      'Attendance >90%': sl.attendance || '',
      'SL Status': sl.status || '',
      'Speaks Clearly': sl.clear || '',
      'Speaks Loudly': sl.loud || '',
      'Understands English': sl.english || '',
      'Teacher Acknowledged': ack
    });
  });
}

function buildRowForm5(p) {
  var h=p.header||{}, d=p.delivery||{}, gk=d.gradeKits||{};
  return {
    'Submission ID':p.submissionId||'','Submitted At':p.submittedAt||new Date().toISOString(),
    'Form Version':p.formVersion||'','Status':p.isEdit?'edited':'active',
    'Partner':h.partner||'','School':h.school||'','School Code':h.schoolCode||'',
    'Delivered By':d.deliveredBy||'','Received By':d.receivedBy||'',
    'Date of Delivery':d.deliveryDate||'','Grades':d.grades||'',
    'Grade 6 Kit':gk['6']||'','Grade 7 Kit':gk['7']||'','Grade 8 Kit':gk['8']||'','Grade 9 Kit':gk['9']||'',
    'Delivery Proof Photo':'','Acknowledgement Letter':''
  };
}

// -------- TAB / SHEET HELPERS --------

function getSheet() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSchemaColumns(sheet, schema) {
  var existingHeader = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  schema.columns.forEach(function(col, idx) {
    if (existingHeader.indexOf(col) >= 0) return;
    if (idx >= existingHeader.length) {
      sheet.getRange(1, existingHeader.length + 1).setValue(col);
      existingHeader.push(col);
    } else {
      sheet.insertColumnBefore(idx + 1);
      sheet.getRange(1, idx + 1).setValue(col);
      existingHeader.splice(idx, 0, col);
    }
    sheet.getRange(1, existingHeader.indexOf(col) + 1)
      .setFontWeight('bold').setBackground('#0D3B4A').setFontColor('#FFFFFF');
  });
}

function getOrCreateTab(ss, schema) {
  var sheet = ss.getSheetByName(schema.tabName);
  if (!sheet) {
    sheet = ss.insertSheet(schema.tabName);
    sheet.appendRow(schema.columns);
    var header = sheet.getRange(1, 1, 1, schema.columns.length);
    header.setFontWeight('bold').setBackground('#0D3B4A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  } else {
    ensureSchemaColumns(sheet, schema);
  }
  return sheet;
}

function getOrCreateUsersTab(ss) {
  var sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    var cols = ['Email','Name','Role','School Code','PIN','Active'];
    sheet.appendRow(cols);
    sheet.getRange(1,1,1,cols.length).setFontWeight('bold').setBackground('#0D3B4A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateSessionsTab(ss) {
  var sheet = ss.getSheetByName('Sessions');
  if (!sheet) {
    sheet = ss.insertSheet('Sessions');
    sheet.appendRow(['Token','Email','Expires At']);
    sheet.getRange(1,1,1,3).setFontWeight('bold').setBackground('#0D3B4A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreatePermissionsTab(ss) {
  var sheet = ss.getSheetByName('RolePermissions');
  if (!sheet) {
    sheet = ss.insertSheet('RolePermissions');
    var features = ['form1','form2','form3','form4','iifDash','tracker','editSubmit','adminPanel','buddy'];
    var header = ['Role'].concat(features);
    sheet.appendRow(header);
    sheet.appendRow(['Admin','Y','Y','Y','Y','Y','Y','Y','Y','Y']);
    sheet.appendRow(['IIF',  'Y','Y','Y','Y','Y','Y','Y','N','Y']);
    sheet.appendRow(['School','N','N','N','N','N','N','N','N','N']);
    sheet.getRange(1,1,1,header.length).setFontWeight('bold').setBackground('#0D3B4A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// -------- ENROLLMENT TALLY --------

function tallyEnrollment(c) {
  var t={sections:0,students:0,girls:0,boys:0,sls:0,teams:0};
  var perGrade=c.perGrade||{};
  Object.keys(perGrade).forEach(function(gr){
    var arr=(perGrade[gr]&&perGrade[gr].perSection)||[];
    arr.forEach(function(s){
      t.sections+=1; t.students+=Number(s.total)||0;
      t.girls+=Number(s.girls)||0; t.boys+=Number(s.boys)||0;
      t.sls+=Number(s.sls)||0; t.teams+=Number(s.teams)||0;
    });
  });
  return t;
}

// -------- UTILITIES --------

function makeUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0;
    return (c=='x'?r:(r&0x3|0x8)).toString(16);
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ======================================================================
// INQUI BUDDY — Team data & innovation evaluation
// ======================================================================

// -------- SHEET HELPERS --------

function getOrCreateTeamsTab(ss) {
  var sheet = ss.getSheetByName('TM_Teams_Data');
  if (!sheet) {
    sheet = ss.insertSheet('TM_Teams_Data');
    var cols = ['ExtractionID','SchoolCode','Partner','School','Grade','Section',
                'SL_Name','Cluster_ID','Team_ID','Students_JSON','Form2_SubID','ExtractedAt'];
    sheet.appendRow(cols);
    sheet.getRange(1,1,1,cols.length).setFontWeight('bold').setBackground('#0D3B4A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateEvaluationsTab(ss) {
  var sheet = ss.getSheetByName('TM_Evaluations');
  if (!sheet) {
    sheet = ss.insertSheet('TM_Evaluations');
    var cols = ['EvalID','SchoolCode','Partner','School','Grade','Section','TeamID','SL_Name','Cluster_ID',
                'ImageDriveURL','FeedbackText','EvaluatedAt','EvaluatedBy','AudioDriveURL'];
    sheet.appendRow(cols);
    sheet.getRange(1,1,1,cols.length).setFontWeight('bold').setBackground('#0D3B4A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// -------- GET TEAM DATA --------

function handleGetTeamData(p) {
  var schoolCode = (p.schoolCode || '').trim().toUpperCase();
  if (!schoolCode) return json({ status: 'error', message: 'schoolCode required' });
  var ss = getSheet();
  var partnerName = getPartnerForSchool(ss, schoolCode);
  var targetSS = partnerName ? getOrCreatePartnerSheet(partnerName, ss) : ss;
  var sheet = targetSS.getSheetByName('TM_Teams_Data');
  if (!sheet) return json({ status: 'ok', sls: [] });
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return json({ status: 'ok', sls: [] });
  var header = data[0];
  var scIdx  = header.indexOf('SchoolCode');
  var slIdx  = header.indexOf('SL_Name');
  var clIdx  = header.indexOf('Cluster_ID');
  var tmIdx  = header.indexOf('Team_ID');
  var stIdx  = header.indexOf('Students_JSON');
  var grIdx  = header.indexOf('Grade');
  var secIdx = header.indexOf('Section');
  // Group rows by SL → cluster → teams
  var slMap = {};
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][scIdx]).trim().toUpperCase() !== schoolCode) continue;
    var sl  = String(data[i][slIdx] || '').trim();
    var cl  = String(data[i][clIdx] || '').trim();
    var tm  = String(data[i][tmIdx] || '').trim();
    var gr  = String(data[i][grIdx] || '').trim();
    var sec = String(data[i][secIdx] || '').trim();
    var students = [];
    try { students = JSON.parse(data[i][stIdx] || '[]'); } catch(e) {}
    var key = sl + '|||' + cl + '|||' + gr + '|||' + sec;
    if (!slMap[key]) slMap[key] = { slName: sl, clusterId: cl, grade: gr, section: sec, teams: [] };
    if (tm) slMap[key].teams.push({ teamId: tm, students: students });
  }
  var sls = Object.values(slMap);
  return json({ status: 'ok', sls: sls });
}

// -------- GET SCHOOL SUMMARY (teams + evaluation status) --------

function handleGetSchoolSummary(p) {
  var schoolCode = (p.schoolCode || '').trim().toUpperCase();
  if (!schoolCode) return json({ status: 'error', message: 'schoolCode required' });
  var ss = getSheet();
  var partnerName = getPartnerForSchool(ss, schoolCode);
  var targetSS = partnerName ? getOrCreatePartnerSheet(partnerName, ss) : ss;

  // --- Read teams ---
  var teams = [];
  var teamsSheet = targetSS.getSheetByName('TM_Teams_Data');
  if (teamsSheet) {
    var tData = teamsSheet.getDataRange().getValues();
    if (tData.length > 1) {
      var th = tData[0];
      var tSc  = th.indexOf('SchoolCode');
      var tSl  = th.indexOf('SL_Name');
      var tCl  = th.indexOf('Cluster_ID');
      var tTm  = th.indexOf('Team_ID');
      var tSt  = th.indexOf('Students_JSON');
      var tGr  = th.indexOf('Grade');
      var tSec = th.indexOf('Section');
      for (var i = 1; i < tData.length; i++) {
        if (String(tData[i][tSc]).trim().toUpperCase() !== schoolCode) continue;
        var teamId = String(tData[i][tTm] || '').trim();
        if (!teamId) continue;
        var students = [];
        try { students = JSON.parse(tData[i][tSt] || '[]'); } catch(e) {}
        teams.push({
          teamId: teamId,
          slName: String(tData[i][tSl] || '').trim(),
          clusterId: String(tData[i][tCl] || '').trim(),
          grade: String(tData[i][tGr] || '').trim(),
          section: String(tData[i][tSec] || '').trim(),
          students: students,
          evaluated: false,
          feedback: '',
          imageUrl: '',
          evaluatedAt: ''
        });
      }
    }
  }

  // --- Read evaluations ---
  var evalSheet = targetSS.getSheetByName('TM_Evaluations');
  if (evalSheet) {
    var eData = evalSheet.getDataRange().getValues();
    if (eData.length > 1) {
      var eh  = eData[0];
      var eSc  = eh.indexOf('SchoolCode');
      var eTm  = eh.indexOf('TeamID');
      var eFb  = eh.indexOf('FeedbackText');
      var eImg = eh.indexOf('ImageDriveURL');
      var eAt  = eh.indexOf('EvaluatedAt');
      // Build map: teamId → latest eval row (later rows overwrite earlier)
      var evalMap = {};
      for (var j = 1; j < eData.length; j++) {
        if (String(eData[j][eSc]).trim().toUpperCase() !== schoolCode) continue;
        var tid = String(eData[j][eTm] || '').trim();
        if (!tid) continue;
        evalMap[tid] = {
          feedback: String(eData[j][eFb]  || ''),
          imageUrl: String(eData[j][eImg] || ''),
          evaluatedAt: String(eData[j][eAt] || '')
        };
      }
      // Merge into teams
      for (var k = 0; k < teams.length; k++) {
        var ev = evalMap[teams[k].teamId];
        if (ev) {
          teams[k].evaluated   = true;
          teams[k].feedback    = ev.feedback;
          teams[k].imageUrl    = ev.imageUrl;
          teams[k].evaluatedAt = ev.evaluatedAt;
        }
      }
    }
  }

  return json({ status: 'ok', teams: teams, schoolCode: schoolCode });
}

// -------- EXTRACT TEAM DATA FROM FORM 2 PHOTO --------

function handleExtractTeamData(payload) {
  var schoolCode = (payload.schoolCode || '').trim().toUpperCase();
  if (!schoolCode) return json({ status: 'error', message: 'schoolCode required' });
  var ss = getSheet();
  var partnerName = getPartnerForSchool(ss, schoolCode);
  var targetSS = partnerName ? getOrCreatePartnerSheet(partnerName, ss) : ss;
  var f2sheet = targetSS.getSheetByName('Form2_StudentData');
  if (!f2sheet) return json({ status: 'error', message: 'Form2_StudentData not found' });
  var f2data = f2sheet.getDataRange().getValues();
  var f2header = f2data[0];
  var scIdx    = f2header.indexOf('School Code');
  var p1Idx    = f2header.indexOf('Photo URL');
  var p2Idx    = f2header.indexOf('Photo2 URL');
  var subIdIdx = f2header.indexOf('Submission ID');
  var partIdx  = f2header.indexOf('Partner');
  var schoolIdx= f2header.indexOf('School');

  // Debug: collect all school codes seen in Form 2 to help diagnose mismatches
  var allCodes = [];
  var photos = [];
  var partner = '', schoolName = '';
  for (var i = 1; i < f2data.length; i++) {
    var rowCode = String(f2data[i][scIdx] || '').trim().toUpperCase();
    if (rowCode) allCodes.push(rowCode);
    if (rowCode !== schoolCode) continue;
    if (partner === '') partner = String(f2data[i][partIdx] || '');
    if (schoolName === '') schoolName = String(f2data[i][schoolIdx] || '');
    var subId = String(f2data[i][subIdIdx] || '');
    var url1  = String(f2data[i][p1Idx] || '').trim();
    var url2  = String(f2data[i][p2Idx] || '').trim();
    if (url1) photos.push({ subId: subId, url: url1, page: 1 });
    if (url2) photos.push({ subId: subId, url: url2, page: 2 });
  }
  if (!photos.length) {
    return json({
      status: 'error',
      message: 'No Form 2 photos found for school code "' + schoolCode + '". Codes in Form2_StudentData: [' + allCodes.join(', ') + ']'
    });
  }

  var teamsSheet = getOrCreateTeamsTab(targetSS);
  var totalExtracted = 0;
  var extractionBase = makeUUID();
  var errors = [];

  for (var pi = 0; pi < photos.length; pi++) {
    var photo = photos[pi];
    // Step 1: Extract Drive file ID
    var fileId = extractDriveFileId(photo.url);
    if (!fileId) {
      errors.push('Photo ' + (pi+1) + ': Could not extract file ID from URL: ' + photo.url);
      continue;
    }
    // Step 2: Download image from Drive
    var imageBase64 = null;
    var imageMime = 'image/jpeg';
    try {
      var file = DriveApp.getFileById(fileId);
      imageMime = file.getMimeType() || 'image/jpeg';
      imageBase64 = Utilities.base64Encode(file.getBlob().getBytes());
    } catch(e) {
      errors.push('Photo ' + (pi+1) + ' Drive access error (fileId=' + fileId + '): ' + e.message);
      continue;
    }
    // Step 3: Call GPT-4o vision
    var extractPrompt = [
      { role: 'system', content: 'You are an expert at extracting structured data from handwritten Indian school student database sheets.\n\nThe image shows a student database sheet with columns including: School Code, Section, Cluster (number), SL ID, SL Name, Team # (sequential like T1/T2/T3), Team Code (alphanumeric like TM26DA6A11), Student Name, Gender.\n\nExtract ALL SL blocks, their cluster numbers, the teams within each cluster, and student names in each team.\n\nIMPORTANT: For team_id, use the "Team Code" column value (the alphanumeric code like TM26DA6A11, TM26DA6A12) — NOT the sequential team number (T1, T2, T3).\n\nReturn ONLY valid JSON in this exact format (no explanation, no markdown):\n[\n  {\n    "sl_name": "Name of Student Leader",\n    "cluster_id": "Cluster number (e.g. 1, 2, 3)",\n    "grade": "Grade number if visible",\n    "section": "Section letter if visible",\n    "teams": [\n      {\n        "team_id": "Team Code (alphanumeric, e.g. TM26DA6A11)",\n        "students": ["Student Name 1", "Student Name 2"]\n      }\n    ]\n  }\n]\n\nIf grade or section are not visible in the image, use empty string. Extract all SL blocks visible on the page.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all SL, cluster, team, and student data from this student database sheet.' },
          { type: 'image_url', image_url: { url: 'data:' + imageMime + ';base64,' + imageBase64 } }
        ]
      }
    ];
    var rawResult = null;
    try {
      rawResult = callGemini(extractPrompt, 'gemini-2.5-flash', false);
    } catch(e) {
      errors.push('Photo ' + (pi+1) + ' Gemini error: ' + e.message);
      continue;
    }
    // Step 4: Parse JSON response
    var extracted = null;
    try {
      var cleaned = rawResult.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      extracted = JSON.parse(cleaned);
    } catch(e) {
      errors.push('Photo ' + (pi+1) + ' JSON parse failed. Raw response (first 300 chars): ' + String(rawResult).slice(0, 300));
      continue;
    }
    if (!Array.isArray(extracted)) {
      errors.push('Photo ' + (pi+1) + ': GPT-4o returned non-array. Type: ' + typeof extracted + '. Value: ' + JSON.stringify(extracted).slice(0, 200));
      continue;
    }
    // Step 5: Save rows to TM_Teams_Data
    for (var si = 0; si < extracted.length; si++) {
      var slBlock = extracted[si];
      var slName    = String(slBlock.sl_name || '').trim();
      var clusterId = String(slBlock.cluster_id || '').trim();
      var grade     = String(slBlock.grade || '').trim();
      var section   = String(slBlock.section || '').trim();
      var teams     = slBlock.teams || [];
      for (var ti = 0; ti < teams.length; ti++) {
        var team = teams[ti];
        teamsSheet.appendRow([
          extractionBase + '-' + pi + '-' + si + '-' + ti,
          schoolCode, partner, schoolName, grade, section,
          slName, clusterId, String(team.team_id || '').trim(),
          JSON.stringify(team.students || []),
          photo.subId, new Date().toISOString()
        ]);
        totalExtracted++;
      }
    }
  }
  return json({ status: 'ok', teamsExtracted: totalExtracted, errors: errors, photosFound: photos.length });
}

// -------- PROCESS INNOVATION (SCORE + FEEDBACK) --------

function handleProcessInnovation(payload) {
  var image = payload.image;
  if (!image || !image.data) return json({ status: 'error', message: 'Image data required' });
  var imageMime = image.mime || 'image/jpeg';
  var imageBase64 = image.data;

  var ss = getSheet();
  var partnerName = payload.partner || '';
  var partnerFolderId = null;
  if (partnerName) {
    try {
      var pCfg = getPartnerConfig(ss);
      var pEntry = pCfg[partnerName];
      if (pEntry && pEntry.folderId) partnerFolderId = pEntry.folderId;
    } catch(e) {}
  }

  // Upload idea image to Drive
  var ideaImageUrl = '';
  try {
    var folder = partnerFolderId
      ? getOrCreatePartnerSubFolder(partnerFolderId, 'TM_IdeaPhotos')
      : getOrCreateDriveFolder('TM_IdeaPhotos');
    var fileName = 'idea_' + (payload.schoolCode||'') + '_team' + (payload.teamId||'') + '_' + new Date().getTime() + '.jpg';
    var blob = Utilities.newBlob(Utilities.base64Decode(imageBase64), imageMime, fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    ideaImageUrl = file.getUrl();
  } catch(e) { /* non-fatal */ }

  // Generate feedback
  var feedbackMessages = buildBuddyFeedbackMessages(imageBase64, imageMime);
  var feedback = callGemini(feedbackMessages, 'gemini-2.5-flash', null);

  // Upload audio to Drive (optional)
  var audioDriveUrl = '';
  if (payload.audio && payload.audio.data) {
    try {
      var audioFolder = partnerFolderId
        ? getOrCreatePartnerSubFolder(partnerFolderId, 'TM_IdeaAudio')
        : getOrCreateDriveFolder('TM_IdeaAudio');
      var ext = (payload.audio.mime || 'audio/mpeg').split('/')[1] || 'mp3';
      var audioFileName = 'audio_' + (payload.schoolCode||'') + '_team' + (payload.teamId||'') + '_' + new Date().getTime() + '.' + ext;
      var audioBlob = Utilities.newBlob(Utilities.base64Decode(payload.audio.data), payload.audio.mime || 'audio/mpeg', audioFileName);
      var audioFile = audioFolder.createFile(audioBlob);
      audioFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      audioDriveUrl = audioFile.getUrl();
    } catch(e) { /* non-fatal */ }
  }

  // Save to partner's TM_Evaluations
  var partnerSS = getOrCreatePartnerSheet(partnerName, ss);
  var evalSheet = getOrCreateEvaluationsTab(partnerSS);
  evalSheet.appendRow([
    makeUUID(),
    payload.schoolCode || '', payload.partner || '', payload.school || '',
    payload.grade || '', payload.section || '', payload.teamId || '',
    payload.slName || '', payload.clusterId || '', ideaImageUrl,
    feedback, new Date().toISOString(), payload.evaluatedBy || '',
    audioDriveUrl
  ]);
  return json({ status: 'ok', feedback: feedback, imageUrl: ideaImageUrl, audioUrl: audioDriveUrl });
}

// -------- GEMINI HELPER --------

function callGemini(messages, model, jsonMode) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in Script Properties. Go to Extensions > Apps Script > Project Settings > Script Properties and add it.');

  var systemParts = [];
  var contents = [];

  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    if (msg.role === 'system') {
      var text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      systemParts.push({ text: text });
    } else {
      var parts = [];
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (var j = 0; j < msg.content.length; j++) {
          var part = msg.content[j];
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url') {
            var dataUrl = part.image_url.url;
            var match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
          }
        }
      }
      contents.push({ role: 'user', parts: parts });
    }
  }

  var reqPayload = {
    contents: contents,
    generationConfig: { temperature: 0.1 }
  };
  if (systemParts.length > 0) {
    reqPayload.systemInstruction = { parts: systemParts };
  }
  if (jsonMode) {
    reqPayload.generationConfig.responseMimeType = 'application/json';
  }

  var modelName = model || 'gemini-2.5-flash';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + apiKey;

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify(reqPayload),
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());
  if (result.error) throw new Error('Gemini error: ' + result.error.message);
  return result.candidates[0].content.parts[0].text;
}

// -------- DRIVE FILE ID EXTRACTOR --------

function extractDriveFileId(url) {
  if (!url) return null;
  var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// -------- PROMPT BUILDERS (translated from feedback_prompts.py) --------

function buildBuddyFeedbackMessages(imageBase64, imageMime) {
  var systemPrompt = getBuddyFeedbackSystemPrompt();
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Review the following student submission.\n\nPROBLEM & SOLUTION:\n[See the attached image — the student has written their problem statement and proposed solution on the sheet.]\n\nFirst internally decide:\n- Is this original and effortful?\nOR\n- Common / plagiarized / low effort?\n\nThen generate feedback strictly in the required format.'
        },
        { type: 'image_url', image_url: { url: 'data:' + imageMime + ';base64,' + imageBase64 } }
      ]
    }
  ];
}

function getBuddyFeedbackSystemPrompt() {
  return "You are an experienced innovation evaluator and design-thinking mentor working with Grade 6-10 student teams in India.\n\nYour role is to review student innovation submissions and provide structured, critical, and encouraging mentor-grade feedback.\n\nYou must think like a trained evaluator. Your feedback must reflect the evaluation rubric described below.\n\nMULTI-MODAL EVIDENCE HANDLING (CRITICAL):\nStudent submissions may include:\n- Problem text\n- Solution text\n- Prototype images, drawings, or physical builds\n- Additional documents (PDFs, notes, reports)\nYou must evaluate all available evidence together, while clearly distinguishing between sources.\n\nRules:\n- Text shows what the student claims\n- Prototype/images show what the student has actually built or demonstrated\n- Documents provide supporting context or validation\n- Do not assume missing information or introduce structures unless clearly described or visible\n- If something is not explained or visible, do not infer it\n- Identify gaps and mismatches: If something is claimed in text but not shown in prototype, question it. If something is shown in prototype but not explained in text, acknowledge it.\n- Evaluate prototype impact carefully: If the prototype adds new clarity about design, structure, or usage → treat it as strong evidence. If it only confirms what is already understood → do not upgrade evaluation. If it is unclear or unrelated → explicitly state this and do not use it for evaluation.\n- Distinguish design clarity vs technical depth: If the prototype shows what the solution is, how it looks, and how it is used → treat this as a strength. If deeper aspects (why it works, performance, durability) are missing → highlight this as a gap.\n\nEVALUATION RUBRIC (You must internally evaluate across ALL five areas):\n\nA. PROBLEM & USER\nEvaluate:\n- Is the problem real, meaningful, and relevant?\n- Is it specific and clearly defined?\n- Does the team show empathy toward users?\n- Is there evidence of observation, investigation, or real-world grounding?\n\nB. SOLUTIONING\nEvaluate:\n- Does the solution directly address the stated problem?\n- Is there a strong problem-solution fit?\n- Is the solution useful in practice?\n- Is it meaningfully different from common or existing solutions?\n- Is it scientifically or technically accurate?\n- Is it clearly explained how it works?\n\nC. PROTOTYPING & TESTING\nEvaluate:\n- Is the idea tangible beyond just a concept?\n- Has the team built, tested, or validated it in any way?\n- Does the prototype (if provided) clearly show how the solution works?\n- Does it add new understanding beyond the text?\n- Are there gaps between what is claimed and what is demonstrated?\n- Have they considered edge cases or failure scenarios?\n- Do they show systems thinking in how the solution operates in real-world use?\n\nD. IMPACT & SCALABILITY\nEvaluate:\n- How many people could benefit?\n- Is adoption realistic?\n- Is it affordable and practical?\n- What constraints might limit scaling?\n\nE. SUSTAINABILITY & ENVIRONMENT\nEvaluate:\n- Can the solution survive long-term?\n- Does it depend on limited resources?\n- Are environmental or social consequences considered?\n- Is stakeholder buy-in realistic?\n\nSTRICT OUTPUT RULES (MANDATORY):\n- Output must be CLEAN PLAIN TEXT.\n- Do NOT output JSON.\n- Do NOT use quotation marks.\n- Do NOT use markdown symbols.\n- Do NOT wrap output in code blocks.\n- Do NOT explain your reasoning.\n- Follow the exact heading names below.\n- Use \"-\" for bullet points only.\n- Do not exceed bullet limits.\n- Each feedback point must reference specific elements from the student's submission (materials, mechanism, user, or prototype)\n\nMANDATORY OUTPUT FORMAT:\n\nACKNOWLEDGEMENT:\n- Exactly 1-2 sentences\n- Clearly mention the idea title or name\n- Acknowledge the student's effort in identifying the problem and proposing a solution\n- Do NOT include evaluation, praise for specific components, or prototype-related comments\n- Keep it simple, respectful, and focused on recognizing the submission and intent.\n\nWHAT YOU DID WELL:\n- 3 to 4 bullet points identifying real strengths aligned to rubric criteria.\n- Each bullet must reflect a different evaluation rubric area\n- Do not give generic praise.\n- Use specific details from the student's submission (e.g., sensor, coconut shell, pipe, drawing, model)\n- If prototype or additional evidence is available, include it naturally in at least one bullet\n- Do not over-focus on the prototype; treat it as supporting evidence\n- Use simple, clear, student-friendly sentences\n\nTHINGS TO THINK MORE ABOUT:\n- 4 to 5 bullet points.\n- Each bullet must be a QUESTION.\n- Cover different feedback evaluation areas\n- Prioritize 1-2 questions from the areas where the idea shows the weakest thinking or reasoning\n- Include at least one question that helps the student improve their problem-solving or design thinking process\n- Do NOT provide solutions.\n- Push deeper thinking based on gaps in the idea\n- Use simple, clear sentences\n- Avoid long or complex questions\n\nLEVEL-UP NOTE:\n- 3 to 4 sentences in simple, clear language\n- Acknowledge the student's problem-solving journey and effort\n- Encourage them to keep exploring and improving their idea (growth mindset), referring to the feedback above.\n- Maintain a positive, motivating tone, calibrated to the idea's strength\n- The final sentence must include a program-aligned closing such as: \"Keep problem-solving, tinkering, and innovating — all the best!\"\n- Do NOT repeat specific feedback points\n\nSPECIAL HANDLING RULE:\n- Treat submissions as low-effort if the problem or solution is extremely brief, lacks explanation, or only states a generic solution without describing how it works, or is common or copied.\nIf the submission is low-effort:\n    - Do NOT generate full evaluator feedback.\n    - Provide acknowledgement.\n    - Appreciate empathy toward the problem.\n    - Ask only 2 to 3 reflective questions encouraging originality.\n    - Do NOT praise originality or depth.\n    - Encourage revisiting the design thinking process.\n    - However, if prototype or additional evidence shows clear effort or building, do not classify the idea as low effort\n\nTONE REQUIREMENTS:\n- Respectful\n- Mentor-like\n- Encouraging but intellectually challenging\n- Age appropriate for Grade 6-10\n- Never dismissive";
}

// ======================================================================
// SCHOOL BUDDY FLOW — Grade/Section navigation, idea upload, bulk feedback
// ======================================================================

// -------- PARTNER CONFIG HELPERS (Idea Feedback sheet) --------

function updatePartnerIdeaFeedbackId(ss, partnerName, sheetId) {
  var sheet = getOrCreatePartnerConfigTab(ss);
  var data = sheet.getDataRange().getValues();
  var header = data[0].map(function(h) { return String(h).trim(); });
  var colIdx = header.indexOf('IdeaFeedbackSheetId');
  if (colIdx < 0) {
    colIdx = header.length;
    sheet.getRange(1, colIdx + 1).setValue('IdeaFeedbackSheetId');
  }
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === partnerName) {
      sheet.getRange(i + 1, colIdx + 1).setValue(sheetId);
      return;
    }
  }
}

function getOrCreateIdeaFeedbackSheet(partnerName, partnerFolderId) {
  var ss = getSheet();
  var config = getPartnerConfig(ss);
  var entry = config[partnerName] || {};
  if (entry.ideaFeedbackSheetId) {
    try { return SpreadsheetApp.openById(entry.ideaFeedbackSheetId); } catch(e) {}
  }
  var newSS = SpreadsheetApp.create(partnerName + ' - TM Idea Feedback');
  if (partnerFolderId) {
    try {
      var file = DriveApp.getFileById(newSS.getId());
      DriveApp.getFolderById(partnerFolderId).addFile(file);
      DriveApp.getRootFolder().removeFile(file);
    } catch(e) { Logger.log('Could not move Idea Feedback sheet: ' + e.message); }
  }
  updatePartnerIdeaFeedbackId(ss, partnerName, newSS.getId());
  return newSS;
}

function getOrCreateIdeaFeedbackTab(ideaSS, schoolCode, grade) {
  var tabName = (schoolCode + '_Gr' + grade).replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 100);
  var sheet = ideaSS.getSheetByName(tabName);
  if (!sheet) {
    sheet = ideaSS.insertSheet(tabName);
    var defaultSheet = ideaSS.getSheetByName('Sheet1');
    if (defaultSheet) { try { ideaSS.deleteSheet(defaultSheet); } catch(e) {} }
    var cols = ['EvalID','TeamCode','SLName','ClusterID','Grade','Section',
                'SchoolCode','School','StudentNames','IdeaPhotoURL','AudioURL',
                'FeedbackText','GeneratedAt','SubmittedBy','EvalCount'];
    sheet.appendRow(cols);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, cols.length).setBackground('#0D3B4A').setFontColor('#ffffff').setFontWeight('bold');
  }
  return sheet;
}

function getOrCreateIdeaArtifactsFolder(partnerFolderId, partnerName) {
  var folderName = (partnerName || 'Default') + '_Idea Artifacts';
  if (partnerFolderId) {
    try {
      var parent = DriveApp.getFolderById(partnerFolderId);
      var iter = parent.getFoldersByName(folderName);
      return iter.hasNext() ? iter.next() : parent.createFolder(folderName);
    } catch(e) {}
  }
  var iter2 = DriveApp.getFoldersByName(folderName);
  return iter2.hasNext() ? iter2.next() : DriveApp.createFolder(folderName);
}

// -------- GET GRADES & SECTIONS (from Form 3 submissions) --------

function handleGetSchoolGradesAndSections(p) {
  var schoolCode = (p.schoolCode || '').trim().toUpperCase();
  if (!schoolCode) return json({ status: 'error', message: 'schoolCode required' });
  var ss = getSheet();
  var partnerName = getPartnerForSchool(ss, schoolCode);
  var targetSS = partnerName ? getOrCreatePartnerSheet(partnerName, ss) : ss;
  var schema = FORM_SCHEMAS['form3_student_data'];
  var sheet = targetSS.getSheetByName(schema.tabName);
  if (!sheet) return json({ status: 'ok', gradesAndSections: [] });
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var scIdx     = header.indexOf('School Code');
  var grIdx     = header.indexOf('Grade');
  var secIdx    = header.indexOf('Section');
  var statusIdx = header.indexOf('Status');
  var seen = {};
  var results = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][scIdx]).trim().toUpperCase() !== schoolCode) continue;
    if (statusIdx >= 0 && String(data[i][statusIdx]).toLowerCase() === 'superseded') continue;
    var grade   = String(data[i][grIdx]  || '').trim();
    var section = String(data[i][secIdx] || '').trim().toUpperCase();
    if (!grade || !section) continue;
    var key = grade + '|' + section;
    if (!seen[key]) { seen[key] = true; results.push({ grade: grade, section: section }); }
  }
  results.sort(function(a, b) {
    var gd = Number(a.grade) - Number(b.grade);
    return gd !== 0 ? gd : (a.section < b.section ? -1 : a.section > b.section ? 1 : 0);
  });

  // Read Form 1 enrollment data to get expected grade/section counts
  var expectedGrades = [];
  try {
    var f1Tab = targetSS.getSheetByName('School_Enrollment');
    if (f1Tab) {
      var f1Data = f1Tab.getDataRange().getValues();
      var f1Hdr  = f1Data[0];
      var f1Sc   = f1Hdr.indexOf('School Code');
      var f1Gd   = f1Hdr.indexOf('Grade Data');
      var f1St   = f1Hdr.indexOf('Status');
      for (var r = 1; r < f1Data.length; r++) {
        if (String(f1Data[r][f1Sc]||'').trim().toUpperCase() !== schoolCode) continue;
        if (f1St >= 0 && String(f1Data[r][f1St]||'').toLowerCase() === 'superseded') continue;
        var gradeDataStr = String(f1Data[r][f1Gd]||'').trim();
        var re = /Grade\s+(\d+):\s*\d+\s*students?,\s*(\d+)\s*sections?/gi;
        var m;
        while ((m = re.exec(gradeDataStr)) !== null) {
          expectedGrades.push({ grade: m[1], sectionCount: parseInt(m[2], 10) });
        }
        break; // first non-superseded Form 1 row for this school
      }
    }
  } catch(e) {}

  return json({ status: 'ok', gradesAndSections: results, expectedGrades: expectedGrades });
}

// -------- GET SCHOOL BUDDY TEAMS (from Student DB + idea status) --------

function handleGetSchoolBuddyTeams(p) {
  var schoolCode = (p.schoolCode || '').trim().toUpperCase();
  var grade      = (p.grade    || '').trim();
  var section    = (p.section  || '').trim().toUpperCase();
  if (!schoolCode || !grade || !section) {
    return json({ status: 'error', message: 'schoolCode, grade and section required' });
  }
  var ss = getSheet();
  var partnerName = getPartnerForSchool(ss, schoolCode);
  var pConfig = getPartnerConfig(ss);
  var pEntry  = pConfig[partnerName] || {};

  // Read teams from Student Database
  var teams = [];
  var teamMap = {}; // teamCode → team object (for dedup/grouping)
  if (pEntry.studentDbSheetId) {
    try {
      var dbSS  = SpreadsheetApp.openById(pEntry.studentDbSheetId);
      var tabName = schoolCode.replace(/[^a-zA-Z0-9_\- ]/g, '_').substring(0, 100).trim();
      var dbTab = dbSS.getSheetByName(tabName);
      if (dbTab) {
        var dbData   = dbTab.getDataRange().getValues();
        var dbHeader = dbData[0];
        var dbGrIdx  = dbHeader.indexOf('Grade');
        var dbSecIdx = dbHeader.indexOf('Section');
        var dbSlIdx  = dbHeader.indexOf('SL Name');
        var dbSlIdIdx= dbHeader.indexOf('SL ID');
        var dbClIdx  = dbHeader.indexOf('Cluster ID');
        var dbTcIdx  = dbHeader.indexOf('Team Code');
        var dbStIdx  = dbHeader.indexOf('Student Name');
        for (var i = 1; i < dbData.length; i++) {
          if (String(dbData[i][dbGrIdx]  || '').trim()               !== grade)   continue;
          if (String(dbData[i][dbSecIdx] || '').trim().toUpperCase() !== section)  continue;
          var tc = String(dbData[i][dbTcIdx] || '').trim();
          if (!tc) continue;
          if (!teamMap[tc]) {
            teamMap[tc] = {
              teamCode:  tc,
              slName:    String(dbData[i][dbSlIdx]   || '').trim(),
              slId:      String(dbData[i][dbSlIdIdx]  || '').trim(),
              clusterId: String(dbData[i][dbClIdx]   || '').trim(),
              grade:     grade,
              section:   section,
              students:  [],
              photoUrl:'', audioUrl:'', feedbackText:'', evalCount:0
            };
            teams.push(teamMap[tc]);
          }
          var sName = String(dbData[i][dbStIdx] || '').trim();
          if (sName) teamMap[tc].students.push(sName);
        }
      }
    } catch(e) { Logger.log('getSchoolBuddyTeams DB error: ' + e.message); }
  }

  // Merge idea status from Idea Feedback sheet
  if (pEntry.ideaFeedbackSheetId) {
    try {
      var ideaSS  = SpreadsheetApp.openById(pEntry.ideaFeedbackSheetId);
      var fbTabName = (schoolCode + '_Gr' + grade).replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 100);
      var fbTab   = ideaSS.getSheetByName(fbTabName);
      if (fbTab) {
        var fbData   = fbTab.getDataRange().getValues();
        var fbHeader = fbData[0];
        var fTc   = fbHeader.indexOf('TeamCode');
        var fSec  = fbHeader.indexOf('Section');
        var fPh   = fbHeader.indexOf('IdeaPhotoURL');
        var fAu   = fbHeader.indexOf('AudioURL');
        var fFb   = fbHeader.indexOf('FeedbackText');
        var fEc   = fbHeader.indexOf('EvalCount');
        for (var j = 1; j < fbData.length; j++) {
          if (String(fbData[j][fSec] || '').trim().toUpperCase() !== section) continue;
          var ftc = String(fbData[j][fTc] || '').trim();
          if (!ftc || !teamMap[ftc]) continue;
          teamMap[ftc].photoUrl     = String(fbData[j][fPh] || '').trim();
          teamMap[ftc].audioUrl     = String(fbData[j][fAu] || '').trim();
          teamMap[ftc].feedbackText = String(fbData[j][fFb] || '').trim();
          teamMap[ftc].evalCount    = Number(fbData[j][fEc] || 0);
        }
      }
    } catch(e) { Logger.log('getSchoolBuddyTeams idea status error: ' + e.message); }
  }

  return json({ status: 'ok', teams: teams });
}

// -------- SAVE IDEA ARTIFACT (photo or audio upload per team) --------

function handleSaveIdeaArtifact(payload) {
  var schoolCode   = (payload.schoolCode || '').trim().toUpperCase();
  var teamCode     = (payload.teamCode   || '').trim();
  var grade        = (payload.grade      || '').trim();
  var section      = (payload.section    || '').trim().toUpperCase();
  var school       = payload.school      || '';
  var partner      = payload.partner     || '';
  var slName       = payload.slName      || '';
  var clusterId    = payload.clusterId   || '';
  var students     = payload.students    || [];
  var artifactType = payload.artifactType|| 'photo';
  var fileObj      = payload.file        || {};
  var submittedBy  = payload.submittedBy || '';

  if (!schoolCode || !teamCode || !fileObj.data) {
    return json({ status: 'error', message: 'schoolCode, teamCode and file.data required' });
  }

  var ss = getSheet();
  var pConfig = getPartnerConfig(ss);
  var pEntry  = pConfig[partner] || {};
  var partnerFolderId = pEntry.folderId || '';

  // Get or create artifacts folder
  var artifactsFolder = getOrCreateIdeaArtifactsFolder(partnerFolderId, partner);

  // Determine file name and extension
  var ext      = artifactType === 'audio' ? ((fileObj.mime || 'audio/webm').split('/')[1] || 'webm') : 'jpg';
  var fileName = teamCode + '_Idea' + (artifactType === 'audio' ? 'Audio' : 'Pic') + '.' + ext;

  // Delete existing file with same name to replace it
  try {
    var existIter = artifactsFolder.getFilesByName(fileName);
    while (existIter.hasNext()) { existIter.next().setTrashed(true); }
  } catch(e) {}

  // Upload new file
  var fileUrl = '';
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(fileObj.data), fileObj.mime || 'image/jpeg', fileName);
    var uploadedFile = artifactsFolder.createFile(blob);
    try { uploadedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e2) {}
    fileUrl = uploadedFile.getUrl();
  } catch(e) {
    return json({ status: 'error', message: 'File upload failed: ' + e.message });
  }

  // Update Idea Feedback sheet
  var ideaSS  = getOrCreateIdeaFeedbackSheet(partner, partnerFolderId);
  var ideaTab = getOrCreateIdeaFeedbackTab(ideaSS, schoolCode, grade);
  var tabData  = ideaTab.getDataRange().getValues();
  var tabHdr   = tabData[0];
  var iTc  = tabHdr.indexOf('TeamCode');
  var iPh  = tabHdr.indexOf('IdeaPhotoURL');
  var iAu  = tabHdr.indexOf('AudioURL');

  // Find existing row
  var existRow = -1;
  for (var i = 1; i < tabData.length; i++) {
    if (String(tabData[i][iTc] || '').trim() === teamCode) { existRow = i + 1; break; }
  }

  if (existRow > 0) {
    var updateCol = (artifactType === 'audio' ? iAu : iPh) + 1;
    ideaTab.getRange(existRow, updateCol).setValue(fileUrl);
  } else {
    var studentNames = Array.isArray(students) ? students.join(', ') : String(students);
    var newRow = [
      makeUUID(), teamCode, slName, clusterId, grade, section,
      schoolCode, school, studentNames,
      artifactType === 'photo' ? fileUrl : '',
      artifactType === 'audio' ? fileUrl : '',
      '', '', submittedBy, 0
    ];
    ideaTab.appendRow(newRow);
  }

  return json({ status: 'ok', fileUrl: fileUrl });
}

// -------- GENERATE SECTION FEEDBACK (bulk AI feedback for all teams with photos) --------

function handleGenerateSectionFeedback(payload) {
  var schoolCode = (payload.schoolCode || '').trim().toUpperCase();
  var grade      = (payload.grade      || '').trim();
  var section    = (payload.section    || '').trim().toUpperCase();
  var partner    = payload.partner     || '';

  if (!schoolCode || !grade || !section) {
    return json({ status: 'error', message: 'schoolCode, grade and section required' });
  }

  var ss = getSheet();
  var pConfig = getPartnerConfig(ss);
  var pEntry  = pConfig[partner] || {};

  if (!pEntry.ideaFeedbackSheetId) {
    return json({ status: 'error', message: 'No idea feedback sheet found. Upload an idea photo first.' });
  }

  var ideaSS  = SpreadsheetApp.openById(pEntry.ideaFeedbackSheetId);
  var tabName = (schoolCode + '_Gr' + grade).replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 100);
  var ideaTab = ideaSS.getSheetByName(tabName);
  if (!ideaTab) {
    return json({ status: 'error', message: 'No ideas submitted for this grade yet.' });
  }

  var tabData = ideaTab.getDataRange().getValues();
  var tabHdr  = tabData[0];
  var iTc  = tabHdr.indexOf('TeamCode');
  var iSec = tabHdr.indexOf('Section');
  var iPh  = tabHdr.indexOf('IdeaPhotoURL');
  var iFb  = tabHdr.indexOf('FeedbackText');
  var iAt  = tabHdr.indexOf('GeneratedAt');
  var iEc  = tabHdr.indexOf('EvalCount');

  var teamCodesFilter = Array.isArray(payload.teamCodes) && payload.teamCodes.length > 0
    ? payload.teamCodes.map(function(c){ return String(c).trim(); })
    : null;

  var results = [];
  var errors  = [];

  for (var i = 1; i < tabData.length; i++) {
    if (String(tabData[i][iSec] || '').trim().toUpperCase() !== section) continue;
    var teamCode = String(tabData[i][iTc] || '').trim();
    if (teamCodesFilter && teamCodesFilter.indexOf(teamCode) === -1) continue;
    var photoUrl = String(tabData[i][iPh] || '').trim();
    if (!photoUrl) continue;

    // Download photo from Drive
    var imageBase64 = null;
    var imageMime   = 'image/jpeg';
    try {
      var fileId = extractDriveFileId(photoUrl);
      if (!fileId) throw new Error('Could not parse Drive file ID from URL');
      var driveFile = DriveApp.getFileById(fileId);
      imageMime   = driveFile.getMimeType() || 'image/jpeg';
      imageBase64 = Utilities.base64Encode(driveFile.getBlob().getBytes());
    } catch(e) {
      errors.push({ teamCode: teamCode, error: 'Photo access error: ' + e.message });
      continue;
    }

    // Generate feedback via Gemini
    var feedback = '';
    try {
      var msgs = buildBuddyFeedbackMessages(imageBase64, imageMime);
      feedback = callGemini(msgs, 'gemini-2.5-flash', null);
    } catch(e) {
      errors.push({ teamCode: teamCode, error: 'Gemini error: ' + e.message });
      continue;
    }

    // Update row
    var now = new Date().toISOString();
    var currentCount = Number(tabData[i][iEc] || 0);
    ideaTab.getRange(i + 1, iFb + 1).setValue(feedback);
    ideaTab.getRange(i + 1, iAt + 1).setValue(now);
    ideaTab.getRange(i + 1, iEc + 1).setValue(currentCount + 1);

    results.push({ teamCode: teamCode, feedback: feedback, evalCount: currentCount + 1 });
  }

  return json({ status: 'ok', results: results, errors: errors });
}

function handleGetTeamPhoto(payload) {
  var schoolCode = (payload.schoolCode || '').trim().toUpperCase();
  var teamCode   = (payload.teamCode   || '').trim();
  var grade      = (payload.grade      || '').trim();
  var partner    = (payload.partner    || '').trim();

  if (!schoolCode || !teamCode) {
    return json({ status: 'error', message: 'schoolCode and teamCode required' });
  }

  var ss = getSheet();
  var pConfig = getPartnerConfig(ss);
  var pEntry  = pConfig[partner] || {};
  var partnerFolderId = pEntry.folderId || '';

  var ideaSS  = getOrCreateIdeaFeedbackSheet(partner, partnerFolderId);
  var ideaTab = getOrCreateIdeaFeedbackTab(ideaSS, schoolCode, grade);
  var tabData = ideaTab.getDataRange().getValues();
  var tabHdr  = tabData[0];
  var iTc = tabHdr.indexOf('TeamCode');
  var iPh = tabHdr.indexOf('IdeaPhotoURL');

  var photoUrl = '';
  for (var i = 1; i < tabData.length; i++) {
    if (String(tabData[i][iTc] || '').trim() === teamCode) {
      photoUrl = String(tabData[i][iPh] || '').trim();
      break;
    }
  }

  if (!photoUrl) return json({ status: 'error', message: 'No photo found for team' });

  var match = photoUrl.match(/\/d\/([^\/\?]+)/);
  if (!match) return json({ status: 'error', message: 'Invalid Drive URL format' });

  try {
    var file = DriveApp.getFileById(match[1]);
    var mime = file.getMimeType() || 'image/jpeg';
    var b64  = Utilities.base64Encode(file.getBlob().getBytes());
    return json({ status: 'ok', base64: b64, mime: mime });
  } catch(e) {
    return json({ status: 'error', message: 'Could not read file: ' + e.message });
  }
}

/**
 * ระบบอบรมออนไลน์ การประยุกต์ใช้เทคโนโลยีเพื่อการจัดการเรียนการสอน
 * ฝั่ง API (Google Apps Script) ใช้ Google Sheet เป็นฐานข้อมูล
 * หน้าเว็บแขวนไว้บน GitHub Pages และเรียกข้อมูลผ่าน URL ของเว็บแอปนี้
 *
 * ผู้พัฒนา: นายสรวิศ จันพุ่ม ศึกษานิเทศก์ ปฏิบัติหน้าที่ ผอ.กลุ่ม DLICT
 *           สำนักงานเขตพื้นที่การศึกษาประถมศึกษานครศรีธรรมราช เขต 1
 *
 * วิธีเริ่มต้น
 * 1) สร้าง Google Sheet ใหม่ เปิดเมนู ส่วนขยาย > Apps Script
 * 2) วางโค้ดไฟล์นี้ใน Code.gs (ไฟล์เดียว ไม่ต้องมีไฟล์ HTML)
 * 3) เลือกฟังก์ชัน setup แล้วกด เรียกใช้ (ครั้งแรกต้องอนุญาตสิทธิ์)
 * 4) การทำให้ใช้งานได้ > การทำให้ใช้งานได้รายการใหม่ > เว็บแอป
 *    เรียกใช้ในฐานะ: ฉัน  ผู้มีสิทธิ์เข้าถึง: ทุกคน
 * 5) นำ URL ที่ลงท้ายด้วย /exec ไปใส่ในไฟล์ assets/js/config.js บน GitHub
 */

// ถ้าสคริปต์ผูกกับชีตอยู่แล้วให้เว้นว่าง ถ้าเป็นสคริปต์แยกให้ใส่ ID ของชีต
const SPREADSHEET_ID = '';
const TZ = 'Asia/Bangkok';
const SESSION_HOURS = 6;

// บัญชีผู้ดูแลระบบเริ่มต้น (สร้างเมื่อรัน setup ครั้งแรก) ควรเปลี่ยนรหัสผ่านทันทีหลังเข้าระบบ
const DEFAULT_ADMIN_EMAIL = 'admin@nst1.local';
const DEFAULT_ADMIN_PASSWORD = 'admin1234';

const SCHEMA = {
  Users: ['user_id', 'email', 'password_hash', 'salt', 'prefix', 'first_name', 'last_name', 'position', 'school', 'affiliation', 'phone', 'role', 'status', 'created_at', 'last_login', 'email_verified_at'],
  Courses: ['course_id', 'order', 'title', 'tool_name', 'description', 'objectives', 'hours', 'color', 'cover_url', 'pass_percent', 'status', 'created_at', 'enroll_open'],
  Lessons: ['lesson_id', 'course_id', 'order', 'title', 'youtube_url', 'duration_min', 'content', 'application', 'resource_url', 'status'],
  Questions: ['question_id', 'course_id', 'order', 'question', 'choice_a', 'choice_b', 'choice_c', 'choice_d', 'answer'],
  Progress: ['progress_key', 'user_id', 'course_id', 'lesson_id', 'watched_percent', 'completed', 'updated_at', 'completed_at'],
  QuizResults: ['result_id', 'user_id', 'course_id', 'score', 'total', 'percent', 'passed', 'submitted_at'],
  Enrollments: ['enroll_id', 'user_id', 'course_id', 'enrolled_at', 'status'],
  Certificates: ['cert_no', 'user_id', 'course_id', 'full_name', 'position', 'school', 'course_title', 'hours', 'issued_at'],
  Settings: ['key', 'value', 'description']
};

const DEFAULT_SETTINGS = [
  ['SITE_NAME', 'ระบบอบรมออนไลน์ การประยุกต์ใช้เทคโนโลยีเพื่อการจัดการเรียนการสอน', 'ชื่อระบบที่แสดงบนหน้าเว็บ'],
  ['PROGRAM_NAME', 'การประยุกต์ใช้เทคโนโลยีเพื่อการจัดการเรียนการสอน', 'ชื่อโครงการอบรมที่แสดงบนเกียรติบัตร'],
  ['ORG_NAME', 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษานครศรีธรรมราช เขต 1', 'หน่วยงานผู้จัดและผู้มอบเกียรติบัตร'],
  ['SIGNER_NAME', 'ชื่อ สกุล ผู้ลงนาม', 'ชื่อผู้ลงนามในเกียรติบัตร'],
  ['SIGNER_POSITION', 'ผู้อำนวยการสำนักงานเขตพื้นที่การศึกษาประถมศึกษานครศรีธรรมราช เขต 1', 'ตำแหน่งผู้ลงนาม'],
  ['MIN_WATCH_PERCENT', 80, 'ร้อยละการรับชมวิดีโอขั้นต่ำที่ถือว่าเรียนจบบทเรียน'],
  ['CERT_PREFIX', 'NST1-TECH', 'อักษรนำหน้าเลขที่เกียรติบัตร'],
  ['LOGO_FILE_ID', '', 'File ID ของภาพตราหน่วยงานใน Google Drive (PNG พื้นใส) เว้นว่างได้'],
  ['SIGNATURE_FILE_ID', '', 'File ID ของภาพลายมือชื่อผู้ลงนาม (PNG พื้นใส) เว้นว่างได้'],
  ['CERT_BG_FILE_ID', '', 'File ID ของภาพพื้นหลังเกียรติบัตรแนวนอน A4 เว้นว่างเพื่อใช้แบบมาตรฐานของระบบ'],
  ['REGISTRATION_OPEN', 'เปิด', 'เปิด หรือ ปิด การลงทะเบียนผู้ใช้ใหม่'],
  ['REQUIRE_EMAIL_VERIFY', 'เปิด', 'เปิด หรือ ปิด การยืนยันอีเมลด้วยรหัส 8 หลักเมื่อลงทะเบียน'],
  ['FRONTEND_URL', '', 'ที่อยู่หน้าเว็บบน GitHub Pages เช่น https://ชื่อผู้ใช้.github.io/tech-training/ ใช้สร้างลิงก์ตรวจสอบเกียรติบัตร'],
  ['DEVELOPER', 'นายสรวิศ จันพุ่ม ศึกษานิเทศก์ ปฏิบัติหน้าที่ ผอ.กลุ่ม DLICT', 'ข้อความผู้พัฒนาที่ส่วนท้ายหน้าเว็บ']
];

/* =========================================================
 * API สำหรับหน้าเว็บบน GitHub Pages
 * ========================================================= */

// ฟังก์ชันที่อนุญาตให้เรียกจากภายนอก (ฟังก์ชันที่ลงท้ายด้วย _ เรียกไม่ได้)
const API_ACTIONS = {
  getPublicSettings: getPublicSettings, register: register, login: login, logout: logout,
  verifyEmail: verifyEmail, resendOtp: resendOtp,
  updateProfile: updateProfile, changePassword: changePassword,
  getDashboard: getDashboard, getCourse: getCourse, saveProgress: saveProgress,
  enrollCourse: enrollCourse,
  getQuiz: getQuiz, submitQuiz: submitQuiz, getCertificate: getCertificate,
  verifyCertificate: verifyCertificate,
  adminGetData: adminGetData, adminSaveCourse: adminSaveCourse, adminDeleteCourse: adminDeleteCourse,
  adminSaveLesson: adminSaveLesson, adminDeleteLesson: adminDeleteLesson,
  adminSaveQuestion: adminSaveQuestion, adminDeleteQuestion: adminDeleteQuestion,
  adminSaveSettings: adminSaveSettings, adminReport: adminReport,
  adminUpdateUser: adminUpdateUser, adminResetPassword: adminResetPassword
};

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function runAction_(action, args) {
  const fn = API_ACTIONS[action];
  if (!fn) return { ok: false, error: 'ไม่รู้จักคำสั่ง ' + action };
  try {
    return { ok: true, data: fn.apply(null, Array.isArray(args) ? args : []) };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

// เพิ่มชีตหรือคอลัมน์ที่ขาดอัตโนมัติ เมื่ออัปเดตโค้ดรุ่นใหม่ทับระบบเดิม
function ensureSchema_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('SCHEMA_V3')) return;
  const ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    let s = ss.getSheetByName(name);
    if (!s) {
      s = ss.insertSheet(name);
      s.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]])
        .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
      s.setFrozenRows(1);
      return;
    }
    const head = s.getLastColumn() ? headers_(s) : [];
    SCHEMA[name].forEach(function (h) {
      if (head.indexOf(h) < 0) {
        s.getRange(1, head.length + 1).setValue(h).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
        head.push(h);
      }
    });
  });
  cache.put('SCHEMA_V3', '1', 21600);
}

function doPost(e) {
  try { ensureSchema_(); } catch (err) { /* ยังไม่ได้ setup */ }
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' }); }
  return json_(runAction_(String(body.action || ''), body.args));
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.verify) return renderVerifyPage_(String(p.verify));
  if (p.action === 'verifyCertificate') return json_(runAction_('verifyCertificate', [p.no]));
  if (p.action === 'getPublicSettings') return json_(runAction_('getPublicSettings', []));
  return json_({ ok: true, data: { service: 'tech-training-api', status: 'พร้อมใช้งาน' } });
}

function verifyCertificate(certNo) {
  const cert = readAll_('Certificates').find(function (c) { return String(c.cert_no) === String(certNo || '').trim(); });
  const st = getSettings_();
  if (!cert) return { found: false, org_name: st.ORG_NAME, site_name: st.SITE_NAME };
  return {
    found: true, org_name: st.ORG_NAME, site_name: st.SITE_NAME,
    cert_no: cert.cert_no, full_name: cert.full_name, position: cert.position, school: cert.school,
    course_title: cert.course_title, hours: cert.hours, issued_at_th: thaiDate_(cert.issued_at)
  };
}

function verifyUrl_(certNo) {
  let base = String(getSettings_().FRONTEND_URL || '').trim();
  if (base) {
    if (!/\/$/.test(base)) base += '/';
    return base + 'verify.html?no=' + encodeURIComponent(certNo);
  }
  return ScriptApp.getService().getUrl() + '?verify=' + encodeURIComponent(certNo);
}

function renderVerifyPage_(certNo) {
  const st = getSettings_();
  const cert = readAll_('Certificates').find(function (c) { return String(c.cert_no) === certNo; });
  let body;
  if (cert) {
    body = '<div class="ok">เกียรติบัตรนี้ออกโดยระบบจริง</div>' +
      '<table>' +
      row_('เลขที่', cert.cert_no) +
      row_('ชื่อ สกุล', cert.full_name) +
      row_('ตำแหน่ง', cert.position) +
      row_('สถานศึกษา', cert.school) +
      row_('หลักสูตร', cert.course_title) +
      row_('จำนวนชั่วโมง', cert.hours + ' ชั่วโมง') +
      row_('วันที่ออก', thaiDate_(cert.issued_at)) +
      '</table>';
  } else {
    body = '<div class="no">ไม่พบเกียรติบัตรเลขที่ ' + esc_(certNo) + ' ในระบบ</div>';
  }
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet">' +
    '<style>body{font-family:Sarabun,sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#0f172a}' +
    '.card{max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(15,23,42,.08)}' +
    'h1{font-size:20px;margin:0 0 4px}p{margin:0 0 18px;color:#64748b}table{width:100%;border-collapse:collapse}' +
    'td{padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}td:first-child{color:#64748b;width:34%}' +
    '.ok{background:#dcfce7;color:#166534;padding:12px 16px;border-radius:10px;font-weight:600;margin-bottom:16px}' +
    '.no{background:#fee2e2;color:#991b1b;padding:12px 16px;border-radius:10px;font-weight:600}</style></head><body>' +
    '<div class="card"><h1>ตรวจสอบเกียรติบัตร</h1><p>' + esc_(st.SITE_NAME) + '<br>' + esc_(st.ORG_NAME) + '</p>' +
    body + '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('ตรวจสอบเกียรติบัตร')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function row_(k, v) { return '<tr><td>' + esc_(k) + '</td><td>' + esc_(v) + '</td></tr>'; }
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* =========================================================
 * ติดตั้งระบบ
 * ========================================================= */

function setup() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    const head = SCHEMA[name];
    s.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    s.setFrozenRows(1);
  });
  // เบอร์โทรศัพท์เก็บเป็นข้อความเพื่อไม่ให้เลข 0 นำหน้าหาย
  const users = ss.getSheetByName('Users');
  users.getRange(2, SCHEMA.Users.indexOf('phone') + 1, users.getMaxRows() - 1, 1).setNumberFormat('@');

  // ค่าตั้งระบบ
  const existing = readAll_('Settings').map(function (r) { return r.key; });
  DEFAULT_SETTINGS.forEach(function (r) {
    if (existing.indexOf(r[0]) < 0) insert_('Settings', { key: r[0], value: r[1], description: r[2] });
  });

  // ผู้ดูแลระบบเริ่มต้น
  if (!readAll_('Users').some(function (u) { return u.role === 'admin'; })) {
    const salt = Utilities.getUuid();
    insert_('Users', {
      user_id: 'U' + Date.now(), email: DEFAULT_ADMIN_EMAIL,
      password_hash: hash_(DEFAULT_ADMIN_PASSWORD, salt), salt: salt,
      prefix: '', first_name: 'ผู้ดูแลระบบ', last_name: '', position: 'ผู้ดูแลระบบ',
      school: '', affiliation: '', phone: '', role: 'admin', status: 'ใช้งาน',
      created_at: new Date(), last_login: ''
    });
  }

  // ข้อมูลตัวอย่าง (สร้างเฉพาะเมื่อยังไม่มีหลักสูตร)
  if (readAll_('Courses').length === 0) seedSampleData_();

  const sheet1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1');
  if (sheet1 && ss.getSheets().length > 1 && sheet1.getLastRow() === 0) ss.deleteSheet(sheet1);
  CacheService.getScriptCache().remove('SETTINGS');
  clearCatalog_();
  Logger.log('ติดตั้งเรียบร้อย ผู้ดูแลระบบ: ' + DEFAULT_ADMIN_EMAIL + ' รหัสผ่าน: ' + DEFAULT_ADMIN_PASSWORD);
}

function seedSampleData_() {
  const now = new Date();
  const courses = [
    ['C001', 1, 'Canva สร้างสื่อการสอนอย่างมืออาชีพ', 'Canva',
      'เรียนรู้การใช้ Canva for Education ออกแบบสื่อการสอน ใบงาน อินโฟกราฟิก และงานนำเสนอ รวมถึงการมอบหมายงานให้นักเรียนสร้างผลงานร่วมกัน',
      '1. อธิบายเครื่องมือหลักของ Canva for Education ได้\n2. ออกแบบสื่อการสอนและใบงานจากแม่แบบได้\n3. ใช้ Canva จัดกิจกรรมการเรียนรู้แบบร่วมมือในชั้นเรียนได้',
      3, '#7c3aed'],
    ['C002', 2, 'ChatGPT ผู้ช่วยครูในการออกแบบการเรียนรู้', 'ChatGPT',
      'ฝึกเขียนคำสั่ง (Prompt) อย่างมีหลักการ เพื่อใช้ ChatGPT ช่วยออกแบบแผนการจัดการเรียนรู้ กิจกรรม Active Learning ข้อสอบ และเกณฑ์การประเมิน',
      '1. เขียนคำสั่งที่มีองค์ประกอบครบถ้วนได้\n2. ใช้ ChatGPT ช่วยออกแบบแผนและกิจกรรมการเรียนรู้ได้\n3. ตรวจสอบความถูกต้องและใช้ AI อย่างมีจริยธรรมได้',
      3, '#10a37f'],
    ['C003', 3, 'Gemini กับงานครูบน Google Workspace', 'Gemini',
      'ใช้ Gemini ร่วมกับ Google Docs, Slides, Sheets และ Classroom เพื่อสรุปเอกสาร สร้างสื่อ และวิเคราะห์ข้อมูลผลการเรียนของนักเรียน',
      '1. อธิบายการทำงานของ Gemini ร่วมกับ Google Workspace ได้\n2. ใช้ Gemini สร้างสื่อและสรุปเอกสารได้\n3. ใช้ Gemini ช่วยวิเคราะห์ข้อมูลผลการเรียนได้',
      3, '#1a73e8'],
    ['C004', 4, 'Claude ผู้ช่วยวิเคราะห์หลักสูตรและสร้างสื่อเชิงโต้ตอบ', 'Claude',
      'ใช้ Claude อ่านและวิเคราะห์เอกสารหลักสูตร ออกแบบหน่วยการเรียนรู้ และสร้างสื่อเชิงโต้ตอบ เช่น เกมทบทวนความรู้และแบบฝึกหัดออนไลน์',
      '1. ใช้ Claude วิเคราะห์เอกสารหลักสูตรและตัวชี้วัดได้\n2. ออกแบบหน่วยการเรียนรู้ร่วมกับ AI ได้\n3. สร้างสื่อเชิงโต้ตอบสำหรับนักเรียนได้',
      3, '#c2410c']
  ];
  courses.forEach(function (c) {
    insert_('Courses', {
      course_id: c[0], order: c[1], title: c[2], tool_name: c[3], description: c[4],
      objectives: c[5], hours: c[6], color: c[7], cover_url: '', pass_percent: 70,
      status: 'เผยแพร่', created_at: now, enroll_open: 'เปิด'
    });
  });

  const L = [
    ['C001', 'รู้จัก Canva for Education และการเปิดใช้บัญชีครู',
      'Canva for Education เปิดให้ครูและนักเรียนใช้งานฟีเจอร์ขั้นสูงโดยไม่มีค่าใช้จ่ายเมื่อยืนยันสถานะครู หน้าจอหลักประกอบด้วยแม่แบบ องค์ประกอบ ข้อความ การอัปโหลด และโฟลเดอร์ผลงาน',
      'ครูสามารถเริ่มจากการสร้างโฟลเดอร์ตามรายวิชา เก็บแม่แบบที่ใช้บ่อย และกำหนดชุดสีประจำรายวิชาเพื่อให้สื่อทุกชิ้นมีเอกลักษณ์ตรงกัน'],
    ['C001', 'ออกแบบสื่อการสอนและใบงานจากแม่แบบ',
      'หลักการออกแบบสื่อที่ดี ได้แก่ ความเรียบง่าย ลำดับความสำคัญของข้อมูล ตัวอักษรอ่านง่าย และสีที่ไม่เกิน 3 โทนหลัก การปรับแม่แบบให้ตรงกับตัวชี้วัด และการส่งออกเป็น PDF หรือภาพ',
      'ออกแบบใบความรู้ 1 หน้าและใบงาน 1 ชุดที่สอดคล้องกับตัวชี้วัดในแผนการจัดการเรียนรู้ของตนเอง แล้วนำไปใช้จริงในชั้นเรียน'],
    ['C001', 'ใช้ Canva จัดกิจกรรมการเรียนรู้แบบร่วมมือ',
      'การสร้างชั้นเรียนใน Canva การมอบหมายงานผ่านลิงก์หรือ Google Classroom การให้นักเรียนแก้ไขงานกลุ่มพร้อมกัน และการให้ข้อเสนอแนะผ่านความคิดเห็น',
      'มอบหมายให้นักเรียนทำอินโฟกราฟิกสรุปบทเรียนเป็นกลุ่ม แล้วใช้เกณฑ์การประเมิน (Rubric) ประเมินทั้งเนื้อหาและการออกแบบ'],
    ['C002', 'หลักการเขียนคำสั่ง (Prompt) สำหรับครู',
      'คำสั่งที่ได้ผลดีควรมีองค์ประกอบสำคัญ ได้แก่ บทบาท บริบท งานที่ต้องการ และรูปแบบผลลัพธ์ การให้ตัวอย่างและการปรับคำสั่งต่อเนื่องช่วยให้ได้คำตอบตรงความต้องการมากขึ้น',
      'ฝึกเขียนคำสั่งให้ระบุระดับชั้น ตัวชี้วัด เวลาเรียน และบริบทผู้เรียนของตนเองทุกครั้ง เพื่อให้ได้ผลลัพธ์ที่นำไปใช้ได้จริง'],
    ['C002', 'ออกแบบแผนการจัดการเรียนรู้และกิจกรรม Active Learning',
      'การใช้ ChatGPT ร่างแผนการจัดการเรียนรู้ตามรูปแบบที่โรงเรียนกำหนด การขอแนวคิดกิจกรรม Active Learning หลายแบบเพื่อเปรียบเทียบ และการปรับให้เหมาะกับผู้เรียนที่มีความแตกต่าง',
      'นำแผนที่ได้มาปรับด้วยวิจารณญาณของครู ตรวจสอบความสอดคล้องระหว่างจุดประสงค์ กิจกรรม และการวัดประเมินผลก่อนนำไปใช้'],
    ['C002', 'สร้างข้อสอบ เกณฑ์การประเมิน และการใช้ AI อย่างมีจริยธรรม',
      'การสร้างข้อสอบหลายระดับพฤติกรรมการเรียนรู้ การสร้างเกณฑ์การประเมินแบบรูบริก การตรวจสอบความถูกต้องของข้อมูล และการไม่นำข้อมูลส่วนบุคคลของนักเรียนใส่ในระบบ AI',
      'ทุกครั้งที่ใช้ข้อสอบจาก AI ครูต้องตรวจคำตอบและความถูกต้องของเนื้อหาด้วยตนเอง และสอนนักเรียนให้ใช้ AI อย่างรับผิดชอบ'],
    ['C003', 'รู้จัก Gemini และการทำงานร่วมกับ Google Workspace',
      'Gemini เป็นผู้ช่วย AI ของ Google ที่ใช้งานได้ทั้งผ่านเว็บและภายในแอป Google Workspace การเปิดใช้งานขึ้นกับประเภทบัญชีและนโยบายของหน่วยงาน',
      'สำรวจว่าบัญชีที่โรงเรียนใช้อยู่เปิดใช้ Gemini ในแอปใดได้บ้าง และวางแผนใช้กับงานที่ทำซ้ำบ่อย เช่น การสรุปเอกสารประชุม'],
    ['C003', 'ใช้ Gemini สรุปเอกสารและสร้างสื่อใน Docs และ Slides',
      'การสั่งให้ Gemini สรุปสาระสำคัญจากเอกสาร ร่างใบความรู้ และสร้างโครงร่างสไลด์ การปรับภาษาให้เหมาะกับวัยของผู้เรียน',
      'สร้างใบความรู้ที่ปรับระดับภาษาได้ 2 ระดับ สำหรับนักเรียนที่เรียนเร็วและนักเรียนที่ต้องการการช่วยเหลือ'],
    ['C003', 'ใช้ Gemini ช่วยวิเคราะห์ข้อมูลผลการเรียนใน Sheets',
      'การนำคะแนนมาจัดในตาราง การสั่งให้ช่วยสร้างสูตรคำนวณ สรุปค่าเฉลี่ยและการกระจาย และสร้างแผนภูมิเพื่อหาจุดที่ต้องพัฒนา',
      'วิเคราะห์ผลการทดสอบก่อนเรียนและหลังเรียนของห้องตนเอง เพื่อใช้เป็นข้อมูลในการซ่อมเสริมและการจัด PLC'],
    ['C004', 'รู้จัก Claude และการอ่านเอกสารยาว',
      'Claude เป็นผู้ช่วย AI ที่อ่านเอกสารยาวได้ดี สามารถแนบไฟล์หลักสูตร ตัวชี้วัด หรือรายงาน แล้วตั้งคำถามเพื่อสรุป วิเคราะห์ และเปรียบเทียบได้',
      'แนบเอกสารหลักสูตรสถานศึกษาแล้วให้ช่วยสรุปตัวชี้วัดและสาระการเรียนรู้แกนกลางของรายวิชาที่ตนสอน'],
    ['C004', 'วิเคราะห์หลักสูตรและออกแบบหน่วยการเรียนรู้',
      'การให้ Claude ช่วยวิเคราะห์ความสัมพันธ์ระหว่างตัวชี้วัด สมรรถนะ และสาระ แล้วจัดกลุ่มเป็นหน่วยการเรียนรู้ พร้อมเสนอชิ้นงานและการประเมินตามสภาพจริง',
      'ออกแบบหน่วยการเรียนรู้ 1 หน่วยแบบย้อนกลับ (Backward Design) โดยใช้ AI ช่วยตรวจความสอดคล้องของแต่ละองค์ประกอบ'],
    ['C004', 'สร้างสื่อเชิงโต้ตอบสำหรับนักเรียน',
      'การสั่งให้ Claude สร้างหน้าเว็บสื่อการเรียนรู้ เกมทบทวนความรู้ หรือแบบฝึกหัดที่ตรวจคำตอบได้ทันที แล้วแบ่งปันลิงก์ให้นักเรียนใช้งาน',
      'สร้างเกมทบทวนคำศัพท์หรือแบบฝึกหัด 10 ข้อสำหรับบทเรียนที่สอน และเก็บข้อมูลผลการใช้งานเพื่อปรับปรุงสื่อ']
  ];
  const counter = {};
  L.forEach(function (r, i) {
    counter[r[0]] = (counter[r[0]] || 0) + 1;
    insert_('Lessons', {
      lesson_id: 'L' + pad_(i + 1, 4), course_id: r[0], order: counter[r[0]], title: r[1],
      youtube_url: '', duration_min: 10, content: r[2], application: r[3], resource_url: '', status: 'เผยแพร่'
    });
  });

  const Q = [
    ['C001', 'ข้อใดเป็นหลักการออกแบบสื่อการสอนที่เหมาะสม', 'ใช้สีให้มากที่สุดเพื่อดึงดูดความสนใจ', 'จัดลำดับความสำคัญของข้อมูลและใช้ตัวอักษรอ่านง่าย', 'ใส่ข้อความให้เต็มพื้นที่', 'ใช้แบบอักษรหลายแบบในหน้าเดียว', 'B'],
    ['C001', 'การให้นักเรียนแก้ไขงานกลุ่มใน Canva พร้อมกัน สนับสนุนการเรียนรู้รูปแบบใดมากที่สุด', 'การเรียนรู้แบบท่องจำ', 'การเรียนรู้แบบร่วมมือ', 'การบรรยาย', 'การทดสอบรายบุคคล', 'B'],
    ['C001', 'ไฟล์รูปแบบใดเหมาะสำหรับส่งใบงานให้นักเรียนพิมพ์', 'PDF', 'MP3', 'GIF', 'MP4', 'A'],
    ['C002', 'องค์ประกอบใดช่วยให้คำสั่ง (Prompt) ได้ผลลัพธ์ตรงความต้องการมากขึ้น', 'ใช้คำสั่งสั้นที่สุด', 'ระบุบทบาท บริบท งาน และรูปแบบผลลัพธ์', 'ใช้ภาษาอังกฤษเท่านั้น', 'ถามคำถามเดียวซ้ำหลายครั้ง', 'B'],
    ['C002', 'ข้อใดเป็นการใช้ AI อย่างมีจริยธรรม', 'นำข้อมูลส่วนบุคคลของนักเรียนใส่ในระบบ', 'ใช้ข้อสอบจาก AI โดยไม่ตรวจสอบ', 'ตรวจสอบความถูกต้องก่อนนำไปใช้', 'ให้ AI ตัดสินผลการเรียนแทนครู', 'C'],
    ['C002', 'เมื่อได้แผนการจัดการเรียนรู้จาก ChatGPT ครูควรทำอย่างไรเป็นลำดับแรก', 'นำไปใช้ทันที', 'ตรวจความสอดคล้องของจุดประสงค์ กิจกรรม และการประเมิน', 'ส่งให้ผู้บริหารโดยไม่แก้ไข', 'ลบแล้วสร้างใหม่', 'B'],
    ['C003', 'Gemini สามารถช่วยงานใดใน Google Sheets ได้', 'ช่วยสร้างสูตรและสรุปข้อมูล', 'ซ่อมเครื่องคอมพิวเตอร์', 'ส่งคะแนนเข้าระบบของกระทรวงอัตโนมัติ', 'ตรวจข้อสอบอัตนัยด้วยลายมือ', 'A'],
    ['C003', 'การปรับระดับภาษาของใบความรู้ด้วย AI สอดคล้องกับแนวคิดใด', 'การสอนแบบเดียวกันทุกคน', 'การจัดการเรียนรู้ตามความแตกต่างของผู้เรียน', 'การลดเวลาเรียน', 'การทดสอบแบบอิงกลุ่ม', 'B'],
    ['C003', 'ผลการวิเคราะห์คะแนนก่อนเรียนและหลังเรียนควรนำไปใช้ในเรื่องใด', 'การซ่อมเสริมและการแลกเปลี่ยนใน PLC', 'การจัดอันดับครู', 'การลงโทษนักเรียน', 'ไม่ต้องนำไปใช้', 'A'],
    ['C004', 'จุดเด่นของ Claude ที่เหมาะกับงานวิเคราะห์หลักสูตรคือข้อใด', 'อ่านและสรุปเอกสารยาวได้ดี', 'ตัดต่อวิดีโอ', 'พิมพ์เอกสารออกเครื่องพิมพ์', 'สแกนลายนิ้วมือ', 'A'],
    ['C004', 'การออกแบบหน่วยการเรียนรู้แบบย้อนกลับเริ่มต้นจากข้อใด', 'เลือกกิจกรรมที่ชอบ', 'กำหนดผลลัพธ์การเรียนรู้ที่ต้องการ', 'เลือกสื่อการสอน', 'กำหนดเวลาสอบ', 'B'],
    ['C004', 'สื่อเชิงโต้ตอบที่ตรวจคำตอบได้ทันทีช่วยผู้เรียนในด้านใด', 'ได้รับข้อมูลย้อนกลับอย่างรวดเร็ว', 'ลดการคิด', 'ไม่ต้องอ่านบทเรียน', 'ใช้เวลาเรียนมากขึ้นโดยไม่จำเป็น', 'A']
  ];
  const qc = {};
  Q.forEach(function (q, i) {
    qc[q[0]] = (qc[q[0]] || 0) + 1;
    insert_('Questions', {
      question_id: 'Q' + pad_(i + 1, 4), course_id: q[0], order: qc[q[0]], question: q[1],
      choice_a: q[2], choice_b: q[3], choice_c: q[4], choice_d: q[5], answer: q[6]
    });
  });
}

/* =========================================================
 * เครื่องมือจัดการฐานข้อมูล Google Sheet
 * ========================================================= */

function ss_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function sh_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('ไม่พบชีต ' + name + ' กรุณารันฟังก์ชัน setup() ก่อนใช้งาน');
  return s;
}

function headers_(s) {
  return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
}

function norm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
  return v;
}

function readAll_(name) {
  const s = sh_(name);
  const last = s.getLastRow();
  if (last < 2) return [];
  const values = s.getRange(1, 1, last, s.getLastColumn()).getValues();
  const head = values.shift().map(String);
  const out = [];
  values.forEach(function (r) {
    if (r.join('') === '') return;
    const o = {};
    head.forEach(function (h, i) { o[h] = norm_(r[i]); });
    out.push(o);
  });
  return out;
}

function findRow_(name, key, val) {
  const s = sh_(name);
  const last = s.getLastRow();
  if (last < 2) return -1;
  const col = headers_(s).indexOf(key) + 1;
  if (col < 1) return -1;
  const vals = s.getRange(2, col, last - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(val)) return i + 2;
  }
  return -1;
}

function insert_(name, obj) {
  const s = sh_(name);
  const head = headers_(s);
  s.appendRow(head.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }));
}

function update_(name, key, val, obj) {
  const row = findRow_(name, key, val);
  if (row < 0) return false;
  const s = sh_(name);
  const head = headers_(s);
  const cur = s.getRange(row, 1, 1, head.length).getValues()[0];
  const next = head.map(function (h, i) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : cur[i]; });
  s.getRange(row, 1, 1, head.length).setValues([next]);
  return true;
}

function deleteWhere_(name, key, val) {
  const s = sh_(name);
  const last = s.getLastRow();
  if (last < 2) return 0;
  const col = headers_(s).indexOf(key) + 1;
  const vals = s.getRange(2, col, last - 1, 1).getValues();
  let n = 0;
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === String(val)) { s.deleteRow(i + 2); n++; }
  }
  return n;
}

function nextId_(name, key, prefix, width) {
  let max = 0;
  readAll_(name).forEach(function (r) {
    const m = String(r[key]).match(/(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + pad_(max + 1, width);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function pad_(n, w) { return String(n).padStart(w, '0'); }
function byOrder_(a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); }
function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function hash_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
function thaiDate_(v) {
  const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T') + '+07:00');
  if (isNaN(d.getTime())) return String(v || '');
  const p = Utilities.formatDate(d, TZ, 'd|M|yyyy').split('|');
  return p[0] + ' ' + TH_MONTHS[Number(p[1]) - 1] + ' พ.ศ. ' + (Number(p[2]) + 543);
}

/* =========================================================
 * ค่าตั้งระบบ
 * ========================================================= */

function getSettings_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('SETTINGS');
  if (c) return JSON.parse(c);
  const st = {};
  DEFAULT_SETTINGS.forEach(function (r) { st[r[0]] = r[1]; });
  try {
    readAll_('Settings').forEach(function (r) { st[r.key] = r.value; });
    cache.put('SETTINGS', JSON.stringify(st), 600);
  } catch (e) { /* ยังไม่ได้ setup */ }
  return st;
}

function publicSettings_() {
  const st = getSettings_();
  return {
    SITE_NAME: st.SITE_NAME, PROGRAM_NAME: st.PROGRAM_NAME, ORG_NAME: st.ORG_NAME,
    MIN_WATCH_PERCENT: Number(st.MIN_WATCH_PERCENT) || 80,
    REGISTRATION_OPEN: st.REGISTRATION_OPEN !== 'ปิด', DEVELOPER: st.DEVELOPER
  };
}

function getPublicSettings() { return publicSettings_(); }

/* =========================================================
 * การยืนยันตัวตน
 * ========================================================= */

function publicUser_(u) {
  return {
    user_id: u.user_id, email: u.email, prefix: u.prefix, first_name: u.first_name, last_name: u.last_name,
    position: u.position, school: u.school, affiliation: u.affiliation, phone: String(u.phone || ''),
    role: u.role, full_name: fullName_(u)
  };
}

function fullName_(u) {
  return (String(u.prefix || '') + String(u.first_name || '') + ' ' + String(u.last_name || '')).trim();
}

function clearUserCache_(userId) { CacheService.getScriptCache().remove('U_' + userId); }

// ข้อมูลหลักสูตร บทเรียน และข้อสอบ เปลี่ยนไม่บ่อย จึงเก็บในแคชและล้างเมื่อผู้ดูแลแก้ไข
function catalog_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('CATALOG');
  if (c) { try { return JSON.parse(c); } catch (e) { /* อ่านใหม่ */ } }
  const cat = { courses: readAll_('Courses'), lessons: readAll_('Lessons'), questions: readAll_('Questions') };
  try { cache.put('CATALOG', JSON.stringify(cat), 21600); } catch (e) { /* ข้อมูลใหญ่เกินแคช ใช้การอ่านตรง */ }
  return cat;
}
function clearCatalog_() { CacheService.getScriptCache().remove('CATALOG'); }

function createSession_(userId) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('S_' + token, userId, SESSION_HOURS * 3600);
  return token;
}

function auth_(token, needAdmin) {
  if (!token) throw new Error('SESSION_EXPIRED');
  const cache = CacheService.getScriptCache();
  const uid = cache.get('S_' + token);
  if (!uid) throw new Error('SESSION_EXPIRED');
  cache.put('S_' + token, uid, SESSION_HOURS * 3600);
  // เก็บข้อมูลผู้ใช้ในแคช 5 นาที ไม่ต้องอ่านชีต Users ทุกคำขอ
  let u = null;
  const cu = cache.get('U_' + uid);
  if (cu) { try { u = JSON.parse(cu); } catch (e) { u = null; } }
  if (!u) {
    u = readAll_('Users').find(function (x) { return String(x.user_id) === uid; });
    if (u) cache.put('U_' + uid, JSON.stringify(u), 300);
  }
  if (!u || u.status === 'ระงับ' || u.status === STATUS_PENDING) throw new Error('SESSION_EXPIRED');
  if (needAdmin && u.role !== 'admin') throw new Error('ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ');
  return u;
}

/* ---------- การยืนยันอีเมลด้วยรหัสลับ 8 หลัก ---------- */

const STATUS_PENDING = 'รอยืนยันอีเมล';
const OTP_TTL_MIN = 10;          // รหัสมีอายุ 10 นาที
const OTP_MAX_TRIES = 5;         // กรอกผิดได้ไม่เกิน 5 ครั้งต่อรหัส
const OTP_RESEND_SEC = 60;       // ขอรหัสใหม่ได้ทุก 60 วินาที
const OTP_MAX_SEND_HOUR = 5;     // ส่งรหัสไปยังอีเมลเดียวกันได้ไม่เกิน 5 ครั้งต่อชั่วโมง

function verifyRequired_() { return String(getSettings_().REQUIRE_EMAIL_VERIFY || 'เปิด') !== 'ปิด'; }

// สุ่มเลข 8 หลักจาก UUID (สุ่มด้วยตัวสร้างของ Google) ไม่ใช้ Math.random
function otpCode_() {
  const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  let n = 0;
  for (let i = 0; i < hex.length; i++) n = (n * 16 + parseInt(hex[i], 16)) % 100000000;
  return pad_(n, 8);
}

function maskEmail_(email) {
  const p = String(email).split('@');
  const name = p[0];
  const shown = name.length <= 2 ? name.charAt(0) : name.slice(0, 2);
  return shown + '*'.repeat(Math.max(2, name.length - shown.length)) + '@' + (p[1] || '');
}

function sendOtp_(user, force) {
  const cache = CacheService.getScriptCache();
  const email = String(user.email).toLowerCase();
  const cdKey = 'OTPCD_' + email, cntKey = 'OTPN_' + email;
  if (!force && cache.get(cdKey)) {
    const left = Math.max(1, Math.ceil((Number(cache.get(cdKey)) - Date.now()) / 1000));
    return { email: email, email_masked: maskEmail_(email), resend_after: left, expires_in: OTP_TTL_MIN * 60, sent: false };
  }
  const count = Number(cache.get(cntKey) || 0);
  if (count >= OTP_MAX_SEND_HOUR) throw new Error('ขอรหัสยืนยันเกินจำนวนที่กำหนด กรุณารอ 1 ชั่วโมงแล้วลองใหม่');

  const code = otpCode_();
  const salt = Utilities.getUuid();
  cache.put('OTP_' + email, JSON.stringify({ h: hash_(code, salt), s: salt, t: 0 }), OTP_TTL_MIN * 60);
  cache.put(cdKey, String(Date.now() + OTP_RESEND_SEC * 1000), OTP_RESEND_SEC);
  cache.put(cntKey, String(count + 1), 3600);

  const st = getSettings_();
  const name = fullName_(user);
  const spaced = code.slice(0, 4) + ' ' + code.slice(4);
  const html =
    '<div style="font-family:Sarabun,Tahoma,sans-serif;max-width:520px;margin:auto;color:#0f172a">' +
    '<h2 style="color:#1e3a8a;margin-bottom:4px">ยืนยันอีเมลสำหรับการลงทะเบียน</h2>' +
    '<p style="color:#64748b;margin-top:0">' + esc_(st.SITE_NAME) + '</p>' +
    '<p>เรียน ' + esc_(name) + '</p>' +
    '<p>รหัสยืนยันตัวตนของท่านคือ</p>' +
    '<div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#eff6ff;color:#1e3a8a;padding:16px;text-align:center;border-radius:12px">' + spaced + '</div>' +
    '<p>กรุณากรอกรหัสนี้ในหน้าลงทะเบียนภายใน ' + OTP_TTL_MIN + ' นาที</p>' +
    '<p style="color:#b91c1c">ห้ามเปิดเผยรหัสนี้แก่ผู้อื่น เจ้าหน้าที่จะไม่สอบถามรหัสนี้จากท่านไม่ว่ากรณีใด</p>' +
    '<p style="color:#64748b;font-size:13px">หากท่านไม่ได้ลงทะเบียน กรุณาเพิกเฉยต่ออีเมลฉบับนี้<br>' + esc_(st.ORG_NAME) + '</p></div>';
  MailApp.sendEmail({
    to: email,
    subject: 'รหัสยืนยันอีเมล ' + spaced + ' ' + st.SITE_NAME,
    htmlBody: html,
    body: 'รหัสยืนยันอีเมลของท่านคือ ' + code + ' ใช้ได้ภายใน ' + OTP_TTL_MIN + ' นาที ห้ามเปิดเผยรหัสนี้แก่ผู้อื่น',
    name: 'ระบบอบรมออนไลน์'
  });
  return { email: email, email_masked: maskEmail_(email), resend_after: OTP_RESEND_SEC, expires_in: OTP_TTL_MIN * 60, sent: true };
}

function pendingResult_(user, force) {
  const r = sendOtp_(user, force);
  r.need_verify = true;
  return r;
}

function register(data) {
  const st = getSettings_();
  if (st.REGISTRATION_OPEN === 'ปิด') throw new Error('ขณะนี้ปิดรับลงทะเบียน');
  data = data || {};
  const email = String(data.email || '').trim().toLowerCase();
  const pw = String(data.password || '');
  const required = { first_name: 'ชื่อ', last_name: 'สกุล', position: 'ตำแหน่ง', school: 'สถานศึกษา/หน่วยงาน' };
  Object.keys(required).forEach(function (k) {
    if (!String(data[k] || '').trim()) throw new Error('กรุณากรอก' + required[k]);
  });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  if (pw.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
  const needVerify = verifyRequired_();

  const user = withLock_(function () {
    const old = readAll_('Users').find(function (u) { return String(u.email).toLowerCase() === email; });
    if (old && old.status !== STATUS_PENDING) throw new Error('อีเมลนี้ลงทะเบียนแล้ว กรุณาเข้าสู่ระบบ');
    const salt = Utilities.getUuid();
    const rec = {
      email: email, password_hash: hash_(pw, salt), salt: salt,
      prefix: String(data.prefix || '').trim(), first_name: String(data.first_name).trim(),
      last_name: String(data.last_name).trim(), position: String(data.position).trim(),
      school: String(data.school).trim(), affiliation: String(data.affiliation || '').trim(),
      phone: String(data.phone || '').trim(), role: 'teacher',
      status: needVerify ? STATUS_PENDING : 'ใช้งาน',
      last_login: needVerify ? '' : new Date()
    };
    if (old) {
      // ลงทะเบียนซ้ำขณะยังไม่ยืนยัน ให้ปรับข้อมูลตามที่กรอกล่าสุด
      update_('Users', 'user_id', old.user_id, rec);
      return Object.assign({}, old, rec);
    }
    rec.user_id = 'U' + Date.now() + Math.floor(Math.random() * 1000);
    rec.created_at = new Date();
    insert_('Users', rec);
    return rec;
  });

  if (needVerify) return pendingResult_(user, false);
  return { token: createSession_(user.user_id), user: publicUser_(user) };
}

function verifyEmail(email, code) {
  email = String(email || '').trim().toLowerCase();
  code = String(code || '').replace(/\D/g, '');
  if (code.length !== 8) throw new Error('กรุณากรอกรหัสยืนยันให้ครบ 8 หลัก');
  const u = readAll_('Users').find(function (x) { return String(x.email).toLowerCase() === email; });
  if (!u) throw new Error('ไม่พบข้อมูลการลงทะเบียนของอีเมลนี้');
  if (u.status === 'ระงับ') throw new Error('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  if (u.status !== STATUS_PENDING) throw new Error('อีเมลนี้ยืนยันแล้ว กรุณาเข้าสู่ระบบ');

  const cache = CacheService.getScriptCache();
  const key = 'OTP_' + email;
  return withLock_(function () {
    const raw = cache.get(key);
    if (!raw) throw new Error('รหัสยืนยันหมดอายุแล้ว กรุณากดขอรหัสใหม่');
    const o = JSON.parse(raw);
    if (hash_(code, o.s) !== o.h) {
      o.t = (o.t || 0) + 1;
      if (o.t >= OTP_MAX_TRIES) {
        cache.remove(key);
        throw new Error('กรอกรหัสผิดเกิน ' + OTP_MAX_TRIES + ' ครั้ง รหัสนี้ถูกยกเลิก กรุณากดขอรหัสใหม่');
      }
      cache.put(key, JSON.stringify(o), OTP_TTL_MIN * 60);
      throw new Error('รหัสยืนยันไม่ถูกต้อง กรอกได้อีก ' + (OTP_MAX_TRIES - o.t) + ' ครั้ง');
    }
    cache.remove(key);
    const now = new Date();
    update_('Users', 'user_id', u.user_id, { status: 'ใช้งาน', email_verified_at: now, last_login: now });
    const nu = Object.assign({}, u, { status: 'ใช้งาน' });
    return { token: createSession_(u.user_id), user: publicUser_(nu) };
  });
}

function resendOtp(email) {
  email = String(email || '').trim().toLowerCase();
  const u = readAll_('Users').find(function (x) { return String(x.email).toLowerCase() === email; });
  if (!u || u.status !== STATUS_PENDING) throw new Error('ไม่พบบัญชีที่รอการยืนยันของอีเมลนี้');
  return pendingResult_(u, false);
}

function login(email, password) {
  email = String(email || '').trim().toLowerCase();
  const u = readAll_('Users').find(function (x) { return String(x.email).toLowerCase() === email; });
  if (!u || hash_(String(password || ''), String(u.salt)) !== String(u.password_hash)) {
    throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
  if (u.status === 'ระงับ') throw new Error('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  if (u.status === STATUS_PENDING) {
    if (verifyRequired_()) return pendingResult_(u, false);
    update_('Users', 'user_id', u.user_id, { status: 'ใช้งาน' });
  }
  update_('Users', 'user_id', u.user_id, { last_login: new Date() });
  return { token: createSession_(u.user_id), user: publicUser_(u) };
}

// รันฟังก์ชันนี้ใน Apps Script 1 ครั้ง เพื่ออนุญาตสิทธิ์ส่งอีเมล และทดสอบว่าส่งได้จริง
function testSendEmail() {
  const me = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(me, 'ทดสอบการส่งอีเมลจากระบบอบรมออนไลน์', 'ระบบส่งอีเมลได้ตามปกติ โควตาคงเหลือวันนี้ ' + MailApp.getRemainingDailyQuota() + ' ฉบับ');
  Logger.log('ส่งอีเมลทดสอบไปที่ ' + me + ' โควตาคงเหลือ ' + MailApp.getRemainingDailyQuota());
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('S_' + token);
  return true;
}

function updateProfile(token, data) {
  const u = auth_(token);
  const fields = ['prefix', 'first_name', 'last_name', 'position', 'school', 'affiliation', 'phone'];
  const upd = {};
  fields.forEach(function (f) { if (data[f] !== undefined) upd[f] = String(data[f]).trim(); });
  if (!upd.first_name || !upd.last_name) throw new Error('กรุณากรอกชื่อและสกุล');
  update_('Users', 'user_id', u.user_id, upd);
  clearUserCache_(u.user_id);
  return publicUser_(Object.assign({}, u, upd));
}

function changePassword(token, oldPw, newPw) {
  const u = auth_(token);
  if (hash_(String(oldPw || ''), String(u.salt)) !== String(u.password_hash)) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  if (String(newPw || '').length < 6) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
  const salt = Utilities.getUuid();
  update_('Users', 'user_id', u.user_id, { salt: salt, password_hash: hash_(String(newPw), salt) });
  clearUserCache_(u.user_id);
  return true;
}

/* =========================================================
 * หลักสูตรและความก้าวหน้า
 * ========================================================= */

function loadUserContext_(userId) {
  const cat = catalog_();
  return {
    courses: cat.courses.filter(function (c) { return c.status === 'เผยแพร่'; }).sort(byOrder_),
    lessons: cat.lessons.filter(function (l) { return l.status !== 'ซ่อน'; }).sort(byOrder_),
    questions: cat.questions,
    progress: readAll_('Progress').filter(function (p) { return String(p.user_id) === String(userId); }),
    results: readAll_('QuizResults').filter(function (r) { return String(r.user_id) === String(userId); }),
    certs: readAll_('Certificates').filter(function (c) { return String(c.user_id) === String(userId); }),
    enrolls: readAll_('Enrollments').filter(function (e) { return String(e.user_id) === String(userId) && e.status !== 'ยกเลิก'; })
  };
}

function isEnrollOpen_(c) { return String(c.enroll_open || 'เปิด') !== 'ปิด'; }

function courseStatus_(c, ctx) {
  const ls = ctx.lessons.filter(function (l) { return l.course_id === c.course_id; });
  const prog = ctx.progress.filter(function (p) { return p.course_id === c.course_id; });
  const doneIds = {};
  prog.forEach(function (p) { if (isTrue_(p.completed)) doneIds[p.lesson_id] = true; });
  const done = ls.filter(function (l) { return doneIds[l.lesson_id]; }).length;
  const qCount = ctx.questions.filter(function (q) { return q.course_id === c.course_id; }).length;
  let best = -1;
  ctx.results.forEach(function (r) { if (r.course_id === c.course_id) best = Math.max(best, Number(r.percent) || 0); });
  const passPercent = Number(c.pass_percent) || 70;
  const lessonsDone = ls.length > 0 && done === ls.length;
  const quizPassed = qCount === 0 ? true : best >= passPercent;
  const certIssued = ctx.certs.some(function (x) { return x.course_id === c.course_id; });
  // ผู้ที่ได้รับเกียรติบัตรแล้วถือว่าผ่านเสมอ แม้ผู้ดูแลจะเพิ่มบทเรียนภายหลัง
  const passed = (lessonsDone && quizPassed) || certIssued;
  const steps = ls.length + (qCount > 0 ? 1 : 0);
  const doneSteps = done + (qCount > 0 && quizPassed ? 1 : 0);
  const started = prog.some(function (p) { return Number(p.watched_percent) > 0 || isTrue_(p.completed); });
  const cert = ctx.certs.find(function (x) { return x.course_id === c.course_id; });
  const en = (ctx.enrolls || []).find(function (x) { return x.course_id === c.course_id; });
  // ผู้ที่เริ่มเรียนก่อนมีระบบลงทะเบียนหลักสูตร ถือว่าลงทะเบียนแล้ว
  const enrolled = !!en || started || best >= 0 || certIssued;
  let state = 'open';
  if (passed) state = 'passed';
  else if (started || best >= 0) state = 'learning';
  else if (enrolled) state = 'enrolled';
  return {
    course_id: c.course_id, title: c.title, tool_name: c.tool_name, description: c.description,
    objectives: c.objectives, hours: c.hours, color: c.color || '#1e3a8a', cover_url: c.cover_url,
    pass_percent: passPercent, lesson_count: ls.length, lessons_done: done,
    question_count: qCount, best_quiz: best, lessons_done_all: lessonsDone, quiz_passed: quizPassed && qCount > 0,
    passed: passed, percent: steps ? Math.round(doneSteps / steps * 100) : 0,
    state: state, enrolled: enrolled, enrolled_at: en ? en.enrolled_at : '',
    enroll_open: isEnrollOpen_(c),
    cert_no: cert ? cert.cert_no : ''
  };
}

function getDashboard(token) {
  const u = auth_(token);
  const ctx = loadUserContext_(u.user_id);
  const list = ctx.courses.map(function (c) { return courseStatus_(c, ctx); });
  return {
    user: publicUser_(u),
    settings: publicSettings_(),
    courses: list,
    summary: {
      total: list.length,
      enrolled: list.filter(function (c) { return c.enrolled; }).length,
      learning: list.filter(function (c) { return c.state === 'learning'; }).length,
      passed: list.filter(function (c) { return c.passed; }).length,
      hours: list.filter(function (c) { return c.passed; }).reduce(function (s, c) { return s + (Number(c.hours) || 0); }, 0)
    }
  };
}

function getCourse(token, courseId) {
  const u = auth_(token);
  const ctx = loadUserContext_(u.user_id);
  const c = ctx.courses.find(function (x) { return x.course_id === courseId; });
  if (!c) throw new Error('ไม่พบหลักสูตรนี้ หรือหลักสูตรยังไม่เผยแพร่');
  const status = courseStatus_(c, ctx);
  const lessons = ctx.lessons.filter(function (l) { return l.course_id === courseId; }).map(function (l) {
    const p = ctx.progress.find(function (x) { return x.lesson_id === l.lesson_id; });
    return {
      lesson_id: l.lesson_id, order: l.order, title: l.title, youtube_url: l.youtube_url,
      duration_min: l.duration_min, content: l.content, application: l.application, resource_url: l.resource_url,
      watched_percent: p ? Number(p.watched_percent) || 0 : 0,
      completed: p ? isTrue_(p.completed) : false
    };
  });
  return { course: status, lessons: lessons, min_watch: Number(getSettings_().MIN_WATCH_PERCENT) || 80 };
}

function enrollCourse(token, courseId) {
  const u = auth_(token);
  const ctx = loadUserContext_(u.user_id);
  const c = ctx.courses.find(function (x) { return x.course_id === courseId; });
  if (!c) throw new Error('ไม่พบหลักสูตรนี้ หรือหลักสูตรยังไม่เผยแพร่');
  if (courseStatus_(c, ctx).enrolled) return getCourse(token, courseId);
  if (!isEnrollOpen_(c)) throw new Error('หลักสูตรนี้ปิดรับลงทะเบียนแล้ว');
  withLock_(function () {
    const dup = readAll_('Enrollments').some(function (e) {
      return String(e.user_id) === String(u.user_id) && e.course_id === courseId && e.status !== 'ยกเลิก';
    });
    if (!dup) {
      insert_('Enrollments', {
        enroll_id: 'E' + Date.now() + Math.floor(Math.random() * 1000), user_id: u.user_id,
        course_id: courseId, enrolled_at: new Date(), status: 'ลงทะเบียน'
      });
    }
  });
  return getCourse(token, courseId);
}

function requireEnrolled_(u, courseId) {
  const ctx = loadUserContext_(u.user_id);
  const c = ctx.courses.find(function (x) { return x.course_id === courseId; });
  if (!c) throw new Error('ไม่พบหลักสูตร');
  if (!courseStatus_(c, ctx).enrolled) throw new Error('กรุณาลงทะเบียนหลักสูตรก่อนเริ่มเรียน');
}

function saveProgress(token, lessonId, percent) {
  const u = auth_(token);
  const lesson = catalog_().lessons.find(function (l) { return l.lesson_id === lessonId; });
  if (!lesson) throw new Error('ไม่พบบทเรียน');
  requireEnrolled_(u, lesson.course_id);
  const minWatch = Number(getSettings_().MIN_WATCH_PERCENT) || 80;
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const key = u.user_id + '|' + lessonId;
  return withLock_(function () {
    const old = readAll_('Progress').find(function (p) { return p.progress_key === key; });
    const now = new Date();
    if (!old) {
      const done = pct >= minWatch;
      insert_('Progress', {
        progress_key: key, user_id: u.user_id, course_id: lesson.course_id, lesson_id: lessonId,
        watched_percent: pct, completed: done, updated_at: now, completed_at: done ? now : ''
      });
      return { lesson_id: lessonId, watched_percent: pct, completed: done, newly_completed: done };
    }
    const wasDone = isTrue_(old.completed);
    const best = Math.max(Number(old.watched_percent) || 0, pct);
    const done = wasDone || best >= minWatch;
    const upd = { watched_percent: best, completed: done, updated_at: now };
    if (done && !wasDone) upd.completed_at = now;
    update_('Progress', 'progress_key', key, upd);
    return { lesson_id: lessonId, watched_percent: best, completed: done, newly_completed: done && !wasDone };
  });
}

/* =========================================================
 * แบบทดสอบหลังเรียน
 * ========================================================= */

function getQuiz(token, courseId) {
  const u = auth_(token);
  const ctx = loadUserContext_(u.user_id);
  const c = ctx.courses.find(function (x) { return x.course_id === courseId; });
  if (!c) throw new Error('ไม่พบหลักสูตร');
  const st = courseStatus_(c, ctx);
  if (!st.enrolled) throw new Error('กรุณาลงทะเบียนหลักสูตรก่อนเริ่มเรียน');
  if (!st.lessons_done_all) throw new Error('กรุณาเรียนให้ครบทุกบทเรียนก่อนทำแบบทดสอบ');
  const qs = ctx.questions.filter(function (q) { return q.course_id === courseId; }).sort(byOrder_).map(function (q) {
    return {
      question_id: q.question_id, question: q.question,
      choices: [['A', q.choice_a], ['B', q.choice_b], ['C', q.choice_c], ['D', q.choice_d]]
        .filter(function (x) { return String(x[1]) !== ''; })
    };
  });
  for (let i = qs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = qs[i]; qs[i] = qs[j]; qs[j] = t;
  }
  return { course_id: courseId, title: c.title, pass_percent: st.pass_percent, best: st.best_quiz, questions: qs };
}

function submitQuiz(token, courseId, answers) {
  const u = auth_(token);
  answers = answers || {};
  const qs = catalog_().questions.filter(function (q) { return q.course_id === courseId; });
  if (!qs.length) throw new Error('หลักสูตรนี้ไม่มีแบบทดสอบ');
  const c = catalog_().courses.find(function (x) { return x.course_id === courseId; });
  const passPercent = Number(c && c.pass_percent) || 70;
  let score = 0;
  const detail = {};
  qs.forEach(function (q) {
    const ok = String(answers[q.question_id] || '').toUpperCase() === String(q.answer).trim().toUpperCase();
    if (ok) score++;
    detail[q.question_id] = ok;
  });
  const percent = Math.round(score / qs.length * 100);
  const passed = percent >= passPercent;
  insert_('QuizResults', {
    result_id: 'R' + Date.now() + Math.floor(Math.random() * 1000), user_id: u.user_id, course_id: courseId,
    score: score, total: qs.length, percent: percent, passed: passed, submitted_at: new Date()
  });
  return { score: score, total: qs.length, percent: percent, passed: passed, pass_percent: passPercent, detail: detail };
}

/* =========================================================
 * เกียรติบัตร
 * ========================================================= */

function getCertificate(token, courseId) {
  const u = auth_(token);
  const ctx = loadUserContext_(u.user_id);
  const c = ctx.courses.find(function (x) { return x.course_id === courseId; });
  if (!c) throw new Error('ไม่พบหลักสูตร');
  const status = courseStatus_(c, ctx);
  if (!status.passed) throw new Error('ยังไม่ผ่านเกณฑ์ของหลักสูตรนี้');
  const st = getSettings_();

  const cert = withLock_(function () {
    const all = readAll_('Certificates');
    let found = all.find(function (x) { return String(x.user_id) === String(u.user_id) && x.course_id === courseId; });
    const info = { full_name: fullName_(u), position: u.position, school: u.school, course_title: c.title, hours: c.hours };
    if (found) {
      // ปรับชื่อ ตำแหน่ง สถานศึกษา ให้ตรงกับข้อมูลล่าสุด เลขที่และวันที่ออกคงเดิม
      update_('Certificates', 'cert_no', found.cert_no, info);
      return Object.assign({}, found, info);
    }
    const beYear = Number(Utilities.formatDate(new Date(), TZ, 'yyyy')) + 543;
    const head = String(st.CERT_PREFIX || 'CERT') + '-' + beYear + '-';
    let max = 0;
    all.forEach(function (x) {
      const s = String(x.cert_no);
      if (s.indexOf(head) === 0) max = Math.max(max, Number(s.slice(head.length)) || 0);
    });
    const rec = Object.assign({ cert_no: head + pad_(max + 1, 5), user_id: u.user_id, course_id: courseId, issued_at: new Date() }, info);
    insert_('Certificates', rec);
    rec.issued_at = norm_(rec.issued_at);
    return rec;
  });

  return {
    cert_no: cert.cert_no, full_name: cert.full_name, position: cert.position, school: cert.school,
    course_title: cert.course_title, hours: cert.hours, issued_at_th: thaiDate_(cert.issued_at),
    org_name: st.ORG_NAME, program_name: st.PROGRAM_NAME, signer_name: st.SIGNER_NAME,
    signer_position: st.SIGNER_POSITION,
    verify_url: verifyUrl_(cert.cert_no),
    logo: driveImage_(st.LOGO_FILE_ID), signature: driveImage_(st.SIGNATURE_FILE_ID), background: driveImage_(st.CERT_BG_FILE_ID)
  };
}

function driveImage_(fileId) {
  fileId = String(fileId || '').trim();
  if (!fileId) return '';
  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    return '';
  }
}

/* =========================================================
 * ส่วนผู้ดูแลระบบ
 * ========================================================= */

function adminGetData(token) {
  auth_(token, true);
  clearCatalog_();  // ผู้ดูแลเปิดหน้าจัดการหรือกดปรับข้อมูล ให้ระบบอ่านชีตใหม่ รองรับกรณีแก้ข้อมูลในชีตโดยตรง
  return {
    courses: readAll_('Courses').sort(byOrder_),
    lessons: readAll_('Lessons').sort(byOrder_),
    questions: readAll_('Questions').sort(byOrder_),
    settings: readAll_('Settings')
  };
}

function clean_(obj, fields) {
  const o = {};
  fields.forEach(function (f) { if (obj[f] !== undefined) o[f] = typeof obj[f] === 'string' ? obj[f].trim() : obj[f]; });
  return o;
}

function adminSaveCourse(token, data) {
  auth_(token, true);
  const o = clean_(data, ['course_id', 'order', 'title', 'tool_name', 'description', 'objectives', 'hours', 'color', 'cover_url', 'pass_percent', 'status', 'enroll_open']);
  if (!o.title) throw new Error('กรุณากรอกชื่อหลักสูตร');
  return withLock_(function () {
    if (o.course_id && findRow_('Courses', 'course_id', o.course_id) > 0) {
      update_('Courses', 'course_id', o.course_id, o);
    } else {
      o.course_id = nextId_('Courses', 'course_id', 'C', 3);
      o.created_at = new Date();
      insert_('Courses', o);
    }
    clearCatalog_();
    return adminGetData(token);
  });
}

function adminDeleteCourse(token, courseId) {
  auth_(token, true);
  return withLock_(function () {
    deleteWhere_('Lessons', 'course_id', courseId);
    deleteWhere_('Questions', 'course_id', courseId);
    deleteWhere_('Courses', 'course_id', courseId);
    clearCatalog_();
    return adminGetData(token);
  });
}

function adminSaveLesson(token, data) {
  auth_(token, true);
  const o = clean_(data, ['lesson_id', 'course_id', 'order', 'title', 'youtube_url', 'duration_min', 'content', 'application', 'resource_url', 'status']);
  if (!o.course_id || !o.title) throw new Error('กรุณาเลือกหลักสูตรและกรอกชื่อบทเรียน');
  return withLock_(function () {
    if (o.lesson_id && findRow_('Lessons', 'lesson_id', o.lesson_id) > 0) {
      update_('Lessons', 'lesson_id', o.lesson_id, o);
    } else {
      o.lesson_id = nextId_('Lessons', 'lesson_id', 'L', 4);
      insert_('Lessons', o);
    }
    clearCatalog_();
    return adminGetData(token);
  });
}

function adminDeleteLesson(token, lessonId) {
  auth_(token, true);
  return withLock_(function () { deleteWhere_('Lessons', 'lesson_id', lessonId); clearCatalog_();
    return adminGetData(token); });
}

function adminSaveQuestion(token, data) {
  auth_(token, true);
  const o = clean_(data, ['question_id', 'course_id', 'order', 'question', 'choice_a', 'choice_b', 'choice_c', 'choice_d', 'answer']);
  if (!o.course_id || !o.question) throw new Error('กรุณาเลือกหลักสูตรและกรอกคำถาม');
  if (['A', 'B', 'C', 'D'].indexOf(String(o.answer).toUpperCase()) < 0) throw new Error('กรุณาเลือกคำตอบที่ถูกต้อง');
  return withLock_(function () {
    if (o.question_id && findRow_('Questions', 'question_id', o.question_id) > 0) {
      update_('Questions', 'question_id', o.question_id, o);
    } else {
      o.question_id = nextId_('Questions', 'question_id', 'Q', 4);
      insert_('Questions', o);
    }
    clearCatalog_();
    return adminGetData(token);
  });
}

function adminDeleteQuestion(token, questionId) {
  auth_(token, true);
  return withLock_(function () { deleteWhere_('Questions', 'question_id', questionId); clearCatalog_();
    return adminGetData(token); });
}

function adminSaveSettings(token, map) {
  auth_(token, true);
  withLock_(function () {
    Object.keys(map || {}).forEach(function (k) {
      if (findRow_('Settings', 'key', k) > 0) update_('Settings', 'key', k, { value: map[k] });
      else insert_('Settings', { key: k, value: map[k], description: '' });
    });
  });
  CacheService.getScriptCache().remove('SETTINGS');
  return adminGetData(token);
}

function adminReport(token) {
  auth_(token, true);
  const users = readAll_('Users');
  const cat = catalog_();
  const courses = cat.courses.filter(function (c) { return c.status === 'เผยแพร่'; }).sort(byOrder_);
  const lessons = cat.lessons.filter(function (l) { return l.status !== 'ซ่อน'; });
  const questions = cat.questions;
  const progress = readAll_('Progress');
  const results = readAll_('QuizResults');
  const certs = readAll_('Certificates');
  const enrolls = readAll_('Enrollments').filter(function (e) { return e.status !== 'ยกเลิก'; });

  const rows = users.map(function (u) {
    const ctx = {
      courses: courses, lessons: lessons, questions: questions,
      progress: progress.filter(function (p) { return String(p.user_id) === String(u.user_id); }),
      results: results.filter(function (r) { return String(r.user_id) === String(u.user_id); }),
      certs: certs.filter(function (c) { return String(c.user_id) === String(u.user_id); }),
      enrolls: enrolls.filter(function (e) { return String(e.user_id) === String(u.user_id); })
    };
    const per = {};
    let passed = 0;
    courses.forEach(function (c) {
      const s = courseStatus_(c, ctx);
      per[c.course_id] = { percent: s.percent, passed: s.passed, state: s.state, enrolled: s.enrolled };
      if (s.passed) passed++;
    });
    return {
      user_id: u.user_id, full_name: fullName_(u), email: u.email, position: u.position, school: u.school,
      affiliation: u.affiliation, phone: String(u.phone || ''), role: u.role, status: u.status,
      created_at: u.created_at, last_login: u.last_login, passed: passed, courses: per
    };
  });

  const perCourse = courses.map(function (c) {
    return {
      course_id: c.course_id, title: c.title, tool_name: c.tool_name,
      enrolled: rows.filter(function (r) { return r.courses[c.course_id].enrolled; }).length,
      started: rows.filter(function (r) { var st = r.courses[c.course_id].state; return st === 'learning' || st === 'passed'; }).length,
      passed: rows.filter(function (r) { return r.courses[c.course_id].passed; }).length
    };
  });

  return {
    courses: courses.map(function (c) { return { course_id: c.course_id, title: c.title, tool_name: c.tool_name }; }),
    users: rows,
    perCourse: perCourse,
    summary: {
      users: users.filter(function (u) { return u.role !== 'admin'; }).length,
      certificates: certs.length,
      active: rows.filter(function (r) { return r.role !== 'admin' && Object.keys(r.courses).some(function (k) { return r.courses[k].enrolled; }); }).length,
      enrollments: enrolls.length,
      courses: courses.length
    }
  };
}

function adminUpdateUser(token, userId, data) {
  const me = auth_(token, true);
  if (String(userId) === String(me.user_id) && data.role && data.role !== 'admin') {
    throw new Error('ไม่สามารถลดสิทธิ์บัญชีของตนเองได้');
  }
  const o = clean_(data, ['role', 'status']);
  if (o.status === 'ใช้งาน') {
    const u = readAll_('Users').find(function (x) { return String(x.user_id) === String(userId); });
    if (u && u.status === STATUS_PENDING) o.email_verified_at = new Date();  // ผู้ดูแลยืนยันแทน
  }
  update_('Users', 'user_id', userId, o);
  clearUserCache_(userId);
  return adminReport(token);
}

function adminResetPassword(token, userId) {
  auth_(token, true);
  const pw = String(Math.floor(100000 + Math.random() * 900000));
  const salt = Utilities.getUuid();
  if (!update_('Users', 'user_id', userId, { salt: salt, password_hash: hash_(pw, salt) })) throw new Error('ไม่พบผู้ใช้');
  clearUserCache_(userId);
  return pw;
}

/* =========================================================
 * ระบบอบรมออนไลน์ ฝั่งผู้ใช้งาน
 * ========================================================= */
const S = {
  token: '', user: null, settings: {}, dash: null, filter: 'all',
  course: null, lessons: [], minWatch: 80, active: 'overview',
  player: null, watch: null, quiz: null,
  admin: null, report: null, adminTab: 'report', adminCourse: '', reportQuery: '',
  certCanvas: null, certData: null
};

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const STATE_LABEL = { open: 'ยังไม่ลงทะเบียน', enrolled: 'ลงทะเบียนแล้ว', learning: 'กำลังเรียน', passed: 'ผ่านแล้ว' };
const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const LOCK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function store(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function formData(form) { const o = {}; new FormData(form).forEach((v, k) => { o[k] = v; }); return o; }

// เรียก API ของ Google Apps Script (ฐานข้อมูล Google Sheet)
// ส่งแบบ text/plain เพื่อไม่ให้เบราว์เซอร์ส่งคำขอ preflight ซึ่ง Apps Script ไม่รองรับ
async function api(fn, ...args) {
  if (!window.API_URL || API_URL.indexOf('script.google.com') < 0) {
    throw new Error('ยังไม่ได้ตั้งค่า API_URL ในไฟล์ assets/js/config.js');
  }
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: fn, args: args }),
      redirect: 'follow'
    });
  } catch (e) {
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
  }
  let out;
  try { out = await res.json(); } catch (e) {
    throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง กรุณาตรวจสอบการทำให้ใช้งานได้ของ Apps Script');
  }
  if (out.ok) return out.data;
  const msg = String(out.error || 'เกิดข้อผิดพลาด');
  if (msg.indexOf('SESSION_EXPIRED') >= 0) {
    sessionExpired();
    throw new Error('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่');
  }
  throw new Error(msg.replace(/^(Exception|Error):\s*/i, ''));
}

function loading(on, text) {
  $('#loading-text').textContent = text || 'กำลังโหลด';
  $('#loading').classList.toggle('hidden', !on);
}

let toastTimer = null;
function toast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function shade(hex, pct) {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex || '#1e3a8a';
  const n = parseInt(m[1], 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + v * pct / 100)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function ytId(url) {
  if (!url) return '';
  const s = String(url).trim();
  const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : '';
}

/* ---------------- การเริ่มต้นระบบ ---------------- */

async function init() {
  bindStatic();
  loading(true);
  try {
    S.settings = await api('getPublicSettings');
    applySettings();
  } catch (e) {
    toast(e.message, 'error');
  }
  S.token = load('tt_token') || '';
  if (S.token) {
    try { await loadDashboard(); loading(false); return; } catch (e) { /* เข้าสู่ระบบใหม่ */ }
  }
  loading(false);
  showView('auth');
}

function applySettings() {
  const st = S.settings || {};
  $('#auth-site-name').textContent = st.SITE_NAME || 'ระบบอบรมออนไลน์';
  $('#auth-org-name').textContent = st.ORG_NAME || '';
  $('#top-site-name').textContent = st.SITE_NAME || 'ระบบอบรมออนไลน์';
  if (!$('#reg-affiliation').value) $('#reg-affiliation').value = st.ORG_NAME || '';
  $('#tab-register').classList.toggle('hidden', st.REGISTRATION_OPEN === false);
  $('#footer').innerHTML = esc(st.ORG_NAME || '') + (st.DEVELOPER ? '<br>พัฒนาระบบโดย ' + esc(st.DEVELOPER) : '');
}

function bindStatic() {
  $$('[data-auth-tab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-auth-tab]').forEach(x => x.classList.toggle('active', x === b));
    $('#form-login').classList.toggle('hidden', b.dataset.authTab !== 'login');
    $('#form-register').classList.toggle('hidden', b.dataset.authTab !== 'register');
  }));
  $('#form-login').addEventListener('submit', onLogin);
  $('#form-register').addEventListener('submit', onRegister);
  $('#btn-logout').addEventListener('click', e => { e.preventDefault(); onLogout(); });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-nav]');
    if (a) { e.preventDefault(); navigate(a.dataset.nav); }
    if (e.target.closest('[data-close]')) closeModal();
  });
  $$('#dash-filter .chip').forEach(b => b.addEventListener('click', () => {
    S.filter = b.dataset.filter;
    $$('#dash-filter .chip').forEach(x => x.classList.toggle('active', x === b));
    renderCourseGrid();
  }));
  $('#modal-close').addEventListener('click', closeModal);
  $('#cert-close').addEventListener('click', () => $('#cert-modal').classList.add('hidden'));
  $('#form-profile').addEventListener('submit', onSaveProfile);
  $('#form-password').addEventListener('submit', onChangePassword);
  $$('[data-admin-tab]').forEach(b => b.addEventListener('click', () => {
    S.adminTab = b.dataset.adminTab;
    $$('[data-admin-tab]').forEach(x => x.classList.toggle('active', x === b));
    renderAdmin();
  }));
  window.addEventListener('beforeunload', () => { if (S.watch) saveWatch(S.watch); });
}

function showView(name) {
  if (name !== 'course') stopPlayer();
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + name).classList.remove('hidden');
  $('#topbar').classList.toggle('hidden', name === 'auth');
  $('#footer').classList.toggle('hidden', name === 'auth');
  $$('.nav a[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name || (name === 'course' && a.dataset.nav === 'dashboard')));
  if (S.user) $('#nav-admin').classList.toggle('hidden', S.user.role !== 'admin');
  window.scrollTo(0, 0);
}

async function navigate(name) {
  if (name === 'dashboard') {
    loading(true);
    try { await loadDashboard(); } catch (e) { toast(e.message, 'error'); } finally { loading(false); }
  } else if (name === 'profile') {
    renderProfile();
    showView('profile');
  } else if (name === 'admin') {
    openAdmin();
  }
}

/* ---------------- เข้าสู่ระบบ ลงทะเบียน ---------------- */

function setSession(r) {
  S.token = r.token;
  S.user = r.user;
  store('tt_token', r.token);
}

function sessionExpired() {
  stopPlayer();
  S.token = '';
  S.user = null;
  store('tt_token', null);
  $('#modal').classList.add('hidden');
  $('#cert-modal').classList.add('hidden');
  showView('auth');
}

async function onLogin(e) {
  e.preventDefault();
  const f = formData(e.target);
  loading(true, 'กำลังเข้าสู่ระบบ');
  try {
    setSession(await api('login', f.email, f.password));
    await loadDashboard();
    e.target.reset();
    toast('เข้าสู่ระบบสำเร็จ', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading(false);
  }
}

async function onRegister(e) {
  e.preventDefault();
  const f = formData(e.target);
  if (f.password !== f.password2) { toast('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน', 'error'); return; }
  delete f.password2;
  loading(true, 'กำลังลงทะเบียน');
  try {
    setSession(await api('register', f));
    await loadDashboard();
    e.target.reset();
    toast('ลงทะเบียนสำเร็จ ยินดีต้อนรับเข้าสู่การอบรม', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading(false);
  }
}

function onLogout() {
  const t = S.token;
  sessionExpired();
  if (t) api('logout', t).catch(() => {});
}

/* ---------------- แดชบอร์ด ---------------- */

async function loadDashboard() {
  const d = await api('getDashboard', S.token);
  S.dash = d;
  S.user = d.user;
  S.settings = d.settings;
  applySettings();
  renderDashboard();
  showView('dashboard');
}

function renderDashboard() {
  const d = S.dash, u = d.user;
  $('#dash-name').textContent = u.full_name;
  $('#dash-school').textContent = [u.position, u.school].filter(Boolean).join(' ');
  const sm = d.summary;
  $('#dash-stats').innerHTML = [
    ['หลักสูตรที่เปิดให้เรียน', sm.total],
    ['ลงทะเบียนแล้ว', sm.enrolled],
    ['ผ่านแล้ว', sm.passed],
    ['ชั่วโมงอบรมสะสม', sm.hours]
  ].map(s => `<div class="stat"><div class="num">${esc(s[1])}</div><div class="lbl">${esc(s[0])}</div></div>`).join('');
  renderCourseGrid();
}

function renderCourseGrid() {
  const list = S.dash.courses.filter(c => S.filter === 'all' || (S.filter === 'mine' ? c.enrolled : c.state === S.filter));
  if (!list.length) {
    $('#course-grid').innerHTML = '<div class="empty">ไม่มีหลักสูตรในกลุ่มนี้</div>';
    return;
  }
  $('#course-grid').innerHTML = list.map(courseCard).join('');
}

function courseCard(c) {
  const cover = c.cover_url
    ? `background-image:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.5)),url('${esc(c.cover_url)}')`
    : `background:linear-gradient(135deg,${esc(c.color)},${esc(shade(c.color, -35))})`;
  const id = esc(c.course_id);
  let btn;
  if (c.passed) btn = `<button class="btn success small" onclick="App.cert('${id}')">ดาวน์โหลดเกียรติบัตร</button>`;
  else if (!c.enrolled) btn = c.enroll_open
    ? `<button class="btn primary small" onclick="App.enroll('${id}')">ลงทะเบียน</button>`
    : `<button class="btn small" disabled>ปิดรับลงทะเบียน</button>`;
  else btn = `<button class="btn primary small" onclick="App.openCourse('${id}')">${c.state === 'enrolled' ? 'เริ่มเรียน' : 'เรียนต่อ'}</button>`;
  const foot = c.enrolled
    ? `<span class="small muted">ความก้าวหน้า ร้อยละ ${c.percent}</span>`
    : `<button class="btn ghost small" onclick="App.openCourse('${id}')">ดูรายละเอียด</button>`;
  return `<article class="course-card">
    <div class="course-cover" style="${cover}">
      <span class="tool">${esc(c.tool_name || c.title)}</span>
      <span class="badge ${c.state}">${STATE_LABEL[c.state]}</span>
    </div>
    <div class="course-body">
      <h4>${esc(c.title)}</h4>
      <p>${esc(c.description)}</p>
      <div class="meta"><span>${esc(c.lesson_count)} บทเรียน</span><span>${esc(c.hours)} ชั่วโมง</span>${c.question_count ? `<span>มีแบบทดสอบ</span>` : ''}</div>
      ${c.enrolled ? `<div class="progress ${c.passed ? 'ok' : ''}"><span style="width:${c.percent}%"></span></div>` : ''}
      <div class="course-foot">
        ${foot}
        ${btn}
      </div>
      ${c.passed ? `<button class="btn ghost small" onclick="App.openCourse('${id}')">ทบทวนบทเรียน</button>` : ''}
    </div>
  </article>`;
}

/* ---------------- หน้าเรียน ---------------- */

async function openCourse(id, lessonId) {
  loading(true);
  try {
    const r = await api('getCourse', S.token, id);
    S.course = r.course;
    S.lessons = r.lessons;
    S.minWatch = r.min_watch;
    showView('course');
    renderCourseHead();
    if (lessonId) openLesson(lessonId);
    else { S.active = 'overview'; renderLessonList(); renderOverview(); }
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading(false);
  }
}

async function refreshCourse() {
  if (!S.course) return;
  const wasPassed = S.course.passed;
  try {
    const r = await api('getCourse', S.token, S.course.course_id);
    S.course = r.course;
    r.lessons.forEach(nl => {
      const l = S.lessons.find(x => x.lesson_id === nl.lesson_id);
      if (l) {
        l.watched_percent = Math.max(l.watched_percent, nl.watched_percent);
        l.completed = l.completed || nl.completed;
      }
    });
    renderCourseHead();
    renderLessonList();
    if (S.active === 'overview') renderOverview();
    if (S.active.indexOf('lesson:') === 0) renderLessonNav();
    if (!wasPassed && S.course.passed) toast('ยินดีด้วย ท่านผ่านหลักสูตรนี้แล้ว ดาวน์โหลดเกียรติบัตรได้ทันที', 'success');
  } catch (e) { /* ไม่แสดงข้อผิดพลาดระหว่างปรับข้อมูลเบื้องหลัง */ }
}

function renderCourseHead() {
  const c = S.course;
  $('#course-head').innerHTML = `
    <div class="tool-badge" style="background:${esc(c.color)}">${esc(c.tool_name || 'หลักสูตร')}</div>
    <div class="info">
      <h2>${esc(c.title)}</h2>
      <div class="meta"><span>${c.lesson_count} บทเรียน</span><span>${esc(c.hours)} ชั่วโมง</span>
        <span>เรียนแล้ว ${c.lessons_done} จาก ${c.lesson_count} บท</span>
        ${c.question_count ? `<span>แบบทดสอบ ${c.best_quiz >= 0 ? 'คะแนนสูงสุด ร้อยละ ' + c.best_quiz : 'ยังไม่ได้ทำ'}</span>` : ''}</div>
    </div>
    <div class="prog-wrap">
      ${!c.enrolled ? (c.enroll_open
        ? `<button class="btn primary" onclick="App.enroll('${esc(c.course_id)}')">ลงทะเบียนหลักสูตร</button>`
        : '<span class="badge hidden-st">ปิดรับลงทะเบียน</span>') : `
      <div class="small muted">ลงทะเบียนแล้ว${c.enrolled_at ? ' เมื่อ ' + esc(thaiShort(c.enrolled_at)) : ''}</div>
      <div class="small muted">ความก้าวหน้า ร้อยละ ${c.percent}</div>`}
      ${c.enrolled ? `<div class="progress ${c.passed ? 'ok' : ''}"><span style="width:${c.percent}%"></span></div>` : ''}
      ${c.passed ? `<button class="btn success small" style="margin-top:8px" onclick="App.cert('${esc(c.course_id)}')">ดาวน์โหลดเกียรติบัตร</button>` : ''}
    </div>`;
}

function renderLessonList() {
  const c = S.course;
  let html = `<div class="lesson-item ${S.active === 'overview' ? 'active' : ''}" onclick="App.overview()">
      <div class="st special">i</div><div><div class="tt">ภาพรวมหลักสูตร</div><div class="sub">วัตถุประสงค์และเกณฑ์การผ่าน</div></div></div>
    <div class="list-sep">บทเรียน</div>`;
  S.lessons.forEach((l, i) => {
    if (!c.enrolled) {
      html += `<div class="lesson-item locked" onclick="App.needEnroll()">
        <div class="st">${LOCK_SVG}</div><div><div class="tt">${esc(l.title)}</div><div class="sub">${l.duration_min ? esc(l.duration_min) + ' นาที' : ''}</div></div></div>`;
      return;
    }
    const cls = l.completed ? 'done' : (l.watched_percent > 0 ? 'part' : '');
    const sub = l.completed ? 'เรียนจบแล้ว' : (l.watched_percent > 0 ? 'รับชมแล้ว ร้อยละ ' + l.watched_percent : (l.duration_min ? l.duration_min + ' นาที' : 'ยังไม่เริ่ม'));
    html += `<div class="lesson-item ${S.active === 'lesson:' + l.lesson_id ? 'active' : ''}" onclick="App.openLesson('${esc(l.lesson_id)}')">
      <div class="st ${cls}">${l.completed ? CHECK_SVG : i + 1}</div>
      <div><div class="tt">${esc(l.title)}</div><div class="sub">${esc(sub)}</div></div></div>`;
  });
  html += `<div class="list-sep">การวัดผลและเกียรติบัตร</div>`;
  if (c.question_count) {
    const locked = !c.lessons_done_all;
    html += `<div class="lesson-item ${locked ? 'locked' : ''} ${S.active === 'quiz' ? 'active' : ''}" onclick="App.openQuiz()">
      <div class="st ${c.quiz_passed ? 'done' : ''}">${c.quiz_passed ? CHECK_SVG : (locked ? LOCK_SVG : 'Q')}</div>
      <div><div class="tt">แบบทดสอบหลังเรียน</div><div class="sub">${locked ? 'เปิดเมื่อเรียนครบทุกบท' : (c.quiz_passed ? 'ผ่านแล้ว ร้อยละ ' + c.best_quiz : 'เกณฑ์ผ่าน ร้อยละ ' + c.pass_percent)}</div></div></div>`;
  }
  html += `<div class="lesson-item ${c.passed ? '' : 'locked'}" onclick="${c.passed ? `App.cert('${esc(c.course_id)}')` : `App.toastLocked()`}">
      <div class="st ${c.passed ? 'done' : ''}">${c.passed ? CHECK_SVG : LOCK_SVG}</div>
      <div><div class="tt">เกียรติบัตร</div><div class="sub">${c.passed ? 'ดาวน์โหลดได้' : 'ได้รับเมื่อผ่านเกณฑ์'}</div></div></div>`;
  $('#lesson-list').innerHTML = html;
}

function renderOverview() {
  stopPlayer();
  S.active = 'overview';
  const c = S.course;
  const next = S.lessons.find(l => !l.completed);
  let action;
  if (c.passed) action = `<button class="btn success" onclick="App.cert('${esc(c.course_id)}')">ดาวน์โหลดเกียรติบัตร</button>`;
  else if (!c.enrolled) action = c.enroll_open
    ? `<button class="btn primary" onclick="App.enroll('${esc(c.course_id)}')">ลงทะเบียนหลักสูตรนี้</button>`
    : '<div class="notice warn">หลักสูตรนี้ปิดรับลงทะเบียนแล้ว</div>';
  else if (next) action = `<button class="btn primary" onclick="App.openLesson('${esc(next.lesson_id)}')">${c.lessons_done ? 'เรียนต่อ' : 'เริ่มเรียน'} บทที่ ${S.lessons.indexOf(next) + 1}</button>`;
  else if (c.question_count) action = `<button class="btn primary" onclick="App.openQuiz()">ทำแบบทดสอบหลังเรียน</button>`;
  else action = '';
  const html = `
    ${S.justEnrolled ? '<div class="notice ok">ลงทะเบียนหลักสูตรเรียบร้อยแล้ว กดปุ่มด้านล่างเพื่อเริ่มเรียนบทที่ 1</div>' : ''}
    ${!c.enrolled ? '<div class="notice info">กรุณาลงทะเบียนหลักสูตรก่อน บทเรียนจะเปิดให้เรียนทันทีหลังลงทะเบียน</div>' : ''}
    ${c.passed ? '<div class="notice ok">ท่านผ่านหลักสูตรนี้แล้ว สามารถทบทวนบทเรียนและดาวน์โหลดเกียรติบัตรได้ตลอดเวลา</div>' : ''}
    <div class="card">
      <h3>เกี่ยวกับหลักสูตร</h3>
      <p class="content-text">${esc(c.description)}</p>
      ${c.objectives ? `<h4>วัตถุประสงค์</h4><p class="obj-list">${esc(c.objectives)}</p>` : ''}
    </div>
    <div class="card">
      <h4>เกณฑ์การผ่านหลักสูตร</h4>
      <ol>
        <li>เรียนครบทั้ง ${c.lesson_count} บทเรียน โดยรับชมวิดีโอแต่ละบทไม่น้อยกว่าร้อยละ ${S.minWatch} ของความยาววิดีโอ</li>
        ${c.question_count ? `<li>ทำแบบทดสอบหลังเรียน ${c.question_count} ข้อ ได้คะแนนไม่น้อยกว่าร้อยละ ${c.pass_percent} (ทำซ้ำได้)</li>` : ''}
        <li>เมื่อผ่านเกณฑ์ ระบบออกเกียรติบัตร ${esc(c.hours)} ชั่วโมง ให้ดาวน์โหลดได้ทันที</li>
      </ol>
      ${action}
    </div>`;
  $('#lesson-main').innerHTML = html;
  S.justEnrolled = false;
  renderLessonList();
}

function openLesson(id) {
  if (!S.course.enrolled) { needEnroll(); return; }
  stopPlayer();
  const idx = S.lessons.findIndex(l => l.lesson_id === id);
  if (idx < 0) return;
  const l = S.lessons[idx];
  S.active = 'lesson:' + id;
  renderLessonList();
  const vid = ytId(l.youtube_url);
  $('#lesson-main').innerHTML = `
    <div class="card">
      <p class="muted small" style="margin:0">บทที่ ${idx + 1} จาก ${S.lessons.length}</p>
      <h3>${esc(l.title)}</h3>
      <div class="video-wrap">${vid ? '<div id="yt-player"></div>' : '<div class="no-video">ยังไม่มีวิดีโอสำหรับบทเรียนนี้<br>กรุณาศึกษาจากเนื้อหาด้านล่าง แล้วกดยืนยันการเรียน</div>'}</div>
      <div class="watch-bar">
        <span class="small muted">ความก้าวหน้าบทนี้</span>
        <div class="progress" id="w-prog"><span style="width:0%"></span></div>
        <span class="small" id="w-text"></span>
      </div>
      <div id="manual-box" style="margin-top:12px"></div>
    </div>
    <div class="card">
      <h4>สรุปเนื้อหา</h4>
      <div class="content-text">${l.content ? esc(l.content) : '<span class="muted">ไม่มีข้อมูล</span>'}</div>
    </div>
    <div class="card">
      <h4>แนวทางการประยุกต์ใช้ในห้องเรียน</h4>
      <div class="apply-box">${l.application ? esc(l.application) : 'ไม่มีข้อมูล'}</div>
      ${l.resource_url ? `<p style="margin:14px 0 0"><a class="btn small" href="${esc(l.resource_url)}" target="_blank" rel="noopener">เปิดเอกสารหรือใบงานประกอบ</a></p>` : ''}
    </div>
    <div class="lesson-nav" id="lesson-nav"></div>`;
  S.watch = {
    lessonId: id, seen: new Set(), last: -1, base: l.watched_percent, pct: l.watched_percent,
    savedPct: l.watched_percent, lastSave: Date.now(), saving: false, completed: l.completed,
    timer: null, manualTimer: null
  };
  updateWatchUI();
  renderLessonNav();
  if (vid) startPlayer(vid, l); else showManual(l, 0);
}

function renderLessonNav() {
  const box = $('#lesson-nav');
  if (!box) return;
  const id = S.active.replace('lesson:', '');
  const idx = S.lessons.findIndex(l => l.lesson_id === id);
  const prev = S.lessons[idx - 1], next = S.lessons[idx + 1];
  let right = '';
  if (next) right = `<button class="btn primary" onclick="App.openLesson('${esc(next.lesson_id)}')">บทถัดไป</button>`;
  else if (S.course.question_count) right = `<button class="btn primary" onclick="App.openQuiz()" ${S.course.lessons_done_all ? '' : 'disabled'}>ไปทำแบบทดสอบหลังเรียน</button>`;
  else right = `<button class="btn primary" onclick="App.overview()">ดูผลการเรียน</button>`;
  box.innerHTML = `<div>${prev ? `<button class="btn" onclick="App.openLesson('${esc(prev.lesson_id)}')">บทก่อนหน้า</button>` : ''}</div><div>${right}</div>`;
}

function updateWatchUI() {
  const w = S.watch;
  if (!w) return;
  const bar = $('#w-prog'), txt = $('#w-text');
  if (!bar) return;
  bar.classList.toggle('ok', w.completed);
  bar.firstElementChild.style.width = Math.min(100, w.pct) + '%';
  txt.textContent = w.completed ? 'เรียนจบบทนี้แล้ว' : 'รับชมแล้ว ร้อยละ ' + w.pct + ' (เกณฑ์ ร้อยละ ' + S.minWatch + ')';
  if (w.completed && $('#manual-box')) $('#manual-box').innerHTML = '';
}

/* ---------- การติดตามการรับชมวิดีโอด้วย YouTube IFrame API ---------- */

let ytPromise = null;
function loadYT() {
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error('timeout')), 10000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { clearTimeout(timer); reject(new Error('load error')); };
    document.head.appendChild(s);
  });
  ytPromise.catch(() => { ytPromise = null; });
  return ytPromise;
}

function fallbackSeconds(l) {
  return Math.round((Number(l.duration_min) || 3) * 60 * S.minWatch / 100);
}

function startPlayer(vid, l) {
  const w = S.watch;
  loadYT().then(() => {
    if (S.watch !== w) return;
    S.player = new YT.Player('yt-player', {
      videoId: vid,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: () => { if (S.watch === w) w.timer = setInterval(tick, 1000); },
        onStateChange: e => {
          if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) { tick(); saveWatch(w); }
        },
        onError: () => { if (S.watch === w) showManual(l, fallbackSeconds(l)); }
      }
    });
  }).catch(() => {
    if (S.watch !== w) return;
    const box = document.getElementById('yt-player');
    if (box) box.outerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?rel=0&playsinline=1" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    showManual(l, fallbackSeconds(l));
  });
}

function tick() {
  const w = S.watch, p = S.player;
  if (!w || !p || typeof p.getPlayerState !== 'function') return;
  let state, dur, t;
  try {
    state = p.getPlayerState();
    dur = Math.floor(p.getDuration() || 0);
    t = Math.floor(p.getCurrentTime() || 0);
  } catch (e) { return; }
  if (dur <= 0) return;
  // นับเฉพาะวินาทีที่เล่นต่อเนื่องจริง การกรอข้ามไม่นับ
  if (state === YT.PlayerState.PLAYING && w.last >= 0 && t >= w.last && t - w.last <= 3) {
    for (let k = w.last; k <= t; k++) w.seen.add(k);
  }
  w.last = t;
  const local = Math.min(100, Math.round(w.seen.size / dur * 100));
  w.pct = Math.max(w.base, local);
  updateWatchUI();
  if (!w.completed && w.pct >= S.minWatch) saveWatch(w);
  else if (w.pct > w.savedPct && Date.now() - w.lastSave > 20000) saveWatch(w);
}

function saveWatch(w) {
  if (!w || w.saving) return;
  const needComplete = !w.completed && w.pct >= S.minWatch;
  if (w.pct <= w.savedPct && !needComplete) return;
  w.saving = true;
  const pct = w.pct, lessonId = w.lessonId;
  api('saveProgress', S.token, lessonId, pct).then(r => {
    w.saving = false;
    w.savedPct = Math.max(w.savedPct, r.watched_percent);
    w.lastSave = Date.now();
    w.completed = r.completed;
    const l = S.lessons.find(x => x.lesson_id === lessonId);
    if (l) { l.watched_percent = Math.max(l.watched_percent, r.watched_percent); l.completed = r.completed; }
    if (S.watch === w) updateWatchUI();
    if (r.newly_completed) {
      toast('บันทึกการเรียนบทนี้เรียบร้อยแล้ว', 'success');
      refreshCourse();
    } else {
      renderLessonList();
    }
  }).catch(() => { w.saving = false; });
}

function showManual(l, waitSec) {
  const box = $('#manual-box'), w = S.watch;
  if (!box || !w || w.completed) return;
  const vid = ytId(l.youtube_url);
  const link = vid ? ` <a href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener">เปิดดูวิดีโอบน YouTube</a>` : '';
  box.innerHTML = `<div class="notice info">${vid ? 'ระบบไม่สามารถติดตามการรับชมวิดีโอนี้ได้อัตโนมัติ ' : ''}เมื่อศึกษาบทเรียนครบถ้วนแล้ว กรุณากดปุ่มยืนยันเพื่อบันทึกการเรียน${link}</div>
    <button class="btn primary" id="btn-manual" ${waitSec > 0 ? 'disabled' : ''}>ยืนยันว่าศึกษาบทเรียนนี้แล้ว</button>
    <span class="small muted" id="manual-wait">${waitSec > 0 ? 'ปุ่มจะพร้อมใช้งานใน ' + waitSec + ' วินาที' : ''}</span>`;
  const btn = $('#btn-manual');
  btn.addEventListener('click', () => { w.pct = 100; saveWatch(w); btn.disabled = true; });
  if (waitSec > 0) {
    let left = waitSec;
    if (w.manualTimer) clearInterval(w.manualTimer);
    w.manualTimer = setInterval(() => {
      left--;
      const span = $('#manual-wait');
      if (left <= 0) {
        clearInterval(w.manualTimer);
        btn.disabled = false;
        if (span) span.textContent = '';
      } else if (span) {
        span.textContent = 'ปุ่มจะพร้อมใช้งานใน ' + left + ' วินาที';
      }
    }, 1000);
  }
}

function stopPlayer() {
  const w = S.watch;
  if (w) {
    if (w.timer) clearInterval(w.timer);
    if (w.manualTimer) clearInterval(w.manualTimer);
    try { if (S.player && S.player.getPlayerState) tick(); } catch (e) {}
    saveWatch(w);
  }
  if (S.player && S.player.destroy) { try { S.player.destroy(); } catch (e) {} }
  S.player = null;
  S.watch = null;
}

/* ---------------- แบบทดสอบหลังเรียน ---------------- */

async function openQuiz() {
  if (!S.course.enrolled) { needEnroll(); return; }
  if (!S.course.lessons_done_all) { toast('กรุณาเรียนให้ครบทุกบทเรียนก่อนทำแบบทดสอบ', 'error'); return; }
  stopPlayer();
  S.active = 'quiz';
  renderLessonList();
  loading(true, 'กำลังโหลดแบบทดสอบ');
  try {
    S.quiz = await api('getQuiz', S.token, S.course.course_id);
    renderQuiz();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading(false);
  }
}

function renderQuiz() {
  const q = S.quiz;
  $('#lesson-main').innerHTML = `
    <div class="card">
      <h3>แบบทดสอบหลังเรียน</h3>
      <p class="muted">จำนวน ${q.questions.length} ข้อ เกณฑ์ผ่าน ร้อยละ ${q.pass_percent}${q.best >= 0 ? ' คะแนนสูงสุดที่ผ่านมา ร้อยละ ' + q.best : ''}</p>
      <div id="quiz-result"></div>
      <form id="quiz-form">
        ${q.questions.map((it, i) => `
          <div class="q-item" data-q="${esc(it.question_id)}">
            <div class="q">${i + 1}. ${esc(it.question)}</div>
            ${it.choices.map(ch => `<label><input type="radio" name="${esc(it.question_id)}" value="${ch[0]}"><span>${esc(ch[1])}</span></label>`).join('')}
          </div>`).join('')}
        <button class="btn primary" type="submit">ส่งคำตอบ</button>
      </form>
    </div>`;
  $('#quiz-form').addEventListener('submit', onSubmitQuiz);
}

async function onSubmitQuiz(e) {
  e.preventDefault();
  const ans = formData(e.target);
  const missing = S.quiz.questions.filter(q => !ans[q.question_id]).length;
  if (missing) { toast('ยังไม่ได้ตอบอีก ' + missing + ' ข้อ', 'error'); return; }
  loading(true, 'กำลังตรวจคำตอบ');
  try {
    const r = await api('submitQuiz', S.token, S.course.course_id, ans);
    $$('#quiz-form .q-item').forEach(el => el.classList.add(r.detail[el.dataset.q] ? 'right' : 'wrong'));
    $$('#quiz-form input').forEach(i => { i.disabled = true; });
    $('#quiz-form button[type=submit]').classList.add('hidden');
    const cid = esc(S.course.course_id);
    $('#quiz-result').innerHTML = `
      <div class="score-box">
        <div class="big" style="color:${r.passed ? 'var(--ok)' : 'var(--danger)'}">${r.score}/${r.total}</div>
        <div>คิดเป็นร้อยละ ${r.percent} (เกณฑ์ผ่าน ร้อยละ ${r.pass_percent})</div>
      </div>
      <div class="notice ${r.passed ? 'ok' : 'warn'}">${r.passed ? 'ผ่านเกณฑ์ ยินดีด้วย' : 'ยังไม่ผ่านเกณฑ์ กรุณาทบทวนบทเรียนแล้วทำแบบทดสอบอีกครั้ง'}</div>
      <div class="lesson-nav" style="margin-bottom:10px">
        ${r.passed
          ? `<button class="btn success" onclick="App.cert('${cid}')">ดาวน์โหลดเกียรติบัตร</button>`
          : `<button class="btn primary" onclick="App.openQuiz()">ทำแบบทดสอบอีกครั้ง</button><button class="btn" onclick="App.overview()">ทบทวนบทเรียน</button>`}
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshCourse();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading(false);
  }
}

/* ---------------- เกียรติบัตร ---------------- */

async function openCert(courseId) {
  const body = $('#cert-body');
  body.innerHTML = '<div class="loading-inline">กำลังจัดทำเกียรติบัตร</div>';
  $('#cert-modal').classList.remove('hidden');
  try {
    const d = await api('getCertificate', S.token, courseId);
    const canvas = await drawCertificate(d);
    S.certCanvas = canvas;
    S.certData = d;
    body.innerHTML = `
      <img class="cert-preview" src="${canvas.toDataURL('image/png')}" alt="เกียรติบัตร">
      <div class="cert-actions">
        <button class="btn primary" onclick="App.downloadPdf()">ดาวน์โหลด PDF</button>
        <button class="btn" onclick="App.downloadPng()">ดาวน์โหลดภาพ PNG</button>
        <a class="btn" href="${esc(d.verify_url)}" target="_blank" rel="noopener">เปิดลิงก์ตรวจสอบ</a>
      </div>
      <p class="muted small center">เกียรติบัตรเลขที่ ${esc(d.cert_no)} หากใช้งานบนโทรศัพท์มือถือ สามารถกดค้างที่ภาพเพื่อบันทึกได้</p>`;
  } catch (e) {
    body.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`;
  }
}

function loadImg(src) {
  return new Promise(resolve => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ตัดบรรทัดภาษาไทยตามคำ (ใช้ Intl.Segmenter ถ้าเบราว์เซอร์รองรับ)
function splitUnits(text) {
  text = String(text || '');
  if (window.Intl && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(text), s => s.segment);
  }
  const out = [];
  Array.from(text).forEach(ch => {
    if (/[ัิ-ฺ็-๎]/.test(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  });
  return out;
}

function wrapLines(ctx, text, maxW) {
  const lines = [];
  let cur = '';
  splitUnits(text).forEach(u => {
    if (ctx.measureText(cur + u).width > maxW && cur) { lines.push(cur.trim()); cur = u.trimStart(); }
    else cur += u;
  });
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

function drawLines(ctx, text, x, y, maxW, font, color, lh) {
  ctx.font = font;
  ctx.fillStyle = color;
  const lines = wrapLines(ctx, text, maxW);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lh));
  return y + lines.length * lh;
}

function fitFont(ctx, text, weight, size, min, maxW) {
  let s = size;
  ctx.font = `${weight} ${s}px Sarabun`;
  while (ctx.measureText(text).width > maxW && s > min) { s -= 2; ctx.font = `${weight} ${s}px Sarabun`; }
  return ctx.font;
}

function drawFrame(x, W, H) {
  x.fillStyle = '#fffdf6';
  x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(184,134,11,0.08)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = '#1e3a8a'; x.lineWidth = 22; x.strokeRect(40, 40, W - 80, H - 80);
  x.strokeStyle = '#b8860b'; x.lineWidth = 5; x.strokeRect(72, 72, W - 144, H - 144);
  x.lineWidth = 2; x.strokeRect(86, 86, W - 172, H - 172);
  // มุมประดับ
  x.fillStyle = '#b8860b';
  [[72, 72], [W - 72, 72], [72, H - 72], [W - 72, H - 72]].forEach(p => {
    x.save(); x.translate(p[0], p[1]); x.rotate(Math.PI / 4); x.fillRect(-16, -16, 32, 32); x.restore();
  });
}

function qrCanvas(text, size) {
  try {
    if (!window.QRCode) return null;
    const div = document.createElement('div');
    new QRCode(div, { text: text, width: size, height: size, correctLevel: QRCode.CorrectLevel.L });
    return div.querySelector('canvas');
  } catch (e) { return null; }
}

async function drawCertificate(d) {
  try {
    await Promise.all(['700 80px Sarabun', '600 40px Sarabun', '400 40px Sarabun'].map(f => document.fonts.load(f, 'ก')));
  } catch (e) {}
  const W = 2000, H = 1414, cx = W / 2, maxW = 1560;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const imgs = await Promise.all([loadImg(d.background), loadImg(d.logo), loadImg(d.signature)]);
  const bg = imgs[0], logo = imgs[1], sig = imgs[2];
  if (bg) x.drawImage(bg, 0, 0, W, H); else drawFrame(x, W, H);
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';

  let y = 200;
  if (logo) {
    const h = 150, w = logo.width * h / logo.height;
    x.drawImage(logo, cx - w / 2, 110, w, h);
    y = 320;
  }
  y = drawLines(x, d.org_name, cx, y, maxW, '600 46px Sarabun', '#1e3a8a', 60) + 70;
  x.font = '700 92px Sarabun'; x.fillStyle = '#1e3a8a';
  x.fillText('เกียรติบัตร', cx, y); y += 90;
  x.font = '400 40px Sarabun'; x.fillStyle = '#334155';
  x.fillText('มอบเกียรติบัตรฉบับนี้ไว้เพื่อแสดงว่า', cx, y); y += 120;
  x.font = fitFont(x, d.full_name, 700, 88, 50, maxW); x.fillStyle = '#7a5300';
  x.fillText(d.full_name, cx, y); y += 75;
  const pos = [d.position ? 'ตำแหน่ง ' + d.position : '', d.school || ''].filter(Boolean).join(' ');
  if (pos) y = drawLines(x, pos, cx, y, maxW, '400 36px Sarabun', '#334155', 50) + 25;
  x.font = '400 40px Sarabun'; x.fillStyle = '#334155';
  x.fillText('ได้ผ่านการอบรมออนไลน์ หลักสูตร', cx, y); y += 76;
  y = drawLines(x, d.course_title, cx, y, maxW, '700 54px Sarabun', '#1e3a8a', 70) + 10;
  y = drawLines(x, 'โครงการอบรม' + d.program_name + ' จำนวน ' + d.hours + ' ชั่วโมง', cx, y, maxW, '400 36px Sarabun', '#334155', 50) + 10;
  x.font = '400 36px Sarabun'; x.fillStyle = '#334155';
  x.fillText('ให้ไว้ ณ วันที่ ' + d.issued_at_th, cx, y);

  // ส่วนลงนาม
  let sy = Math.max(y + 40, H - 380);
  if (sig) {
    const h = 110, w = Math.min(420, sig.width * h / sig.height);
    x.drawImage(sig, cx - w / 2, sy, w, h);
  }
  sy += 150;
  x.font = '400 36px Sarabun'; x.fillStyle = '#0f172a';
  x.fillText('(' + d.signer_name + ')', cx, sy);
  drawLines(x, d.signer_position, cx, sy + 50, 1100, '400 32px Sarabun', '#334155', 44);

  // เลขที่และคิวอาร์โค้ด
  x.textAlign = 'left';
  x.font = '400 26px Sarabun'; x.fillStyle = '#475569';
  x.fillText('เลขที่ ' + d.cert_no, 130, H - 120);
  const qr = qrCanvas(d.verify_url, 150);
  if (qr) {
    x.fillStyle = '#ffffff';
    x.fillRect(W - 300, H - 310, 170, 170);
    x.drawImage(qr, W - 290, H - 300, 150, 150);
    x.textAlign = 'center';
    x.font = '400 22px Sarabun'; x.fillStyle = '#475569';
    x.fillText('สแกนเพื่อตรวจสอบ', W - 215, H - 110);
  }
  return c;
}

function certFileName() {
  return 'เกียรติบัตร_' + String(S.certData.cert_no).replace(/[^\w-]/g, '');
}

function downloadPdf() {
  const lib = window.jspdf;
  if (!lib || !lib.jsPDF) { toast('ไม่สามารถโหลดเครื่องมือสร้าง PDF ได้ กรุณาดาวน์โหลดเป็นภาพแทน', 'error'); return; }
  const pdf = new lib.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.addImage(S.certCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
  pdf.save(certFileName() + '.pdf');
}

function downloadPng() {
  const a = document.createElement('a');
  a.href = S.certCanvas.toDataURL('image/png');
  a.download = certFileName() + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------------- ข้อมูลส่วนตัว ---------------- */

function renderProfile() {
  const f = $('#form-profile'), u = S.user;
  ['prefix', 'first_name', 'last_name', 'position', 'school', 'affiliation', 'phone', 'email'].forEach(k => { f.elements[k].value = u[k] || ''; });
}

async function onSaveProfile(e) {
  e.preventDefault();
  const data = formData(e.target);
  loading(true, 'กำลังบันทึก');
  try {
    S.user = await api('updateProfile', S.token, data);
    toast('บันทึกข้อมูลเรียบร้อย ชื่อบนเกียรติบัตรจะเป็นข้อมูลล่าสุด', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading(false);
  }
}

async function onChangePassword(e) {
  e.preventDefault();
  const f = formData(e.target);
  if (f.new1 !== f.new2) { toast('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน', 'error'); return; }
  loading(true, 'กำลังบันทึก');
  try {
    await api('changePassword', S.token, f.old, f.new1);
    e.target.reset();
    toast('เปลี่ยนรหัสผ่านเรียบร้อย', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading(false);
  }
}

/* ---------------- หน้าต่างแบบฟอร์มทั่วไป ---------------- */

function closeModal() { $('#modal').classList.add('hidden'); }

function fieldHtml(f, v) {
  v = v == null ? (f.default != null ? f.default : '') : v;
  const req = f.required ? 'required' : '';
  const help = f.help ? `<span class="help">${esc(f.help)}</span>` : '';
  let input;
  if (f.type === 'textarea') input = `<textarea name="${f.name}" ${req}>${esc(v)}</textarea>`;
  else if (f.type === 'select') {
    input = `<select name="${f.name}" ${req}>` + f.options.map(o => {
      const val = typeof o === 'object' ? o.value : o, lbl = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lbl)}</option>`;
    }).join('') + '</select>';
  } else input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}" ${req} ${f.type === 'number' ? 'step="any"' : ''}>`;
  return `<label>${esc(f.label)}${input}${help}</label>${f.after || ''}`;
}

function openForm(title, fields, values, onSubmit) {
  values = values || {};
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = `<form class="form" id="dyn-form">${fields.map(f => fieldHtml(f, values[f.name])).join('')}
    <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn" data-close>ยกเลิก</button><button class="btn primary" type="submit">บันทึก</button></div></form>`;
  $('#modal').classList.remove('hidden');
  const form = $('#dyn-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    loading(true, 'กำลังบันทึก');
    try {
      await onSubmit(formData(form));
      closeModal();
      toast('บันทึกเรียบร้อย', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      loading(false);
    }
  });
  return form;
}

function confirmBox(message, okLabel) {
  return new Promise(resolve => {
    $('#modal-title').textContent = 'ยืนยันการดำเนินการ';
    $('#modal-body').innerHTML = `<p>${esc(message)}</p><div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn" id="cf-no">ยกเลิก</button><button class="btn danger" id="cf-yes">${esc(okLabel || 'ยืนยัน')}</button></div>`;
    $('#modal').classList.remove('hidden');
    $('#cf-no').onclick = () => { closeModal(); resolve(false); };
    $('#cf-yes').onclick = () => { closeModal(); resolve(true); };
  });
}

function infoBox(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html + '<div style="text-align:right;margin-top:14px"><button class="btn primary" data-close>ปิด</button></div>';
  $('#modal').classList.remove('hidden');
}

/* ---------------- ส่วนผู้ดูแลระบบ ---------------- */

async function openAdmin() {
  showView('admin');
  loading(true, 'กำลังโหลดข้อมูล');
  try {
    const r = await Promise.all([api('adminGetData', S.token), api('adminReport', S.token)]);
    S.admin = r[0];
    S.report = r[1];
    if (!S.adminCourse && S.admin.courses.length) S.adminCourse = S.admin.courses[0].course_id;
    renderAdmin();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading(false);
  }
}

function renderAdmin() {
  if (!S.admin) return;
  const fn = { report: adminReportView, courses: adminCoursesView, lessons: adminLessonsView, questions: adminQuestionsView, settings: adminSettingsView }[S.adminTab];
  $('#admin-body').innerHTML = fn();
  if (S.adminTab === 'report') {
    const inp = $('#rep-search');
    inp.value = S.reportQuery;
    inp.addEventListener('input', () => { S.reportQuery = inp.value; $('#rep-table').innerHTML = reportTable(); });
  }
  const sel = $('#adm-course');
  if (sel) sel.addEventListener('change', () => { S.adminCourse = sel.value; renderAdmin(); });
  const sf = $('#settings-form');
  if (sf) sf.addEventListener('submit', onSaveSettings);
}

function courseOptions() {
  return S.admin.courses.map(c => ({ value: c.course_id, label: c.course_id + ' ' + c.title }));
}

function courseSelect() {
  return `<select id="adm-course">${S.admin.courses.map(c => `<option value="${esc(c.course_id)}" ${c.course_id === S.adminCourse ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select>`;
}

/* รายงาน */
function adminReportView() {
  const r = S.report, sm = r.summary;
  return `
    <div class="stats">
      <div class="stat"><div class="num">${sm.users}</div><div class="lbl">ผู้ลงทะเบียน</div></div>
      <div class="stat"><div class="num">${sm.active}</div><div class="lbl">ผู้ลงทะเบียนหลักสูตรแล้ว</div></div>
      <div class="stat"><div class="num">${sm.certificates}</div><div class="lbl">เกียรติบัตรที่ออกแล้ว</div></div>
      <div class="stat"><div class="num">${sm.courses}</div><div class="lbl">หลักสูตรที่เผยแพร่</div></div>
    </div>
    <div class="card">
      <h4>จำนวนผู้ผ่านการอบรมรายหลักสูตร (แถบแสดงสัดส่วนผู้ผ่านต่อผู้ลงทะเบียนหลักสูตร)</h4>
      ${r.perCourse.map(c => `<div class="bar-row"><span>${esc(c.tool_name || c.title)}</span>
        <div class="progress ok"><span style="width:${c.enrolled ? Math.round(c.passed / c.enrolled * 100) : 0}%"></span></div>
        <span class="small">ลงทะเบียน ${c.enrolled} ผ่าน ${c.passed}</span></div>`).join('') || '<p class="muted">ยังไม่มีหลักสูตร</p>'}
    </div>
    <div class="toolbar">
      <input id="rep-search" placeholder="ค้นหาชื่อ สถานศึกษา หรืออีเมล" style="min-width:260px">
      <div style="display:flex;gap:8px"><button class="btn small" onclick="App.reloadAdmin()">ปรับข้อมูลล่าสุด</button><button class="btn primary small" onclick="App.exportCsv()">ดาวน์โหลดรายงาน CSV</button></div>
    </div>
    <div class="table-wrap" id="rep-table">${reportTable()}</div>`;
}

function reportTable() {
  const r = S.report, q = S.reportQuery.trim().toLowerCase();
  const rows = r.users.filter(u => !q || [u.full_name, u.school, u.email].join(' ').toLowerCase().indexOf(q) >= 0);
  if (!rows.length) return '<div class="empty">ไม่พบข้อมูล</div>';
  return `<table class="tbl"><thead><tr><th class="num">ที่</th><th>ชื่อ สกุล</th><th>ตำแหน่ง</th><th>สถานศึกษา</th>
    ${r.courses.map(c => `<th class="num">${esc(c.tool_name || c.course_id)}</th>`).join('')}
    <th class="num">ผ่าน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
    ${rows.map((u, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td>${esc(u.full_name)}<div class="small muted">${esc(u.email)}</div></td>
      <td>${esc(u.position)}</td><td>${esc(u.school)}</td>
      ${r.courses.map(c => { const p = u.courses[c.course_id]; return p.enrolled ? `<td class="num"><span class="pct ${p.passed ? 'ok' : (p.percent > 0 ? 'mid' : '')}">${p.passed ? 'ผ่าน' : p.percent}</span></td>` : '<td class="num"><span class="small muted">ไม่ได้ลง</span></td>'; }).join('')}
      <td class="num">${u.passed}</td>
      <td>${u.role === 'admin' ? '<span class="badge learning">ผู้ดูแล</span>' : ''} ${u.status === 'ระงับ' ? '<span class="badge hidden-st">ระงับ</span>' : '<span class="badge passed">ใช้งาน</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn small" onclick="App.userRole('${esc(u.user_id)}','${u.role === 'admin' ? 'teacher' : 'admin'}')">${u.role === 'admin' ? 'ยกเลิกสิทธิ์ผู้ดูแล' : 'ตั้งเป็นผู้ดูแล'}</button>
        <button class="btn small" onclick="App.userReset('${esc(u.user_id)}')">รีเซ็ตรหัสผ่าน</button>
        <button class="btn small danger" onclick="App.userStatus('${esc(u.user_id)}','${u.status === 'ระงับ' ? 'ใช้งาน' : 'ระงับ'}')">${u.status === 'ระงับ' ? 'เปิดใช้งาน' : 'ระงับ'}</button>
      </td></tr>`).join('')}
    </tbody></table>`;
}

function exportCsv() {
  const r = S.report;
  const head = ['ที่', 'ชื่อ สกุล', 'อีเมล', 'ตำแหน่ง', 'สถานศึกษา', 'สังกัด', 'โทรศัพท์']
    .concat(r.courses.map(c => c.title + ' (ร้อยละความก้าวหน้า)'))
    .concat(['จำนวนหลักสูตรที่ผ่าน', 'วันที่ลงทะเบียน', 'เข้าใช้ล่าสุด']);
  const rows = r.users.filter(u => u.role !== 'admin').map((u, i) => [i + 1, u.full_name, u.email, u.position, u.school, u.affiliation, u.phone]
    .concat(r.courses.map(c => { const p = u.courses[c.course_id]; return !p.enrolled ? 'ไม่ได้ลงทะเบียน' : (p.passed ? 'ผ่าน' : p.percent); }))
    .concat([u.passed, u.created_at, u.last_login]));
  const csv = [head].concat(rows).map(row => row.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'รายงานผลการอบรม.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function userUpdate(userId, data, msg) {
  loading(true);
  try {
    S.report = await api('adminUpdateUser', S.token, userId, data);
    renderAdmin();
    toast(msg, 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading(false);
  }
}

async function userReset(userId) {
  if (!(await confirmBox('ต้องการกำหนดรหัสผ่านใหม่ให้ผู้ใช้นี้ใช่หรือไม่', 'รีเซ็ตรหัสผ่าน'))) return;
  loading(true);
  try {
    const pw = await api('adminResetPassword', S.token, userId);
    infoBox('รหัสผ่านใหม่', `<p>กรุณาแจ้งรหัสผ่านนี้แก่ผู้ใช้ และแนะนำให้เปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ</p><p style="font-size:2rem;font-weight:700;text-align:center;letter-spacing:4px">${esc(pw)}</p>`);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    loading(false);
  }
}

/* หลักสูตร */
const COURSE_FIELDS = [
  { name: 'title', label: 'ชื่อหลักสูตร', required: true },
  { name: 'tool_name', label: 'ชื่อเครื่องมือ', help: 'ข้อความสั้นที่แสดงบนภาพปกหลักสูตร เช่น Canva, ChatGPT' },
  { name: 'description', label: 'คำอธิบายหลักสูตร', type: 'textarea' },
  { name: 'objectives', label: 'วัตถุประสงค์', type: 'textarea', help: 'พิมพ์บรรทัดละ 1 ข้อ' },
  { name: 'order', label: 'ลำดับการแสดง', type: 'number', default: 1 },
  { name: 'hours', label: 'จำนวนชั่วโมง (แสดงบนเกียรติบัตร)', type: 'number', default: 3 },
  { name: 'pass_percent', label: 'เกณฑ์ผ่านแบบทดสอบ (ร้อยละ)', type: 'number', default: 70 },
  { name: 'color', label: 'สีประจำหลักสูตร', type: 'color', default: '#1e40af' },
  { name: 'cover_url', label: 'ลิงก์ภาพปก', type: 'url', help: 'ไม่บังคับ หากเว้นว่างระบบใช้สีประจำหลักสูตร' },
  { name: 'status', label: 'สถานะการเผยแพร่', type: 'select', options: ['เผยแพร่', 'ซ่อน'] },
  { name: 'enroll_open', label: 'การรับลงทะเบียน', type: 'select', options: ['เปิด', 'ปิด'],
    help: 'ปิดรับลงทะเบียนแล้ว ผู้ที่ลงทะเบียนไว้ก่อนยังเรียนต่อได้ตามปกติ' }
];

function adminCoursesView() {
  const a = S.admin;
  return `<div class="toolbar"><span class="muted">หลักสูตรทั้งหมด ${a.courses.length} หลักสูตร</span>
      <button class="btn primary" onclick="App.editCourse('')">เพิ่มหลักสูตร</button></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th class="num">ลำดับ</th><th>รหัส</th><th>ชื่อหลักสูตร</th><th class="num">ชั่วโมง</th>
      <th class="num">บทเรียน</th><th class="num">ข้อสอบ</th><th class="num">เกณฑ์</th><th class="num">ผู้ลงทะเบียน</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
      ${a.courses.map(c => `<tr>
        <td class="num">${esc(c.order)}</td><td>${esc(c.course_id)}</td>
        <td><span class="badge" style="background:${esc(c.color)};color:#fff">${esc(c.tool_name)}</span> ${esc(c.title)}</td>
        <td class="num">${esc(c.hours)}</td>
        <td class="num">${a.lessons.filter(l => l.course_id === c.course_id).length}</td>
        <td class="num">${a.questions.filter(q => q.course_id === c.course_id).length}</td>
        <td class="num">${esc(c.pass_percent)}</td>
        <td class="num">${(S.report && (S.report.perCourse.find(x => x.course_id === c.course_id) || {}).enrolled) || 0}</td>
        <td><span class="badge ${c.status === 'เผยแพร่' ? 'passed' : 'hidden-st'}">${esc(c.status)}</span>
          <div class="small muted">${String(c.enroll_open) === 'ปิด' ? 'ปิดรับลงทะเบียน' : 'เปิดรับลงทะเบียน'}</div></td>
        <td style="white-space:nowrap"><button class="btn small" onclick="App.editCourse('${esc(c.course_id)}')">แก้ไข</button>
          <button class="btn small danger" onclick="App.delCourse('${esc(c.course_id)}')">ลบ</button></td></tr>`).join('')}
      </tbody></table></div>`;
}

function editCourse(id) {
  const c = S.admin.courses.find(x => x.course_id === id) || {};
  openForm(id ? 'แก้ไขหลักสูตร' : 'เพิ่มหลักสูตร', COURSE_FIELDS, c, async data => {
    data.course_id = id;
    S.admin = await api('adminSaveCourse', S.token, data);
    renderAdmin();
  });
}

async function delCourse(id) {
  const c = S.admin.courses.find(x => x.course_id === id);
  if (!(await confirmBox('ลบหลักสูตร ' + c.title + ' พร้อมบทเรียนและข้อสอบทั้งหมดของหลักสูตรนี้ ข้อมูลการเรียนและเกียรติบัตรที่ออกแล้วจะยังคงอยู่', 'ลบหลักสูตร'))) return;
  loading(true);
  try { S.admin = await api('adminDeleteCourse', S.token, id); renderAdmin(); toast('ลบเรียบร้อย', 'success'); }
  catch (e) { toast(e.message, 'error'); } finally { loading(false); }
}

/* บทเรียน */
function lessonFields() {
  return [
    { name: 'course_id', label: 'หลักสูตร', type: 'select', options: courseOptions(), required: true },
    { name: 'title', label: 'ชื่อบทเรียน', required: true },
    { name: 'youtube_url', label: 'ลิงก์วิดีโอ YouTube', help: 'วางลิงก์ได้ทุกรูปแบบ เช่น youtube.com/watch?v=... หรือ youtu.be/... วิดีโอต้องอนุญาตให้ฝังได้',
      after: '<div id="yt-preview" class="small muted" style="margin:-6px 0 12px"></div>' },
    { name: 'order', label: 'ลำดับบทเรียน', type: 'number', default: 1 },
    { name: 'duration_min', label: 'ความยาวโดยประมาณ (นาที)', type: 'number', default: 10 },
    { name: 'content', label: 'สรุปเนื้อหา', type: 'textarea' },
    { name: 'application', label: 'แนวทางการประยุกต์ใช้ในห้องเรียน', type: 'textarea' },
    { name: 'resource_url', label: 'ลิงก์เอกสารหรือใบงานประกอบ', type: 'url', help: 'ไม่บังคับ เช่น ลิงก์ Google Drive' },
    { name: 'status', label: 'สถานะ', type: 'select', options: ['เผยแพร่', 'ซ่อน'] }
  ];
}

function adminLessonsView() {
  const a = S.admin;
  if (!a.courses.length) return '<div class="empty">กรุณาเพิ่มหลักสูตรก่อน</div>';
  const list = a.lessons.filter(l => l.course_id === S.adminCourse);
  return `<div class="toolbar">${courseSelect()}<button class="btn primary" onclick="App.editLesson('')">เพิ่มบทเรียน</button></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th class="num">ลำดับ</th><th>วิดีโอ</th><th>ชื่อบทเรียน</th><th class="num">นาที</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
    ${list.map(l => { const v = ytId(l.youtube_url); return `<tr>
      <td class="num">${esc(l.order)}</td>
      <td>${v ? `<img class="thumb" src="https://i.ytimg.com/vi/${v}/mqdefault.jpg" alt="">` : '<span class="pct mid">ยังไม่มีวิดีโอ</span>'}</td>
      <td>${esc(l.title)}<div class="small muted">${esc(l.lesson_id)}</div></td>
      <td class="num">${esc(l.duration_min)}</td>
      <td><span class="badge ${l.status === 'ซ่อน' ? 'hidden-st' : 'passed'}">${esc(l.status || 'เผยแพร่')}</span></td>
      <td style="white-space:nowrap"><button class="btn small" onclick="App.editLesson('${esc(l.lesson_id)}')">แก้ไข</button>
        <button class="btn small danger" onclick="App.delLesson('${esc(l.lesson_id)}')">ลบ</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted center">ยังไม่มีบทเรียนในหลักสูตรนี้</td></tr>'}
    </tbody></table></div>`;
}

function editLesson(id) {
  const a = S.admin;
  const nextOrder = a.lessons.filter(l => l.course_id === S.adminCourse).length + 1;
  const l = a.lessons.find(x => x.lesson_id === id) || { course_id: S.adminCourse, order: nextOrder };
  const form = openForm(id ? 'แก้ไขบทเรียน' : 'เพิ่มบทเรียน', lessonFields(), l, async data => {
    data.lesson_id = id;
    S.adminCourse = data.course_id;
    S.admin = await api('adminSaveLesson', S.token, data);
    renderAdmin();
  });
  const inp = form.elements.youtube_url;
  const prev = () => {
    const v = ytId(inp.value);
    $('#yt-preview').innerHTML = inp.value ? (v ? `<img src="https://i.ytimg.com/vi/${v}/mqdefault.jpg" style="width:200px;border-radius:8px;margin-top:6px" alt=""><br>รหัสวิดีโอ ${v}` : '<span style="color:var(--danger)">ไม่พบรหัสวิดีโอในลิงก์นี้</span>') : '';
  };
  inp.addEventListener('input', prev);
  prev();
}

async function delLesson(id) {
  if (!(await confirmBox('ต้องการลบบทเรียนนี้ใช่หรือไม่', 'ลบบทเรียน'))) return;
  loading(true);
  try { S.admin = await api('adminDeleteLesson', S.token, id); renderAdmin(); toast('ลบเรียบร้อย', 'success'); }
  catch (e) { toast(e.message, 'error'); } finally { loading(false); }
}

/* แบบทดสอบ */
function questionFields() {
  return [
    { name: 'course_id', label: 'หลักสูตร', type: 'select', options: courseOptions(), required: true },
    { name: 'question', label: 'คำถาม', type: 'textarea', required: true },
    { name: 'choice_a', label: 'ตัวเลือก A', required: true },
    { name: 'choice_b', label: 'ตัวเลือก B', required: true },
    { name: 'choice_c', label: 'ตัวเลือก C' },
    { name: 'choice_d', label: 'ตัวเลือก D' },
    { name: 'answer', label: 'คำตอบที่ถูกต้อง', type: 'select', options: ['A', 'B', 'C', 'D'], required: true },
    { name: 'order', label: 'ลำดับข้อ', type: 'number', default: 1 }
  ];
}

function adminQuestionsView() {
  const a = S.admin;
  if (!a.courses.length) return '<div class="empty">กรุณาเพิ่มหลักสูตรก่อน</div>';
  const list = a.questions.filter(q => q.course_id === S.adminCourse);
  return `<div class="toolbar">${courseSelect()}<button class="btn primary" onclick="App.editQuestion('')">เพิ่มข้อสอบ</button></div>
    <p class="muted small">หลักสูตรที่ไม่มีข้อสอบ ผู้เรียนผ่านเมื่อเรียนครบทุกบทเรียน ระบบสุ่มลำดับข้อให้ผู้เรียนแต่ละครั้ง</p>
    <div class="table-wrap"><table class="tbl"><thead><tr><th class="num">ลำดับ</th><th>คำถาม</th><th class="num">เฉลย</th><th>จัดการ</th></tr></thead><tbody>
    ${list.map(q => `<tr><td class="num">${esc(q.order)}</td>
      <td>${esc(q.question)}<div class="small muted">A ${esc(q.choice_a)}  B ${esc(q.choice_b)}${q.choice_c ? '  C ' + esc(q.choice_c) : ''}${q.choice_d ? '  D ' + esc(q.choice_d) : ''}</div></td>
      <td class="num"><span class="pct ok">${esc(q.answer)}</span></td>
      <td style="white-space:nowrap"><button class="btn small" onclick="App.editQuestion('${esc(q.question_id)}')">แก้ไข</button>
        <button class="btn small danger" onclick="App.delQuestion('${esc(q.question_id)}')">ลบ</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted center">ยังไม่มีข้อสอบในหลักสูตรนี้</td></tr>'}
    </tbody></table></div>`;
}

function editQuestion(id) {
  const a = S.admin;
  const nextOrder = a.questions.filter(q => q.course_id === S.adminCourse).length + 1;
  const q = a.questions.find(x => x.question_id === id) || { course_id: S.adminCourse, order: nextOrder };
  openForm(id ? 'แก้ไขข้อสอบ' : 'เพิ่มข้อสอบ', questionFields(), q, async data => {
    data.question_id = id;
    S.adminCourse = data.course_id;
    S.admin = await api('adminSaveQuestion', S.token, data);
    renderAdmin();
  });
}

async function delQuestion(id) {
  if (!(await confirmBox('ต้องการลบข้อสอบข้อนี้ใช่หรือไม่', 'ลบข้อสอบ'))) return;
  loading(true);
  try { S.admin = await api('adminDeleteQuestion', S.token, id); renderAdmin(); toast('ลบเรียบร้อย', 'success'); }
  catch (e) { toast(e.message, 'error'); } finally { loading(false); }
}

/* ตั้งค่าระบบ */
function adminSettingsView() {
  const rows = S.admin.settings;
  return `<form id="settings-form" class="card form">
    ${rows.map(r => {
      let input;
      if (r.key === 'REGISTRATION_OPEN') input = `<select name="${esc(r.key)}">${['เปิด', 'ปิด'].map(o => `<option ${String(r.value) === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      else if (String(r.value).length > 60) input = `<textarea name="${esc(r.key)}" style="min-height:60px">${esc(r.value)}</textarea>`;
      else input = `<input name="${esc(r.key)}" value="${esc(r.value)}">`;
      return `<label>${esc(r.description || r.key)} <span class="help">(${esc(r.key)})</span>${input}</label>`;
    }).join('')}
    <div class="notice info small">การหา File ID ของภาพใน Google Drive ให้เปิดไฟล์แล้วคัดลอกส่วนของลิงก์ระหว่าง /d/ กับ /view เช่น drive.google.com/file/d/<b>FILE_ID</b>/view ไฟล์ต้องอยู่ใน Drive ของบัญชีที่ติดตั้งระบบ</div>
    <button class="btn primary" type="submit">บันทึกการตั้งค่า</button>
  </form>`;
}

async function onSaveSettings(e) {
  e.preventDefault();
  loading(true, 'กำลังบันทึก');
  try {
    S.admin = await api('adminSaveSettings', S.token, formData(e.target));
    S.settings = await api('getPublicSettings');
    applySettings();
    renderAdmin();
    toast('บันทึกการตั้งค่าเรียบร้อย', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading(false);
  }
}

/* ---------------- ฟังก์ชันที่เรียกจากปุ่ม ---------------- */

/* ---------------- ลงทะเบียนหลักสูตร ---------------- */

function thaiShort(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(v || '');
  const mon = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return Number(m[3]) + ' ' + mon[Number(m[2]) - 1] + ' ' + (Number(m[1]) + 543);
}

function needEnroll() {
  toast('กรุณาลงทะเบียนหลักสูตรก่อนเริ่มเรียน', 'error');
}

function enroll(courseId) {
  const c = (S.course && S.course.course_id === courseId ? S.course : null) ||
    (S.dash ? S.dash.courses.find(x => x.course_id === courseId) : null);
  if (!c) return;
  $('#modal-title').textContent = 'ลงทะเบียนหลักสูตร';
  $('#modal-body').innerHTML = `
    <h3 style="margin-bottom:6px">${esc(c.title)}</h3>
    <p class="muted" style="margin-top:0">${esc(c.description)}</p>
    <table class="tbl" style="margin-bottom:14px">
      <tr><td>จำนวนบทเรียน</td><td>${esc(c.lesson_count)} บท</td></tr>
      <tr><td>จำนวนชั่วโมง</td><td>${esc(c.hours)} ชั่วโมง</td></tr>
      <tr><td>แบบทดสอบหลังเรียน</td><td>${c.question_count ? c.question_count + ' ข้อ เกณฑ์ผ่าน ร้อยละ ' + c.pass_percent : 'ไม่มี'}</td></tr>
      <tr><td>ผู้ลงทะเบียน</td><td>${esc(S.user.full_name)}<div class="small muted">${esc([S.user.position, S.user.school].filter(Boolean).join(' '))}</div></td></tr>
    </table>
    <p class="small muted">ชื่อ สกุล และสถานศึกษาข้างต้นจะปรากฏบนเกียรติบัตร หากไม่ถูกต้องกรุณาแก้ไขที่เมนู ข้อมูลส่วนตัว</p>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="btn" data-close>ยกเลิก</button>
      <button class="btn primary" id="btn-enroll-ok">ยืนยันการลงทะเบียน</button>
    </div>`;
  $('#modal').classList.remove('hidden');
  $('#btn-enroll-ok').onclick = async () => {
    closeModal();
    loading(true, 'กำลังลงทะเบียน');
    try {
      const r = await api('enrollCourse', S.token, courseId);
      S.course = r.course;
      S.lessons = r.lessons;
      S.minWatch = r.min_watch;
      if (S.dash) {
        const i = S.dash.courses.findIndex(x => x.course_id === courseId);
        if (i >= 0) S.dash.courses[i] = Object.assign({}, S.dash.courses[i], r.course);
      }
      showView('course');
      renderCourseHead();
      S.justEnrolled = true;
      renderOverview();
      toast('ลงทะเบียนหลักสูตรเรียบร้อย', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      loading(false);
    }
  };
}

const App = {
  enroll: id => enroll(id),
  needEnroll: () => needEnroll(),
  openCourse: id => openCourse(id),
  openLesson: id => openLesson(id),
  overview: () => renderOverview(),
  openQuiz: () => openQuiz(),
  cert: id => openCert(id),
  toastLocked: () => toast('เกียรติบัตรจะเปิดให้ดาวน์โหลดเมื่อผ่านเกณฑ์ของหลักสูตร', 'error'),
  downloadPdf, downloadPng,
  reloadAdmin: () => openAdmin(),
  exportCsv,
  userRole: (id, role) => userUpdate(id, { role }, 'ปรับสิทธิ์เรียบร้อย'),
  userStatus: (id, status) => userUpdate(id, { status }, 'ปรับสถานะเรียบร้อย'),
  userReset,
  editCourse, delCourse, editLesson, delLesson, editQuestion, delQuestion
};
window.App = App;

init();

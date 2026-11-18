import { createClient } from '@supabase/supabase-js';
import './styles.css';
import { config, isConfigured } from './config.js';
import { addDays, addMonths, calendarDays, dateKey, defaultDateTime, formatLongDate, formatTime, isoFromLocal, localInputValue, monthTitle, startOfWeek, weekDays, weekTitle } from './date-utils.js';

const app = document.querySelector('#app');
const supabase = isConfigured() ? createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

const state = {
  session: null,
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  week: startOfWeek(new Date()),
  view: localStorage.getItem('calendar-view') === 'week' ? 'week' : 'month',
  filterDestination: localStorage.getItem('calendar-destination') || '',
  posts: [],
  destinations: [],
  subtopics: [],
  stickers: [],
  attachments: [],
  settings: null,
  modal: null,
  toastTimer: null,
  saveTimer: null,
  linkedPostHandled: false,
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const postStatus = (post) => post.status === 'published' ? 'published' : new Date(post.scheduled_at) < new Date() ? 'overdue' : 'planned';
const approvalStatus = (post) => post.status === 'published' ? 'published' : post.approval_status || 'draft';
const approvalLabel = (post) => ({ draft: 'Черновик', pending: 'На согласовании', approved: 'Согласовано', needs_changes: 'Нужно изменить', published: 'Опубликовано' }[approvalStatus(post)] || 'Черновик');

function toast(message, type = '') {
  document.querySelector('.toast')?.remove();
  clearTimeout(state.toastTimer);
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.append(el);
  state.toastTimer = setTimeout(() => el.remove(), 3200);
}

function renderSetup() {
  app.innerHTML = `<main class="auth-page"><section class="auth-card setup-card">
    <div class="brand"><div class="brand-mark">✓</div><div><h1>Почти готово</h1><p>Однократная настройка</p></div></div>
    <h2>Подключите Supabase</h2>
    <p>В проекте не указаны публичные параметры Supabase. Скопируйте <strong>.env.example</strong> в <strong>.env</strong>, заполните адрес проекта и публичный ключ, затем перезапустите приложение.</p>
    <div class="code">VITE_SUPABASE_URL=https://…supabase.co<br>VITE_SUPABASE_ANON_KEY=…<br>VITE_TELEGRAM_BOT_USERNAME=…</div>
  </section></main>`;
}

function renderAuth(signUp = false) {
  app.innerHTML = `<main class="auth-page"><form class="auth-card" id="auth-form">
    <div class="brand"><div class="brand-mark">◫</div><div><h1>Публикации</h1><p>Спокойный контент-план</p></div></div>
    <h2>${signUp ? 'Создать доступ' : 'С возвращением'}</h2>
    <p>${signUp ? 'Доступ защищён вашим email и паролем.' : 'Войдите, чтобы открыть календарь.'}</p>
    <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required placeholder="name@example.com"></div>
    <div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="${signUp ? 'new-password' : 'current-password'}" minlength="8" required placeholder="Не менее 8 символов"></div>
    <button class="button primary" type="submit">${signUp ? 'Создать доступ' : 'Войти'}</button>
    ${signUp ? '' : '<button class="link-button forgot-password" type="button" id="forgot-password">Забыли пароль?</button>'}
    <p class="auth-switch">${signUp ? 'Уже создавали доступ?' : 'Первый вход?'} <button class="link-button" type="button" id="auth-switch">${signUp ? 'Войти' : 'Создать доступ'}</button></p>
  </form></main>`;
  document.querySelector('#auth-switch').onclick = () => renderAuth(!signUp);
  document.querySelector('#forgot-password')?.addEventListener('click', requestPasswordReset);
  document.querySelector('#auth-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    const email = event.currentTarget.email.value.trim();
    const password = event.currentTarget.password.value;
    const result = signUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    button.disabled = false;
    if (result.error) return toast(humanError(result.error), 'error');
    if (signUp && !result.data.session) toast('Проверьте почту и подтвердите адрес');
  };
}

async function requestPasswordReset() {
  const emailInput = document.querySelector('#email');
  const email = emailInput?.value.trim();
  if (!email || !emailInput.reportValidity()) return;
  const button = document.querySelector('#forgot-password');
  button.disabled = true;
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  button.disabled = false;
  if (error) return toast(humanError(error), 'error');
  toast('Письмо для смены пароля отправлено');
}

function renderPasswordRecovery() {
  app.innerHTML = `<main class="auth-page"><form class="auth-card" id="recovery-form">
    <div class="brand"><div class="brand-mark">◫</div><div><h1>Публикации</h1><p>Спокойный контент-план</p></div></div>
    <h2>Новый пароль</h2>
    <p>Придумайте новый пароль для входа в календарь.</p>
    <div class="field"><label for="new-password">Новый пароль</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="Не менее 8 символов" autofocus></div>
    <div class="field"><label for="confirm-password">Повторите пароль</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" minlength="8" required></div>
    <button class="button primary" type="submit">Сохранить новый пароль</button>
  </form></main>`;
  document.querySelector('#recovery-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.password.value !== form.confirmation.value) return toast('Пароли не совпадают', 'error');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const { error } = await supabase.auth.updateUser({ password: form.password.value });
    button.disabled = false;
    if (error) return toast(humanError(error), 'error');
    window.history.replaceState({}, '', window.location.pathname);
    toast('Новый пароль сохранён');
    await loadData();
  };
}

function humanError(error) {
  const message = error?.message || 'Не удалось выполнить действие';
  if (/invalid login/i.test(message)) return 'Неверный email или пароль';
  if (/already registered/i.test(message)) return 'Этот email уже зарегистрирован';
  if (/fetch/i.test(message)) return 'Нет связи с сервером. Проверьте интернет';
  return message;
}

async function loadData() {
  const from = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1).toISOString();
  const to = new Date(state.month.getFullYear(), state.month.getMonth() + 2, 1).toISOString();
  const [postsResult, settingsResult, destinationsResult, subtopicsResult, stickersResult, attachmentsResult] = await Promise.all([
    supabase.from('posts').select('*').gte('scheduled_at', from).lt('scheduled_at', to).order('scheduled_at'),
    supabase.from('notification_settings').select('*').maybeSingle(),
    supabase.from('content_destinations').select('*').order('is_default', { ascending: false }).order('created_at'),
    supabase.from('content_subtopics').select('*').order('created_at'),
    supabase.from('telegram_stickers').select('*').order('created_at', { ascending: false }),
    supabase.from('post_attachments').select('*').order('created_at'),
  ]);
  if (postsResult.error) toast(humanError(postsResult.error), 'error');
  state.posts = postsResult.data || [];
  state.settings = settingsResult.data || null;
  state.destinations = destinationsResult.data || [];
  state.subtopics = subtopicsResult.data || [];
  state.stickers = stickersResult.data || [];
  state.attachments = attachmentsResult.data || [];
  renderApp();
  await maybeOpenLinkedPost();
}

async function maybeOpenLinkedPost() {
  if (state.linkedPostHandled) return;
  const postId = new URLSearchParams(window.location.search).get('post');
  if (!postId) return;
  const existing = state.posts.find((post) => post.id === postId);
  if (existing) {
    state.linkedPostHandled = true;
    window.history.replaceState({}, '', window.location.pathname);
    openEditor(existing);
    return;
  }
  const { data } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
  if (!data) {
    state.linkedPostHandled = true;
    return;
  }
  const date = new Date(data.scheduled_at);
  state.month = new Date(date.getFullYear(), date.getMonth(), 1);
  await loadData();
}

function renderApp() {
  const days = calendarDays(state.month);
  const today = dateKey(new Date());
  const visiblePosts = state.filterDestination ? state.posts.filter((post) => post.destination_id === state.filterDestination) : state.posts;
  const grouped = Map.groupBy ? Map.groupBy(visiblePosts, (post) => dateKey(new Date(post.scheduled_at))) : visiblePosts.reduce((map, post) => {
    const key = dateKey(new Date(post.scheduled_at));
    map.set(key, [...(map.get(key) || []), post]);
    return map;
  }, new Map());

  const isWeek = state.view === 'week';
  app.innerHTML = `<div class="shell"><main class="app">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">◫</div><div><h1>Календарь публикаций</h1><p>${isWeek ? 'Нажмите на свободное время, чтобы добавить публикацию' : 'Нажмите на день, чтобы добавить публикацию'}</p></div></div>
      <button class="icon-button" id="settings" aria-label="Настройки" title="Настройки">⚙</button>
    </header>
    <section class="calendar-card" aria-label="Календарь">
      <div class="calendar-head">
        <div class="period-nav">
          <button class="icon-button" id="prev-period" aria-label="${isWeek ? 'Предыдущая неделя' : 'Предыдущий месяц'}">‹</button>
          <div class="month-title">${isWeek ? weekTitle(state.week) : monthTitle(state.month)}</div>
          <button class="icon-button" id="next-period" aria-label="${isWeek ? 'Следующая неделя' : 'Следующий месяц'}">›</button>
        </div>
        <div class="calendar-actions"><label class="destination-filter"><span>Для:</span><select id="destination-filter"><option value="">Все каналы и чаты</option>${state.destinations.map((item) => `<option value="${item.id}" ${item.id === state.filterDestination ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><div class="view-switch" aria-label="Вид календаря"><button class="${isWeek ? '' : 'active'}" data-view="month">Месяц</button><button class="${isWeek ? 'active' : ''}" data-view="week">Неделя</button></div><button class="today-button" id="today">Сегодня</button></div>
      </div>
      <div class="status-legend" aria-label="Статусы публикаций"><span><i class="status-dot draft"></i>Черновик</span><span><i class="status-dot pending"></i>На согласовании</span><span><i class="status-dot approved"></i>Согласовано</span><span><i class="status-dot published"></i>Опубликовано</span><span><i class="status-dot needs_changes"></i>Нужно изменить</span></div>
      ${isWeek ? renderWeek(grouped, today) : `<div class="weekdays">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((day) => `<div class="weekday">${day}</div>`).join('')}</div><div class="calendar-grid">${days.map((day) => renderDay(day, grouped.get(dateKey(day)) || [], today)).join('')}</div>`}
    </section>
  </main><button class="fab" id="add" aria-label="Добавить публикацию" title="Добавить публикацию">+</button></div>`;

  document.querySelector('#prev-period').onclick = () => changePeriod(-1);
  document.querySelector('#next-period').onclick = () => changePeriod(1);
  document.querySelector('#today').onclick = () => { const now = new Date(); state.month = new Date(now.getFullYear(), now.getMonth(), 1); state.week = startOfWeek(now); loadData(); };
  document.querySelectorAll('[data-view]').forEach((button) => button.onclick = () => changeView(button.dataset.view));
  document.querySelector('#destination-filter').onchange = (event) => { state.filterDestination = event.target.value; localStorage.setItem('calendar-destination', state.filterDestination); renderApp(); };
  document.querySelector('#settings').onclick = openSettings;
  document.querySelector('#add').onclick = () => openEditor(null, new Date());
  document.querySelectorAll('.day').forEach((el) => el.onclick = (event) => {
    if (event.target.closest('.post-card')) return;
    const dayPosts = state.posts.filter((post) => dateKey(new Date(post.scheduled_at)) === el.dataset.date);
    if (dayPosts.length) openDayOverview(el.dataset.date);
    else openEditor(null, new Date(`${el.dataset.date}T12:00:00`));
  });
  document.querySelectorAll('.week-slot').forEach((el) => el.onclick = (event) => {
    if (event.target.closest('.post-card')) return;
    openEditor(null, new Date(`${el.dataset.date}T${String(el.dataset.hour).padStart(2, '0')}:00:00`));
  });
  document.querySelectorAll('.post-card').forEach((el) => el.onclick = (event) => {
    event.stopPropagation();
    openEditor(state.posts.find((post) => post.id === el.dataset.id));
  });
}

function renderWeek(grouped, today) {
  const days = weekDays(state.week);
  const hours = Array.from({ length: 15 }, (_, index) => index + 8);
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  return `<div class="week-scroll"><div class="week-schedule">
    <div class="week-corner">Время</div>
    ${days.map((day, index) => `<div class="week-day-head ${dateKey(day) === today ? 'today' : ''}"><span>${dayNames[index]}</span><strong>${day.getDate()}</strong></div>`).join('')}
    ${hours.map((hour) => `<div class="week-hour">${String(hour).padStart(2, '0')}:00</div>${days.map((day) => {
      const posts = (grouped.get(dateKey(day)) || []).filter((post) => new Date(post.scheduled_at).getHours() === hour);
      return `<div class="week-slot ${dateKey(day) === today ? 'today' : ''}" data-date="${dateKey(day)}" data-hour="${hour}" role="button" tabindex="0" aria-label="Добавить публикацию ${day.toLocaleDateString('ru-RU')} в ${hour}:00">${posts.map(renderWeekPost).join('')}</div>`;
    }).join('')}`).join('')}
  </div></div>`;
}

function renderWeekPost(post) {
  return `<button class="post-card week-post ${postStatus(post)} approval-${approvalStatus(post)}" data-id="${post.id}" type="button"><span class="post-time">${formatTime(post.scheduled_at)}</span><span class="post-title">${escapeHtml(post.title)}${postSubtopic(post)}<small class="post-stage">${approvalLabel(post)}</small></span><span class="post-status">${postStatus(post) === 'published' ? '✓' : postStatus(post) === 'overdue' ? '!' : '•'}</span></button>`;
}

function postSubtopic(post) {
  const topic = state.subtopics.find((item) => item.id === post.subtopic_id);
  return topic ? `<small class="post-subtopic">${escapeHtml(topic.name)}</small>` : '';
}

function renderDay(day, posts, today) {
  const key = dateKey(day);
  const other = day.getMonth() !== state.month.getMonth();
  return `<button class="day ${other ? 'other' : ''} ${key === today ? 'today' : ''}" data-date="${key}" aria-label="${day.toLocaleDateString('ru-RU')}">
    <span class="day-number">${day.getDate()}</span>
    <span class="posts">${posts.slice(0, 3).map((post) => `<span class="post-card ${postStatus(post)} approval-${approvalStatus(post)}" data-id="${post.id}">
      <span class="post-time">${formatTime(post.scheduled_at)}</span>
      <span class="post-title">${escapeHtml(post.title)}${postSubtopic(post)}<small class="post-stage">${approvalLabel(post)}</small></span>
      <span class="post-status" aria-label="${postStatus(post) === 'published' ? 'Опубликовано' : postStatus(post) === 'overdue' ? 'Просрочено' : 'Запланировано'}">${postStatus(post) === 'published' ? '✓' : postStatus(post) === 'overdue' ? '!' : '•'}</span>
    </span>`).join('')}${posts.length > 3 ? `<span class="more">ещё ${posts.length - 3}</span>` : ''}</span>
    ${posts.length ? `<span class="day-hover-preview">${posts.map((post) => `<span>${formatTime(post.scheduled_at)} · ${escapeHtml(post.title)}</span>`).join('')}</span>` : ''}
  </button>`;
}

function openDayOverview(dayKey) {
  const date = new Date(`${dayKey}T12:00:00`);
  const posts = state.posts.filter((post) => dateKey(new Date(post.scheduled_at)) === dayKey).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  showModal(`<div class="modal-head"><div><h2>${date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</h2><small>${posts.length} ${posts.length === 1 ? 'публикация' : 'публикаций'}</small></div><button class="icon-button close" aria-label="Закрыть">×</button></div><div class="modal-body day-overview"><div class="day-overview-list">${posts.map((post) => `<button class="overview-post ${postStatus(post)} approval-${approvalStatus(post)}" data-overview-post="${post.id}"><span class="post-time">${formatTime(post.scheduled_at)}</span><span><strong>${escapeHtml(post.title)}</strong>${postSubtopic(post)}<small>${approvalLabel(post)}</small></span><span>›</span></button>`).join('')}</div><div class="day-overview-actions"><button class="button secondary" id="download-day-plan">Скачать план дня</button><button class="button primary" id="add-to-day">Добавить публикацию в этот день</button></div></div>`);
  document.querySelectorAll('[data-overview-post]').forEach((button) => button.onclick = () => { const post = state.posts.find((item) => item.id === button.dataset.overviewPost); closeModal(); openEditor(post); });
  document.querySelector('#add-to-day').onclick = () => { closeModal(); openEditor(null, date); };
  document.querySelector('#download-day-plan').onclick = () => downloadDayPlan(dayKey, posts);
}

function downloadDayPlan(dayKey, posts) {
  const date = new Date(`${dayKey}T12:00:00`);
  const dateLabel = date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [`Контент-план на ${dateLabel}`, ''];
  if (!posts.length) lines.push('Публикаций нет.');
  posts.forEach((post, index) => {
    const destination = state.destinations.find((item) => item.id === post.destination_id)?.name;
    const subtopic = state.subtopics.find((item) => item.id === post.subtopic_id)?.name;
    lines.push(`${index + 1}. ${formatTime(post.scheduled_at)} — ${post.title}`);
    if (destination) lines.push(`   Канал/чат: ${destination}`);
    if (subtopic) lines.push(`   Подтема: ${subtopic}`);
    lines.push(`   Статус: ${approvalLabel(post)}`, '');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `контент-план-${dayKey}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  toast('План дня скачан');
}

async function changeMonth(amount) {
  state.month = addMonths(state.month, amount);
  await loadData();
}

async function changePeriod(amount) {
  if (state.view === 'week') {
    state.week = addDays(state.week, amount * 7);
    state.month = new Date(state.week.getFullYear(), state.week.getMonth(), 1);
    await loadData();
  } else {
    await changeMonth(amount);
  }
}

function changeView(view) {
  state.view = view;
  localStorage.setItem('calendar-view', view);
  if (view === 'week') {
    const now = new Date();
    const monthIsCurrent = state.month.getFullYear() === now.getFullYear() && state.month.getMonth() === now.getMonth();
    state.week = startOfWeek(monthIsCurrent ? now : state.month);
  }
  renderApp();
}

function openEditor(post = null, day = new Date()) {
  const isNew = !post;
  const value = post || { title: '', content: '', scheduled_at: new Date(defaultDateTime(day)).toISOString(), status: 'planned', destination_id: state.destinations.find((item) => item.is_default)?.id || state.destinations[0]?.id || '' };
  const approvalLabels = { draft: 'Черновик', pending: 'Отправлено на согласование', approved: 'Согласовано', needs_changes: 'Нужно изменить' };
  const subtopics = state.subtopics.filter((item) => item.destination_id === value.destination_id);
  state.modal = { type: 'editor', id: post?.id || null };
  showModal(`<div class="modal-head"><div><h2>${isNew ? 'Новая публикация' : 'Публикация'}</h2><small>${formatLongDate(value.scheduled_at)}</small></div><button class="icon-button close" aria-label="Закрыть">×</button></div>
    <form class="modal-body" id="post-form">
      <div class="field"><label for="title">Название</label><input id="title" name="title" value="${escapeHtml(value.title)}" required maxlength="160" autofocus placeholder="О чём публикация?"></div>
      <div class="field"><label for="scheduled_at">Дата и время</label><input id="scheduled_at" name="scheduled_at" type="datetime-local" value="${localInputValue(value.scheduled_at)}" required></div>
      <div class="field"><label for="destination_id">Проект или чат</label><select id="destination_id" name="destination_id" required>${state.destinations.map((item) => `<option value="${item.id}" ${item.id === value.destination_id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="subtopic_id">Подтема</label><select id="subtopic_id" name="subtopic_id"><option value="">Без подтемы</option>${subtopics.map((item) => `<option value="${item.id}" ${item.id === value.subtopic_id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select><small class="field-hint">Добавить свои подтемы можно в настройках.</small></div>
      <div class="field"><label for="sticker_id">Стикер для Telegram</label><select id="sticker_id" name="sticker_id"><option value="">Без стикера</option>${state.stickers.map((item) => `<option value="${item.id}" ${item.id === value.sticker_id ? 'selected' : ''}>${escapeHtml(item.emoji || '🎨')} ${escapeHtml(item.set_name || 'Мой стикер')}</option>`).join('')}</select><small class="field-hint">Отправьте стикер вашему боту, чтобы он появился здесь.</small></div>
      <div class="field"><label for="content">Текст и заметки</label><textarea id="content" name="content" placeholder="Текст публикации, идея или ссылка…">${escapeHtml(value.content || '')}</textarea></div>
      <div class="field"><label for="attachments">Картинки, видео и файлы</label><input id="attachments" name="files" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"><small class="field-hint">Можно выбрать несколько файлов, до 50 МБ каждый.</small><div class="attachment-list" id="attachment-list">${renderAttachmentList(post?.id)}</div></div>
      ${isNew ? '' : `<div class="approval-state ${value.approval_status || 'draft'}" id="approval-state">${approvalLabels[value.approval_status] || approvalLabels.draft}</div>`}
      <label class="toggle-row"><span><strong>Уже опубликовано</strong><small>Напоминания больше не придут</small></span><span class="switch"><input name="published" type="checkbox" ${value.status === 'published' ? 'checked' : ''}><span></span></span></label>
      <div class="autosave" id="autosave">${isNew ? '' : 'Все изменения сохраняются автоматически'}</div>
      <div class="actions">${isNew ? '' : '<button class="button danger" type="button" id="delete-post">Удалить</button><button class="button telegram" type="button" id="send-review">Отправить на согласование</button>'}<button class="button secondary close" type="button">Закрыть</button>${isNew ? '<button class="button primary" type="submit">Добавить</button>' : ''}</div>
    </form>`);
  document.querySelector('.modal')?.classList.add('editor-modal');
  const form = document.querySelector('#post-form');
  form.onsubmit = async (event) => { event.preventDefault(); await savePost(form, post?.id, true); };
  form.destination_id.onchange = () => updateSubtopicOptions(form, form.subtopic_id.value);
  if (!isNew) {
    form.oninput = () => scheduleAutoSave(form, post.id);
    form.onchange = () => scheduleAutoSave(form, post.id, 100);
    document.querySelector('#delete-post').onclick = () => deletePost(post.id);
    document.querySelector('#send-review').onclick = () => sendForReview(form, post.id);
    document.querySelectorAll('[data-delete-attachment]').forEach((button) => button.onclick = () => deleteAttachment(button.dataset.deleteAttachment));
  }
  setTimeout(() => document.querySelector('#title')?.focus(), 80);
}

function renderAttachmentList(postId) {
  if (!postId) return '';
  return state.attachments.filter((item) => item.post_id === postId).map((item) => `<div class="attachment-item"><span>${item.mime_type.startsWith('image/') ? '🖼️' : item.mime_type.startsWith('video/') ? '🎬' : '📎'} ${escapeHtml(item.file_name)}</span><button type="button" class="attachment-remove" data-delete-attachment="${item.id}" aria-label="Удалить файл">×</button></div>`).join('') || '<span class="field-hint">Вложений пока нет</span>';
}

function updateSubtopicOptions(form, selectedId = '') {
  const options = state.subtopics.filter((item) => item.destination_id === form.destination_id.value);
  form.subtopic_id.innerHTML = `<option value="">Без подтемы</option>${options.map((item) => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}`;
}

function scheduleAutoSave(form, id, delay = 650) {
  clearTimeout(state.saveTimer);
  const label = document.querySelector('#autosave');
  const approval = document.querySelector('#approval-state');
  if (approval && !approval.classList.contains('draft')) {
    approval.className = 'approval-state draft';
    approval.textContent = 'Черновик — отправьте на согласование ещё раз';
  }
  if (label) label.textContent = 'Сохраняем…';
  state.saveTimer = setTimeout(() => savePost(form, id, false), delay);
}

async function savePost(form, id, closeAfter) {
  if (!form.reportValidity()) return;
  const payload = {
    user_id: state.session.user.id,
    title: form.title.value.trim(),
    content: form.content.value.trim(),
    destination_id: form.destination_id.value || null,
    subtopic_id: form.subtopic_id.value || null,
    sticker_id: form.sticker_id.value || null,
    scheduled_at: isoFromLocal(form.scheduled_at.value),
    status: form.published.checked ? 'published' : 'planned',
    published_at: form.published.checked ? new Date().toISOString() : null,
    ...(id ? { approval_status: 'draft', approved_at: null } : {}),
  };
  const result = id
    ? await supabase.from('posts').update(payload).eq('id', id).select().single()
    : await supabase.from('posts').insert(payload).select().single();
  if (result.error) { toast(humanError(result.error), 'error'); return null; }
  await uploadSelectedFiles(form, result.data.id);
  if (closeAfter) closeModal();
  else {
    const label = document.querySelector('#autosave');
    if (label) label.textContent = 'Сохранено';
  }
  await loadData();
  if (closeAfter) toast('Публикация добавлена');
  return result.data;
}

async function uploadSelectedFiles(form, postId) {
  const input = form.querySelector('#attachments');
  const files = [...(input?.files || [])];
  if (!files.length) return true;
  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) {
      toast(`Файл «${file.name}» больше 50 МБ`, 'error');
      continue;
    }
    const safeName = file.name.replace(/[^\wа-яА-ЯёЁ.() -]/g, '_');
    const storagePath = `${state.session.user.id}/${postId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('post-attachments').upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (uploadError) { toast(`Не удалось загрузить «${file.name}»`, 'error'); continue; }
    const { data, error } = await supabase.from('post_attachments').insert({ post_id: postId, user_id: state.session.user.id, storage_path: storagePath, file_name: file.name, mime_type: file.type || 'application/octet-stream', size_bytes: file.size }).select().single();
    if (error) { await supabase.storage.from('post-attachments').remove([storagePath]); toast(`Не удалось сохранить «${file.name}»`, 'error'); continue; }
    state.attachments.push(data);
  }
  input.value = '';
  const list = form.querySelector('#attachment-list');
  if (list) { list.innerHTML = renderAttachmentList(postId); list.querySelectorAll('[data-delete-attachment]').forEach((button) => button.onclick = () => deleteAttachment(button.dataset.deleteAttachment)); }
  return true;
}

async function deleteAttachment(id) {
  const item = state.attachments.find((attachment) => attachment.id === id);
  if (!item) return;
  const { error } = await supabase.storage.from('post-attachments').remove([item.storage_path]);
  if (error) return toast('Не удалось удалить файл', 'error');
  const { error: rowError } = await supabase.from('post_attachments').delete().eq('id', id);
  if (rowError) return toast(humanError(rowError), 'error');
  state.attachments = state.attachments.filter((attachment) => attachment.id !== id);
  document.querySelector('#attachment-list')?.replaceChildren(...[]);
  const postId = state.modal?.id;
  const list = document.querySelector('#attachment-list');
  if (list) { list.innerHTML = renderAttachmentList(postId); list.querySelectorAll('[data-delete-attachment]').forEach((button) => button.onclick = () => deleteAttachment(button.dataset.deleteAttachment)); }
  toast('Файл удалён');
}

async function sendForReview(form, postId) {
  clearTimeout(state.saveTimer);
  const button = document.querySelector('#send-review');
  button.disabled = true;
  button.textContent = 'Отправляем…';
  const saved = await savePost(form, postId, false);
  if (!saved) { button.disabled = false; button.textContent = 'Отправить на согласование'; return; }
  const { data, error } = await supabase.functions.invoke('telegram-review', { body: { postId } });
  button.disabled = false;
  button.textContent = 'Отправить ещё раз';
  if (error || !data?.ok) return toast(data?.error || humanError(error), 'error');
  form.title.value = data.title;
  const status = document.querySelector('#approval-state');
  if (status) { status.className = 'approval-state pending'; status.textContent = 'Отправлено на согласование'; }
  toast('Пост отправлен вам в Telegram');
}

async function deletePost(id) {
  if (!confirm('Удалить эту публикацию? Вернуть её не получится.')) return;
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) return toast(humanError(error), 'error');
  closeModal();
  await loadData();
  toast('Публикация удалена');
}

function showModal(content) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<section class="modal" role="dialog" aria-modal="true">${content}</section>`;
  document.body.append(overlay);
  overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('.close')) closeModal(); });
  document.addEventListener('keydown', escapeModal);
}

function escapeModal(event) { if (event.key === 'Escape') closeModal(); }
function closeModal() {
  clearTimeout(state.saveTimer);
  document.querySelector('.overlay')?.remove();
  document.removeEventListener('keydown', escapeModal);
  state.modal = null;
}

async function openSettings() {
  if (!state.settings) {
    const { error: insertError } = await supabase.from('notification_settings').insert({ user_id: state.session.user.id });
    if (insertError && insertError.code !== '23505') return toast(humanError(insertError), 'error');
    const { data, error } = await supabase.from('notification_settings').select('*').single();
    if (error) return toast(humanError(error), 'error');
    state.settings = data;
  }
  renderSettings();
}

function renderSettings() {
  const s = state.settings;
  showModal(`<div class="modal-head"><h2>Настройки</h2><button class="icon-button close" aria-label="Закрыть">×</button></div>
    <div class="modal-body">
      <section class="settings-section"><h3>Telegram</h3><p>Бот напомнит о публикациях, даже когда сайт закрыт.</p>
        <div class="telegram-box"><div class="telegram-status"><span class="dot ${s.telegram_connected ? 'on' : ''}"></span>${s.telegram_connected ? 'Telegram подключён' : 'Telegram не подключён'}</div>
          ${s.telegram_connected
            ? '<button class="button secondary" id="test-telegram">Отправить тест</button> <button class="link-button" id="disconnect-telegram">Отключить</button>'
            : '<button class="button primary" id="connect-telegram">Подключить Telegram</button>'}
        </div>
      </section>
      <section class="settings-section"><h3>Уведомления</h3>
        ${toggle('reminder_hour_enabled', 'За час до публикации', 'Чтобы успеть всё проверить', s.reminder_hour_enabled)}
        ${toggle('reminder_quarter_enabled', 'За 15 минут до публикации', 'Короткое напоминание перед отправкой', s.reminder_quarter_enabled)}
        ${toggle('daily_digest_enabled', 'План на сегодня в 09:00', 'Короткая утренняя сводка', s.daily_digest_enabled)}
        ${toggle('overdue_enabled', 'Если публикация пропущена', 'Напомним один раз после назначенного времени', s.overdue_enabled)}
      </section>
      <section class="settings-section"><h3>Проекты и чаты</h3><p>Выбирайте, куда предназначена каждая публикация.</p>
        <div class="destination-list">${state.destinations.map((item) => `<div class="destination-item"><span>${escapeHtml(item.name)}${item.is_default ? '<small>Основной</small>' : ''}</span>${item.is_default ? '' : `<button class="icon-delete" type="button" data-delete-destination="${item.id}" aria-label="Удалить">×</button>`}</div>`).join('')}</div>
        <form class="destination-form" id="destination-form"><input name="name" maxlength="180" required placeholder="Название проекта, мероприятия или чата"><button class="button secondary" type="submit">Добавить</button></form>
      </section>
      <section class="settings-section"><h3>Подтемы</h3><p>Добавьте свои рубрики для каждого проекта или чата.</p>
        <div class="subtopic-list">${state.subtopics.map((item) => `<div class="destination-item"><span>${escapeHtml(item.name)}<small>${escapeHtml(state.destinations.find((destination) => destination.id === item.destination_id)?.name || 'Проект удалён')}</small></span><button class="icon-delete" type="button" data-delete-subtopic="${item.id}" aria-label="Удалить">×</button></div>`).join('') || '<div class="empty-inline">Подтем пока нет</div>'}</div>
        <form class="subtopic-form" id="subtopic-form"><select name="destination_id" required>${state.destinations.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}</select><input name="name" maxlength="120" required placeholder="Например: Новости проекта"><button class="button secondary" type="submit">Добавить подтему</button></form>
      </section>
      <section class="settings-section"><h3>Стикеры Telegram</h3><p>Отправьте свой стикер этому боту в личном чате. Он сохранится здесь и появится в редакторе публикации.</p>
        <div class="sticker-list">${state.stickers.map((item) => `<div class="sticker-item"><span class="sticker-preview">${escapeHtml(item.emoji || '🎨')}</span><span>${escapeHtml(item.set_name || 'Мой стикер')}</span></div>`).join('') || '<div class="empty-inline">Стикеров пока нет</div>'}</div>
      </section>
      <section class="settings-section"><h3>Доступ</h3><p>${escapeHtml(state.session.user.email)}</p><button class="button secondary" id="change-password">Сменить пароль</button> <button class="link-button" id="sign-out">Выйти</button></section>
    </div>`);
  document.querySelectorAll('[data-setting]').forEach((input) => input.onchange = () => updateSetting(input.dataset.setting, input.checked));
  document.querySelector('#connect-telegram')?.addEventListener('click', connectTelegram);
  document.querySelector('#test-telegram')?.addEventListener('click', testTelegram);
  document.querySelector('#disconnect-telegram')?.addEventListener('click', disconnectTelegram);
  document.querySelector('#destination-form').onsubmit = addDestination;
  document.querySelectorAll('[data-delete-destination]').forEach((button) => button.onclick = () => deleteDestination(button.dataset.deleteDestination));
  document.querySelector('#subtopic-form').onsubmit = addSubtopic;
  document.querySelectorAll('[data-delete-subtopic]').forEach((button) => button.onclick = () => deleteSubtopic(button.dataset.deleteSubtopic));
  document.querySelector('#change-password').onclick = openPasswordChange;
  document.querySelector('#sign-out').onclick = async () => { closeModal(); await supabase.auth.signOut(); };
}

async function addSubtopic(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.name.value.trim();
  const destinationId = form.destination_id.value;
  if (!name || !destinationId) return;
  const { data, error } = await supabase.from('content_subtopics').insert({ user_id: state.session.user.id, destination_id: destinationId, name }).select().single();
  if (error) return toast(error.code === '23505' ? 'Такая подтема уже есть у этого проекта' : humanError(error), 'error');
  state.subtopics.push(data);
  closeModal();
  renderSettings();
  toast('Подтема добавлена');
}

async function deleteSubtopic(id) {
  if (!confirm('Удалить эту подтему? Публикации сохранятся.')) return;
  const { error } = await supabase.from('content_subtopics').delete().eq('id', id);
  if (error) return toast(humanError(error), 'error');
  state.subtopics = state.subtopics.filter((item) => item.id !== id);
  closeModal();
  renderSettings();
  toast('Подтема удалена');
}

async function addDestination(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.name.value.trim();
  if (!name) return;
  const { data, error } = await supabase.from('content_destinations').insert({ user_id: state.session.user.id, name }).select().single();
  if (error) return toast(error.code === '23505' ? 'Такой проект или чат уже есть' : humanError(error), 'error');
  state.destinations.push(data);
  closeModal();
  renderSettings();
  toast('Проект или чат добавлен');
}

async function deleteDestination(id) {
  if (!confirm('Удалить этот проект или чат из списка? Публикации сохранятся.')) return;
  const { error } = await supabase.from('content_destinations').delete().eq('id', id);
  if (error) return toast(humanError(error), 'error');
  state.destinations = state.destinations.filter((item) => item.id !== id);
  closeModal();
  renderSettings();
  toast('Удалено из списка');
}

function openPasswordChange() {
  closeModal();
  showModal(`<div class="modal-head"><h2>Сменить пароль</h2><button class="icon-button close" aria-label="Закрыть">×</button></div>
    <form class="modal-body" id="change-password-form">
      <div class="field"><label for="settings-password">Новый пароль</label><input id="settings-password" name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="Не менее 8 символов" autofocus></div>
      <div class="field"><label for="settings-confirmation">Повторите пароль</label><input id="settings-confirmation" name="confirmation" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="actions"><button class="button secondary close" type="button">Отмена</button><button class="button primary" type="submit">Сохранить пароль</button></div>
    </form>`);
  document.querySelector('#change-password-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.password.value !== form.confirmation.value) return toast('Пароли не совпадают', 'error');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const { error } = await supabase.auth.updateUser({ password: form.password.value });
    button.disabled = false;
    if (error) return toast(humanError(error), 'error');
    closeModal();
    toast('Пароль изменён');
  };
}

function toggle(key, title, detail, checked) {
  return `<label class="toggle-row"><span><strong>${title}</strong><small>${detail}</small></span><span class="switch"><input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''}><span></span></span></label>`;
}

async function updateSetting(key, value) {
  const { error } = await supabase.from('notification_settings').update({ [key]: value }).eq('user_id', state.session.user.id);
  if (error) return toast(humanError(error), 'error');
  state.settings[key] = value;
  toast('Настройка сохранена');
}

async function connectTelegram() {
  const button = document.querySelector('#connect-telegram');
  button.disabled = true;
  const popup = window.open('about:blank', '_blank');
  const { data, error } = await supabase.functions.invoke('telegram-link', { body: {} });
  button.disabled = false;
  if (error || !data?.url) {
    popup?.close();
    return toast(humanError(error || new Error('Не удалось открыть Telegram')), 'error');
  }
  if (popup) popup.location.href = data.url;
  else window.location.href = data.url;
  toast('В Telegram нажмите Start, затем вернитесь сюда');
  pollTelegramConnection();
}

async function pollTelegramConnection() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const { data } = await supabase.from('notification_settings').select('*').single();
    if (data?.telegram_connected) {
      state.settings = data;
      closeModal();
      toast('Telegram подключён');
      return;
    }
  }
}

async function testTelegram() {
  const button = document.querySelector('#test-telegram');
  button.disabled = true;
  const { data, error } = await supabase.functions.invoke('telegram-test', { body: {} });
  button.disabled = false;
  if (error || !data?.ok) return toast(data?.error || humanError(error), 'error');
  toast('Тестовое сообщение отправлено');
}

async function disconnectTelegram() {
  if (!confirm('Отключить уведомления в Telegram?')) return;
  const { error } = await supabase.functions.invoke('telegram-disconnect', { body: {} });
  if (error) return toast(humanError(error), 'error');
  state.settings.telegram_connected = false;
  closeModal();
  toast('Telegram отключён');
}

async function boot() {
  if (!isConfigured()) return renderSetup();
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  supabase.auth.onAuthStateChange((event, session) => {
    state.session = session;
    if (event === 'PASSWORD_RECOVERY') renderPasswordRecovery();
    else if (!session) renderAuth();
    else loadData();
  });
  if (!state.session) renderAuth();
  else await loadData();
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

boot();

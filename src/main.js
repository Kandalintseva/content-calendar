import { createClient } from '@supabase/supabase-js';
import './styles.css';
import { config, isConfigured } from './config.js';
import { addMonths, calendarDays, dateKey, defaultDateTime, formatLongDate, formatTime, isoFromLocal, localInputValue, monthTitle } from './date-utils.js';

const app = document.querySelector('#app');
const supabase = isConfigured() ? createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

const state = {
  session: null,
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  posts: [],
  settings: null,
  modal: null,
  toastTimer: null,
  saveTimer: null,
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const postStatus = (post) => post.status === 'published' ? 'published' : new Date(post.scheduled_at) < new Date() ? 'overdue' : 'planned';

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
    <p class="auth-switch">${signUp ? 'Уже создавали доступ?' : 'Первый вход?'} <button class="link-button" type="button" id="auth-switch">${signUp ? 'Войти' : 'Создать доступ'}</button></p>
  </form></main>`;
  document.querySelector('#auth-switch').onclick = () => renderAuth(!signUp);
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
  const [postsResult, settingsResult] = await Promise.all([
    supabase.from('posts').select('*').gte('scheduled_at', from).lt('scheduled_at', to).order('scheduled_at'),
    supabase.from('notification_settings').select('*').maybeSingle(),
  ]);
  if (postsResult.error) toast(humanError(postsResult.error), 'error');
  state.posts = postsResult.data || [];
  state.settings = settingsResult.data || null;
  renderApp();
}

function renderApp() {
  const days = calendarDays(state.month);
  const today = dateKey(new Date());
  const grouped = Map.groupBy ? Map.groupBy(state.posts, (post) => dateKey(new Date(post.scheduled_at))) : state.posts.reduce((map, post) => {
    const key = dateKey(new Date(post.scheduled_at));
    map.set(key, [...(map.get(key) || []), post]);
    return map;
  }, new Map());

  app.innerHTML = `<div class="shell"><main class="app">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">◫</div><div><h1>Календарь публикаций</h1><p>Нажмите на день, чтобы добавить публикацию</p></div></div>
      <button class="icon-button" id="settings" aria-label="Настройки" title="Настройки">⚙</button>
    </header>
    <section class="calendar-card" aria-label="Календарь">
      <div class="calendar-head">
        <div class="month-nav">
          <button class="icon-button" id="prev-month" aria-label="Предыдущий месяц">‹</button>
          <div class="month-title">${monthTitle(state.month)}</div>
          <button class="icon-button" id="next-month" aria-label="Следующий месяц">›</button>
        </div>
        <button class="today-button" id="today">Сегодня</button>
      </div>
      <div class="weekdays">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((day) => `<div class="weekday">${day}</div>`).join('')}</div>
      <div class="calendar-grid">${days.map((day) => renderDay(day, grouped.get(dateKey(day)) || [], today)).join('')}</div>
    </section>
  </main><button class="fab" id="add" aria-label="Добавить публикацию" title="Добавить публикацию">+</button></div>`;

  document.querySelector('#prev-month').onclick = () => changeMonth(-1);
  document.querySelector('#next-month').onclick = () => changeMonth(1);
  document.querySelector('#today').onclick = () => { state.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1); loadData(); };
  document.querySelector('#settings').onclick = openSettings;
  document.querySelector('#add').onclick = () => openEditor(null, new Date());
  document.querySelectorAll('.day').forEach((el) => el.onclick = (event) => {
    if (event.target.closest('.post-card')) return;
    openEditor(null, new Date(`${el.dataset.date}T12:00:00`));
  });
  document.querySelectorAll('.post-card').forEach((el) => el.onclick = (event) => {
    event.stopPropagation();
    openEditor(state.posts.find((post) => post.id === el.dataset.id));
  });
}

function renderDay(day, posts, today) {
  const key = dateKey(day);
  const other = day.getMonth() !== state.month.getMonth();
  return `<button class="day ${other ? 'other' : ''} ${key === today ? 'today' : ''}" data-date="${key}" aria-label="${day.toLocaleDateString('ru-RU')}">
    <span class="day-number">${day.getDate()}</span>
    <span class="posts">${posts.slice(0, 3).map((post) => `<span class="post-card ${postStatus(post)}" data-id="${post.id}">
      <span class="post-time">${formatTime(post.scheduled_at)}</span>
      <span class="post-title">${escapeHtml(post.title)}</span>
      <span class="post-status" aria-label="${postStatus(post) === 'published' ? 'Опубликовано' : postStatus(post) === 'overdue' ? 'Просрочено' : 'Запланировано'}">${postStatus(post) === 'published' ? '✓' : postStatus(post) === 'overdue' ? '!' : '•'}</span>
    </span>`).join('')}${posts.length > 3 ? `<span class="more">ещё ${posts.length - 3}</span>` : ''}</span>
  </button>`;
}

async function changeMonth(amount) {
  state.month = addMonths(state.month, amount);
  await loadData();
}

function openEditor(post = null, day = new Date()) {
  const isNew = !post;
  const value = post || { title: '', content: '', scheduled_at: new Date(defaultDateTime(day)).toISOString(), status: 'planned' };
  state.modal = { type: 'editor', id: post?.id || null };
  showModal(`<div class="modal-head"><div><h2>${isNew ? 'Новая публикация' : 'Публикация'}</h2><small>${formatLongDate(value.scheduled_at)}</small></div><button class="icon-button close" aria-label="Закрыть">×</button></div>
    <form class="modal-body" id="post-form">
      <div class="field"><label for="title">Название</label><input id="title" name="title" value="${escapeHtml(value.title)}" required maxlength="160" autofocus placeholder="О чём публикация?"></div>
      <div class="field"><label for="scheduled_at">Дата и время</label><input id="scheduled_at" name="scheduled_at" type="datetime-local" value="${localInputValue(value.scheduled_at)}" required></div>
      <div class="field"><label for="content">Текст и заметки</label><textarea id="content" name="content" placeholder="Текст публикации, идея или ссылка…">${escapeHtml(value.content || '')}</textarea></div>
      <label class="toggle-row"><span><strong>Уже опубликовано</strong><small>Напоминания больше не придут</small></span><span class="switch"><input name="published" type="checkbox" ${value.status === 'published' ? 'checked' : ''}><span></span></span></label>
      <div class="autosave" id="autosave">${isNew ? '' : 'Все изменения сохраняются автоматически'}</div>
      <div class="actions">${isNew ? '' : '<button class="button danger" type="button" id="delete-post">Удалить</button>'}<button class="button secondary close" type="button">Закрыть</button>${isNew ? '<button class="button primary" type="submit">Добавить</button>' : ''}</div>
    </form>`);
  const form = document.querySelector('#post-form');
  form.onsubmit = async (event) => { event.preventDefault(); await savePost(form, post?.id, true); };
  if (!isNew) {
    form.oninput = () => scheduleAutoSave(form, post.id);
    form.onchange = () => scheduleAutoSave(form, post.id, 100);
    document.querySelector('#delete-post').onclick = () => deletePost(post.id);
  }
  setTimeout(() => document.querySelector('#title')?.focus(), 80);
}

function scheduleAutoSave(form, id, delay = 650) {
  clearTimeout(state.saveTimer);
  const label = document.querySelector('#autosave');
  if (label) label.textContent = 'Сохраняем…';
  state.saveTimer = setTimeout(() => savePost(form, id, false), delay);
}

async function savePost(form, id, closeAfter) {
  if (!form.reportValidity()) return;
  const payload = {
    user_id: state.session.user.id,
    title: form.title.value.trim(),
    content: form.content.value.trim(),
    scheduled_at: isoFromLocal(form.scheduled_at.value),
    status: form.published.checked ? 'published' : 'planned',
    published_at: form.published.checked ? new Date().toISOString() : null,
  };
  const result = id
    ? await supabase.from('posts').update(payload).eq('id', id).select().single()
    : await supabase.from('posts').insert(payload).select().single();
  if (result.error) return toast(humanError(result.error), 'error');
  if (closeAfter) closeModal();
  else {
    const label = document.querySelector('#autosave');
    if (label) label.textContent = 'Сохранено';
  }
  await loadData();
  if (closeAfter) toast('Публикация добавлена');
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
        ${toggle('daily_digest_enabled', 'План на сегодня в 09:00', 'Короткая утренняя сводка', s.daily_digest_enabled)}
        ${toggle('overdue_enabled', 'Если публикация пропущена', 'Напомним один раз после назначенного времени', s.overdue_enabled)}
      </section>
      <section class="settings-section"><h3>Доступ</h3><p>${escapeHtml(state.session.user.email)}</p><button class="button secondary" id="sign-out">Выйти</button></section>
    </div>`);
  document.querySelectorAll('[data-setting]').forEach((input) => input.onchange = () => updateSetting(input.dataset.setting, input.checked));
  document.querySelector('#connect-telegram')?.addEventListener('click', connectTelegram);
  document.querySelector('#test-telegram')?.addEventListener('click', testTelegram);
  document.querySelector('#disconnect-telegram')?.addEventListener('click', disconnectTelegram);
  document.querySelector('#sign-out').onclick = async () => { closeModal(); await supabase.auth.signOut(); };
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
  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    if (!session) renderAuth();
    else loadData();
  });
  if (!state.session) renderAuth();
  else await loadData();
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

boot();

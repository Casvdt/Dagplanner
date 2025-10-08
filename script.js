const calendar = document.querySelector('.calendar');
const taskForm = document.querySelector('.task-form');
const taskInput = document.querySelector('.task-input');
const taskTime = document.querySelector('.task-time');
const taskReminder = document.querySelector('.task-reminder');
const taskPriority = document.querySelector('.task-priority');
const taskList = document.querySelector('.task-list');
const selectedDayTitle = document.querySelector('.selected-day');
const progressBar = document.querySelector('.progress-bar');
const progressText = document.querySelector('.progress-text');
const themeToggle = document.getElementById('theme-toggle');
const monthTitleEl = document.querySelector('.month-title');
const monthPrevBtn = document.querySelector('.month-prev');
const monthNextBtn = document.querySelector('.month-next');
const selectToggle = document.getElementById('select-toggle');
const bulkBar = document.querySelector('.bulk-actions');
const bulkCount = document.querySelector('.bulk-count');
const bulkDeleteBtn = document.querySelector('.bulk-delete');
const bulkCancelBtn = document.querySelector('.bulk-cancel');
// Removed: copy subscription button (no longer used)

let selectedDate = null;
let viewYear, viewMonth; // month: 0-11

// Taken opslaan in localStorage
let tasksData = JSON.parse(localStorage.getItem('tasksData')) || {};
// Tijdelijke timers voor herinneringen (niet persistent)
const reminderTimers = new Map(); // key: taskId -> timeoutId
let dragOverBound = false;
let selectionMode = false;
const selectedIds = new Set();

// Herinnering uitschakelen wanneer geen tijd is ingevuld
function updateReminderState() {
    if (!taskReminder) return;
    const hasTime = Boolean(taskTime && taskTime.value);
    taskReminder.disabled = !hasTime;
    if (!hasTime) {
        taskReminder.value = 'none';
    }
}

// Bulk selection helpers
function setSelectionMode(on) {
    selectionMode = Boolean(on);
    selectedIds.clear();
    updateBulkUI();
    // Re-render to add/remove checkboxes
    showTasks();
}

function toggleSelect(taskId, isSelected) {
    if (isSelected) selectedIds.add(taskId); else selectedIds.delete(taskId);
    updateBulkUI();
}

function updateBulkUI() {
    if (!bulkBar || !bulkCount || !selectToggle) return;
    const count = selectedIds.size;
    bulkBar.style.display = selectionMode ? 'flex' : 'none';
    bulkBar.setAttribute('aria-hidden', selectionMode ? 'false' : 'true');
    bulkCount.textContent = `${count} geselecteerd`;
    selectToggle.textContent = selectionMode ? '✔️ Klaar met selecteren' : '☑️ Selecteer taken';
}

if (selectToggle) {
    selectToggle.addEventListener('click', () => setSelectionMode(!selectionMode));
}
if (bulkCancelBtn) {
    bulkCancelBtn.addEventListener('click', () => setSelectionMode(false));
}
if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', () => {
        if (!selectedDate || selectedIds.size === 0) return;
        const countToDelete = selectedIds.size;
        const tasks = tasksData[selectedDate] || [];
        const toDelete = new Set(selectedIds);
        const remaining = [];
        tasks.forEach(t => {
            if (toDelete.has(t.id)) {
                cancelReminder(t.id);
            } else {
                remaining.push(t);
            }
        });
        tasksData[selectedDate] = remaining;
        saveTasks();
        setSelectionMode(false);
        showTasks();
        updateProgress();
        // Bigger confetti burst for bulk delete
        try {
            const particles = Math.min(120 + countToDelete * 60, 600);
            confetti({ particleCount: particles, spread: 100, origin: { y: 0.6 } });
            // Second wider burst for effect
            confetti({ particleCount: Math.min(Math.floor(particles / 2), 300), spread: 140, scalar: 1.2, origin: { y: 0.4 } });
        } catch (e) { /* confetti lib not available */ }
    });
}

// (Removed copy-subscription UI and handler)

if (taskTime) {
    taskTime.addEventListener('input', updateReminderState);
}
updateReminderState();

// Notification API helpers
function showNotification(title, options) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification(title, options);
    }
}

// Request permission on load and log the result (once)
if ('Notification' in window) {
    Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
    });
}

// Service Worker + Push subscription (requires HTTPS or localhost)
async function registerServiceWorkerAndSubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('ServiceWorker/Push not supported');
        return;
    }
    try {
        const reg = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered:', reg.scope);

        // If already subscribed, reuse it
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            const publicKey = (window.VAPID_PUBLIC_KEY || '').trim();
            if (!publicKey) {
                console.warn('No VAPID public key set. Set window.VAPID_PUBLIC_KEY to subscribe.');
                return;
            }
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }
        console.log('Push subscription:', JSON.stringify(sub));
        localStorage.setItem('pushSubscription', JSON.stringify(sub));
    } catch (err) {
        console.error('SW/Push setup failed:', err);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Thema beheer
function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark', isDark);
    updateThemeToggleLabel();
}

function formatDateNL(dateKey) {
    // dateKey: YYYY-M-D
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(n => parseInt(n, 10));
    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${dd}-${mm}-${y}`;
}

// Nieuwe taak toevoegen (submit handler)
taskForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!selectedDate) return;

    const text = taskInput.value.trim();
    if (!text) {
        taskInput.classList.add('shake');
        taskInput.addEventListener('animationend', () => taskInput.classList.remove('shake'), { once: true });
        return;
    }

    const time = taskTime.value;
    const reminder = taskReminder?.value || 'none';
    const priority = normalizePriority(taskPriority.value);

    if (!tasksData[selectedDate]) tasksData[selectedDate] = [];
    const newTask = { id: genId(), text, time, priority, reminder, favorite: false, completed: false };
    tasksData[selectedDate].push(newTask);

    saveTasks();
    showTasks();
    updateDayColor(document.querySelector('.day.selected'), selectedDate);
    scheduleReminderForTask(selectedDate, newTask);

    taskInput.value = '';
    taskTime.value = '';
    if (taskReminder) taskReminder.value = 'none';
    taskPriority.value = 'belangrijk';
});

function getInitialTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

function updateThemeToggleLabel() {
    const isDark = document.body.classList.contains('dark');
    themeToggle.textContent = isDark ? '☀️ Licht thema' : '🌙 Donker thema';
}

// Maandnamen NL
const MONTH_NAMES_NL = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

// Kalender genereren voor viewYear/viewMonth
function generateCalendar() {
    if (typeof viewYear !== 'number' || typeof viewMonth !== 'number') {
        const now = new Date();
        viewYear = now.getFullYear();
        viewMonth = now.getMonth();
    }

    const year = viewYear;
    const month = viewMonth; // 0-11
    if (monthTitleEl) monthTitleEl.textContent = `${MONTH_NAMES_NL[month]} ${year}`;

    calendar.innerHTML = '';

    const firstDayRaw = new Date(year, month, 1).getDay(); // 0=zo .. 6=za
    const firstDay = (firstDayRaw + 6) % 7; // maak maandag=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        calendar.appendChild(document.createElement('div'));
    }

    const today = new Date();
    const isThisMonth = today.getFullYear() === year && today.getMonth() === month;
    let todayEl = null;

    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        dayEl.classList.add('day');
        dayEl.textContent = day;

        const dayKey = `${year}-${month + 1}-${day}`;
        updateDayColor(dayEl, dayKey);

        dayEl.addEventListener('click', () => {
            selectedDate = dayKey;
            selectDay(dayEl);
            showTasks();
        });

        calendar.appendChild(dayEl);

        if (isThisMonth && today.getDate() === day) {
            todayEl = dayEl;
        }
        // If a previously selectedDate is in this view, re-select it
        if (selectedDate) {
            const [sy, sm, sd] = selectedDate.split('-').map(n => parseInt(n, 10));
            if (sy === year && (sm - 1) === month && sd === day) {
                todayEl = dayEl; // reuse selection mechanism
            }
        }
    }

    // Auto-select: prefer selectedDate in this month, else today if current month
    if (todayEl) {
        todayEl.click();
    }
}

// Dag selecteren
function selectDay(dayEl) {
    document.querySelectorAll('.day').forEach(d => d.classList.remove('selected'));
    dayEl.classList.add('selected');
    selectedDayTitle.textContent = `Taken voor ${formatDateNL(selectedDate)}`;
    // Exit selection mode when changing day
    setSelectionMode(false);
}

// Taken tonen
function showTasks() {
    taskList.innerHTML = '';
    if (!selectedDate) return;
    const tasks = tasksData[selectedDate] || [];

    // Sorteren: tijd oplopend, dan prioriteit (heel > belangrijk > minder)
    // Backwards compatible met oude waarden (high/normal/low)
    const priorityRank = { heel: 0, belangrijk: 1, minder: 2, high: 0, normal: 1, low: 2 };
    const toMinutes = (t) => {
        if (!t) return Number.POSITIVE_INFINITY; // zonder tijd achteraan
        const [hh, mm] = t.split(':').map(n => parseInt(n, 10));
        if (Number.isNaN(hh) || Number.isNaN(mm)) return Number.POSITIVE_INFINITY;
        return hh * 60 + mm;
    };
    const sorted = [...tasks].sort((a, b) => {
        const diff = toMinutes(a.time) - toMinutes(b.time);
        if (diff !== 0) return diff;
        const pa = priorityRank[normalizePriority(a.priority)] ?? 1;
        const pb = priorityRank[normalizePriority(b.priority)] ?? 1;
        return pa - pb; // high(0) eerst
    });

    sorted.forEach(task => {
        const li = document.createElement('li');
        li.classList.add('bounce-in');
        li.setAttribute('draggable', 'true');
        li.dataset.id = task.id || (task.id = genId());

        // Left-side: favorite + text + badges
        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';

        // Bulk select checkbox (only in selection mode)
        if (selectionMode) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'task-select';
            checkbox.checked = selectedIds.has(task.id);
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSelect(task.id, checkbox.checked);
            });
            left.appendChild(checkbox);
        }

        // Favorite toggle
        const favBtn = document.createElement('button');
        favBtn.className = 'fav-btn' + (task.favorite ? ' active' : '');
        favBtn.title = 'Markeer als favoriet';
        favBtn.textContent = task.favorite ? '★' : '☆';
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            task.favorite = !task.favorite;
            favBtn.textContent = task.favorite ? '★' : '☆';
            favBtn.classList.toggle('active', task.favorite);
            saveTasks();
        });

        const textSpan = document.createElement('span');
        textSpan.textContent = `${task.time ? task.time + ' - ' : ''}${task.text}`;

        // Due badges
        const badge = buildDueBadge(selectedDate, task.time);
        if (badge) textSpan.appendChild(badge);

        left.appendChild(favBtn);
        left.appendChild(textSpan);

        li.appendChild(left);
        // Prioriteit-stijl (genormaliseerd)
        const pNorm = normalizePriority(task.priority);
        if (pNorm) li.classList.add(pNorm);
        if (task.completed) li.classList.add('completed');

        li.addEventListener('click', () => {
            if (selectionMode) {
                const currentlySelected = selectedIds.has(task.id);
                toggleSelect(task.id, !currentlySelected);
                // keep visual checkbox in sync if present
                const cb = li.querySelector('input.task-select');
                if (cb) cb.checked = !currentlySelected;
                return;
            }
            task.completed = !task.completed;
            li.classList.toggle('completed');
            saveTasks();
            updateProgress();
            cancelReminder(task.id);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.classList.add('delete-btn');
        deleteBtn.addEventListener('click', e => {
            e.stopPropagation();
            const index = tasks.indexOf(task);
            tasks.splice(index, 1);
            li.remove();
            saveTasks();
            updateDayColor(document.querySelector(`.day.selected`), selectedDate);
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            updateProgress();
            cancelReminder(task.id);
        });

        li.appendChild(deleteBtn);
        taskList.appendChild(li);

        // Hide completed if toggled
        // Geen verberg voltooide meer

        // Drag & drop handlers
        setupDragHandlers(li, task);
    });

    updateProgress();
    // Herinneringen plannen voor zichtbare dag
    scheduleRemindersForDay(selectedDate);
    // Bind dragover eenmaal
    attachDragOverOnce();
    updateBulkUI();
}

// Taken opslaan
function saveTasks() {
    localStorage.setItem('tasksData', JSON.stringify(tasksData));
}

// Dag kleur op basis van taken
function updateDayColor(dayEl, key) {
    if (!dayEl) return;
    dayEl.classList.remove('load-few', 'load-many');
    const count = (tasksData[key] || []).length;
    if (count === 0) return; // geen extra klasse
    if (count <= 2) {
        dayEl.classList.add('load-few');
    } else {
        dayEl.classList.add('load-many');
    }
}

// Voortgangsbalk updaten
function updateProgress() {
    if (!selectedDate) return;
    const tasks = tasksData[selectedDate] || [];
    if (tasks.length === 0) {
        progressBar.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        return;
    }
    const completedCount = tasks.filter(t => t.completed).length;
    const percent = (completedCount / tasks.length) * 100;
    progressBar.style.width = percent + '%';
    if (progressText) progressText.textContent = `${Math.round(percent)}% (${completedCount}/${tasks.length})`;
}

// Theme toggle
themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    const theme = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    updateThemeToggleLabel();
});

// Maand navigatie
function goToPrevMonth() {
    if (typeof viewYear !== 'number' || typeof viewMonth !== 'number') {
        const now = new Date();
        viewYear = now.getFullYear();
        viewMonth = now.getMonth();
    }
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    generateCalendar();
}

function goToNextMonth() {
    if (typeof viewYear !== 'number' || typeof viewMonth !== 'number') {
        const now = new Date();
        viewYear = now.getFullYear();
        viewMonth = now.getMonth();
    }
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    generateCalendar();
}

if (monthPrevBtn) monthPrevBtn.addEventListener('click', goToPrevMonth);
if (monthNextBtn) monthNextBtn.addEventListener('click', goToNextMonth);

function goToTodayMonth() {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    generateCalendar();
}

function isTypingInInput(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || e.isComposing;
}

// Keyboard navigation: ArrowLeft/Right and PageUp/PageDown, Home for today
document.addEventListener('keydown', (e) => {
    if (isTypingInInput(e)) return;
    switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
            e.preventDefault();
            goToPrevMonth();
            break;
        case 'ArrowRight':
        case 'PageDown':
            e.preventDefault();
            goToNextMonth();
            break;
        case 'Home':
            e.preventDefault();
            goToTodayMonth();
            break;
        default:
            break;
    }
});

// (Feature verwijderd) Verberg voltooide taken

// Init
applyTheme(getInitialTheme());
generateCalendar();
updateThemeToggleLabel();
// Register SW + subscribe to Push (requires window.VAPID_PUBLIC_KEY)
registerServiceWorkerAndSubscribe();

// Helpers
function genId() {
    return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function normalizePriority(val) {
    if (!val) return 'belangrijk';
    switch (val) {
        case 'heel':
        case 'high':
            return 'heel';
        case 'minder':
        case 'low':
            return 'minder';
        case 'belangrijk':
        case 'normal':
        default:
            return 'belangrijk';
    }
}

function buildDueBadge(dateKey, timeStr) {
    if (!timeStr) return null;
    const taskDate = parseDateTime(dateKey, timeStr);
    const now = new Date();
    const diffMs = taskDate - now;
    const span = document.createElement('span');
    span.className = 'badge';
    if (diffMs < 0) {
        span.classList.add('overdue');
        span.textContent = 'Te laat';
    } else if (diffMs <= 60 * 60 * 1000) {
        span.classList.add('due-soon');
        span.textContent = 'Binnen 1u';
    } else {
        // Geen badge nodig als niet snel
        return null;
    }
    return span;
}

function parseDateTime(dateKey, timeStr) {
    // dateKey: YYYY-M-D
    const [y, m, d] = dateKey.split('-').map(n => parseInt(n, 10));
    const [hh, mm] = timeStr.split(':').map(n => parseInt(n, 10));
    return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

// Drag & drop
function setupDragHandlers(li, task) {
    li.addEventListener('dragstart', (e) => {
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
    });
    li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        persistOrderFromDOM();
    });
}

function attachDragOverOnce() {
    if (dragOverBound) return;
    taskList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(taskList, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (!dragging) return;
        if (afterElement == null) {
            taskList.appendChild(dragging);
        } else {
            taskList.insertBefore(dragging, afterElement);
        }
    });
    dragOverBound = true;
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function persistOrderFromDOM() {
    if (!selectedDate) return;
    const currentTasks = tasksData[selectedDate] || [];
    const idToTask = new Map(currentTasks.map(t => [t.id, t]));
    const newOrder = [];
    taskList.querySelectorAll('li').forEach(li => {
        // Extract id from favorite button's listener context via dataset
        // Safer approach: rebuild by matching text; instead we set dataset
    });
    // Rebuild using a dataset set earlier
    const lis = [...taskList.children];
    lis.forEach(li => {
        const id = li.dataset.id;
        if (id && idToTask.has(id)) newOrder.push(idToTask.get(id));
    });
    if (newOrder.length === currentTasks.length) {
        tasksData[selectedDate] = newOrder;
        saveTasks();
    }
}

// Herinneringen en notificaties
function scheduleRemindersForDay(dateKey) {
    const tasks = tasksData[dateKey] || [];
    tasks.forEach(task => scheduleReminderForTask(dateKey, task));
}

function scheduleReminderForTask(dateKey, task) {
    cancelReminder(task.id);
    if (!task || !task.time || !task.reminder || task.reminder === 'none') return;
    const when = parseDateTime(dateKey, task.time);
    const minutesBefore = parseInt(task.reminder, 10) || 0;
    const notifyAt = new Date(when.getTime() - minutesBefore * 60000);
    const delay = notifyAt.getTime() - Date.now();
    if (delay <= 0) return;
    requestNotificationPermission();
    // Local fallback notification (only works if tab is open)
    const timeoutId = setTimeout(() => notifyTask(task, dateKey), delay);
    reminderTimers.set(task.id, timeoutId);

    // No server-side push scheduling; rely on local in-page notifications only
}

function cancelReminder(taskId) {
    if (!reminderTimers.has(taskId)) return;
    clearTimeout(reminderTimers.get(taskId));
    reminderTimers.delete(taskId);
}

function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
function notifyTask(task, dateKey) {
    const title = 'Herinnering!';
    const dateStr = formatDateNL(dateKey);
    const body = `${dateStr} ${task.time ? task.time + ' - ' : ''}${task.text}`;
    if ('Notification' in window && Notification.permission === 'granted') {
        showNotification(title, { body, icon: 'images/calendar.png' });
    } else {
        alert(`${title}: ${body}`);
    }
    // Reset priority default to 'belangrijk' after submit
    task.priority = normalizePriority(task.priority);
}

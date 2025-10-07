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

let selectedDate = null;

// Taken opslaan in localStorage
let tasksData = JSON.parse(localStorage.getItem('tasksData')) || {};
// Tijdelijke timers voor herinneringen (niet persistent)
const reminderTimers = new Map(); // key: taskId -> timeoutId
let dragOverBound = false;

// Thema beheer
function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark', isDark);
    updateThemeToggleLabel();
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
    const priority = taskPriority.value;

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
    taskPriority.value = 'normal';
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

// Kalender genereren
function generateCalendar() {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    calendar.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        calendar.appendChild(document.createElement('div'));
    }
    let todayEl = null;
    const today = new Date();
    const isThisMonth = today.getFullYear() === year && today.getMonth() === month;
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
    }
    // Auto-selecteer vandaag
    if (todayEl) {
        todayEl.click();
    }
}

// Dag selecteren
function selectDay(dayEl) {
    document.querySelectorAll('.day').forEach(d => d.classList.remove('selected'));
    dayEl.classList.add('selected');
    selectedDayTitle.textContent = `Taken voor ${selectedDate}`;
}

// Taken tonen
function showTasks() {
    taskList.innerHTML = '';
    if (!selectedDate) return;
    const tasks = tasksData[selectedDate] || [];

    // Sorteren: tijd oplopend, dan prioriteit (Hoog > Normaal > Laag)
    const priorityRank = { high: 0, normal: 1, low: 2 };
    const toMinutes = (t) => {
        if (!t) return Number.POSITIVE_INFINITY; // zonder tijd achteraan
        const [hh, mm] = t.split(':').map(n => parseInt(n, 10));
        if (Number.isNaN(hh) || Number.isNaN(mm)) return Number.POSITIVE_INFINITY;
        return hh * 60 + mm;
    };
    const sorted = [...tasks].sort((a, b) => {
        const diff = toMinutes(a.time) - toMinutes(b.time);
        if (diff !== 0) return diff;
        const pa = priorityRank[a.priority] ?? 1;
        const pb = priorityRank[b.priority] ?? 1;
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
        // Prioriteit-stijl
        if (task.priority) li.classList.add(task.priority);
        if (task.completed) li.classList.add('completed');

        li.addEventListener('click', () => {
            task.completed = !task.completed;
            li.classList.toggle('completed');
            saveTasks();
            updateProgress();
            if (hideCompletedCheckbox?.checked) {
                li.style.display = task.completed ? 'none' : '';
            }
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

// (Feature verwijderd) Verberg voltooide taken

// Init
applyTheme(getInitialTheme());
generateCalendar();
updateThemeToggleLabel();

// Helpers
function genId() {
    return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    const timeoutId = setTimeout(() => notifyTask(task, dateKey), delay);
    reminderTimers.set(task.id, timeoutId);
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
    const title = 'Herinnering';
    const body = `${task.time ? task.time + ' - ' : ''}${task.text}`;
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
    } else {
        alert(`${title}: ${body}`);
    }
}

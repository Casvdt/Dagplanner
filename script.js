const calendar = document.querySelector('.calendar');
const taskForm = document.querySelector('.task-form');
const taskInput = document.querySelector('.task-input');
const taskTime = document.querySelector('.task-time');
const taskPriority = document.querySelector('.task-priority');
const taskList = document.querySelector('.task-list');
const selectedDayTitle = document.querySelector('.selected-day');
const progressBar = document.querySelector('.progress-bar');
const themeToggle = document.getElementById('theme-toggle');

let selectedDate = null;

// Taken opslaan in localStorage
let tasksData = JSON.parse(localStorage.getItem('tasksData')) || {};

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

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.textContent = `${task.time ? task.time + ' - ' : ''}${task.text}`;
        li.classList.add(task.priority);

        if (task.completed) li.classList.add('completed');

        li.addEventListener('click', () => {
            task.completed = !task.completed;
            li.classList.toggle('completed');
            saveTasks();
            updateProgress();
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

            // 🎉 Confetti
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });

            updateProgress();
        });

        li.appendChild(deleteBtn);
        taskList.appendChild(li);
    });

    updateProgress();
}

// Nieuwe taak toevoegen
taskForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!selectedDate) return;

    const text = taskInput.value.trim();
    if (!text) return;

    const time = taskTime.value;
    const priority = taskPriority.value;

    if (!tasksData[selectedDate]) tasksData[selectedDate] = [];
    tasksData[selectedDate].push({ text, time, priority, completed: false });

    taskInput.value = '';
    taskTime.value = '';
    taskPriority.value = 'normal';
    showTasks();
    saveTasks();
    updateDayColor(document.querySelector(`.day.selected`), selectedDate);
});

// Taken opslaan
function saveTasks() {
    localStorage.setItem('tasksData', JSON.stringify(tasksData));
}

// Dag kleur op basis van taken
function updateDayColor(dayEl, key) {
    if (!tasksData[key] || tasksData[key].length === 0) {
        dayEl.style.backgroundColor = '';
    } else if (tasksData[key].length <= 2) {
        dayEl.style.backgroundColor = '#a5b4fc';
    } else {
        dayEl.style.backgroundColor = '#6366f1';
        dayEl.style.color = '#fff';
    }
}

// Voortgangsbalk updaten
function updateProgress() {
    if (!selectedDate) return;
    const tasks = tasksData[selectedDate] || [];
    if (tasks.length === 0) {
        progressBar.style.width = '0%';
        return;
    }
    const completedCount = tasks.filter(t => t.completed).length;
    const percent = (completedCount / tasks.length) * 100;
    progressBar.style.width = percent + '%';
}

// Theme toggle
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
});

// Init
generateCalendar();

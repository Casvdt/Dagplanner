const calendar = document.querySelector('.calendar');
const taskForm = document.querySelector('.task-form');
const taskInput = document.querySelector('.task-input');
const taskList = document.querySelector('.task-list');
const selectedDayTitle = document.querySelector('.selected-day');

let selectedDate = null;

// Taken per dag opslaan in localStorage
let tasksData = JSON.parse(localStorage.getItem('tasksData')) || {};

// Kalender maken voor de huidige maand
function generateCalendar() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  calendar.innerHTML = '';

  // Lege dagen voor de eerste dag van de maand
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    calendar.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayEl = document.createElement('div');
    dayEl.classList.add('day');
    dayEl.textContent = day;

    dayEl.addEventListener('click', () => {
      selectedDate = `${year}-${month + 1}-${day}`;
      selectDay(dayEl); // ✅ juiste functie
      showTasks();
    });

    calendar.appendChild(dayEl);
  }
}

// ✅ functie hernoemd
function selectDay(dayEl) {
  document.querySelectorAll('.day').forEach(d => d.classList.remove('selected'));
  dayEl.classList.add('selected');
  selectedDayTitle.textContent = `Taken voor ${selectedDate}`;
}

// Taken tonen voor geselecteerde dag
function showTasks() {
  taskList.innerHTML = '';
  if (!selectedDate) return;
  const tasks = tasksData[selectedDate] || [];

  tasks.forEach(task => {
    const li = document.createElement('li');
    li.textContent = task.text;

    if (task.completed) li.classList.add('completed');

    li.addEventListener('click', () => {
      task.completed = !task.completed;
      li.classList.toggle('completed');
      if (task.completed) {
        li.classList.add('animate');
        setTimeout(() => li.classList.remove('animate'), 300);
      }
      saveTasks();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      const index = tasks.indexOf(task);
      tasks.splice(index, 1);
      li.remove();
      saveTasks();

      confetti({
        particleCount: 100,
        spread: 70,
        origin: {y: 0.6}
      });
    });

    li.appendChild(deleteBtn);
    taskList.appendChild(li);
  });
}

// Nieuwe taak toevoegen
taskForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!selectedDate) return;

  const text = taskInput.value.trim();
  if (!text) return;

  if (!tasksData[selectedDate]) tasksData[selectedDate] = [];
  const task = { text, completed: false };
  tasksData[selectedDate].push(task);

  taskInput.value = '';
  showTasks();
  saveTasks();
});

function saveTasks() {
  localStorage.setItem('tasksData', JSON.stringify(tasksData));
}

// Init
generateCalendar();

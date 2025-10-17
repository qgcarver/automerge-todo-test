import { Repo, IndexedDBStorageAdapter, WebSocketClientAdapter, isValidAutomergeUrl, initializeWasm } from "https://esm.sh/@automerge/vanillajs/slim?bundle-deps"

// Initialize Automerge WASM
await initializeWasm(
  fetch("https://esm.sh/@automerge/automerge/dist/automerge.wasm")
)

// Create a repo with IndexedDB storage and WebSocket sync
const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [new WebSocketClientAdapter("wss://sync3.automerge.org")]
})

console.log("Your repo", repo)

// LocalStorage keys
const LISTS_KEY = 'automerge-lists'
const ACTIVE_LIST_KEY = 'automerge-active-list'

// Current state
let currentHandle = null
let lists = []

// DOM elements
const createListForm = document.getElementById('create-list-form');
const listNameInput = document.getElementById('list-name-input');
const openUrlForm = document.getElementById('open-url-form');
const urlInput = document.getElementById('url-input');
const listsContainer = document.getElementById('lists-container');
const currentListName = document.getElementById('current-list-name');
const shareCurrentBtn = document.getElementById('share-current-btn');
const deleteCurrentBtn = document.getElementById('delete-current-btn');
const todoSection = document.getElementById('todo-section');
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');
const docState = document.getElementById('docState');

// Load lists from localStorage
function loadLists() {
  const stored = localStorage.getItem(LISTS_KEY);
  return stored ? JSON.parse(stored) : [];
}

// Save lists to localStorage
function saveLists() {
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
}

// Get active list URL from localStorage
function getActiveListUrl() {
  return localStorage.getItem(ACTIVE_LIST_KEY);
}

// Save active list URL to localStorage
function saveActiveListUrl(url) {
  localStorage.setItem(ACTIVE_LIST_KEY, url);
}

// Create a new list
async function createNewList(name) {
  const handle = repo.create({ name: name, todos: [] });
  const listInfo = {
    url: handle.url,
    name: name
  };

  lists.push(listInfo);
  saveLists();

  await switchToList(handle.url);
  renderListsUI();
}

// Open a list by URL
async function openListByUrl(url) {
  if (!isValidAutomergeUrl(url)) {
    alert('Invalid Automerge URL');
    return;
  }

  // Check if already in lists
  const existing = lists.find(l => l.url === url);
  if (existing) {
    await switchToList(url);
    return;
  }

  // Load the document to get its name
  const handle = await repo.find(url);
  const doc = handle.doc();

  const listInfo = {
    url: url,
    name: doc?.name || 'Unnamed List'
  };

  lists.push(listInfo);
  saveLists();

  await switchToList(url);
  renderListsUI();
}

// Switch to a list
async function switchToList(url) {
  // Clean up old handle listener
  if (currentHandle) {
    currentHandle.off('change', render);
  }

  currentHandle = await repo.find(url);
  saveActiveListUrl(url);

  // Subscribe to changes
  currentHandle.on('change', () => {
    render();
  });

  // Update UI
  const listInfo = lists.find(l => l.url === url);
  currentListName.textContent = listInfo?.name || 'Unknown';
  todoSection.style.display = 'block';
  shareCurrentBtn.style.display = 'inline';
  deleteCurrentBtn.style.display = 'inline';

  // Update lists UI to show active state
  renderListsUI();

  render();
}

// Delete the current list (just removes from our local list, doesn't delete the document)
function deleteCurrentList() {
  if (!currentHandle) return;

  const url = currentHandle.url;
  const listName = lists.find(l => l.url === url)?.name || 'this list';

  if (!confirm(`Delete "${listName}" from your list?`)) {
    return;
  }

  lists = lists.filter(l => l.url !== url);
  saveLists();

  currentHandle = null;
  saveActiveListUrl('');
  currentListName.textContent = 'None';
  todoSection.style.display = 'none';
  shareCurrentBtn.style.display = 'none';
  deleteCurrentBtn.style.display = 'none';
  docState.textContent = 'No list selected';

  renderListsUI();
}

// Share the current list (copy URL to clipboard)
async function shareCurrentList() {
  if (!currentHandle) return;

  try {
    await navigator.clipboard.writeText(currentHandle.url);
    alert('List URL copied to clipboard!');
  } catch (err) {
    prompt('Copy this URL:', currentHandle.url);
  }
}

// Render the lists UI
function renderListsUI() {
  listsContainer.innerHTML = '';

  if (lists.length === 0) {
    listsContainer.textContent = 'None';
    return;
  }

  const activeUrl = getActiveListUrl();

  lists.forEach((list, index) => {
    if (index > 0) {
      listsContainer.appendChild(document.createTextNode(' | '));
    }

    const link = document.createElement('a');
    link.href = '#';
    link.textContent = list.name;

    // Highlight active list
    if (list.url === activeUrl) {
      link.style.fontWeight = 'bold';
    }

    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchToList(list.url);
    });

    listsContainer.appendChild(link);
  });
}

// Add a new todo
async function addTodo(text) {
  if (!currentHandle) return;

  await currentHandle.change(doc => {
    if (!doc.todos) {
      doc.todos = [];
    }
    doc.todos.push({
      id: Date.now().toString(),
      text: text,
      completed: false
    });
  });
}

// Toggle todo completion state
async function toggleTodo(id) {
  if (!currentHandle) return;

  await currentHandle.change(doc => {
    const todo = doc.todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed;
    }
  });
}

// Delete a todo
async function deleteTodo(id) {
  if (!currentHandle) return;

  await currentHandle.change(doc => {
    const index = doc.todos.findIndex(t => t.id === id);
    if (index !== -1) {
      doc.todos.splice(index, 1);
    }
  });
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Render the current todo list
function render() {
  if (!currentHandle) return;

  const doc = currentHandle.doc();
  if (!doc) return;

  // Clear current list
  todoList.innerHTML = '';

  const todos = doc.todos || [];

  if (todos.length === 0) {
    todoList.innerHTML = '<li>No todos yet</li>';
  } else {
    // Render each todo
    todos.forEach(todo => {
      const todoItem = document.createElement('li');

      todoItem.innerHTML = `
        <input type="checkbox" ${todo.completed ? 'checked' : ''}>
        <span style="${todo.completed ? 'text-decoration: line-through;' : ''}">${escapeHtml(todo.text)}</span>
        <button type="button">Delete</button>
      `;

      // Add event listeners
      todoItem.querySelector('input').addEventListener('change', () => {
        toggleTodo(todo.id);
      });

      todoItem.querySelector('button').addEventListener('click', () => {
        deleteTodo(todo.id);
      });

      todoList.appendChild(todoItem);
    });
  }

  // Update document state display
  const state = {
    documentUrl: currentHandle.url,
    listName: doc.name || 'Unnamed',
    todos: todos,
    totalTodos: todos.length,
    completed: todos.filter(t => t.completed).length
  };
  docState.textContent = JSON.stringify(state, null, 2);
}

// Set up event listeners
function setupEventListeners() {
  createListForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = listNameInput.value.trim();
    if (name) {
      await createNewList(name);
      listNameInput.value = '';
    }
  });

  openUrlForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (url) {
      await openListByUrl(url);
      urlInput.value = '';
    }
  });

  todoForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const todoText = todoInput.value.trim();
    if (todoText) {
      addTodo(todoText);
      todoInput.value = '';
    }
  });

  shareCurrentBtn.addEventListener('click', shareCurrentList);
  deleteCurrentBtn.addEventListener('click', deleteCurrentList);
}

// Initialize application
async function init() {
  // Load lists from localStorage
  lists = loadLists();

  // Render lists UI
  renderListsUI();

  // Check if there's an active list to restore
  const activeUrl = getActiveListUrl();
  if (activeUrl && lists.find(l => l.url === activeUrl)) {
    await switchToList(activeUrl);
  }

  // Set up event listeners
  setupEventListeners();
}

// Initialize the app
init().catch(console.error);

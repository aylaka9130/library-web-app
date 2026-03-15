
// Global variables
let books = [];
let filterCat = 'all';
let nextId = 1;

// ── Sidebar ──
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('show');
  updateStats();
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

function updateStats(stats) {
  if (stats) {
    document.getElementById('sTotal').textContent = stats.total || 0;
    document.getElementById('sCats').textContent  = stats.categories || 0;
    document.getElementById('sRacks').textContent = stats.racks || 0;
  } else {
    document.getElementById('sTotal').textContent = books.length;
    document.getElementById('sCats').textContent  = new Set(books.map(b => b.category.toLowerCase())).size;
    document.getElementById('sRacks').textContent = new Set(books.map(b => b.rackNo)).size;
  }
}

// ── Load Books from API ──
async function loadBooks() {
  try {
    const response = await fetch('/api/books');
    const data = await response.json();
    books = data.books || [];
    updateStats(data.stats);
    renderTable();
  } catch (error) {
    showToast('❌ Failed to load books');
  }
}
function badge(cat) {
  const c = cat.toLowerCase();
  let cls = 'bt';
  if (c.includes('fiction')) cls = 'bf';
  else if (c.includes('science')) cls = 'bs';
  else if (c.includes('history')) cls = 'bh';
  return `<span class="badge ${cls}">${cat}</span>`;
}

// ── Render Table ──
function renderTable() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const filtered = books.filter(b => {
    const mc = filterCat === 'all' || b.category.toLowerCase().includes(filterCat);
    const ms = !q || [b.bookName, b.author, b.signNo, b.publisher].some(v => v.toLowerCase().includes(q));
    return mc && ms;
  });

  const tbody = document.getElementById('bookTableBody');
  const empty = document.getElementById('emptyState');
  const pag   = document.getElementById('pag');

  if (!filtered.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    pag.style.display   = 'none';
  } else {
    empty.style.display = 'none';
    pag.style.display   = 'flex';
    document.getElementById('pageInfo').textContent = `Showing ${filtered.length} book${filtered.length !== 1 ? 's' : ''}`;
    tbody.innerHTML = filtered.map((b, i) => `
      <tr>
        <td><input type="checkbox" class="checkbox-custom" data-id="${b.id}"/></td>
        <td>${i + 1}</td>
        <td><strong>${b.signNo}</strong></td>
        <td>${b.bookName}</td>
        <td>${b.author}</td>
        <td>${b.publisher}</td>
        <td>${badge(b.category)}</td>
        <td>${b.rackNo}</td>
      </tr>`).join('');
  }
}

// ── Filter Tags ──
function setFilter(cat, el) {
  filterCat = cat;
  document.querySelectorAll('.tag').forEach(t => t.className = 'tag inactive');
  el.className = 'tag active';
  renderTable();
}

// ── Select All ──
function toggleAll(cb) {
  document.querySelectorAll('#bookTableBody .checkbox-custom').forEach(c => c.checked = cb.checked);
}

// ── Add Book ──
async function addBook() {
  const ids  = ['signNo', 'bookName', 'author', 'publisher', 'category', 'rackNo'];
  const vals = ids.map(f => document.getElementById(f).value.trim());
  if (vals.some(v => !v)) { showToast('⚠️ Please fill in all fields.'); return; }

  const data = {
    signNo: vals[0],
    bookName: vals[1],
    author: vals[2],
    publisher: vals[3],
    category: vals[4],
    rackNo: vals[5]
  };

  try {
    const response = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      await response.json();
      clearForm();
      await loadBooks();
      showToast('✅ Book added successfully!');
    } else {
      const text = await response.text();
      let msg = text;
      try { msg = JSON.parse(text).error || JSON.parse(text).message || text; } catch (_) {}
      showToast('❌ ' + (msg || 'Failed to add book'));
    }
  } catch (error) {
    showToast('❌ Network error: ' + (error.message || error));
  }
}

function clearForm() {
  ['signNo', 'bookName', 'author', 'publisher', 'category', 'rackNo'].forEach(f => document.getElementById(f).value = '');
}

// ── Delete All Books ──
async function deleteAllBooks() {
  if (!books.length) { showToast('📭 No books to delete.'); return; }
  if (!confirm(`Delete all ${books.length} book(s)? This cannot be undone.`)) return;

  try {
    const response = await fetch('/api/books', { method: 'DELETE' });

    if (response.ok) {
      await response.json();
      await loadBooks();
      showToast('🗑️ All books deleted.');
    } else {
      const text = await response.text();
      let msg = text;
      try { msg = JSON.parse(text).error || JSON.parse(text).message || text; } catch (_) {}
      showToast('❌ ' + (msg || 'Failed to delete books'));
    }
  } catch (error) {
    showToast('❌ Network error: ' + (error.message || error));
  }
}

// ── Modify Modal ──
function openModify() {
  if (!books.length) { showToast('📭 No books to modify.'); return; }
  const sel = document.getElementById('modSel');
  sel.innerHTML = books.map(b => `<option value="${b.id}">${b.signNo} — ${b.bookName}</option>`).join('');
  loadMod();
  document.getElementById('modifyModal').classList.add('show');
}

function closeModify() {
  document.getElementById('modifyModal').classList.remove('show');
}

function loadMod() {
  const b = books.find(x => x.id === parseInt(document.getElementById('modSel').value));
  if (!b) return;
  document.getElementById('mSN').value = b.signNo;
  document.getElementById('mBN').value = b.bookName;
  document.getElementById('mAU').value = b.author;
  document.getElementById('mPB').value = b.publisher;
  document.getElementById('mCT').value = b.category;
  document.getElementById('mRN').value = b.rackNo;
}

async function saveMod() {
  const bookId = parseInt(document.getElementById('modSel').value);
  const data = {
    signNo: document.getElementById('mSN').value.trim(),
    bookName: document.getElementById('mBN').value.trim(),
    author: document.getElementById('mAU').value.trim(),
    publisher: document.getElementById('mPB').value.trim(),
    category: document.getElementById('mCT').value.trim(),
    rackNo: document.getElementById('mRN').value.trim()
  };

  try {
    const response = await fetch(`/api/books/${bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      await response.json();
      closeModify();
      await loadBooks();
      showToast('✅ Book updated successfully!');
    } else {
      const text = await response.text();
      let msg = text;
      try { msg = JSON.parse(text).error || JSON.parse(text).message || text; } catch (_) {}
      showToast('❌ ' + (msg || 'Failed to update book'));
    }
  } catch (error) {
    showToast('❌ Network error: ' + (error.message || error));
  }
}

// ── Download CSV ──
function downloadCSV() {
  if (!books.length) { showToast('📭 No books to download.'); return; }
  const header = ['S.No', 'Sign Number', 'Book Name', 'Author', 'Publisher', 'Category', 'Rack No'];
  const rows   = books.map((b, i) =>
    [i + 1, b.signNo, b.bookName, b.author, b.publisher, b.category, b.rackNo]
      .map(v => `"${v}"`).join(',')
  );
  const csv  = [header.join(','), ...rows].join('\n');
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'book_list.csv';
  a.click();
  showToast('⬇️ Book list downloaded!');
}

// ── Print ──
function printList() {
  closeSidebar();
  setTimeout(() => window.print(), 350);
}

// ── Toast ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Init ──
loadBooks();
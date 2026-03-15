from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import sqlite3
import os

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'library.db')

# ── Database Setup ──────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Create table if it doesn't exist (latest schema)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS books (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            sign_no   TEXT NOT NULL UNIQUE,
            book_name TEXT NOT NULL,
            author    TEXT NOT NULL,
            publisher TEXT NOT NULL,
            category  TEXT NOT NULL,
            rack_no   TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # If an older schema exists, migrate it (example: sign_number -> sign_no)
    cursor.execute("PRAGMA table_info(books);")
    columns = [row[1] for row in cursor.fetchall()]
    if 'sign_number' in columns and 'sign_no' not in columns:
        cursor.execute('ALTER TABLE books RENAME COLUMN sign_number TO sign_no')

    conn.commit()
    conn.close()

# ── Helper ──────────────────────────────────────────────────
def book_to_dict(row):
    return {
        'id':        row['id'],
        'signNo':    row['sign_no'],
        'bookName':  row['book_name'],
        'author':    row['author'],
        'publisher': row['publisher'],
        'category':  row['category'],
        'rackNo':    row['rack_no'],
        'createdAt': row['created_at']
    }

# ── Routes ──────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# GET all books  /  search with ?q=  /  filter with ?category=
@app.route('/api/books', methods=['GET'])
def get_books():
    q        = request.args.get('q', '').strip().lower()
    category = request.args.get('category', '').strip().lower()

    conn   = get_db()
    cursor = conn.cursor()

    query  = 'SELECT * FROM books WHERE 1=1'
    params = []

    if q:
        query += ''' AND (
            LOWER(book_name) LIKE ? OR
            LOWER(author)    LIKE ? OR
            LOWER(sign_no)   LIKE ? OR
            LOWER(publisher) LIKE ?
        )'''
        like = f'%{q}%'
        params += [like, like, like, like]

    if category and category != 'all':
        query += ' AND LOWER(category) LIKE ?'
        params.append(f'%{category}%')

    query += ' ORDER BY id ASC'
    cursor.execute(query, params)
    books = [book_to_dict(r) for r in cursor.fetchall()]

    # Stats
    cursor.execute('SELECT COUNT(*) FROM books')
    total = cursor.fetchone()[0]
    cursor.execute('SELECT COUNT(DISTINCT LOWER(category)) FROM books')
    cats  = cursor.fetchone()[0]
    cursor.execute('SELECT COUNT(DISTINCT rack_no) FROM books')
    racks = cursor.fetchone()[0]

    conn.close()
    return jsonify({ 'books': books, 'stats': { 'total': total, 'categories': cats, 'racks': racks } })


# GET single book
@app.route('/api/books/<int:book_id>', methods=['GET'])
def get_book(book_id):
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM books WHERE id = ?', (book_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Book not found'}), 404
    return jsonify(book_to_dict(row))


# POST add new book
@app.route('/api/books', methods=['POST'])
def add_book():
    data = request.get_json()
    required = ['signNo', 'bookName', 'author', 'publisher', 'category', 'rackNo']
    for field in required:
        if not data.get(field, '').strip():
            return jsonify({'error': f'{field} is required'}), 400

    conn   = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            'INSERT INTO books (sign_no, book_name, author, publisher, category, rack_no) VALUES (?,?,?,?,?,?)',
            (data['signNo'].strip(), data['bookName'].strip(), data['author'].strip(),
             data['publisher'].strip(), data['category'].strip(), data['rackNo'].strip())
        )
        conn.commit()
        new_id = cursor.lastrowid
        cursor.execute('SELECT * FROM books WHERE id = ?', (new_id,))
        new_book = book_to_dict(cursor.fetchone())
        conn.close()
        return jsonify({'message': 'Book added successfully', 'book': new_book}), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': f"Sign Number '{data['signNo']}' already exists"}), 409


# PUT update book
@app.route('/api/books/<int:book_id>', methods=['PUT'])
def update_book(book_id):
    data   = request.get_json()
    conn   = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM books WHERE id = ?', (book_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Book not found'}), 404

    updated = {
        'signNo':    data.get('signNo',    row['sign_no']).strip(),
        'bookName':  data.get('bookName',  row['book_name']).strip(),
        'author':    data.get('author',    row['author']).strip(),
        'publisher': data.get('publisher', row['publisher']).strip(),
        'category':  data.get('category',  row['category']).strip(),
        'rackNo':    data.get('rackNo',    row['rack_no']).strip(),
    }
    try:
        cursor.execute('''
            UPDATE books SET sign_no=?, book_name=?, author=?, publisher=?, category=?, rack_no=?
            WHERE id=?
        ''', (updated['signNo'], updated['bookName'], updated['author'],
              updated['publisher'], updated['category'], updated['rackNo'], book_id))
        conn.commit()
        cursor.execute('SELECT * FROM books WHERE id = ?', (book_id,))
        conn.close()
        return jsonify({'message': 'Book updated successfully', 'book': updated})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': f"Sign Number '{updated['signNo']}' already exists"}), 409


# DELETE single book
@app.route('/api/books/<int:book_id>', methods=['DELETE'])
def delete_book(book_id):
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM books WHERE id = ?', (book_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Book not found'}), 404
    cursor.execute('DELETE FROM books WHERE id = ?', (book_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Book deleted successfully'})


# DELETE all books
@app.route('/api/books', methods=['DELETE'])
def delete_all_books():
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM books')
    conn.commit()
    conn.close()
    return jsonify({'message': 'All books deleted successfully'})

if __name__ == '__main__':
    init_db()
    app.run(debug=True)

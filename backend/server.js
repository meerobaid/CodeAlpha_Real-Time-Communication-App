const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'obaidashraf', // PUT YOUR PASSWORD HERE (Leave empty if using XAMPP)
    database: 'collab_db'
});

db.connect(err => {
    if (err) console.error('Database connection failed:', err);
    else console.log('Connected to MySQL');
});

// Routes
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (username, password) VALUES (?, ?)', 
    [username, hashedPassword], (err) => {
        if (err) return res.status(500).json({ error: 'User exists or error' });
        res.json({ message: 'User registered!' });
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: 'User not found' });
        const match = await bcrypt.compare(password, results[0].password);
        if (match) res.json({ message: 'Login successful' });
        else res.status(401).json({ error: 'Invalid password' });
    });
});

// --- REAL TIME SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId);

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });

        // Existing draw listener
        socket.on('draw', (data) => {
            socket.to(roomId).emit('draw', data);
        });

        // NEW: Clear Board listener
        socket.on('clear-board', () => {
            socket.to(roomId).emit('clear-board');
        });
    });

    // --- CRITICAL FIX FOR CHAT ---
    socket.on('message', (messageData) => {
        console.log("Server received message:", messageData);
        // Send to EVERYONE connected (Bypassing room logic)
        io.emit('createMessage', messageData); 
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
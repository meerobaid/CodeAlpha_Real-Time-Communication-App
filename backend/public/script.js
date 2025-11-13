const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myVideo = document.createElement('video');
myVideo.muted = true; // Mute ourselves so we don't hear our own echo

// Global variables
let myPeer;
let myVideoStream;
const peers = {}; // Keep track of active calls

// --- 1. AUTHENTICATION LOGIC ---
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) return alert("Please enter username and password");

    try {
        const res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('user', username);
            window.location.href = '/room.html';
        } else {
            document.getElementById('message').innerText = data.error;
        }
    } catch (e) {
        console.error(e);
    }
}

async function register() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) return alert("Please enter username and password");
    
    try {
        await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        document.getElementById('message').innerText = "Registered! Please login.";
    } catch (e) {
        console.error(e);
    }
}

// --- 2. ROOM LOGIC (Multi-User Updated) ---
if (window.location.pathname.includes('room.html')) {
    
    console.log("Video System: Initializing...");

    // Connect to PeerJS Server
    myPeer = new Peer(undefined, {
        host: '/',
        port: 3001
    });

    // Access User Media (Camera/Mic)
    navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    }).then(stream => {
        myVideoStream = stream;
        addVideoStream(myVideo, stream);

        // 1. Answer incoming calls (When someone calls ME)
        myPeer.on('call', call => {
            console.log("Receiving call...");
            call.answer(stream); // Answer with my stream
            
            const video = document.createElement('video');
            call.on('stream', userVideoStream => {
                addVideoStream(video, userVideoStream);
            });
            call.on('close', () => {
                video.remove();
            });
            // Save the call so we can access it later
            peers[call.peer] = call; 
        });

        // 2. When a new user connects, call THEM
        socket.on('user-connected', userId => {
            console.log("User connected: " + userId);
            // Wait 1 sec to ensure their PeerJS is ready
            setTimeout(() => connectToNewUser(userId, stream), 1000);
        });
    }).catch(err => {
        console.error("Failed to get local stream", err);
    });

    // PeerJS Connection Open
    myPeer.on('open', id => {
        socket.emit('join-room', 'MainRoom', id);
    });

    // Handle user disconnect
    socket.on('user-disconnected', userId => {
        if (peers[userId]) peers[userId].close();
    });

    // --- Helper Functions (Updated for Multi-User) ---
    function connectToNewUser(userId, stream) {
        const call = myPeer.call(userId, stream);
        const video = document.createElement('video');
        call.on('stream', userVideoStream => {
            addVideoStream(video, userVideoStream);
        });
        call.on('close', () => {
            video.remove();
        });
        peers[userId] = call;
    }

    function addVideoStream(video, stream) {
        // PREVENT DUPLICATES: If this video ID already exists, stop.
        if (document.getElementById(stream.id)) return;

        video.srcObject = stream;
        video.id = stream.id; // Assign stream ID to video tag
        video.addEventListener('loadedmetadata', () => {
            video.play();
        });
        videoGrid.append(video);
    }

    // --- 3. WHITEBOARD LOGIC (Kept Inside Room Logic) ---
    const canvas = document.getElementById('whiteboard');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        
        // Set resolution
        canvas.width = 800;
        canvas.height = 600;

        // Variables for Tools
        let drawing = false;
        let currentColor = '#000000';
        let currentWidth = 3;
        let isEraser = false;

        // --- TOOL LISTENERS ---
        const colorPicker = document.getElementById('wb-color');
        const sizeSlider = document.getElementById('wb-size');

        // Change Color
        if(colorPicker) {
            colorPicker.addEventListener('change', (e) => {
                currentColor = e.target.value;
                isEraser = false; 
            });
        }

        // Change Size
        if(sizeSlider) {
            sizeSlider.addEventListener('change', (e) => {
                currentWidth = e.target.value;
            });
        }

        // Activate Eraser
        window.activateEraser = function() { isEraser = true; };

        // Activate Pen
        window.activatePen = function() {
            isEraser = false;
            if(colorPicker) currentColor = colorPicker.value;
        };

        // Clear Board
        window.clearBoard = function() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            socket.emit('clear-board'); 
        };
        
        socket.on('clear-board', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });

        // --- DRAWING EVENTS ---
        canvas.addEventListener('mousedown', () => drawing = true);
        canvas.addEventListener('mouseup', () => {
            drawing = false;
            ctx.beginPath(); 
        });
        
        canvas.addEventListener('mousemove', draw);

        function draw(e) {
            if (!drawing) return;
            
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);

            const styleColor = isEraser ? '#FFFFFF' : currentColor;

            ctx.lineWidth = currentWidth;
            ctx.lineCap = 'round';
            ctx.strokeStyle = styleColor;
            
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);

            socket.emit('draw', { 
                x, y, 
                color: styleColor, 
                width: currentWidth 
            });
        }

        socket.on('draw', (data) => {
            ctx.lineWidth = data.width;
            ctx.lineCap = 'round';
            ctx.strokeStyle = data.color;
            ctx.lineTo(data.x, data.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(data.x, data.y);
        });
    }
}

// --- 4. BUTTON CONTROLS ---

function toggleAudio() {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getAudioTracks()[0].enabled = false;
        const btn = document.querySelector("button[onclick='toggleAudio()']");
        if(btn) btn.innerText = "Unmute";
    } else {
        myVideoStream.getAudioTracks()[0].enabled = true;
        const btn = document.querySelector("button[onclick='toggleAudio()']");
        if(btn) btn.innerText = "Mute Audio";
    }
}

function toggleVideo() {
    const enabled = myVideoStream.getVideoTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getVideoTracks()[0].enabled = false;
        const btn = document.querySelector("button[onclick='toggleVideo()']");
        if(btn) btn.innerText = "Start Video";
    } else {
        myVideoStream.getVideoTracks()[0].enabled = true;
        const btn = document.querySelector("button[onclick='toggleVideo()']");
        if(btn) btn.innerText = "Stop Video";
    }
}

function leaveRoom() {
    if (myVideoStream) {
        myVideoStream.getTracks().forEach(track => track.stop());
    }
    window.location.href = '/';
}

function copyLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        alert("Link copied!");
    });
}

// --- 5. SCREEN SHARING LOGIC ---
let isScreenSharing = false;
let screenStream;

async function toggleScreenShare() {
    if (isScreenSharing) {
        stopScreenShare();
    } else {
        await startScreenShare();
    }
}

async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: false
        });
        const screenTrack = screenStream.getVideoTracks()[0];

        for (let userId in peers) {
            const peerConnection = peers[userId].peerConnection;
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
        }

        if (myVideo) myVideo.srcObject = screenStream;

        screenTrack.onended = () => stopScreenShare();

        isScreenSharing = true;
        const btn = document.getElementById('share-screen-btn');
        if(btn) {
            btn.innerText = "Stop Sharing";
            btn.style.background = "#e74c3c";
        }
    } catch (err) {
        console.error("Failed to share screen:", err);
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }

    const videoTrack = myVideoStream.getVideoTracks()[0];
    for (let userId in peers) {
        const peerConnection = peers[userId].peerConnection;
        const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
    }

    if (myVideo) myVideo.srcObject = myVideoStream;
    
    isScreenSharing = false;
    const btn = document.getElementById('share-screen-btn');
    if(btn) {
        btn.innerText = "Share Screen";
        btn.style.background = ""; 
    }
}

// --- CHAT & FILE SHARING LOGIC ---
if (document.getElementById('chat-window')) {
    console.log("Chat System: Loaded"); 

    const chatInput = document.getElementById('chat-message');

    if (chatInput) {
        chatInput.addEventListener("keydown", function(event) {
            if (event.key === "Enter") {
                sendMessage();
            }
        });
    }

    window.sendMessage = function() {
        const chatInput = document.getElementById('chat-message');
        if (!chatInput) return;

        const message = chatInput.value;
        const user = localStorage.getItem('user') || 'Anonymous';
        
        if (message.trim().length > 0) {
            socket.emit('message', {
                user: user,
                text: message,
                type: 'text'
            });
            chatInput.value = ''; 
        }
    };

    socket.on('createMessage', (data) => {
        const chatWindow = document.getElementById('chat-window');
        if (!chatWindow) return;

        const div = document.createElement('div');
        const isMe = data.user === localStorage.getItem('user');
        
        div.classList.add('message');
        if (isMe) div.classList.add('my-message');

        let content = `<small><b>${data.user}</b></small><br>`;
        
        if (data.type === 'text') {
            content += `<span>${data.text}</span>`;
        } else if (data.type === 'image') {
            content += `<img src="${data.fileData}" style="max-width: 100%; border-radius: 5px;">`;
        }
        
        div.innerHTML = content;
        chatWindow.appendChild(div);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });

    window.sendFile = function() {
        const fileInput = document.getElementById('file-input');
        const file = fileInput.files[0];
        const user = localStorage.getItem('user') || 'Anonymous';

        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const fileData = e.target.result; 
                socket.emit('message', {
                    user: user,
                    fileData: fileData,
                    type: 'image'
                });
            };
            reader.readAsDataURL(file);
            fileInput.value = ''; 
        }
    };
}
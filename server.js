const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: ["https://volcanox-ai.itch.io", "https://html6-games.itch.zone"],
    methods: ["GET", "POST"]
  }
});

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('get-rooms', () => {
        let list = Object.keys(rooms).map(n => ({
            name: n,
            count: Object.keys(rooms[n].players).length,
            protected: !!rooms[n].password
        }));
        socket.emit('rooms-list', list);
    });

    socket.on('create-room', (data) => {
        if (rooms[data.name]) return socket.emit('error-msg', "Nom déjà pris");
        rooms[data.name] = { password: data.password || null, players: {}, ready: {} };
        join(socket, data.name);
    });

    socket.on('join-room', (data) => {
        let r = rooms[data.name];
        if (!r) return socket.emit('error-msg', "Salon inexistant");
        if (r.password && r.password !== data.password) return socket.emit('error-msg', "Mot de passe faux");
        if (Object.keys(r.players).length >= 2) return socket.emit('error-msg', "Salon plein");
        join(socket, data.name);
    });

    function join(socket, roomName) {
        let r = rooms[roomName];
        let id = !Object.values(r.players).includes(1) ? 1 : 2;
        r.players[socket.id] = id;
        socket.roomName = roomName;
        socket.join(roomName);
        socket.emit('player-assigned', id);
        io.to(roomName).emit('player-status', Object.values(r.players));
    }

    socket.on('player-ready', (id) => {
        let r = rooms[socket.roomName];
        if(r) {
            r.ready[id] = true;
            if(r.ready[1] && r.ready[2]) io.to(socket.roomName).emit('start-game');
        }
    });

    socket.on('player-update', (data) => socket.to(socket.roomName).emit('remote-update', data));
    socket.on('action-trigger', (data) => socket.to(socket.roomName).emit('remote-action', data));
    socket.on('spawn-drop', (data) => socket.to(socket.roomName).emit('remote-drop', data));

    // --- ARBITRAGE : On utilise 'player-killed' pour tout le monde ---
    socket.on('player-hit', (targetId) => {
        io.to(socket.roomName).emit('player-killed', targetId);
    });

    socket.on('disconnect', () => {
        if (socket.roomName && rooms[socket.roomName]) {
            delete rooms[socket.roomName].players[socket.id];
            if (Object.keys(rooms[socket.roomName].players).length === 0) delete rooms[socket.roomName];
            else io.to(socket.roomName).emit('opponent-disconnected');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur prêt sur port ${PORT}`));
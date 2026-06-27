const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname)));

const rooms = {
    sala1: {
        id: 'sala1',
        name: 'Sala 1 - Futebol 5v5',
        maxPlayers: 10,
        players: {},
        gameState: 'waiting',
        teams: { red: [], blue: [] },
        scores: { red: 0, blue: 0 },
        ball: { x: 0, y: 0, vx: 0, vy: 0 }
    },
    sala2: {
        id: 'sala2',
        name: 'Sala 2 - Batalha 3v3',
        maxPlayers: 6,
        players: {},
        gameState: 'waiting',
        teams: { red: [], blue: [] },
        scores: { red: 0, blue: 0 },
        ball: { x: 0, y: 0, vx: 0, vy: 0 }
    },
    sala3: {
        id: 'sala3',
        name: 'Sala 3 - Duelo 2v2',
        maxPlayers: 4,
        players: {},
        gameState: 'waiting',
        teams: { red: [], blue: [] },
        scores: { red: 0, blue: 0 },
        ball: { x: 0, y: 0, vx: 0, vy: 0 }
    }
};

function findAvailableRoom() {
    for (let roomId in rooms) {
        const room = rooms[roomId];
        const playerCount = Object.keys(room.players).length;
        if (playerCount < room.maxPlayers) {
            return roomId;
        }
    }
    return null;
}

function balanceTeams(roomId) {
    const room = rooms[roomId];
    const playerNames = Object.keys(room.players);
    room.teams.red = [];
    room.teams.blue = [];
    
    const shuffled = playerNames.sort(() => Math.random() - 0.5);
    const half = Math.floor(shuffled.length / 2);
    
    shuffled.forEach((name, index) => {
        if (index < half) {
            room.teams.red.push(name);
        } else {
            room.teams.blue.push(name);
        }
    });
}

function getRoomPlayers(roomId) {
    const room = rooms[roomId];
    return Object.keys(room.players).map(name => ({
        name: name,
        team: room.teams.red.includes(name) ? 'red' : 
               room.teams.blue.includes(name) ? 'blue' : null
    }));
}

io.on('connection', (socket) => {
    console.log('🟢 Novo jogador conectado:', socket.id);
    
    let currentRoom = null;
    let playerName = null;

    socket.on('joinRoom', (data) => {
        playerName = data.name;
        const roomId = data.roomId || findAvailableRoom();
        
        if (!roomId) {
            socket.emit('error', 'Todas as salas estão cheias!');
            return;
        }

        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', 'Sala não encontrada!');
            return;
        }

        const playerCount = Object.keys(room.players).length;
        if (playerCount >= room.maxPlayers) {
            socket.emit('error', 'Sala cheia!');
            return;
        }

        if (room.players[playerName]) {
            socket.emit('error', 'Você já está nesta sala!');
            return;
        }

        currentRoom = roomId;
        room.players[playerName] = {
            id: socket.id,
            name: playerName,
            x: 0,
            y: 0,
            direction: 0
        };

        balanceTeams(currentRoom);
        socket.join(currentRoom);

        socket.emit('roomJoined', {
            roomId: currentRoom,
            roomName: room.name,
            maxPlayers: room.maxPlayers,
            players: getRoomPlayers(currentRoom),
            teams: room.teams,
            scores: room.scores,
            gameState: room.gameState,
            playerName: playerName,
            team: room.teams.red.includes(playerName) ? 'red' : 
                   room.teams.blue.includes(playerName) ? 'blue' : null
        });

        io.to(currentRoom).emit('roomUpdate', {
            players: getRoomPlayers(currentRoom),
            teams: room.teams,
            scores: room.scores,
            gameState: room.gameState,
            playerCount: Object.keys(room.players).length,
            maxPlayers: room.maxPlayers
        });

        console.log(`👤 ${playerName} entrou na ${room.name}`);
        console.log(`👥 ${Object.keys(room.players).length}/${room.maxPlayers} jogadores`);
    });

    socket.on('playerMove', (data) => {
        if (!currentRoom || !playerName) return;
        
        const room = rooms[currentRoom];
        if (!room) return;
        
        if (room.players[playerName]) {
            room.players[playerName].x = data.x;
            room.players[playerName].y = data.y;
            room.players[playerName].direction = data.direction || 0;
        }
    });

    socket.on('playerKick', (data) => {
        if (!currentRoom || !playerName) return;
        
        const room = rooms[currentRoom];
        if (!room) return;
        
        if (room.gameState !== 'playing') return;

        const player = room.players[playerName];
        if (!player) return;

        const kickPower = 12;
        const direction = player.direction || 0;
        const dx = Math.cos(direction) * kickPower;
        const dy = Math.sin(direction) * kickPower;

        const ball = room.ball;
        const distToBall = Math.sqrt(
            Math.pow(ball.x - player.x, 2) + 
            Math.pow(ball.y - player.y, 2)
        );

        if (distToBall < 30) {
            ball.vx += dx * 0.3;
            ball.vy += dy * 0.3;
            
            const angle = Math.atan2(ball.y - player.y, ball.x - player.x);
            ball.vx += Math.cos(angle) * 3;
            ball.vy += Math.sin(angle) * 3;

            io.to(currentRoom).emit('ballUpdate', {
                x: ball.x,
                y: ball.y,
                vx: ball.vx,
                vy: ball.vy
            });

            io.to(currentRoom).emit('playerKicked', {
                name: playerName,
                direction: direction
            });
        }
    });

    socket.on('updateBall', (data) => {
        if (!currentRoom) return;
        const room = rooms[currentRoom];
        if (!room) return;
        
        room.ball.x = data.x;
        room.ball.y = data.y;
        room.ball.vx = data.vx || 0;
        room.ball.vy = data.vy || 0;
        
        socket.to(currentRoom).emit('ballUpdate', {
            x: room.ball.x,
            y: room.ball.y,
            vx: room.ball.vx,
            vy: room.ball.vy
        });
    });

    socket.on('goalScored', (data) => {
        if (!currentRoom) return;
        const room = rooms[currentRoom];
        if (!room) return;
        
        const team = data.team;
        if (team === 'red') {
            room.scores.red++;
        } else if (team === 'blue') {
            room.scores.blue++;
        }
        
        room.ball.x = 0;
        room.ball.y = 0;
        room.ball.vx = 0;
        room.ball.vy = 0;
        
        io.to(currentRoom).emit('goalUpdate', {
            scores: room.scores,
            scorer: data.scorer,
            team: team
        });
        
        io.to(currentRoom).emit('ballUpdate', {
            x: room.ball.x,
            y: room.ball.y,
            vx: 0,
            vy: 0
        });
    });

    socket.on('startGame', () => {
        if (!currentRoom) return;
        const room = rooms[currentRoom];
        
        if (Object.keys(room.players).length < 2) {
            socket.emit('error', 'Precisa de pelo menos 2 jogadores!');
            return;
        }
        
        room.gameState = 'playing';
        room.ball.x = 0;
        room.ball.y = 0;
        room.ball.vx = 0;
        room.ball.vy = 0;
        room.scores.red = 0;
        room.scores.blue = 0;
        
        balanceTeams(currentRoom);
        
        io.to(currentRoom).emit('gameStarted', {
            gameState: 'playing',
            teams: room.teams,
            scores: room.scores
        });
        
        io.to(currentRoom).emit('roomUpdate', {
            players: getRoomPlayers(currentRoom),
            teams: room.teams,
            scores: room.scores,
            gameState: 'playing',
            playerCount: Object.keys(room.players).length,
            maxPlayers: room.maxPlayers
        });
        
        console.log(`🎮 Jogo iniciado na ${room.name}`);
    });

    socket.on('resetGame', () => {
        if (!currentRoom) return;
        const room = rooms[currentRoom];
        
        room.gameState = 'waiting';
        room.scores.red = 0;
        room.scores.blue = 0;
        room.ball.x = 0;
        room.ball.y = 0;
        room.ball.vx = 0;
        room.ball.vy = 0;
        
        io.to(currentRoom).emit('gameReset', {
            gameState: 'waiting',
            scores: room.scores
        });
        
        io.to(currentRoom).emit('roomUpdate', {
            players: getRoomPlayers(currentRoom),
            teams: room.teams,
            scores: room.scores,
            gameState: 'waiting',
            playerCount: Object.keys(room.players).length,
            maxPlayers: room.maxPlayers
        });
    });

    socket.on('disconnect', () => {
        if (currentRoom && playerName) {
            const room = rooms[currentRoom];
            if (room) {
                delete room.players[playerName];
                room.teams.red = room.teams.red.filter(p => p !== playerName);
                room.teams.blue = room.teams.blue.filter(p => p !== playerName);
                
                const playerCount = Object.keys(room.players).length;
                
                if (playerCount < 2 && room.gameState === 'playing') {
                    room.gameState = 'waiting';
                    room.scores.red = 0;
                    room.scores.blue = 0;
                    room.ball.x = 0;
                    room.ball.y = 0;
                    room.ball.vx = 0;
                    room.ball.vy = 0;
                    
                    io.to(currentRoom).emit('gameReset', {
                        gameState: 'waiting',
                        scores: { red: 0, blue: 0 }
                    });
                }
                
                io.to(currentRoom).emit('playerLeft', {
                    name: playerName,
                    players: getRoomPlayers(currentRoom)
                });
                
                io.to(currentRoom).emit('roomUpdate', {
                    players: getRoomPlayers(currentRoom),
                    teams: room.teams,
                    scores: room.scores,
                    gameState: room.gameState,
                    playerCount: playerCount,
                    maxPlayers: room.maxPlayers
                });
                
                console.log(`🔴 ${playerName} saiu da sala`);
                console.log(`👥 ${playerCount}/${room.maxPlayers} jogadores restantes`);
            }
        }
    });

    socket.on('getRoomInfo', (data) => {
        const roomId = data.roomId;
        const room = rooms[roomId];
        if (!room) {
            socket.emit('roomInfo', null);
            return;
        }
        
        socket.emit('roomInfo', {
            id: room.id,
            name: room.name,
            maxPlayers: room.maxPlayers,
            playerCount: Object.keys(room.players).length,
            gameState: room.gameState,
            players: getRoomPlayers(roomId)
        });
    });

    socket.on('getAllRooms', () => {
        const allRooms = {};
        for (let roomId in rooms) {
            const room = rooms[roomId];
            allRooms[roomId] = {
                id: room.id,
                name: room.name,
                maxPlayers: room.maxPlayers,
                playerCount: Object.keys(room.players).length,
                gameState: room.gameState
            };
        }
        socket.emit('allRooms', allRooms);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('⚽ =====================================');
    console.log('   🏆 GOALVERSE - Servidor Iniciado');
    console.log('⚽ =====================================');
    console.log(`🚀 Rodando em: http://localhost:${PORT}`);
    console.log(`📡 Socket.io: ws://localhost:${PORT}`);
    console.log('⚽ =====================================');
    console.log('📋 Salas disponíveis:');
    for (let roomId in rooms) {
        const room = rooms[roomId];
        console.log(`   🏟️ ${room.name}`);
        console.log(`      👥 ${room.maxPlayers} jogadores`);
        console.log(`      📍 ID: ${room.id}`);
    }
    console.log('⚽ =====================================');
    console.log('✅ Servidor pronto para conexões!');
    console.log('⚽ =====================================');
});
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const api_1 = __importDefault(require("./routes/api"));
const Game_1 = __importDefault(require("./models/Game"));
const Prompt_1 = __importDefault(require("./models/Prompt"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/api', api_1.default);
// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/make-it-meme';
mongoose_1.default.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
// Socket.io logic
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socket.on('join_room', async (data) => {
        try {
            const { roomCode, userName, userId } = data;
            const game = await Game_1.default.findOne({ roomCode });
            if (!game) {
                return socket.emit('error', 'Room not found');
            }
            // Check if player already exists
            const existingPlayer = game.players.find(p => p.userId === userId);
            if (existingPlayer) {
                existingPlayer.socketId = socket.id;
                existingPlayer.name = userName;
            }
            else {
                game.players.push({
                    userId,
                    name: userName,
                    score: 0,
                    socketId: socket.id
                });
            }
            await game.save();
            socket.join(roomCode);
            io.to(roomCode).emit('game_update', game);
            console.log(`${userName} joined room ${roomCode}`);
        }
        catch (err) {
            console.error(err);
        }
    });
    socket.on('start_round', async (data) => {
        try {
            const game = await Game_1.default.findOne({ roomCode: data.roomCode });
            if (!game)
                return;
            // Fetch random prompt
            const count = await Prompt_1.default.countDocuments();
            let promptText = "כשאתה מבין שיום ראשון מחר";
            if (count > 0) {
                const random = Math.floor(Math.random() * count);
                const prompt = await Prompt_1.default.findOne().skip(random);
                if (prompt)
                    promptText = prompt.text;
            }
            game.status = 'playing';
            game.rounds.push({
                prompt: promptText,
                submissions: []
            });
            await game.save();
            io.to(data.roomCode).emit('game_update', game);
            io.to(data.roomCode).emit('start_round', { prompt: promptText });
        }
        catch (err) {
            console.error(err);
        }
    });
    socket.on('upload_complete', async (data) => {
        try {
            const game = await Game_1.default.findOne({ roomCode: data.roomCode });
            if (!game || game.status !== 'playing')
                return;
            const currentRound = game.rounds[game.rounds.length - 1];
            // Check if already submitted
            const existingSubmission = currentRound.submissions.find(s => s.userId === data.userId);
            if (!existingSubmission) {
                currentRound.submissions.push({
                    userId: data.userId,
                    imageUrl: data.imageUrl,
                    votes: []
                });
            }
            // If everyone uploaded, move to voting phase
            if (currentRound.submissions.length === game.players.length) {
                game.status = 'voting';
            }
            await game.save();
            io.to(data.roomCode).emit('game_update', game);
        }
        catch (err) {
            console.error(err);
        }
    });
    socket.on('cast_vote', async (data) => {
        try {
            const game = await Game_1.default.findOne({ roomCode: data.roomCode });
            if (!game || game.status !== 'voting')
                return;
            const currentRound = game.rounds[game.rounds.length - 1];
            // Check if already voted
            let alreadyVoted = false;
            currentRound.submissions.forEach(sub => {
                if (sub.votes.includes(data.userId)) {
                    alreadyVoted = true;
                }
            });
            if (!alreadyVoted) {
                const targetSubmission = currentRound.submissions.find(s => s.userId === data.targetUserId);
                if (targetSubmission && data.userId !== data.targetUserId) {
                    targetSubmission.votes.push(data.userId);
                    // Update score of the target user
                    const targetPlayer = game.players.find(p => p.userId === data.targetUserId);
                    if (targetPlayer) {
                        targetPlayer.score += 100; // e.g., 100 points per vote
                    }
                }
            }
            // Check if everyone voted
            let totalVotes = 0;
            currentRound.submissions.forEach(sub => totalVotes += sub.votes.length);
            if (totalVotes === game.players.length) {
                game.status = 'finished';
                // Find winner
                let maxVotes = -1;
                let winnerId = '';
                currentRound.submissions.forEach(sub => {
                    if (sub.votes.length > maxVotes) {
                        maxVotes = sub.votes.length;
                        winnerId = sub.userId;
                    }
                });
                currentRound.winnerId = winnerId;
            }
            await game.save();
            io.to(data.roomCode).emit('game_update', game);
        }
        catch (err) {
            console.error(err);
        }
    });
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

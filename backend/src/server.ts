import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api';
import Game from './models/Game';
import Prompt from './models/Prompt';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/make-it-meme';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Socket.io logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', async (data: { roomCode: string, userName: string, userId: string }) => {
    try {
      const { roomCode, userName, userId } = data;
      const game = await Game.findOne({ roomCode });
      
      if (!game) {
        return socket.emit('error', 'Room not found');
      }

      // Check if player already exists
      const existingPlayer = game.players.find(p => p.userId === userId);
      if (existingPlayer) {
        existingPlayer.socketId = socket.id;
        existingPlayer.name = userName;
      } else {
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
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('start_round', async (data: { roomCode: string }) => {
    try {
      const game = await Game.findOne({ roomCode: data.roomCode });
      if (!game) return;

      // Fetch random prompt
      const count = await Prompt.countDocuments();
      let promptText = "כשאתה מבין שיום ראשון מחר";
      if (count > 0) {
        const random = Math.floor(Math.random() * count);
        const prompt = await Prompt.findOne().skip(random);
        if (prompt) promptText = prompt.text;
      }

      game.status = 'playing';
      game.rounds.push({
        prompt: promptText,
        submissions: []
      });

      await game.save();
      io.to(data.roomCode).emit('game_update', game);
      io.to(data.roomCode).emit('start_round', { prompt: promptText });
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('upload_complete', async (data: { roomCode: string, userId: string, imageUrl: string }) => {
    try {
      const game = await Game.findOne({ roomCode: data.roomCode });
      if (!game || game.status !== 'playing') return;

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
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('cast_vote', async (data: { roomCode: string, userId: string, targetUserId: string }) => {
    try {
      const game = await Game.findOne({ roomCode: data.roomCode });
      if (!game || game.status !== 'voting') return;

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
    } catch (err) {
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

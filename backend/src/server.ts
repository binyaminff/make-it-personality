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
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://binyamin:nxyru123@cluster0.qtoc3l9.mongodb.net';
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

  socket.on('update_settings', async (data: { roomCode: string, numRounds: number, roundTimeSeconds: number }) => {
    try {
      const game = await Game.findOne({ roomCode: data.roomCode });
      if (!game || game.status !== 'waiting') return;

      game.settings = { numRounds: data.numRounds, roundTimeSeconds: data.roundTimeSeconds };
      await game.save();
      io.to(data.roomCode).emit('game_update', game);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('add_to_pool', async (data: { roomCode: string, userId: string, imageUrls: string[] }) => {
    try {
      const game = await Game.findOne({ roomCode: data.roomCode });
      if (!game || game.status !== 'waiting') return;

      data.imageUrls.forEach(url => {
        game.imagePool.push({ userId: data.userId, imageUrl: url });
      });
      await game.save();

      io.to(data.roomCode).emit('game_update', game);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('start_round', async (data: { roomCode: string }) => {
    try {
      const game = await Game.findOne({ roomCode: data.roomCode });
      if (!game) return;

      // Assign an image to each player
      const submissions: any = [];
      const pool = [...game.imagePool];

      game.players.forEach(player => {
        let imageUrl = "https://via.placeholder.com/800x800.png?text=Not+Enough+Images";
        if (pool.length > 0) {
          // Try to find an image NOT uploaded by this player
          let index = pool.findIndex(img => img.userId !== player.userId);
          if (index === -1) index = 0; // Fallback to own image

          imageUrl = pool[index].imageUrl;
          pool.splice(index, 1); // Remove from available pool
        }

        submissions.push({
          userId: player.userId,
          imageUrl: imageUrl,
          text: '',
          votes: []
        });
      });

      // Update remaining pool
      game.imagePool = pool;
      game.status = 'playing';

      const roundEndsAt = new Date(Date.now() + game.settings.roundTimeSeconds * 1000);
      game.rounds.push({
        submissions: submissions,
        roundEndsAt: roundEndsAt
      });

      await game.save();
      io.to(data.roomCode).emit('game_update', game);

      // Set timeout to automatically end the round (typing phase)
      setTimeout(async () => {
        try {
          const updatedGame = await Game.findById(game._id);
          if (updatedGame && updatedGame.status === 'playing') {
            updatedGame.status = 'voting';
            await updatedGame.save();
            io.to(data.roomCode).emit('game_update', updatedGame);
          }
        } catch (e) {
          console.error(e);
        }
      }, game.settings.roundTimeSeconds * 1000);

    } catch (err) {
      console.error(err);
    }
  });

  socket.on('submit_caption', async (data: { roomCode: string, userId: string, text: string }) => {
    try {
      const game = await Game.findOne({ roomCode: data.roomCode });
      if (!game || game.status !== 'playing') return;

      const currentRound = game.rounds[game.rounds.length - 1];

      // Update the submission
      const existingSubmission = currentRound.submissions.find(s => s.userId === data.userId);
      if (existingSubmission) {
        existingSubmission.text = data.text;
      }

      // If everyone uploaded text, move to voting phase early
      const allSubmitted = currentRound.submissions.every(s => s.text && s.text.trim() !== '');
      if (allSubmitted) {
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

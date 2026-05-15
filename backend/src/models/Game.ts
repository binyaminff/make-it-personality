import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayer {
  userId: string;
  name: string;
  score: number;
  socketId: string;
}

export interface ISubmission {
  userId: string;
  imageUrl: string;
  votes: string[]; // IDs of users who voted for this image
}

export interface IRound {
  prompt: string;
  submissions: ISubmission[];
  winnerId?: string;
}

export interface IGame extends Document {
  roomCode: string;
  hostId: string;
  players: IPlayer[];
  status: 'waiting' | 'playing' | 'voting' | 'finished';
  rounds: IRound[];
  createdAt: Date;
}

const GameSchema = new Schema<IGame>({
  roomCode: { type: String, unique: true, required: true },
  hostId: { type: String, required: true },
  players: [{
    userId: String,
    name: String,
    score: { type: Number, default: 0 },
    socketId: String
  }],
  status: { type: String, enum: ['waiting', 'playing', 'voting', 'finished'], default: 'waiting' },
  rounds: [{
    prompt: String,
    submissions: [{
      userId: String,
      imageUrl: String,
      votes: [String]
    }],
    winnerId: String
  }],
  createdAt: { type: Date, expires: '1h', default: Date.now }
});

export default mongoose.model<IGame>('Game', GameSchema);

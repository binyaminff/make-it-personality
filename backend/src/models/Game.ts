import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayer {
  userId: string;
  name: string;
  score: number;
  socketId: string;
}

export interface ISubmission {
  userId: string;
  text: string;
  votes: string[]; // IDs of users who voted for this text
}

export interface IRound {
  imageUrl: string;
  submissions: ISubmission[];
  winnerId?: string;
}

export interface IGame extends Document {
  roomCode: string;
  hostId: string;
  players: IPlayer[];
  status: 'waiting' | 'playing' | 'voting' | 'finished';
  imagePool: string[];
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
  imagePool: [{ type: String }],
  rounds: [{
    imageUrl: String,
    submissions: [{
      userId: String,
      text: String,
      votes: [String]
    }],
    winnerId: String
  }],
  createdAt: { type: Date, expires: '1h', default: Date.now }
});

export default mongoose.model<IGame>('Game', GameSchema);

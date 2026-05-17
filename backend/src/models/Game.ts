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
  text: string;
  votes: string[]; // IDs of users who voted for this text
}

export interface IRound {
  submissions: ISubmission[];
  roundEndsAt?: Date;
  winnerId?: string;
}

export interface IPoolImage {
  userId: string;
  imageUrl: string;
}

export interface IGame extends Document {
  roomCode: string;
  hostId: string;
  players: IPlayer[];
  status: 'waiting' | 'playing' | 'voting' | 'finished';
  settings: {
    roundTimeSeconds: number;
    numRounds: number;
  };
  imagePool: IPoolImage[];
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
  settings: {
    roundTimeSeconds: { type: Number, default: 60 },
    numRounds: { type: Number, default: 3 }
  },
  imagePool: [{
    userId: String,
    imageUrl: String
  }],
  rounds: [{
    submissions: [{
      userId: String,
      imageUrl: String,
      text: String,
      votes: [String]
    }],
    roundEndsAt: Date,
    winnerId: String
  }],
  createdAt: { type: Date, expires: '2h', default: Date.now }
});

export default mongoose.model<IGame>('Game', GameSchema);

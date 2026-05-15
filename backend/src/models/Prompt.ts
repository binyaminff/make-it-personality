import mongoose, { Schema, Document } from 'mongoose';

export interface IPrompt extends Document {
  text: string;
  category: string;
  language: string;
}

const PromptSchema = new Schema<IPrompt>({
  text: { type: String, required: true },
  category: { type: String, default: 'General' },
  language: { type: String, default: 'he' }
});

export default mongoose.model<IPrompt>('Prompt', PromptSchema);

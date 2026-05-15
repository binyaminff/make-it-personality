import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import Prompt from '../models/Prompt';
import Game from '../models/Game';

const router = express.Router();

// Configure Multer (memory storage for passing to Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Configure Cloudinary (if credentials exist)
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Create a new game room
router.post('/games/create', async (req, res) => {
  try {
    const { hostId, hostName } = req.body;
    
    // Generate a random 4-letter room code
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    const game = new Game({
      roomCode,
      hostId,
      players: [{
        userId: hostId,
        name: hostName,
        score: 0,
        socketId: '' // Will be updated on connect
      }],
      status: 'waiting',
      rounds: []
    });
    
    await game.save();
    res.status(201).json({ roomCode, game });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Get a random prompt
router.get('/prompts/random', async (req, res) => {
  try {
    const count = await Prompt.countDocuments();
    if (count === 0) {
      return res.json({ text: "כשאתה מבין שיום ראשון מחר" }); // Default fallback
    }
    const random = Math.floor(Math.random() * count);
    const prompt = await Prompt.findOne().skip(random);
    res.json(prompt);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prompt' });
  }
});

// Upload image to Cloudinary
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Mock upload if Cloudinary is not configured
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      console.log('Mocking Cloudinary upload...');
      return res.json({ imageUrl: 'https://via.placeholder.com/800x800.png?text=Mock+Image' });
    }

    // Upload to Cloudinary
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    let dataURI = 'data:' + req.file.mimetype + ';base64,' + b64;
    
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'make-it-meme',
      resource_type: 'image',
    });

    res.json({ imageUrl: result.secure_url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

export default router;

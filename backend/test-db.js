const mongoose = require('mongoose');
const uri = "mongodb+srv://binyamin:nxyru123@cluster0.qtoc3l9.mongodb.net/make-it-meme";

mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;
  const game = await db.collection('games').find({}).sort({createdAt: -1}).limit(1).toArray();
  console.log(JSON.stringify(game[0], null, 2));
  process.exit(0);
});

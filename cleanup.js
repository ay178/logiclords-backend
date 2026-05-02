require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  await mongoose.connection.collection('members').deleteMany({ 
    email: { $ne: 'vermaprakhar44@gmail.com' } 
  });
  await mongoose.connection.collection('projects').deleteMany({});
  await mongoose.connection.collection('tasks').deleteMany({});
  
  console.log('Sab seed data gaya! Sirf admin bacha!');
  process.exit();
});
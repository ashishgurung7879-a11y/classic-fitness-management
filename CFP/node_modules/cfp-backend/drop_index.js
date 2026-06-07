const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/classic_fitness_park')
  .then(() => {
    console.log('Connected to DB');
    return mongoose.connection.collection('payments').dropIndex('transactioId_1');
  })
  .then(() => {
    console.log('✅ Stale index transactioId_1 successfully dropped!');
    process.exit(0);
  })
  .catch(e => {
    if (e.codeName === 'IndexNotFound') {
      console.log('✅ Index already dropped or not found.');
    } else {
      console.error('❌ Error:', e.message);
    }
    process.exit(0);
  });

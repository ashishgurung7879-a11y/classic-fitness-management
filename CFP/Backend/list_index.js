const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/classic_fitness_park')
  .then(() => mongoose.connection.collection('payments').indexes())
  .then((indexes) => {
    console.log('Indexes in payments:', indexes);
    for (const idx of indexes) {
      if (idx.name.includes('transactio') || idx.name.includes('transactionId')) {
         console.log('Found index:', idx.name);
         return mongoose.connection.collection('payments').dropIndex(idx.name);
      }
    }
  })
  .then(() => {
    console.log('✅ Done process');
    process.exit(0);
  })
  .catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(0);
  });

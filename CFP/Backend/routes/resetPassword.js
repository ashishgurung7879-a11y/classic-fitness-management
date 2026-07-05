const bcrypt = require('bcryptjs');

(async () => {
  const hash = await bcrypt.hash('Ram@12345', 10);
  console.log(hash);
})();
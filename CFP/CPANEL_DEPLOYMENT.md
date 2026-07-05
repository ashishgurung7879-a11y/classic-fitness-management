# cPanel Deployment

1. Build locally from the project root:
   ```sh
   npm install
   npm run build
   ```

2. Upload the project so `Backend/server.js` can reach the sibling `frontend/dist` folder. A working layout is:
   ```text
   app-root/
     Backend/
       server.js
       package.json
     frontend/
       dist/
   ```

3. In cPanel Node.js App, set:
   ```text
   Application root: app-root/Backend
   Application startup file: server.js
   Node.js version: 18 or newer
   ```

4. Add environment variables from `Backend/.env.example`. The current code validates `JWT_SECRET`, `MYSQL_USER`, and `MYSQL_DATABASE` at startup.

5. Import `Backend/scripts/mysql-migration/schema.sql` into the selected cPanel MySQL database.

6. In cPanel MySQL Databases, confirm the MySQL user is assigned to the database with the required privileges. If `/api/health` returns `503`, the app is running but the database credentials or grants still need fixing.

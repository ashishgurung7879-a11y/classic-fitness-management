# Classic Fitness Park Backend

The active stack is `Node.js + Express + MongoDB` with a single-page frontend flow.

## Recommended database

Use `MongoDB Atlas` in production for database hosting.

- database name: `classic_fitness_park`
- connection variable: `MONGODB_URI`

## Local run

1. Copy `CFP/Backend/.env.example` to `CFP/Backend/.env`.
2. Set a strong `JWT_SECRET`.
3. If you are using local MongoDB, set:
   `MONGODB_URI=mongodb://localhost:27017/classic_fitness_park`
4. From `C:\kvt gym`, start the backend:
   `cd .\CFP\Backend`
   `npm install`
   `npm start`

## Node hosting

Deploy from the `CFP` folder, not just `CFP/Backend`.

- install command: `npm install`
- build command: `npm run build`
- start command: `npm start`
- optional local combined command: `npm run start:full`

The Express server serves the built Vite frontend from `CFP/frontend/dist` automatically when it exists.

## Notes

- API base path: `http://localhost:5000/api`
- Contact form submissions are saved to MongoDB.
- Online attendance is disabled; attendance should be handled at the gym counter.

# Node Hosting Setup

## Recommended database

Use **MongoDB Atlas** for this project.

Why it is the best fit here:

- the backend already uses `mongoose`
- the site stores flexible document-style data like users, memberships, bookings, payments, trainers, products, gallery items, notices, and contact leads
- moving to Atlas needs almost no code changes compared with switching to PostgreSQL or MySQL
- it is easy to connect from shared Node.js hosting or cloud platforms

## Project structure for hosting

Deploy from the `CFP` folder.

- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm start`
- Optional local all-in-one command: `npm run start:full`

The root `package.json` now:

- installs both `Backend` and `frontend` through npm workspaces
- builds the Vite frontend
- starts the Express backend without rebuilding on every boot

The backend will automatically serve:

- `frontend/dist` when a production build exists
- `frontend/` directly during local development

## Required environment variables

Use `Backend/.env.example` as the template.

Minimum production values:

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster-name.mongodb.net/classic_fitness_park?retryWrites=true&w=majority
JWT_SECRET=use_a_long_random_secret_with_32_plus_characters
FRONTEND_URL=https://your-domain.com
```

## Atlas database name

Recommended database name:

`classic_fitness_park`

Suggested collections:

- `users`
- `payments`
- `manualpayments`
- `bookings`
- `attendances`
- `products`
- `gallery`
- `notices`
- `notifications`
- `contactleads`

## Notes

- Contact form submissions are now stored in MongoDB instead of only being logged to the server console.
- If your host allows only one Node process, this setup is already ready for that because Express serves both the API and frontend.

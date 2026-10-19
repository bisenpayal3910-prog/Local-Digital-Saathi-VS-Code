# Local Digital Saathi — VS Code Edition

Responsive local-business website using HTML, CSS, vanilla JavaScript, Node.js, Express and MongoDB.

## Features
- Responsive public landing page
- Services loaded from MongoDB
- Enquiry form saves to MongoDB
- Admin login with server-side session
- Admin can search enquiries, change status, save notes and delete enquiries
- Admin can add, edit, hide/publish and delete services
- Basic rate limiting for login and enquiry submissions
- Input validation and server-side authorization

## Requirements
- Node.js LTS
- MongoDB Community Server running locally OR a MongoDB Atlas connection string
- VS Code

## Run locally
1. Open this folder in VS Code.
2. In the terminal, run `npm install`.
3. Copy `.env.example` to a new file named `.env`.
4. Change `SESSION_SECRET` and `ADMIN_PASSWORD` in `.env`.
5. Make sure MongoDB is running. The default URI is `mongodb://127.0.0.1:27017/local_digital_saathi`.
6. Run `npm run dev` (or `npm start`).
7. Open `http://localhost:3000`.
8. Open `http://localhost:3000/admin.html` for the admin dashboard.

Default local username comes from `ADMIN_USERNAME` (default: `admin`). Set a strong `ADMIN_PASSWORD` in `.env` before starting.

## MongoDB Atlas
Create a database user and database, allow network access only as appropriate, then replace `MONGODB_URI` in `.env` with your Atlas connection string. Never share or commit `.env`.

## Important production notes
- Express's default in-memory session store is for local development only. Configure a persistent session store before production deployment.
- Use HTTPS in production, a strong unique session secret, backups and restricted database access.
- Do not publish `.env` or commit credentials.
- Prices are illustrative starting prices, not guaranteed quotes.
- No income or sales are guaranteed by this project.

# 🚌 KSRTC Nippani Live Bus Tracking System

A complete, production-ready web app for real-time bus tracking at KSRTC Nippani Depot.

---

## 📁 Folder Structure

```
ksrtc-tracker/
├── server.js                    ← Main server entry point
├── package.json
├── .env.example                 ← Copy to .env and fill in values
├── .gitignore
├── backend/
│   ├── models/
│   │   ├── Bus.js
│   │   ├── Route.js
│   │   ├── Timetable.js
│   │   ├── LiveLocation.js
│   │   ├── Conductor.js
│   │   └── Admin.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── buses.js
│   │   ├── routeRoutes.js
│   │   ├── timetables.js
│   │   └── live.js
│   └── middleware/
│       └── auth.js              ← JWT authentication middleware
└── frontend/
    └── public/
        ├── index.html           ← Home / Passenger search
        ├── css/
        │   └── style.css
        └── pages/
            ├── track.html           ← Live map tracking
            ├── conductor-login.html
            ├── conductor-dashboard.html ← GPS sharing panel
            ├── admin-login.html
            ├── admin-dashboard.html    ← Full CRUD dashboard
            └── timetable.html
```

---

## ⚙️ Technology Stack

| Layer       | Technology             |
|-------------|------------------------|
| Frontend    | HTML, CSS, JavaScript  |
| Backend     | Node.js + Express.js   |
| Database    | MongoDB Atlas          |
| Maps        | Leaflet.js + OpenStreetMap |
| Real-time   | Socket.IO              |
| Auth        | JWT (jsonwebtoken)     |
| Hosting     | Render.com             |

---

## 🛠️ Local Installation

### Prerequisites
- Node.js v18+
- A MongoDB Atlas account (free tier works)

### Steps

```bash
# 1. Clone / unzip the project
cd ksrtc-tracker

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and fill in your MONGODB_URI and JWT_SECRET

# 4. Start the server
npm start
# OR for development with auto-reload:
npm run dev

# 5. Open browser
# http://localhost:3000
```

### .env Configuration

```env
PORT=3000
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/ksrtc_tracker
JWT_SECRET=any_long_random_string_here
NODE_ENV=development
```

---

## 🌱 First-Time Setup (After Installation)

1. Open http://localhost:3000/admin
2. Login with: **admin / ksrtc@2024**
   *(Or click "Seed Default Users" on the dashboard overview)*
3. Go to **Manage Buses** → Add your bus fleet (e.g., KA22F1234)
4. Go to **Manage Routes** → Add routes (e.g., Nippani → Belagavi)
5. Go to **Timetable** → Add departure times per route
6. Conductor can now login at /conductor with **conductor1 / pass@123**

---

## 🗺️ Page URLs

| URL                     | Purpose                          |
|-------------------------|----------------------------------|
| `/`                     | Home — Passenger search          |
| `/track?bus=KA22F1234`  | Live tracking for a bus          |
| `/track?route=<id>`     | Live tracking for a route        |
| `/timetable`            | Public timetable                 |
| `/conductor`            | Conductor login                  |
| `/conductor/dashboard`  | Conductor GPS dashboard          |
| `/admin`                | Admin login                      |
| `/admin/dashboard`      | Admin CRUD dashboard             |

---

## 📡 API Endpoints

### Auth
```
POST /api/auth/conductor/login   { username, password }
POST /api/auth/admin/login       { username, password }
POST /api/auth/seed              (creates default users)
```

### Buses
```
GET    /api/buses
POST   /api/buses           [admin] { busNumber }
DELETE /api/buses/:id       [admin]
```

### Routes
```
GET    /api/routes
POST   /api/routes          [admin] { source, destination }
DELETE /api/routes/:id      [admin]
```

### Timetables
```
GET    /api/timetables
GET    /api/timetables/route/:routeId
POST   /api/timetables      [admin] { routeId, departureTime }
PUT    /api/timetables/:id  [admin] { departureTime }
DELETE /api/timetables/:id  [admin]
```

### Live Location
```
GET /api/live/active            All active buses (updated in last 60s)
GET /api/live/bus/:busNumber    Specific bus location
GET /api/live/route/:routeId    Buses on a route
```

---

## 📡 Socket.IO Events

| Event           | Direction          | Payload                              |
|-----------------|--------------------|--------------------------------------|
| `startTrip`     | Conductor → Server | `{ busNumber, routeId }`             |
| `locationUpdate`| Conductor → Server | `{ busNumber, routeId, lat, lng }`   |
| `locationUpdate`| Server → Passengers| `{ busNumber, routeId, lat, lng }`   |
| `stopTrip`      | Conductor → Server | `{ busNumber }`                      |
| `busInactive`   | Server → All       | `{ busNumber, active: false }`       |
| `busActive`     | Server → All       | `{ busNumber, active: true }`        |
| `trackBus`      | Passenger → Server | `busNumber` (subscribe to room)      |

---

## 🚀 Deploying to Render

### Step 1 — MongoDB Atlas
1. Go to https://cloud.mongodb.com
2. Create free cluster → Create database user → Whitelist IP `0.0.0.0/0`
3. Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/ksrtc_tracker`

### Step 2 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit: KSRTC Tracker MVP"
git remote add origin https://github.com/YOUR_USERNAME/ksrtc-tracker.git
git push -u origin main
```

### Step 3 — Deploy on Render
1. Go to https://render.com → New → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name**: ksrtc-nippani-tracker
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add **Environment Variables**:
   ```
   MONGODB_URI = your_atlas_connection_string
   JWT_SECRET  = your_secret_key_here
   NODE_ENV    = production
   ```
5. Click **Create Web Service**
6. Wait ~3 minutes for first deploy
7. Your app is live at `https://ksrtc-nippani-tracker.onrender.com`

---

## 👥 Default Credentials

| Role       | Username     | Password     |
|------------|-------------|--------------|
| Admin      | admin       | ksrtc@2024   |
| Conductor  | conductor1  | pass@123     |
| Conductor  | conductor2  | pass@123     |

> ⚠️ Change these passwords before going live!

---

## 🔒 Security Notes
- Passwords are hashed with bcryptjs
- All admin/conductor API routes require JWT Bearer token
- Tokens expire after 12 hours
- Update `.env` with strong random JWT_SECRET in production

---

## 📱 Mobile Usage (Conductor)
The conductor dashboard is fully mobile-responsive. On first tap of "Start Trip":
- Browser will ask for GPS permission — tap **Allow**
- GPS location broadcasts every 10 seconds automatically
- Keep the browser tab open during the trip
- Tap "Stop Trip" at the end

---

Built with ❤️ for KSRTC Nippani Depot

# 🚌 KSRTC Nippani Live Bus Tracking System

A real-time bus tracking platform designed for KSRTC depots that allows passengers to track active buses live on a map while enabling conductors to share GPS location directly from their mobile devices.

The system provides route management, stop-based searching, timetable management, live trip monitoring, and real-time location updates using Socket.IO and MongoDB. Administrators can manage buses, routes, route variants, stops, conductors, and schedules through a centralized dashboard.

### Key Features

* 📍 Real-time bus tracking using conductor GPS
* 🗺️ Live map visualization with OpenStreetMap & Leaflet
* 🔄 Instant updates using Socket.IO
* 🚌 Bus, route, and timetable management
* 👨‍✈️ Conductor authentication and trip management
* 👨‍💼 Admin dashboard for system management
* 🚏 Route variants with intermediate stops
* 🔍 Stop-based passenger search (e.g., Nippani → Kurli)
* 📱 Mobile-friendly conductor dashboard
* ☁️ MongoDB-based data storage
* 🚀 Deployable on Render

### Tech Stack

* Frontend: HTML, CSS, JavaScript
* Backend: Node.js, Express.js
* Database: MongoDB Atlas
* Real-Time Communication: Socket.IO
* Maps: Leaflet.js + OpenStreetMap
* Authentication: JWT
* Hosting: Render

### Use Case

Passengers can search buses between any two stops along a route and view live bus locations, while depot administrators can manage buses, routes, stops, timetables, and conductors through a centralized web dashboard.

Built as a practical digital transport solution for KSRTC depot operations and passenger convenience.

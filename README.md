Kronos Penalty Tracking System

A full-stack race control and penalty management system built for Dubai Kartdrome to streamline ndurance event operations.
The system enables live tracking of infringements, penalties, and race sessions, complete with real-time WebSocket updates, multi-session database handling, and intuitive dashboards for race officials.

Tech Stack

Backend: Python, FastAPI, SQLAlchemy, PostgreSQL

Frontend: React, TypeScript, Tailwind CSS, Vite

Infrastructure: Docker, Nginx, WebSocket

Database Management: Dynamic per-session PostgreSQL databases with live switching

Key Features

Session-based race event tracking (start, load, close, delete sessions)

Automated infringement logic with warning and penalty accumulation

Real-time WebSocket event updates to all connected dashboards

Role-based workflows for race control and officials

Dockerized architecture for reproducible and scalable deployments

Impact

Reduced manual penalty reconciliation time by approximately 70%

Established a reusable framework for future FIA event automation at Dubai Kartdrome

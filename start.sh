#!/bin/bash
echo "Installing backend dependencies..."
cd backend && npm install --silent
echo "Starting backend on :3001..."
node server.js &
BACKEND_PID=$!

echo "Installing frontend dependencies..."
cd ../frontend && npm install --silent
echo "Starting frontend on :3000..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✦ idea Map running"
echo "  Frontend → http://localhost:3000"
echo "  Backend  → http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both."
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait

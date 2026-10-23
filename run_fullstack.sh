#!/usr/bin/env bash
# Build frontend and serve everything through FastAPI on port 8000
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "[1/2] Building React frontend..."
cd "$DIR/frontend"
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build

echo "[2/2] Launching unified backend & frontend server..."
cd "$DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

echo "Serving fullstack application on http://localhost:8000 ..."
uvicorn app.main:app --host 0.0.0.0 --port 8000

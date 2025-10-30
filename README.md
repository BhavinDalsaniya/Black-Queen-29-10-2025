#!/bin/bash
echo "Starting update process..."
cd ~/Black-Queen-29-10-2025
git pull origin main
docker stop card-game || true
docker rm card-game || true
docker build -t black-queen-game .
docker run -d -p 3000:3000 --name card-game black-queen-game
echo "Update completed successfully!"

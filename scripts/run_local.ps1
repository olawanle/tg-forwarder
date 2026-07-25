$ErrorActionPreference = "Stop"

Write-Host "Installing Python dependencies..."
python -m pip install -e ".[dev]"

Write-Host "Installing frontend dependencies..."
Push-Location frontend
npm install
Pop-Location

Write-Host "Starting PostgreSQL and Redis with Docker Compose..."
docker compose up -d postgres redis

Write-Host "Use .env.local.example values for local PowerShell runs."
Write-Host "If your .env currently uses host 'postgres', replace it with 'localhost' before running migrations locally."
Write-Host ""
Write-Host "Then run:"
Write-Host "  alembic -c database/alembic.ini upgrade head"
Write-Host "  uvicorn backend.app.main:app --reload"
Write-Host "  python -m bot.main"
Write-Host "  python -m scheduler.worker"
Write-Host "  cd frontend; npm run dev"

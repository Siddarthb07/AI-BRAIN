$root = "C:\Users\siddu\OneDrive\Desktop\AI brain"
Set-Location $root

docker compose up -d

Start-Process powershell -ArgumentList "-NoExit","-Command","cd backend; .venv\Scripts\Activate.ps1; python -m pip install --upgrade pip; python -m pip install wheel setuptools; pip install -r requirements.txt; python -m uvicorn app.main:app --host 0.0.0.0 --port 8010"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd frontend; npm install; npm run dev"

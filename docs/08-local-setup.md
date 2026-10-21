# 08 — Local Setup (macOS)

Everything you need to run Vistara Stays on your Mac, and what each command does.

## Prerequisites

| Tool | Version used | Check with |
|---|---|---|
| Python | 3.12 | `python3.12 --version` |
| Node.js | 22 | `node --version` |
| MongoDB server + mongosh (for tests only) | 6.0+ | `mongod --version` |
| Git | any recent | `git --version` |

Installed via Homebrew if missing: `brew install python@3.12 node@22 git` and
`brew tap mongodb/brew && brew install mongodb-community mongosh`.

## 1. MongoDB Atlas (development database)

1. In Atlas, open your free M0 cluster → **Database Access** → **Add New Database User**.
   Use password authentication, role **Read and write to any database**. Save the password somewhere safe.
2. **Network Access** → **Add IP Address** → **Add Current IP Address**. (Render needs `0.0.0.0/0` later — that's a Phase 12 decision.)
3. **Database** → **Connect** → **Drivers** → Python → copy the `mongodb+srv://...` string.
   If your password contains `@ : / ? # [ ] %`, URL-encode it (e.g. `@` → `%40`).

You don't need to create the database or collections: MongoDB creates `vistara_dev` the first
time we write to it, and the API creates the indexes on startup.

## 2. Backend

```bash
cd backend
python3.12 -m venv .venv            # isolated Python environment for this project
source .venv/bin/activate           # activate it (your prompt shows "(.venv)")
pip install -r requirements-dev.txt # runtime + test/lint tools
cp .env.example .env                # then edit .env:
#   MONGODB_URI = your Atlas string
#   JWT_SECRET  = output of: python -c "import secrets; print(secrets.token_urlsafe(64))"

python -m scripts.ensure_indexes    # connects to Atlas and creates all indexes (prints them)
uvicorn app.main:app --reload       # API on http://127.0.0.1:8000 (auto-restarts on code change)
```

Check it:
- http://127.0.0.1:8000/api/v1/health → `{"status":"ok",...}` (server is up)
- http://127.0.0.1:8000/api/v1/health/ready → `{"status":"ok","database":"ok"}` (Atlas reachable)
- http://127.0.0.1:8000/api/docs → interactive API documentation

## 3. Frontend

```bash
cd frontend
npm install        # installs exact versions from package-lock.json
npm run dev        # http://localhost:5173 — shows "API online · database ok" when the backend is running
```

`/api/*` requests from the browser go to Vite, which forwards them to the backend on port 8000,
so there are no CORS issues in development.

## 4. Tests

```bash
# Backend — needs the local test replica set (separate from Atlas and from any other MongoDB)
cd backend
./scripts/test_mongo.sh start      # once per login session; port 27018
pytest                             # run all tests
pytest -k health -v                # run matching tests, verbose
ruff check . && ruff format .      # lint + auto-format
./scripts/test_mongo.sh stop       # when you're done

# Frontend
cd frontend
npm test                           # run once
npm run test:watch                 # re-run on save
npm run build                      # production build check
```

Tests marked `db` are **skipped** (with a message) if the test MongoDB isn't running, so always
start it before claiming "all tests pass".

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `/health/ready` → 503 | Atlas unreachable: check the URI and password in `.env`, and that your current IP is in Atlas Network Access (home IPs change). |
| `ServerSelectionTimeoutError` in `ensure_indexes` | Same as above. |
| `ValidationError: mongodb_uri Field required` | `.env` missing, or you ran the command from outside `backend/`. |
| Frontend shows "API unavailable" | Backend not running on port 8000. |
| Vite log shows `ECONNREFUSED 127.0.0.1:8000` | Same: start uvicorn. |
| `Address already in use` | Another process is on the port: `lsof -iTCP:8000 -sTCP:LISTEN`. |
| Test replica set won't start | Check `backend/.mongo-test/mongod.log`. |

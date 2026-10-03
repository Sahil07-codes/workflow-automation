# Phase 4 Installation Guide

## Prerequisites

- Node.js 18+ and npm 8+
- PostgreSQL 14+ (with pgvector extension)
- Redis 6+
- A Greenhouse/Lever/Ashby account for testing adapters

## Option 1: Quick Start with Docker Compose (Recommended)

### 1. Clone and Setup

```bash
cd autoapply_phase4
cp .env.example .env
```

### 2. Update .env with Your Adapter Tokens

```bash
# Edit .env
GREENHOUSE_BOARD_TOKENS=your-token-1,your-token-2
LEVER_COMPANY_IDS=your-company-1
ASHBY_COMPANY_IDS=your-company-1
CLAUDE_API_KEY=sk-ant-...
```

### 3. Start Docker Services

```bash
# This starts PostgreSQL, Redis, and BullMQ UI
docker-compose up -d

# Verify services are healthy
docker-compose ps
```

### 4. Install Dependencies & Setup Database

```bash
npm install
make db-setup  # Or: npx prisma migrate deploy && psql -c "CREATE EXTENSION vector;"
```

### 5. Start Services (3 terminals)

**Terminal 1 — API Server:**
```bash
npm run dev --workspace=apps/api
# Server listens on http://localhost:3000
```

**Terminal 2 — Discovery Worker:**
```bash
npm run start:discovery-worker
# Processes discovery queue jobs
```

**Terminal 3 — Scheduler (optional):**
```bash
npm run start:discovery-scheduler
# Triggers sweeps every 4 hours (or on demand)
```

### 6. Test the System

```bash
# Trigger a discovery sweep
curl -X POST http://localhost:3000/admin/discovery/sweep \
  -H "Authorization: Bearer TEST_TOKEN"

# List jobs (wait 30s for discovery to complete)
curl http://localhost:3000/jobs \
  -H "Authorization: Bearer TEST_TOKEN"

# View BullMQ queue status
# Visit http://localhost:3001 in browser
```

---

## Option 2: Manual Setup (Linux/Mac)

### 1. Install System Dependencies

**macOS (Homebrew):**
```bash
brew install postgres redis node
brew services start postgres
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib redis-server nodejs npm
sudo systemctl start postgresql
sudo systemctl start redis-server
```

### 2. Setup PostgreSQL

```bash
# Create database
createdb autoapply

# Enable pgvector extension
psql -d autoapply -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Verify
psql -d autoapply -c "\dx"  # Should show 'vector' extension
```

### 3. Setup Project

```bash
cd autoapply_phase4
cp .env.example .env

# Update .env with your configuration
nano .env  # or: code .env

npm install
npx prisma migrate deploy
```

### 4. Start Services

```bash
# Terminal 1: API
npm run dev --workspace=apps/api

# Terminal 2: Worker
npm run start:discovery-worker

# Terminal 3: Scheduler
npm run start:discovery-scheduler
```

---

## Option 3: Manual Setup (Windows)

### 1. Install Prerequisites

- [PostgreSQL 16 for Windows](https://www.postgresql.org/download/windows/)
- [Redis for Windows](https://github.com/microsoftarchive/redis/releases) or [WSL2 with Redis](https://learn.microsoft.com/en-us/windows/wsl/tutorials/wsl-database#install-redis)
- [Node.js LTS](https://nodejs.org/)

### 2. Start Services

```bash
# PostgreSQL (via Services or pgAdmin)
# Redis (via cmd if installed)
redis-server

# In WSL2:
wsl
redis-server
```

### 3. Setup Project

```bash
cd autoapply_phase4
Copy .env.example to .env
Edit .env in Notepad or VS Code

npm install
npx prisma migrate deploy
```

### 4. Start Node Services

```bash
# Terminal 1
npm run dev --workspace=apps/api

# Terminal 2
npm run start:discovery-worker

# Terminal 3
npm run start:discovery-scheduler
```

---

## Configuration

### Essential Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/autoapply

# Redis
REDIS_URL=redis://localhost:6379

# API Keys
CLAUDE_API_KEY=sk-ant-...

# Adapters (choose at least one)
GREENHOUSE_BOARD_TOKENS=token1,token2
LEVER_COMPANY_IDS=company1,company2
ASHBY_COMPANY_IDS=company1,company2

# Rates (requests per second)
GREENHOUSE_RPS=10
LEVER_RPS=10
ASHBY_RPS=10

# Discovery
DISCOVERY_SWEEP_INTERVAL_HOURS=4
MIN_MATCH_SCORE_THRESHOLD=50
EMBEDDING_SIMILARITY_THRESHOLD=0.65
LLM_SCORING_ENABLED=true
```

### Optional Environment Variables

```bash
# Proxies (for T1 sources)
GREENHOUSE_PROXY_URL=http://proxy:8080
LEVER_PROXY_URL=http://proxy:8080
ASHBY_PROXY_URL=http://proxy:8080

# Logging
LOG_LEVEL=debug  # debug, info, warn, error

# Environment
NODE_ENV=development  # development, staging, production
```

---

## Verify Installation

### 1. Check Database

```bash
psql -d autoapply -c "SELECT * FROM information_schema.tables WHERE table_schema = 'public';"
```

Expected output includes:
- `jobs`
- `job_matches`
- `job_preferences` (from Phase 2)
- `users` (from Phase 1)

### 2. Check Redis

```bash
redis-cli ping
# Output: PONG
```

### 3. Check API Health

```bash
curl http://localhost:3000/health
# Output: {"status":"ok"}
```

### 4. Check Worker Logs

```bash
# Terminal 2 should show:
# ✅ Worker ready
# 📊 Status:
#    Scheduler running: true
#    Next sweep: ...
```

### 5. Trigger Test Discovery

```bash
# Terminal 3 or new terminal:
curl -X POST http://localhost:3000/admin/discovery/sweep \
  -H "Authorization: Bearer test"
```

Check worker logs for:
```
✓ Discovery complete for GREENHOUSE: X discovered, Y upserted
```

---

## Common Issues & Solutions

### Issue: `psql: command not found`
**Solution**: PostgreSQL not in PATH
- macOS: `brew install postgres`
- Linux: `sudo apt-get install postgresql-client`
- Windows: Add PostgreSQL bin folder to PATH

### Issue: `extension "vector" does not exist`
**Solution**: pgvector not installed
```bash
# macOS
brew install pgvector

# Linux (Debian/Ubuntu)
sudo apt-get install postgresql-contrib postgresql-16-pgvector

# Then:
psql -d autoapply -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Issue: `ECONNREFUSED` (Redis connection failed)
**Solution**: Redis not running
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis-server

# Windows/WSL
redis-server
```

### Issue: Worker not processing jobs
**Solution**: Check Redis connection
```bash
redis-cli
> SELECT 0
> KEYS bull:discovery:*
# Should show queue keys
```

### Issue: Database migration fails
**Solution**: Clear and retry
```bash
# Backup first!
npx prisma migrate reset  # ⚠️ DELETES ALL DATA

# Or manually apply migration:
psql -d autoapply -f prisma/migrations/001_add_phase4_discovery_tables/migration.sql
```

### Issue: API returns 401 Unauthorized
**Solution**: Auth not configured
- Phase 4 expects existing AuthGuard from Phase 1
- If using test token, ensure middleware doesn't validate strictly
- Check `apps/api/src/common/guards/TEMPLATE_auth.guard.ts`

### Issue: LLM scoring fails silently
**Solution**: Check CLAUDE_API_KEY
```bash
echo $CLAUDE_API_KEY  # Should be set

# Test API connection:
curl https://api.anthropic.com/v1/messages \
  -H "Authorization: Bearer $CLAUDE_API_KEY" \
  -H "X-API-Key: $CLAUDE_API_KEY"
```

---

## Testing

### Run All Tests

```bash
npm run test
```

### Run Specific Test Suite

```bash
npm run test -- packages/adapters
npm run test -- apps/worker
```

### Run with Coverage

```bash
npm run test:cov
```

### Watch Mode (for development)

```bash
npm run test:watch
```

---

## Next Steps

1. **Configure adapters**: Get tokens from Greenhouse, Lever, Ashby
2. **Run first sweep**: `POST /admin/discovery/sweep`
3. **Monitor jobs**: `GET /jobs` (should return results)
4. **Inspect matches**: `GET /jobs/stats/matching`
5. **Check BullMQ UI**: http://localhost:3001

---

## Production Deployment

For production (AWS, GCP, etc.):

1. **Database**: RDS PostgreSQL Multi-AZ with automated backups
2. **Redis**: ElastiCache with Multi-AZ + AOF persistence
3. **API**: ECS Fargate with ALB + auto-scaling
4. **Workers**: ECS Fargate task definition
5. **Scheduler**: Lambda + EventBridge or separate ECS task

See `DECISIONS.md` and `ARCHITECTURE.md` for deployment details.

---

## Support

- **Issues**: Check DECISIONS.md for design decisions
- **Architecture**: See ARCHITECTURE.md for system design
- **Integration**: Read INTEGRATION_INSTRUCTIONS.md for adding to existing API
- **Troubleshooting**: Run `make help` for common commands

```bash
# Useful commands
make install         # Install dependencies
make test           # Run tests
make dev            # Start dev server
make worker         # Start worker
make clean          # Clean build artifacts
make migrate        # Run migrations
make db-setup       # Initialize database
```

---

**Ready to discover jobs!** 🚀

.PHONY: help install build test dev clean migrate db-setup deploy

help:
	@echo "AutoApply Phase 4 — Job Discovery"
	@echo ""
	@echo "Available commands:"
	@echo "  make install       - Install dependencies"
	@echo "  make build         - Build TypeScript"
	@echo "  make test          - Run tests"
	@echo "  make dev           - Start dev server"
	@echo "  make clean         - Remove build artifacts"
	@echo "  make migrate       - Run database migrations"
	@echo "  make db-setup      - Initialize database"
	@echo "  make worker        - Start discovery worker"
	@echo "  make scheduler     - Start discovery scheduler"

install:
	npm install

build:
	npm run build

test:
	npm run test

test-watch:
	npm run test:watch

test-cov:
	npm run test:cov

dev:
	npm run dev

clean:
	npm run clean
	rm -rf dist coverage .turbo

migrate:
	npx prisma migrate deploy

db-setup: migrate
	psql -U postgres -d autoapply -c "CREATE EXTENSION IF NOT EXISTS vector;"
	@echo "✅ Database setup complete"

worker:
	npm run start:discovery-worker

scheduler:
	npm run start:discovery-scheduler

# Development: run all three services
dev-full:
	@echo "Starting Phase 4 services..."
	@echo "Make sure PostgreSQL and Redis are running"
	@sleep 2
	@concurrently "npm run dev -- --workspace=apps/api" "npm run start:discovery-worker" "npm run start:discovery-scheduler"

# Docker compose (optional)
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

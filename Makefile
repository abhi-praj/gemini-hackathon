.PHONY: backend frontend dev install-backend install-frontend install

# Run backend (FastAPI with uvicorn)
backend:
	cd backend && uvicorn main:app --reload --port 8000

# Run frontend (Vite dev server)
frontend:
	cd frontend && npm run dev

# Run both concurrently
dev:
	@echo "Starting backend and frontend..."
	@trap 'kill 0' EXIT; \
		$(MAKE) backend & \
		$(MAKE) frontend & \
		wait

# Install dependencies
install-backend:
	cd backend && pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

install: install-backend install-frontend

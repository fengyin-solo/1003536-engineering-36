.PHONY: install frontend build preflight

install:
	cd frontend && npm install

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

preflight:
	cd frontend && npm run preflight

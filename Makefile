.PHONY: install frontend preflight build

install:
	cd frontend && npm install

frontend:
	cd frontend && npm run dev

preflight:
	cd frontend && npm run preflight

build:
	cd frontend && npm run build

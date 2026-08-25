.PHONY: setup test run

# Полная установка с нуля: венв + зависимости строго из requirements.txt.
# Именно так проверялась воспроизводимость перед этой поставкой --
# `rm -rf .venv && make setup && make test` должно давать 32 passed
# на чистой машине без какого-либо ручного pip install в обход этого файла.
setup:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -r requirements.txt

test:
	.venv/bin/python3 -m pytest tests/ -v

run:
	.venv/bin/uvicorn app.main:app --reload

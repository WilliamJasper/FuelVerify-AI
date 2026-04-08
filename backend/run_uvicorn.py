"""
Run FuelVerify FastAPI with uvicorn. Used by NSSM Windows service.
Loads backend/.env (python-dotenv) before binding PORT (default 5004).
"""
import os
import sys

_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

os.chdir(_backend_dir)

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(_backend_dir, ".env"))
except ImportError:
    pass

import uvicorn

port = int(os.environ.get("PORT", "5004"))
host = os.environ.get("HOST", "127.0.0.1")

if __name__ == "__main__":
    uvicorn.run("main:app", host=host, port=port, reload=False)

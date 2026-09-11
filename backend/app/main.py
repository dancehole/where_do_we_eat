from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import meetups, ai
from .api import debug
from .api import geo

app = FastAPI(title="Where Do We Go To Eat?")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_headers=["*"],
    allow_methods=["*"],
)

app.include_router(meetups.router)
app.include_router(ai.router)
app.include_router(debug.router)
app.include_router(geo.router)


@app.get("/")
def root():
    return {"name": "eat-where-api", "status": "ok"}

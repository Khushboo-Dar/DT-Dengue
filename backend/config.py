import os

class Config:
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
    MODEL_PATH = os.getenv("MODEL_PATH", "model.joblib")
    DATA_DIR = os.getenv("DATA_DIR", "data")
    DB_PATH = os.path.join(DATA_DIR, "outcomes.db")
    PARTICLES_PATH = os.path.join(DATA_DIR, "seir_particles.json")
    DATASET_PATH = os.path.join(DATA_DIR, "dengue_dataset.csv")

config = Config()
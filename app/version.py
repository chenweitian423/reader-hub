from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT_DIR / "VERSION"


def read_app_version() -> str:
    if not VERSION_FILE.exists():
        return "0.0.0"
    return VERSION_FILE.read_text(encoding="utf-8").strip() or "0.0.0"


APP_VERSION = read_app_version()

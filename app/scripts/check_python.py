"""Which of the app's Python packages import in THIS Python (the one CANVAS_PYTHON names). Free; no torch import (find_spec only).

  <CANVAS_PYTHON> -I scripts/check_python.py          human list, exit 1 when the Render finish itself (cv2, numpy) is not whole
  <CANVAS_PYTHON> -I scripts/check_python.py --json   {"cv2": true, ...} for server/pythonCheck.ts (the dev server logs the gaps at start)
"""
import importlib.util, json, sys

MODULES = {  # module: (pip name, what needs it)
    "cv2": ("opencv-python", "Render finish, colour match, face pass, clay video"),
    "numpy": ("numpy", "Render finish, colour match, face pass, clay video"),
    "trimesh": ("trimesh", "massing clay for built pieces"),
    "scipy": ("scipy", "massing clay for built pieces"),
    "skimage": ("scikit-image", "massing clay for built pieces"),
}


def present():
    out = {}
    for m in MODULES:
        try:
            out[m] = importlib.util.find_spec(m) is not None
        except (ImportError, ValueError):
            out[m] = False
    return out


if __name__ == "__main__":
    have = present()
    if "--json" in sys.argv:
        print(json.dumps(have))
    else:
        for m, (pip, why) in MODULES.items():
            print(f"{'ok     ' if have[m] else 'MISSING'} {pip:14} {why}")
        print("\npip install -r app/scripts/requirements.txt  (SETUP.md step 1)")
    sys.exit(0 if have["cv2"] and have["numpy"] else 1)

"""Episode template. Copy this folder to NN-name/, then:
  1. record footage with tools/record.ps1, save Studio [FILM] lines to footage/console.txt
  2. fill in CUTS / REQUESTS / NARRATION below
  3. render:  ..\\tools\\kokoro\\.venv\\Scripts\\python.exe edit.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "forge_kit"))
import forge

RAW = os.path.join(HERE, "footage", "raw.mp4")

# Footage times are seconds into raw.mp4. If the director prints [FILM] marks and shows a white
# sync flash at t=0, use forge.read_marks(...) and forge.find_flash(RAW) to convert mark times:
#   marks, _ = forge.read_marks("footage/console.txt", "footage/sync.txt")
#   flash = forge.find_flash(RAW); start = flash + marks["result1"]
CUTS = [  # (source start, duration)
    (0.0, 6.0),
    (10.0, 8.0),
    (20.0, 6.0),
]

REQUESTS = [  # (output time, text typed in the chat panel; voice reads it aloud)
    (0.5, "Make the rain look realistic."),
]

# (time, subtitle text, speed, optional text Kokoro says). Say "Forge G-U-I" so it isn't "gooey".
NARRATION = [
    (0.3, "I'm upgrading my game with ForgeGUI.", 1.0, "I'm upgrading my game with Forge G-U-I."),
    (17.0, "Try ForgeGUI today.", 1.0, "Try Forge G-U-I today."),
]

forge.build(
    out=os.path.join(HERE, "episode.mp4"),
    footage=RAW,
    cuts=CUTS,
    requests=REQUESTS,
    narration=NARRATION,
    title="I Made Rain Look Insane With ForgeGUI",
    title_until=4.0,
    logo_at=16.5,          # official logo + on-screen CTA for >= 3 s over final gameplay
    logo_dur=3.5,
    cta_text="Try ForgeGUI today",
    work=os.path.join(HERE, "build"),
)

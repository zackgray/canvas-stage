# CMU motion clips

From the CMU Graphics Lab Motion Capture Database (http://mocap.cs.cmu.edu), BVH conversion via github.com/una-dinosauria/cmu-mocap.
"The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217."

Units ≈ 0.0564 m per unit, 120 fps. Every clip is played on subject 35's skeleton (src/stage3d/motion/retarget.ts); the in/out
windows used live in src/stage3d/clips.ts. To keep the library small, long trials are shipped cropped to the frames used plus a
margin; the crop is a plain cut of whole frame lines (header and data untouched), listed below in the original file's 1-based frames.
Uncropped files start with the CMU T-pose frame.

| file | subject/trial | CMU description | used for | shipped frames of the original |
|---|---|---|---|---|
| 35_01.bvh | 35/1 | walk | walk (gait loop); the canonical skeleton | all |
| 35_17.bvh | 35/17 | run/jog | run (gait loop) | all |
| 16_32.bvh | 16/32 | walk | start (stand to stride) | 1–300 of 581 |
| 16_34.bvh | 16/34 | slow walk, stop | stop (stride to stand) | all |
| 111_28.bvh | 111/28 | standing still | idle (2 s seamless cycle), and the relaxed right arm layered over the kneel | 73–397 of 1908 |
| 76_10.bvh | 76/10 | turning | turn in place, left (~70°) and right (~90°), scaled to the asked angle | 2–553 of 1366 |
| 23_03.bvh | 23/3 | A sits, holds face in hands; B kneels, comforts A (subject B) | kneel down on the right knee, hold, stand up | 2–691 of 813 |

Look is not a clip: it turns the idle's spine and head by the asked angle (src/stage3d/motion/segments.ts).

Generated clips (the lift and its ending) live beside this folder in ../kimodo, with their own README and credit line.

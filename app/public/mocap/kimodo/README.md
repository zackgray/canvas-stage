# Generated motion clips

Clips generated with NVIDIA Kimodo (text plus wrist end-effector constraints), then retargeted onto CMU subject 35's skeleton:
the HIERARCHY is 35_01's verbatim (same joint names, offsets and channel order as public/mocap/cmu), CMU units (≈ 0.0564 m per
unit), 120 fps, the figure facing +Z. The retarget keeps the source's grip height and grip width with a two-bone arm IK (CMU-35 has
shorter forearms and wider shoulders than Kimodo's figure). The in/out windows used live in src/stage3d/clips.ts.

Credit: generated with NVIDIA Kimodo (Apache-2.0 code, NVIDIA Open Model License weights). Text encoder: Meta Llama 3 8B
Instruct, Built with Meta Llama 3, used under the Meta Llama 3 Community License.

Licence note: the Kimodo code is Apache-2.0 and its weights are under the NVIDIA Open Model License (commercial use allowed; outputs
are not claimed by NVIDIA). The text encoder is Meta Llama 3 8B Instruct (Built with Meta Llama 3), used under the Meta Llama 3
Community License; it only steers generation at run time, and nothing here is used to improve another AI model.

| file | run | prompt (abridged) | used for | frames |
|---|---|---|---|---|
| lift_frame.bvh | c15, seed 53, 8 s | stands still, bends and reaches into a box with both hands, lifts out a flat frame, holds it up in front of the face | lift: stand, bend, take a frame at the hive's rim (2.5 s), raise it to head height, hold | all (957) |
| lift_frame_lower.bvh | d02, seed 7, 6 s, starts on c15's last pose and ends on its first | holds a flat frame up, lowers it back into a box, lets go, straightens up and stands | liftDown: the lift's ending (lets go at 2.85 s, stands by 3.5 s) | all (717) |

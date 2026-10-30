"""Motion box service: a small always-on HTTP service that makes human moves from words.

The app sends a MoveSpec (see docs/plan-kimodo-live.md section 2); the box turns the spec's
hand targets into Kimodo end-effector constraints, generates tries, scores them, retargets the
top 3 onto CMU-35 with hand-IK and serves BVH / strip PNG / scores JSON per try.
Run in fake mode (no GPU, no model) with: python -m motionbox.server --fake
"""
__version__ = "0.1.0"

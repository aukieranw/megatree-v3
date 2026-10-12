Megatree v3 export (from Fusion, Megatree v3 v87)

Files
- Megatree_v3_full.step : whole assembly, neutral format (includes hidden reference bodies).
- obj/<group>/*.obj : one OBJ per visible solid body, WORLD coordinates, mm, Z up. One folder per top-level occurrence (each folder moves as one rigid group).
- manifest.json : group -> folder -> files.
- joints.json : the joints (Fusion AS-BUILT joints; rootComponent.allJoints is empty in this design), kinematic tree, current pose, limits, plus guy/cable/string polylines (world, mm).

Kinematic tree
Base - fixed (grounded)
  -> Hinge (revolute about the pin: origin (42.5,180,65) mm, axis -X; 0..90 deg, + lowers the pole toward the house, +Y)
     -> Base - hinged leaf  -> rigid -> Pole
          -> Topper slide (Z): 0 = park (disc 6472), -5070 = low (rests on the collar)
               -> Topper Assembly -> rigid -> Star + mast (star is only fitted after the walk-up)
          -> rigid -> Winch Bracket (Winch is a child)
          -> rigid -> Pulley Topper
          -> Mid collar slide (Z): value 400 = collar bottom at 3650 (as exported); -2200 = resting on the bracket
          -> Lock sleeve slide (Z): 0 = locked over the NB50 stub; +280 = raised for the walk-up
Grounded: NB50 ground stub, Ground, Skeleton, Cable paths.
Slider/revolute axes are in WORLD coords at the exported pose; child joints ride on the Pole, so apply the hinge rotation after the slides.

Erection order (manual v1.0-pre): pole assembled lying down toward the house on a sawhorse (~600 high, ~3 m out); lock sleeve raised (+280), collar on the bracket (-2200), topper low (-5070); walk up (hinge 90 -> 0); drop sleeve (0); fit star; hang strings; winch topper to park (0); slide collar up (to 3650-3750); guys. Strike is the reverse.

# PrefabManager [Rogue Engine]

Place prefabs into runtime scene and save its transforms, load dynamicaly with render distance per-prefab using octree.

---

## Installation

1. Copy **Asset** folder into your game project directory (e.g RogueProjects/YourGame/)

2. Put prefab into scene from Assets/PrefabManager/PrefabManager.prefab

---

### Workflow

Toggle "Editor_Mode" for editing or production cases. Editor Mode spawns custom camera, controllers and UI. 

PrefabManager can only see and interact with prefabs that loaded using PManager.

It doesnt change prefabs placed manually.

You can specify render distance per-prefab, and you can add object3d names that will act as anchor from which distance will be calculated (e.g "ThirdPersonCharacter" for player avatars) 



<div align="center">
<p align="center">
  <img src="./img/preview.gif" alt="PMgif" width="1000" style="border-radius: 6px;"/>
</p>



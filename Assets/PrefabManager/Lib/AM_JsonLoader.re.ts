import * as RE from 'rogue-engine';
import * as THREE from 'three';
import AssetManager from './AssetManager.re';

type PrefabData = {
  pathPrefab: string;
  transforms: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  renderDistance: number;
  isHidden?: boolean;
  isDeleted?: boolean;
};

@RE.registerComponent
export default class AM_JsonLoader extends RE.Component {

  public static savePrefabs() {
    const prefabs = Array.from(AssetManager.prefabMap.values())
      .filter(entry => !entry.isDeleted)
      .map(entry => ({
        pathPrefab: entry.path,
        transforms: {
          position: [entry.position.x, entry.position.y, entry.position.z],
          rotation: [entry.rotation.x, entry.rotation.y, entry.rotation.z],
          scale: [entry.scale.x, entry.scale.y, entry.scale.z]
        },
        renderDistance: entry.renderDistance ?? 0, // Correctly reference renderDistance from prefabMap entries
        isHidden: entry.isHidden
      }));

    const blob = new Blob([JSON.stringify(prefabs, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = AssetManager.get().jsonStaticPath;
    link.click();
  }

  public static async loadPrefabs() {
    try {
      const fullPath = RE.getStaticPath(AssetManager.get().jsonStaticPath);
      const response = await fetch(fullPath);
      const prefabData: PrefabData[] = await response.json();

      AssetManager.prefabMap.clear();

      await Promise.all(prefabData.map(async (data) => {
        if (data.isDeleted) return; // Skip deleted prefabs
        
        const instance = await RE.Prefab.instantiate(data.pathPrefab);
        if (instance) {
          const position = new THREE.Vector3(...data.transforms.position);
          const rotation = new THREE.Euler(...data.transforms.rotation);
          const scale = new THREE.Vector3(...data.transforms.scale);
          
          if (data.isHidden) {
            instance.visible = false;
          }

          AssetManager.prefabMap.set(instance.uuid, {
            path: data.pathPrefab,
            position,
            rotation,
            scale,
            renderDistance: data.renderDistance ?? 0, // Correctly reference renderDistance from prefabMap entries
            isHidden: data.isHidden || false,
            isDeleted: data.isDeleted || false
          });

          instance.position.copy(position);
          instance.rotation.copy(rotation);
          instance.scale.copy(scale);
          instance.traverse(child => {
            child.userData.isSpawnedPrefab = true;
          });
          instance.userData.isPrefabRoot = true;
          // Don't add to scene immediately
          AssetManager.get().spawnedPrefabs.set(instance.uuid, instance);
          AssetManager.setRenderDistance(instance.uuid, data.renderDistance);

          instance.addEventListener('onUpdate', () => {
            AssetManager.updatePrefabTransform(
              instance.uuid,
              instance.position,
              instance.rotation,
              instance.scale
            );
          });
        }
      }));
      AssetManager.get().updateSpawnedPrefabsList();
      // Delay UI refresh to ensure all elements are loaded
      setTimeout(() => AssetManager.get().updateSpawnedPrefabsList(), 500);
    } catch (error) {
      console.log('Error loading prefabs:', error);
    }
  }
}

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

interface PrefabNode {
  position: THREE.Vector3;
  metadata: any;
  distanceToCamera?: number;
  distance?: number;
}

class PriorityQueue<T extends PrefabNode> {
  private heap: T[] = [];
  private comparator: (a: T, b: T) => number;

  constructor(comparator: (a: T, b: T) => number) {
    this.comparator = comparator;
  }

  enqueue(item: T) {
    this.heap.push(item);
    this.heapifyUp(this.heap.length - 1);
  }

  dequeue(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const item = this.heap[0];
    this.heap[0] = this.heap.pop() as T;
    this.heapifyDown(0);
    return item;
  }

  clear() {
    this.heap = [];
  }

  private heapifyUp(index: number) {
    if (index === 0) return;
    const parentIndex = Math.floor((index - 1) / 2);
    if (this.comparator(this.heap[index], this.heap[parentIndex]) < 0) {
      this.swap(index, parentIndex);
      this.heapifyUp(parentIndex);
    }
  }

  private heapifyDown(index: number) {
    const leftChildIndex = 2 * index + 1;
    const rightChildIndex = 2 * index + 2;
    let smallest = index;

    if (
      leftChildIndex < this.heap.length &&
      this.comparator(this.heap[leftChildIndex], this.heap[smallest]) < 0
    ) {
      smallest = leftChildIndex;
    }

    if (
      rightChildIndex < this.heap.length &&
      this.comparator(this.heap[rightChildIndex], this.heap[smallest]) < 0
    ) {
      smallest = rightChildIndex;
    }

    if (smallest !== index) {
      this.swap(index, smallest);
      this.heapifyDown(smallest);
    }
  }

  private swap(i: number, j: number) {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

class Octree {
  private bounds: THREE.Box3;
  private nodes: PrefabNode[] = [];

  constructor(bounds: THREE.Box3) {
    this.bounds = bounds;
  }

  insert(item: PrefabNode) {
    this.nodes.push(item);
  }

  query(range: THREE.Sphere): PrefabNode[] {
    const results: PrefabNode[] = [];
    this.nodes.forEach(node => {
      if (range.containsPoint(node.position)) {
        results.push(node);
      }
    });
    return results;
  }

  getAllNodes(): PrefabNode[] {
    return this.nodes;
  }
}

@RE.registerComponent
export default class AM_JsonLoader extends RE.Component {
  private static prefabOctree: Octree;
  private static workerPool: Worker[] = [];
  private static priorityQueue: PriorityQueue<PrefabNode>;

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
      // Initialize systems
      this.prefabOctree = new Octree(new THREE.Box3(
        new THREE.Vector3(-1, -1, -1),
        new THREE.Vector3(1, 1, 1)
      ));
      
      this.priorityQueue = new PriorityQueue<PrefabNode>((a, b) => 
        a.distanceToCamera! - b.distanceToCamera!
      );

      // Initialize worker pool
      for (let i = 0; i < navigator.hardwareConcurrency; i++) {
        this.workerPool.push(new Worker('./prefabWorker.ts'));
      }

      const fullPath = RE.getStaticPath(AssetManager.get().jsonStaticPath);
      const response = await fetch(fullPath);
      const prefabData: PrefabData[] = await response.json();

      AssetManager.prefabMap.clear();

      const prefabInstances: THREE.Object3D[] = [];

      await Promise.all(prefabData.map(async (data) => {
        if (data.isDeleted) return; // Skip deleted prefabs
        
        const instance = await RE.Prefab.instantiate(data.pathPrefab);
        prefabInstances.push(instance);
        instance.remove();
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

          this.prefabOctree.insert({
            position,
            metadata: data
          });
        }
      }));

      // Remove prefabs from scene after processing
      prefabInstances.forEach(prefab => {
        RE.Runtime.scene.remove(prefab);
      });

      AssetManager.get().updateSpawnedPrefabsList();
      // Delay UI refresh to ensure all elements are loaded
      setTimeout(() => AssetManager.get().updateSpawnedPrefabsList(), 500);
    } catch (error) {
      console.log('Error loading prefabs:', error);
    }
  }

  public static async loadPrefabData(path: string) {
    const response = await fetch(path);
    const prefabs = await response.json();
    
    prefabs.forEach(prefab => {
      const position = new THREE.Vector3(
        prefab.x, prefab.y, prefab.z
      );
      this.prefabOctree.insert({
        position,
        metadata: prefab
      });
    });
  }

  public static getVisiblePrefabs(cameraPos: THREE.Vector3, renderDistance: number) {
    const sphere = new THREE.Sphere(cameraPos, renderDistance);
    const candidates = this.prefabOctree.query(sphere);
    
    // Parallel process visibility checks
    const batchSize = Math.ceil(candidates.length / this.workerPool.length);
    const results: PrefabNode[] = [];
    
    this.workerPool.forEach((worker, i) => {
      const batch = candidates.slice(i * batchSize, (i + 1) * batchSize);
      worker.postMessage({ batch, cameraPos });
      worker.onmessage = (e) => results.push(...e.data);
    });
    
    return results.sort((a, b) => a.distance! - b.distance!);
  }

  public static updatePriorityQueue(cameraPos: THREE.Vector3) {
    this.priorityQueue.clear();
    const allNodes = this.prefabOctree.getAllNodes();
    allNodes.forEach(node => {
      node.distanceToCamera = node.position.distanceTo(cameraPos);
      this.priorityQueue.enqueue(node);
    });
  }

  public static showPrefab(prefab: THREE.Object3D) {
    prefab.visible = true;
    RE.Runtime.scene.add(prefab);
  }

  public static hidePrefab(prefab: THREE.Object3D) {
    prefab.visible = false;
    RE.Runtime.scene.remove(prefab);
  }

  private static async waitForCameras(activeCameras: THREE.Camera[]) {
    while (activeCameras.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  public static async startSpawningCycle(
    activeCameras: THREE.Camera[],
    renderDistance: number,
    prefabPool: THREE.Object3D[]
  ) {
    await this.waitForCameras(activeCameras);
    
    const spawnLoop = () => {
      const cameraPos = activeCameras[0].position;
      this.updatePriorityQueue(cameraPos);
      const visiblePrefabs = this.getVisiblePrefabs(cameraPos, renderDistance);

      visiblePrefabs.forEach(prefabNode => {
        const prefab = prefabPool.find(p => p.uuid === prefabNode.metadata.id);
      });

      requestAnimationFrame(spawnLoop);
    };

    spawnLoop();
  }
}

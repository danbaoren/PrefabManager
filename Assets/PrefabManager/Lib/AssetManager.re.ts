import * as RE from 'rogue-engine';
import * as THREE from 'three';
import AM_Handler from './AM_Handler.re'; 
import AM_JsonLoader from './AM_JsonLoader.re'; 
import AM_UI from './AM_UI.re';
import { EventDispatcher } from 'three';

interface PrefabEvent {
  type: 'prefabShown' | 'prefabHidden';
  prefabId: string;
}

@RE.registerComponent
export default class AssetManager extends RE.Component {
  camera: THREE.PerspectiveCamera | undefined;

  @RE.props.checkbox() editorMode: boolean = true;
  @RE.props.text() jsonStaticPath = 'prefab-manager.json';
  @RE.props.text() prefabBasePath: string = "";
  @RE.props.text() excludedObjectNames: string = 'ROGUE_INTERNAL_SKYBOX, TerrainCollider';
  @RE.props.num() prefabSpawnDistance: number = 100; 
  @RE.props.group("Controls", true)
  @RE.props.num() movementSpeed: number = 300;
  @RE.props.num() speedMultiplier: number = 10;
  @RE.props.num() lookSensitivity: number = 0.002;
  @RE.props.num() rotationSmoothingSpeed: number = 0;
  @RE.props.text() private forwardKey = 'w';
  @RE.props.text() private backwardKey = 's';
  @RE.props.text() private strafeLeftKey = 'a';
  @RE.props.text() private strafeRightKey = 'd';
  @RE.props.text() private flyUpKey1 = 'e';
  @RE.props.text() private flyDownKey1 = 'q';
  @RE.props.text() private flyUpKey2 = ' ';
  @RE.props.text() private flyDownKey2 = 'control';
  @RE.props.text() private boostKey = 'shift';
  @RE.props.checkbox() showCrosshairInitially: boolean = true;
  @RE.props.text() toggleCrosshairKey: string = 'c';
  @RE.props.num() renderDistance: number = 1000000;

  public prefabListContainer: HTMLElement | null = null;
  public prefabItemsContainer: HTMLElement | null = null; 
  public spawnedPrefabsContainer: HTMLElement | null = null;
  public availablePrefabs: string[] = [];

  public excludedNamesArray: string[] = [];

  public isPointerLocked: boolean = false;
  public keysPressed: { [key: string]: boolean } = {};
  public pitch: number = 0;
  public yaw: number = 0;
  public targetQuaternion: THREE.Quaternion = new THREE.Quaternion();
  public tempVector: THREE.Vector3 = new THREE.Vector3();
  public tempEuler: THREE.Euler = new THREE.Euler(0, 0, 0, 'YXZ');
  public domElement: HTMLElement | null = null;

  public raycaster: THREE.Raycaster = new THREE.Raycaster();


  public onMouseMoveBound = this.onMouseMove.bind(this);
  public onKeyDownBound = this.onKeyDown.bind(this);
  public onKeyUpBound = this.onKeyUp.bind(this);
  public onPointerLockChangeBound = this.onPointerLockChange.bind(this);
  public onLeftClickBound = this.onLeftClick.bind(this);
  public toggleAllUIBound = this.toggleAllUI.bind(this);
  public onPrefabWheelBound = this.onPrefabWheel.bind(this);
  public onRightClickBound = this.onRightClick.bind(this);

  public debugLine: THREE.Line | null = null;

  public static prefabMap: Map<string, {
    path: string;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    renderDistance: number;
    isHidden: boolean;
    isDeleted: boolean
  }> = new Map();

  private renderDistanceMap = new Map<string, number>();
  private selectedPrefab: string | null = null;

  private getSelectedPrefab(): THREE.Object3D | null {
    return this.selectedPrefab ? this.spawnedPrefabs.get(this.selectedPrefab) || null : null;
  }

  cameraUpdateInterval: NodeJS.Timeout | null = null;

  spawnedPrefabs = new Map<string, THREE.Object3D>();
  loadedPrefabs = new Map<string, THREE.Object3D>();

  lastCheckPosition = new THREE.Vector3();

  private activeCameras: THREE.Camera[] = [];
  private cameraSearchActive = false;
  private lastCameraCheck = 0;

  private prefabPool: THREE.Object3D[] = [];
  private spawnInterval: NodeJS.Timeout | null = null;
  private updateInterval: number = 1000;

  async start() {
    if (this.editorMode) {
      // Editor-only camera setup
      const newCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000000);
      newCamera.position.set(0, 5000, 0);
      this.pitch = 0;
      this.yaw = 0;
      this.tempEuler.set(this.pitch, this.yaw, 0, 'YXZ');
      this.targetQuaternion.setFromEuler(this.tempEuler);
      newCamera.quaternion.copy(this.targetQuaternion);
      RE.Runtime.scene.add(newCamera);
      RE.Runtime.scene.add(newCamera);
      RE.App.activeCamera = newCamera.uuid;
      newCamera.updateProjectionMatrix();
      this.camera = newCamera;

      this.domElement = RE.Runtime.rogueDOMContainer;
      if (this.domElement) {
        AM_UI.createCrosshair();
        AM_UI.createObjectMenuUI();
        this.createSaveButton();
        AM_UI.createCameraLocationDisplay();
        document.addEventListener('mousemove', this.onMouseMoveBound);
        document.addEventListener('keydown', this.onKeyDownBound);
        document.addEventListener('keyup', this.onKeyUpBound);
        document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
        this.domElement.addEventListener('click', this.onLeftClickBound);
        this.domElement.addEventListener('contextmenu', this.onRightClickBound);
        document.addEventListener('keydown', (e) => {
          if (e.key === 'c' || e.key === 'C') {
            this.toggleAllUI();
          }
        });
        document.addEventListener('wheel', this.onPrefabWheelBound);
      }
      console.log("First Person Camera initialized. Click canvas to lock pointer for controls.");
      console.log(`Controls: ${this.forwardKey}/${this.backwardKey} (Forward/Backward), ${this.strafeLeftKey}/${this.strafeRightKey} (Strafe), ${this.flyUpKey1}/${this.flyDownKey1} or ${this.flyUpKey2}/${this.flyDownKey2} (Fly Up/Down), ${this.boostKey} (Speed Boost), Mouse (Look), ESC (Unlock), ${this.toggleCrosshairKey} (Toggle Crosshair), Left-Click (Raycast & Menu)`);

      this.parseExcludedNames();

    }

    await this.initPrefabSystem();

    if (this.editorMode) {
      this.createPrefabListUI();
      this.loadAvailablePrefabs();

      // Initialize render distance after prefabs loaded and camera available
      if (this.camera) {
        this.startRenderDistanceCalculation();
      } else {
        console.error("Camera not found for render distance initialization");
      }
    } else {
      console.error("Editor mode is disabled. First Person Camera controls and Raycast/UI will not work.");
    }

    this.initializeRenderSystem();

    RE.Runtime.onStop(() => {
      AM_Handler.onDestroy();
    })
  }


    /**
   * Called every frame to update camera movement and rotation.
   */
    public update() {
      if (!this.camera || !this.isPointerLocked) {
        AM_UI.updateCameraLocationDisplay();
        return;
      }
  
      const deltaTime = RE.Runtime.deltaTime;
  
      // Apply rotation smoothing if enabled, otherwise directly copy
      if (this.rotationSmoothingSpeed > 0) {
        const maxAngularStep = THREE.MathUtils.degToRad(this.rotationSmoothingSpeed) * deltaTime;
        this.camera.quaternion.rotateTowards(this.targetQuaternion, maxAngularStep);
      } else {
        this.camera.quaternion.copy(this.targetQuaternion);
      }
  
      const baseMoveDistance = this.movementSpeed * deltaTime;
      let currentMoveDistance = baseMoveDistance;
      // Apply speed boost if boost key is pressed
      if (this.keysPressed[this.boostKey]) {
        currentMoveDistance *= this.speedMultiplier;
      }
  
      const movementVector = this.tempVector.set(0, 0, 0);
      // Get camera's forward and right vectors
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const globalUp = new THREE.Vector3(0, 1, 0); // Global up direction for flying
  
      // Accumulate movement based on pressed keys
      if (this.keysPressed[this.forwardKey]) {
        movementVector.add(forward);
      }
      if (this.keysPressed[this.backwardKey]) {
        movementVector.sub(forward);
      }
      if (this.keysPressed[this.strafeLeftKey]) {
        movementVector.sub(right);
      }
      if (this.keysPressed[this.strafeRightKey]) {
        movementVector.add(right);
      }
      if (this.keysPressed[this.flyUpKey1] || this.keysPressed[this.flyUpKey2]) {
        movementVector.add(globalUp);
      }
      if (this.keysPressed[this.flyDownKey1] || this.keysPressed[this.flyDownKey2]) {
        movementVector.sub(globalUp);
      }
  
      // Normalize horizontal movement to prevent faster diagonal movement
      const horizontalMovementSq = movementVector.x * movementVector.x + movementVector.z * movementVector.z;
      const verticalMovement = movementVector.y;
  
      if (horizontalMovementSq > 0) {
        const horizontalMagnitude = Math.sqrt(horizontalMovementSq);
        if (horizontalMagnitude > 1) {
          movementVector.x /= horizontalMagnitude;
          movementVector.z /= horizontalMagnitude;
        }
      }
      movementVector.y = verticalMovement; // Preserve vertical movement
  
      // Apply the calculated movement to the camera's position
      this.camera.position.addScaledVector(movementVector, currentMoveDistance);
      AM_UI.updateCameraLocationDisplay();
      this.updatePrefabVisibility();
    }








  private createSaveButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = 'Save Prefabs';
    button.style.position = 'fixed';
    button.style.top = '20px';
    button.style.left = '50%';
    button.style.transform = 'translateX(-50%)';
    button.style.zIndex = '1000';
    button.style.width = 'auto';
    button.style.padding = '8px 16px';
    button.style.minWidth = '140px';
    button.style.maxWidth = '200px';
    button.style.borderRadius = '4px';
    AM_UI.styleButton(button, '#4CAF50');
    button.addEventListener('click', () => AM_JsonLoader.savePrefabs());
    if (this.domElement) {
      this.domElement.appendChild(button);
    }
    AM_UI.saveButtonElement = button;
    return button;
  }




  /**
   * Parses the comma-separated excluded object names string into an array.
   */
  private parseExcludedNames() {
    this.excludedNamesArray = this.excludedObjectNames
      .split(',')
      .map(name => name.trim().toLowerCase())
      .filter(name => name.length > 0);
  }

  /**
   * Handles keyboard key down events for camera controls and crosshair toggle.
   * @param event The KeyboardEvent object.
   */
  private onKeyDown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (key === this.toggleCrosshairKey.toLowerCase()) {
      AM_UI.setCrosshairVisibility(!AM_UI.isCrosshairVisible);
      event.preventDefault();
      return;
    }
    if (key === 'escape') {
      if (document.pointerLockElement === this.domElement) {
        document.exitPointerLock();
      }
      return;
    }
    if (!this.isPointerLocked) return;

    const isControlKey = [
      this.forwardKey, this.backwardKey, this.strafeLeftKey, this.strafeRightKey,
      this.flyUpKey1, this.flyDownKey1, this.flyUpKey2, this.flyDownKey2, this.boostKey
    ].includes(key);
    if (isControlKey) {
      this.keysPressed[key] = true;
      event.preventDefault();
    }
  }

  /**
   * Handles keyboard key up events for camera controls.
   * @param event The KeyboardEvent object.
   */
  private onKeyUp(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    const isControlKey = [
      this.forwardKey, this.backwardKey, this.strafeLeftKey, this.strafeRightKey,
      this.flyUpKey1, this.flyDownKey1, this.flyUpKey2, this.flyDownKey2, this.boostKey
    ].includes(key);
    if (isControlKey) {
      this.keysPressed[key] = false;
    }
  }

  /**
   * Handles mouse movement for camera rotation when pointer is locked.
   * @param event The MouseEvent object.
   */
  private onMouseMove(event: MouseEvent) {
    if (!this.isPointerLocked || !this.camera) return;

    this.yaw -= event.movementX * this.lookSensitivity;
    this.pitch -= event.movementY * this.lookSensitivity;
    const halfPI = Math.PI / 2;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -halfPI + 0.01, halfPI - 0.01);
    this.tempEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.targetQuaternion.setFromEuler(this.tempEuler);
  }

  /**
   * Traverses up the object hierarchy to find the root of a spawned prefab.
   * @param object The hit object from the raycast.
   * @returns The prefab root object, or null if not found.
   */
  private findPrefabRoot(object: THREE.Object3D): THREE.Object3D | null {
    let currentObject: THREE.Object3D | null = object;
    while (currentObject) {
      if (currentObject.userData && currentObject.userData.isPrefabRoot) {
        return currentObject;
      }
      // If it's a direct child of the scene, and it has the isSpawnedPrefab flag,
      // it might be a direct root (e.g., if a prefab was instantiated directly without a deeper hierarchy).
      // This is a fallback in case isPrefabRoot isn't explicitly set or correctly propagated.
      if (currentObject.parent === RE.Runtime.scene && currentObject.userData.isSpawnedPrefab) {
          return currentObject;
      }
      currentObject = currentObject.parent;
    }
    return null;
  }

  /**
   * Handles left-click events for pointer lock and object interaction.
   * @param event The MouseEvent object.
   */
  private onLeftClick(event: MouseEvent) {
    if (!this.isPointerLocked) {
      this.requestPointerLock();
      return;
    }



    // Raycast from the center of the screen (crosshair position)
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), RE.Runtime.camera);
    
    // Update camera matrix for accurate raycasting
    RE.Runtime.camera.updateMatrixWorld();
    
    const intersects = this.raycaster.intersectObjects(RE.Runtime.scene.children, true)
      .filter(intersect => {
        console.log('Raw hit:', intersect.object.name, 'type:', intersect.object.type);
        
        if (intersect.object === this.camera) return false;
        if (this.isObjectExcludedByName(intersect.object)) return false;

        // Detailed geometry validation
        let isValid = false;
        try {
          console.log('Checking:', intersect.object.name, 'Type:', intersect.object.type);
          
          if (intersect.object instanceof THREE.Mesh) {
            isValid = !!intersect.object.geometry?.attributes.position?.count;
            console.log('Mesh geometry valid:', isValid);
          } else {
            const box = new THREE.Box3();
            box.setFromObject(intersect.object);
            isValid = !box.isEmpty();
            console.log('Bounding box valid:', isValid, 'Size:', box.getSize(new THREE.Vector3()));
          }
        } catch (error) {
          console.error('Validation error:', error);
          isValid = false;
        }
        return isValid;
      });

    if (intersects.length > 0) {
      const firstHit = intersects[0];

      // Debug visualization
      if (this.camera && RE.Runtime.scene) {
        if (this.debugLine) {
          RE.Runtime.scene.remove(this.debugLine);
        }

        const points: THREE.Vector3[] = [];
        points.push(this.camera.position.clone());
        points.push(firstHit.point);

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineDashedMaterial({
          color: 0xff0000,
          linewidth: 2,
          dashSize: 1,
          gapSize: 0.5
        });

        this.debugLine = new THREE.Line(geometry, material);
        RE.Runtime.scene.add(this.debugLine);

        setTimeout(() => {
          if (this.debugLine && RE.Runtime.scene) {
            RE.Runtime.scene.remove(this.debugLine);
            this.debugLine = null;
          }
        }, 5000);
      }

      const hitObject = firstHit.object;

      // Find the actual prefab root from the hit object
      const prefabRoot = this.findPrefabRoot(hitObject);

      if (prefabRoot) {
        console.groupCollapsed('Clicked Prefab Details');
        console.log('Name:', prefabRoot.name || 'Unnamed Prefab');
        console.log('UUID:', prefabRoot.uuid);
        console.log('Position:', prefabRoot.position);
        console.log('Rotation:', prefabRoot.rotation);
        console.log('Scale:', prefabRoot.scale); 
        console.log('Hierarchy:', this.getObjectHierarchy(prefabRoot));
        console.groupEnd();
        AM_UI.selectedObject = prefabRoot; // Select the root of the prefab
        this.showObjectMenu(prefabRoot);
        this.updateTransformInputs();
      } else {
        // If a spawned part was hit but no identifiable prefab root, hide menu
        if (AM_UI.objectMenuContainerElement) {
          AM_UI.objectMenuContainerElement.style.display = 'none';
        }
        AM_UI.selectedObject = null;
      }
    } else {
      // If no valid object is hit, hide the object menu
      if (AM_UI.objectMenuContainerElement) {
        AM_UI.objectMenuContainerElement.style.display = 'none';
        AM_UI.selectedObject = null;
      }
    }
  }

  /**
   * Handles right-click events for object selection without pointer lock
   */
  private onRightClick(event: MouseEvent) {
    event.preventDefault();

    if (!this.camera || !AM_UI.objectMenuContainerElement) return;

    // Raycast from screen center (crosshair position)
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const intersects = this.raycaster.intersectObjects(RE.Runtime.scene.children, true)
      .filter(intersect => {
        console.log('Raw hit:', intersect.object.name, 'type:', intersect.object.type);
        
        if (intersect.object === this.camera) return false;
        if (this.isObjectExcludedByName(intersect.object)) return false;

        // Detailed geometry validation
        let isValid = false;
        try {
          console.log('Checking:', intersect.object.name, 'Type:', intersect.object.type);
          
          if (intersect.object instanceof THREE.Mesh) {
            isValid = !!intersect.object.geometry?.attributes.position?.count;
            console.log('Mesh geometry valid:', isValid);
          } else {
            const box = new THREE.Box3();
            box.setFromObject(intersect.object);
            isValid = !box.isEmpty();
            console.log('Bounding box valid:', isValid, 'Size:', box.getSize(new THREE.Vector3()));
          }
        } catch (error) {
          console.error('Validation error:', error);
          isValid = false;
        }
        return isValid;
      });

    if (intersects.length > 0) {
      const prefabRoot = this.findPrefabRoot(intersects[0].object);
      if (prefabRoot) {
        console.groupCollapsed('Clicked Prefab Details');
        console.log('Name:', prefabRoot.name || 'Unnamed Prefab');
        console.log('UUID:', prefabRoot.uuid);
        console.log('Position:', prefabRoot.position);
        console.log('Rotation:', prefabRoot.rotation);
        console.log('Scale:', prefabRoot.scale); 
        console.log('Hierarchy:', this.getObjectHierarchy(prefabRoot));
        console.groupEnd();
        AM_UI.selectedObject = prefabRoot;
        this.showObjectMenu(prefabRoot);
        this.updateTransformInputs();
        
        // Position menu at click location for right-click
        if (AM_UI.objectMenuContainerElement) {
          AM_UI.objectMenuContainerElement.style.left = `${event.clientX}px`;
          AM_UI.objectMenuContainerElement.style.top = `${event.clientY}px`;
        }
      }
    } else {
      AM_UI.objectMenuContainerElement.style.display = 'none';
      AM_UI.selectedObject = null;
    }
  }


  /**
   * Checks if an object's name is in the excluded list.
   * @param object The THREE.Object3D to check.
   * @returns True if the object's name is excluded, false otherwise.
   */
  private isObjectExcludedByName(object: THREE.Object3D): boolean {
    if (!object.name) return false;
    const lowerCaseName = object.name.toLowerCase();
    return this.excludedNamesArray.includes(lowerCaseName);
  }


  /**
   * Handles changes in the pointer lock state.
   */
  private onPointerLockChange() {
    this.isPointerLocked = document.pointerLockElement === this.domElement;
    // Clear keys pressed state when pointer lock changes
    this.keysPressed = {};
  }

  /**
   * Requests pointer lock for the DOM element.
   */
  private requestPointerLock() {
    if (this.domElement) {
      this.domElement.requestPointerLock();
    }
  }


  private updatePrefabVisibility() {
    if (!this.camera || !this.prefabListContainer) return;

    const camPos = this.getCameraPosition();
    this.lastCheckPosition.copy(camPos);

    // Unload distant prefabs
    this.loadedPrefabs.forEach((prefab, uuid) => {
      const renderDistance = this.renderDistanceMap.get(uuid) || 10000;
      const distanceSq = prefab.position.distanceToSquared(camPos);
      
      if (distanceSq > renderDistance * renderDistance) {
        RE.Runtime.scene.remove(prefab);
        this.loadedPrefabs.delete(uuid);
      }
    });

    // Load nearby prefabs
    this.spawnedPrefabs.forEach((prefab, uuid) => {
      if (this.loadedPrefabs.has(uuid)) return;
      
      const renderDistance = this.renderDistanceMap.get(uuid) || 10000;
      const distanceSq = prefab.position.distanceToSquared(camPos);
      
      if (distanceSq <= renderDistance * renderDistance) {
        RE.Runtime.scene.add(prefab);
        this.loadedPrefabs.set(uuid, prefab);
      }
    });
  }

  private getCameraPosition() {
    if (!this.camera) return new THREE.Vector3();
    return this.camera.position.clone();
  }

  /**
   * Creates the UI container for the list of available prefabs.
   */
  private createPrefabListUI() {
    // Cleanup existing UI
    if (this.prefabListContainer) {
      this.prefabListContainer.innerHTML = '';
      if (this.domElement && this.prefabListContainer.parentNode === this.domElement) {
        this.domElement.removeChild(this.prefabListContainer);
      }
      this.prefabListContainer = null;
      this.prefabItemsContainer = null;
      this.spawnedPrefabsContainer = null;
    }

    this.prefabListContainer = document.createElement('div');
    this.prefabListContainer.id = 'prefab-list';
    this.prefabListContainer.style.position = 'fixed';
    this.prefabListContainer.style.left = '0';
    this.prefabListContainer.style.top = '0';
    this.prefabListContainer.style.width = '250px';
    this.prefabListContainer.style.height = '100vh';
    this.prefabListContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.prefabListContainer.style.color = 'white';
    this.prefabListContainer.style.overflowY = 'auto';
    this.prefabListContainer.style.padding = '10px';
    this.prefabListContainer.style.zIndex = '999';
    this.prefabListContainer.style.display = 'flex';
    this.prefabListContainer.style.flexDirection = 'column';
    this.prefabListContainer.style.gap = '5px';

    // Create section headers
    const prefabsHeader = this.createMenuHeader('Prefabs', () => {
      if (this.prefabItemsContainer) {
        this.prefabItemsContainer.style.display = 
          this.prefabItemsContainer.style.display === 'none' ? 'flex' : 'none';
      }
    });

    const loadedHeader = this.createMenuHeader('Loaded Prefabs', () => {
      if (this.spawnedPrefabsContainer) {
        this.spawnedPrefabsContainer.style.display = 
          this.spawnedPrefabsContainer.style.display === 'none' ? 'flex' : 'none';
      }
    });

    // Create containers
    this.prefabItemsContainer = this.createListContainer(true);
    this.spawnedPrefabsContainer = this.createListContainer(true);

    // Add elements
    this.prefabListContainer?.appendChild(prefabsHeader);
    this.prefabListContainer?.appendChild(this.prefabItemsContainer!);
    this.prefabListContainer?.appendChild(loadedHeader);
    this.prefabListContainer?.appendChild(this.spawnedPrefabsContainer!);

    if (this.domElement && this.prefabListContainer) {
      this.domElement.appendChild(this.prefabListContainer);
    }
  }

  private createMenuHeader(text: string, onClick: () => void): HTMLElement {
    const header = document.createElement('div');
    header.textContent = text;
    header.style.cssText = `
      cursor: pointer;
      padding: 8px 12px;
      background: #2a2a2a;
      border-radius: 4px;
      margin: 5px 0;
      user-select: none;
      transition: background 0.2s;
    `;
    header.addEventListener('click', onClick);
    header.addEventListener('mouseenter', () => header.style.background = '#363636');
    header.addEventListener('mouseleave', () => header.style.background = '#2a2a2a');
    return header;
  }

  private createListContainer(visible: boolean): HTMLElement {
    const container = document.createElement('div');
    container.style.display = visible ? 'flex' : 'none';
    container.style.flexDirection = 'column';
    container.style.gap = '5px';
    container.style.marginBottom = '10px';
    container.style.overflowY = 'auto';
    return container;
  }

  /**
   * Loads available prefab paths from the specified base path and populates the UI list.
   * Includes error handling for fetching prefab paths.
   */
  private async loadAvailablePrefabs() {
    try {
      const namedUUIDs = RE.Prefab.namedPrefabUUIDs;
      const prefabPaths = Object.keys(namedUUIDs).filter(path =>
        path.startsWith(this.prefabBasePath) && !path.split('/').pop()?.startsWith('-')
      );

      for (const path of prefabPaths) {
        this.availablePrefabs.push(path);
        this.addPrefabToList(path);
        console.log(`Loaded prefab path: ${path}`);
      }
    } catch (error) {
      console.error('Error loading prefab list:', error);
    }
  }

  /**
   * Adds a prefab path to the UI list, making it selectable for spawning.
   * When a list item is clicked, it directly triggers the instantiation of the prefab using its path.
   * @param prefabPath The path (string) of the RE.Prefab to add to the list.
   */
  private addPrefabToList(prefabPath: string) {
    if (!this.prefabListContainer) return;

    const item = document.createElement('div');
    const prefabName = prefabPath.split('/').pop() || prefabPath;
    item.textContent = prefabName;
    item.style.padding = '8px';
    item.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    item.style.borderRadius = '4px';
    item.style.cursor = 'pointer';
    item.style.transition = 'background-color 0.2s';

    item.addEventListener('mouseover', () => {
      item.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });

    item.addEventListener('mouseout', () => {
      item.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });

    item.addEventListener('click', () => {
      this.handlePrefabPlacement(prefabPath);
    });

    if (this.prefabItemsContainer) {
      this.prefabItemsContainer.appendChild(item);
    }
  }

  /**
   * Handles the placement of the given prefab at the camera's current position and rotation.
   * It instantiates the prefab using its path and marks the spawned object with
   * `userData.isSpawnedPrefab` for later interaction (e.g., object menu).
   * Includes error handling for instantiation.
   * @param prefabPath The path (string) of the RE.Prefab to instantiate.
   */
  private async handlePrefabPlacement(prefabPath: string) {
    if (!this.camera) {
      console.warn("Cannot place prefab: camera is missing.");
      return;
    }

    try {
      const instance = await RE.Prefab.instantiate(prefabPath);
      instance.remove();

      if (!instance) {
        console.error(`Failed to instantiate prefab from path: ${prefabPath}. Object will not be spawned.`);
        return;
      }

      // Add to scene first, so its transformations are relative to the world
      //RE.Runtime.scene.add(instance);

      // Set position and rotation directly in world coordinates to match the camera
      // Calculate position slightly in front of the camera in world coordinates
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);
      const spawnPosition = new THREE.Vector3().copy(this.camera.position).add(cameraDirection.multiplyScalar(this.prefabSpawnDistance));
      
      instance.position.copy(spawnPosition); // Set world position

      instance.scale.set(10, 10, 10); // Default scale, can be adjusted or made a prop

      // Mark the root of the prefab
      instance.userData.isPrefabRoot = true;

      // Mark all children as part of a spawned prefab for raycasting purposes
      instance.traverse(child => {
        child.userData.isSpawnedPrefab = true;
      });

      const uuid = instance.uuid;
      AssetManager.prefabMap.set(uuid, {
        path: prefabPath,
        position: instance.position.clone(),
        rotation: instance.rotation.clone(),
        scale: instance.scale.clone(),
        renderDistance: 10000,
        isHidden: false,
        isDeleted: false
      });

      this.spawnedPrefabs.set(instance.uuid, instance);
      this.updateSpawnedPrefabsList();

      // Automatically select and show UI
      AM_UI.selectedObject = instance;
      if (!AM_UI.objectMenuContainerElement) {
        AM_UI.createObjectMenuUI();
      }
      if (AM_UI.objectMenuContainerElement) {
        AM_UI.objectMenuContainerElement.style.display = 'flex';
      }
      this.updateTransformInputs();
      instance.remove();

      console.log(`Spawned prefab from path "${prefabPath}" at camera location.`);
    } catch (error) {
      console.error(`Error spawning prefab from path ${prefabPath}:`, error);
      if (error instanceof Error) {
        console.error("SecurityError during prefab instantiation. This might be due to user exiting pointer lock or browser security restrictions.");
      }
    }
  }

  public updateTransformInputs() {
    if (!AM_UI.selectedObject) return;

    // Update position
    if (AM_UI.positionXInput) AM_UI.positionXInput.value = AM_UI.selectedObject.position.x.toFixed(2);
    if (AM_UI.positionYInput) AM_UI.positionYInput.value = AM_UI.selectedObject.position.y.toFixed(2);
    if (AM_UI.positionZInput) AM_UI.positionZInput.value = AM_UI.selectedObject.position.z.toFixed(2);

    // Update rotation
    if (AM_UI.rotationXInput) AM_UI.rotationXInput.value = THREE.MathUtils.radToDeg(AM_UI.selectedObject.rotation.x).toFixed(2);
    if (AM_UI.rotationYInput) AM_UI.rotationYInput.value = THREE.MathUtils.radToDeg(AM_UI.selectedObject.rotation.y).toFixed(2);
    if (AM_UI.rotationZInput) AM_UI.rotationZInput.value = THREE.MathUtils.radToDeg(AM_UI.selectedObject.rotation.z).toFixed(2);

    // Update scale
    if (AM_UI.scaleXInput) AM_UI.scaleXInput.value = AM_UI.selectedObject.scale.x.toFixed(2);
    if (AM_UI.scaleYInput) AM_UI.scaleYInput.value = AM_UI.selectedObject.scale.y.toFixed(2);
    if (AM_UI.scaleZInput) AM_UI.scaleZInput.value = AM_UI.selectedObject.scale.z.toFixed(2);

    // Update render distance
    const renderDistanceInput = document.querySelector<HTMLInputElement>('#render-distance');
    if (renderDistanceInput) {
      const entry = AssetManager.prefabMap.get(AM_UI.selectedObject.uuid);
      renderDistanceInput.value = entry?.renderDistance?.toFixed(2) || '10000.00';
    }
  }

  public updateSpawnedPrefabsList() {
    if (!this.spawnedPrefabsContainer) return;

    this.spawnedPrefabsContainer.innerHTML = '';

    this.spawnedPrefabs.forEach((prefab, uuid) => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.gap = '5px';
      item.style.marginBottom = '5px';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = prefab.name || `Prefab ${uuid.slice(0, 6)}`;
      nameSpan.style.flexGrow = '1';
      nameSpan.style.cursor = 'pointer';
      nameSpan.style.textDecoration = 'underline';
      nameSpan.addEventListener('click', () => this.showObjectMenu(prefab));

      const tpButton = document.createElement('button');
      tpButton.textContent = 'TP';
      tpButton.style.padding = '2px 5px';
      tpButton.addEventListener('click', () => this.teleportCameraToObject(prefab));

      const deleteButton = document.createElement('button');
      deleteButton.textContent = 'X';
      deleteButton.style.padding = '2px 5px';
      deleteButton.addEventListener('click', () => {
        this.deleteSpawnedPrefab(uuid);
        this.updateSpawnedPrefabsList();
      });

      item.appendChild(nameSpan);
      item.appendChild(tpButton);
      item.appendChild(deleteButton);
      this.spawnedPrefabsContainer!.appendChild(item);
    });
  }

  private teleportCameraToObject(obj: THREE.Object3D) {
    if (!this.camera) return;
  
    this.camera.position.copy(obj.getWorldPosition(new THREE.Vector3()));
    this.camera.quaternion.copy(obj.getWorldQuaternion(new THREE.Quaternion()));
    this.targetQuaternion.copy(this.camera.quaternion);
  }

  public deleteSpawnedPrefab(uuid: string) {
    const prefab = this.spawnedPrefabs.get(uuid);
    if (prefab) {
      // Mark as deleted in prefabMap
      const entry = AssetManager.prefabMap.get(uuid);
      if (entry) entry.isDeleted = true;
      
      // Remove from scene and tracking
      RE.Runtime.scene.remove(prefab);
      this.spawnedPrefabs.delete(uuid);
      this.updateSpawnedPrefabsList();
    }
  }

  public static updatePrefabTransform(uuid: string, position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3) {
    const entry = this.prefabMap.get(uuid);
    if (entry) {
      entry.position.copy(position);
      entry.rotation.copy(rotation);
      entry.scale.copy(scale);
      this.prefabMap.set(uuid, entry);
    }
  }

  public static setRenderDistance(uuid: string, distance: number) {
    const entry = this.prefabMap.get(uuid);
    if (entry) {
      entry.renderDistance = distance;
      this.prefabMap.set(uuid, entry);
    }
    this.get().renderDistanceMap.set(uuid, distance);
  }

  protected originalStyles = new Map<HTMLElement, string>();

  private uiVisible = true;

  private toggleAllUI() {
    this.uiVisible = !this.uiVisible;

    const toggleElement = (element: HTMLElement | null) => {
      if (!element) return;
      
      if (this.uiVisible) {
        const original = this.originalStyles.get(element);
        element.style.display = original || '';
        this.originalStyles.delete(element);
      } else {
        this.originalStyles.set(element, element.style.display);
        element.style.display = 'none';
      }
    };

    // Toggle crosshair
    toggleElement(AM_UI.crosshairElement);
    
    // Toggle prefab lists
    if (this.prefabListContainer) {
      this.prefabListContainer.childNodes.forEach(child => {
        if (child instanceof HTMLElement) toggleElement(child);
      });
      toggleElement(this.prefabListContainer);
    }
    
    // Toggle save button
    toggleElement(AM_UI.saveButtonElement);
    
    // Toggle object menu
    toggleElement(AM_UI.objectMenuContainerElement);
  }

  public cleanupUI() {
    this.originalStyles.clear();
  }

  public onPrefabWheel(event: WheelEvent) {
    if (this.prefabItemsContainer && event.target instanceof Node && 
      this.prefabItemsContainer.contains(event.target)) {
      this.prefabItemsContainer.scrollTop += event.deltaY;
      event.preventDefault();
    }
    if (this.spawnedPrefabsContainer && event.target instanceof Node &&
      this.spawnedPrefabsContainer.contains(event.target)) {
      this.spawnedPrefabsContainer.scrollTop += event.deltaY;
      event.preventDefault();
    }
  }

  private showPrefab(prefab: THREE.Object3D) {
    AM_JsonLoader.showPrefab(prefab);
  }


  private showObjectMenu(prefab: THREE.Object3D) {
    AM_UI.selectedObject = prefab;
    if (!AM_UI.objectMenuContainerElement) {
      AM_UI.createObjectMenuUI();
    }
    if (AM_UI.objectMenuContainerElement) {
      AM_UI.objectMenuContainerElement.style.display = 'flex';
    }
    if (AM_UI.objectNameElement) {
      AM_UI.objectNameElement.textContent = `Selected: ${prefab.name || 'Unnamed Prefab'}`;
    }
    this.updateTransformInputs();
  }

  private getObjectHierarchy(object: THREE.Object3D): string {
    let hierarchy = '';
    let current: THREE.Object3D | null = object;
    while (current) {
      hierarchy = `${current.name} -> ${hierarchy}`;
      current = current.parent;
    }
    return hierarchy;
  }

  private initEventListeners() {
    const canvas = RE.Runtime.renderer.domElement;
    canvas.addEventListener('click', (e) => this.onLeftClick(e));
    console.log('Click listener registered');
  }

  public initialize() {
    this.createUIElements();
    this.initEventListeners();
  }

  private createUIElements() {
    // Existing UI creation logic from your initialization code
    this.createPrefabListUI();
    AM_UI.createObjectMenuUI();
    this.createSaveButton();
  }

  public saveSelectedPrefab() {
    if (AM_UI.selectedObject) {
      const uuid = AM_UI.selectedObject.uuid;
      const entry = AssetManager.prefabMap.get(uuid);
      if (entry) {
        entry.position.copy(AM_UI.selectedObject.position);
        entry.rotation.copy(AM_UI.selectedObject.rotation);
        entry.scale.copy(AM_UI.selectedObject.scale);
        AssetManager.prefabMap.set(uuid, entry);
      }
      AM_JsonLoader.savePrefabs();
    }
  }

  private startRenderDistanceCalculation() {
    // Start periodic checks for render distance
    setInterval(() => {
      if (this.camera) {
        AM_JsonLoader.updatePriorityQueue(this.camera.position);
      }
    }, 1000);
  }

  private updateCameras() {
    const now = performance.now();
    
    if (!RE.Runtime.scene || this.activeCameras.some(c => c?.isCamera)) return;

    // ... rest of the method remains the same ...
  }

  private initializeRenderSystem() {
    this.waitForCameras().then(() => {
      this.startDynamicSpawning();
    });
  }

  private async waitForCameras() {
    while (this.activeCameras.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
      this.updateCameras();
    }
  }

  private startDynamicSpawning() {
    if (this.spawnInterval) clearInterval(this.spawnInterval);
    
    const spawnLoop = () => {
      if (!this.activeCameras[0]) return;
      
      const cameraPos = this.activeCameras[0].position;
      AM_JsonLoader.updatePriorityQueue(cameraPos);
      const visiblePrefabs = AM_JsonLoader.getVisiblePrefabs(cameraPos, this.renderDistance);

      visiblePrefabs.forEach(prefabNode => {
        const prefab = this.prefabPool.find(p => p.uuid === prefabNode.metadata.id);
        if (prefab && !prefab.visible) {
          this.showPrefab(prefab);
        }
      });

      requestAnimationFrame(spawnLoop);
    };

    spawnLoop();
  }

  private async initPrefabSystem() {
    await AM_JsonLoader.loadPrefabs();
    AM_JsonLoader.startSpawningCycle(
      this.activeCameras,
      this.renderDistance,
      this.prefabPool
    );
  }
}
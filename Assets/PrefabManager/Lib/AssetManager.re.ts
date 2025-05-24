import * as RE from 'rogue-engine';
import * as THREE from 'three';
import AM_Handler from './AM_Handler.re'; 
import AM_JsonLoader from './AM_JsonLoader.re'; 

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
  @RE.props.num() renderDistance: number = 1000;

  public prefabListContainer: HTMLElement | null = null;
  public prefabItemsContainer: HTMLElement | null = null; 
  public spawnedPrefabsContainer: HTMLElement | null = null;
  public availablePrefabs: string[] = [];

  public isPointerLocked: boolean = false;
  public keysPressed: { [key: string]: boolean } = {};
  public pitch: number = 0;
  public yaw: number = 0;
  public targetQuaternion: THREE.Quaternion = new THREE.Quaternion();
  public tempVector: THREE.Vector3 = new THREE.Vector3();
  public tempEuler: THREE.Euler = new THREE.Euler(0, 0, 0, 'YXZ');
  public domElement: HTMLElement | null = null;
  public crosshairElement: HTMLDivElement | null = null;
  public isCrosshairVisible: boolean = false;
  public raycaster: THREE.Raycaster = new THREE.Raycaster();
  public objectMenuContainerElement: HTMLDivElement | null = null;
  public objectNameElement: HTMLDivElement | null = null;

  // UI elements for position, rotation, and scale
  public positionXInput: HTMLInputElement | null = null;
  public positionYInput: HTMLInputElement | null = null;
  public positionZInput: HTMLInputElement | null = null;
  public tpToCameraButton: HTMLButtonElement | null = null;

  public rotationXInput: HTMLInputElement | null = null;
  public rotationYInput: HTMLInputElement | null = null;
  public rotationZInput: HTMLInputElement | null = null;

  public scaleXInput: HTMLInputElement | null = null;
  public scaleYInput: HTMLInputElement | null = null;
  public scaleZInput: HTMLInputElement | null = null;

  public deleteButtonElement: HTMLButtonElement | null = null;
  public toggleHideButtonElement: HTMLButtonElement | null = null;
  public selectedObject: THREE.Object3D | null = null; // This will now always be the prefab root
  public excludedNamesArray: string[] = [];
  public cameraLocationDisplay: HTMLDivElement | null = null;
  public saveButtonElement: HTMLButtonElement | null = null;

  public onMouseMoveBound = this.onMouseMove.bind(this);
  public onKeyDownBound = this.onKeyDown.bind(this);
  public onKeyUpBound = this.onKeyUp.bind(this);
  public onPointerLockChangeBound = this.onPointerLockChange.bind(this);
  public onLeftClickBound = this.onLeftClick.bind(this);
  public onDeleteClickBound = this.onDeleteClick.bind(this);
  public onToggleHideClickBound = this.onToggleHideClick.bind(this);
  public onPositionInputChangeBound = this.onPositionInputChange.bind(this);
  public onRotationInputChangeBound = this.onRotationInputChange.bind(this);
  public onScaleInputChangeBound = this.onScaleInputChange.bind(this);
  public onTpToCameraClickBound = this.onTpToCameraClick.bind(this);
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
        this.createCrosshair();
        this.createObjectMenuUI();
        this.createSaveButton();
        this.createCameraLocationDisplay();
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

    await AM_JsonLoader.loadPrefabs();

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
   * Creates the crosshair UI element and appends it to the DOM.
   */
  private createCrosshair() {
    this.crosshairElement = document.createElement('div');
    this.crosshairElement.id = 'rogue-engine-crosshair';
    this.crosshairElement.style.position = 'absolute';
    this.crosshairElement.style.top = '50%';
    this.crosshairElement.style.left = '50%';
    this.crosshairElement.style.transform = 'translate(-50%, -50%)';
    this.crosshairElement.style.pointerEvents = 'none';
    this.crosshairElement.style.zIndex = '1000';
    this.crosshairElement.style.width = '2px';
    this.crosshairElement.style.height = '2px';
    this.crosshairElement.style.backgroundColor = 'transparent';

    const lineHeight = '5px';
    const lineThickness = '0.5px';
    const lineColor = 'white';

    this.crosshairElement.style.boxShadow = `
      0 ${lineHeight} 0 ${lineThickness} ${lineColor},
      0 -${lineHeight} 0 ${lineThickness} ${lineColor},
      ${lineHeight} 0 0 ${lineThickness} ${lineColor},
      -${lineHeight} 0 0 ${lineThickness} ${lineColor}
    `;

    if (this.domElement) {
      this.domElement.appendChild(this.crosshairElement);
    }
  }

  /**
   * Sets the visibility of the crosshair element.
   * @param visible True to show the crosshair, false to hide it.
   */
  private setCrosshairVisibility(visible: boolean) {
    if (this.crosshairElement) {
      this.crosshairElement.style.display = visible ? 'block' : 'none';
      this.isCrosshairVisible = visible;
    }
  }

  /**
   * Helper to create a styled input field.
   * @param id The ID for the input.
   * @param onInputChange The event listener for input changes.
   * @returns The created HTMLInputElement.
   */
  private createStyledInputField(id: string, onInputChange: (event: Event) => void): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text'; // Use 'text' to remove arrows
    input.autocomplete = 'off'; // Disable autocompletion
    input.id = id;
    input.style.width = '60px'; // Adjusted width for inline layout
    input.style.padding = '5px';
    input.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    input.style.color = 'white';
    input.style.border = '1px solid rgba(255, 255, 255, 0.3)';
    input.style.borderRadius = '4px';
    input.style.textAlign = 'center';
    // Use setProperty for vendor-prefixed properties and to avoid TS errors
    (input.style as any).MozAppearance = 'textfield';
    (input.style as any).WebkitAppearance = 'none';
    input.style.appearance = 'none'; // Standard arrow removal

    // Remove spin buttons in Chrome, Safari, Edge
    input.style.setProperty('-webkit-outer-spin-button', 'none', 'important');
    input.style.setProperty('-webkit-inner-spin-button', 'none', 'important');

    input.addEventListener('input', onInputChange);
    // Allow Ctrl+A to select all
    input.addEventListener('keydown', (e) => {
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        input.select();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); // Prevent page scroll
        const currentValue = parseFloat(input.value);
        let step = 1;
        if (e.shiftKey) step = 10;
        if (e.altKey) step = 0.1;

        if (!isNaN(currentValue)) {
          const newValue = e.key === 'ArrowUp' ? currentValue + step : currentValue - step;
          input.value = newValue.toFixed(2);
          onInputChange(new Event('input')); // Trigger update
        }
      }
    });
    input.onfocus = () => { input.select(); }; // Select all text on focus

    return input;
  }

  /**
   * Creates a group of X, Y, Z input fields on a single line.
   * @param titleText The title for the group (e.g., "Position", "Rotation", "Scale").
   * @param onInputChange The event listener for changes in any of the group's inputs.
   * @param includeTpButton If true, adds a "TP to Camera" button (only for Position).
   * @returns An object containing the container and references to the X, Y, Z inputs.
   */
  private createVector3InputGroup(titleText: string, onInputChange: (event: Event) => void, includeTpButton: boolean = false) {
    const groupContainer = document.createElement('div');
    groupContainer.style.width = '100%';
    groupContainer.style.marginBottom = '5px'; // Reduced margin
    groupContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    groupContainer.style.padding = '8px'; // Reduced padding
    groupContainer.style.borderRadius = '5px';

    const title = document.createElement('div');
    title.textContent = titleText;
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '5px'; // Reduced margin
    groupContainer.appendChild(title);

    const inputsWrapper = document.createElement('div');
    inputsWrapper.style.display = 'flex';
    inputsWrapper.style.justifyContent = 'space-between';
    inputsWrapper.style.alignItems = 'center';
    inputsWrapper.style.gap = '8px'; // Reduced gap between X, Y, Z sections
    groupContainer.appendChild(inputsWrapper); // Corrected: use groupContainer here

    const createAxisInput = (axis: string, id: string) => {
      const axisContainer = document.createElement('div');
      axisContainer.style.display = 'flex';
      axisContainer.style.alignItems = 'center';
      axisContainer.style.gap = '2px';

      const label = document.createElement('span');
      label.textContent = `${axis}:`;
      label.style.fontSize = '12px';
      axisContainer.appendChild(label);

      const input = this.createStyledInputField(id, onInputChange);
      axisContainer.appendChild(input);
      return { container: axisContainer, input: input };
    };

    const xField = createAxisInput('X', `${titleText.toLowerCase()}X`);
    const yField = createAxisInput('Y', `${titleText.toLowerCase()}Y`);
    const zField = createAxisInput('Z', `${titleText.toLowerCase()}Z`);

    inputsWrapper.appendChild(xField.container);
    inputsWrapper.appendChild(yField.container);
    inputsWrapper.appendChild(zField.container);

    let tpButton: HTMLButtonElement | null = null;
    if (includeTpButton) {
      tpButton = document.createElement('button');
      tpButton.textContent = 'TP to Camera';
      tpButton.style.padding = '5px 8px'; // Reduced padding for button
      tpButton.style.backgroundColor = '#28a745'; // Green color
      tpButton.style.color = 'white';
      tpButton.style.border = 'none';
      tpButton.style.borderRadius = '4px';
      tpButton.style.cursor = 'pointer';
      tpButton.style.fontSize = '11px'; // Slightly smaller font
      tpButton.style.marginTop = '8px'; // Space below inputs
      tpButton.addEventListener('click', this.onTpToCameraClickBound);
      groupContainer.appendChild(tpButton);
      groupContainer.style.display = 'flex';
      groupContainer.style.flexDirection = 'column';
      groupContainer.style.alignItems = 'flex-start';
    }

    return {
      groupContainer,
      xInput: xField.input,
      yInput: yField.input,
      zInput: zField.input,
      tpButton: tpButton
    };
  }


  /**
   * Creates the UI elements for the object interaction menu (delete, hide/show, and transforms).
   */
  private createObjectMenuUI() {
    // Cleanup existing UI first
    if (this.objectMenuContainerElement) {
      this.objectMenuContainerElement.innerHTML = '';
      if (this.domElement && this.objectMenuContainerElement.parentNode === this.domElement) {
        this.domElement.removeChild(this.objectMenuContainerElement);
      }
      this.objectMenuContainerElement = null;
    }

    this.objectMenuContainerElement = document.createElement('div');
    this.objectMenuContainerElement.id = 'rogue-engine-object-menu';
    this.objectMenuContainerElement.style.position = 'fixed';
    this.objectMenuContainerElement.style.right = '20px';
    this.objectMenuContainerElement.style.top = '20px';
    this.objectMenuContainerElement.style.pointerEvents = 'auto';
    this.objectMenuContainerElement.style.zIndex = '1001';
    this.objectMenuContainerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.objectMenuContainerElement.style.color = 'white';
    this.objectMenuContainerElement.style.padding = '15px';
    this.objectMenuContainerElement.style.borderRadius = '8px';
    this.objectMenuContainerElement.style.fontFamily = 'sans-serif';
    this.objectMenuContainerElement.style.fontSize = '14px';
    this.objectMenuContainerElement.style.display = 'none';
    this.objectMenuContainerElement.style.flexDirection = 'column';
    this.objectMenuContainerElement.style.gap = '10px';
    this.objectMenuContainerElement.style.minWidth = '300px';
    this.objectMenuContainerElement.style.backdropFilter = 'blur(5px)';
    this.objectMenuContainerElement.addEventListener('click', (e) => e.stopPropagation());

    const title = document.createElement('div');
    title.id = 'object-menu-title';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    title.textContent = 'Selected: None'; // Add initial placeholder
    this.objectNameElement = title; // Store reference
    this.objectMenuContainerElement.appendChild(title);

    const separator1 = document.createElement('hr');
    separator1.style.width = '100%';
    separator1.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    separator1.style.margin = '8px 0'; // Reduced margin
    this.objectMenuContainerElement.appendChild(separator1);

    // Position inputs
    const positionGroup = this.createVector3InputGroup('Position', this.onPositionInputChangeBound, true); // true for TP button
    this.objectMenuContainerElement.appendChild(positionGroup.groupContainer);
    this.positionXInput = positionGroup.xInput;
    this.positionYInput = positionGroup.yInput;
    this.positionZInput = positionGroup.zInput;
    this.tpToCameraButton = positionGroup.tpButton;


    // Rotation inputs
    const rotationGroup = this.createVector3InputGroup('Rotation (Deg)', this.onRotationInputChangeBound);
    this.objectMenuContainerElement.appendChild(rotationGroup.groupContainer);
    this.rotationXInput = rotationGroup.xInput;
    this.rotationYInput = rotationGroup.yInput;
    this.rotationZInput = rotationGroup.zInput;

    // Scale inputs
    const scaleGroup = this.createVector3InputGroup('Scale', this.onScaleInputChangeBound);
    this.objectMenuContainerElement.appendChild(scaleGroup.groupContainer);
    this.scaleXInput = scaleGroup.xInput;
    this.scaleYInput = scaleGroup.yInput;
    this.scaleZInput = scaleGroup.zInput;

    // Render Distance input
    const renderDistanceGroup = this.createRenderDistanceInput();
    this.objectMenuContainerElement.appendChild(renderDistanceGroup);

    const separator2 = document.createElement('hr');
    separator2.style.width = '100%';
    separator2.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    separator2.style.margin = '8px 0'; // Reduced margin
    this.objectMenuContainerElement.appendChild(separator2);

    this.deleteButtonElement = document.createElement('button');
    this.deleteButtonElement.textContent = 'Delete Object';
    this.styleButton(this.deleteButtonElement, '#e74c3c');
    this.deleteButtonElement.addEventListener('click', this.onDeleteClickBound);
    this.objectMenuContainerElement.appendChild(this.deleteButtonElement);

    this.toggleHideButtonElement = document.createElement('button');
    this.toggleHideButtonElement.textContent = 'Toggle Hide';
    this.styleButton(this.toggleHideButtonElement, '#3498db');
    this.toggleHideButtonElement.addEventListener('click', this.onToggleHideClickBound);
    this.objectMenuContainerElement.appendChild(this.toggleHideButtonElement);

    const savePrefabButton = this.createButton('Save Prefab', () => this.saveSelectedPrefab());
    this.objectMenuContainerElement.appendChild(savePrefabButton);

    if (this.domElement) {
      this.domElement.appendChild(this.objectMenuContainerElement);
    }
  }

  private createRenderDistanceInput() {
    const container = document.createElement('div');
    container.style.margin = '10px 0';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '10px';

    const label = document.createElement('label');
    label.textContent = 'Render Distance:';
    label.style.fontWeight = 'bold';
    label.style.color = '#ffffff';
    container.appendChild(label);

    const input = this.createStyledInputField('render-distance', (e) => {
      this.onRenderDistanceChange(e);
    });
    input.type = 'number';
    input.step = '0.1';
    input.style.margin = '0';
    input.style.width = '120px';
    container.appendChild(input);

    return container;
  }

  private onRenderDistanceChange(event: Event) {
    if (!this.selectedObject) return;
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value);
    AssetManager.setRenderDistance(this.selectedObject.uuid, value);
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
    this.styleButton(button, '#4CAF50');
    button.addEventListener('click', () => AM_JsonLoader.savePrefabs());
    if (this.domElement) {
      this.domElement.appendChild(button);
    }
    this.saveButtonElement = button;
    return button;
  }

  /**
   * Creates and appends the camera location display UI element.
   */
  private createCameraLocationDisplay() {
    this.cameraLocationDisplay = document.createElement('div');
    this.cameraLocationDisplay.id = 'rogue-engine-camera-location';
    this.cameraLocationDisplay.style.position = 'fixed';
    this.cameraLocationDisplay.style.bottom = '10px';
    this.cameraLocationDisplay.style.left = '10px';
    this.cameraLocationDisplay.style.pointerEvents = 'none';
    this.cameraLocationDisplay.style.zIndex = '1000';
    this.cameraLocationDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.cameraLocationDisplay.style.color = 'white';
    this.cameraLocationDisplay.style.padding = '8px 12px';
    this.cameraLocationDisplay.style.borderRadius = '5px';
    this.cameraLocationDisplay.style.fontFamily = 'monospace';
    this.cameraLocationDisplay.style.fontSize = '12px';
    this.cameraLocationDisplay.style.backdropFilter = 'blur(3px)';
  }

  /**
   * Updates the displayed camera location in the UI.
   */
  private updateCameraLocationDisplay() {
    if (this.camera && this.cameraLocationDisplay) {
      const pos = this.camera.position;
      this.cameraLocationDisplay.textContent = `X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`;
    }
  }

  /**
   * Applies common styles to a given HTML button element.
   * @param button The button element to style.
   * @param backgroundColor The background color for the button.
   */
  private styleButton(button: HTMLButtonElement, backgroundColor: string) {
    button.style.display = 'block';
    button.style.width = 'auto';
    button.style.padding = '8px 16px';
    button.style.minWidth = '140px';
    button.style.maxWidth = '200px';
    button.style.backgroundColor = backgroundColor;
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '13px';
    button.style.textAlign = 'center';
    button.style.transition = 'background-color 0.2s';

    button.addEventListener('mouseover', () => {
      button.style.backgroundColor = '#555';
    });
    button.addEventListener('mouseout', () => {
      button.style.backgroundColor = backgroundColor;
    });
  }

  private createButton(text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.padding = '8px 16px';
    button.style.minWidth = '140px';
    button.style.maxWidth = '200px';
    button.style.borderRadius = '4px';
    this.styleButton(button, '#4CAF50');
    button.addEventListener('click', onClick);
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
      this.setCrosshairVisibility(!this.isCrosshairVisible);
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
        this.selectedObject = prefabRoot; // Select the root of the prefab
        this.showObjectMenu(prefabRoot);
        this.updateTransformInputs();
      } else {
        // If a spawned part was hit but no identifiable prefab root, hide menu
        if (this.objectMenuContainerElement) {
          this.objectMenuContainerElement.style.display = 'none';
        }
        this.selectedObject = null;
      }
    } else {
      // If no valid object is hit, hide the object menu
      if (this.objectMenuContainerElement) {
        this.objectMenuContainerElement.style.display = 'none';
        this.selectedObject = null;
      }
    }
  }

  /**
   * Handles right-click events for object selection without pointer lock
   */
  private onRightClick(event: MouseEvent) {
    event.preventDefault();

    if (!this.camera || !this.objectMenuContainerElement) return;

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
        this.selectedObject = prefabRoot;
        this.showObjectMenu(prefabRoot);
        this.updateTransformInputs();
        
        // Position menu at click location for right-click
        if (this.objectMenuContainerElement) {
          this.objectMenuContainerElement.style.left = `${event.clientX}px`;
          this.objectMenuContainerElement.style.top = `${event.clientY}px`;
        }
      }
    } else {
      this.objectMenuContainerElement.style.display = 'none';
      this.selectedObject = null;
    }
  }

  /**
   * Updates object menu transform values from a selected object
   */
  private updateObjectMenuTransformValues(object: THREE.Object3D) {
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    object.getWorldPosition(worldPosition);
    object.getWorldQuaternion(worldQuaternion);
    object.getWorldScale(worldScale);
    const worldRotation = new THREE.Euler().setFromQuaternion(worldQuaternion);

    if (this.objectNameElement) {
      this.objectNameElement.textContent = `Object: ${object.name || "[Unnamed]"}`;
    }

    // Update position inputs
    if (this.positionXInput) this.positionXInput.value = worldPosition.x.toFixed(2);
    if (this.positionYInput) this.positionYInput.value = worldPosition.y.toFixed(2);
    if (this.positionZInput) this.positionZInput.value = worldPosition.z.toFixed(2);

    // Update rotation inputs
    if (this.rotationXInput) this.rotationXInput.value = THREE.MathUtils.radToDeg(worldRotation.x).toFixed(2);
    if (this.rotationYInput) this.rotationYInput.value = THREE.MathUtils.radToDeg(worldRotation.y).toFixed(2);
    if (this.rotationZInput) this.rotationZInput.value = THREE.MathUtils.radToDeg(worldRotation.z).toFixed(2);

    // Update scale inputs
    if (this.scaleXInput) this.scaleXInput.value = worldScale.x.toFixed(2);
    if (this.scaleYInput) this.scaleYInput.value = worldScale.y.toFixed(2);
    if (this.scaleZInput) this.scaleZInput.value = worldScale.z.toFixed(2);

    if (this.toggleHideButtonElement) {
      this.toggleHideButtonElement.textContent = object.visible ? 'Hide Object' : 'Show Object';
    }
  }

  /**
   * Helper to set object's world position from UI inputs.
   * This is crucial for handling objects that might have parents.
   * @param object The THREE.Object3D to modify.
   * @param x The desired X world coordinate.
   * @param y The desired Y world coordinate.
   * @param z The desired Z world coordinate.
   */
  private setObjectWorldPosition(object: THREE.Object3D, x: number, y: number, z: number) {
    const newWorldPosition = new THREE.Vector3(x, y, z);
    if (object.parent) {
        // Convert world position to local position relative to parent
        object.parent.worldToLocal(newWorldPosition);
    }
    object.position.copy(newWorldPosition);
    object.updateMatrixWorld(true); // Ensure world matrix is updated immediately
  }

  /**
   * Helper to set object's world rotation from UI inputs (degrees).
   * @param object The THREE.Object3D to modify.
   * @param xDeg The desired X world rotation in degrees.
   * @param yDeg The desired Y world rotation in degrees.
   * @param zDeg The desired Z world rotation in degrees.
   */
  private setObjectWorldRotation(object: THREE.Object3D, xDeg: number, yDeg: number, zDeg: number) {
    const newWorldEuler = new THREE.Euler(
        THREE.MathUtils.degToRad(xDeg),
        THREE.MathUtils.degToRad(yDeg),
        THREE.MathUtils.degToRad(zDeg),
        'YXZ' // Or 'XYZ' depending on desired rotation order
    );
    const newWorldQuaternion = new THREE.Quaternion().setFromEuler(newWorldEuler);

    if (object.parent) {
        // Get parent's world inverse quaternion
        const parentWorldQuaternionInverse = object.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        // Calculate local quaternion
        newWorldQuaternion.premultiply(parentWorldQuaternionInverse);
    }
    object.quaternion.copy(newWorldQuaternion);
    object.updateMatrixWorld(true);
  }

  /**
   * Helper to set object's world scale from UI inputs.
   * This is more complex if parents have non-uniform scale.
   * For simplicity, this assumes direct children of the scene or parents with uniform scale.
   * @param object The THREE.Object3D to modify.
   * @param x The desired X world scale.
   * @param y The desired Y world scale.
   * @param z The desired Z world scale.
   */
  private setObjectWorldScale(object: THREE.Object3D, x: number, y: number, z: number) {
      const currentWorldScale = new THREE.Vector3();
      object.getWorldScale(currentWorldScale);

      // Calculate ratios of desired world scale to current world scale
      const ratioX = x / currentWorldScale.x;
      const ratioY = y / currentWorldScale.y;
      const ratioZ = z / currentWorldScale.z;

      // Apply these ratios to the local scale
      object.scale.x *= ratioX;
      object.scale.y *= ratioY;
      object.scale.z *= ratioZ;
      object.updateMatrixWorld(true);
  }


  /**
   * Handles changes in the position input fields.
   */
  private onPositionInputChange() {
    if (this.selectedObject) {
      const xValue = this.positionXInput?.value;
      const yValue = this.positionYInput?.value;
      const zValue = this.positionZInput?.value;

      this.setObjectWorldPosition(
        this.selectedObject,
        parseFloat(xValue!),
        parseFloat(yValue!),
        parseFloat(zValue!)
      );
      AssetManager.updatePrefabTransform(
        this.selectedObject.uuid,
        this.selectedObject.position,
        this.selectedObject.rotation,
        this.selectedObject.scale
      );
    }
  }

  /**
   * Handles changes in the rotation input fields.
   */
  private onRotationInputChange() {
    if (this.selectedObject) {
      this.setObjectWorldRotation(
        this.selectedObject,
        parseFloat(this.rotationXInput!.value),
        parseFloat(this.rotationYInput!.value),
        parseFloat(this.rotationZInput!.value)
      );
      AssetManager.updatePrefabTransform(
        this.selectedObject.uuid,
        this.selectedObject.position,
        this.selectedObject.rotation,
        this.selectedObject.scale
      );
    }
  }

  /**
   * Handles changes in the scale input fields.
   */
  private onScaleInputChange() {
    if (this.selectedObject) {
      const xValue = this.scaleXInput?.value;
      const yValue = this.scaleYInput?.value;
      const zValue = this.scaleZInput?.value;

      this.setObjectWorldScale(
        this.selectedObject,
        parseFloat(xValue!),
        parseFloat(yValue!),
        parseFloat(zValue!)
      );
      AssetManager.updatePrefabTransform(
        this.selectedObject.uuid,
        this.selectedObject.position,
        this.selectedObject.rotation,
        this.selectedObject.scale
      );
    }
  }

  /**
   * Handles the "TP to Camera" button click event.
   */
  private onTpToCameraClick() {
    if (this.selectedObject && this.camera && this.positionXInput && this.positionYInput && this.positionZInput) {
      // Set object's world position to camera's world position
      this.setObjectWorldPosition(this.selectedObject, this.camera.position.x, this.camera.position.y, this.camera.position.z);
      // Also match the object's world rotation to the camera's world rotation

      // Update the UI input fields to reflect the new *world* transform values after the update
      const worldPosition = new THREE.Vector3();
      const worldQuaternion = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      this.selectedObject.getWorldPosition(worldPosition);
      this.selectedObject.getWorldQuaternion(worldQuaternion);
      this.selectedObject.getWorldScale(worldScale);
      const worldRotation = new THREE.Euler().setFromQuaternion(worldQuaternion);

      if (this.positionXInput) this.positionXInput.value = worldPosition.x.toFixed(2);
      if (this.positionYInput) this.positionYInput.value = worldPosition.y.toFixed(2);
      if (this.positionZInput) this.positionZInput.value = worldPosition.z.toFixed(2);

      if (this.rotationXInput) this.rotationXInput.value = THREE.MathUtils.radToDeg(worldRotation.x).toFixed(2);
      if (this.rotationYInput) this.rotationYInput.value = THREE.MathUtils.radToDeg(worldRotation.y).toFixed(2);
      if (this.rotationZInput) this.rotationZInput.value = THREE.MathUtils.radToDeg(worldRotation.z).toFixed(2);

      // Update prefabMap
      const entry = AssetManager.prefabMap.get(this.selectedObject.uuid);
      if (entry) {
        entry.position.copy(this.selectedObject.position);
        entry.rotation.copy(this.selectedObject.rotation);
        entry.scale.copy(this.selectedObject.scale);
        AssetManager.prefabMap.set(this.selectedObject.uuid, entry);
      }
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
   * Handles the click event for the delete object button.
   */
  private onDeleteClick() {
    this.deleteSelectedObject();
  }

  private deleteSelectedObject() {
    if (this.selectedObject) {
      // Find and remove from spawnedPrefabs
      for (const [uuid, prefab] of this.spawnedPrefabs) {
        if (prefab === this.selectedObject) {
          this.deleteSpawnedPrefab(uuid);
          break;
        }
      }
      if (this.objectMenuContainerElement) {
        this.objectMenuContainerElement.style.display = 'none';
      }
      this.selectedObject = null;
    }
  }

  /**
   * Handles the click event for the toggle hide/show object button.
   */
  private onToggleHideClick() {
    if (this.selectedObject) {
      const uuid = this.selectedObject.uuid;
      const entry = AssetManager.prefabMap.get(uuid);
      if (entry) {
        entry.isHidden = !entry.isHidden;
      }
      this.selectedObject.visible = !entry!.isHidden;
      if (this.toggleHideButtonElement) {
        this.toggleHideButtonElement.textContent = this.selectedObject.visible ? 'Hide Object' : 'Show Object';
      }
    }
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

  /**
   * Called every frame to update camera movement and rotation.
   */
  public update() {
    if (!this.camera || !this.isPointerLocked) {
      this.updateCameraLocationDisplay();
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
    this.updateCameraLocationDisplay();
    this.updatePrefabVisibility();
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

      if (!instance) {
        console.error(`Failed to instantiate prefab from path: ${prefabPath}. Object will not be spawned.`);
        return;
      }

      // Add to scene first, so its transformations are relative to the world
      RE.Runtime.scene.add(instance);

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
      this.selectedObject = instance;
      if (!this.objectMenuContainerElement) {
        this.createObjectMenuUI();
      }
      if (this.objectMenuContainerElement) {
        this.objectMenuContainerElement.style.display = 'flex';
      }
      this.updateTransformInputs();

      console.log(`Spawned prefab from path "${prefabPath}" at camera location.`);
    } catch (error) {
      console.error(`Error spawning prefab from path ${prefabPath}:`, error);
      if (error instanceof Error) {
        console.error("SecurityError during prefab instantiation. This might be due to user exiting pointer lock or browser security restrictions.");
      }
    }
  }

  public updateTransformInputs() {
    if (!this.selectedObject) return;

    // Update position
    if (this.positionXInput) this.positionXInput.value = this.selectedObject.position.x.toFixed(2);
    if (this.positionYInput) this.positionYInput.value = this.selectedObject.position.y.toFixed(2);
    if (this.positionZInput) this.positionZInput.value = this.selectedObject.position.z.toFixed(2);

    // Update rotation
    if (this.rotationXInput) this.rotationXInput.value = THREE.MathUtils.radToDeg(this.selectedObject.rotation.x).toFixed(2);
    if (this.rotationYInput) this.rotationYInput.value = THREE.MathUtils.radToDeg(this.selectedObject.rotation.y).toFixed(2);
    if (this.rotationZInput) this.rotationZInput.value = THREE.MathUtils.radToDeg(this.selectedObject.rotation.z).toFixed(2);

    // Update scale
    if (this.scaleXInput) this.scaleXInput.value = this.selectedObject.scale.x.toFixed(2);
    if (this.scaleYInput) this.scaleYInput.value = this.selectedObject.scale.y.toFixed(2);
    if (this.scaleZInput) this.scaleZInput.value = this.selectedObject.scale.z.toFixed(2);

    // Update render distance
    const renderDistanceInput = document.querySelector<HTMLInputElement>('#render-distance');
    if (renderDistanceInput) {
      const entry = AssetManager.prefabMap.get(this.selectedObject.uuid);
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

  private deleteSpawnedPrefab(uuid: string) {
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
    toggleElement(this.crosshairElement);
    
    // Toggle prefab lists
    if (this.prefabListContainer) {
      this.prefabListContainer.childNodes.forEach(child => {
        if (child instanceof HTMLElement) toggleElement(child);
      });
      toggleElement(this.prefabListContainer);
    }
    
    // Toggle save button
    toggleElement(this.saveButtonElement);
    
    // Toggle object menu
    toggleElement(this.objectMenuContainerElement);
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

  private showObjectMenu(prefab: THREE.Object3D) {
    this.selectedObject = prefab;
    if (!this.objectMenuContainerElement) {
      this.createObjectMenuUI();
    }
    if (this.objectMenuContainerElement) {
      this.objectMenuContainerElement.style.display = 'flex';
    }
    if (this.objectNameElement) {
      this.objectNameElement.textContent = `Selected: ${prefab.name || 'Unnamed Prefab'}`;
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
    this.createObjectMenuUI();
    this.createSaveButton();
  }

  private saveSelectedPrefab() {
    if (this.selectedObject) {
      const uuid = this.selectedObject.uuid;
      const entry = AssetManager.prefabMap.get(uuid);
      if (entry) {
        entry.position.copy(this.selectedObject.position);
        entry.rotation.copy(this.selectedObject.rotation);
        entry.scale.copy(this.selectedObject.scale);
        AssetManager.prefabMap.set(uuid, entry);
      }
      AM_JsonLoader.savePrefabs();
    }
  }

  private startRenderDistanceCalculation() {
    // Start periodic checks for render distance
    setInterval(() => {
      if (this.camera) {
        AM_Handler.updateRenderDistances(this.camera.position);
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
    this.spawnInterval = setInterval(() => {
      if (!this.activeCameras[0]) return;
      
      const cameraPos = this.activeCameras[0].position;
      this.prefabPool.forEach(prefab => {
        if (!prefab.visible && this.isInRenderDistance(prefab.position, cameraPos)) {
          this.showPrefab(prefab);
        }
      });
    }, this.updateInterval);
  }

  private isInRenderDistance(pos1: THREE.Vector3, pos2: THREE.Vector3) {
    return pos1.distanceTo(pos2) < this.renderDistance;
  }

  private showPrefab(prefab: THREE.Object3D) {
    prefab.visible = true;
    RE.Runtime.scene.add(prefab);
  }

  private hidePrefab(prefab: THREE.Object3D) {
    prefab.visible = false;
    RE.Runtime.scene.remove(prefab);
  }
}
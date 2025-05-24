import * as RE from 'rogue-engine';
import * as THREE from 'three';
import AssetManager from './AssetManager.re';

@RE.registerComponent
export default class AM_UI extends RE.Component {

  static crosshairElement: HTMLDivElement | null = null;
  static isCrosshairVisible: boolean = false;
  static objectMenuContainerElement: HTMLDivElement | null = null;
  static objectNameElement: HTMLDivElement | null = null;
    // UI elements for position, rotation, and scale
    static positionXInput: HTMLInputElement | null = null;
    static positionYInput: HTMLInputElement | null = null;
    static positionZInput: HTMLInputElement | null = null;
    static tpToCameraButton: HTMLButtonElement | null = null;
  
    static rotationXInput: HTMLInputElement | null = null;
    static rotationYInput: HTMLInputElement | null = null;
    static rotationZInput: HTMLInputElement | null = null;
  
    static scaleXInput: HTMLInputElement | null = null;
    static scaleYInput: HTMLInputElement | null = null;
    static scaleZInput: HTMLInputElement | null = null;

    static onPositionInputChangeBound = AM_UI.onPositionInputChange.bind(AM_UI);
    static onRotationInputChangeBound = AM_UI.onRotationInputChange.bind(AM_UI);
    static onScaleInputChangeBound = AM_UI.onScaleInputChange.bind(AM_UI);

    static selectedObject: THREE.Object3D | null = null; // This will now always be the prefab root

    static onTpToCameraClickBound = AM_UI.onTpToCameraClick.bind(AM_UI);

    static deleteButtonElement: HTMLButtonElement | null = null;
    static toggleHideButtonElement: HTMLButtonElement | null = null;
    static cameraLocationDisplay: HTMLDivElement | null = null;
    static saveButtonElement: HTMLButtonElement | null = null;
    static onDeleteClickBound = AM_UI.onDeleteClick.bind(AM_UI);
    static onToggleHideClickBound = AM_UI.onToggleHideClick.bind(AM_UI);




  /**
   * Creates the crosshair UI element and appends it to the DOM.
   */
  static createCrosshair() {
    const pm = AssetManager.get();
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

    if (pm.domElement) {
      pm.domElement.appendChild(this.crosshairElement);
    }
  }

    /**
   * Sets the visibility of the crosshair element.
   * @param visible True to show the crosshair, false to hide it.
   */
    static setCrosshairVisibility(visible: boolean) {
      if (this.crosshairElement) {
        this.crosshairElement.style.display = visible ? 'block' : 'none';
        this.isCrosshairVisible = visible;
      }
    }


      /**
   * Creates the UI elements for the object interaction menu (delete, hide/show, and transforms).
   */
  static createObjectMenuUI() {
    // Cleanup existing UI first
    if (this.objectMenuContainerElement) {
      this.objectMenuContainerElement.innerHTML = '';
      if (AssetManager.get().domElement && this.objectMenuContainerElement.parentNode === AssetManager.get().domElement) {
        AssetManager.get().domElement!.removeChild(this.objectMenuContainerElement);
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
    this.deleteButtonElement.addEventListener('click', AM_UI.onDeleteClickBound);
    this.objectMenuContainerElement.appendChild(this.deleteButtonElement);

    this.toggleHideButtonElement = document.createElement('button');
    this.toggleHideButtonElement.textContent = 'Toggle Hide';
    this.styleButton(this.toggleHideButtonElement, '#3498db');
    this.toggleHideButtonElement.addEventListener('click', AM_UI.onToggleHideClickBound);
    this.objectMenuContainerElement.appendChild(this.toggleHideButtonElement);

    const savePrefabButton = this.createButton('Save Prefab', () => AssetManager.get().saveSelectedPrefab());
    this.objectMenuContainerElement.appendChild(savePrefabButton);

    if (AssetManager.get().domElement) {
      AssetManager.get().domElement!.appendChild(this.objectMenuContainerElement);
    }
  }


    /**
   * Applies common styles to a given HTML button element.
   * @param button The button element to style.
   * @param backgroundColor The background color for the button.
   */
    static styleButton(button: HTMLButtonElement, backgroundColor: string) {
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
  
    static createButton(text: string, onClick: () => void): HTMLButtonElement {
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
   * Creates a group of X, Y, Z input fields on a single line.
   * @param titleText The title for the group (e.g., "Position", "Rotation", "Scale").
   * @param onInputChange The event listener for changes in any of the group's inputs.
   * @param includeTpButton If true, adds a "TP to Camera" button (only for Position).
   * @returns An object containing the container and references to the X, Y, Z inputs.
   */
    static createVector3InputGroup(titleText: string, onInputChange: (event: Event) => void, includeTpButton: boolean = false) {
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
  
        const input = AM_UI.createStyledInputField(id, onInputChange);
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
   * Handles changes in the position input fields.
   */
  static onPositionInputChange() {
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
  static onRotationInputChange() {
    if (this.selectedObject) {
      AM_UI.setObjectWorldRotation(
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
  static onScaleInputChange() {
    if (this.selectedObject) {
      const xValue = this.scaleXInput?.value;
      const yValue = this.scaleYInput?.value;
      const zValue = this.scaleZInput?.value;

      AM_UI.setObjectWorldScale(
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

  static createRenderDistanceInput() {
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
      AM_UI.onRenderDistanceChange(e);
    });
    input.type = 'number';
    input.step = '0.1';
    input.style.margin = '0';
    input.style.width = '120px';
    container.appendChild(input);

    return container;
  }

  static onRenderDistanceChange(event: Event) {
    if (!AM_UI.selectedObject) return;
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value);
    AssetManager.setRenderDistance(AM_UI.selectedObject.uuid, value);
  }

  
  /**
   * Helper to create a styled input field.
   * @param id The ID for the input.
   * @param onInputChange The event listener for input changes.
   * @returns The created HTMLInputElement.
   */
  static createStyledInputField(id: string, onInputChange: (event: Event) => void): HTMLInputElement {
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
     * Helper to set object's world position from UI inputs.
     * This is crucial for handling objects that might have parents.
     * @param object The THREE.Object3D to modify.
     * @param x The desired X world coordinate.
     * @param y The desired Y world coordinate.
     * @param z The desired Z world coordinate.
     */
    static setObjectWorldPosition(object: THREE.Object3D, x: number, y: number, z: number) {
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
    static setObjectWorldRotation(object: THREE.Object3D, xDeg: number, yDeg: number, zDeg: number) {
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
    static setObjectWorldScale(object: THREE.Object3D, x: number, y: number, z: number) {
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
       * Handles the "TP to Camera" button click event.
       */
      static onTpToCameraClick() {
        if (this.selectedObject && AssetManager.get().camera && this.positionXInput && this.positionYInput && this.positionZInput) {
          // Set object's world position to camera's world position
          this.setObjectWorldPosition(this.selectedObject, AssetManager.get().camera!.position.x, AssetManager.get().camera!.position.y, AssetManager.get().camera!.position.z);
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
   * Creates and appends the camera location display UI element.
   */
  static createCameraLocationDisplay() {
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
  static updateCameraLocationDisplay() {
    if (AssetManager.get().camera && AM_UI.cameraLocationDisplay) {
      const pos = AssetManager.get().camera!.position;
      AM_UI.cameraLocationDisplay.textContent = `X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`;
    }
  }

    /**
   * Handles the click event for the delete object button.
   */
    static onDeleteClick() {
      this.deleteSelectedObject();
    }
  
    static deleteSelectedObject() {
      if (AM_UI.selectedObject) {
        // Find and remove from spawnedPrefabs
        for (const [uuid, prefab] of AssetManager.get().spawnedPrefabs) {
          if (prefab === AM_UI.selectedObject) {
            AssetManager.get().deleteSpawnedPrefab(uuid);
            break;
          }
        }
        if (AM_UI.objectMenuContainerElement) {
          AM_UI.objectMenuContainerElement.style.display = 'none';
        }
        AM_UI.selectedObject = null;
      }
    }


      /**
   * Handles the click event for the toggle hide/show object button.
   */
  static onToggleHideClick() {
    if (AM_UI.selectedObject) {
      const uuid = AM_UI.selectedObject.uuid;
      const entry = AssetManager.prefabMap.get(uuid);
      if (entry) {
        entry.isHidden = !entry.isHidden;
      }
      AM_UI.selectedObject.visible = !entry!.isHidden;
      if (AM_UI.toggleHideButtonElement) {
        AM_UI.toggleHideButtonElement.textContent = AM_UI.selectedObject.visible ? 'Hide Object' : 'Show Object';
      }
    }
  }



}

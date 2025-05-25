import * as RE from 'rogue-engine';
import * as THREE from 'three';
import PrefabManager from "./PrefabManager.re";
import PM_UI from "./PM_UI.re";

export default class PM_Handler {

  public static onDestroy() {
    const assman = PrefabManager.get();
    const amui = PM_UI.get();
    
    // Remove prefab list UI
    if (assman.prefabListContainer && assman.prefabListContainer.parentElement) {
      assman.prefabListContainer.parentElement.removeChild(assman.prefabListContainer);
    }

    // Event listener cleanup
    document.removeEventListener('mousemove', assman.onMouseMoveBound);
    document.removeEventListener('keydown', assman.onKeyDownBound);
    document.removeEventListener('keyup', assman.onKeyUpBound);
    document.removeEventListener('pointerlockchange', assman.onPointerLockChangeBound);
    
    if (assman.domElement) {
      assman.domElement.removeEventListener('click', assman.onLeftClickBound);
    }
    if (PM_UI.deleteButtonElement) {
      PM_UI.deleteButtonElement.removeEventListener('click', PM_UI.onDeleteClickBound);
    }
    if (PM_UI.toggleHideButtonElement) {
      PM_UI.toggleHideButtonElement.removeEventListener('click', PM_UI.onToggleHideClickBound);
    }

    // Remove UI elements from DOM
    if (PM_UI.crosshairElement && PM_UI.crosshairElement.parentElement) {
      PM_UI.crosshairElement.parentElement.removeChild(PM_UI.crosshairElement);
    }
    if (PM_UI.objectMenuContainerElement && PM_UI.objectMenuContainerElement.parentElement) {
      PM_UI.objectMenuContainerElement.parentElement.removeChild(PM_UI.objectMenuContainerElement);
    }
    if (PM_UI.cameraLocationDisplay && PM_UI.cameraLocationDisplay.parentElement) {
      PM_UI.cameraLocationDisplay.parentElement.removeChild(PM_UI.cameraLocationDisplay);
    }
    // Save button cleanup
    if (PM_UI.saveButtonElement && PM_UI.saveButtonElement.parentElement) {
      PM_UI.saveButtonElement.parentElement.removeChild(PM_UI.saveButtonElement);
    }

    // Pointer lock and camera cleanup
    if (document.pointerLockElement === assman.domElement) {
      document.exitPointerLock();
    }
    if (assman.camera && assman.camera.parent === RE.Runtime.scene) {
      RE.Runtime.scene.remove(assman.camera);
      if (RE.App.activeCamera === assman.camera?.uuid) {
        RE.App.activeCamera = "";
      }
    }

    // Additional UI cleanup
    if (assman.prefabListContainer) {
      assman.prefabListContainer.innerHTML = '';
    }

    // Remove position/rotation/scale input listeners
    if (PM_UI.positionXInput) {
      PM_UI.positionXInput.removeEventListener('input', PM_UI.onPositionInputChangeBound);
    }
    if (PM_UI.rotationXInput) {
      PM_UI.rotationXInput.removeEventListener('input', PM_UI.onRotationInputChangeBound);
    }
    if (PM_UI.scaleXInput) {
      PM_UI.scaleXInput.removeEventListener('input', PM_UI.onScaleInputChangeBound);
    }

    // Remove UI toggle listener
    document.removeEventListener('keydown', PrefabManager.get().toggleAllUIBound);
    
    // Remove wheel listeners
    document.removeEventListener('wheel', PrefabManager.get().onPrefabWheelBound);

    // Clear stored styles via public method
    assman.cleanupUI();

    // Clear references
    assman.camera = undefined;
    assman.domElement = null;
    PM_UI.crosshairElement = null;
    PM_UI.objectMenuContainerElement = null;
    PM_UI.objectNameElement = null;
    PM_UI.deleteButtonElement = null;
    PM_UI.toggleHideButtonElement = null;
    PM_UI.selectedObject = null;
    assman.keysPressed = {};
    assman.excludedNamesArray = [];
    PM_UI.cameraLocationDisplay = null;
    assman.prefabListContainer = null; // Clear prefab-related references
    assman.availablePrefabs = [];       // Clear prefab-related references
    // Clear transform input references
    PM_UI.positionXInput = null;
    PM_UI.positionYInput = null;
    PM_UI.positionZInput = null;
    PM_UI.rotationXInput = null;
    PM_UI.rotationYInput = null;
    PM_UI.rotationZInput = null;
    PM_UI.scaleXInput = null;
    PM_UI.scaleYInput = null;
    PM_UI.scaleZInput = null;
    PM_UI.tpToCameraButton = null;
    PM_UI.saveButtonElement = null;

    // Clear all interval timers
    if (assman.cameraUpdateInterval) {
      clearInterval(assman.cameraUpdateInterval);
      assman.cameraUpdateInterval = null;
    }
  }

}
